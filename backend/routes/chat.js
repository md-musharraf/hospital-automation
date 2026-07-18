const express = require('express');
const router = express.Router();
const ChatSession = require('../models/ChatSession');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const Token = require('../models/Token');
const Queue = require('../models/Queue');
const { recalculateQueueTimes } = require('../utils/queueHelper');
const { sendWhatsAppNotification } = require('../utils/whatsappHelper');

// Public endpoint for live department wait times
router.get('/queues/public-status', async (req, res) => {
  try {
    const queues = await Queue.find().populate('doctor').populate('activeQueue');
    const deptWaitTimes = {
      'Emergency': 0,
      'General Practice': 0,
      'Pediatrics': 0
    };
    
    queues.forEach(q => {
      if (!q.doctor) return;
      const dept = q.doctor.department || 'General Practice';
      
      const avgCheckup = q.doctor.averageCheckupTime || 10;
      const queueLength = q.activeQueue ? q.activeQueue.length : 0;
      const buffer = q.bufferDelay || 0;
      const estWait = (queueLength * avgCheckup) + buffer;
      
      // If department doesn't exist, initialize it
      if (deptWaitTimes[dept] === undefined) {
        deptWaitTimes[dept] = estWait;
      } else {
        // Take the max wait time among doctors in that department
        deptWaitTimes[dept] = Math.max(deptWaitTimes[dept], estWait);
      }
    });
    
    // Emergency is always dynamic, let's keep a mock minimum of 10 or calculate if there are emergency tokens
    let emergencyCount = await Token.countDocuments({ status: 'Waiting', tokenType: 'Emergency' });
    deptWaitTimes['Emergency'] = Math.max(10, emergencyCount * 15);

    res.json(deptWaitTimes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching queue status' });
  }
});

// Chatbot interaction endpoint
router.post('/message', async (req, res) => {
  try {
    const { sessionId, message } = req.body;
    if (!sessionId) {
      return res.status(400).json({ message: 'sessionId is required' });
    }

    // Find or create session
    let session = await ChatSession.findOne({ sessionId });
    if (!session) {
      session = new ChatSession({ sessionId, currentState: 'WELCOME' });
    }

    const cleanMsg = message ? message.trim() : '';

    // If user says "Hi", "Hello", or "reset", reset the session
    const resetTriggers = ['hi', 'hello', 'hey', 'start', 'reset', 'restart'];
    if (resetTriggers.includes(cleanMsg.toLowerCase())) {
      session.currentState = 'WELCOME';
      session.tempData = {};
      await session.save();

      return res.json({
        messages: [
          { sender: 'bot', text: 'Welcome to the Smart Hospital AI Assistant! 🏥' },
          { sender: 'bot', text: 'Please select an option below to proceed:' }
        ],
        options: [
          'Book New Appointment / Generate Token',
          'Re-visit (Existing Patient)',
          'Emergency SOS Token',
          'Check Live Queue Status'
        ]
      });
    }

    const state = session.currentState;

    // WELCOME state processing
    if (state === 'WELCOME') {
      if (cleanMsg === 'Book New Appointment / Generate Token') {
        session.currentState = 'AWAITING_PHONE';
        session.tempData = { tokenType: 'Regular' };
        await session.save();
        return res.json({
          messages: [{ sender: 'bot', text: "To begin, please enter the Patient's Phone Number (e.g. +1 555-0100):" }],
          options: []
        });
      } 
      
      else if (cleanMsg === 'Re-visit (Existing Patient)') {
        session.currentState = 'AWAITING_PHONE';
        session.tempData = { tokenType: 'Re-visit' };
        await session.save();
        return res.json({
          messages: [{ sender: 'bot', text: "Welcome back! Please enter your registered Phone Number to locate your file:" }],
          options: []
        });
      } 
      
      else if (cleanMsg === 'Emergency SOS Token') {
        session.currentState = 'AWAITING_PHONE';
        session.tempData = { tokenType: 'Emergency' };
        await session.save();
        return res.json({
          messages: [{ sender: 'bot', text: "🚨 EMERGENCY SOS TRIGGERED. Please enter the Patient's Phone Number immediately:" }],
          options: []
        });
      } 
      
      else if (cleanMsg === 'Check Live Queue Status') {
        session.tempData = { checkingStatus: true };
        await session.save();
        return res.json({
          messages: [{ sender: 'bot', text: 'Please enter your Token Number (e.g., T-101 or T-102):' }],
          options: []
        });
      } 
      
      else if (session.tempData && session.tempData.checkingStatus) {
        const token = await Token.findOne({ tokenNumber: cleanMsg.toUpperCase() })
          .populate('patient')
          .populate('doctor');

        if (!token) {
          return res.json({
            messages: [{ sender: 'bot', text: 'Token not found. Please verify the token number and try again, or type "Hi" to restart.' }],
            options: []
          });
        }

        const queue = await Queue.findOne({ doctor: token.doctor._id });
        let position = -1;
        if (queue) {
          if (queue.currentToken && queue.currentToken.toString() === token._id.toString()) {
            position = 0; // Currently inside cabin
          } else {
            position = queue.activeQueue.findIndex(id => id.toString() === token._id.toString()) + 1;
          }
        }

        let statusText = '';
        if (position === 0) {
          statusText = 'You are currently inside the cabin! Please proceed.';
        } else if (position > 0) {
          statusText = `There are ${position - 1} patient(s) ahead of you. Estimated wait: ${token.estimatedWaitTime} mins.`;
        } else {
          statusText = `Status: ${token.status}. Checkup complete or token cancelled.`;
        }

        // Reset state
        session.tempData = {};
        await session.save();

        return res.json({
          messages: [
            { sender: 'bot', text: `Token Details for ${token.tokenNumber}:` },
            { sender: 'bot', text: `• Patient: ${token.patient.name}\n• Doctor: ${token.doctor.name} (${token.doctor.department})\n• Live Status: ${statusText}` }
          ],
          options: ['Check Live Queue Status', 'Book New Appointment / Generate Token']
        });
      } 
      
      else {
        return res.json({
          messages: [
            { sender: 'bot', text: "I didn't quite catch that. Type 'Hi' to start over, or select an option below:" }
          ],
          options: [
            'Book New Appointment / Generate Token',
            'Re-visit (Existing Patient)',
            'Emergency SOS Token',
            'Check Live Queue Status'
          ]
        });
      }
    }

    // AWAITING_PHONE state
    if (state === 'AWAITING_PHONE') {
      if (!cleanMsg || cleanMsg.length < 7) {
        return res.json({
          messages: [{ sender: 'bot', text: 'Please enter a valid Phone Number (minimum 7 characters):' }]
        });
      }

      session.tempData.phone = cleanMsg;

      // Check if it's a re-visit, look up the patient
      if (session.tempData.tokenType === 'Re-visit') {
        const patient = await Patient.findOne({ phone: cleanMsg });
        if (patient) {
          // Patient found! Fill tempData and jump directly to AWAITING_SYMPTOMS
          session.tempData.name = patient.name;
          session.tempData.age = patient.age;
          session.tempData.gender = patient.gender;
          session.currentState = 'AWAITING_SYMPTOMS';
          await session.save();

          return res.json({
            messages: [
              { sender: 'bot', text: `Welcome back, ${patient.name}! I located your details (Age: ${patient.age}, Gender: ${patient.gender}).` },
              { sender: 'bot', text: 'Please describe your current symptoms (e.g. high fever, throat pain):' }
            ],
            options: []
          });
        } else {
          // Not found, fall back to new registration flow
          session.currentState = 'AWAITING_NAME';
          await session.save();
          return res.json({
            messages: [
              { sender: 'bot', text: "I couldn't find a registration for this number. Let's register you as a new patient." },
              { sender: 'bot', text: "Please enter the Patient's Full Name:" }
            ],
            options: []
          });
        }
      }

      // For standard and emergency tokens, proceed to name registration
      session.currentState = 'AWAITING_NAME';
      await session.save();
      return res.json({
        messages: [{ sender: 'bot', text: "Thank you. Now, please enter the Patient's Full Name:" }],
        options: []
      });
    }

    // AWAITING_NAME state
    if (state === 'AWAITING_NAME') {
      if (!cleanMsg) {
        return res.json({
          messages: [{ sender: 'bot', text: 'Please enter a valid name:' }]
        });
      }
      session.tempData.name = cleanMsg;
      session.currentState = 'AWAITING_AGE';
      await session.save();
      return res.json({
        messages: [{ sender: 'bot', text: `Got it. What is the age of ${cleanMsg}?` }],
        options: []
      });
    }

    // AWAITING_AGE state
    if (state === 'AWAITING_AGE') {
      const age = parseInt(cleanMsg);
      if (isNaN(age) || age <= 0 || age > 130) {
        return res.json({
          messages: [{ sender: 'bot', text: 'Please enter a valid age (a number between 1 and 130):' }]
        });
      }
      session.tempData.age = age;
      session.currentState = 'AWAITING_GENDER';
      await session.save();
      return res.json({
        messages: [{ sender: 'bot', text: 'Select the patient\'s gender:' }],
        options: ['Male', 'Female', 'Other']
      });
    }

    // AWAITING_GENDER state
    if (state === 'AWAITING_GENDER') {
      if (!['Male', 'Female', 'Other'].includes(cleanMsg)) {
        return res.json({
          messages: [{ sender: 'bot', text: 'Please choose one of the options below:' }],
          options: ['Male', 'Female', 'Other']
        });
      }
      session.tempData.gender = cleanMsg;
      session.currentState = 'AWAITING_SYMPTOMS';
      await session.save();
      return res.json({
        messages: [{ sender: 'bot', text: 'Please describe the symptoms (e.g., high fever, chest tightness, coughing):' }],
        options: []
      });
    }

    // AWAITING_SYMPTOMS state
    if (state === 'AWAITING_SYMPTOMS') {
      // If we haven't stored symptoms yet
      if (!session.tempData.symptoms) {
        session.tempData.symptoms = cleanMsg;
        await session.save();

        const doctors = await Doctor.find({ availabilityStatus: { $ne: 'Unavailable' } });
        if (doctors.length === 0) {
          return res.json({
            messages: [{ sender: 'bot', text: 'No doctors are currently available. Type "Hi" to try again later.' }],
            options: []
          });
        }

        const docNames = doctors.map(d => `${d.name} (${d.department})`);
        return res.json({
          messages: [{ sender: 'bot', text: 'Select an available doctor to book your token:' }],
          options: docNames
        });
      } 
      
      // If we already have symptoms, cleanMsg should match one of the doctor names
      else {
        const doctors = await Doctor.find({ availabilityStatus: { $ne: 'Unavailable' } });
        const selectedDoc = doctors.find(d => `${d.name} (${d.department})` === cleanMsg);

        if (!selectedDoc) {
          const docNames = doctors.map(d => `${d.name} (${d.department})`);
          return res.json({
            messages: [{ sender: 'bot', text: 'Invalid doctor selection. Please choose from the list:' }],
            options: docNames
          });
        }

        // Complete the booking!
        // Retrieve collected patient phone number
        const phone = session.tempData.phone || `+1 555-${session.sessionId.slice(-4)}`;
        let patient = await Patient.findOne({ phone });
        if (!patient) {
          patient = new Patient({
            name: session.tempData.name,
            age: session.tempData.age,
            gender: session.tempData.gender,
            phone
          });
        } else {
          patient.visitCount += 1;
          // Sync details if updated
          patient.name = session.tempData.name || patient.name;
          patient.age = session.tempData.age || patient.age;
          patient.gender = session.tempData.gender || patient.gender;
        }
        await patient.save();

        // Generate unique token number
        const count = await Token.countDocuments();
        const tokenNumber = `T-${101 + count}`;

        // Create token
        const token = new Token({
          tokenNumber,
          status: 'Waiting',
          tokenType: session.tempData.tokenType || 'Regular',
          patient: patient._id,
          doctor: selectedDoc._id,
          symptoms: session.tempData.symptoms
        });
        await token.save();

        // Find or create Doctor Queue
        let queue = await Queue.findOne({ doctor: selectedDoc._id });
        if (!queue) {
          queue = new Queue({ doctor: selectedDoc._id, activeQueue: [] });
        }

        // Push to queue
        if (token.tokenType === 'Emergency') {
          // Push emergency to top (index 0) of the activeQueue
          queue.activeQueue.unshift(token._id);
        } else {
          // Push regular/re-visit to end
          queue.activeQueue.push(token._id);
        }
        await queue.save();

        // Recalculate wait times
        await recalculateQueueTimes(selectedDoc._id);

        // Transition to completed
        session.currentState = 'COMPLETED';
        await session.save();

        // Fetch refreshed token details with Wait Time
        const refreshedToken = await Token.findById(token._id);

        // Auto alert message: WhatsApp booking confirmation
        const bookingMessage = `Hello ${patient.name}, your token ${refreshedToken.tokenNumber} is successfully booked for ${selectedDoc.name} in ${selectedDoc.currentRoom || 'Cabin A'}. Your estimated wait time is ${refreshedToken.estimatedWaitTime} mins. Track your status online at: https://hospital-automation-wine.vercel.app/`;
        await sendWhatsAppNotification(patient.phone, bookingMessage);

        // Broadcast updates via Socket.io if available
        if (req.io) {
          req.io.to('queue:global').emit('queue-updated', { doctorId: selectedDoc._id });
          req.io.to(`doctor:${selectedDoc._id}`).emit('queue-updated');
        }

        return res.json({
          messages: [
            { sender: 'bot', text: 'Booking Complete! 🎉' },
            { sender: 'bot', text: `• Token Number: ${refreshedToken.tokenNumber}\n• Doctor: ${selectedDoc.name}\n• Cabin: ${selectedDoc.currentRoom}\n• Estimated Wait: ${refreshedToken.estimatedWaitTime} mins.` }
          ],
          options: ['Check Live Queue Status', 'Book New Appointment / Generate Token'],
          token: {
            id: refreshedToken._id,
            tokenNumber: refreshedToken.tokenNumber,
            estimatedWaitTime: refreshedToken.estimatedWaitTime
          }
        });
      }
    }

    // Default catch-all
    return res.json({
      messages: [{ sender: 'bot', text: 'Your previous booking is complete. Type "Hi" to start a new inquiry!' }],
      options: ['Book New Appointment / Generate Token', 'Check Live Queue Status']
    });

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ message: 'Server error in chatbot' });
  }
});

module.exports = router;
