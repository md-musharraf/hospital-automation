const express = require('express');
const router = express.Router();
const Doctor = require('../models/Doctor');
const Token = require('../models/Token');
const Queue = require('../models/Queue');
const Reminder = require('../models/Reminder');
const Patient = require('../models/Patient');
const RefillRequest = require('../models/RefillRequest');
const { authenticateToken, ensureRole } = require('../middleware/auth');
const {
  recalculateQueueTimes,
  notifyUpcomingPatients,
  broadcastDelay,
  applyDeferral,
  isInTransit,
  travelMinutesOf,
  recallOffsetFor,
  MAX_DEFERS
} = require('../utils/queueHelper');
const {
  normalizeShifts,
  shiftsToOpdHours,
  sittingStatus,
  MAX_SHIFTS,
  parseHhMm,
  formatHhMm,
  localDateKey,
  shiftRunsOn,
  delayNotice,
  todayOpdHours
} = require('../utils/shiftHelper');
const { sendWhatsAppNotification } = require('../utils/whatsappHelper');
const { generateUniqueTokenNumber, saveTokenWithRetry } = require('../utils/tokenHelper');
const { toRole, toFacility, logActivity, announceJourney } = require('../utils/realtime');
const { setStage, deriveStage, hasUndispensedRx } = require('../utils/journeyHelper');
const { checkAvailability } = require('../utils/stockHelper');
const logger = require('../utils/logger');
const { prescriptionUrl } = require('../utils/env');

/**
 * Which cabin is this request for?
 *
 * Every route below reads `req.user.id` as a doctor's id — that came from a
 * doctor's own login token, back when each doctor had a password. There is one
 * facility credential now, so the facility picks a cabin in the console and
 * exchanges its token for a *cabin token* (POST /auth/facility/cabin) carrying
 * an `actingDoctor` claim. This middleware turns that claim back into the
 * `req.user` shape the routes already expect, so not one of them changed.
 *
 * Putting the cabin in the token rather than in a header is what kept this
 * change small: the console's eighteen existing calls send an Authorization
 * header and nothing else, and they still work. A header is still accepted for
 * API clients that would rather not mint a second token.
 *
 * Either way the claim is re-checked against the tenant before it is believed —
 * a facility can only ever act as one of its own doctors. Without that check,
 * this would be a way to run any cabin on the platform from any facility login.
 *
 * It also fills in `username` and `currentRoom`, which the call-next and
 * prescription paths use in the messages patients actually receive. Those used
 * to fall back to "Doctor" and "Cabin A" for everyone, because a doctor's login
 * token never carried them either.
 */
async function resolveActingDoctor(req, res, next) {
  try {
    // A legacy per-role doctor token already IS the cabin; nothing to resolve.
    if (req.user.role === 'doctor' && req.user.id) return next();

    const actingId =
      req.user.actingDoctor ||
      req.headers['x-acting-doctor'] ||
      (req.query && req.query.doctorId) ||
      (req.body && req.body.doctorId);

    if (!actingId) {
      return res.status(400).json({
        message: 'Choose which doctor you are working as before using the cabin.',
        code: 'ACTING_DOCTOR_REQUIRED'
      });
    }

    const doctor = await Doctor.findOne({ _id: actingId, hospital: req.user.hospital });
    if (!doctor) {
      // Same answer whether the id is nonsense or belongs to another facility —
      // there is nothing to learn here about other tenants' doctors.
      return res.status(403).json({ message: 'That doctor does not work at this facility.' });
    }

    req.user.id = doctor._id;
    req.user.email = doctor.email;
    req.user.username = doctor.name;
    req.user.currentRoom = doctor.currentRoom;
    req.actingDoctor = doctor;
    next();
  } catch (error: any) {
    logger.error('Could not resolve acting doctor', { err: error.message });
    res.status(500).json({ message: 'Server error identifying the cabin' });
  }
}

/**
 * The guard on every route in this router: the facility must run an OPD, and it
 * must have said which cabin it is working as.
 */
