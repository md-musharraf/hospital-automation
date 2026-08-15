import Queue from '../models/Queue';
import Doctor from '../models/Doctor';
import Token from '../models/Token';
import logger from './logger';
import { startOfToday } from './dates';
import { shiftLeadMinutes, describeNextSitting } from './shiftHelper';

// How many front positions get a "your turn is near — please come now" ping.
// Positions 1 and 2 in the waiting line, so a patient can wait at home / outside
// and only travel in when they're about to be called (empties the OPD hall).
export const ARRIVAL_ALERT_THRESHOLD = 2;

// How far a patient's wait must move before it is worth a WhatsApp message.
//
// Small drifts are noise — a consultation running four minutes over is not news,
// and messaging it teaches patients to ignore the channel that also carries
// "you are next". Fifteen minutes is roughly the point at which someone would
// have left the house on the old estimate and been wrong.
export const WAIT_DRIFT_THRESHOLD = 15;

/** Guards against two tracker sweeps overlapping. See trackWaitingPatients. */
let trackerRunning = false;

/**
 * How long until this patient is seen, counting from when the doctor will
 * actually be in the room.
 *
 * `position * averageCheckupTime + buffer` alone assumes the doctor is sitting
 * right now. For a facility whose doctors keep two sittings that is wrong for
 * most of the day: at 2pm, between a 10–1 and a 5–8 OPD, the queue is empty and
 * the old sum answered "0 minutes" — the number in the bug report — for a cabin
 * nobody would enter for three hours.
 */
