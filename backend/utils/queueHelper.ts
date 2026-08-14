import Queue from '../models/Queue';
import Doctor from '../models/Doctor';
import Token from '../models/Token';
import logger from './logger';
import { startOfToday } from './dates';

// How many front positions get a "your turn is near — please come now" ping.
// Positions 1 and 2 in the waiting line, so a patient can wait at home / outside
// and only travel in when they're about to be called (empties the OPD hall).
export const ARRIVAL_ALERT_THRESHOLD = 2;

// Format "minutes from now" into a friendly local clock time like "11:15 AM" so a
// booking can tell the patient roughly WHEN to come instead of making them wait.
export function formatApptTime(minsFromNow?: number | string | null): string {
  const d = new Date(Date.now() + (Number(minsFromNow) || 0) * 60000);
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

export async function recalculateQueueTimes(doctorId: string): Promise<void> {
  try {
    const queue = await (Queue as any).findOne({ doctor: doctorId }).populate('activeQueue');
    if (!queue || !queue.activeQueue) return;

    const doctor = await (Doctor as any).findById(doctorId);
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
        const realToken = await (Token as any).findById(tokenId);
        if (realToken) {
          realToken.estimatedWaitTime = pos * avgTime + buffer;
          await realToken.save();
          pos++;
        }
      }
    }
  } catch (err) {
    logger.error('Error in recalculateQueueTimes', { err });
  }
}

// Smart Arrival Alerts — the crowd reducer. After the queue advances, WhatsApp the
// patients who have just moved into the top `ARRIVAL_ALERT_THRESHOLD` waiting slots
// (once each) so they know to head to the hospital NOW. Everyone else can keep
// waiting at home instead of physically crowding the OPD hall / reception counter.
export async function notifyUpcomingPatients(doctorId: string, io?: any): Promise<void> {
  try {
    const queue = await (Queue as any).findOne({ doctor: doctorId }).populate({
      path: 'activeQueue',
      populate: { path: 'patient' }
    });
    if (!queue || !queue.activeQueue || queue.activeQueue.length === 0) return;

    const doctor = await (Doctor as any).findById(doctorId);
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
        await (Token as any).findByIdAndUpdate(token._id, { arrivalAlerted: true });
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
    logger.error('Error in notifyUpcomingPatients', { err });
  }
}

// Priority tier of a token: lower = seen sooner. Emergency always first, then the
// vulnerable-group priority tokens (senior/pregnant/disabled), then everyone else.
export function tokenTier(t?: any): number {
  if (!t) return 2;
  if (t.tokenType === 'Emergency') return 0;
  if (t.priorityCategory && t.priorityCategory !== 'None') return 1;
  return 2;
}

// Insert a freshly-created token into the doctor's activeQueue at the right spot by
// priority tier, preserving FIFO order WITHIN each tier. A regular token just goes
// to the back; a priority/emergency token slots in ahead of the first token of a
// lower tier (so it never jumps an equal-or-higher-priority patient already waiting).
export async function insertTokenByPriority(queue: any, token: any): Promise<void> {
  const tier = tokenTier(token);
  if (tier === 2 || !queue.activeQueue || queue.activeQueue.length === 0) {
    queue.activeQueue.push(token._id);
    return;
  }
  let tierById = new Map<string, number>();
  try {
    const existing = await (Token as any).find({ _id: { $in: queue.activeQueue } });
    tierById = new Map(existing.map((e: any) => [String(e._id), tokenTier(e)]));
  } catch (_) {
    /* fall back to append on any lookup issue */
  }

  let idx = queue.activeQueue.findIndex((id: any) => {
    const t = tierById.has(String(id)) ? (tierById.get(String(id)) as number) : 2;
    return t > tier;
  });
  if (idx === -1) idx = queue.activeQueue.length;
  queue.activeQueue.splice(idx, 0, token._id);
}

// How many OPD tokens this doctor has taken today (excluding no-shows, which free
// their slot back up). Used for the daily capacity cutoff.
export async function getTodayTokenCount(doctorId: string): Promise<number> {
  try {
    const start = startOfToday().getTime();
    const toks = await (Token as any).find({ doctor: doctorId, status: { $ne: 'Absent' } });
    return (toks || []).filter((t: any) => t.createdAt && new Date(t.createdAt).getTime() >= start).length;
  } catch (_) {
    return 0;
  }
}

// Is this doctor at/over their daily token limit? (0 limit = unlimited => never full.)
export async function isDoctorFull(doctor: any): Promise<boolean> {
  if (!doctor) return false;
  const limit = doctor.dailyTokenLimit || 0;
  if (limit <= 0) return false;
  const count = await getTodayTokenCount(doctor._id);
  return count >= limit;
}
