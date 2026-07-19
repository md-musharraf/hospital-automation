const express = require('express');
const router = express.Router();
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const Token = require('../models/Token');
const Queue = require('../models/Queue');
const Reminder = require('../models/Reminder');
const { processPendingReminders } = require('../utils/reminderHelper');
const { authenticateToken } = require('../middleware/auth');
const { recalculateQueueTimes } = require('../utils/queueHelper');
const { sendWhatsAppNotification } = require('../utils/whatsappHelper');

// Middleware to ensure the user is staff
const ensureStaff = (req, res, next) => {
  if (req.user.role !== 'staff') {
    return res.status(403).json({ message: 'Access denied: Staff only' });
  }
  next();
};

// GET all live queues for doctors in the staff member's hospital (Staff Overview)
router.get('/queues', authenticateToken, ensureStaff, async (req, res) => {
  try {
    const doctors = await Doctor.find({ hospital: req.user.hospital });
    const docIds = doctors.map(d => d._id);

    const queues = await Queue.find({ doctor: { $in: docIds } })
      .populate('doctor', '-passwordHash')
      .populate('currentToken')
      .populate({
        path: 'activeQueue',
        populate: { path: 'patient' }
      });
    res.json(queues);
  } catch (error) {
    console.error('Error fetching queues:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST walk-in token generation
router.post('/tokens/walk-in', authenticateToken, ensureStaff, async (req, res) => {
  try {
    const { name, age, gender, phone, doctorId, symptoms, tokenType } = req.body;

    if (!name || !age || !gender || !phone || !doctorId || !symptoms) {
      return res.status(400).json({ message: 'All patient and doctor fields are required' });
    }

    if (typeof name !== 'string' || name.trim().length < 2 || name.length > 100) {
      return res.status(400).json({ message: 'Invalid patient name (2-100 characters)' });
    }
    const parsedAge = parseInt(age);
    if (isNaN(parsedAge) || parsedAge < 1 || parsedAge > 130) {
      return res.status(400).json({ message: 'Age must be an integer between 1 and 130' });
    }
    if (!['Male', 'Female', 'Other'].includes(gender)) {
      return res.status(400).json({ message: 'Gender must be Male, Female, or Other' });
    }
    if (typeof phone !== 'string' || phone.trim().length < 7 || phone.length > 20) {
      return res.status(400).json({ message: 'Invalid phone number' });
    }
    if (typeof symptoms !== 'string' || symptoms.trim().length === 0 || symptoms.length > 1000) {
      return res.status(400).json({ message: 'Symptoms must be a string up to 1000 characters' });
    }
    if (tokenType && !['Regular', 'Emergency', 'Re-visit'].includes(tokenType)) {
      return res.status(400).json({ message: 'Invalid tokenType' });
    }

    // Find or create patient
    let patient = await Patient.findOne({ phone });
    if (!patient) {
      patient = new Patient({ name, age: parsedAge, gender, phone });
    } else {
      patient.visitCount += 1;
      patient.name = name; // Update name/age/gender if changed
      patient.age = parsedAge;
      patient.gender = gender;
    }
    await patient.save();

    // Check doctor availability
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    // Generate unique token number
    const count = await Token.countDocuments();
    const tokenNumber = `T-${101 + count}`;

    const token = new Token({
      tokenNumber,
      status: 'Waiting',
      tokenType: tokenType || 'Regular',
      patient: patient._id,
      doctor: doctorId,
      symptoms
    });
    await token.save();

    // Add token to Queue
    let queue = await Queue.findOne({ doctor: doctorId });
    if (!queue) {
      queue = new Queue({ doctor: doctorId, activeQueue: [] });
    }

    if (token.tokenType === 'Emergency') {
      // Emergency goes to front of activeQueue
      queue.activeQueue.unshift(token._id);
    } else {
      queue.activeQueue.push(token._id);
    }
    await queue.save();

    // Recalculate wait times
    await recalculateQueueTimes(doctorId);

    // Trigger Web Push Notification to Doctor
    try {
      const pushHelper = require('../utils/pushHelper');
      if (tokenType === 'Emergency') {
        await pushHelper.notifyByRole('Doctor', {
          title: '🚨 EMERGENCY SOS WALKIN',
          body: `Emergency Alert: Patient ${name} has been placed at the front of your queue!`,
          icon: '/icon.svg',
          url: '/'
        });
      } else {
        await pushHelper.notifyByRole('Doctor', {
          title: 'New Patient Walk-in 📋',
          body: `${name} has been added to your queue with token ${tokenNumber}.`,
          icon: '/icon.svg',
          url: '/'
        });
      }
    } catch (err) {
      console.error('Push notification failed to doctor:', err);
    }

    // Broadcast update
    if (req.io) {
      req.io.to('queue:global').emit('queue-updated', { doctorId });
      req.io.to(`doctor:${doctorId}`).emit('queue-updated');
    }

    const createdToken = await Token.findById(token._id).populate('patient').populate('doctor');

    // Auto alert message: WhatsApp booking confirmation for Walk-in Patient
    if (createdToken.patient && createdToken.patient.phone) {
      const docName = createdToken.doctor ? createdToken.doctor.name : 'Doctor';
      const roomName = createdToken.doctor ? (createdToken.doctor.currentRoom || 'Cabin A') : 'Cabin A';
      const walkInMsg = `Hello ${createdToken.patient.name}, your walk-in token ${createdToken.tokenNumber} has been successfully generated for ${docName} in ${roomName}. Estimated wait time is ${createdToken.estimatedWaitTime} mins.`;
      await sendWhatsAppNotification(createdToken.patient.phone, walkInMsg);
    }

    res.status(201).json({ message: 'Walk-in token generated successfully', token: createdToken });
  } catch (error) {
    console.error('Error booking walk-in:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT override token to Emergency SOS
router.put('/tokens/:tokenId/override', authenticateToken, ensureStaff, async (req, res) => {
  try {
    const { tokenId } = req.params;
    const token = await Token.findById(tokenId);
    if (!token) {
      return res.status(404).json({ message: 'Token not found' });
    }

    if (token.tokenType === 'Emergency') {
      return res.status(400).json({ message: 'Token is already marked as Emergency' });
    }

    // Update token details
    token.tokenType = 'Emergency';
    await token.save();

    // Re-order Doctor's Queue
    const queue = await Queue.findOne({ doctor: token.doctor });
    if (queue) {
      // Verify token is in activeQueue and not currentToken in cabin
      if (queue.currentToken && queue.currentToken.toString() === tokenId) {
        return res.status(400).json({ message: 'Token is already currently inside the cabin and cannot be overridden' });
      }

      // Remove from its current position in activeQueue
      queue.activeQueue = queue.activeQueue.filter(id => id.toString() !== tokenId);
      // Insert emergency token at index 0
      queue.activeQueue.unshift(token._id);
      await queue.save();

      // Trigger Web Push Notification to Doctor
      try {
        const pushHelper = require('../utils/pushHelper');
        await pushHelper.notifyByRole('Doctor', {
          title: '🚨 EMERGENCY SOS ESCALATION',
          body: `Patient token ${token.tokenNumber} has been upgraded to Emergency SOS!`,
          icon: '/icon.svg',
          url: '/'
        });
      } catch (err) {
        console.error('Push notification failed to doctor:', err);
      }

      // Recalculate wait times
      await recalculateQueueTimes(token.doctor);

      // Broadcast update
      if (req.io) {
        req.io.to('queue:global').emit('queue-updated', { doctorId: token.doctor });
        req.io.to(`doctor:${token.doctor}`).emit('queue-updated');
      }
    }

    res.json({ message: 'Token successfully upgraded to Emergency SOS', token });
  } catch (error) {
    console.error('Error promoting emergency:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT update token status directly (Staff Override / Delay / Cancel)
router.put('/tokens/:tokenId/status', authenticateToken, ensureStaff, async (req, res) => {
  try {
    const { tokenId } = req.params;
    const { status } = req.body;
    const validStatuses = ['Waiting', 'Called', 'Active', 'Completed', 'Absent', 'Delayed'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid token status value' });
    }

    const token = await Token.findById(tokenId);
    if (!token) {
      return res.status(404).json({ message: 'Token not found' });
    }

    const previousStatus = token.status;
    token.status = status;
    if (status === 'Completed' || status === 'Absent' || (status === 'Delayed' && previousStatus === 'Active')) {
      // Reset timestamps if needed
      if (status === 'Completed') token.completedAt = new Date();
    }
    await token.save();

    const queue = await Queue.findOne({ doctor: token.doctor });
    if (queue) {
      // If moving away from Active, remove currentToken pointer
      if (queue.currentToken && queue.currentToken.toString() === tokenId && status !== 'Active') {
        queue.currentToken = null;
      }
      
      // If status is final (Completed, Absent), remove from activeQueue
      if (['Completed', 'Absent'].includes(status)) {
        queue.activeQueue = queue.activeQueue.filter(id => id.toString() !== tokenId);
      }
      
      await queue.save();
      await recalculateQueueTimes(token.doctor);

      // Broadcast update
      if (req.io) {
        req.io.to('queue:global').emit('queue-updated', { doctorId: token.doctor });
        req.io.to(`doctor:${token.doctor}`).emit('queue-updated');
        req.io.to(`patient:${tokenId}`).emit('token-called', { status });
      }
    }

    res.json({ message: `Token status updated to ${status}`, token });
  } catch (error) {
    console.error('Error updating token status:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET fetch all reminders
router.get('/reminders', authenticateToken, ensureStaff, async (req, res) => {
  try {
    const reminders = await Reminder.find()
      .populate('patient')
      .populate('doctor')
      .populate('token')
      .sort({ createdAt: -1 });
    res.json(reminders);
  } catch (error) {
    console.error('Error fetching reminders:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST manually trigger pending reminders
router.post('/reminders/trigger', authenticateToken, ensureStaff, async (req, res) => {
  try {
    const processed = await processPendingReminders();
    res.json({ message: `Triggered reminders check successfully.`, sentReminders: processed });
  } catch (error) {
    console.error('Error triggering reminders:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET all registered patients
router.get('/patients', authenticateToken, ensureStaff, async (req, res) => {
  try {
    const patients = await Patient.find().sort({ createdAt: -1 });
    res.json(patients);
  } catch (error) {
    console.error('Error fetching patients:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST register a new patient
router.post('/patients', authenticateToken, ensureStaff, async (req, res) => {
  try {
    const { name, phone, age, gender } = req.body;

    if (!name || !phone || !age || !gender) {
      return res.status(400).json({ message: 'All patient fields (name, phone, age, gender) are required' });
    }
    if (typeof name !== 'string' || name.trim().length < 2 || name.length > 100) {
      return res.status(400).json({ message: 'Invalid patient name (2-100 characters)' });
    }
    const parsedAge = parseInt(age);
    if (isNaN(parsedAge) || parsedAge < 1 || parsedAge > 130) {
      return res.status(400).json({ message: 'Age must be an integer between 1 and 130' });
    }
    if (!['Male', 'Female', 'Other'].includes(gender)) {
      return res.status(400).json({ message: 'Gender must be Male, Female, or Other' });
    }
    if (typeof phone !== 'string' || phone.trim().length < 7 || phone.length > 20) {
      return res.status(400).json({ message: 'Invalid phone number' });
    }
    
    // Check if phone number already exists
    const existingPatient = await Patient.findOne({ phone });
    if (existingPatient) {
      return res.status(400).json({ message: 'Patient with this phone number already exists' });
    }

    const patient = new Patient({
      name,
      phone,
      age: parsedAge,
      gender
    });
    await patient.save();

    res.status(201).json({ message: 'Patient registered successfully', patient });
  } catch (error) {
    console.error('Error creating patient:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT update patient details
router.put('/patients/:id', authenticateToken, ensureStaff, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, age, gender } = req.body;

    if (name !== undefined && (typeof name !== 'string' || name.trim().length < 2 || name.length > 100)) {
      return res.status(400).json({ message: 'Invalid patient name (2-100 characters)' });
    }
    let parsedAge;
    if (age !== undefined) {
      parsedAge = parseInt(age);
      if (isNaN(parsedAge) || parsedAge < 1 || parsedAge > 130) {
        return res.status(400).json({ message: 'Age must be an integer between 1 and 130' });
      }
    }
    if (gender !== undefined && !['Male', 'Female', 'Other'].includes(gender)) {
      return res.status(400).json({ message: 'Gender must be Male, Female, or Other' });
    }
    if (phone !== undefined && (typeof phone !== 'string' || phone.trim().length < 7 || phone.length > 20)) {
      return res.status(400).json({ message: 'Invalid phone number' });
    }

    const patient = await Patient.findById(id);
    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    // Check if new phone conflicts with another patient
    if (phone && phone !== patient.phone) {
      const phoneConflict = await Patient.findOne({ phone });
      if (phoneConflict) {
        return res.status(400).json({ message: 'Phone number is already associated with another patient' });
      }
      patient.phone = phone;
    }

    if (name !== undefined) patient.name = name;
    if (age !== undefined) patient.age = parsedAge;
    if (gender !== undefined) patient.gender = gender;

    await patient.save();
    res.json({ message: 'Patient details updated successfully', patient });
  } catch (error) {
    console.error('Error updating patient:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
