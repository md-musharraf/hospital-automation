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
const {
  FACILITY_TYPE_RULES,
  FACILITY_MODULES,
  LANDING_TEMPLATES,
  normalizeModules,
  normalizeLanding,
  normalizeDoctorProfile,
  reconcileLegacyFlags,
  legacyModulesFrom
} = require('../utils/facilityProfile');
const { safeCompare, isProduction } = require('../utils/env');
const logger = require('../utils/logger');
// Keyed by IP *and* account, so one reception desk's staff do not share a single
// ten-attempt budget between them. See middleware/rateLimits.js.
const { loginLimiter } = require('../middleware/rateLimits');

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

// Middleware to verify Super Admin Secret Passcode.
//
// This used to read `process.env.ADMIN_SECRET || 'supersecret123'`. That
// fallback is the whole platform's registration key, and it was written in a
// file anyone could read — so a deploy that forgot the variable was wide open
// while looking configured. There is no fallback now: an unset secret means
// nobody can pass, which is the safe direction to fail.
//
// The comparison is timing-safe. The endpoint is unauthenticated by definition
// (it is what grants admin access), so a plain `!==` hands an attacker a
// character-by-character oracle for the one secret that guards tenant creation.
const verifyAdminSecret = (req, res, next) => {
  const submitted = req.headers['x-admin-secret'] || req.body.adminSecret;
  const expected = process.env.ADMIN_SECRET;

  if (!expected) {
    logger.error('[AUTH] ADMIN_SECRET is not configured — refusing all super-admin access');
    return res.status(503).json({
      message: 'Super admin access is not configured on this server.'
    });
  }

  if (!safeCompare(submitted, expected)) {
    logger.warn('[AUTH] Rejected super-admin attempt', { ip: req.ip });
    return res.status(401).json({ message: 'Unauthorized: Invalid Admin Secret Passcode' });
  }

  next();
};

// Verify Super Admin Passcode
router.post('/super-admin/verify', verifyAdminSecret, (req, res) => {
  res.json({ success: true, message: 'Admin passcode verified successfully' });
});

// Register Hospital (Super Admin Endpoint — requires authentication via admin secret)
// The facility types the platform onboards, and WHICH login accounts each one
// actually needs. A pathology lab has no OPD doctors and a medical store has no
// lab bench — asking for those accounts (or accepting a facility without the one
// account that makes it operable) is how half-configured tenants get created.
// FACILITY_TYPE_RULES now lives in utils/facilityProfile.js, next to the module
// catalogue — the two answer the same question from opposite ends (a Lab
// `requires` a lab account precisely because a lab bench is the thing it has),
// and normalizeModules() needs the rules to refuse to switch off the one unit
// that makes a tenant operable. Keeping a second copy here is how they drift.

const DOCTOR_TYPES = [
  'Consultant',
  'Visiting',
  'Resident',
  'Surgeon',
  'Emergency Officer',
  'General Physician'
];

/** Everything the admin panel sends for one doctor, normalized and defaulted. */
function buildDoctorFields(d, hospitalId) {
  return {
    name: d.name || 'Doctor Consultant',
    email: d.email,
    department: d.department || 'General Practice',
    specialization: d.specialization || 'General Consultation',
    doctorType: DOCTOR_TYPES.includes(d.doctorType) ? d.doctorType : 'Consultant',
    availabilityStatus: 'Available',
    averageCheckupTime: d.averageCheckupTime ? parseInt(d.averageCheckupTime) : 10,
    dailyTokenLimit: d.dailyTokenLimit ? parseInt(d.dailyTokenLimit) : 0,
    currentRoom: d.currentRoom || 'Cabin 1',
    hospital: hospitalId,
    // The public half of the profile — qualification, experience, OPD days, fee.
    // Sanitized in facilityProfile because it is rendered on a public page.
    ...normalizeDoctorProfile(d)
  };
}

