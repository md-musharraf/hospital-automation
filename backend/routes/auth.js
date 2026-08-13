const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Doctor = require('../models/Doctor');
const Staff = require('../models/Staff');
const LabAssistant = require('../models/LabAssistant');
const Pharmacist = require('../models/Pharmacist');
const Hospital = require('../models/Hospital');
const FacilityCredential = require('../models/FacilityCredential');
const Queue = require('../models/Queue');
const { JWT_SECRET, authenticateToken } = require('../middleware/auth');
const {
  scopesForFacility,
  rejectWeakPassword,
  facilityTokenClaims,
  PASSWORD_MIN_LENGTH
} = require('../utils/facilityAuth');
const {
  FACILITY_TYPE_RULES,
  FACILITY_MODULES,
  LANDING_TEMPLATES,
  normalizeModules,
  normalizeLanding,
  normalizeDoctorProfile,
  reconcileLegacyFlags,
  legacyModulesFrom,
  defaultCoverFor
} = require('../utils/facilityProfile');
const { safeCompare, isProduction } = require('../utils/env');
const logger = require('../utils/logger');
// Keyed by IP *and* account, so one reception desk's staff do not share a single
// ten-attempt budget between them. See middleware/rateLimits.js.
const { loginLimiter } = require('../middleware/rateLimits');

/**
 * The facility session — everything the console needs to draw itself.
 *
 * Never includes the credential: the hash lives in its own collection and is
 * read only by the sign-in handler below. See models/FacilityCredential.js.
 */
function facilitySession(facility) {
  return {
    role: 'facility',
    hospital: facility.id,
    id: facility.id,
    name: facility.name,
    type: facility.type,
    city: facility.city,
    logoUrl: facility.logoUrl || '',
    primaryColor: facility.primaryColor,
    secondaryColor: facility.secondaryColor,
    modules: facility.modules || {},
    // Which consoles this facility runs. The console renders one tab per scope,
    // and the API enforces the same list — so a lab never sees a cabin tab it
    // would only be refused at.
    scopes: scopesForFacility(facility)
  };
}

/** The cabin roster: who this facility's OPD tab can be operated as. */
async function doctorRoster(hospitalId) {
  const doctors = await Doctor.find({ hospital: hospitalId }).select('-passwordHash');
  return doctors.map((d) => ({
    id: d._id,
    _id: d._id,
    name: d.name,
    email: d.email,
    hospital: d.hospital,
    department: d.department,
    specialization: d.specialization,
    doctorType: d.doctorType,
    currentRoom: d.currentRoom,
    availabilityStatus: d.availabilityStatus,
    averageCheckupTime: d.averageCheckupTime,
    dailyTokenLimit: d.dailyTokenLimit,
    photoUrl: d.photoUrl || ''
  }));
}

/**
 * Facility sign-in — the only login this platform has (rate-limited).
 *
 * One credential per facility opens reception, the cabins, the lab bench and the
 * pharmacy counter. There used to be four endpoints here, one per role, which
 * meant a four-person clinic was handed four passwords and kept all four on the
 * same sticky note. See utils/facilityAuth.js for the reasoning.
 *
 * The facility id is public — it is in the directory and the sign-in picker —
 * so the password is the whole secret, and the endpoint is rate-limited by IP
 * *and* account accordingly (middleware/rateLimits.js).
 */
