const Queue = require('../models/Queue');
const Doctor = require('../models/Doctor');
const Token = require('../models/Token');
const logger = require('./logger');

// How many front positions get a "your turn is near — please come now" ping.
// Positions 1 and 2 in the waiting line, so a patient can wait at home / outside
// and only travel in when they're about to be called (empties the OPD hall).
const ARRIVAL_ALERT_THRESHOLD = 2;

// Format "minutes from now" into a friendly local clock time like "11:15 AM" so a
// booking can tell the patient roughly WHEN to come instead of making them wait.
function formatApptTime(minsFromNow) {
  const d = new Date(Date.now() + (Number(minsFromNow) || 0) * 60000);
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

async function recalculateQueueTimes(doctorId) {
  try {
    const queue = await Queue.findOne({ doctor: doctorId }).populate('activeQueue');
    if (!queue || !queue.activeQueue) return;

    const doctor = await Doctor.findById(doctorId);
    const avgTime = doctor ? doctor.averageCheckupTime || 10 : 10;
    const buffer = queue.bufferDelay || 0;

    let pos = 0;
    for (let i = 0; i < queue.activeQueue.length; i++) {
      const token = queue.activeQueue[i];
      if (token && typeof token.save === 'function') {
        token.estimatedWaitTime = pos * avgTime + buffer;
        await token.save();
        pos++;
      } else if (token && (token._id || typeof token === 'string')) {
        const tokenId = token._id || token;
        const realToken = await Token.findById(tokenId);
        if (realToken) {
          realToken.estimatedWaitTime = pos * avgTime + buffer;
          await realToken.save();
          pos++;
        }
      }
    }
  } catch (err) {
    logger.error('Error in recalculateQueueTimes', { err: err });
  }
}

// Smart Arrival Alerts — the crowd reducer. After the queue advances, WhatsApp the
// patients who have just moved into the top `ARRIVAL_ALERT_THRESHOLD` waiting slots
// (once each) so they know to head to the hospital NOW. Everyone else can keep
// waiting at home instead of physically crowding the OPD hall / reception counter.
//
// Lazy-requires whatsappHelper to avoid any load-order coupling, and is fully
// best-effort: a failure to notify never breaks the doctor's queue action.
async function notifyUpcomingPatients(doctorId, io) {
  try {
    const queue = await Queue.findOne({ doctor: doctorId }).populate({
      path: 'activeQueue',
      populate: { path: 'patient' }
    });
    if (!queue || !queue.activeQueue || queue.activeQueue.length === 0) return;

    const doctor = await Doctor.findById(doctorId);
    const room = (doctor && doctor.currentRoom) || 'the cabin';
    const { sendWhatsAppNotification } = require('./whatsappHelper');

    const frontTokens = queue.activeQueue.slice(0, ARRIVAL_ALERT_THRESHOLD);
    for (let i = 0; i < frontTokens.length; i++) {
      const token = frontTokens[i];
      if (!token || token.arrivalAlerted || token.status !== 'Waiting') continue;
      const patient = token.patient;
      if (!patient || !patient.phone) continue;

      const ahead = i; // 0 => next, 1 => one person ahead
      const aheadLine = ahead === 0 ? 'You are NEXT.' : `Only ${ahead} patient ahead of you.`;
      const msg =
        `🔔 ${aheadLine} Please reach ${room} now, token ${token.tokenNumber}.\n` +
        `🔔 अब आपकी बारी पास है — कृपया अभी ${room} पहुँच जाएँ (टोकन ${token.tokenNumber})।`;

      try {
        await sendWhatsAppNotification(patient.phone, msg);
      } catch (waErr) {
        logger.error('Arrival alert WhatsApp error', { err: waErr });
      }

      // Mark once so the patient is never pinged twice as the line shifts.
      // Update by id (not the populated doc) to stay safe under the mock DB.
      try {
        await Token.findByIdAndUpdate(token._id, { arrivalAlerted: true });
      } catch (uErr) {
        logger.error('Arrival alert flag update error', { err: uErr });
      }

      if (io) {
        try {
          io.to(`patient:${token._id}`).emit('arrival-alert', { tokenNumber: token.tokenNumber, ahead });
        } catch (_) {}
      }
    }
  } catch (err) {
    logger.error('Error in notifyUpcomingPatients', { err: err });
  }
}

// Priority tier of a token: lower = seen sooner. Emergency always first, then the
// vulnerable-group priority tokens (senior/pregnant/disabled), then everyone else.
function tokenTier(t) {
  if (!t) return 2;
  if (t.tokenType === 'Emergency') return 0;
  if (t.priorityCategory && t.priorityCategory !== 'None') return 1;
  return 2;
}

// Insert a freshly-created token into the doctor's activeQueue at the right spot by
// priority tier, preserving FIFO order WITHIN each tier. A regular token just goes
// to the back; a priority/emergency token slots in ahead of the first token of a
// lower tier (so it never jumps an equal-or-higher-priority patient already waiting).
async function insertTokenByPriority(queue, token) {
  const tier = tokenTier(token);
  if (tier === 2 || !queue.activeQueue || queue.activeQueue.length === 0) {
    queue.activeQueue.push(token._id);
    return;
  }
  let tierById = new Map();
  try {
    const existing = await Token.find({ _id: { $in: queue.activeQueue } });
    tierById = new Map(existing.map((e) => [String(e._id), tokenTier(e)]));
  } catch (_) {
    /* fall back to append on any lookup issue */
  }

  let idx = queue.activeQueue.findIndex((id) => {
    const t = tierById.has(String(id)) ? tierById.get(String(id)) : 2;
    return t > tier;
  });
  if (idx === -1) idx = queue.activeQueue.length;
  queue.activeQueue.splice(idx, 0, token._id);
}

// Start-of-today boundary in server local time.
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// How many OPD tokens this doctor has taken today (excluding no-shows, which free
// their slot back up). Used for the daily capacity cutoff.
async function getTodayTokenCount(doctorId) {
  try {
    // Fetch by doctor + status (safe on both real Mongo and the in-memory mock),
    // then filter the date in JS. Doing the createdAt >= today comparison here —
    // rather than inside the query — avoids the mock storing createdAt as an ISO
    // string, which breaks a raw `{ createdAt: { $gte: Date } }` comparison.
    const start = startOfToday().getTime();
    const toks = await Token.find({ doctor: doctorId, status: { $ne: 'Absent' } });
    return (toks || []).filter((t) => t.createdAt && new Date(t.createdAt).getTime() >= start).length;
  } catch (_) {
    return 0;
  }
}

// Is this doctor at/over their daily token limit? (0 limit = unlimited => never full.)
async function isDoctorFull(doctor) {
  if (!doctor) return false;
  const limit = doctor.dailyTokenLimit || 0;
  if (limit <= 0) return false;
  const count = await getTodayTokenCount(doctor._id);
  return count >= limit;
}

module.exports = {
  recalculateQueueTimes,
  notifyUpcomingPatients,
  formatApptTime,
  ARRIVAL_ALERT_THRESHOLD,
  tokenTier,
  insertTokenByPriority,
  getTodayTokenCount,
  isDoctorFull
};
