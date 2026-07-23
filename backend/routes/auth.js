const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Doctor = require('../models/Doctor');
const Staff = require('../models/Staff');
const LabAssistant = require('../models/LabAssistant');
const Pharmacist = require('../models/Pharmacist');
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

// Pharmacist Login (rate-limited)
router.post('/pharmacy/login', loginLimiter, async (req, res) => {
  try {
    const { username, password, hospital } = req.body;
    if (!username || !password || !hospital) {
      return res.status(400).json({ message: 'Username, password, and facility selection are required' });
    }

    const pharmacist = await Pharmacist.findOne({ username, hospital });
    if (!pharmacist) {
      return res.status(401).json({ message: 'Invalid credentials for the selected facility' });
    }

    const isMatch = await bcrypt.compare(password, pharmacist.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: pharmacist._id, username: pharmacist.username, role: 'pharmacy', hospital: pharmacist.hospital },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({
      token,
      user: {
        id: pharmacist._id,
        name: pharmacist.name,
        username: pharmacist.username,
        counterNumber: pharmacist.counterNumber,
        hospital: pharmacist.hospital,
        role: 'pharmacy'
      }
    });
  } catch (error) {
    console.error('Pharmacy login error:', error);
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
    } else if (req.user.role === 'pharmacy') {
      const pharmacist = await Pharmacist.findById(req.user.id).select('-passwordHash');
      if (!pharmacist) return res.status(404).json({ message: 'Pharmacist not found' });
      return res.json({ user: { ...pharmacist.toObject(), role: 'pharmacy' } });
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
    const b = req.body;
    const {
      id, name, slug, address, phone, whatsappNumber, coverImage, description,
      city, coordinates, type, clinicSubtype, customServices, features
    } = b;

    // Validate core facility parameters
    if (!id || !name || !slug || !address || !phone || !whatsappNumber || !city || !coordinates || !type) {
      return res.status(400).json({ message: 'All facility details (id, name, slug, address, phone, whatsappNumber, city, coordinates, type) are required' });
    }

    const hasInternalLab = b.hasInternalLab !== undefined ? b.hasInternalLab : true;
    const hasInternalPharmacy = b.hasInternalPharmacy !== undefined ? b.hasInternalPharmacy : true;

    // Normalize personnel: accept either the new ARRAY form (doctors[],
    // staffMembers[], labAssistants[], pharmacists[]) or the legacy single-account
    // fields, so an admin can onboard "2-3 doctors, 1-2 labs, a pharmacy" in ONE
    // registration. Internal lab/pharmacy accounts are only created when the
    // facility declares it has that unit.
    const doctors = (Array.isArray(b.doctors) && b.doctors.length)
      ? b.doctors
      : (b.docEmail ? [{ name: b.docName, email: b.docEmail, password: b.docPassword, department: b.docDepartment, currentRoom: b.docRoom, specialization: b.docSpecialization, averageCheckupTime: b.docCheckupTime }] : []);

    const staffMembers = (Array.isArray(b.staffMembers) && b.staffMembers.length)
      ? b.staffMembers
      : (b.staffUsername ? [{ name: b.staffName, username: b.staffUsername, password: b.staffPassword, counterNumber: b.counterNumber }] : []);

    const labAssistants = hasInternalLab
      ? ((Array.isArray(b.labAssistants) && b.labAssistants.length)
          ? b.labAssistants
          : (b.labUsername ? [{ name: b.labName, username: b.labUsername, password: b.labPassword }] : []))
      : [];

    const pharmacists = hasInternalPharmacy
      ? ((Array.isArray(b.pharmacists) && b.pharmacists.length)
          ? b.pharmacists
          : (b.pharmUsername ? [{ name: b.pharmName, username: b.pharmUsername, password: b.pharmPassword, counterNumber: b.pharmCounter }] : []))
      : [];

    // A facility must have at least one login account to be operable
    if (!staffMembers.length && !doctors.length && !labAssistants.length && !pharmacists.length) {
      return res.status(400).json({ message: 'At least one account (reception, doctor, lab, or pharmacy) is required to register a facility.' });
    }

    // Validate each account + reject duplicates WITHIN this request
    const seen = { doctor: new Set(), staff: new Set(), lab: new Set(), pharmacy: new Set() };
    for (const d of doctors) {
      if (!d.email || !d.password) return res.status(400).json({ message: 'Every doctor needs an email and password.' });
      if (seen.doctor.has(d.email)) return res.status(400).json({ message: `Duplicate doctor email '${d.email}' in this registration.` });
      seen.doctor.add(d.email);
    }
    for (const s of staffMembers) {
      if (!s.username || !s.password) return res.status(400).json({ message: 'Every reception account needs a username and password.' });
      if (seen.staff.has(s.username)) return res.status(400).json({ message: `Duplicate reception username '${s.username}' in this registration.` });
      seen.staff.add(s.username);
    }
    for (const l of labAssistants) {
      if (!l.username || !l.password) return res.status(400).json({ message: 'Every lab account needs a username and password.' });
      if (seen.lab.has(l.username)) return res.status(400).json({ message: `Duplicate lab username '${l.username}' in this registration.` });
      seen.lab.add(l.username);
    }
    for (const p of pharmacists) {
      if (!p.username || !p.password) return res.status(400).json({ message: 'Every pharmacy account needs a username and password.' });
      if (seen.pharmacy.has(p.username)) return res.status(400).json({ message: `Duplicate pharmacy username '${p.username}' in this registration.` });
      seen.pharmacy.add(p.username);
    }

    // Check if facility ID or slug is already taken
    const existingHospital = await Hospital.findOne({ $or: [{ id }, { slug }] });
    if (existingHospital) {
      return res.status(400).json({ message: 'Facility ID or Slug is already registered.' });
    }

    // Check credential collisions against existing accounts in this tenant
    for (const s of staffMembers) {
      if (await Staff.findOne({ username: s.username, hospital: id })) return res.status(400).json({ message: `Reception username '${s.username}' is already taken in this facility.` });
    }
    for (const d of doctors) {
      if (await Doctor.findOne({ email: d.email, hospital: id })) return res.status(400).json({ message: `Doctor email '${d.email}' is already registered in this facility.` });
    }
    for (const l of labAssistants) {
      if (await LabAssistant.findOne({ username: l.username, hospital: id })) return res.status(400).json({ message: `Lab username '${l.username}' is already taken in this facility.` });
    }
    for (const p of pharmacists) {
      if (await Pharmacist.findOne({ username: p.username, hospital: id })) return res.status(400).json({ message: `Pharmacy username '${p.username}' is already taken in this facility.` });
    }

    const salt = await bcrypt.genSalt(10);
    const hash = (pw) => bcrypt.hash(pw, salt);

    // Create the facility
    const newHospital = new Hospital({
      id, name, slug, address, phone, whatsappNumber,
      coverImage: coverImage || 'https://images.unsplash.com/photo-1517122497576-4b2eb7482b8b?q=80&w=800&auto=format&fit=crop',
      description: description || 'Specialized clinical care service.',
      city, coordinates, type,
      logoUrl: b.logoUrl || '',
      heroImage: b.heroImage || coverImage || '',
      galleryImages: b.galleryImages || (coverImage ? [coverImage] : []),
      doctorCount: doctors.length || (b.doctorCount ? parseInt(b.doctorCount) : 0),
      primaryColor: b.primaryColor || '#0d9488',
      secondaryColor: b.secondaryColor || '#0f172a',
      welcomeMessage: b.welcomeMessage || '',
      parentHospital: b.parentHospital || null,
      hasInternalLab,
      hasInternalPharmacy,
      clinicSubtype: clinicSubtype || 'General',
      customServices: customServices || [],
      features: features || []
    });
    await newHospital.save();

    // Create every personnel account for this facility tenant
    const created = { staff: [], doctors: [], labAssistants: [], pharmacists: [] };

    for (const s of staffMembers) {
      const doc = new Staff({ name: s.name || 'Reception Staff', username: s.username, passwordHash: await hash(s.password), counterNumber: s.counterNumber || 'Counter 1', hospital: id });
      await doc.save();
      created.staff.push(doc.username);
    }
    for (const d of doctors) {
      const doc = new Doctor({
        name: d.name || 'Doctor Consultant', email: d.email, passwordHash: await hash(d.password),
        department: d.department || 'General Practice', specialization: d.specialization || 'General Consultation',
        availabilityStatus: 'Available', averageCheckupTime: d.averageCheckupTime ? parseInt(d.averageCheckupTime) : 10,
        currentRoom: d.currentRoom || 'Cabin 1', hospital: id
      });
      await doc.save();
      await new Queue({ doctor: doc._id, currentToken: null, activeQueue: [] }).save();
      created.doctors.push(doc.email);
    }
    for (const l of labAssistants) {
      const doc = new LabAssistant({ name: l.name || 'Lab Assistant', username: l.username, passwordHash: await hash(l.password), hospital: id });
      await doc.save();
      created.labAssistants.push(doc.username);
    }
    for (const p of pharmacists) {
      const doc = new Pharmacist({ name: p.name || 'Pharmacist', username: p.username, passwordHash: await hash(p.password), counterNumber: p.counterNumber || 'Pharmacy Counter', hospital: id });
      await doc.save();
      created.pharmacists.push(doc.username);
    }

    res.status(201).json({
      message: `Facility '${name}' registered with ${created.staff.length} reception, ${created.doctors.length} doctor(s), ${created.labAssistants.length} lab, ${created.pharmacists.length} pharmacy account(s).`,
      hospital: newHospital,
      created
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

// Register Additional Pharmacist (Medical store operator)
router.post('/super-admin/register-pharmacist', verifyAdminSecret, async (req, res) => {
  try {
    const { hospital, name, username, password, counterNumber } = req.body;
    if (!hospital || !username || !password) {
      return res.status(400).json({ message: 'Facility selection, username, and password are required' });
    }

    const existingHospital = await Hospital.findOne({ id: hospital });
    if (!existingHospital) {
      return res.status(404).json({ message: 'Selected facility does not exist' });
    }

    const existingPharmacist = await Pharmacist.findOne({ username, hospital });
    if (existingPharmacist) {
      return res.status(400).json({ message: `Pharmacy username '${username}' is already taken in this facility.` });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newPharmacist = new Pharmacist({
      name: name || 'Pharmacist',
      username,
      passwordHash,
      counterNumber: counterNumber || 'Pharmacy Counter',
      hospital
    });
    await newPharmacist.save();

    res.status(201).json({
      message: `Pharmacy account '${username}' registered successfully!`,
      pharmacist: {
        id: newPharmacist._id,
        name: newPharmacist.name,
        username: newPharmacist.username,
        counterNumber: newPharmacist.counterNumber,
        hospital: newPharmacist.hospital
      }
    });
  } catch (error) {
    console.error('Super admin pharmacist registration error:', error);
    res.status(500).json({ message: 'Server error registering pharmacist account' });
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
    await Pharmacist.deleteMany({ hospital: id });

    // Delete Hospital document
    await Hospital.deleteOne({ id });

    res.json({ message: `Hospital '${hospital.name}' and all associated accounts deleted successfully!` });
  } catch (error) {
    console.error('Super admin hospital delete error:', error);
    res.status(500).json({ message: 'Server error deleting hospital' });
  }
});

// GET all personnel and patients for a specific facility (Super Admin)
router.get('/super-admin/facility-data/:hospitalId', verifyAdminSecret, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const Patient = require('../models/Patient');
    
    const doctors = await Doctor.find({ hospital: hospitalId }).select('-passwordHash');
    const staff = await Staff.find({ hospital: hospitalId }).select('-passwordHash');
    const labAssistants = await LabAssistant.find({ hospital: hospitalId }).select('-passwordHash');
    const pharmacists = await Pharmacist.find({ hospital: hospitalId }).select('-passwordHash');
    const patients = await Patient.find({ hospital: hospitalId });

    res.json({ doctors, staff, labAssistants, pharmacists, patients });
  } catch (error) {
    console.error('Super admin facility-data error:', error);
    res.status(500).json({ message: 'Server error fetching facility data' });
  }
});

// PUT update Doctor (Super Admin)
router.put('/super-admin/doctor/:id', verifyAdminSecret, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, department, specialization, currentRoom, availabilityStatus, password } = req.body;

    const doctor = await Doctor.findById(id);
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });

    if (name) doctor.name = name;
    if (email) doctor.email = email;
    if (department) doctor.department = department;
    if (specialization !== undefined) doctor.specialization = specialization;
    if (currentRoom) doctor.currentRoom = currentRoom;
    if (availabilityStatus) doctor.availabilityStatus = availabilityStatus;
    if (password) doctor.passwordHash = await bcrypt.hash(password, 10);

    await doctor.save();
    res.json({ message: 'Doctor updated successfully', doctor });
  } catch (error) {
    console.error('Super admin update doctor error:', error);
    res.status(500).json({ message: 'Server error updating doctor' });
  }
});