router.post('/facility/login', loginLimiter, async (req, res) => {
  try {
    const { hospital, password } = req.body;
    if (!hospital || !password) {
      return res.status(400).json({ message: 'Choose your facility and enter its password.' });
    }

    const facility = await Hospital.findOne({ id: hospital });
    if (!facility) {
      return res.status(401).json({ message: 'Invalid facility or password.' });
    }

    const credential = await FacilityCredential.findOne({ hospital });
    if (!credential) {
      // Deliberately specific. A facility whose password was never set is not a
      // wrong-password case, and telling reception "invalid password" would send
      // them round a loop they cannot exit — the owner has to act, and they need
      // to be told that. Nothing secret is revealed: the facility's existence is
      // already public in the directory.
      return res.status(403).json({
        message:
          'This facility has no password yet. Ask the platform owner to set one from the owner console.'
      });
    }

    const isMatch = await bcrypt.compare(password, credential.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid facility or password.' });
    }

    const token = jwt.sign(facilityTokenClaims(facility), JWT_SECRET, { expiresIn: '12h' });

    res.json({
      token,
      user: facilitySession(facility),
      doctors: await doctorRoster(facility.id)
    });
  } catch (error) {
    logger.error('[AUTH] Facility login failed', { err: error.message });
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * The current session, re-read from the database.
 *
 * The console calls this on load so a facility that had a module switched on (or
 * a doctor added) since sign-in sees it without anyone signing out. The token's
 * scopes still govern what the API will allow until it expires — this is what
 * the screen shows, not what the server permits.
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'facility') {
      return res.status(400).json({ message: 'Not a facility session. Sign in again.' });
    }

    const facility = await Hospital.findOne({ id: req.user.hospital });
    if (!facility) return res.status(404).json({ message: 'Facility not found' });

    res.json({
      user: facilitySession(facility),
      doctors: await doctorRoster(facility.id)
    });
  } catch (error) {
    logger.error('[AUTH] Session read failed', { err: error.message });
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Take a cabin.
 *
 * The facility console posts the doctor it is about to work as, and gets back a
 * token that is its own session plus one claim: which cabin. Everything else —
 * tenant, scopes, expiry — is carried over unchanged, so this grants nothing the
 * facility did not already have. It is a narrowing, not an escalation.
 *
 * Why a token and not a header: the doctor console makes eighteen calls that
 * already send an Authorization header and nothing else. Putting the cabin in
 * the token meant none of them had to learn about a second header, and it means
 * a reload cannot land in a state where the console thinks it is in a cabin and
 * the server does not.
 *
 * Switching doctor is simply asking for another one.
 */
router.post('/facility/cabin', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'facility') {
      return res.status(403).json({ message: 'Facility session required' });
    }
    if (!Array.isArray(req.user.scopes) || !req.user.scopes.includes('doctor')) {
      return res.status(403).json({ message: 'This facility does not run an OPD.' });
    }

    const { doctorId } = req.body;
    if (!doctorId) return res.status(400).json({ message: 'Choose a doctor to work as.' });

    // The tenant check that makes this safe: only this facility's own doctors.
    const doctor = await Doctor.findOne({ _id: doctorId, hospital: req.user.hospital });
    if (!doctor) {
      return res.status(403).json({ message: 'That doctor does not work at this facility.' });
    }

    const facility = await Hospital.findOne({ id: req.user.hospital });
    if (!facility) return res.status(404).json({ message: 'Facility not found' });

    const token = jwt.sign(
      { ...facilityTokenClaims(facility), actingDoctor: String(doctor._id) },
      JWT_SECRET,
      {
        expiresIn: '12h'
      }
    );

    res.json({
      token,
      doctor: {
        id: doctor._id,
        _id: doctor._id,
        name: doctor.name,
        email: doctor.email,
        hospital: doctor.hospital,
        department: doctor.department,
        specialization: doctor.specialization,
        currentRoom: doctor.currentRoom,
        availabilityStatus: doctor.availabilityStatus,
        averageCheckupTime: doctor.averageCheckupTime,
        dailyTokenLimit: doctor.dailyTokenLimit,
        role: 'doctor'
      }
    });
  } catch (error) {
    logger.error('[AUTH] Cabin token mint failed', { err: error.message });
    res.status(500).json({ message: 'Server error opening that cabin' });
  }
});

/**
 * The facility's own team directory — the cabins, the desks, the bench and the
 * counter, as people rather than as accounts.
 *
 * None of these carry a password any more. They exist so the console can say
 * "Dr. Sharma, Cabin 3" instead of an id, and so the owner can see who works
 * where. Nothing here is a credential.
 */