const ensureDoctor = [ensureRole('doctor'), resolveActingDoctor];

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
      queue = await Queue.findOne({ doctor: doctorId }).populate('currentToken').populate('activeQueue');
    }

    // The cabin's own timings ride along with the queue rather than needing a
    // second round trip — the portal draws the board and the timings card from
    // one payload, and they can never disagree about which doctor they describe.
    const me = await Doctor.findById(doctorId);
    const base = queue && typeof queue.toObject === 'function' ? queue.toObject() : { ...queue };

    // Travel state per waiting token, so the doctor can tell "not here yet" from
    // "on the road because we told them to be". Derived here rather than in the
    // browser: `isInTransit` is the same rule the queue itself uses to decide
    // whether someone is a no-show, and two copies of it would eventually
    // disagree on screen with what the system actually did.
    const travel = {};
    for (const entry of (base && base.activeQueue) || []) {
      if (!entry || !entry._id) continue;
      travel[String(entry._id)] = {
        travelMinutes: travelMinutesOf(entry),
        inTransit: isInTransit(entry),
        departureAlerted: Boolean(entry.departureAlerted),
        deferCount: entry.deferCount || 0
      };
    }

    res.json({
      ...base,
      travel,
      schedule: {
        shifts: (me && me.shifts) || [],
        opdDays: (me && me.opdDays) || [],
        opdHours: (me && me.opdHours) || '',
        // The standing label above, and what today actually looks like after any
        // delay the doctor announced. Both, because the panel shows the change
        // as a change — struck-through original next to the revised time — and
        // that needs the two values side by side.
        opdHoursToday: me ? todayOpdHours(me) : '',
        delay: me ? delayNotice(me) : null,
        averageCheckupTime: (me && me.averageCheckupTime) || 10,
        status: me ? sittingStatus(me) : null
      }
    });
  } catch (error: any) {
    logger.error('Error fetching doctor queue', { err: error });
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
      queue.activeQueue = queue.activeQueue.filter((id) => id.toString() !== nextTokenId.toString());
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
    // The doctor is demonstrably here now, so a "running late, arriving by
    // 11:30" announcement has served its purpose. Left set, it would keep
    // telling the board a doctor who is actively calling patients has not yet
    // turned up. The buffer itself stays — being late by 30 minutes is still
    // 30 minutes of accumulated delay for everyone in the line.
    queue.delayedUntil = null;
    queue.delayReason = '';
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
    } catch (err: any) {
      logger.error('Push notification failed on call-next', { err: err });
    }

    // Broadcast updates
    if (req.io) {
      req.io.to('queue:global').emit('queue-updated', { doctorId });
      req.io.to(`doctor:${doctorId}`).emit('queue-updated');
      // Trigger voice call or screen alert room
      req.io.to(`patient:${token._id}`).emit('token-called', {
        status: 'Active',
        roomName: req.user.currentRoom || 'Cabin A',
        tokenNumber: token.tokenNumber
      });
    }

    // Facility-wide: reception and the waiting-room screens see the call live,
    // and it lands in the shared activity feed.
    const hospital = req.user.hospital || 'general-hospital';
    await announceJourney(req.io, {
      hospital,
      token,
      stage: 'In Consultation',
      role: 'doctor',
      actor: req.user.username || 'Doctor',
      type: 'token-called',
      message: `${token.tokenNumber} called into ${req.user.currentRoom || 'the cabin'}${token.patient ? ` (${token.patient.name})` : ''}.`
    });

    res.json({
      message: `Called token ${token.tokenNumber}`,
      currentToken: token,
      activeQueue: queue.activeQueue
    });
  } catch (error: any) {
    logger.error('Error calling next patient', { err: error });
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
      } catch (err: any) {
        logger.error('Push notification failed on complete', { err: err });
      }

      // Trigger automatic WhatsApp message with Prescription Receipt link
      if (token.patient && token.patient.phone) {
        const prescriptionLink = prescriptionUrl(token._id);
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
          tokenId: String(token._id),
          tokenNumber: token.tokenNumber,
          reason: 'new-prescription'
        });
        await logActivity(req.io, {
          hospital,
          type: 'rx-prescribed',
          role: 'doctor',
          actor: req.user.username || 'Doctor',
          message: `Prescription for ${token.tokenNumber} sent to pharmacy (${(token.prescription.medicines || []).length} medicine(s)).`,
          tokenNumber: token.tokenNumber,
          refId: token._id
        });
      }
      await announceJourney(req.io, {
        hospital,
        token,
        stage,
        role: 'doctor',
        actor: req.user.username || 'Doctor',
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
  } catch (error: any) {
    logger.error('Error completing checkup', { err: error });
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST push a waiting patient back a few places so the cabin keeps moving.
 *
 * The doctor's own version of reception's button, for the commonest case of
 * all: the next name is called, nobody answers, and the choice today is to sit
 * idle or to burn that patient's token. Neither is needed — the patient we told
 * to leave home forty minutes ago is very likely in the car park.
 *
 * `tokenId` is optional; without it the front of the line is pushed back, which
 * is what the doctor means when they say "next".
 */
router.post('/queue/defer', authenticateToken, ensureDoctor, async (req, res) => {
  try {
    const doctorId = req.user.id;
    const { tokenId, slots } = req.body || {};
    const step = Math.min(10, Math.max(1, parseInt(slots, 10) || 2));

    const queue = await Queue.findOne({ doctor: doctorId });
    if (!queue || !Array.isArray(queue.activeQueue) || queue.activeQueue.length === 0) {
      return res.status(400).json({ message: 'There is nobody waiting in this queue' });
    }

    const targetId = tokenId || queue.activeQueue[0];
    const token = await Token.findById(targetId);
    if (!token) {
      return res.status(404).json({ message: 'Token not found' });
    }

    const result = await applyDeferral(doctorId, targetId, {
      slots: step,
      io: req.io,
      actor: req.user.username || 'Doctor'
    });

    if (!result.ok) {
      const message =
        result.reason === 'defer-limit'
          ? `${token.tokenNumber} has already been pushed back ${MAX_DEFERS} times — mark them absent instead.`
          : result.reason === 'already-last'
            ? `${token.tokenNumber} is already last in the queue.`
            : result.reason === 'not-waiting'
              ? 'Only a patient still waiting in the line can be pushed back.'
              : 'Could not push this token back.';
      return res.status(409).json({ message, reason: result.reason });
    }

    await logActivity(req.io, {
      hospital: req.user.hospital || 'general-hospital',
      type: 'token-deferred',
      role: 'doctor',
      actor: req.user.username || 'Doctor',
      message: `${token.tokenNumber} pushed back to #${(result.to || 0) + 1} — next patient called forward so the cabin is not idle.`,
      tokenNumber: token.tokenNumber,
      refId: token._id,
      severity: 'warning'
    });

    res.json({
      message: `${token.tokenNumber} moved to #${(result.to || 0) + 1}. Call the next patient now.`,
      position: (result.to || 0) + 1,
      estimatedWaitTime: result.token ? result.token.estimatedWaitTime : null,
      notified: result.notified || 0
    });
  } catch (error: any) {
    logger.error('Error deferring a waiting patient', { err: error });
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

    const absentTokenId = queue.currentToken;
    const token = await Token.findById(queue.currentToken).populate('patient');

    // Three slots back for someone who stepped out; far enough to cover the
    // journey for someone we ourselves told to leave home half an hour ago.
    // Putting a patient who is still on the road back into a line that reaches
    // them before they arrive is not a second chance, it is the same no-show
    // scheduled twice.
    const RECALL_OFFSET = recallOffsetFor(token, req.user.averageCheckupTime || 10);
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
        try {
          await sendWhatsAppNotification(token.patient.phone, msg);
        } catch (e) {
          logger.error('Recall WA error', { err: e });
        }
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
        try {
          await sendWhatsAppNotification(token.patient.phone, msg);
        } catch (e) {
          logger.error('Absent WA error', { err: e });
        }
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
      req.io
        .to(`patient:${absentTokenId}`)
        .emit('token-called', { status: recalled ? 'Recalled' : 'Absent', position: recallPosition });
    }

    // Reception sees no-shows live, so they can chase the patient in the hall
    // instead of finding out at the end of the session.
    await logActivity(req.io, {
      hospital: req.user.hospital || 'general-hospital',
      type: recalled ? 'token-recalled' : 'token-absent',
      role: 'doctor',
      actor: req.user.username || 'Doctor',
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
  } catch (error: any) {
    logger.error('Error marking absent', { err: error });
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
        type: 'buffer-added',
        role: 'doctor',
        actor: (me && me.name) || 'Doctor',
        message: `${(me && me.name) || 'A doctor'} is running ${queue.bufferDelay} min behind (${parsedMinutes > 0 ? '+' : ''}${parsedMinutes} min).`,
        severity: queue.bufferDelay >= 30 ? 'warning' : 'info'
      });
    }

    res.json({
      message: `Manual buffer delay updated to ${queue.bufferDelay} minutes`,
      bufferDelay: queue.bufferDelay
    });
  } catch (error: any) {
    logger.error('Error adding buffer delay', { err: error });
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * PUT /api/v1/doctor/schedule — the doctor's own sitting hours.
 *
 * Most doctors here sit twice a day, and until now the only record of that was
 * a free-text `opdHours` label nothing could compute with. Posting structured
 * shifts is what lets the queue tell "there is no wait" apart from "the doctor
 * is not in the building yet".
 *
 * `opdHours` is rewritten from the shifts rather than accepted alongside them,
 * so the sentence on the public page and the times the queue reasons about can
 * never drift apart. A doctor who clears their shifts keeps whatever label was
 * typed before — removing structure should not blank the public page.
 */
router.put('/schedule', authenticateToken, ensureDoctor, async (req, res) => {
  try {
    const doctorId = req.user.id;
    const { shifts, opdDays } = req.body || {};

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({ message: 'Doctor details not found' });
    }

    if (shifts !== undefined) {
      if (!Array.isArray(shifts)) {
        return res.status(400).json({ message: 'shifts must be an array of { label, start, end, days }.' });
      }
      if (shifts.length > MAX_SHIFTS) {
        return res.status(400).json({ message: `A doctor can keep at most ${MAX_SHIFTS} sittings a day.` });
      }

      const cleaned = normalizeShifts(shifts);
      // Say so rather than silently storing fewer rows than were sent: a
      // mistyped "10.00" is exactly the kind of thing that would otherwise
      // vanish and leave the doctor believing their evening OPD was saved.
      if (cleaned.length !== shifts.length) {
        return res.status(400).json({
          message: 'Each sitting needs a start and end time in 24-hour HH:MM form, e.g. 10:00 and 13:30.'
        });
      }

      doctor.shifts = cleaned;
      if (cleaned.length > 0) doctor.opdHours = shiftsToOpdHours(cleaned);
    }

    if (opdDays !== undefined) {
      const { OPD_DAYS } = require('../utils/facilityProfile');
      if (!Array.isArray(opdDays)) {
        return res.status(400).json({ message: 'opdDays must be an array of day names.' });
      }
      const asked = opdDays.map((d) =>
        String(d || '')
          .slice(0, 3)
          .toLowerCase()
      );
      doctor.opdDays = OPD_DAYS.filter((day) => asked.includes(day.toLowerCase()));
    }

    await doctor.save();

    // The estimates every waiting patient is holding were computed against the
    // OLD schedule, so they are wrong the moment this is saved.
    await recalculateQueueTimes(doctorId);

    const hospital = req.user.hospital || 'general-hospital';
    if (req.io) {
      req.io.to('queue:global').emit('queue-updated', { doctorId });
      req.io.to(`doctor:${doctorId}`).emit('queue-updated');
      toFacility(req.io, hospital, 'doctor-schedule-update', {
        doctorId,
        name: doctor.name,
        shifts: doctor.shifts,
        opdHours: doctor.opdHours
      });
    }

    await logActivity(req.io, {
      hospital,
      type: 'doctor-schedule',
      role: 'doctor',
      actor: doctor.name,
      message: `${doctor.name} updated their OPD timings${doctor.opdHours ? ` (${doctor.opdHours})` : ''}.`,
      severity: 'info'
    });

    res.json({
      message: 'OPD timings updated',
      shifts: doctor.shifts,
      opdDays: doctor.opdDays,
      opdHours: doctor.opdHours,
      status: sittingStatus(doctor)
    });
  } catch (error) {
    logger.error('Error updating doctor schedule', { err: error });
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/v1/doctor/queue/shift-time — "I will start at 11:30, not 11:00."
 *
 * The sibling of `running-late` below, and the difference is what the rest of
 * the system is told. `running-late` says the queue is behind; this says the
 * SITTING moved. That matters because the two are read by different people: a
 * buffer is arithmetic only the queue sees, while the start time is the number
 * printed on the landing page, shown on the waiting-room screen and quoted in
 * every "your turn is at" message. A doctor who is an hour late needs both to
 * move, or the board keeps announcing a time that stopped being true.
 *
 * Scoped to today. Changing the standing roster is `PUT /schedule`, and a late
 * morning must not silently become the doctor's permanent hours.
 */
router.post('/queue/shift-time', authenticateToken, ensureDoctor, async (req, res) => {
  try {
    const doctorId = req.user.id;
    const { start, minutes, end = '', shiftIndex, reason = '', notify = true } = req.body || {};

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({ message: 'Doctor details not found' });
    }

    const shifts = Array.isArray(doctor.shifts) ? doctor.shifts : [];
    if (shifts.length === 0) {
      return res.status(400).json({
        message:
          'Set your sitting hours first — there is no shift to move. Add one under OPD timings, then announce a delay.'
      });
    }

    if (end && parseHhMm(String(end)) === null) {
      return res.status(400).json({ message: 'end must be a 24-hour time like 14:00.' });
    }

    const now = new Date();

    // Which sitting is being moved. The doctor may say, but usually will not —
    // the useful default is the one they are late FOR: today's next sitting that
    // has not finished yet, falling back to the first one that runs today.
    let index = Number.isInteger(shiftIndex) ? shiftIndex : -1;
    if (index < 0 || index >= shifts.length) {
      const nowMins = now.getHours() * 60 + now.getMinutes();
      const todays = shifts
        .map((shift, i) => ({ shift, i }))
        .filter(({ shift }) => shiftRunsOn(shift, doctor, now));

      const upcoming = todays.find(({ shift }) => {
        const endMins = parseHhMm(shift.end);
        return endMins === null || endMins > nowMins;
      });
      index = upcoming ? upcoming.i : todays.length > 0 ? todays[0].i : 0;
    }

    const target = shifts[index];
    const originalStart = parseHhMm(target.start);

    // Two ways to say the same thing, because those are the two ways a person
    // says it: "I'll be half an hour late" and "I'll be there by 11:30".
    let revisedStart: string;
    let startMins: number | null;

    if (start !== undefined && start !== null && String(start).trim()) {
      revisedStart = String(start).trim();
      startMins = parseHhMm(revisedStart);
      if (startMins === null) {
        return res.status(400).json({ message: 'start must be a 24-hour time like 11:30.' });
      }
    } else {
      const late = parseInt(minutes, 10);
      if (isNaN(late) || late < 1 || late > 480) {
        return res.status(400).json({
          message: 'Say how late you are: minutes (1–480), or a new start time like 11:30.'
        });
      }
      if (originalStart === null) {
        return res.status(400).json({
          message: 'That sitting has no valid start time to push. Fix your OPD timings first.'
        });
      }
      // Counted from the SCHEDULED start, not from now: "30 minutes late" is a
      // statement about the appointment everyone was given, and adding it to the
      // current clock would compound every time the doctor pressed it twice.
      startMins = originalStart + late;
      if (startMins >= 24 * 60) {
        return res.status(400).json({ message: 'That pushes the sitting past midnight.' });
      }
      revisedStart = `${String(Math.floor(startMins / 60)).padStart(2, '0')}:${String(startMins % 60).padStart(2, '0')}`;
    }

    // Refuse to move a start EARLIER. This endpoint exists to announce a delay,
    // and pulling a sitting forward would tell patients to arrive at a time that
    // has, for some of them, already passed — the one message that cannot be
    // taken back. Bringing a sitting forward is a schedule change.
    if (originalStart !== null && startMins < originalStart) {
      return res.status(400).json({
        message: `That is earlier than your scheduled ${formatHhMm(target.start)} start. Use OPD timings to change your hours.`
      });
    }

    // A revised start that has already passed tells patients to arrive at a time
    // in the past, which is worse than saying nothing.
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    if (startMins <= nowMinutes) {
      return res.status(400).json({
        message: `${formatHhMm(revisedStart)} has already passed. Give a later time, or a bigger delay.`
      });
    }

    const dateKey = localDateKey(now);
    const overrides = (Array.isArray(doctor.shiftOverrides) ? doctor.shiftOverrides : []).filter(
      (entry) => entry && entry.date === dateKey && entry.shiftIndex !== index
    );
    overrides.push({
      date: dateKey,
      shiftIndex: index,
      start: revisedStart,
      end: end ? String(end).trim() : '',
      reason: String(reason || '')
        .trim()
        .slice(0, 140),
      createdAt: now
    });
    doctor.shiftOverrides = overrides;
    doctor.markModified && doctor.markModified('shiftOverrides');
    await doctor.save();

    // Every waiting patient's estimate was computed from the old start.
    await recalculateQueueTimes(doctorId);

    const notice = delayNotice(doctor, now);

    let notified = 0;
    if (notify !== false && notice.delayed) {
      notified = await broadcastDelay(doctorId, {
        minutes: notice.minutesLate,
        reason: notice.reason,
        newStart: notice.revisedStart,
        io: req.io
      });
    }

    const hospital = req.user.hospital || 'general-hospital';
    if (req.io) {
      req.io.to('queue:global').emit('queue-updated', { doctorId });
      req.io.to(`doctor:${doctorId}`).emit('queue-updated');
      toFacility(req.io, hospital, 'doctor-delayed', {
        doctorId,
        name: doctor.name,
        minutes: notice.minutesLate,
        reason: notice.reason,
        revisedStart: notice.revisedStart,
        originalStart: notice.originalStart,
        opdHoursToday: todayOpdHours(doctor, now),
        notified
      });
    }

    await logActivity(req.io, {
      hospital,
      type: 'doctor-delayed',
      role: 'doctor',
      actor: doctor.name,
      message:
        `${doctor.name} moved today's ${target.label || 'OPD'} start from ${notice.originalStart || formatHhMm(target.start)} to ${notice.revisedStart}` +
        `${notice.reason ? ` — ${notice.reason}` : ''}. ${notified} waiting patient(s) messaged.`,
      severity: notice.minutesLate >= 30 ? 'warning' : 'info'
    });

    res.json({
      message: notified
        ? `${notified} waiting patient(s) have been told you now start at ${notice.revisedStart}.`
        : `New start time saved (${notice.revisedStart}). No waiting patients to notify yet.`,
      notice,
      shiftIndex: index,
      opdHoursToday: todayOpdHours(doctor, now),
      status: sittingStatus(doctor, now),
      notified
    });
  } catch (error) {
    logger.error('Error updating doctor sitting time', { err: error });
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * DELETE /api/v1/doctor/queue/shift-time — "I made it after all, clear the delay."
 */
router.delete('/queue/shift-time', authenticateToken, ensureDoctor, async (req, res) => {
  try {
    const doctorId = req.user.id;
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) return res.status(404).json({ message: 'Doctor details not found' });

    const dateKey = localDateKey(new Date());
    const before = (Array.isArray(doctor.shiftOverrides) ? doctor.shiftOverrides : []).length;
    doctor.shiftOverrides = (Array.isArray(doctor.shiftOverrides) ? doctor.shiftOverrides : []).filter(
      (entry) => !entry || entry.date !== dateKey
    );

    if (before === doctor.shiftOverrides.length) {
      return res.json({ message: 'No delay was announced today.', cleared: false });
    }

    doctor.markModified && doctor.markModified('shiftOverrides');
    await doctor.save();
    await recalculateQueueTimes(doctorId);

    const hospital = req.user.hospital || 'general-hospital';
    if (req.io) {
      req.io.to('queue:global').emit('queue-updated', { doctorId });
      toFacility(req.io, hospital, 'doctor-delay-cleared', {
        doctorId,
        name: doctor.name,
        opdHoursToday: todayOpdHours(doctor)
      });
    }

    res.json({
      message: 'Delay cleared — your normal sitting hours are showing again.',
      cleared: true,
      opdHoursToday: todayOpdHours(doctor),
      status: sittingStatus(doctor)
    });
  } catch (error) {
    logger.error('Error clearing doctor sitting delay', { err: error });
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/v1/doctor/queue/running-late — "I am delayed, tell my patients."
 *
 * The delay itself was already expressible as a buffer. What was missing is the
 * half that matters to a patient: nobody told them. A cabin running forty
 * minutes behind with no message is what fills a waiting hall — everyone comes
 * at their original time and then stays, because leaving risks missing the call.
 *
 * Accepts either a number of minutes or a clock time the doctor now expects to
 * arrive, because those are the two ways a person actually says it ("I'll be
 * half an hour" / "I'll be there by 11").
 */
router.post('/queue/running-late', authenticateToken, ensureDoctor, async (req, res) => {
  try {
    const doctorId = req.user.id;
    const { minutes, arrivingAt, reason = '', notify = true } = req.body || {};

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({ message: 'Doctor details not found' });
    }

    let lateBy = null;

    if (arrivingAt !== undefined && arrivingAt !== null && String(arrivingAt).trim()) {
      const { parseHhMm } = require('../utils/shiftHelper');
      const target = parseHhMm(String(arrivingAt));
      if (target === null) {
        return res.status(400).json({ message: 'arrivingAt must be a 24-hour time like 11:30.' });
      }
      const when = new Date();
      when.setHours(0, 0, 0, 0);
      when.setMinutes(target);
      // A time already past today means tomorrow's sitting is being announced,
      // not a delay of negative minutes.
      if (when <= new Date()) {
        return res.status(400).json({ message: 'That time has already passed today.' });
      }
      lateBy = Math.round((when.getTime() - Date.now()) / 60000);
    } else {
      const parsed = parseInt(minutes);
      if (isNaN(parsed) || parsed < 1 || parsed > 480) {
        return res
          .status(400)
          .json({ message: 'Tell us how late you are: minutes (1–480) or an arrivingAt time.' });
      }
      lateBy = parsed;
    }

    let queue = await Queue.findOne({ doctor: doctorId });
    if (!queue) {
      queue = new Queue({ doctor: doctorId, activeQueue: [], bufferDelay: 0 });
    }

    // The delay REPLACES the running buffer rather than adding to it. A doctor
    // saying "I am 30 minutes late" is stating where they now stand, not adding
    // thirty minutes to a figure they cannot see — and the +10/+15 buttons are
    // still there for the incremental case.
    queue.bufferDelay = lateBy;
    queue.delayReason = String(reason || '')
      .trim()
      .slice(0, 140);
    queue.delayedUntil = new Date(Date.now() + lateBy * 60000);
    await queue.save();

    // Recompute BEFORE notifying: the broadcast quotes each patient's own
    // revised time, and it reads it off the token.
    await recalculateQueueTimes(doctorId);

    let notified = 0;
    if (notify !== false) {
      notified = await broadcastDelay(doctorId, {
        minutes: lateBy,
        reason: queue.delayReason,
        io: req.io
      });
      queue.lastNotifiedDelay = lateBy;
      queue.lastDelayNotifiedAt = new Date();
      await queue.save();
    }

    const hospital = req.user.hospital || 'general-hospital';
    if (req.io) {
      req.io.to('queue:global').emit('queue-updated', { doctorId });
      req.io.to(`doctor:${doctorId}`).emit('queue-updated');
      toFacility(req.io, hospital, 'doctor-delayed', {
        doctorId,
        name: doctor.name,
        minutes: lateBy,
        reason: queue.delayReason,
        notified
      });
    }

    await logActivity(req.io, {
      hospital,
      type: 'doctor-delayed',
      role: 'doctor',
      actor: doctor.name,
      message:
        `${doctor.name} is running ${lateBy} min late` +
        `${queue.delayReason ? ` — ${queue.delayReason}` : ''}. ${notified} waiting patient(s) messaged.`,
      severity: lateBy >= 30 ? 'warning' : 'info'
    });

    res.json({
      message: notified
        ? `${notified} waiting patient(s) have been told you are ${lateBy} min late.`
        : `Delay recorded (${lateBy} min). No waiting patients to notify yet.`,
      minutes: lateBy,
      reason: queue.delayReason,
      delayedUntil: queue.delayedUntil,
      bufferDelay: queue.bufferDelay,
      notified
    });
  } catch (error) {
    logger.error('Error announcing doctor delay', { err: error });
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
        return res
          .status(400)
          .json({ message: 'dailyTokenLimit must be an integer between 0 (unlimited) and 1000' });
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
        doctorId,
        name: doctor.name,
        availabilityStatus: doctor.availabilityStatus
      });
      await logActivity(req.io, {
        hospital,
        type: 'doctor-status',
        role: 'doctor',
        actor: doctor.name,
        message: `${doctor.name} is now ${doctor.availabilityStatus}.`,
        severity: doctor.availabilityStatus === 'Available' ? 'success' : 'warning'
      });
    }

    res.json({ message: 'Doctor details updated successfully', doctor });
  } catch (error: any) {
    logger.error('Error updating doctor details', { err: error });
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
      .filter((n) => typeof n === 'string' && n.trim().length > 0 && n.length <= 100)
      .map((n) => n.trim());

    if (clean.length === 0) {
      return res
        .status(400)
        .json({ message: 'At least one testName is required (string up to 100 characters)' });
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
      if (token.labTests.some((t) => t.testName.toLowerCase() === name.toLowerCase())) {
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
      return res
        .status(400)
        .json({ message: `Already requested for this patient: ${duplicates.join(', ')}` });
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
      tokenId: String(token._id),
      tokenNumber: token.tokenNumber,
      tests: added,
      urgency: urgency || 'Routine',
      reason: 'new-request'
    });

    await announceJourney(req.io, {
      hospital,
      token,
      stage: 'Lab Pending',
      role: 'doctor',
      actor: req.user.username || 'Doctor',
      type: 'lab-requested',
      message: `${urgency === 'Urgent' ? '🚨 URGENT ' : ''}Lab test${added.length > 1 ? 's' : ''} ordered for ${token.tokenNumber}: ${added.join(', ')}.`,
      severity: urgency === 'Urgent' ? 'warning' : 'info'
    });

    // Tell the patient where to go next, so they don't sit back down in the OPD.
    if (token.patient && token.patient.phone) {
      try {
        await sendWhatsAppNotification(
          token.patient.phone,
          `Hello ${token.patient.name}, your doctor has ordered: ${added.join(', ')}.\n` +
            `🧪 Please visit the LAB counter now with token ${token.tokenNumber}. We will WhatsApp you the moment your report is ready.\n` +
            `🧪 कृपया टोकन ${token.tokenNumber} के साथ अभी लैब काउंटर पर जाएँ। रिपोर्ट तैयार होते ही हम WhatsApp कर देंगे।`
        );
      } catch (waErr) {
        logger.error('Lab request WhatsApp failed', { err: waErr });
      }
    }

    res.json({
      message: `Requested lab test${added.length > 1 ? 's' : ''}: ${added.join(', ')}.`,
      added,
      duplicates,
      token
    });
  } catch (err: any) {
    logger.error('Error requesting lab test', { err: err });
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
      .filter((t) => String((t.doctor && t.doctor._id) || t.doctor) === String(doctorId))
      .filter(
        (t) => (t.labTests || []).length > 0 && (t.labTests || []).every((x) => x.status === 'Completed')
      )
      .filter((t) => t.journeyStage === 'Lab Complete' || (t.labTests || []).some((x) => x.abnormal))
      .map((t) => ({
        _id: t._id,
        tokenNumber: t.tokenNumber,
        patient: t.patient
          ? { _id: t.patient._id, name: t.patient.name, age: t.patient.age, gender: t.patient.gender }
          : null,
        symptoms: t.symptoms,
        journeyStage: t.journeyStage,
        hasAbnormal: (t.labTests || []).some((x) => x.abnormal),
        labTests: t.labTests,
        completedAt: (t.labTests || []).reduce(
          (latest, x) =>
            x.completedAt && (!latest || new Date(x.completedAt) > new Date(latest)) ? x.completedAt : latest,
          null
        )
      }))
      // Abnormal results first — those are the ones that need a doctor's eyes now.
      .sort(
        (a, b) =>
          (b.hasAbnormal ? 1 : 0) - (a.hasAbnormal ? 1 : 0) ||
          new Date(b.completedAt || 0).getTime() - new Date(a.completedAt || 0).getTime()
      );

    res.json(ready);
  } catch (err: any) {
    logger.error('Error fetching lab results', { err: err });
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
      hospital,
      token,
      stage: token.journeyStage,
      role: 'doctor',
      actor: req.user.username || 'Doctor',
      type: 'system',
      message: `Reports for ${token.tokenNumber} reviewed by ${req.user.username || 'the doctor'}.`
    });

    res.json({ message: 'Reports marked as reviewed.', stage: token.journeyStage });
  } catch (err: any) {
    logger.error('Error reviewing lab result', { err: err });
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
      const list = String(names)
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 25);
      return res.json(await checkAvailability(hospital, list));
    }

    // Type-ahead over the facility's stock.
    let rows = await Medicine.find({ hospital });
    if (q && typeof q === 'string') {
      const needle = q.toLowerCase();
      rows = rows.filter(
        (m) =>
          (m.name || '').toLowerCase().includes(needle) ||
          (m.genericName || '').toLowerCase().includes(needle)
      );
    }

    res.json(
      rows.slice(0, 40).map((m) => ({
        _id: m._id,
        name: m.name,
        genericName: m.genericName,
        form: m.form,
        strength: m.strength,
        stockQty: m.stockQty,
        unit: m.unit,
        level: m.stockQty <= 0 ? 'out' : m.stockQty <= (m.reorderLevel || 0) ? 'low' : 'in-stock'
      }))
    );
  } catch (err: any) {
    logger.error('Error fetching medicines', { err: err });
    res.status(500).json({ message: 'Server error' });
  }
});

// GET this doctor's own numbers for today.
router.get('/stats', authenticateToken, ensureDoctor, async (req, res) => {
  try {
    const doctorId = req.user.id;
    const hospital = req.user.hospital || 'general-hospital';
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const all = await Token.find({ hospital });
    const today = (all || [])
      .filter((t) => String((t.doctor && t.doctor._id) || t.doctor) === String(doctorId))
      .filter((t) => !t.createdAt || new Date(t.createdAt) >= start);
    const completed = today.filter((t) => t.status === 'Completed');

    // Average consultation time from called -> completed.
    let totalMins = 0,
      counted = 0;
    for (const t of completed) {
      if (t.calledAt && t.completedAt) {
        totalMins += (new Date(t.completedAt).getTime() - new Date(t.calledAt).getTime()) / 60000;
        counted++;
      }
    }

    const queue = await Queue.findOne({ doctor: doctorId });

    res.json({
      seenToday: completed.length,
      waiting: (queue && queue.activeQueue && queue.activeQueue.length) || 0,
      absent: today.filter((t) => t.status === 'Absent').length,
      emergency: today.filter((t) => t.tokenType === 'Emergency').length,
      awaitingLab: today.filter((t) => (t.labTests || []).some((x) => x.status !== 'Completed')).length,
      resultsReady: today.filter((t) => t.journeyStage === 'Lab Complete').length,
      avgConsultMins: counted > 0 ? Math.round(totalMins / counted) : 0,
      bufferDelay: (queue && queue.bufferDelay) || 0
    });
  } catch (err: any) {
    logger.error('Error building doctor stats', { err: err });
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * This facility's tokens for one patient.
 *
 * Matched in JS rather than with `{ patient: id }`, for the same reason
 * `/lab-results` matches its doctor that way: several routes populate a token
 * before saving it, which writes the whole patient object back in place of the
 * ObjectId. A plain equality query then misses exactly the visits that have
 * been through a cabin — which is every visit worth reading. That is why the
 * history panel so often said "no past checkups" for a patient who plainly had
 * them.
 */
async function visitsOfPatient(hospital, patientId) {
  const tokens = (await Token.find({ hospital }).populate('doctor', 'name department currentRoom')) || [];
  return tokens.filter((t) => String((t.patient && t.patient._id) || t.patient) === String(patientId));
}

// GET patient visit history
router.get('/patients/:patientId/history', authenticateToken, ensureDoctor, async (req, res) => {
  try {
    const hospital = req.user.hospital || 'general-hospital';
    const history = (await visitsOfPatient(hospital, req.params.patientId))
      .filter((t) => t.status === 'Completed')
      .sort((a, b) => new Date(b.completedAt || 0).getTime() - new Date(a.completedAt || 0).getTime());
    res.json(history);
  } catch (err: any) {
    logger.error('Error fetching patient history', { err: err });
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/v1/doctor/patients/:patientId/profile — one patient, whole record.
 *
 * The cabin used to show a doctor the visit in front of them and a short list
 * of past visits filtered to `status: 'Completed'`. That is the wrong record
 * twice over. A visit where the patient was sent to the lab and never came
 * back is exactly the one a doctor needs to see, and it never appeared. Nor did
 * the reports: `labTests` came back with the visit but nothing collected them
 * into "every test this person has ever had here", which is the view that
 * answers "was their sugar this high last time?".
 *
 * So this returns the dossier rather than a list: the person, what they have
 * been treated for, every prescription, and every report with a link — from any
 * doctor at this facility, because a patient who saw the ENT last month is
 * still the same patient.
 *
 * Tenant-scoped on the patient AND on every visit. A doctor may open any of
 * their own facility's patients — they share a corridor and refer to each other
 * constantly — and none of anybody else's.
 */
router.get('/patients/:patientId/profile', authenticateToken, ensureDoctor, async (req, res) => {
  try {
    const hospital = req.user.hospital || 'general-hospital';
    const patient = await Patient.findById(req.params.patientId);
    if (!patient) return res.status(404).json({ message: 'Patient not found' });
    if (patient.hospital !== hospital) {
      return res.status(403).json({ message: 'This patient belongs to another facility.' });
    }

    const visits = await visitsOfPatient(hospital, patient._id);

    // Newest first, on the date the visit actually happened.
    const ordered = (visits || []).sort(
      (a, b) =>
        new Date(b.completedAt || b.createdAt || 0).getTime() -
        new Date(a.completedAt || a.createdAt || 0).getTime()
    );

    const timeline = ordered.map((t) => ({
      _id: t._id,
      tokenNumber: t.tokenNumber,
      status: t.status,
      tokenType: t.tokenType,
      journeyStage: t.journeyStage,
      symptoms: t.symptoms,
      bookingSource: t.bookingSource,
      createdAt: t.createdAt,
      completedAt: t.completedAt,
      doctor: t.doctor ? { name: t.doctor.name, department: t.doctor.department } : null,
      prescription: t.prescription || null,
      labTests: t.labTests || []
    }));

    // Every report this person has, flattened out of the visits and carrying
    // the visit it belongs to — the doctor is asking about a trend, not about
    // one appointment.
    const reports = [];
    for (const visit of ordered) {
      for (const test of visit.labTests || []) {
        reports.push({
          tokenId: visit._id,
          tokenNumber: visit.tokenNumber,
          orderedOn: visit.createdAt,
          testName: test.testName,
          status: test.status,
          urgency: test.urgency,
          resultValue: test.resultValue,
          unit: test.unit,
          normalRange: test.normalRange,
          abnormal: Boolean(test.abnormal),
          remarks: test.remarks,
          reportPdf: test.reportPdf || '',
          reportFileName: test.reportFileName || '',
          completedAt: test.completedAt,
          completedBy: test.completedBy,
          sharedWithPatientAt: test.reportSharedAt || null
        });
      }
    }
    reports.sort(
      (a, b) =>
        new Date(b.completedAt || b.orderedOn || 0).getTime() -
        new Date(a.completedAt || a.orderedOn || 0).getTime()
    );

    // Medicines this patient has been on, most recently prescribed first. A
    // doctor writing a new course reads this before the visit list.
    const medicineSeen = new Map();
    for (const visit of ordered) {
      for (const med of (visit.prescription && visit.prescription.medicines) || []) {
        if (!med || !med.name) continue;
        const key = String(med.name).toLowerCase().trim();
        if (medicineSeen.has(key)) continue;
        medicineSeen.set(key, {
          name: med.name,
          dosage: med.dosage,
          duration: med.duration,
          lastPrescribed: visit.completedAt || visit.createdAt,
          by: visit.doctor ? visit.doctor.name : ''
        });
      }
    }

    const completedVisits = ordered.filter((t) => t.status === 'Completed');

    res.json({
      patient: {
        _id: patient._id,
        name: patient.name,
        age: patient.age,
        gender: patient.gender,
        phone: patient.phone,
        registeredOn: patient.createdAt,
        visitCount: patient.visitCount || ordered.length
      },
      summary: {
        totalVisits: ordered.length,
        completedVisits: completedVisits.length,
        firstVisit: ordered.length ? ordered[ordered.length - 1].createdAt : null,
        lastVisit: completedVisits.length ? completedVisits[0].completedAt : null,
        openVisits: ordered.filter((t) => t.status !== 'Completed' && t.status !== 'Absent').length,
        missedVisits: ordered.filter((t) => t.status === 'Absent').length,
        totalReports: reports.length,
        // The count a doctor scans for first.
        abnormalReports: reports.filter((r) => r.abnormal).length,
        pendingReports: reports.filter((r) => r.status !== 'Completed').length
      },
      visits: timeline,
      reports,
      medicines: Array.from(medicineSeen.values())
    });
  } catch (err: any) {
    logger.error('Error building patient profile', { err: err });
    res.status(500).json({ message: 'Server error' });
  }
});

// GET this doctor's pending medicine-refill requests (chronic patients repeating
// their prescription without an OPD visit).
router.get('/refills', authenticateToken, ensureDoctor, async (req, res) => {
  try {
    const requests = await RefillRequest.find({ doctor: req.user.id, status: 'Pending' }).populate('patient');
    // Newest first.
    requests.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    res.json(requests);
  } catch (err: any) {
    logger.error('Error fetching refill requests', { err: err });
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
        try {
          await sendWhatsAppNotification(patient.phone, msg);
        } catch (e) {
          logger.error('Refill approve WA error', { err: e });
        }
      }

      if (req.io) {
        try {
          req.io.emit('pharmacy-updated');
        } catch (_) {}
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
        try {
          await sendWhatsAppNotification(patient.phone, msg);
        } catch (e) {
          logger.error('Refill reject WA error', { err: e });
        }
      }

      return res.json({ message: 'Refill rejected', refill: request });
    }
  } catch (err: any) {
    logger.error('Error deciding refill', { err: err });
    res.status(500).json({ message: 'Server error' });
  }
});

// POST reschedule or transfer patient token
router.post('/queue/reschedule', authenticateToken, ensureDoctor, async (req, res) => {
  try {
    const doctorId = req.user.id;
    const hospital = req.user.hospital || 'general-hospital';
    const { tokenId, newDoctorId, revisitDays, reason } = req.body;

    const queue = await Queue.findOne({ doctor: doctorId });
    const targetTokenId = tokenId || (queue && queue.currentToken);

    if (!targetTokenId) {
      return res.status(400).json({ message: 'No patient token specified or active in cabin' });
    }

    const token = await Token.findById(targetTokenId).populate('patient').populate('doctor');
    if (!token) {
      return res.status(404).json({ message: 'Token not found' });
    }

    const oldDoctorId = token.doctor ? token.doctor._id : doctorId;
    let targetDoctor = token.doctor;

    // Check if transferring to another doctor
    if (newDoctorId && String(newDoctorId) !== String(oldDoctorId)) {
      targetDoctor = await Doctor.findById(newDoctorId);
      if (!targetDoctor) {
        return res.status(404).json({ message: 'Target doctor not found' });
      }

      // Remove from current doctor's activeQueue and currentToken
      if (queue) {
        if (queue.currentToken && String(queue.currentToken) === String(targetTokenId)) {
          queue.currentToken = null;
        }
        queue.activeQueue = queue.activeQueue.filter((id) => String(id) !== String(targetTokenId));
        await queue.save();
        await recalculateQueueTimes(oldDoctorId);
      }

      // Insert into new doctor's queue
      let newQueue = await Queue.findOne({ doctor: newDoctorId });
      if (!newQueue) {
        newQueue = new Queue({ doctor: newDoctorId, activeQueue: [] });
      }
      newQueue.activeQueue.push(token._id);
      await newQueue.save();

      token.doctor = newDoctorId;
      await recalculateQueueTimes(newDoctorId);
    } else {
      // Same doctor, remove from active cabin if it was currentToken
      if (queue && queue.currentToken && String(queue.currentToken) === String(targetTokenId)) {
        queue.currentToken = null;
        await queue.save();
        await recalculateQueueTimes(oldDoctorId);
      }
    }

    // Handle revisit / reschedule date
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
        hospital,
        scheduledDate,
        revisitDays: days,
        status: 'Pending',
        message: `Scheduled re-visit for ${token.patient.name || 'Patient'} with ${targetDoctor.name || 'Doctor'} on ${scheduledDate.toLocaleDateString()}.${reason ? ` Reason: ${reason}` : ''}`
      });
      await reminder.save();
    }

    token.status = 'Waiting';
    // Derived, not the literal 'Rescheduled' — see the matching note in
    // routes/staff.js. That string is not a member of STAGES, so this call used
    // to do nothing and the token kept the stage it already had.
    setStage(token, deriveStage(token), req.user.username || 'Doctor');
    await token.save();

    // Broadcast updates to all rooms
    if (req.io) {
      req.io.to('queue:global').emit('queue-updated', { doctorId: oldDoctorId });
      req.io.to(`doctor:${oldDoctorId}`).emit('queue-updated');
      if (newDoctorId) {
        req.io.to(`doctor:${newDoctorId}`).emit('queue-updated');
      }
      req.io.to(`hospital:${hospital}`).emit('queue-updated');
      req.io.to(`patient:${token._id}`).emit('token-called', {
        status: 'Rescheduled',
        doctorName: targetDoctor.name,
        roomName: targetDoctor.currentRoom || 'Cabin',
        scheduledDate: scheduledDate ? scheduledDate.toLocaleDateString() : null
      });
    }

    // Send WhatsApp notification to patient
    if (token.patient && token.patient.phone) {
      const msg =
        `📅 Appointment Update for ${token.patient.name || 'Patient'}: Your token ${token.tokenNumber} has been ${newDoctorId ? `transferred to ${targetDoctor.name}` : 'rescheduled'}` +
        `${scheduledDate ? ` for ${scheduledDate.toLocaleDateString()}` : ''}.${reason ? ` Reason: ${reason}` : ''}\n` +
        `✅ Details updated on your live tracker.`;
      try {
        await sendWhatsAppNotification(token.patient.phone, msg);
      } catch (waErr) {
        logger.error('Reschedule WhatsApp notification error', { err: waErr });
      }
    }

    await announceJourney(req.io, {
      hospital,
      token,
      stage: 'Rescheduled',
      role: 'doctor',
      actor: req.user.username || 'Doctor',
      type: 'token-rescheduled',
      message: `${token.tokenNumber} ${newDoctorId ? `transferred to ${targetDoctor.name}` : 'rescheduled'}${scheduledDate ? ` for ${scheduledDate.toLocaleDateString()}` : ''}.`,
      severity: 'info'
    });

    res.json({
      message: `Token ${token.tokenNumber} successfully ${newDoctorId ? `transferred to ${targetDoctor.name}` : 'rescheduled'}.`,
      token,
      targetDoctor: { id: targetDoctor._id, name: targetDoctor.name }
    });
  } catch (error: any) {
    logger.error('Error rescheduling patient token', { err: error });
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
module.exports = router;