// DELETE Doctor (Super Admin)
router.delete('/super-admin/doctor/:id', verifyAdminSecret, async (req, res) => {
  try {
    const { id } = req.params;
    await Queue.deleteOne({ doctor: id });
    await Doctor.findByIdAndDelete(id);
    res.json({ message: 'Doctor deleted successfully' });
  } catch (error) {
    console.error('Super admin delete doctor error:', error);
    res.status(500).json({ message: 'Server error deleting doctor' });
  }
});

// PUT update Staff (Super Admin)
router.put('/super-admin/staff/:id', verifyAdminSecret, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, username, counterNumber, password } = req.body;

    const staff = await Staff.findById(id);
    if (!staff) return res.status(404).json({ message: 'Staff member not found' });

    if (name) staff.name = name;
    if (username) staff.username = username;
    if (counterNumber) staff.counterNumber = counterNumber;
    if (password) staff.passwordHash = await bcrypt.hash(password, 10);

    await staff.save();
    res.json({ message: 'Staff updated successfully', staff });
  } catch (error) {
    console.error('Super admin update staff error:', error);
    res.status(500).json({ message: 'Server error updating staff' });
  }
});

// DELETE Staff (Super Admin)
router.delete('/super-admin/staff/:id', verifyAdminSecret, async (req, res) => {
  try {
    const { id } = req.params;
    await Staff.findByIdAndDelete(id);
    res.json({ message: 'Staff member deleted successfully' });
  } catch (error) {
    console.error('Super admin delete staff error:', error);
    res.status(500).json({ message: 'Server error deleting staff' });
  }
});