router.get('/facility/team', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'facility') {
      return res.status(403).json({ message: 'Facility session required' });
    }
    const hospital = req.user.hospital;
    const [staff, labAssistants, pharmacists] = await Promise.all([
      Staff.find({ hospital }).select('-passwordHash'),
      LabAssistant.find({ hospital }).select('-passwordHash'),
      Pharmacist.find({ hospital }).select('-passwordHash')
    ]);

    res.json({
      doctors: await doctorRoster(hospital),
      staff: staff.map((s) => ({ id: s._id, name: s.name, counterNumber: s.counterNumber })),
      labAssistants: labAssistants.map((l) => ({ id: l._id, name: l.name })),
      pharmacists: pharmacists.map((p) => ({ id: p._id, name: p.name, counterNumber: p.counterNumber }))
    });
  } catch (error) {
    logger.error('[AUTH] Team read failed', { err: error.message });
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

    // The one credential this facility will ever sign in with. Checked before
    // anything is written, so a rejected password cannot leave a half-created
    // tenant behind — and there is no fallback if it is missing, because a
    // default password set at onboarding is a default password forever.
    const weak = rejectWeakPassword(b.password);
    if (weak) return res.status(400).json({ message: weak });

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

    // Normalize personnel: accept either the ARRAY form (doctors[],
    // staffMembers[], labAssistants[], pharmacists[]) or the legacy single-entry
    // fields, so an admin can onboard "2-3 doctors, a lab tech, a pharmacist" in
    // ONE registration.
    //
    // None of these are accounts any more — they are the facility's people. The
    // whole tenant signs in with the one facility password validated above; a
    // doctor is chosen inside the console, not authenticated at the door. Any
    // `password` still posted by an older admin panel is ignored rather than
    // rejected, so an in-flight form does not 400 on a field that no longer
    // means anything.
    const doctors =
      Array.isArray(b.doctors) && b.doctors.length
        ? b.doctors
        : b.docEmail
          ? [
              {
                name: b.docName,
                email: b.docEmail,
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
        : b.staffName || b.staffUsername
          ? [{ name: b.staffName, counterNumber: b.counterNumber }]
          : [];

    const labAssistants = hasInternalLab
      ? Array.isArray(b.labAssistants) && b.labAssistants.length
        ? b.labAssistants
        : b.labName || b.labUsername
          ? [{ name: b.labName }]
          : []
      : [];

    const pharmacists = hasInternalPharmacy
      ? Array.isArray(b.pharmacists) && b.pharmacists.length
        ? b.pharmacists
        : b.pharmName || b.pharmUsername
          ? [{ name: b.pharmName, counterNumber: b.pharmCounter }]
          : []
      : [];

    const typeRule = FACILITY_TYPE_RULES[type];
    if (!typeRule) {
      return res.status(400).json({
        message: `Unknown facility type '${type}'. Choose one of: ${Object.keys(FACILITY_TYPE_RULES).join(', ')}.`
      });
    }

    // What made a facility operable used to be "has at least one account of the
    // right kind" — a Lab with no lab login was a tenant nobody could sign into.
    // With one credential per facility that check has moved: the facility
    // password is what makes it signable, and `normalizeModules` already refuses
    // to switch off the unit its type requires. So a hospital can be onboarded
    // today and have its doctors entered tomorrow, which is how onboarding
    // actually goes.

    // A doctor is identified by email within the tenant (it is the unique index),
    // so duplicates within one request still have to be caught here.
    const seenDoctorEmails = new Set();
    for (const d of doctors) {
      if (!d.email)
        return res.status(400).json({ message: 'Every doctor needs an email — it identifies the cabin.' });
      if (seenDoctorEmails.has(d.email))
        return res.status(400).json({ message: `Duplicate doctor email '${d.email}' in this registration.` });
      seenDoctorEmails.add(d.email);
    }

    // Check if facility ID or slug is already taken
    const existingHospital = await Hospital.findOne({ $or: [{ id }, { slug }] });
    if (existingHospital) {
      return res.status(400).json({ message: 'Facility ID or Slug is already registered.' });
    }

    // Doctors are still keyed by email within the tenant — that unique index is
    // what stops the same cabin being entered twice. The other three kinds carry
    // no unique identifier any more, so there is nothing left to collide.
    for (const d of doctors) {
      if (await Doctor.findOne({ email: d.email, hospital: id }))
        return res
          .status(400)
          .json({ message: `Doctor email '${d.email}' is already registered in this facility.` });
    }

    // Create the facility
    const newHospital = new Hospital({
      id,
      name,
      slug,
      address,
      phone,
      whatsappNumber,
      // A facility that uploads nothing still gets a picture that looks like the
      // kind of place it is. This used to be one hardcoded Unsplash photo for
      // every tenant, so a pharmacy, a pathology lab and a district hospital all
      // opened with the same stock ward — on a product whose pitch is that every
      // facility gets its own page.
      coverImage: coverImage || defaultCoverFor(type),
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

    // The facility's one credential. Written straight after the facility itself,
    // before any personnel, so the tenant is signable from the moment it exists.
    await new FacilityCredential({
      hospital: id,
      passwordHash: await bcrypt.hash(b.password, 10),
      setBy: 'owner'
    }).save();

    // Everyone who works here. Names and rooms — no usernames, no passwords.
    const created = { staff: [], doctors: [], labAssistants: [], pharmacists: [] };

    for (const s of staffMembers) {
      const doc = new Staff({
        name: s.name || 'Reception Staff',
        counterNumber: s.counterNumber || 'Counter 1',
        hospital: id
      });
      await doc.save();
      created.staff.push(doc.name);
    }
    for (const d of doctors) {
      const doc = new Doctor(buildDoctorFields(d, id));
      await doc.save();
      await new Queue({ doctor: doc._id, currentToken: null, activeQueue: [] }).save();
      created.doctors.push(doc.email);
    }
    for (const l of labAssistants) {
      const doc = new LabAssistant({ name: l.name || 'Lab Assistant', hospital: id });
      await doc.save();
      created.labAssistants.push(doc.name);
    }
    for (const p of pharmacists) {
      const doc = new Pharmacist({
        name: p.name || 'Pharmacist',
        counterNumber: p.counterNumber || 'Pharmacy Counter',
        hospital: id
      });
      await doc.save();
      created.pharmacists.push(doc.name);
    }

    res.status(201).json({
      message:
        `Facility '${name}' registered. Its people can sign in at /login by choosing ${name} ` +
        `and entering the facility password you just set — ${scopesForFacility(newHospital).join(', ')} ` +
        `consoles all open from it.`,
      hospital: newHospital,
      scopes: scopesForFacility(newHospital),
      created
    });
  } catch (error) {
    console.error('Super admin hospital registration error:', error);
    res.status(500).json({ message: 'Server error registering hospital' });
  }
});

/**
 * Set (or reset) a facility's one password.
 *
 * This is the only way a facility becomes signable. Onboarding calls the same
 * code path; this endpoint is what an owner uses afterwards — when a
 * receptionist leaves, when a facility asks, or when a tenant registered before
 * single sign-in and has no credential row at all.
 *
 * Resetting is immediate and total: every person at that facility signs in with
 * the new password from the next shift. Tokens already issued stay valid until
 * they expire (12h), which is deliberate — cutting off a console mid-consultation
 * to enforce a password change is worse than the few hours of overlap.
 */
router.put('/super-admin/hospital/:id/password', verifyAdminSecret, async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    const facility = await Hospital.findOne({ id });
    if (!facility) return res.status(404).json({ message: 'Facility not found' });

    const weak = rejectWeakPassword(password);
    if (weak) return res.status(400).json({ message: weak });

    const passwordHash = await bcrypt.hash(password, 10);
    const existing = await FacilityCredential.findOne({ hospital: id });

    if (existing) {
      existing.passwordHash = passwordHash;
      existing.setAt = new Date();
      existing.setBy = 'owner';
      await existing.save();
    } else {
      await new FacilityCredential({ hospital: id, passwordHash, setBy: 'owner' }).save();
    }

    logger.warn('[SUPER-ADMIN] Facility password set', { hospital: id, ip: req.ip });

    res.json({
      message: existing
        ? `Password reset for '${facility.name}'. Everyone there signs in with the new one from now on.`
        : `Password set for '${facility.name}'. It can now be signed into.`,
      hospital: id,
      hasPassword: true,
      scopes: scopesForFacility(facility)
    });
  } catch (error) {
    logger.error('[SUPER-ADMIN] Facility password set failed', { err: error.message });
    res.status(500).json({ message: 'Server error setting the facility password' });
  }
});

