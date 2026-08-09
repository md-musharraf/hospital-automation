const express = require('express');
const router = express.Router();
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const Token = require('../models/Token');
const Queue = require('../models/Queue');
const Reminder = require('../models/Reminder');
const { processPendingReminders } = require('../utils/reminderHelper');
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
  } catch (error) {
    logger.error('Error fetching queues', { err: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// POST walk-in token generation
router.post('/tokens/walk-in', authenticateToken, ensureStaff, async (req, res) => {
  try {
    const { name, age, gender, phone, doctorId, symptoms, tokenType, priorityCategory } = req.body;

    // doctorId is OPTIONAL now — leave it blank and the system auto-triages the
    // walk-in to the right department + least-busy doctor (see below).
    if (!name || !age || !gender || !phone || !symptoms) {
      return res.status(400).json({ message: 'Patient name, age, gender, phone and symptoms are required' });
    }

    if (typeof name !== 'string' || name.trim().length < 2 || name.length > 100) {
      return res.status(400).json({ message: 'Invalid patient name (2-100 characters)' });
    }
    const parsedAge = parseInt(age);
    if (isNaN(parsedAge) || parsedAge < 1 || parsedAge > 130) {
      return res.status(400).json({ message: 'Age must be an integer between 1 and 130' });
    }
    if (!['Male', 'Female', 'Other'].includes(gender)) {
      return res.status(400).json({ message: 'Gender must be Male, Female, or Other' });
    }
    if (typeof phone !== 'string' || phone.trim().length < 7 || phone.length > 20) {
      return res.status(400).json({ message: 'Invalid phone number' });
    }
    if (typeof symptoms !== 'string' || symptoms.trim().length === 0 || symptoms.length > 1000) {
      return res.status(400).json({ message: 'Symptoms must be a string up to 1000 characters' });
    }
    if (tokenType && !['Regular', 'Emergency', 'Re-visit'].includes(tokenType)) {
      return res.status(400).json({ message: 'Invalid tokenType' });
    }
    if (priorityCategory && !['None', 'Senior', 'Pregnant', 'Disabled'].includes(priorityCategory)) {
      return res.status(400).json({ message: 'Invalid priorityCategory' });
    }

    // Find or create patient within staff's hospital tenant
    const staffHosp = req.user.hospital || 'general-hospital';
    let patient = await Patient.findOne({ phone, hospital: staffHosp });
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
    } catch (err) {
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
      } catch (waErr) {
        logger.error('Walk-in WhatsApp dispatch error', { err: waErr });
        whatsapp = { status: 'failed', error: waErr.message };
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
  } catch (error) {
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
      } catch (err) {
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
  } catch (error) {
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
  } catch (error) {
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
  } catch (error) {
    logger.error('Error fetching reminders', { err: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// POST manually trigger pending reminders
router.post('/reminders/trigger', authenticateToken, ensureStaff, async (req, res) => {
  try {
    const processed = await processPendingReminders();
    res.json({ message: `Triggered reminders check successfully.`, sentReminders: processed });
  } catch (error) {
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
  } catch (error) {
    logger.error('Error fetching patients', { err: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// POST register a new patient within staff's hospital tenant
router.post('/patients', authenticateToken, ensureStaff, async (req, res) => {
  try {
    const { name, phone, age, gender } = req.body;
    const staffHosp = req.user.hospital || 'general-hospital';

    if (!name || !phone || !age || !gender) {
      return res.status(400).json({ message: 'All patient fields (name, phone, age, gender) are required' });
    }
    if (typeof name !== 'string' || name.trim().length < 2 || name.length > 100) {
      return res.status(400).json({ message: 'Invalid patient name (2-100 characters)' });
    }
    const parsedAge = parseInt(age);
    if (isNaN(parsedAge) || parsedAge < 1 || parsedAge > 130) {
      return res.status(400).json({ message: 'Age must be an integer between 1 and 130' });
    }
    if (!['Male', 'Female', 'Other'].includes(gender)) {
      return res.status(400).json({ message: 'Gender must be Male, Female, or Other' });
    }
    if (typeof phone !== 'string' || phone.trim().length < 7 || phone.length > 20) {
      return res.status(400).json({ message: 'Invalid phone number' });
    }

    // Check if phone number already exists in this hospital tenant
    const existingPatient = await Patient.findOne({ phone, hospital: staffHosp });
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
  } catch (error) {
    logger.error('Error creating patient', { err: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT update patient details
router.put('/patients/:id', authenticateToken, ensureStaff, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, age, gender } = req.body;
    const staffHosp = req.user.hospital || 'general-hospital';

    if (name !== undefined && (typeof name !== 'string' || name.trim().length < 2 || name.length > 100)) {
      return res.status(400).json({ message: 'Invalid patient name (2-100 characters)' });
    }
    let parsedAge;
    if (age !== undefined) {
      parsedAge = parseInt(age);
      if (isNaN(parsedAge) || parsedAge < 1 || parsedAge > 130) {
        return res.status(400).json({ message: 'Age must be an integer between 1 and 130' });
      }
    }
    if (gender !== undefined && !['Male', 'Female', 'Other'].includes(gender)) {
      return res.status(400).json({ message: 'Gender must be Male, Female, or Other' });
    }
    if (phone !== undefined && (typeof phone !== 'string' || phone.trim().length < 7 || phone.length > 20)) {
      return res.status(400).json({ message: 'Invalid phone number' });
    }

    const patient = await Patient.findOne({ _id: id, hospital: staffHosp });
    if (!patient) {
      return res.status(404).json({ message: 'Patient not found in this hospital tenant' });
    }

    // Check if new phone conflicts with another patient in this tenant
    if (phone && phone !== patient.phone) {
      const phoneConflict = await Patient.findOne({ phone, hospital: staffHosp });
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
  } catch (error) {
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
    let scheduledDate = null;
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
  } catch (error) {
    logger.error('Error rescheduling token by staff', { err: error });
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