// PUT update Lab Assistant (Super Admin)
router.put('/super-admin/lab-assistant/:id', verifyAdminSecret, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, username, password } = req.body;

    const lab = await LabAssistant.findById(id);
    if (!lab) return res.status(404).json({ message: 'Lab Assistant not found' });

    if (name) lab.name = name;
    if (username) lab.username = username;
    if (password) lab.passwordHash = await bcrypt.hash(password, 10);

    await lab.save();
    res.json({ message: 'Lab Assistant updated successfully', labAssistant: lab });
  } catch (error) {
    console.error('Super admin update lab assistant error:', error);
    res.status(500).json({ message: 'Server error updating lab assistant' });
  }
});

// DELETE Lab Assistant (Super Admin)
router.delete('/super-admin/lab-assistant/:id', verifyAdminSecret, async (req, res) => {
  try {
    const { id } = req.params;
    await LabAssistant.findByIdAndDelete(id);
    res.json({ message: 'Lab Assistant deleted successfully' });
  } catch (error) {
    console.error('Super admin delete lab assistant error:', error);
    res.status(500).json({ message: 'Server error deleting lab assistant' });
  }
});

// PUT update Pharmacist (Super Admin)
router.put('/super-admin/pharmacist/:id', verifyAdminSecret, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, username, counterNumber, password } = req.body;

    const pharmacist = await Pharmacist.findById(id);
    if (!pharmacist) return res.status(404).json({ message: 'Pharmacist not found' });

    if (name) pharmacist.name = name;
    if (username) pharmacist.username = username;
    if (counterNumber) pharmacist.counterNumber = counterNumber;
    if (password) pharmacist.passwordHash = await bcrypt.hash(password, 10);

    await pharmacist.save();
    res.json({ message: 'Pharmacist updated successfully', pharmacist });
  } catch (error) {
    console.error('Super admin update pharmacist error:', error);
    res.status(500).json({ message: 'Server error updating pharmacist' });
  }
});