/**
 * Which facilities can actually be signed into.
 *
 * The owner console draws a warning badge from this. A facility onboarded before
 * single sign-in — or one created by an older admin panel — has no credential
 * row and is therefore unreachable by its own staff, which is invisible from
 * every other screen. Hashes are never included: only whether one exists.
 */
router.get('/super-admin/facility-credentials', verifyAdminSecret, async (req, res) => {
  try {
    const rows = await FacilityCredential.find({}, null, { allTenants: true });
    res.json(
      rows.reduce((acc, row) => {
        acc[row.hospital] = { hasPassword: true, setAt: row.setAt, setBy: row.setBy };
        return acc;
      }, {})
    );
  } catch (error) {
    logger.error('[SUPER-ADMIN] Credential status read failed', { err: error.message });
    res.status(500).json({ message: 'Server error reading credential status' });
  }
});

/**
 * Add one person to a facility — a doctor, a receptionist, a lab tech, a
 * pharmacist.
 *
 * This replaces four near-identical `register-<role>` endpoints. They were four
 * because each created a login account with its own username and password; now
 * that nobody has a personal credential, the only real difference between them
 * is which collection the row lands in and which fields it carries. One endpoint
 * with a `kind` is that difference, stated once.
 */
const PERSON_KINDS = {
  doctor: { label: 'Doctor', model: Doctor },
  staff: { label: 'Reception', model: Staff },
  lab: { label: 'Lab', model: LabAssistant },
  pharmacy: { label: 'Pharmacy', model: Pharmacist }
};

