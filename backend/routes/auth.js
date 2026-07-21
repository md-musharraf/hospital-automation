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
      clinicSubtype, customServices, features,
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
      type,
      logoUrl: req.body.logoUrl || '',
      heroImage: req.body.heroImage || coverImage || '',
      galleryImages: req.body.galleryImages || (coverImage ? [coverImage] : []),
      doctorCount: req.body.doctorCount ? parseInt(req.body.doctorCount) : 1,
      primaryColor: req.body.primaryColor || '#0d9488',
      secondaryColor: req.body.secondaryColor || '#0f172a',
      welcomeMessage: req.body.welcomeMessage || '',
      parentHospital: req.body.parentHospital || null,
      hasInternalLab: req.body.hasInternalLab !== undefined ? req.body.hasInternalLab : true,
      hasInternalPharmacy: req.body.hasInternalPharmacy !== undefined ? req.body.hasInternalPharmacy : true,
      clinicSubtype: clinicSubtype || 'General',
      customServices: customServices || [],
      features: features || []
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

// Register Additional Staff Member
router.post('/super-admin/register-staff', verifyAdminSecret, async (req, res) => {
  try {
    const { hospital, name, username, password, counterNumber } = req.body;
    if (!hospital || !username || !password) {
      return res.status(400).json({ message: 'Hospital selection, username, and password are required' });
    }

    // Verify hospital exists
    const existingHospital = await Hospital.findOne({ id: hospital });
    if (!existingHospital) {
      return res.status(404).json({ message: 'Selected hospital does not exist' });
    }

    // Check if staff username is already taken in this hospital tenant
    const existingStaff = await Staff.findOne({ username, hospital });
    if (existingStaff) {
      return res.status(400).json({ message: `Staff username '${username}' is already taken in this hospital tenant.` });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newStaff = new Staff({
      name: name || 'Staff Assistant',
      username,
      passwordHash,
      counterNumber: counterNumber || 'Counter 1',
      hospital
    });
    await newStaff.save();

    res.status(201).json({
      message: `Staff account '${username}' registered successfully!`,
      staff: {
        id: newStaff._id,
        name: newStaff.name,
        username: newStaff.username,
        counterNumber: newStaff.counterNumber,
        hospital: newStaff.hospital
      }
    });
  } catch (error) {
    console.error('Super admin staff registration error:', error);
    res.status(500).json({ message: 'Server error registering staff account' });
  }
});

// Register Additional Doctor
router.post('/super-admin/register-doctor', verifyAdminSecret, async (req, res) => {
  try {
    const { hospital, name, email, password, department, currentRoom, specialization, averageCheckupTime } = req.body;
    if (!hospital || !email || !password) {
      return res.status(400).json({ message: 'Hospital selection, email, and password are required' });
    }

    // Verify hospital exists
    const existingHospital = await Hospital.findOne({ id: hospital });
    if (!existingHospital) {
      return res.status(404).json({ message: 'Selected hospital does not exist' });
    }

    // Check if doctor email is already registered in this hospital tenant
    const existingDoc = await Doctor.findOne({ email, hospital });
    if (existingDoc) {
      return res.status(400).json({ message: `Doctor email '${email}' is already registered in this hospital tenant.` });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newDoctor = new Doctor({
      name: name || 'Doctor Consultant',
      email,
      passwordHash,
      department: department || 'General Practice',
      specialization: specialization || 'General Consultation',
      availabilityStatus: 'Available',
      averageCheckupTime: averageCheckupTime ? parseInt(averageCheckupTime) : 10,
      currentRoom: currentRoom || 'Cabin 1',
      hospital
    });
    await newDoctor.save();

    // Increment doctor count on hospital
    existingHospital.doctorCount = (existingHospital.doctorCount || 0) + 1;
    await existingHospital.save();

    // Create Queue for Doctor
    const newQueue = new Queue({
      doctor: newDoctor._id,
      currentToken: null,
      activeQueue: []
    });
    await newQueue.save();

    res.status(201).json({
      message: `Doctor account '${email}' registered successfully!`,
      doctor: {
        id: newDoctor._id,
        name: newDoctor.name,
        email: newDoctor.email,
        department: newDoctor.department,
        hospital: newDoctor.hospital
      }
    });
  } catch (error) {
    console.error('Super admin doctor registration error:', error);
    res.status(500).json({ message: 'Server error registering doctor account' });
  }
});

// Register Additional Lab Assistant
router.post('/super-admin/register-lab', verifyAdminSecret, async (req, res) => {
  try {
    const { hospital, name, username, password } = req.body;
    if (!hospital || !username || !password) {
      return res.status(400).json({ message: 'Hospital selection, username, and password are required' });
    }

    // Verify hospital exists
    const existingHospital = await Hospital.findOne({ id: hospital });
    if (!existingHospital) {
      return res.status(404).json({ message: 'Selected hospital does not exist' });
    }

    // Check if lab assistant username is already taken in this hospital tenant
    const existingLab = await LabAssistant.findOne({ username, hospital });
    if (existingLab) {
      return res.status(400).json({ message: `Lab assistant username '${username}' is already taken in this hospital tenant.` });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newLab = new LabAssistant({
      name: name || 'Lab Assistant',
      username,
      passwordHash,
      hospital
    });
    await newLab.save();

    res.status(201).json({
      message: `Lab assistant account '${username}' registered successfully!`,
      lab: {
        id: newLab._id,
        name: newLab.name,
        username: newLab.username,
        hospital: newLab.hospital
      }
    });
  } catch (error) {
    console.error('Super admin lab registration error:', error);
    res.status(500).json({ message: 'Server error registering lab assistant account' });
  }
});

// Update Hospital Details (Super Admin Endpoint)
router.put('/super-admin/hospital/:id', verifyAdminSecret, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      slug,
      address,
      phone,
      whatsappNumber,
      coverImage,
      description,
      city,
      coordinates,
      type,
      logoUrl,
      heroImage,
      galleryImages,
      doctorCount,
      primaryColor,
      secondaryColor,
      welcomeMessage,
      clinicSubtype,
      customServices,
      features
    } = req.body;

    const hospital = await Hospital.findOne({ id });
    if (!hospital) {
      return res.status(404).json({ message: 'Hospital not found' });
    }

    // Update properties if provided
    if (name !== undefined) hospital.name = name;
    if (slug !== undefined) hospital.slug = slug;
    if (address !== undefined) hospital.address = address;
    if (phone !== undefined) hospital.phone = phone;
    if (whatsappNumber !== undefined) hospital.whatsappNumber = whatsappNumber;
    if (coverImage !== undefined) hospital.coverImage = coverImage;
    if (description !== undefined) hospital.description = description;
    if (city !== undefined) hospital.city = city;
    if (coordinates !== undefined) hospital.coordinates = coordinates;
    if (type !== undefined) hospital.type = type;
    if (logoUrl !== undefined) hospital.logoUrl = logoUrl;
    if (heroImage !== undefined) hospital.heroImage = heroImage;
    if (galleryImages !== undefined) hospital.galleryImages = galleryImages;
    if (doctorCount !== undefined) hospital.doctorCount = parseInt(doctorCount);
    if (primaryColor !== undefined) hospital.primaryColor = primaryColor;
    if (secondaryColor !== undefined) hospital.secondaryColor = secondaryColor;
    if (welcomeMessage !== undefined) hospital.welcomeMessage = welcomeMessage;
    if (req.body.parentHospital !== undefined) hospital.parentHospital = req.body.parentHospital;
    if (req.body.hasInternalLab !== undefined) hospital.hasInternalLab = req.body.hasInternalLab;
    if (req.body.hasInternalPharmacy !== undefined) hospital.hasInternalPharmacy = req.body.hasInternalPharmacy;
    if (clinicSubtype !== undefined) hospital.clinicSubtype = clinicSubtype;
    if (customServices !== undefined) hospital.customServices = customServices;
    if (features !== undefined) hospital.features = features;

    await hospital.save();

    res.json({ message: 'Hospital profile updated successfully!', hospital });
  } catch (error) {
    console.error('Super admin hospital update error:', error);
    res.status(500).json({ message: 'Server error updating hospital profile' });
  }
});

// Delete Hospital (Super Admin Endpoint)
router.delete('/super-admin/hospital/:id', verifyAdminSecret, async (req, res) => {
  try {
    const { id } = req.params;
    const hospital = await Hospital.findOne({ id });
    if (!hospital) {
      return res.status(404).json({ message: 'Hospital not found' });
    }

    // Delete associated Doctors, Staff, Lab Assistants
    const doctors = await Doctor.find({ hospital: id });
    const doctorIds = doctors.map(d => d._id);

    await Queue.deleteMany({ doctor: { $in: doctorIds } });
    await Doctor.deleteMany({ hospital: id });
    await Staff.deleteMany({ hospital: id });
    await LabAssistant.deleteMany({ hospital: id });

    // Delete Hospital document
    await Hospital.deleteOne({ id });

    res.json({ message: `Hospital '${hospital.name}' and all associated accounts deleted successfully!` });
  } catch (error) {
    console.error('Super admin hospital delete error:', error);
    res.status(500).json({ message: 'Server error deleting hospital' });
  }
});

module.exports = router;
