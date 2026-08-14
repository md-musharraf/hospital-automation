const express = require('express');
const router = express.Router();
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const Token = require('../models/Token');
const Queue = require('../models/Queue');
const Reminder = require('../models/Reminder');
const Invoice = require('../models/Invoice');
const { processPendingReminders } = require('../utils/reminderHelper');
const { startOfToday } = require('../utils/dates');
const { authenticateToken, ensureRole } = require('../middleware/auth');

// Role guard for this router (see middleware/auth.js).
const ensureStaff = ensureRole('staff');
const {
  recalculateQueueTimes,
  formatApptTime,
  insertTokenByPriority,
  isDoctorFull
} = require('../utils/queueHelper');
const { sendWhatsAppNotification } = require('../utils/whatsappHelper');
const { generateUniqueTokenNumber, saveTokenWithRetry } = require('../utils/tokenHelper');
const { classifySymptoms, pickLeastBusyDoctor, detectPriorityCategory } = require('../utils/triageHelper');
const { logActivity, announceJourney } = require('../utils/realtime');
const { setStage, deriveStage } = require('../utils/journeyHelper');
const logger = require('../utils/logger');
const { normalizePhone, parseBody, field } = require('@careeai/shared');
const { findPatientByPhone, findPhoneConflict } = require('../utils/patientLookup');