router.post('/super-admin/facility/:id/people', verifyAdminSecret, async (req, res) => {
  try {
    const { id } = req.params;
    const { kind, name } = req.body;

    const spec = PERSON_KINDS[kind];
    if (!spec) {
      return res
        .status(400)
        .json({ message: `Unknown kind '${kind}'. Choose one of: ${Object.keys(PERSON_KINDS).join(', ')}.` });
    }

    const facility = await Hospital.findOne({ id });
    if (!facility) return res.status(404).json({ message: 'Selected facility does not exist' });

    if (kind === 'doctor') {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ message: 'A doctor needs an email — it identifies the cabin.' });
      }
      if (await Doctor.findOne({ email, hospital: id })) {
        return res.status(400).json({ message: `Doctor email '${email}' already exists in this facility.` });
      }

      // Same normalization as onboarding, so a doctor added later carries
      // exactly the same fields as one created during registration.
      const doctor = new Doctor(buildDoctorFields(req.body, id));
      await doctor.save();
      await new Queue({ doctor: doctor._id, currentToken: null, activeQueue: [] }).save();

      facility.doctorCount = (facility.doctorCount || 0) + 1;
      await facility.save();

      return res.status(201).json({
        message: `${doctor.doctorType} '${doctor.name}' added. They appear in the facility console's cabin picker.`,
        person: { id: doctor._id, kind, name: doctor.name, email: doctor.email }
      });
    }

    if (!name) {
      return res.status(400).json({ message: `A ${spec.label.toLowerCase()} entry needs a name.` });
    }

    const fields = { name, hospital: id };
    if (kind === 'staff') fields.counterNumber = req.body.counterNumber || 'Counter 1';
    if (kind === 'pharmacy') fields.counterNumber = req.body.counterNumber || 'Pharmacy Counter';

    const person = new spec.model(fields);
    await person.save();

    res.status(201).json({
      message: `${spec.label} '${name}' added to ${facility.name}.`,
      person: { id: person._id, kind, name: person.name, counterNumber: person.counterNumber }
    });
  } catch (error) {
    logger.error('[SUPER-ADMIN] Add person failed', { err: error.message });
    res.status(500).json({ message: 'Server error adding this person' });
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
    // The credential goes with the tenant. A leftover row would make the facility
    // id un-reusable in a way nothing on screen explains.
    await FacilityCredential.deleteMany({ hospital: id });

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
      dailyTokenLimit
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
    const { name, counterNumber } = req.body;

    const staff = await Staff.findById(id);
    if (!staff) return res.status(404).json({ message: 'Staff member not found' });

    if (name) staff.name = name;
    if (counterNumber) staff.counterNumber = counterNumber;

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
    const { name } = req.body;

    const lab = await LabAssistant.findById(id);
    if (!lab) return res.status(404).json({ message: 'Lab Assistant not found' });

    if (name) lab.name = name;

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
    const { name, counterNumber } = req.body;

    const pharmacist = await Pharmacist.findById(id);
    if (!pharmacist) return res.status(404).json({ message: 'Pharmacist not found' });

    if (name) pharmacist.name = name;
    if (counterNumber) pharmacist.counterNumber = counterNumber;

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
    await FacilityCredential.deleteMany({}, everyTenant);
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
