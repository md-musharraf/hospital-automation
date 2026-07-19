const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Doctor = require('../models/Doctor');
const Staff = require('../models/Staff');
const LabAssistant = require('../models/LabAssistant');
const Hospital = require('../models/Hospital');
const Queue = require('../models/Queue');
const { JWT_SECRET, authenticateToken } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

// Login rate limiter: 10 attempts per 15 minutes per IP to prevent brute-force
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please try again after 15 minutes.' }
});

// Doctor Login (rate-limited)
router.post('/doctor/login', loginLimiter, async (req, res) => {
  try {
    const { email, password, hospital } = req.body;
    if (!email || !password || !hospital) {
      return res.status(400).json({ message: 'Email, password, and hospital selection are required' });
    }

    const doctor = await Doctor.findOne({ email, hospital });
    if (!doctor) {
      return res.status(401).json({ message: 'Invalid credentials for the selected hospital' });
    }

    const isMatch = await bcrypt.compare(password, doctor.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: doctor._id, email: doctor.email, role: 'doctor', hospital: doctor.hospital },
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
        hospital: doctor.hospital,
        role: 'doctor'
      }
    });
  } catch (error) {
    console.error('Doctor login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Staff Login (rate-limited)
router.post('/staff/login', loginLimiter, async (req, res) => {
  try {
    const { username, password, hospital } = req.body;
    if (!username || !password || !hospital) {
      return res.status(400).json({ message: 'Username, password, and hospital selection are required' });
    }

    const staff = await Staff.findOne({ username, hospital });
    if (!staff) {
      return res.status(401).json({ message: 'Invalid credentials for the selected hospital' });
    }

    const isMatch = await bcrypt.compare(password, staff.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: staff._id, username: staff.username, role: 'staff', hospital: staff.hospital },
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
        hospital: staff.hospital,
        role: 'staff'
      }
    });
  } catch (error) {
    console.error('Staff login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Lab Assistant Login (rate-limited)
router.post('/lab/login', loginLimiter, async (req, res) => {
  try {
    const { username, password, hospital } = req.body;
    if (!username || !password || !hospital) {
      return res.status(400).json({ message: 'Username, password, and hospital selection are required' });
    }

    const lab = await LabAssistant.findOne({ username, hospital });
    if (!lab) {
      return res.status(401).json({ message: 'Invalid credentials for the selected hospital' });
    }

    const isMatch = await bcrypt.compare(password, lab.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: lab._id, username: lab.username, role: 'lab', hospital: lab.hospital },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({
      token,
      user: {
        id: lab._id,
        name: lab.name,
        username: lab.username,
        hospital: lab.hospital,
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

// Middleware to verify Super Admin Secret Passcode
const verifyAdminSecret = (req, res, next) => {
  const adminSecret = req.headers['x-admin-secret'] || req.body.adminSecret;
  const expectedSecret = process.env.ADMIN_SECRET || 'supersecret123';
  if (!adminSecret || adminSecret !== expectedSecret) {
    return res.status(401).json({ message: 'Unauthorized: Invalid Admin Secret Passcode' });
  }
  next();
};

// Verify Super Admin Passcode
router.post('/super-admin/verify', verifyAdminSecret, (req, res) => {
  res.json({ success: true, message: 'Admin passcode verified successfully' });
});

// Register Hospital (Super Admin Endpoint — requires authentication via admin secret)
router.post('/super-admin/register-hospital', verifyAdminSecret, async (req, res) => {
  try {
    const { 
      // Hospital details
      id, name, slug, address, phone, whatsappNumber, coverImage, description, city, coordinates, type,
      // Initial Staff Member
      staffName, staffUsername, staffPassword, counterNumber,
      // Initial Doctor
      docName, docEmail, docPassword, docDepartment, docRoom,
      // Initial Lab Assistant
      labName, labUsername, labPassword
    } = req.body;

    // Validate hospital parameters
    if (!id || !name || !slug || !address || !phone || !whatsappNumber || !city || !coordinates || !type) {
      return res.status(400).json({ message: 'All hospital details (id, name, slug, address, phone, whatsappNumber, city, coordinates, type) are required' });
    }

    // Validate staff, doctor, lab parameters
    if (!staffUsername || !staffPassword || !docEmail || !docPassword || !labUsername || !labPassword) {
      return res.status(400).json({ message: 'Initial staff, doctor, and lab assistant credentials are required' });
    }

    // Check if hospital ID or slug is already taken
    const existingHospital = await Hospital.findOne({ $or: [{ id }, { slug }] });
    if (existingHospital) {
      return res.status(400).json({ message: 'Hospital ID or Slug is already registered.' });
    }

    // Check if credentials collide in the target hospital tenant
    const existingStaff = await Staff.findOne({ username: staffUsername, hospital: id });
    if (existingStaff) {
      return res.status(400).json({ message: `Staff username '${staffUsername}' is already taken in this hospital tenant.` });
    }

    const existingDoc = await Doctor.findOne({ email: docEmail, hospital: id });
    if (existingDoc) {
      return res.status(400).json({ message: `Doctor email '${docEmail}' is already registered in this hospital tenant.` });
    }

    const existingLab = await LabAssistant.findOne({ username: labUsername, hospital: id });
    if (existingLab) {
      return res.status(400).json({ message: `Lab assistant username '${labUsername}' is already taken in this hospital tenant.` });
    }

    // Hash passwords
    const salt = await bcrypt.genSalt(10);
    const staffPasswordHash = await bcrypt.hash(staffPassword, salt);
    const docPasswordHash = await bcrypt.hash(docPassword, salt);
    const labPasswordHash = await bcrypt.hash(labPassword, salt);

    // Create and save Hospital
    const newHospital = new Hospital({
      id,
      name,
      slug,
      address,
      phone,
      whatsappNumber,
      coverImage: coverImage || 'https://images.unsplash.com/photo-1517122497576-4b2eb7482b8b?q=80&w=800&auto=format&fit=crop',
      description: description || 'Specialized clinical care service.',
      city,
      coordinates,
      type
    });
    await newHospital.save();

    // Create and save Staff
    const newStaff = new Staff({
      name: staffName || 'Staff Assistant',
      username: staffUsername,
      passwordHash: staffPasswordHash,
      counterNumber: counterNumber || 'Counter 1',
      hospital: id
    });
    await newStaff.save();

    // Create and save Doctor
    const newDoctor = new Doctor({
      name: docName || 'Doctor Consultant',
      email: docEmail,
      passwordHash: docPasswordHash,
      department: docDepartment || 'General Practice',
      specialization: 'General Consultation',
      availabilityStatus: 'Available',
      averageCheckupTime: 10,
      currentRoom: docRoom || 'Cabin 1',
      hospital: id
    });
    await newDoctor.save();

    // Create Queue for Doctor
    const newQueue = new Queue({
      doctor: newDoctor._id,
      currentToken: null,
      activeQueue: []
    });
    await newQueue.save();

    // Create and save Lab Assistant
    const newLab = new LabAssistant({
      name: labName || 'Lab Assistant',
      username: labUsername,
      passwordHash: labPasswordHash,
      hospital: id
    });
    await newLab.save();

    res.status(201).json({
      message: 'Hospital registered successfully alongside initial Staff, Doctor, and Lab accounts!',
      hospital: newHospital
    });

  } catch (error) {
    console.error('Super admin hospital registration error:', error);
    res.status(500).json({ message: 'Server error registering hospital' });
  }
});

module.exports = router;
