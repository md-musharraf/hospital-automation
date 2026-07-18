const express = require('express');
const router = express.Router();
const Token = require('../models/Token');
const { authenticateToken } = require('../middleware/auth');

// Middleware to ensure the user is a lab assistant
const ensureLab = (req, res, next) => {
  if (req.user.role !== 'lab') {
    return res.status(403).json({ message: 'Access denied: Lab Assistants only' });
  }
  next();
};

// GET all tokens with pending lab tests
router.get('/queues/pending-tests', authenticateToken, ensureLab, async (req, res) => {
  try {
    const tokens = await Token.find({
      'labTests.status': 'Pending'
    })
    .populate('patient')
    .populate('doctor', '-passwordHash');
    res.json(tokens);
  } catch (err) {
    console.error('Error fetching pending tests:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST complete a specific lab test
router.post('/tests/:tokenId/complete', authenticateToken, ensureLab, async (req, res) => {
  try {
    const { tokenId } = req.params;
    const { testName, remarks } = req.body;

    if (!testName) {
      return res.status(400).json({ message: 'testName is required' });
    }

    const token = await Token.findById(tokenId).populate('patient').populate('doctor');
    if (!token) {
      return res.status(404).json({ message: 'Token not found' });
    }

    // Find the test and update it
    const test = token.labTests.find(t => t.testName === testName);
    if (!test) {
      return res.status(404).json({ message: `Test "${testName}" not found on this token` });
    }

    test.status = 'Completed';
    test.remarks = remarks || 'No remarks provided';
    test.completedAt = new Date();

    await token.save();

    // Trigger WhatsApp notification to patient
    if (token.patient && token.patient.phone) {
      const { sendWhatsAppNotification } = require('../utils/whatsappHelper');
      const alertMsg = `Hello ${token.patient.name}, your lab report for "${testName}" is now ready! Remarks: ${test.remarks}. View online: https://hospital-automation-wine.vercel.app/prescription/${token._id}`;
      await sendWhatsAppNotification(token.patient.phone, alertMsg);
    }

    // Broadcast updates to Socket.io clients
    if (req.io) {
      req.io.to('queue:global').emit('queue-updated', { doctorId: token.doctor._id });
      req.io.to(`doctor:${token.doctor._id}`).emit('queue-updated');
    }

    res.json({ message: `Test "${testName}" completed successfully.`, token });
  } catch (err) {
    console.error('Error completing test:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
