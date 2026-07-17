const express = require('express');
const router = express.Router();
const Doctor = require('../models/Doctor');
const Token = require('../models/Token');
const Queue = require('../models/Queue');
const Reminder = require('../models/Reminder');
const { authenticateToken } = require('../middleware/auth');
const { recalculateQueueTimes } = require('../utils/queueHelper');

// Middleware to ensure the user is a doctor
const ensureDoctor = (req, res, next) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ message: 'Access denied: Doctors only' });
  }
  next();
};

// GET logged-in doctor's live queue details
router.get('/my-queue', authenticateToken, ensureDoctor, async (req, res) => {
  try {
    const doctorId = req.user.id;
    let queue = await Queue.findOne({ doctor: doctorId })
      .populate({
        path: 'currentToken',
        populate: { path: 'patient' }
      })
      .populate({
        path: 'activeQueue',
        populate: { path: 'patient' }
      });

    if (!queue) {
      // Lazy initialize queue record if it doesn't exist
      queue = new Queue({ doctor: doctorId, activeQueue: [] });
      await queue.save();
      // Fetch again to populate references properly
      queue = await Queue.findOne({ doctor: doctorId })
        .populate('currentToken')
        .populate('activeQueue');
    }

    res.json(queue);
  } catch (error) {
    console.error('Error fetching doctor queue:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST call next patient in queue
router.post('/queue/call-next', authenticateToken, ensureDoctor, async (req, res) => {
  try {
    const doctorId = req.user.id;
    const queue = await Queue.findOne({ doctor: doctorId });

    if (!queue) {
      return res.status(404).json({ message: 'Queue state not found' });
    }

    if (queue.activeQueue.length === 0) {
      return res.status(400).json({ message: 'Queue is empty. No more patients to call.' });
    }

    // Archive current token if it exists in cabin (defaulting to completed if they forgot to click complete)
    if (queue.currentToken) {
      const oldToken = await Token.findById(queue.currentToken);
      if (oldToken && oldToken.status === 'Active') {
        oldToken.status = 'Completed';
        oldToken.completedAt = new Date();
        await oldToken.save();
      }
    }

    // Get the next token ID from activeQueue (front of the line)
    const nextTokenId = queue.activeQueue.shift();
    const token = await Token.findById(nextTokenId).populate('patient');
    if (!token) {
      queue.activeQueue = queue.activeQueue.filter(id => id.toString() !== nextTokenId.toString());
      await queue.save();
      return res.status(404).json({ message: 'Next token in queue not found' });
    }

    // Update token status
    token.status = 'Active';
    token.calledAt = new Date();
    await token.save();

    // Set queue currentToken
    queue.currentToken = token._id;
    await queue.save();

    // Recalculate wait times for remaining queue
    await recalculateQueueTimes(doctorId);

    // Broadcast updates
    if (req.io) {
      req.io.to('queue:global').emit('queue-updated', { doctorId });
      req.io.to(`doctor:${doctorId}`).emit('queue-updated');
      // Trigger voice call or screen alert room
      req.io.to(`patient:${token._id}`).emit('token-called', { status: 'Active', roomName: req.user.currentRoom || 'Cabin A', tokenNumber: token.tokenNumber });
    }

    res.json({ message: `Called token ${token.tokenNumber}`, currentToken: token, activeQueue: queue.activeQueue });
  } catch (error) {
    console.error('Error calling next patient:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST complete active patient checkup
router.post('/queue/complete', authenticateToken, ensureDoctor, async (req, res) => {
  try {
    const doctorId = req.user.id;
    const queue = await Queue.findOne({ doctor: doctorId });

    if (!queue || !queue.currentToken) {
      return res.status(400).json({ message: 'No active patient is currently inside the cabin' });
    }

    const { revisitDays } = req.body;

    const token = await Token.findById(queue.currentToken).populate('patient');
    if (token) {
      token.status = 'Completed';
      token.completedAt = new Date();
      await token.save();

      // If revisit days are specified, create a pending reminder
      if (revisitDays !== undefined && revisitDays !== null && parseInt(revisitDays) >= 0) {
        const doctor = await Doctor.findById(doctorId);
        const doctorName = doctor ? doctor.name : 'your doctor';
        
        const scheduledDate = new Date();
        scheduledDate.setDate(scheduledDate.getDate() + parseInt(revisitDays));
        scheduledDate.setHours(9, 0, 0, 0); // 9:00 AM

        const reminder = new Reminder({
          patient: token.patient._id,
          doctor: doctorId,
          token: token._id,
          scheduledDate,
          revisitDays: parseInt(revisitDays),
          status: 'Pending',
          message: `Hello ${token.patient.name || 'Patient'}, this is a reminder for your scheduled re-visit to see ${doctorName} ${parseInt(revisitDays) === 0 ? 'today' : `in ${revisitDays} days (scheduled for ${scheduledDate.toLocaleDateString()})`}.`
        });
        await reminder.save();
        console.log(`[REMINDER CREATED] scheduled for ${scheduledDate} for patient ${token.patient.name}`);
      }
    }

    // Clear current token
    const completedTokenId = queue.currentToken;
    queue.currentToken = null;
    await queue.save();

    // Recalculate wait times
    await recalculateQueueTimes(doctorId);

    // Broadcast updates
    if (req.io) {
      req.io.to('queue:global').emit('queue-updated', { doctorId });
      req.io.to(`doctor:${doctorId}`).emit('queue-updated');
      req.io.to(`patient:${completedTokenId}`).emit('token-called', { status: 'Completed' });
    }

    res.json({ 
      message: 'Active checkup successfully marked as Completed',
      revisitScheduled: revisitDays && parseInt(revisitDays) > 0
    });
  } catch (error) {
    console.error('Error completing checkup:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST mark active patient as Absent
router.post('/queue/mark-absent', authenticateToken, ensureDoctor, async (req, res) => {
  try {
    const doctorId = req.user.id;
    const queue = await Queue.findOne({ doctor: doctorId });

    if (!queue || !queue.currentToken) {
      return res.status(400).json({ message: 'No active patient is currently inside the cabin' });
    }

    const token = await Token.findById(queue.currentToken);
    if (token) {
      token.status = 'Absent';
      await token.save();
    }

    // Clear current token
    const absentTokenId = queue.currentToken;
    queue.currentToken = null;
    await queue.save();

    // Recalculate wait times
    await recalculateQueueTimes(doctorId);

    // Broadcast updates
    if (req.io) {
      req.io.to('queue:global').emit('queue-updated', { doctorId });
      req.io.to(`doctor:${doctorId}`).emit('queue-updated');
      req.io.to(`patient:${absentTokenId}`).emit('token-called', { status: 'Absent' });
    }

    res.json({ message: 'Active patient successfully marked as Absent' });
  } catch (error) {
    console.error('Error marking absent:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST add manual buffer delay to doctor's queue
router.post('/queue/add-buffer', authenticateToken, ensureDoctor, async (req, res) => {
  try {
    const doctorId = req.user.id;
    const { minutes } = req.body; // e.g., 10, 15, 30 or even negative to reduce

    if (minutes === undefined || isNaN(parseInt(minutes))) {
      return res.status(400).json({ message: 'Valid minutes parameter is required' });
    }

    let queue = await Queue.findOne({ doctor: doctorId });
    if (!queue) {
      queue = new Queue({ doctor: doctorId, activeQueue: [], bufferDelay: 0 });
    }

    // Update buffer delay
    queue.bufferDelay = Math.max(0, queue.bufferDelay + parseInt(minutes));
    await queue.save();

    // Instantly recalculate wait times for all waiting tokens in this queue
    await recalculateQueueTimes(doctorId);

    // Broadcast updates to all patient rooms and dashboards
    if (req.io) {
      req.io.to('queue:global').emit('queue-updated', { doctorId });
      req.io.to(`doctor:${doctorId}`).emit('queue-updated');
    }

    res.json({ message: `Manual buffer delay updated to ${queue.bufferDelay} minutes`, bufferDelay: queue.bufferDelay });
  } catch (error) {
    console.error('Error adding buffer delay:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT update doctor availability and/or average checkup times
router.put('/availability', authenticateToken, ensureDoctor, async (req, res) => {
  try {
    const doctorId = req.user.id;
    const { availabilityStatus, averageCheckupTime } = req.body;

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({ message: 'Doctor details not found' });
    }

    if (availabilityStatus) doctor.availabilityStatus = availabilityStatus;
    if (averageCheckupTime && !isNaN(parseInt(averageCheckupTime))) {
      doctor.averageCheckupTime = parseInt(averageCheckupTime);
    }
    await doctor.save();

    // Recalculate wait times
    await recalculateQueueTimes(doctorId);

    // Broadcast updates
    if (req.io) {
      req.io.emit('doctor-status-update', {
        doctorId,
        availabilityStatus: doctor.availabilityStatus,
        averageCheckupTime: doctor.averageCheckupTime
      });
      req.io.to('queue:global').emit('queue-updated', { doctorId });
      req.io.to(`doctor:${doctorId}`).emit('queue-updated');
    }

    res.json({ message: 'Doctor details updated successfully', doctor });
  } catch (error) {
    console.error('Error updating doctor details:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
