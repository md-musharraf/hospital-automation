const Queue = require('../models/Queue');
const Doctor = require('../models/Doctor');
const Token = require('../models/Token');

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
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

async function recalculateQueueTimes(doctorId) {
  try {
    const queue = await Queue.findOne({ doctor: doctorId }).populate('activeQueue');
    if (!queue || !queue.activeQueue) return;

    const doctor = await Doctor.findById(doctorId);
    const avgTime = doctor ? (doctor.averageCheckupTime || 10) : 10;
    const buffer = queue.bufferDelay || 0;

    let pos = 0;
    for (let i = 0; i < queue.activeQueue.length; i++) {
      const token = queue.activeQueue[i];
      if (token && typeof token.save === 'function') {
        token.estimatedWaitTime = (pos * avgTime) + buffer;
        await token.save();
        pos++;
      } else if (token && (token._id || typeof token === 'string')) {
        const tokenId = token._id || token;
        const realToken = await Token.findById(tokenId);
        if (realToken) {
          realToken.estimatedWaitTime = (pos * avgTime) + buffer;
          await realToken.save();
          pos++;
        }
      }
    }
  } catch (err) {
    console.error('Error in recalculateQueueTimes:', err);
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
      const aheadLine = ahead === 0
        ? 'You are NEXT.'
        : `Only ${ahead} patient ahead of you.`;
      const msg =
        `🔔 ${aheadLine} Please reach ${room} now, token ${token.tokenNumber}.\n` +
        `🔔 अब आपकी बारी पास है — कृपया अभी ${room} पहुँच जाएँ (टोकन ${token.tokenNumber})।`;

      try {
        await sendWhatsAppNotification(patient.phone, msg);
      } catch (waErr) {
        console.error('Arrival alert WhatsApp error:', waErr);
      }

      // Mark once so the patient is never pinged twice as the line shifts.
      // Update by id (not the populated doc) to stay safe under the mock DB.
      try {
        await Token.findByIdAndUpdate(token._id, { arrivalAlerted: true });
      } catch (uErr) {
        console.error('Arrival alert flag update error:', uErr);
      }

      if (io) {
        try { io.to(`patient:${token._id}`).emit('arrival-alert', { tokenNumber: token.tokenNumber, ahead }); } catch (_) {}
      }
    }
  } catch (err) {
    console.error('Error in notifyUpcomingPatients:', err);
  }
}

module.exports = { recalculateQueueTimes, notifyUpcomingPatients, formatApptTime, ARRIVAL_ALERT_THRESHOLD };