// GET the onboarding vocabulary the admin panel builds its form from — which
// facility types exist, which accounts each one needs vs. merely offers, and the
// doctor types. Served from the same constants the registration validates
// against, so the form can never offer a combination the API then rejects.
router.get('/super-admin/facility-types', verifyAdminSecret, (req, res) => {
  res.json({
    facilityTypes: Object.entries(FACILITY_TYPE_RULES).map(([name, rule]) => ({ name, ...rule })),
    doctorTypes: DOCTOR_TYPES,
    // The module catalogue and landing templates are served from the same
    // source the API validates against, so the admin panel's checkbox grid can
    // grow a new unit (or a new template) without a frontend release.
    modules: FACILITY_MODULES,
    landingTemplates: Object.values(LANDING_TEMPLATES).map((t) => ({
      key: t.key,
      label: t.label,
      blurb: t.blurb,
      sections: t.sections
    }))
  });
});

router.post('/super-admin/register-hospital', verifyAdminSecret, async (req, res) => {
  try {
    const b = req.body;
    const {
      id,
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
      clinicSubtype,
      customServices,
      features
    } = b;

    // Validate core facility parameters
    if (!id || !name || !slug || !address || !phone || !whatsappNumber || !city || !coordinates || !type) {
      return res.status(400).json({
        message:
          'All facility details (id, name, slug, address, phone, whatsappNumber, city, coordinates, type) are required'
      });
    }

    // Which units this facility runs. The admin panel posts a module map
    // ("runs its own lab? has an ambulance? how many ICU beds?"); an older
    // client posts only the two booleans. Either way we end up with one
    // normalized map, and the legacy columns are kept in lockstep with it so
    // queue routing / portals / directory badges never disagree with the
    // checkbox the admin actually ticked.
    const modules = normalizeModules(
      b.modules && typeof b.modules === 'object' ? b.modules : legacyModulesFrom({ ...b, type }),
      type
    );
    const legacyFlags = reconcileLegacyFlags(modules, b);
    const hasInternalLab = legacyFlags.hasInternalLab;
    const hasInternalPharmacy = legacyFlags.hasInternalPharmacy;
    const landing = normalizeLanding(b.landing);

    // Normalize personnel: accept either the new ARRAY form (doctors[],
    // staffMembers[], labAssistants[], pharmacists[]) or the legacy single-account
    // fields, so an admin can onboard "2-3 doctors, 1-2 labs, a pharmacy" in ONE
    // registration. Internal lab/pharmacy accounts are only created when the
    // facility declares it has that unit.
    const doctors =
      Array.isArray(b.doctors) && b.doctors.length
        ? b.doctors
        : b.docEmail
          ? [
              {
                name: b.docName,
                email: b.docEmail,
                password: b.docPassword,
                department: b.docDepartment,
                currentRoom: b.docRoom,
                specialization: b.docSpecialization,
                averageCheckupTime: b.docCheckupTime
              }
            ]
          : [];

    const staffMembers =
      Array.isArray(b.staffMembers) && b.staffMembers.length
        ? b.staffMembers
        : b.staffUsername
          ? [
              {
                name: b.staffName,
                username: b.staffUsername,
                password: b.staffPassword,
                counterNumber: b.counterNumber
              }
            ]
          : [];

    const labAssistants = hasInternalLab
      ? Array.isArray(b.labAssistants) && b.labAssistants.length
        ? b.labAssistants
        : b.labUsername
          ? [{ name: b.labName, username: b.labUsername, password: b.labPassword }]
          : []
      : [];

    const pharmacists = hasInternalPharmacy
      ? Array.isArray(b.pharmacists) && b.pharmacists.length
        ? b.pharmacists
        : b.pharmUsername
          ? [
              {
                name: b.pharmName,
                username: b.pharmUsername,
                password: b.pharmPassword,
                counterNumber: b.pharmCounter
              }
            ]
          : []
      : [];

    // The facility type decides which accounts this tenant actually needs.
    const typeRule = FACILITY_TYPE_RULES[type];
    if (!typeRule) {
      return res.status(400).json({
        message: `Unknown facility type '${type}'. Choose one of: ${Object.keys(FACILITY_TYPE_RULES).join(', ')}.`
      });
    }

    // A facility must have at least one login account to be operable
    if (!staffMembers.length && !doctors.length && !labAssistants.length && !pharmacists.length) {
      return res.status(400).json({
        message:
          'At least one account (reception, doctor, lab, or pharmacy) is required to register a facility.'
      });
    }

    // ...and specifically the account that makes THIS type of facility work: a
    // lab with no lab login, or a medical store with no pharmacy login, is a
    // tenant nobody can ever sign into to do the actual job.
    const accountCounts = {
      staff: staffMembers.length,
      doctors: doctors.length,
      lab: labAssistants.length,
      pharmacy: pharmacists.length
    };
    const accountLabels = { staff: 'reception', doctors: 'doctor', lab: 'lab', pharmacy: 'pharmacy' };
    const missing = typeRule.requires.filter((kind) => accountCounts[kind] === 0);
    if (missing.length) {
      return res.status(400).json({
        message: `A ${type} needs at least one ${missing.map((k) => accountLabels[k]).join(' and one ')} account.`
      });
    }

    // Validate each account + reject duplicates WITHIN this request
    const seen = { doctor: new Set(), staff: new Set(), lab: new Set(), pharmacy: new Set() };
    for (const d of doctors) {
      if (!d.email || !d.password)
        return res.status(400).json({ message: 'Every doctor needs an email and password.' });
      if (seen.doctor.has(d.email))
        return res.status(400).json({ message: `Duplicate doctor email '${d.email}' in this registration.` });
      seen.doctor.add(d.email);
    }
    for (const s of staffMembers) {
      if (!s.username || !s.password)
        return res.status(400).json({ message: 'Every reception account needs a username and password.' });
      if (seen.staff.has(s.username))
        return res
          .status(400)
          .json({ message: `Duplicate reception username '${s.username}' in this registration.` });
      seen.staff.add(s.username);
    }
    for (const l of labAssistants) {
      if (!l.username || !l.password)
        return res.status(400).json({ message: 'Every lab account needs a username and password.' });
      if (seen.lab.has(l.username))
        return res
          .status(400)
          .json({ message: `Duplicate lab username '${l.username}' in this registration.` });
      seen.lab.add(l.username);
    }
    for (const p of pharmacists) {
      if (!p.username || !p.password)
        return res.status(400).json({ message: 'Every pharmacy account needs a username and password.' });
      if (seen.pharmacy.has(p.username))
        return res
          .status(400)
          .json({ message: `Duplicate pharmacy username '${p.username}' in this registration.` });
      seen.pharmacy.add(p.username);
    }

    // Check if facility ID or slug is already taken
    const existingHospital = await Hospital.findOne({ $or: [{ id }, { slug }] });
    if (existingHospital) {
      return res.status(400).json({ message: 'Facility ID or Slug is already registered.' });
    }

    // Check credential collisions against existing accounts in this tenant
    for (const s of staffMembers) {
      if (await Staff.findOne({ username: s.username, hospital: id }))
        return res
          .status(400)
          .json({ message: `Reception username '${s.username}' is already taken in this facility.` });
    }
    for (const d of doctors) {
      if (await Doctor.findOne({ email: d.email, hospital: id }))
        return res
          .status(400)
          .json({ message: `Doctor email '${d.email}' is already registered in this facility.` });
    }
    for (const l of labAssistants) {
      if (await LabAssistant.findOne({ username: l.username, hospital: id }))
        return res
          .status(400)
          .json({ message: `Lab username '${l.username}' is already taken in this facility.` });
    }
    for (const p of pharmacists) {
      if (await Pharmacist.findOne({ username: p.username, hospital: id }))
        return res
          .status(400)
          .json({ message: `Pharmacy username '${p.username}' is already taken in this facility.` });
    }

    const salt = await bcrypt.genSalt(10);
    const hash = (pw) => bcrypt.hash(pw, salt);

    // Create the facility
    const newHospital = new Hospital({
      id,
      name,
      slug,
      address,
      phone,
      whatsappNumber,
      coverImage:
        coverImage ||
        'https://images.unsplash.com/photo-1517122497576-4b2eb7482b8b?q=80&w=800&auto=format&fit=crop',
      description: description || 'Specialized clinical care service.',
      city,
      coordinates,
      type,
      state: b.state || '',
      district: b.district || '',
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
      features: features || [],
      modules,
      landing
    });
    await newHospital.save();

    // Create every personnel account for this facility tenant
    const created = { staff: [], doctors: [], labAssistants: [], pharmacists: [] };

    for (const s of staffMembers) {
      const doc = new Staff({
        name: s.name || 'Reception Staff',
        username: s.username,
        passwordHash: await hash(s.password),
        counterNumber: s.counterNumber || 'Counter 1',
        hospital: id
      });
      await doc.save();
      created.staff.push(doc.username);
    }
    for (const d of doctors) {
      const doc = new Doctor({
        ...buildDoctorFields(d, id),
        passwordHash: await hash(d.password)
      });
      await doc.save();
      await new Queue({ doctor: doc._id, currentToken: null, activeQueue: [] }).save();
      created.doctors.push(doc.email);
    }
    for (const l of labAssistants) {
      const doc = new LabAssistant({
        name: l.name || 'Lab Assistant',
        username: l.username,
        passwordHash: await hash(l.password),
        hospital: id
      });
      await doc.save();
      created.labAssistants.push(doc.username);
    }
    for (const p of pharmacists) {
      const doc = new Pharmacist({
        name: p.name || 'Pharmacist',
        username: p.username,
        passwordHash: await hash(p.password),
        counterNumber: p.counterNumber || 'Pharmacy Counter',
        hospital: id
      });
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
      return res
        .status(400)
        .json({ message: `Staff username '${username}' is already taken in this hospital tenant.` });
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
    const { hospital, email, password } = req.body;
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
      return res
        .status(400)
        .json({ message: `Doctor email '${email}' is already registered in this hospital tenant.` });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Same normalization as registration, so a doctor added to a facility later
    // carries exactly the same fields as one created during onboarding.
    const newDoctor = new Doctor({ ...buildDoctorFields(req.body, hospital), passwordHash });
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
      message: `${newDoctor.doctorType} '${email}' registered successfully!`,
      doctor: {
        id: newDoctor._id,
        name: newDoctor.name,
        email: newDoctor.email,
        department: newDoctor.department,
        doctorType: newDoctor.doctorType,
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
      return res
        .status(400)
        .json({ message: `Lab assistant username '${username}' is already taken in this hospital tenant.` });
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
      return res
        .status(400)
        .json({ message: `Pharmacy username '${username}' is already taken in this facility.` });
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
    if (req.body.state !== undefined) hospital.state = req.body.state;
    if (req.body.district !== undefined) hospital.district = req.body.district;
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
    if (req.body.hasInternalPharmacy !== undefined)
      hospital.hasInternalPharmacy = req.body.hasInternalPharmacy;
    if (clinicSubtype !== undefined) hospital.clinicSubtype = clinicSubtype;
    if (customServices !== undefined) hospital.customServices = customServices;
    if (features !== undefined) hospital.features = features;

    // Modules and landing content are Mixed paths — assign the whole normalized
    // object and mark it, because Mongoose cannot see changes inside a Mixed
    // value and would otherwise save nothing at all.
    if (req.body.modules !== undefined) {
      const effectiveType = type !== undefined ? type : hospital.type;
      hospital.modules = normalizeModules(req.body.modules, effectiveType);
      hospital.markModified('modules');
      // Re-derive the legacy booleans unless this same request set them itself.
      const flags = reconcileLegacyFlags(hospital.modules, req.body);
      hospital.hasInternalLab = flags.hasInternalLab;
      hospital.hasInternalPharmacy = flags.hasInternalPharmacy;
    }
    if (req.body.landing !== undefined) {
      hospital.landing = normalizeLanding(req.body.landing);
      hospital.markModified('landing');
    }

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
    const doctorIds = doctors.map((d) => d._id);

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
/**
 * Every facility, in full, for the admin panel.
 *
 * The public `/chat/hospitals` list is deliberately slim — it exists to fill
 * directory cards and sign-in dropdowns, and shipping every facility's landing
 * copy to those screens cost 554 KB at 200 facilities. The admin edit form is
 * the one screen that genuinely needs the whole record (module map, landing
 * content, colours), and it is behind the admin secret, so it gets its own
 * endpoint rather than making eight public screens pay for it.
 */
router.get('/super-admin/hospitals', verifyAdminSecret, async (req, res) => {
  try {
    const hospitals = await Hospital.find({});
    res.json(hospitals);
  } catch (error) {
    console.error('Super admin hospital list error:', error);
    res.status(500).json({ message: 'Server error fetching facilities' });
  }
});

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
    const {
      name,
      email,
      department,
      specialization,
      doctorType,
      currentRoom,
      availabilityStatus,
      averageCheckupTime,
      dailyTokenLimit,
      password
    } = req.body;

    const doctor = await Doctor.findById(id);
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });

    if (doctorType !== undefined && !DOCTOR_TYPES.includes(doctorType)) {
      return res.status(400).json({ message: `Doctor type must be one of: ${DOCTOR_TYPES.join(', ')}.` });
    }

    if (name) doctor.name = name;
    if (email) doctor.email = email;
    if (department) doctor.department = department;
    if (specialization !== undefined) doctor.specialization = specialization;
    if (doctorType) doctor.doctorType = doctorType;
    if (currentRoom) doctor.currentRoom = currentRoom;
    if (availabilityStatus) doctor.availabilityStatus = availabilityStatus;
    if (averageCheckupTime !== undefined && !isNaN(parseInt(averageCheckupTime))) {
      doctor.averageCheckupTime = Math.max(1, parseInt(averageCheckupTime));
    }
    if (dailyTokenLimit !== undefined && !isNaN(parseInt(dailyTokenLimit))) {
      doctor.dailyTokenLimit = Math.max(0, parseInt(dailyTokenLimit));
    }
    // Public profile fields — only the ones this request actually mentioned, so
    // editing a cabin number never silently blanks a doctor's qualifications.
    Object.assign(doctor, normalizeDoctorProfile(req.body));
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

// POST Clear all demo/sample data.
//
// This endpoint empties EVERY collection for EVERY facility: hospitals, staff,
// patients, tokens and the archive that would otherwise be the only remaining
// record of them. Its name says "demo data", but nothing about it is limited to
// demo data — it is an unrecoverable wipe of the entire platform behind a route
// that reads as housekeeping.
//
// It exists because seeding a clean slate during development is genuinely
// useful. That value disappears the moment a real facility's patients are in the
// database, so production refuses it outright rather than relying on nobody ever
// pointing it at the wrong deployment. Removing tenants in production is done
// one facility at a time, deliberately, through the per-facility endpoints.
//
// Outside production the caller must still name what they are destroying, so the
// request cannot be replayed from history or fired by a stray click.
router.post('/super-admin/clear-demo-data', verifyAdminSecret, async (req, res) => {
  if (isProduction()) {
    logger.error('[SUPER-ADMIN] Refused platform wipe in production', { ip: req.ip });
    return res.status(403).json({
      message:
        'Refused: this endpoint erases every facility on the platform and is disabled in production. ' +
        'Delete facilities individually instead.'
    });
  }

  if (req.body.confirm !== 'DELETE ALL PLATFORM DATA') {
    return res.status(400).json({
      message:
        'Refused: this erases every facility, patient and archive on this deployment. ' +
        'Send { "confirm": "DELETE ALL PLATFORM DATA" } if that is genuinely what you want.'
    });
  }

  try {
    const Patient = require('../models/Patient');
    const ChatSession = require('../models/ChatSession');
    const ArchivedToken = require('../models/ArchivedToken');
    const Reminder = require('../models/Reminder');
    const Token = require('../models/Token');
    const Queue = require('../models/Queue');

    // `allTenants` is required by the tenant guard on every one of these. The
    // intent here really is platform-wide, and saying so is what distinguishes it
    // from the forgotten-filter bug the guard exists to catch.
    const everyTenant = { allTenants: true };

    await Hospital.deleteMany({});
    await Doctor.deleteMany({}, everyTenant);
    await Staff.deleteMany({}, everyTenant);
    await LabAssistant.deleteMany({}, everyTenant);
    await Pharmacist.deleteMany({}, everyTenant);
    await Queue.deleteMany({});
    await Token.deleteMany({}, everyTenant);
    await Patient.deleteMany({}, everyTenant);
    await ChatSession.deleteMany({});
    await ArchivedToken.deleteMany({}, everyTenant);
    await Reminder.deleteMany({}, everyTenant);

    logger.warn('[SUPER-ADMIN] Platform data cleared', { ip: req.ip });

    if (req.io) {
      req.io.emit('queue-reset');
    }

    res.json({
      message: 'All data cleared on this non-production deployment.'
    });
  } catch (error) {
    logger.error('[SUPER-ADMIN] Clear demo data failed', { err: error.message });
    res.status(500).json({ message: 'Server error clearing demo data' });
  }
});

module.exports = router;