export function estimateWaitMinutes(
  doctor: any,
  position: number,
  buffer: number = 0,
  now: Date = new Date()
): number {
  const avg = (doctor && doctor.averageCheckupTime) || 10;
  const lead = shiftLeadMinutes(doctor, now);
  return Math.max(0, lead + position * avg + (buffer || 0));
}

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
    const buffer = queue.bufferDelay || 0;

    let pos = 0;
    for (let i = 0; i < queue.activeQueue.length; i++) {
      const token = queue.activeQueue[i];
      if (token && typeof token.save === 'function') {
        token.estimatedWaitTime = estimateWaitMinutes(doctor, pos, buffer);
        await token.save();
        pos++;
      } else if (token && (token._id || typeof token === 'string')) {
        const tokenId = token._id || token;
        const realToken = await (Token as any).findById(tokenId);
        if (realToken) {
          realToken.estimatedWaitTime = estimateWaitMinutes(doctor, pos, buffer);
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

/**
 * The patients still waiting on one doctor, in queue order, with their phones.
 *
 * Shared by the delay broadcast and the tracker so both agree on who "waiting"
 * means — a token that has been called, completed or marked absent is no longer
 * owed a queue update, and messaging it is how a patient who has already gone
 * home ends up being told to hurry in.
 */
function waitingOf(queue: any): any[] {
  if (!queue || !Array.isArray(queue.activeQueue)) return [];
  return queue.activeQueue.filter((t: any) => t && t.status === 'Waiting' && t.patient && t.patient.phone);
}

/** Load one doctor's queue with its tokens and patients resolved. */
async function populatedQueue(doctorId: string): Promise<any> {
  return (Queue as any).findOne({ doctor: doctorId }).populate({
    path: 'activeQueue',
    populate: { path: 'patient' }
  });
}

async function waitingWithPhones(doctorId: string): Promise<any[]> {
  return waitingOf(await populatedQueue(doctorId));
}

/** Bilingual, because the same queue serves both — matching the arrival alerts. */
function delayMessage(doctorName: string, minutes: number, reason: string, newTime: string): string {
  const because = reason ? ` (${reason})` : '';
  return (
    `⏳ ${doctorName} is running about ${minutes} min late today${because}.\n` +
    `Your new approximate turn: ${newTime}. Please come accordingly — you do not need to wait here.\n\n` +
    `⏳ ${doctorName} आज लगभग ${minutes} मिनट देर से हैं${because}।\n` +
    `आपका अनुमानित नया समय: ${newTime}। कृपया उसी अनुसार आएँ — यहाँ इंतज़ार करने की ज़रूरत नहीं।`
  );
}

/**
 * Tell everyone still waiting that the cabin is behind, with each patient's OWN
 * revised time.
 *
 * One broadcast with a single "we are 30 minutes late" line would be easier, but
 * it is not what any individual needs to know: the fourth patient in line cares
 * what time to leave the house, not what the queue's aggregate delay is. So the
 * message is per-token and carries that patient's recomputed clock time.
 *
 * Returns how many patients were actually reached, which the route reports back
 * so the doctor can see the announcement landed.
 */
export async function broadcastDelay(
  doctorId: string,
  options: { minutes?: number; reason?: string; io?: any } = {}
): Promise<number> {
  const { minutes = 0, reason = '', io } = options;
  try {
    const doctor = await (Doctor as any).findById(doctorId);
    const doctorName = (doctor && doctor.name) || 'Your doctor';
    const waiting = await waitingWithPhones(doctorId);
    if (waiting.length === 0) return 0;

    const { sendWhatsAppNotification } = require('./whatsappHelper');
    let sent = 0;

    for (const token of waiting) {
      const newTime = formatApptTime(token.estimatedWaitTime || 0);
      try {
        await sendWhatsAppNotification(
          token.patient.phone,
          delayMessage(doctorName, minutes, reason, newTime)
        );
        sent++;
      } catch (waErr) {
        // One unreachable patient must not silence the rest of the queue.
        logger.error('Delay notice WhatsApp error', { token: token.tokenNumber, err: waErr });
        continue;
      }

      // Record what they were told, so the tracker does not immediately repeat it.
      try {
        await (Token as any).findByIdAndUpdate(token._id, {
          lastNotifiedWait: token.estimatedWaitTime || 0,
          lastTrackedAt: new Date()
        });
      } catch (uErr) {
        logger.error('Delay notice bookkeeping error', { err: uErr });
      }

      if (io) {
        try {
          io.to(`patient:${token._id}`).emit('queue-delayed', {
            tokenNumber: token.tokenNumber,
            minutes,
            reason,
            estimatedWaitTime: token.estimatedWaitTime || 0
          });
        } catch (_) {}
      }
    }

    logger.info('[DELAY] Waiting patients notified', { doctorId, minutes, sent, of: waiting.length });
    return sent;
  } catch (err) {
    logger.error('Error broadcasting delay', { err });
    return 0;
  }
}

/**
 * The standing queue tracker: keep every waiting patient's estimate honest
 * without turning WhatsApp into a ticker.
 *
 * Runs on a timer over every active queue. A patient is messaged only when the
 * wait they are HOLDING — the figure last sent to them — has drifted past
 * WAIT_DRIFT_THRESHOLD. That comparison is against what they were told, not
 * against the previous computed value, so a queue that slips five minutes
 * twelve times still sends one message rather than none (each individual step
 * being under the threshold) or twelve (comparing against the last estimate).
 *
 * The first message a patient gets is at booking, so an unnotified token is
 * seeded from its current estimate instead of being messaged immediately.
 */
export async function trackWaitingPatients(io?: any): Promise<number> {
  // One sweep at a time, platform-wide.
  //
  // The caller is a setInterval, which does NOT wait for the previous run: this
  // walks every facility and awaits a WhatsApp per patient, so on a slow gateway
  // a sweep can outlast its own interval. Two overlapping sweeps read the same
  // not-yet-updated `lastNotifiedWait` and both decide to message — the patient
  // gets the identical update twice, from the feature whose entire purpose is to
  // stay under the noise threshold.
  if (trackerRunning) {
    logger.warn('[QUEUE-TRACKER] Previous sweep still running — skipping this tick');
    return 0;
  }
  trackerRunning = true;

  let notified = 0;
  try {
    // Queue is not tenant-owned (it hangs off a doctor), so this sweep is
    // deliberately platform-wide, like the close-of-day job.
    const queues = await (Queue as any).find({}).populate({
      path: 'activeQueue',
      populate: { path: 'patient' }
    });
    const { sendWhatsAppNotification } = require('./whatsappHelper');

    for (const queue of queues || []) {
      if (!queue || !queue.doctor || !Array.isArray(queue.activeQueue) || queue.activeQueue.length === 0) {
        continue;
      }

      const doctor = await (Doctor as any).findById(queue.doctor);
      if (!doctor) continue;
      const doctorName = doctor.name || 'Your doctor';
      const room = doctor.currentRoom || 'the cabin';

      // Already resolved by the find above — re-fetching per doctor turned one
      // query into one-per-cabin for no extra information.
      const waiting = waitingOf(queue);

      for (const token of waiting) {
        const current = Number(token.estimatedWaitTime) || 0;
        const told = token.lastNotifiedWait;

        // Never told anything yet: adopt the current figure silently. The
        // booking confirmation already carried it.
        if (told === null || told === undefined) {
          try {
            await (Token as any).findByIdAndUpdate(token._id, {
              lastNotifiedWait: current,
              lastTrackedAt: new Date()
            });
          } catch (_) {}
          continue;
        }

        if (Math.abs(current - Number(told)) < WAIT_DRIFT_THRESHOLD) continue;

        const later = current > Number(told);
        const sitting = describeNextSitting(doctor, new Date());
        const sittingLine = sitting ? `\n${doctorName} sits for ${sitting}.` : '';
        const msg = later
          ? `⏳ Update on token ${token.tokenNumber}: the queue has slowed down. ` +
            `New approximate turn: ${formatApptTime(current)} (about ${current} min).${sittingLine}\n` +
            `You can wait at home — we will message you when you are next.\n\n` +
            `⏳ टोकन ${token.tokenNumber} अपडेट: कतार धीमी है। नया अनुमानित समय: ${formatApptTime(current)}।`
          : `⚡ Good news for token ${token.tokenNumber} — the queue is moving faster. ` +
            `New approximate turn: ${formatApptTime(current)} (about ${current} min). ` +
            `Please plan to reach ${room} by then.\n\n` +
            `⚡ टोकन ${token.tokenNumber}: कतार तेज़ चल रही है। नया अनुमानित समय: ${formatApptTime(current)}।`;

        try {
          await sendWhatsAppNotification(token.patient.phone, msg);
          notified++;
        } catch (waErr) {
          logger.error('Queue tracker WhatsApp error', { token: token.tokenNumber, err: waErr });
          continue;
        }

        try {
          await (Token as any).findByIdAndUpdate(token._id, {
            lastNotifiedWait: current,
            lastTrackedAt: new Date()
          });
        } catch (_) {}

        if (io) {
          try {
            io.to(`patient:${token._id}`).emit('wait-updated', {
              tokenNumber: token.tokenNumber,
              estimatedWaitTime: current
            });
          } catch (_) {}
        }
      }
    }
  } catch (err) {
    logger.error('Error in trackWaitingPatients', { err });
  } finally {
    // In `finally` so a thrown sweep cannot wedge the tracker off permanently.
    trackerRunning = false;
  }
  return notified;
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
