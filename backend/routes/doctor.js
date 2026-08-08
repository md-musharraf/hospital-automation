const express = require('express');
const router = express.Router();
const Doctor = require('../models/Doctor');
const Token = require('../models/Token');
const Queue = require('../models/Queue');
const Reminder = require('../models/Reminder');
const Patient = require('../models/Patient');
const RefillRequest = require('../models/RefillRequest');
const { authenticateToken } = require('../middleware/auth');
const { recalculateQueueTimes, notifyUpcomingPatients } = require('../utils/queueHelper');
const { sendWhatsAppNotification } = require('../utils/whatsappHelper');
const { generateUniqueTokenNumber, saveTokenWithRetry } = require('../utils/tokenHelper');
const { toRole, toFacility, logActivity, announceJourney } = require('../utils/realtime');
const { setStage, deriveStage, hasUndispensedRx } = require('../utils/journeyHelper');
const { checkAvailability } = require('../utils/stockHelper');

// Middleware to ensure the user is a doctor
const ensureDoctor = (req, res, next) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ message: 'Access denied: Doctors only' });
  }
  next();
};

// GET logged-in doctor's live queue details
router.get('/my-queue', authenticateToken, ensureDoctor, async (req, res) => {
  try {
    const doctorId = req.user.id;
    let queue = await Queue.findOne({ doctor: doctorId })
      .populate({
        path: 'currentToken',
        populate: { path: 'patient' }
      })
      .populate({
        path: 'activeQueue',
        populate: { path: 'patient' }
      });

    if (!queue) {
      // Lazy initialize queue record if it doesn't exist
      queue = new Queue({ doctor: doctorId, activeQueue: [] });
      await queue.save();
      // Fetch again to populate references properly
      queue = await Queue.findOne({ doctor: doctorId })
        .populate('currentToken')
        .populate('activeQueue');
    }

    res.json(queue);
  } catch (error) {
    console.error('Error fetching doctor queue:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST call next patient in queue
router.post('/queue/call-next', authenticateToken, ensureDoctor, async (req, res) => {
  try {
    const doctorId = req.user.id;
    const queue = await Queue.findOne({ doctor: doctorId });

    if (!queue) {
      return res.status(404).json({ message: 'Queue state not found' });
    }

    if (queue.activeQueue.length === 0) {
      return res.status(400).json({ message: 'Queue is empty. No more patients to call.' });
    }

    // Archive current token if it exists in cabin (defaulting to completed if they forgot to click complete)
    if (queue.currentToken) {
      const oldToken = await Token.findById(queue.currentToken);
      if (oldToken && oldToken.status === 'Active') {
        oldToken.status = 'Completed';
        oldToken.completedAt = new Date();
        await oldToken.save();
      }
    }

    // Get the next token ID from activeQueue (front of the line)
    const nextTokenId = queue.activeQueue.shift();
    const token = await Token.findById(nextTokenId).populate('patient');
    if (!token) {
      queue.activeQueue = queue.activeQueue.filter(id => id.toString() !== nextTokenId.toString());
      await queue.save();
      return res.status(404).json({ message: 'Next token in queue not found' });
    }

    // Update token status
    token.status = 'Active';
    token.calledAt = new Date();
    setStage(token, 'In Consultation', req.user.username || 'Doctor');
    await token.save();

    // Set queue currentToken
    queue.currentToken = token._id;
    await queue.save();

    // Recalculate wait times for remaining queue
    await recalculateQueueTimes(doctorId);

    // Ping the patients who are now near the front so they head over (crowd control)
    notifyUpcomingPatients(doctorId, req.io);

    // Send automated WhatsApp alert for Called Token
    if (token.patient && token.patient.phone) {
      const room = req.user.currentRoom || 'Cabin A';
      const callMsg = `ALERT: Hello ${token.patient.name || 'Patient'}, your token ${token.tokenNumber} is now ACTIVE! Please proceed immediately to ${room} for your checkup.`;
      await sendWhatsAppNotification(token.patient.phone, callMsg);
    }

    // Trigger Web Push Notification to Patient
    try {
      const pushHelper = require('../utils/pushHelper');
      await pushHelper.notifyByTokenId(token._id.toString(), {
        title: 'Your Token is Active! 🚨',
        body: `Token ${token.tokenNumber}, please proceed to ${req.user.currentRoom || 'Cabin A'} immediately.`,
        icon: '/icon.svg',
        url: `/live-tracker/${token._id}`
      });
    } catch (err) {
      console.error('Push notification failed on call-next:', err);
    }

    // Broadcast updates
    if (req.io) {
      req.io.to('queue:global').emit('queue-updated', { doctorId });
      req.io.to(`doctor:${doctorId}`).emit('queue-updated');
      // Trigger voice call or screen alert room
      req.io.to(`patient:${token._id}`).emit('token-called', { status: 'Active', roomName: req.user.currentRoom || 'Cabin A', tokenNumber: token.tokenNumber });
    }

    // Facility-wide: reception and the waiting-room screens see the call live,
    // and it lands in the shared activity feed.
    const hospital = req.user.hospital || 'general-hospital';
    await announceJourney(req.io, {
      hospital, token, stage: 'In Consultation', role: 'doctor',
      actor: req.user.username || 'Doctor', type: 'token-called',
      message: `${token.tokenNumber} called into ${req.user.currentRoom || 'the cabin'}${token.patient ? ` (${token.patient.name})` : ''}.`
    });

    res.json({ message: `Called token ${token.tokenNumber}`, currentToken: token, activeQueue: queue.activeQueue });
  } catch (error) {
    console.error('Error calling next patient:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST complete active patient checkup
router.post('/queue/complete', authenticateToken, ensureDoctor, async (req, res) => {
  try {
    const doctorId = req.user.id;
    const queue = await Queue.findOne({ doctor: doctorId });

    if (!queue || !queue.currentToken) {
      return res.status(400).json({ message: 'No active patient is currently inside the cabin' });
    }

    const { revisitDays, medicines, advice } = req.body;
    if (medicines && !Array.isArray(medicines)) {
      return res.status(400).json({ message: 'Medicines must be a valid array' });
    }
    if (advice && typeof advice !== 'string') {
      return res.status(400).json({ message: 'Advice must be a valid string' });
    }
    if (revisitDays !== undefined && revisitDays !== null) {
      const parsedDays = parseInt(revisitDays);
      if (isNaN(parsedDays) || parsedDays < 0 || parsedDays > 365) {
        return res.status(400).json({ message: 'revisitDays must be a valid number between 0 and 365' });
      }
    }

    const token = await Token.findById(queue.currentToken).populate('patient');
    if (token) {
      token.status = 'Completed';
      token.completedAt = new Date();
      if (medicines || advice) {
        token.prescription = {
          medicines: medicines || [],
          advice: advice || '',
          dispensed: false
        };
        token.markModified && token.markModified('prescription');
      }
      // Where does the patient go next? Tests still out => the lab; medicines
      // written => the pharmacy; otherwise they are done. Derived from the token
      // itself so the stage can never contradict the data.
      setStage(token, deriveStage(token), req.user.username || 'Doctor');
      await token.save();

      // Trigger Web Push Notification to Patient
      try {
        const pushHelper = require('../utils/pushHelper');
        await pushHelper.notifyByTokenId(token._id.toString(), {
          title: 'Checkup Completed 🩺',
          body: `Your prescription is ready. Tap to view your receipt.`,
          icon: '/icon.svg',
          url: `/prescription/${token._id}`
        });
      } catch (err) {
        console.error('Push notification failed on complete:', err);
      }

      // Trigger automatic WhatsApp message with Prescription Receipt link
      if (token.patient && token.patient.phone) {
        const prescriptionLink = `https://hospital-automation-wine.vercel.app/prescription/${token._id}`;
        let completeMsg = `Hello ${token.patient.name || 'Patient'}, your checkup is completed. You can view your digital prescription receipt at: ${prescriptionLink}.`;

        // If revisit days are specified, create a pending reminder
        if (revisitDays !== undefined && revisitDays !== null && parseInt(revisitDays) >= 0) {
          const doctor = await Doctor.findById(doctorId);
          const doctorName = doctor ? doctor.name : 'your doctor';
          
          const scheduledDate = new Date();
          scheduledDate.setDate(scheduledDate.getDate() + parseInt(revisitDays));
          scheduledDate.setHours(9, 0, 0, 0); // 9:00 AM

          const docHosp = req.user.hospital || 'general-hospital';
          const reminder = new Reminder({
            patient: token.patient._id,
            doctor: doctorId,
            token: token._id,
            hospital: docHosp,
            scheduledDate,
            revisitDays: parseInt(revisitDays),
            status: 'Pending',
            message: `Hello ${token.patient.name || 'Patient'}, this is a reminder for your scheduled re-visit to see ${doctorName} ${parseInt(revisitDays) === 0 ? 'today' : `in ${revisitDays} days (scheduled for ${scheduledDate.toLocaleDateString()})`}.`
          });
          await reminder.save();
          console.log(`[REMINDER CREATED] scheduled for ${scheduledDate} for patient ${token.patient.name}`);
          
          completeMsg += ` A re-visit reminder has been scheduled for ${scheduledDate.toLocaleDateString()} (${revisitDays} days from now). Get well soon!`;
        }
        
        await sendWhatsAppNotification(token.patient.phone, completeMsg);
      }
    }

    // Clear current token
    const completedTokenId = queue.currentToken;
    queue.currentToken = null;
    await queue.save();

    // Recalculate wait times
    await recalculateQueueTimes(doctorId);

    // Ping the patients who are now near the front so they head over (crowd control)
    notifyUpcomingPatients(doctorId, req.io);

    // Broadcast updates
    if (req.io) {
      req.io.to('queue:global').emit('queue-updated', { doctorId });
      req.io.to(`doctor:${doctorId}`).emit('queue-updated');
      req.io.to(`patient:${completedTokenId}`).emit('token-called', { status: 'Completed' });
    }

    // Hand off to the next department LIVE. The pharmacy counter sees the
    // prescription the instant it is written — no walking a paper slip over —
    // and reception sees the patient move out of the cabin.
    const hospital = req.user.hospital || 'general-hospital';
    if (token) {
      const stage = token.journeyStage;
      if (hasUndispensedRx(token)) {
        toRole(req.io, 'pharmacy', hospital, 'pharmacy-updated', {
          tokenId: String(token._id), tokenNumber: token.tokenNumber, reason: 'new-prescription'
        });
        await logActivity(req.io, {
          hospital, type: 'rx-prescribed', role: 'doctor', actor: req.user.username || 'Doctor',
          message: `Prescription for ${token.tokenNumber} sent to pharmacy (${(token.prescription.medicines || []).length} medicine(s)).`,
          tokenNumber: token.tokenNumber, refId: token._id
        });
      }
      await announceJourney(req.io, {
        hospital, token, stage, role: 'doctor', actor: req.user.username || 'Doctor',
        type: 'token-completed',
        message: `Checkup complete for ${token.tokenNumber}${stage !== 'Completed' ? ` — next: ${stage}` : ''}.`,
        severity: 'success'
      });
    }

    res.json({
      message: 'Active checkup successfully marked as Completed',
      nextStage: token ? token.journeyStage : 'Completed',
      revisitScheduled: revisitDays && parseInt(revisitDays) > 0
    });
  } catch (error) {
    console.error('Error completing checkup:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST mark active patient as Absent
router.post('/queue/mark-absent', authenticateToken, ensureDoctor, async (req, res) => {
  try {
    const doctorId = req.user.id;
    const queue = await Queue.findOne({ doctor: doctorId });

    if (!queue || !queue.currentToken) {
      return res.status(400).json({ message: 'No active patient is currently inside the cabin' });
    }

    // No-show AUTO-RECALL: the first time a patient misses their turn, don't send
    // them back to reception — give them ONE automatic second chance a few slots
    // down the queue and WhatsApp them to come now. Only a repeat no-show is finally
    // marked Absent. This cuts re-registration load on staff and patient hardship.
    const MAX_RECALL = 1;
    const RECALL_OFFSET = 3; // slots back the recalled patient is placed

    const absentTokenId = queue.currentToken;
    const token = await Token.findById(queue.currentToken).populate('patient');
    let recalled = false;
    let recallPosition = null;

    if (token && (token.recallCount || 0) < MAX_RECALL) {
      // Give a second chance: back into the waiting line, reset alert state.
      token.status = 'Waiting';
      token.recallCount = (token.recallCount || 0) + 1;
      token.arrivalAlerted = false;
      token.calledAt = null;
      await token.save();

      queue.currentToken = null;
      const insertIdx = Math.min(RECALL_OFFSET, queue.activeQueue.length);
      queue.activeQueue.splice(insertIdx, 0, token._id);
      await queue.save();

      recalled = true;
      recallPosition = insertIdx + 1;

      if (token.patient && token.patient.phone) {
        const room = req.user.currentRoom || 'the cabin';
        const msg =
          `🔁 Missed your turn? No problem — token ${token.tokenNumber} has been given ONE more chance. ` +
          `You are now #${recallPosition} in line. Please reach ${room} right away.\n` +
          `🔁 अपनी बारी चूक गए? कोई बात नहीं — टोकन ${token.tokenNumber} को एक और मौका दिया गया है। ` +
          `अब आप क़तार में #${recallPosition} पर हैं। कृपया तुरंत ${room} पहुँचें।`;
        try { await sendWhatsAppNotification(token.patient.phone, msg); } catch (e) { console.error('Recall WA error:', e); }
      }
    } else if (token) {
      // Already recalled once — this is a final no-show.
      token.status = 'Absent';
      await token.save();
      queue.currentToken = null;
      await queue.save();

      if (token.patient && token.patient.phone) {
        const msg =
          `❌ You missed your turn again (token ${token.tokenNumber}). Please get a new token from reception when you arrive.\n` +
          `❌ आप दोबारा अपनी बारी चूक गए (टोकन ${token.tokenNumber})। कृपया आने पर रिसेप्शन से नया टोकन लें।`;
        try { await sendWhatsAppNotification(token.patient.phone, msg); } catch (e) { console.error('Absent WA error:', e); }
      }
    } else {
      queue.currentToken = null;
      await queue.save();
    }

    // Recalculate wait times
    await recalculateQueueTimes(doctorId);

    // Ping the patients who are now near the front so they head over (crowd control)
    notifyUpcomingPatients(doctorId, req.io);

    // Broadcast updates
    if (req.io) {
      req.io.to('queue:global').emit('queue-updated', { doctorId });
      req.io.to(`doctor:${doctorId}`).emit('queue-updated');
      req.io.to(`patient:${absentTokenId}`).emit('token-called', { status: recalled ? 'Recalled' : 'Absent', position: recallPosition });
    }

    // Reception sees no-shows live, so they can chase the patient in the hall
    // instead of finding out at the end of the session.
    await logActivity(req.io, {
      hospital: req.user.hospital || 'general-hospital',
      type: recalled ? 'token-recalled' : 'token-absent',
      role: 'doctor', actor: req.user.username || 'Doctor',
      message: recalled
        ? `${token ? token.tokenNumber : 'Patient'} did not answer — auto-recalled to position #${recallPosition}.`
        : `${token ? token.tokenNumber : 'Patient'} marked ABSENT after a second no-show.`,
      tokenNumber: token && token.tokenNumber,
      refId: absentTokenId,
      severity: recalled ? 'warning' : 'critical'
    });

    res.json({
      message: recalled
        ? `Patient did not show — auto-recalled to position #${recallPosition} (one more chance).`
        : 'Patient marked Absent (already recalled once).',
      recalled,
      recallPosition
    });
  } catch (error) {
    console.error('Error marking absent:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST add manual buffer delay to doctor's queue
router.post('/queue/add-buffer', authenticateToken, ensureDoctor, async (req, res) => {
  try {
    const doctorId = req.user.id;
    const { minutes } = req.body;
    const parsedMinutes = parseInt(minutes);

    if (minutes === undefined || isNaN(parsedMinutes) || parsedMinutes < -120 || parsedMinutes > 120) {
      return res.status(400).json({ message: 'Valid minutes parameter is required (between -120 and 120)' });
    }

    let queue = await Queue.findOne({ doctor: doctorId });
    if (!queue) {
      queue = new Queue({ doctor: doctorId, activeQueue: [], bufferDelay: 0 });
    }

    // Update buffer delay
    queue.bufferDelay = Math.max(0, queue.bufferDelay + parsedMinutes);
    await queue.save();

    // Instantly recalculate wait times for all waiting tokens in this queue
    await recalculateQueueTimes(doctorId);

    // Broadcast updates to all patient rooms and dashboards
    if (req.io) {
      req.io.to('queue:global').emit('queue-updated', { doctorId });
      req.io.to(`doctor:${doctorId}`).emit('queue-updated');
    }

    // Reception needs to know a cabin is running late — they are the ones the
    // waiting patients will ask.
    if (parsedMinutes !== 0) {
      const me = await Doctor.findById(doctorId);
      await logActivity(req.io, {
        hospital: req.user.hospital || 'general-hospital',
        type: 'buffer-added', role: 'doctor', actor: (me && me.name) || 'Doctor',
        message: `${(me && me.name) || 'A doctor'} is running ${queue.bufferDelay} min behind (${parsedMinutes > 0 ? '+' : ''}${parsedMinutes} min).`,
        severity: queue.bufferDelay >= 30 ? 'warning' : 'info'
      });
    }

    res.json({ message: `Manual buffer delay updated to ${queue.bufferDelay} minutes`, bufferDelay: queue.bufferDelay });
  } catch (error) {
    console.error('Error adding buffer delay:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT update doctor availability and/or average checkup times
router.put('/availability', authenticateToken, ensureDoctor, async (req, res) => {
  try {
    const doctorId = req.user.id;
    const { availabilityStatus, averageCheckupTime, dailyTokenLimit } = req.body;

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({ message: 'Doctor details not found' });
    }

    if (availabilityStatus) {
      const validStatuses = ['Available', 'In Surgery', 'On Break', 'Unavailable'];
      if (!validStatuses.includes(availabilityStatus)) {
        return res.status(400).json({ message: 'Invalid availabilityStatus value' });
      }
      doctor.availabilityStatus = availabilityStatus;
    }
    if (averageCheckupTime !== undefined && averageCheckupTime !== null) {
      const parsedTime = parseInt(averageCheckupTime);
      if (isNaN(parsedTime) || parsedTime < 1 || parsedTime > 120) {
        return res.status(400).json({ message: 'averageCheckupTime must be an integer between 1 and 120' });
      }
      doctor.averageCheckupTime = parsedTime;
    }
    if (dailyTokenLimit !== undefined && dailyTokenLimit !== null) {
      const parsedLimit = parseInt(dailyTokenLimit);
      if (isNaN(parsedLimit) || parsedLimit < 0 || parsedLimit > 1000) {
        return res.status(400).json({ message: 'dailyTokenLimit must be an integer between 0 (unlimited) and 1000' });
      }
      doctor.dailyTokenLimit = parsedLimit;
    }
    await doctor.save();

    // Recalculate wait times
    await recalculateQueueTimes(doctorId);

    // Broadcast updates
    if (req.io) {
      req.io.emit('doctor-status-update', {
        doctorId,
        availabilityStatus: doctor.availabilityStatus,
        averageCheckupTime: doctor.averageCheckupTime
      });
      req.io.to('queue:global').emit('queue-updated', { doctorId });
      req.io.to(`doctor:${doctorId}`).emit('queue-updated');
    }

    // A doctor going On Break / Unavailable is the single most useful thing for
    // reception to know instantly — it changes who they route walk-ins to.
    if (availabilityStatus) {
      const hospital = req.user.hospital || 'general-hospital';
      toFacility(req.io, hospital, 'doctor-status-update', {
        doctorId, name: doctor.name, availabilityStatus: doctor.availabilityStatus
      });
      await logActivity(req.io, {
        hospital, type: 'doctor-status', role: 'doctor', actor: doctor.name,
        message: `${doctor.name} is now ${doctor.availabilityStatus}.`,
        severity: doctor.availabilityStatus === 'Available' ? 'success' : 'warning'
      });
    }

    res.json({ message: 'Doctor details updated successfully', doctor });
  } catch (error) {
    console.error('Error updating doctor details:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST request lab tests for the active patient.
// Accepts one test or several at once, with an urgency flag, and pushes the
// order straight onto the lab bench's worklist in real time.
router.post('/queue/lab-request', authenticateToken, ensureDoctor, async (req, res) => {
  try {
    const doctorId = req.user.id;
    const hospital = req.user.hospital || 'general-hospital';
    const { testName, testNames, urgency } = req.body;

    // Normalise to a list so the doctor can order a panel in one action.
    const requested = Array.isArray(testNames) && testNames.length > 0 ? testNames : [testName];
    const clean = requested
      .filter(n => typeof n === 'string' && n.trim().length > 0 && n.length <= 100)
      .map(n => n.trim());

    if (clean.length === 0) {
      return res.status(400).json({ message: 'At least one testName is required (string up to 100 characters)' });
    }
    if (urgency && !['Routine', 'Urgent'].includes(urgency)) {
      return res.status(400).json({ message: 'urgency must be "Routine" or "Urgent"' });
    }

    const queue = await Queue.findOne({ doctor: doctorId });
    if (!queue || !queue.currentToken) {
      return res.status(400).json({ message: 'No active patient is currently inside the cabin' });
    }

    const token = await Token.findById(queue.currentToken).populate('patient');
    if (!token) {
      return res.status(404).json({ message: 'Active token not found' });
    }

    if (!Array.isArray(token.labTests)) token.labTests = [];
    const added = [];
    const duplicates = [];
    for (const name of clean) {
      if (token.labTests.some(t => t.testName.toLowerCase() === name.toLowerCase())) {
        duplicates.push(name);
        continue;
      }
      token.labTests.push({
        testName: name,
        status: 'Pending',
        urgency: urgency || 'Routine',
        requestedBy: req.user.username || 'Doctor'
      });
      added.push(name);
    }

    if (added.length === 0) {
      return res.status(400).json({ message: `Already requested for this patient: ${duplicates.join(', ')}` });
    }

    token.markModified && token.markModified('labTests');
    setStage(token, 'Lab Pending', req.user.username || 'Doctor');
    await token.save();

    // Broadcast updates
    if (req.io) {
      req.io.to('queue:global').emit('queue-updated', { doctorId });
      req.io.to(`doctor:${doctorId}`).emit('queue-updated');
    }

    // The lab bench's worklist updates instantly — no phone call, no paper slip.
    toRole(req.io, 'lab', hospital, 'lab-updated', {
      tokenId: String(token._id), tokenNumber: token.tokenNumber,
      tests: added, urgency: urgency || 'Routine', reason: 'new-request'
    });

    await announceJourney(req.io, {
      hospital, token, stage: 'Lab Pending', role: 'doctor',
      actor: req.user.username || 'Doctor', type: 'lab-requested',
      message: `${urgency === 'Urgent' ? '🚨 URGENT ' : ''}Lab test${added.length > 1 ? 's' : ''} ordered for ${token.tokenNumber}: ${added.join(', ')}.`,
      severity: urgency === 'Urgent' ? 'warning' : 'info'
    });

    // Tell the patient where to go next, so they don't sit back down in the OPD.
    if (token.patient && token.patient.phone) {
      try {
        await sendWhatsAppNotification(token.patient.phone,
          `Hello ${token.patient.name}, your doctor has ordered: ${added.join(', ')}.\n` +
          `🧪 Please visit the LAB counter now with token ${token.tokenNumber}. We will WhatsApp you the moment your report is ready.\n` +
          `🧪 कृपया टोकन ${token.tokenNumber} के साथ अभी लैब काउंटर पर जाएँ। रिपोर्ट तैयार होते ही हम WhatsApp कर देंगे।`);
      } catch (waErr) {
        console.error('Lab request WhatsApp failed:', waErr);
      }
    }

    res.json({
      message: `Requested lab test${added.length > 1 ? 's' : ''}: ${added.join(', ')}.`,
      added, duplicates, token
    });
  } catch (err) {
    console.error('Error requesting lab test:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET the patients whose lab reports have come back and who are waiting to be
// seen again. This is the missing return path: before this, a patient sent for
// tests fell off the doctor's screen entirely and had to re-register at
// reception to get back in front of the same doctor.
router.get('/lab-results', authenticateToken, ensureDoctor, async (req, res) => {
  try {
    const doctorId = req.user.id;
    const hospital = req.user.hospital || 'general-hospital';

    // Match the doctor in JS against both an id and a populated-object form —
    // other routes populate before saving, which can leave `token.doctor` as an
    // embedded object, and a plain `{ doctor: id }` query would then miss it.
    const tokens = await Token.find({ hospital }).populate('patient');
    const ready = (tokens || [])
      .filter(t => String((t.doctor && t.doctor._id) || t.doctor) === String(doctorId))
      .filter(t => (t.labTests || []).length > 0 && (t.labTests || []).every(x => x.status === 'Completed'))
      .filter(t => t.journeyStage === 'Lab Complete' || (t.labTests || []).some(x => x.abnormal))
      .map(t => ({
        _id: t._id,
        tokenNumber: t.tokenNumber,
        patient: t.patient ? { _id: t.patient._id, name: t.patient.name, age: t.patient.age, gender: t.patient.gender } : null,
        symptoms: t.symptoms,
        journeyStage: t.journeyStage,
        hasAbnormal: (t.labTests || []).some(x => x.abnormal),
        labTests: t.labTests,
        completedAt: (t.labTests || []).reduce((latest, x) =>
          x.completedAt && (!latest || new Date(x.completedAt) > new Date(latest)) ? x.completedAt : latest, null)
      }))
      // Abnormal results first — those are the ones that need a doctor's eyes now.
      .sort((a, b) => (b.hasAbnormal ? 1 : 0) - (a.hasAbnormal ? 1 : 0)
        || new Date(b.completedAt || 0) - new Date(a.completedAt || 0));

    res.json(ready);
  } catch (err) {
    console.error('Error fetching lab results:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST acknowledge a returned lab result — closes the loop after the doctor has
// reviewed the report, so the "results ready" list doesn't grow forever.
router.post('/lab-results/:tokenId/review', authenticateToken, ensureDoctor, async (req, res) => {
  try {
    const hospital = req.user.hospital || 'general-hospital';
    const token = await Token.findById(req.params.tokenId);
    if (!token) return res.status(404).json({ message: 'Token not found' });
    if (String(token.doctor) !== String(req.user.id)) {
      return res.status(403).json({ message: 'This patient belongs to another doctor' });
    }

    setStage(token, deriveStage(token), req.user.username || 'Doctor');
    await token.save();

    await announceJourney(req.io, {
      hospital, token, stage: token.journeyStage, role: 'doctor',
      actor: req.user.username || 'Doctor', type: 'system',
      message: `Reports for ${token.tokenNumber} reviewed by ${req.user.username || 'the doctor'}.`
    });

    res.json({ message: 'Reports marked as reviewed.', stage: token.journeyStage });
  } catch (err) {
    console.error('Error reviewing lab result:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET live medicine availability while writing a prescription. Stops the classic
// failure where a doctor prescribes something the store ran out of days ago and
// nobody finds out until the patient is standing at the counter.
router.get('/medicines', authenticateToken, ensureDoctor, async (req, res) => {
  try {
    const hospital = req.user.hospital || 'general-hospital';
    const Medicine = require('../models/Medicine');
    const { q, names } = req.query;

    // Availability check for an already-written list of medicines.
    if (names) {
      const list = String(names).split('|').map(s => s.trim()).filter(Boolean).slice(0, 25);
      return res.json(await checkAvailability(hospital, list));
    }

    // Type-ahead over the facility's stock.
    let rows = await Medicine.find({ hospital });
    if (q && typeof q === 'string') {
      const needle = q.toLowerCase();
      rows = rows.filter(m =>
        (m.name || '').toLowerCase().includes(needle) ||
        (m.genericName || '').toLowerCase().includes(needle));
    }

    res.json(rows.slice(0, 40).map(m => ({
      _id: m._id, name: m.name, genericName: m.genericName, form: m.form,
      strength: m.strength, stockQty: m.stockQty, unit: m.unit,
      level: m.stockQty <= 0 ? 'out' : (m.stockQty <= (m.reorderLevel || 0) ? 'low' : 'in-stock')
    })));
  } catch (err) {
    console.error('Error fetching medicines:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET this doctor's own numbers for today.
router.get('/stats', authenticateToken, ensureDoctor, async (req, res) => {
  try {
    const doctorId = req.user.id;
    const hospital = req.user.hospital || 'general-hospital';
    const start = new Date(); start.setHours(0, 0, 0, 0);

    const all = await Token.find({ hospital });
    const today = (all || [])
      .filter(t => String((t.doctor && t.doctor._id) || t.doctor) === String(doctorId))
      .filter(t => !t.createdAt || new Date(t.createdAt) >= start);
    const completed = today.filter(t => t.status === 'Completed');

    // Average consultation time from called -> completed.
    let totalMins = 0, counted = 0;
    for (const t of completed) {
      if (t.calledAt && t.completedAt) {
        totalMins += (new Date(t.completedAt) - new Date(t.calledAt)) / 60000;
        counted++;
      }
    }

    const queue = await Queue.findOne({ doctor: doctorId });

    res.json({
      seenToday: completed.length,
      waiting: (queue && queue.activeQueue && queue.activeQueue.length) || 0,
      absent: today.filter(t => t.status === 'Absent').length,
      emergency: today.filter(t => t.tokenType === 'Emergency').length,
      awaitingLab: today.filter(t => (t.labTests || []).some(x => x.status !== 'Completed')).length,
      resultsReady: today.filter(t => t.journeyStage === 'Lab Complete').length,
      avgConsultMins: counted > 0 ? Math.round(totalMins / counted) : 0,
      bufferDelay: (queue && queue.bufferDelay) || 0
    });
  } catch (err) {
    console.error('Error building doctor stats:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET patient visit history
router.get('/patients/:patientId/history', authenticateToken, ensureDoctor, async (req, res) => {
  try {
    const { patientId } = req.params;
    const history = await Token.find({
      patient: patientId,
      status: 'Completed',
      hospital: req.user.hospital || 'general-hospital'
    })
    .populate('doctor', 'name department')
    .sort({ completedAt: -1 });
    res.json(history);
  } catch (err) {
    console.error('Error fetching patient history:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET this doctor's pending medicine-refill requests (chronic patients repeating
// their prescription without an OPD visit).
router.get('/refills', authenticateToken, ensureDoctor, async (req, res) => {
  try {
    const requests = await RefillRequest.find({ doctor: req.user.id, status: 'Pending' })
      .populate('patient');
    // Newest first.
    requests.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    res.json(requests);
  } catch (err) {
    console.error('Error fetching refill requests:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST approve/reject a refill. On approval we mint a COMPLETED prescription token
// carrying the repeated medicines, so it flows straight into the pharmacy's normal
// dispense list — reusing the existing pharmacy workflow, no OPD slot consumed.
router.post('/refills/:id/decide', authenticateToken, ensureDoctor, async (req, res) => {
  try {
    const { approve, note } = req.body;
    const request = await RefillRequest.findById(req.params.id).populate('patient');
    if (!request) {
      return res.status(404).json({ message: 'Refill request not found' });
    }
    if (String(request.doctor) !== String(req.user.id)) {
      return res.status(403).json({ message: 'This refill request belongs to another doctor' });
    }
    if (request.status !== 'Pending') {
      return res.status(400).json({ message: `Refill already ${request.status.toLowerCase()}` });
    }

    const doctor = await Doctor.findById(req.user.id);
    const patient = request.patient;

    if (approve) {
      // Mint a completed prescription token for pharmacy pickup (not added to any queue).
      const tokenNumber = await generateUniqueTokenNumber(request.hospital);
      const rxToken = new Token({
        tokenNumber,
        hospital: request.hospital,
        status: 'Completed',
        tokenType: 'Re-visit',
        patient: patient._id,
        doctor: request.doctor,
        symptoms: 'Medicine Refill (repeat prescription, approved without OPD visit)',
        prescription: {
          medicines: request.medicines,
          advice: 'Repeat medication — refill approved without an OPD visit.',
          dispensed: false
        },
        completedAt: new Date()
      });
      await saveTokenWithRetry(rxToken);

      request.status = 'Approved';
      request.decidedAt = new Date();
      request.fulfilledToken = rxToken._id;
      await request.save();

      if (patient && patient.phone) {
        const room = (doctor && doctor.currentRoom) || 'the pharmacy';
        const msg =
          `✅ Your medicine refill is APPROVED by ${doctor ? doctor.name : 'the doctor'}. ` +
          `Please collect your medicines from the pharmacy/medical store (ref ${rxToken.tokenNumber}). No OPD visit needed.\n` +
          `✅ आपकी दवा रिफिल ${doctor ? doctor.name : 'डॉक्टर'} द्वारा मंज़ूर हो गई है। कृपया फार्मेसी से दवा ले लें (रेफ ${rxToken.tokenNumber})। OPD आने की ज़रूरत नहीं।`;
        try { await sendWhatsAppNotification(patient.phone, msg); } catch (e) { console.error('Refill approve WA error:', e); }
      }

      if (req.io) {
        try { req.io.emit('pharmacy-updated'); } catch (_) {}
      }

      return res.json({ message: 'Refill approved and sent to pharmacy', refill: request, token: rxToken });
    } else {
      request.status = 'Rejected';
      request.decidedAt = new Date();
      request.note = note || '';
      await request.save();

      if (patient && patient.phone) {
        const msg =
          `❌ Your medicine refill could not be approved${note ? ` (${note})` : ''}. ` +
          `Please book a normal OPD appointment so the doctor can review you.\n` +
          `❌ आपकी दवा रिफिल मंज़ूर नहीं हो सकी${note ? ` (${note})` : ''}। कृपया सामान्य OPD अपॉइंटमेंट बुक करें।`;
        try { await sendWhatsAppNotification(patient.phone, msg); } catch (e) { console.error('Refill reject WA error:', e); }
      }

      return res.json({ message: 'Refill rejected', refill: request });
    }
  } catch (err) {
    console.error('Error deciding refill:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