// DELETE Pharmacist (Super Admin)
router.delete('/super-admin/pharmacist/:id', verifyAdminSecret, async (req, res) => {
  try {
    const { id } = req.params;
    await Pharmacist.findByIdAndDelete(id);
    res.json({ message: 'Pharmacist deleted successfully' });
  } catch (error) {
    console.error('Super admin delete pharmacist error:', error);
    res.status(500).json({ message: 'Server error deleting pharmacist' });
  }
});

// PUT update Patient (Super Admin)
router.put('/super-admin/patient/:id', verifyAdminSecret, async (req, res) => {
  try {
    const { id } = req.params;
    const Patient = require('../models/Patient');
    const { name, phone, age, gender } = req.body;

    const patient = await Patient.findById(id);
    if (!patient) return res.status(404).json({ message: 'Patient not found' });

    if (name) patient.name = name;
    if (phone) patient.phone = phone;
    if (age) patient.age = parseInt(age);
    if (gender) patient.gender = gender;

    await patient.save();
    res.json({ message: 'Patient updated successfully', patient });
  } catch (error) {
    console.error('Super admin update patient error:', error);
    res.status(500).json({ message: 'Server error updating patient' });
  }
});

// DELETE Patient (Super Admin)
router.delete('/super-admin/patient/:id', verifyAdminSecret, async (req, res) => {
  try {
    const { id } = req.params;
    const Patient = require('../models/Patient');
    await Patient.findByIdAndDelete(id);
    res.json({ message: 'Patient record deleted successfully' });
  } catch (error) {
    console.error('Super admin delete patient error:', error);
    res.status(500).json({ message: 'Server error deleting patient' });
  }
});

// POST Clear all demo/sample data (Super Admin Endpoint)
router.post('/super-admin/clear-demo-data', verifyAdminSecret, async (req, res) => {
  try {
    const Patient = require('../models/Patient');
    const ChatSession = require('../models/ChatSession');
    const ArchivedToken = require('../models/ArchivedToken');
    const Reminder = require('../models/Reminder');
    const Token = require('../models/Token');
    const Queue = require('../models/Queue');

    await Hospital.deleteMany({});
    await Doctor.deleteMany({});
    await Staff.deleteMany({});
    await LabAssistant.deleteMany({});
    await Pharmacist.deleteMany({});
    await Queue.deleteMany({});
    await Token.deleteMany({});
    await Patient.deleteMany({});
    await ChatSession.deleteMany({});
    await ArchivedToken.deleteMany({});
    await Reminder.deleteMany({});

    if (req.io) {
      req.io.emit('queue-reset');
    }

    res.json({ message: 'All demo and sample data cleared successfully! System is 100% clean for manual hospital entry.' });
  } catch (error) {
    console.error('Super admin clear demo data error:', error);
    res.status(500).json({ message: 'Server error clearing demo data' });
  }
});

module.exports = router;
