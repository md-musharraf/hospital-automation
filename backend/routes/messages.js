const express = require('express');
const router = express.Router();
const HospitalMessage = require('../models/HospitalMessage');
const { authenticateToken } = require('../middleware/auth');

// POST a new internal message
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { receiverRole, receiverId, content } = req.body;
    if (!content || typeof content !== 'string' || content.trim().length === 0 || content.length > 1000) {
      return res.status(400).json({ message: 'Content is required and must be <= 1000 characters' });
    }
    const validRoles = ['Staff', 'Doctor', 'Lab'];
    if (!receiverRole || !validRoles.includes(receiverRole)) {
      return res.status(400).json({ message: 'Valid receiverRole is required (Staff, Doctor, Lab)' });
    }
    if (receiverId && (typeof receiverId !== 'string' || receiverId.length > 50)) {
      return res.status(400).json({ message: 'Invalid receiverId' });
    }

    // Identify sender details from JWT
    let senderRole = 'Staff';
    let senderName = 'Staff Room';

    if (req.user.role === 'doctor') {
      senderRole = 'Doctor';
      senderName = req.user.name || 'Doctor';
    } else if (req.user.role === 'lab') {
      senderRole = 'Lab';
      senderName = 'Lab Workstation';
    } else if (req.user.role === 'staff') {
      senderRole = 'Staff';
      senderName = req.user.username || 'Staff';
    }

    const message = new HospitalMessage({
      senderRole,
      senderName,
      receiverRole,
      receiverId: receiverId || null,
      hospital: req.user.hospital || 'general-hospital',
      content
    });

    await message.save();

    // Broadcast message via Socket.io to hospital tenant room
    if (req.io) {
      const userHosp = req.user.hospital || 'general-hospital';
      req.io.to(`hospital:${userHosp}`).emit('internal-message-received', message);
      req.io.to('queue:global').emit('internal-message-received', message);
    }

    res.json({ message: 'Message sent successfully.', data: message });
  } catch (err) {
    console.error('Error sending internal message:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET messages for the active session user within their hospital tenant
router.get('/', authenticateToken, async (req, res) => {
  try {
    let role = 'Staff';
    let docId = null;
    const userHosp = req.user.hospital || 'general-hospital';

    if (req.user.role === 'doctor') {
      role = 'Doctor';
      docId = req.user.id || req.user._id;
    } else if (req.user.role === 'lab') {
      role = 'Lab';
    } else if (req.user.role === 'staff') {
      role = 'Staff';
    }

    // Query messages sent TO this role, or generic broadcasts, or FROM this role within this hospital tenant
    const messages = await HospitalMessage.find({
      hospital: userHosp,
      $or: [
        { receiverRole: role, receiverId: docId },
        { receiverRole: role, receiverId: null },
        { senderRole: role }
      ]
    })
    .sort({ createdAt: -1 })
    .limit(50);

    res.json(messages);
  } catch (err) {
    console.error('Error fetching messages:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
