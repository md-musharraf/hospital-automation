const express = require('express');
const router = express.Router();
const HospitalMessage = require('../models/HospitalMessage');
const Doctor = require('../models/Doctor');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * Who is speaking, when everyone at a facility shares one login.
 *
 * The sender's role used to be read straight off the token — a lab token meant
 * a message from the lab. With one facility credential the token no longer says
 * which room you are standing in, so the console names the tab it is speaking
 * from (`as=lab`), and that claim is checked against the scopes the facility
 * actually has. A facility with no lab cannot post as its lab.
 *
 * `as=doctor` additionally resolves the cabin from the token's `actingDoctor`
 * claim (see POST /auth/facility/cabin), so a reply reaches the doctor who sent
 * it rather than every cabin in the building.
 */
const CONSOLE_SENDERS = {
  staff: { role: 'Staff', name: 'Reception' },
  lab: { role: 'Lab', name: 'Lab Workstation' },
  pharmacy: { role: 'Staff', name: 'Pharmacy Counter' },
  doctor: { role: 'Doctor', name: 'Doctor' }
};

async function identifySender(req) {
  // Legacy per-role tokens are gone, but keep reading the role first so an
  // unexpired token issued before this change still behaves for its last hours.
  if (req.user.role !== 'facility') {
    if (req.user.role === 'doctor') {
      return { role: 'Doctor', name: req.user.name || 'Doctor', id: req.user.id || req.user._id || null };
    }
    if (req.user.role === 'lab') return { role: 'Lab', name: 'Lab Workstation', id: null };
    return { role: 'Staff', name: req.user.username || 'Staff', id: null };
  }

  const asked = String((req.body && req.body.as) || (req.query && req.query.as) || 'staff').toLowerCase();
  const scopes = Array.isArray(req.user.scopes) ? req.user.scopes : [];
  const which = CONSOLE_SENDERS[asked] && scopes.includes(asked) ? asked : 'staff';
  const sender = { ...CONSOLE_SENDERS[which], id: null };

  if (which === 'doctor') {
    const actingId = req.user.actingDoctor || req.headers['x-acting-doctor'];
    if (actingId) {
      const doctor = await Doctor.findOne({ _id: actingId, hospital: req.user.hospital });
      if (doctor) {
        sender.name = doctor.name;
        sender.id = doctor._id;
      }
    }
  }

  return sender;
}

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

    const sender = await identifySender(req);

    const message = new HospitalMessage({
      senderRole: sender.role,
      senderName: sender.name,
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
    logger.error('Error sending internal message', { err: err });
    res.status(500).json({ message: 'Server error' });
  }
});

// GET messages for the active session user within their hospital tenant
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userHosp = req.user.hospital || 'general-hospital';
    // Same "which room am I in" question as sending — the inbox a facility sees
    // depends on the tab it is reading from, not on the one credential it used.
    const sender = await identifySender(req);
    const role = sender.role;
    const docId = sender.id;

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
    logger.error('Error fetching messages', { err: err });
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
