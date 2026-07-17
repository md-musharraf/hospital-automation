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

// Middleware to ensure the user is staff
const ensureStaff = (req, res, next) => {
  if (req.user.role !== 'staff') {
    return res.status(403).json({ message: 'Access denied: Staff only' });
  }
  next();
};

// GET all live queues for all doctors (Staff Overview)
router.get('/queues', authenticateToken, ensureStaff, async (req, res) => {
  try {
    const queues = await Queue.find()
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

    // Find or create patient
    let patient = await Patient.findOne({ phone });
    if (!patient) {
      patient = new Patient({ name, age, gender, phone });
    } else {
      patient.visitCount += 1;
      patient.name = name; // Update name/age/gender if changed
      patient.age = age;
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

    // Broadcast update
    if (req.io) {
      req.io.to('queue:global').emit('queue-updated', { doctorId });
      req.io.to(`doctor:${doctorId}`).emit('queue-updated');
    }

    const createdToken = await Token.findById(token._id).populate('patient').populate('doctor');
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
    const { status } = req.body; // 'Waiting', 'Delayed', 'Completed', 'Absent', 'Called'

    const token = await Token.findById(tokenId);
    if (!token) {
      return res.status(404).json({ message: 'Token not found' });
    }

    const previousStatus = token.status;
    token.status = status;
    if (status === 'Completed' || status === 'Absent' || status === 'Delayed' && previousStatus === 'Active') {
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
    
    // Check if phone number already exists
    const existingPatient = await Patient.findOne({ phone });
    if (existingPatient) {
      return res.status(400).json({ message: 'Patient with this phone number already exists' });
    }

    const patient = new Patient({
      name,
      phone,
      age: parseInt(age),
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

    if (name) patient.name = name;
    if (age) patient.age = parseInt(age);
    if (gender) patient.gender = gender;

    await patient.save();
    res.json({ message: 'Patient details updated successfully', patient });
  } catch (error) {
    console.error('Error updating patient:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