// GET all live queues for doctors in the staff member's hospital (Staff Overview)
router.get('/queues', authenticateToken, ensureStaff, async (req, res) => {
  try {
    const doctors = await Doctor.find({ hospital: req.user.hospital });
    const docIds = doctors.map((d) => d._id);

    const queues = await Queue.find({ doctor: { $in: docIds } })
      .populate('doctor', '-passwordHash')
      .populate('currentToken')
      .populate({
        path: 'activeQueue',
        populate: { path: 'patient' }
      });
    res.json(queues);
  } catch (error: any) {
    logger.error('Error fetching queues', { err: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// POST walk-in token generation
router.post('/tokens/walk-in', authenticateToken, ensureStaff, async (req, res) => {
  try {
    // Thirty lines of hand-rolled checks used to live here, and they VALIDATED
    // without NORMALIZING: `phone` was length-checked and then stored exactly as
    // reception typed it, `gender` had to be capitalized the way the enum was
    // written, and `parseInt(age)` turned "61 years" into 61 and "" into NaN.
    //
    // The spec below both validates and canonicalizes, so what comes out is the
    // stored form: `phone` is `+91XXXXXXXXXX`, `age` is a number, `gender` is
    // the schema's casing however it was typed, and every bad field is reported
    // at once instead of one per round trip.
    //
    // doctorId is OPTIONAL — leave it blank and the system auto-triages the
    // walk-in to the right department + least-busy doctor (see below).
    const parsed = parseBody(req.body, {
      name: field.name({ label: 'Patient name', min: 2, max: 100 }),
      age: field.int({ min: 1, max: 130 }),
      gender: field.enum(['Male', 'Female', 'Other']),
      phone: field.phone(),
      symptoms: field.text({ max: 1000 }),
      doctorId: field.id({ required: false, label: 'Doctor' }),
      tokenType: field.enum(['Regular', 'Emergency', 'Re-visit'], { required: false }),
      priorityCategory: field.enum(['None', 'Senior', 'Pregnant', 'Disabled'], { required: false })
    });
    if (!parsed.ok) {
      return res.status(400).json({ message: parsed.error, errors: parsed.errors });
    }
    const { name, gender, phone, symptoms, doctorId, tokenType, priorityCategory } = parsed.value;
    // Kept under its old name so the ~40 references below it did not all have
    // to change; it is now genuinely an integer rather than parseInt's guess.
    const parsedAge = parsed.value.age;

    // Find or create patient within staff's hospital tenant.
    //
    // Looked up through the shared helper rather than `findOne({ phone })`:
    // reception typing "98765 43210" for a patient the chat engine already
    // stored as "+919876543210" used to miss, create a second record, and
    // split that patient's visit history in half.
    const staffHosp = req.user.hospital || 'general-hospital';
    let patient = await findPatientByPhone(staffHosp, phone);
    if (!patient) {
      patient = new Patient({ name, age: parsedAge, gender, phone, hospital: staffHosp });
    } else {
      patient.visitCount += 1;
      patient.name = name; // Update name/age/gender if changed
      patient.age = parsedAge;
      patient.gender = gender;
    }
    await patient.save();

    // Resolve the doctor. If reception explicitly chose one, honor it (tenant-checked).
    // Otherwise SMART AUTO-TRIAGE: read the symptoms, route to the right department,
    // and pick the LEAST-BUSY doctor — so the counter never has to sort walk-ins by
    // hand. Red-flag symptoms also auto-escalate the token to Emergency priority.
    let doctor;
    let effectiveTokenType = tokenType || 'Regular';
    let autoTriaged = false;
    let triagedDepartment = null;
    if (doctorId) {
      doctor = await Doctor.findById(doctorId);
      if (!doctor || doctor.hospital !== staffHosp) {
        return res.status(404).json({ message: 'Doctor not found in this hospital tenant' });
      }
    } else {
      // TENANT ISOLATION: only ever consider THIS facility's own doctors.
      let facilityDoctors = await Doctor.find({
        hospital: staffHosp,
        availabilityStatus: { $ne: 'Unavailable' }
      });
      if (!facilityDoctors || facilityDoctors.length === 0) {
        facilityDoctors = await Doctor.find({ hospital: staffHosp });
      }
      if (!facilityDoctors || facilityDoctors.length === 0) {
        return res.status(404).json({ message: 'No doctors are registered for this facility yet' });
      }
      const triage = classifySymptoms(symptoms);
      if (triage.urgency === 'Emergency' && effectiveTokenType !== 'Emergency') {
        effectiveTokenType = 'Emergency';
      }
      const picked = await pickLeastBusyDoctor(facilityDoctors, triage.department);
      doctor = picked.doctor;
      if (!doctor) {
        return res.status(404).json({ message: 'Could not auto-assign a doctor for these symptoms' });
      }
      autoTriaged = true;
      triagedDepartment = picked.matchedDepartment
        ? triage.department
        : doctor.department || triage.department;
    }
    const resolvedDoctorId = doctor._id;

    // OPD capacity cutoff — block a Regular/Re-visit walk-in once the doctor hits the
    // daily token limit (Emergencies always bypass). Reception is told immediately so
    // the patient can be redirected instead of joining a line for a token that's gone.
    if (effectiveTokenType !== 'Emergency' && (await isDoctorFull(doctor))) {
      return res.status(409).json({
        message: `Today's OPD token limit is full for ${doctor.name}. Please book for tomorrow or route to another doctor/facility.`,
        opdFull: true
      });
    }

    // Vulnerable-group priority: explicit reception choice, else auto Senior/Pregnant.
    const resolvedPriority =
      priorityCategory && priorityCategory !== 'None'
        ? priorityCategory
        : detectPriorityCategory({ age: parsedAge, symptoms });

    // Generate unique token number (collision-free)
    const tokenNumber = await generateUniqueTokenNumber(staffHosp);

    const token = new Token({
      tokenNumber,
      hospital: staffHosp,
      status: 'Waiting',
      tokenType: effectiveTokenType,
      priorityCategory: resolvedPriority || 'None',
      bookingSource: 'Reception',
      patient: patient._id,
      doctor: resolvedDoctorId,
      symptoms
    });
    await saveTokenWithRetry(token);

    // Add token to Queue at the correct priority position
    let queue = await Queue.findOne({ doctor: resolvedDoctorId });
    if (!queue) {
      queue = new Queue({ doctor: resolvedDoctorId, activeQueue: [] });
    }

    await insertTokenByPriority(queue, token);
    await queue.save();

    // Recalculate wait times
    await recalculateQueueTimes(resolvedDoctorId);

    // Trigger Web Push Notification to Doctor
    try {
      const pushHelper = require('../utils/pushHelper');
      if (effectiveTokenType === 'Emergency') {
        await pushHelper.notifyByRole('Doctor', {
          title: '🚨 EMERGENCY SOS WALKIN',
          body: `Emergency Alert: Patient ${name} has been placed at the front of your queue!`,
          icon: '/icon.svg',
          url: '/'
        });
      } else {
        await pushHelper.notifyByRole('Doctor', {
          title: 'New Patient Walk-in 📋',
          body: `${name} has been added to your queue with token ${tokenNumber}.`,
          icon: '/icon.svg',
          url: '/'
        });
      }
    } catch (err: any) {
      logger.error('Push notification failed to doctor', { err: err });
    }

    // Broadcast update
    if (req.io) {
      req.io.to('queue:global').emit('queue-updated', { doctorId: resolvedDoctorId });
      req.io.to(`doctor:${resolvedDoctorId}`).emit('queue-updated');
    }

    const createdToken = await Token.findById(token._id).populate('patient').populate('doctor');

    // Auto alert message: WhatsApp booking confirmation for Walk-in Patient.
    // Capture the real dispatch result so reception can see when a message did
    // NOT actually reach the patient (e.g. an expired Meta access token returns
    // { status: 'failed' }) instead of silently assuming it was delivered.
    let whatsapp = { status: 'skipped', reason: 'no_phone_on_file' };
    if (createdToken.patient && createdToken.patient.phone) {
      const docName = createdToken.doctor ? createdToken.doctor.name : 'Doctor';
      const roomName = createdToken.doctor ? createdToken.doctor.currentRoom || 'Cabin A' : 'Cabin A';
      const apptTime = formatApptTime(createdToken.estimatedWaitTime || 0);
      const walkInMsg = `Hello ${createdToken.patient.name}, your token ${createdToken.tokenNumber} is generated for ${docName} in ${roomName}. Your approx. turn: ${apptTime} (~${createdToken.estimatedWaitTime || 0} min).\n\n✅ No need to wait in line — we will WhatsApp you when your turn is near.\n🔔 लाइन में खड़े होने की ज़रूरत नहीं — आपकी बारी पास आते ही हम WhatsApp कर देंगे।`;
      try {
        whatsapp = await sendWhatsAppNotification(createdToken.patient.phone, walkInMsg);
      } catch (waErr: any) {
        logger.error('Walk-in WhatsApp dispatch error', { err: waErr });
        whatsapp = { status: 'failed', reason: waErr.message };
      }
    }

    // Feed line so the whole facility sees the new arrival — the doctor's console,
    // the lab's screen and the manager's overview all pick it up without polling.
    await logActivity(req.io, {
      hospital: req.user.hospital || 'general-hospital',
      type: 'token-created',
      role: 'staff',
      actor: req.user.username || 'Reception',
      message: `Walk-in ${createdToken.tokenNumber} registered for ${createdToken.doctor ? createdToken.doctor.name : 'a doctor'}${autoTriaged ? ` (auto-triaged → ${triagedDepartment})` : ''}${resolvedPriority && resolvedPriority !== 'None' ? ` — ${resolvedPriority} priority` : ''}.`,
      tokenNumber: createdToken.tokenNumber,
      refId: createdToken._id,
      severity: createdToken.tokenType === 'Emergency' ? 'critical' : 'info'
    });

    res.status(201).json({
      message: 'Walk-in token generated successfully',
      token: createdToken,
      whatsapp,
      autoTriaged,
      triagedDepartment,
      priorityCategory: resolvedPriority || 'None'
    });
  } catch (error: any) {
    logger.error('Error booking walk-in', { err: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT override token to Emergency SOS
router.put('/tokens/:tokenId/override', authenticateToken, ensureStaff, async (req, res) => {
  try {
    const { tokenId } = req.params;
    const staffHosp = req.user.hospital || 'general-hospital';
    const token = await Token.findById(tokenId);
    if (!token || token.hospital !== staffHosp) {
      return res.status(404).json({ message: 'Token not found in this hospital tenant' });
    }

    if (token.tokenType === 'Emergency') {
      return res.status(400).json({ message: 'Token is already marked as Emergency' });
    }

    // Update token details
    token.tokenType = 'Emergency';
    await token.save();

    // Re-order Doctor's Queue
    const queue = await Queue.findOne({ doctor: token.doctor });
    if (queue) {
      // Verify token is in activeQueue and not currentToken in cabin
      if (queue.currentToken && queue.currentToken.toString() === tokenId) {
        return res
          .status(400)
          .json({ message: 'Token is already currently inside the cabin and cannot be overridden' });
      }

      // Remove from its current position in activeQueue
      queue.activeQueue = queue.activeQueue.filter((id) => id.toString() !== tokenId);
      // Insert emergency token at index 0
      queue.activeQueue.unshift(token._id);
      await queue.save();

      // Trigger Web Push Notification to Doctor
      try {
        const pushHelper = require('../utils/pushHelper');
        await pushHelper.notifyByRole('Doctor', {
          title: '🚨 EMERGENCY SOS ESCALATION',
          body: `Patient token ${token.tokenNumber} has been upgraded to Emergency SOS!`,
          icon: '/icon.svg',
          url: '/'
        });
      } catch (err: any) {
        logger.error('Push notification failed to doctor', { err: err });
      }

      // Recalculate wait times
      await recalculateQueueTimes(token.doctor);

      // Broadcast update
      if (req.io) {
        req.io.to('queue:global').emit('queue-updated', { doctorId: token.doctor });
        req.io.to(`doctor:${token.doctor}`).emit('queue-updated');
      }
    }

    res.json({ message: 'Token successfully upgraded to Emergency SOS', token });
  } catch (error: any) {
    logger.error('Error promoting emergency', { err: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT update token status directly (Staff Override / Delay / Cancel)
router.put('/tokens/:tokenId/status', authenticateToken, ensureStaff, async (req, res) => {
  try {
    const { tokenId } = req.params;
    const { status } = req.body;
    const validStatuses = ['Waiting', 'Called', 'Active', 'Completed', 'Absent', 'Delayed'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid token status value' });
    }

    const staffHosp = req.user.hospital || 'general-hospital';
    const token = await Token.findById(tokenId);
    if (!token || token.hospital !== staffHosp) {
      return res.status(404).json({ message: 'Token not found in this hospital tenant' });
    }

    const previousStatus = token.status;
    token.status = status;
    if (
      status === 'Completed' ||
      status === 'Absent' ||
      (status === 'Delayed' && previousStatus === 'Active')
    ) {
      // Reset timestamps if needed
      if (status === 'Completed') token.completedAt = new Date();
    }
    // Keep the shared patient journey in step with a manual status override,
    // otherwise the lab/pharmacy would still show a patient who reception has
    // already closed out.
    setStage(token, status === 'Absent' ? 'Absent' : deriveStage(token), req.user.username || 'Reception');
    await token.save();

    const queue = await Queue.findOne({ doctor: token.doctor });
    if (queue) {
      // If moving away from Active, remove currentToken pointer
      if (queue.currentToken && queue.currentToken.toString() === tokenId && status !== 'Active') {
        queue.currentToken = null;
      }

      // If status is final (Completed, Absent), remove from activeQueue
      if (['Completed', 'Absent'].includes(status)) {
        queue.activeQueue = queue.activeQueue.filter((id) => id.toString() !== tokenId);
      }

      await queue.save();
      await recalculateQueueTimes(token.doctor);

      // Broadcast update
      if (req.io) {
        req.io.to('queue:global').emit('queue-updated', { doctorId: token.doctor });
        req.io.to(`doctor:${token.doctor}`).emit('queue-updated');
        req.io.to(`patient:${tokenId}`).emit('token-called', { status });
      }
    }

    await announceJourney(req.io, {
      hospital: staffHosp,
      token,
      stage: token.journeyStage,
      role: 'staff',
      actor: req.user.username || 'Reception',
      type: 'system',
      message: `${token.tokenNumber} set to ${status} by reception (was ${previousStatus}).`,
      severity: status === 'Absent' ? 'warning' : 'info'
    });

    res.json({ message: `Token status updated to ${status}`, token });
  } catch (error: any) {
    logger.error('Error updating token status', { err: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// GET fetch all reminders for the staff member's hospital tenant
router.get('/reminders', authenticateToken, ensureStaff, async (req, res) => {
  try {
    const staffHosp = req.user.hospital || 'general-hospital';
    const reminders = await Reminder.find({ hospital: staffHosp })
      .populate('patient')
      .populate('doctor')
      .populate('token')
      .sort({ createdAt: -1 });
    res.json(reminders);
  } catch (error: any) {
    logger.error('Error fetching reminders', { err: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// POST manually trigger pending reminders
router.post('/reminders/trigger', authenticateToken, ensureStaff, async (req, res) => {
  try {
    const processed = await processPendingReminders();
    res.json({ message: `Triggered reminders check successfully.`, sentReminders: processed });
  } catch (error: any) {
    logger.error('Error triggering reminders', { err: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// GET all registered patients in the staff member's hospital tenant
router.get('/patients', authenticateToken, ensureStaff, async (req, res) => {
  try {
    const staffHosp = req.user.hospital || 'general-hospital';
    const patients = await Patient.find({ hospital: staffHosp }).sort({ createdAt: -1 });
    res.json(patients);
  } catch (error: any) {
    logger.error('Error fetching patients', { err: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// POST register a new patient within staff's hospital tenant
router.post('/patients', authenticateToken, ensureStaff, async (req, res) => {
  try {
    const staffHosp = req.user.hospital || 'general-hospital';

    // Same spec as the walk-in above, for the same reason: this route and that
    // one write to the same collection, and when they validated separately they
    // disagreed — a phone accepted here in a format the walk-in canonicalized
    // is how one patient ended up in two rows.
    const parsed = parseBody(req.body, {
      name: field.name({ label: 'Patient name', min: 2, max: 100 }),
      age: field.int({ min: 1, max: 130 }),
      gender: field.enum(['Male', 'Female', 'Other']),
      phone: field.phone()
    });
    if (!parsed.ok) {
      return res.status(400).json({ message: parsed.error, errors: parsed.errors });
    }
    const { name, phone, gender } = parsed.value;
    const parsedAge = parsed.value.age;

    // Check if phone number already exists in this hospital tenant, in ANY of
    // the spellings older rows were written in — otherwise this reports "no
    // such patient", creates one, and the unique index rejects the insert with
    // an E11000 that reception cannot act on.
    const existingPatient = await findPatientByPhone(staffHosp, phone);
    if (existingPatient) {
      return res
        .status(400)
        .json({ message: 'Patient with this phone number already exists in this hospital tenant' });
    }

    const patient = new Patient({
      name,
      phone,
      age: parsedAge,
      gender,
      hospital: staffHosp
    });
    await patient.save();

    res.status(201).json({ message: 'Patient registered successfully', patient });
  } catch (error: any) {
    logger.error('Error creating patient', { err: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT update patient details
router.put('/patients/:id', authenticateToken, ensureStaff, async (req, res) => {
  try {
    const { id } = req.params;
    const staffHosp = req.user.hospital || 'general-hospital';

    // Every field optional — this is a PATCH-shaped PUT, and a field the client
    // did not send must be LEFT ALONE rather than cleared. `parseBody` omits
    // absent optional keys entirely (rather than setting them to undefined),
    // which is what makes the `!== undefined` guards below still meaningful.
    const parsed = parseBody(req.body, {
      name: field.name({ label: 'Patient name', min: 2, max: 100, required: false }),
      age: field.int({ min: 1, max: 130, required: false }),
      gender: field.enum(['Male', 'Female', 'Other'], { required: false }),
      phone: field.phone({ required: false })
    });
    if (!parsed.ok) {
      return res.status(400).json({ message: parsed.error, errors: parsed.errors });
    }
    const { name, phone, gender } = parsed.value;
    const parsedAge = parsed.value.age;
    const age = parsedAge;

    const patient = await Patient.findOne({ _id: id, hospital: staffHosp });
    if (!patient) {
      return res.status(404).json({ message: 'Patient not found in this hospital tenant' });
    }

    // Check if new phone conflicts with another patient in this tenant.
    //
    // Compared canonically on both sides: `phone !== patient.phone` on the raw
    // strings called "+91 98765 43210" a change from "+919876543210" and then
    // reported the patient as conflicting with themselves.
    if (phone && normalizePhone(phone) !== normalizePhone(patient.phone)) {
      const phoneConflict = await findPhoneConflict(staffHosp, phone, patient._id);
      if (phoneConflict) {
        return res.status(400).json({
          message: 'Phone number is already associated with another patient in this hospital tenant'
        });
      }
      patient.phone = phone;
    }

    if (name !== undefined) patient.name = name;
    if (age !== undefined) patient.age = parsedAge;
    if (gender !== undefined) patient.gender = gender;

    await patient.save();
    res.json({ message: 'Patient details updated successfully', patient });
  } catch (error: any) {
    logger.error('Error updating patient', { err: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT reschedule or reassign patient token from Staff/Reception
router.put('/tokens/:tokenId/reschedule', authenticateToken, ensureStaff, async (req, res) => {
  try {
    const { tokenId } = req.params;
    const { newDoctorId, revisitDays, reason } = req.body;
    const staffHosp = req.user.hospital || 'general-hospital';

    const token = await Token.findById(tokenId).populate('patient').populate('doctor');
    if (!token || token.hospital !== staffHosp) {
      return res.status(404).json({ message: 'Token not found in this hospital tenant' });
    }

    const oldDoctorId = token.doctor ? token.doctor._id : null;
    let targetDoctor = token.doctor;

    // Check if transferring to another doctor
    if (newDoctorId && String(newDoctorId) !== String(oldDoctorId)) {
      targetDoctor = await Doctor.findById(newDoctorId);
      if (!targetDoctor || targetDoctor.hospital !== staffHosp) {
        return res.status(404).json({ message: 'Target doctor not found in this hospital tenant' });
      }

      // Remove from old doctor queue
      if (oldDoctorId) {
        const oldQueue = await Queue.findOne({ doctor: oldDoctorId });
        if (oldQueue) {
          if (oldQueue.currentToken && String(oldQueue.currentToken) === String(tokenId)) {
            oldQueue.currentToken = null;
          }
          oldQueue.activeQueue = oldQueue.activeQueue.filter((id) => String(id) !== String(tokenId));
          await oldQueue.save();
          await recalculateQueueTimes(oldDoctorId);
        }
      }

      // Insert into new doctor queue
      let newQueue = await Queue.findOne({ doctor: newDoctorId });
      if (!newQueue) {
        newQueue = new Queue({ doctor: newDoctorId, activeQueue: [] });
      }
      newQueue.activeQueue.push(token._id);
      await newQueue.save();

      token.doctor = newDoctorId;
      await recalculateQueueTimes(newDoctorId);
    }

    // Handle scheduled date
    let scheduledDate: any = null;
    if (revisitDays !== undefined && revisitDays !== null && parseInt(revisitDays) >= 0) {
      const days = parseInt(revisitDays);
      scheduledDate = new Date();
      scheduledDate.setDate(scheduledDate.getDate() + days);
      scheduledDate.setHours(9, 0, 0, 0);

      const reminder = new Reminder({
        patient: token.patient._id,
        doctor: targetDoctor._id,
        token: token._id,
        hospital: staffHosp,
        scheduledDate,
        revisitDays: days,
        status: 'Pending',
        message: `Scheduled re-visit for ${token.patient.name || 'Patient'} with ${targetDoctor.name || 'Doctor'} on ${scheduledDate.toLocaleDateString()}.${reason ? ` Reason: ${reason}` : ''}`
      });
      await reminder.save();
    }

    token.status = 'Waiting';
    setStage(token, 'Rescheduled', req.user.username || 'Reception');
    await token.save();

    // Broadcast updates
    if (req.io) {
      if (oldDoctorId) {
        req.io.to('queue:global').emit('queue-updated', { doctorId: oldDoctorId });
        req.io.to(`doctor:${oldDoctorId}`).emit('queue-updated');
      }
      if (newDoctorId) {
        req.io.to(`doctor:${newDoctorId}`).emit('queue-updated');
      }
      req.io.to(`hospital:${staffHosp}`).emit('queue-updated');
      req.io.to(`patient:${token._id}`).emit('token-called', {
        status: 'Rescheduled',
        doctorName: targetDoctor ? targetDoctor.name : 'Doctor',
        roomName: targetDoctor ? targetDoctor.currentRoom || 'Cabin' : 'Cabin',
        scheduledDate: scheduledDate ? scheduledDate.toLocaleDateString() : null
      });
    }

    await announceJourney(req.io, {
      hospital: staffHosp,
      token,
      stage: 'Rescheduled',
      role: 'staff',
      actor: req.user.username || 'Reception',
      type: 'token-rescheduled',
      message: `${token.tokenNumber} ${newDoctorId ? `transferred to ${targetDoctor.name}` : 'rescheduled'}${scheduledDate ? ` for ${scheduledDate.toLocaleDateString()}` : ''} by reception.`,
      severity: 'info'
    });

    res.json({
      message: `Token ${token.tokenNumber} successfully ${newDoctorId ? `transferred to ${targetDoctor.name}` : 'rescheduled'}.`,
      token
    });
  } catch (error: any) {
    logger.error('Error rescheduling token by staff', { err: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// ---------------------------------------------------------------------------
// SPECIAL RECEPTION DESK
//
// Reception has always been built around the person standing at the counter. The
// patients who book from home over WhatsApp never come to the counter — they walk
// in holding a token, expecting their bill and their special-needs priority to be
// sorted already. These two endpoints are that desk: one read that puts today's
// arrivals (with where they came from and what they owe) on one screen, and one
// write that grants the vulnerable-group priority reception used to only be able
// to set while registering a walk-in.
// ---------------------------------------------------------------------------

// GET today's arrivals for this facility — WhatsApp/web bookings and walk-ins
// side by side, each with its live billing state.
router.get('/reception/arrivals', authenticateToken, ensureStaff, async (req, res) => {
  try {
    const staffHosp = req.user.hospital || 'general-hospital';
    const { source, special } = req.query;

    // TENANT ISOLATION: only this facility's own tokens — a WhatsApp booking made
    // at another hospital on the shared number must never appear on this desk.
    const tokens = (await Token.find({ hospital: staffHosp }).populate('patient').populate('doctor')) || [];

    // Date filtering happens in JS on purpose: `createdAt` is stored as an ISO
    // string under the in-memory mock, where a raw `{ $gte: Date }` never matches.
    const start = startOfToday().getTime();
    let todays = tokens.filter((t) => t.createdAt && new Date(t.createdAt).getTime() >= start);

    const invoices = (await Invoice.find({ hospital: staffHosp })) || [];
    const billByToken = new Map();
    for (const inv of invoices) {
      if (!inv.token) continue;
      billByToken.set(String(inv.token._id || inv.token), inv);
    }

    const isSpecial = (t) =>
      t.tokenType === 'Emergency' || (t.priorityCategory && t.priorityCategory !== 'None');

    if (source) todays = todays.filter((t) => (t.bookingSource || 'Reception') === source);
    if (special === 'true') todays = todays.filter(isSpecial);

    const arrivals = todays
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .map((t) => {
        const bill = billByToken.get(String(t._id));
        return {
          tokenId: t._id,
          tokenNumber: t.tokenNumber,
          bookingSource: t.bookingSource || 'Reception',
          tokenType: t.tokenType,
          priorityCategory: t.priorityCategory || 'None',
          status: t.status,
          journeyStage: t.journeyStage,
          symptoms: t.symptoms,
          estimatedWaitTime: t.estimatedWaitTime || 0,
          bookedAt: t.createdAt,
          patient: t.patient
            ? {
                _id: t.patient._id,
                name: t.patient.name,
                phone: t.patient.phone,
                age: t.patient.age,
                gender: t.patient.gender
              }
            : null,
          doctor: t.doctor
            ? {
                _id: t.doctor._id,
                name: t.doctor.name,
                department: t.doctor.department,
                currentRoom: t.doctor.currentRoom
              }
            : null,
          bill: bill
            ? {
                _id: bill._id,
                invoiceNumber: bill.invoiceNumber,
                status: bill.status,
                totalAmount: bill.totalAmount || 0,
                amountPaid: bill.amountPaid || 0,
                balanceDue: bill.balanceDue || 0
              }
            : null
        };
      });

    const summary = {
      total: arrivals.length,
      remote: arrivals.filter((a) => a.bookingSource !== 'Reception').length,
      whatsapp: arrivals.filter((a) => a.bookingSource === 'WhatsApp').length,
      walkIn: arrivals.filter((a) => a.bookingSource === 'Reception').length,
      special: arrivals.filter((a) => a.tokenType === 'Emergency' || a.priorityCategory !== 'None').length,
      unbilled: arrivals.filter((a) => !a.bill).length,
      pendingAmount: arrivals.reduce((sum, a) => sum + (a.bill ? a.bill.balanceDue || 0 : 0), 0),
      collectedToday: arrivals.reduce((sum, a) => sum + (a.bill ? a.bill.amountPaid || 0 : 0), 0)
    };

    res.json({ hospital: staffHosp, summary, arrivals });
  } catch (error: any) {
    logger.error('Error loading reception arrivals', { err: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT set / clear the vulnerable-group priority on an existing token and re-seat
// it in the doctor's queue accordingly.
router.put('/tokens/:tokenId/priority', authenticateToken, ensureStaff, async (req, res) => {
  try {
    const { tokenId } = req.params;
    const { priorityCategory } = req.body;
    const staffHosp = req.user.hospital || 'general-hospital';

    if (!['None', 'Senior', 'Pregnant', 'Disabled'].includes(priorityCategory)) {
      return res.status(400).json({ message: 'priorityCategory must be None, Senior, Pregnant or Disabled' });
    }

    // Loaded WITHOUT populate: saving a populated doc persists the populated
    // object in place of the ObjectId under the mock and breaks later lookups.
    const token = await Token.findById(tokenId);
    if (!token || token.hospital !== staffHosp) {
      return res.status(404).json({ message: 'Token not found in this hospital tenant' });
    }
    if (['Completed', 'Absent'].includes(token.status)) {
      return res.status(400).json({ message: 'This visit is already finished — priority cannot be changed' });
    }

    token.priorityCategory = priorityCategory;
    await token.save();

    // Re-seat in the queue: pull it out, then insert at the tier it now belongs
    // to. A patient already inside the cabin keeps their place.
    const queue = await Queue.findOne({ doctor: token.doctor });
    if (queue && !(queue.currentToken && String(queue.currentToken) === String(tokenId))) {
      queue.activeQueue = queue.activeQueue.filter((id) => String(id) !== String(tokenId));
      await insertTokenByPriority(queue, token);
      await queue.save();
      await recalculateQueueTimes(token.doctor);
    }

    if (req.io) {
      req.io.to('queue:global').emit('queue-updated', { doctorId: token.doctor });
      req.io.to(`doctor:${token.doctor}`).emit('queue-updated');
      req.io.to(`hospital:${staffHosp}`).emit('queue-updated');
    }

    const updated = await Token.findById(tokenId).populate('patient').populate('doctor');

    await logActivity(req.io, {
      hospital: staffHosp,
      type: 'token-priority-updated',
      role: 'staff',
      actor: req.user.username || 'Reception',
      message:
        priorityCategory === 'None'
          ? `${updated.tokenNumber} moved back to the regular queue by reception.`
          : `${updated.tokenNumber} given ${priorityCategory} priority by reception.`,
      tokenNumber: updated.tokenNumber,
      refId: updated._id,
      severity: 'info'
    });

    res.json({
      message:
        priorityCategory === 'None'
          ? `${updated.tokenNumber} is back in the regular queue.`
          : `${updated.tokenNumber} moved ahead as ${priorityCategory} priority.`,
      token: updated
    });
  } catch (error: any) {
    logger.error('Error updating token priority', { err: error });
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
module.exports = router;
