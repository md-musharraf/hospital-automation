const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Doctor = require('../models/Doctor');
const Staff = require('../models/Staff');
const LabAssistant = require('../models/LabAssistant');
const { JWT_SECRET, authenticateToken } = require('../middleware/auth');

// Doctor Login
router.post('/doctor/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const doctor = await Doctor.findOne({ email });
    if (!doctor) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, doctor.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: doctor._id, email: doctor.email, role: 'doctor' },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({
      token,
      user: {
        id: doctor._id,
        name: doctor.name,
        email: doctor.email,
        department: doctor.department,
        specialization: doctor.specialization,
        availabilityStatus: doctor.availabilityStatus,
        currentRoom: doctor.currentRoom,
        role: 'doctor'
      }
    });
  } catch (error) {
    console.error('Doctor login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Staff Login
router.post('/staff/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    const staff = await Staff.findOne({ username });
    if (!staff) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, staff.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: staff._id, username: staff.username, role: 'staff' },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({
      token,
      user: {
        id: staff._id,
        name: staff.name,
        username: staff.username,
        counterNumber: staff.counterNumber,
        role: 'staff'
      }
    });
  } catch (error) {
    console.error('Staff login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Lab Assistant Login
router.post('/lab/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    const lab = await LabAssistant.findOne({ username });
    if (!lab) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, lab.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: lab._id, username: lab.username, role: 'lab' },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({
      token,
      user: {
        id: lab._id,
        name: lab.name,
        username: lab.username,
        role: 'lab'
      }
    });
  } catch (error) {
    console.error('Lab login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get currently logged-in user
router.get('/me', authenticateToken, async (req, res) => {
  try {
    if (req.user.role === 'doctor') {
      const doctor = await Doctor.findById(req.user.id).select('-passwordHash');
      if (!doctor) return res.status(404).json({ message: 'Doctor not found' });
      return res.json({ user: { ...doctor.toObject(), role: 'doctor' } });
    } else if (req.user.role === 'staff') {
      const staff = await Staff.findById(req.user.id).select('-passwordHash');
      if (!staff) return res.status(404).json({ message: 'Staff member not found' });
      return res.json({ user: { ...staff.toObject(), role: 'staff' } });
    } else if (req.user.role === 'lab') {
      const lab = await LabAssistant.findById(req.user.id).select('-passwordHash');
      if (!lab) return res.status(404).json({ message: 'Lab Assistant not found' });
      return res.json({ user: { ...lab.toObject(), role: 'lab' } });
    }
    res.status(400).json({ message: 'Invalid role' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
