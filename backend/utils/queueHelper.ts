import Queue from '../models/Queue';
import Doctor from '../models/Doctor';
import Token from '../models/Token';
import logger from './logger';
import { startOfToday } from './dates';
import { shiftLeadMinutes, describeNextSitting, delayNotice, todayOpdHours } from './shiftHelper';

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

/**
 * Minutes added on top of whatever travel time the patient stated, before the
 * "leave now" message goes out.
 *
 * Getting ready, finding the vehicle, parking, walking in from the gate. Ten
 * minutes is also what a patient standing at the hospital already gets, which is
 * why the near case and the far case need no separate rule: someone ten minutes
 * away is told twenty minutes before their turn, someone an hour away is told
 * an hour and ten minutes before, and both are the same sum.
 */
export const PREP_BUFFER_MINUTES = 10;

/**
 * How often `trackWaitingPatients` is swept, in minutes. Exported because
 * `index.ts` schedules on it AND the departure check looks this far ahead — a
 * sweep that only fired on tokens already past their departure time would send
 * every alert up to one full interval LATE, which for the patient an hour away
 * is the whole point of the feature missed.
 *
 * Erring early is free (they leave a few minutes sooner); erring late costs
 * them their turn.
 */
export const QUEUE_SWEEP_MINUTES = 10;

/**
 * The longest stated travel time we will act on.
 *
 * Beyond this the honest answer is not "we will alert you at 4am" but "you
 * cannot reach today's OPD" — the booking flow says so at the time of booking
 * instead of scheduling a departure alert nobody can act on.
 */
export const MAX_TRAVEL_MINUTES = 8 * 60;

/** How many times one token may be pushed back before staff must deal with it. */
export const MAX_DEFERS = 3;

/** Slack after the stated travel time before a patient stops counting as en route. */
const IN_TRANSIT_GRACE = 10;

/** Guards against two tracker sweeps overlapping. See trackWaitingPatients. */
let trackerRunning = false;

/**
 * The least we will ever tell someone who is behind an occupied cabin.
 *
 * A consultation that has already run past the average is not about to end this
 * second, and "0 min" for a patient who cannot possibly be called yet is the
 * single answer that destroys trust in every other number on the screen.
 */
export const MIN_CABIN_REMAINDER = 2;

/** Consultations needed before today's measured pace is worth listening to. */
const MIN_PACE_SAMPLES = 3;

/** How many recent consultations the measured pace is drawn from. */
const PACE_WINDOW = 8;

/** Consultation lengths outside this band are data, not medicine. */
const PACE_FLOOR = 2;
const PACE_CEILING = 120;

/**
 * What the queue knows about how fast this cabin is moving right now.
 *
 * Both numbers are optional and both default to "assume nothing", so a caller
 * that has not looked them up gets exactly the old arithmetic.
 */
export interface WaitContext {
  /** Minutes left on the consultation happening right now. 0 when the cabin is empty. */
  inCabinRemaining?: number;
  /** Minutes per patient this doctor is actually taking today, when measured. */
  paceMinutes?: number;
  /** Evaluation instant. */
  now?: Date;
}

/** Accept the legacy 4th argument (a bare Date) as well as a context object. */
function asContext(input: WaitContext | Date | undefined): WaitContext {
  if (!input) return {};
  return input instanceof Date ? { now: input } : input;
}

/**
 * How long until this patient is seen, counting from when the doctor will
 * actually be in the room.
 *
 * `position * averageCheckupTime + buffer` alone assumes the doctor is sitting
 * right now. For a facility whose doctors keep two sittings that is wrong for
 * most of the day: at 2pm, between a 10–1 and a 5–8 OPD, the queue is empty and
 * the old sum answered "0 minutes" — the number in the bug report — for a cabin
 * nobody would enter for three hours.
 *
 * It also assumed the cabin was empty. `position` counts the people in front of
 * you IN THE LINE, and the person actually inside the room is not in the line —
 * so the patient at the front was told "0 min" while somebody else's
 * consultation was still running. The remainder of that consultation is
 * `inCabinRemaining`, and it is added only while the doctor is sitting, because
 * a cabin that has not opened yet has nobody in it to finish with.
 */
export function estimateWaitMinutes(
  doctor: any,
  position: number,
  buffer: number = 0,
  context: WaitContext | Date = {}
): number {
  const ctx = asContext(context);
  const now = ctx.now || new Date();
  const avg = ctx.paceMinutes || (doctor && doctor.averageCheckupTime) || 10;
  const lead = shiftLeadMinutes(doctor, now);
  // Waiting for the doors to open subsumes waiting for the current patient.
  const cabin = lead > 0 ? 0 : Math.max(0, ctx.inCabinRemaining || 0);
  return Math.max(0, lead + cabin + position * avg + (buffer || 0));
}

/**
 * Minutes per patient this doctor is REALLY taking today.
 *
 * `averageCheckupTime` is a number somebody typed once during onboarding. A
 * doctor configured at 10 minutes who is spending 18 leaves the fifth patient
 * in line holding an estimate that is forty minutes short, and they find that
 * out by sitting in the corridor — which is the exact behaviour this product
 * exists to remove.
 *
 * Measured from called → completed on today's finished consultations. The
 * configured figure is not discarded: it is blended in, weighted down as
 * evidence accumulates, so the first slow patient of the morning does not
 * rewrite the whole board and a cabin with no history behaves as it always did.
 */
export function paceFromTokens(tokens: any[], doctorId: any, configured: number = 10): number {
  const fallback = Math.max(1, configured || 10);
  const wanted = String((doctorId && (doctorId._id || doctorId)) || '');
  const start = startOfToday().getTime();

  const durations = (tokens || [])
    .filter(
      (t: any) =>
        t &&
        t.status === 'Completed' &&
        t.calledAt &&
        t.completedAt &&
        String((t.doctor && t.doctor._id) || t.doctor || '') === wanted &&
        new Date(t.completedAt).getTime() >= start
    )
    .sort((a: any, b: any) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime())
    .map((t: any) => (new Date(t.completedAt).getTime() - new Date(t.calledAt).getTime()) / 60000)
    // A consultation that reads as negative, instant or half a day long is a
    // clock or a forgotten "complete" button, not a measurement.
    .filter((mins: number) => mins >= PACE_FLOOR && mins <= PACE_CEILING)
    .slice(-PACE_WINDOW);

  if (durations.length < MIN_PACE_SAMPLES) return fallback;

  const measured = durations.reduce((a: number, b: number) => a + b, 0) / durations.length;
  // 3 samples → measured counts for 3/8ths; a full window → 3/4.
  const weight = Math.min(durations.length, PACE_WINDOW - 2) / PACE_WINDOW;
  const blended = measured * weight + fallback * (1 - weight);

  return Math.min(PACE_CEILING, Math.max(PACE_FLOOR, Math.round(blended)));
}

export async function measuredPaceMinutes(doctorId: any, configured: number = 10): Promise<number> {
  try {
    const finished = (await (Token as any).find({ doctor: doctorId, status: 'Completed' })) || [];
    return paceFromTokens(finished, doctorId, configured);
  } catch (err) {
    logger.error('Could not measure consultation pace', { err, doctorId: String(doctorId) });
    return Math.max(1, configured || 10);
  }
}

/**
 * Minutes left on the consultation currently under way, from an already-loaded
 * token. Returns 0 when the cabin is empty.
 */
export function cabinRemainingFrom(currentToken: any, pace: number, now: Date = new Date()): number {
  if (!currentToken) return 0;
  if (currentToken.status && currentToken.status !== 'Active' && currentToken.status !== 'Called') return 0;

  const calledAt = currentToken.calledAt ? new Date(currentToken.calledAt).getTime() : 0;
  if (!calledAt) return Math.max(MIN_CABIN_REMAINDER, Math.round(pace));

  const elapsed = (now.getTime() - calledAt) / 60000;
  return Math.max(MIN_CABIN_REMAINDER, Math.round(pace - elapsed));
}

/** Same, for a queue whose `currentToken` is still just an id. */
export async function cabinRemainingFor(queue: any, pace: number, now: Date = new Date()): Promise<number> {
  if (!queue || !queue.currentToken) return 0;
  try {
    const current =
      typeof queue.currentToken === 'object' && queue.currentToken.status !== undefined
        ? queue.currentToken
        : await (Token as any).findById(queue.currentToken);
    return cabinRemainingFrom(current, pace, now);
  } catch (err) {
    logger.error('Could not read the in-cabin token for a wait estimate', { err });
    return 0;
  }
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

// ---------------------------------------------------------------------------
// TRAVEL TIME — the difference between "your turn is near" and "leave now".
//
// The arrival alert fires on QUEUE POSITION: you are in the top two, come now.
// For the patient standing outside that is exactly right, and for the patient
// two hours away it is useless — by the time they are second in line their turn
// is twenty minutes off and their journey is a hundred and twenty. They lose
// the token, and the lesson they take is to come at 6am and wait all day, which
// is the crowd this system exists to remove.
//
// So the patient is asked ONE question when they book — how long do you need to
// get here — and every departure alert is that number plus a prep buffer,
// counted back from their own estimated turn. Nothing here guesses: a patient
// who was never asked keeps the old position-based behaviour exactly.
// ---------------------------------------------------------------------------

/** Words a patient actually types when they mean "I am already here". */
const HERE_PATTERNS =
  /(here|at the hospital|already|outside|reception|counter|यहीं|यहाँ|यहां|पहुँच|पहुंच|अस्पताल में)/i;

/**
 * Read a stated travel time out of whatever the patient sent.
 *
 * Accepts the option buttons, a bare number of minutes, and the forms people
 * type unprompted — "30 min", "1 hour", "1 ghanta", "aadha ghanta", "2.5 hrs",
 * "डेढ़ घंटा". Returns null when there is no answer in the text at all, which
 * the callers treat as "not stated" rather than as zero: zero is a claim (I am
 * at the gate) and getting that wrong sends someone an alert twenty minutes
 * before a turn they cannot possibly reach.
 */
export function parseTravelMinutes(input: any): number | null {
  if (input === null || input === undefined) return null;

  if (typeof input === 'number') {
    if (!isFinite(input) || input < 0) return null;
    return Math.min(MAX_TRAVEL_MINUTES, Math.round(input));
  }

  const text = String(input).trim().toLowerCase();
  if (!text) return null;

  // "I'm already at the hospital" — a real answer, and the answer is zero.
  if (HERE_PATTERNS.test(text)) return 0;

  // Halves and one-and-a-halves, which are how hours are actually spoken here.
  if (/(aadha|आधा|आधे|half)/.test(text) && /(hour|hr|ghanta|घंट)/.test(text)) return 30;
  if (/(dedh|ded|डेढ़|डेढ)/.test(text)) return 90;

  const number = text.match(/\d+(\.\d+)?/);
  if (!number) return null;

  const value = parseFloat(number[0]);
  if (!isFinite(value) || value < 0) return null;

  const isHours = /(hour|hrs|hr|ghanta|ghante|घंट|घण्ट)/.test(text);
  const minutes = Math.round(isHours ? value * 60 : value);

  return Math.min(MAX_TRAVEL_MINUTES, Math.max(0, minutes));
}

/** The stated travel time on a token, or null when nobody was asked. */
export function travelMinutesOf(token: any): number | null {
  if (!token) return null;
  const value = token.travelMinutes;
  if (value === null || value === undefined || value === '') return null;
  const minutes = Number(value);
  if (!isFinite(minutes) || minutes < 0) return null;
  return Math.min(MAX_TRAVEL_MINUTES, Math.round(minutes));
}

/**
 * The wait at which this patient must set off: their travel time plus the prep
 * buffer. Null when there is nothing to act on — either nobody was asked, or
 * they are already at the hospital, in which case the existing "you are next"
 * ping is the right and only message.
 */
export function departureDueMinutes(token: any): number | null {
  const travel = travelMinutesOf(token);
  if (travel === null || travel <= 0) return null;
  return travel + PREP_BUFFER_MINUTES;
}

/**
 * Is this alert due on THIS sweep?
 *
 * Looks one sweep interval ahead deliberately — see QUEUE_SWEEP_MINUTES. A
 * patient whose departure moment falls between two sweeps is told at the
 * earlier one.
 */
export function departureDue(
  token: any,
  waitMinutes: number,
  lookahead: number = QUEUE_SWEEP_MINUTES
): boolean {
  if (!token || token.departureAlerted) return false;
  if (token.status && token.status !== 'Waiting') return false;
  const due = departureDueMinutes(token);
  if (due === null) return false;
  return Number(waitMinutes) <= due + lookahead;
}

/**
 * The clock time this patient should leave home, as a string they can read.
 * Returns 'now' once that moment has passed, which is the honest answer for
 * someone booking from further away than their remaining wait.
 */
export function leaveByLabel(waitMinutes: number, travelMinutes: number | null): string {
  if (travelMinutes === null || travelMinutes <= 0) return '';
  const lead = Number(waitMinutes) - travelMinutes - PREP_BUFFER_MINUTES;
  return lead <= 0 ? 'now' : formatApptTime(lead);
}

/**
 * Has this patient been told to leave, and could they still plausibly be on the
 * road?
 *
 * The cabin needs this to tell a no-show from a patient who is doing exactly
 * what we asked. Marking the second one absent — or letting the doctor sit idle
 * waiting for them — is the failure this whole feature would otherwise create,
 * because it is the system, not the patient, that chose when they set off.
 */
export function isInTransit(token: any, now: Date = new Date()): boolean {
  if (!token || !token.departureAlerted || !token.departureAlertedAt) return false;
  const travel = travelMinutesOf(token);
  if (travel === null || travel <= 0) return false;
  const arriveBy = new Date(token.departureAlertedAt).getTime() + (travel + IN_TRANSIT_GRACE) * 60000;
  return now.getTime() < arriveBy;
}

/**
 * How far back a no-show should be placed to give them a REAL second chance.
 *
 * Three slots is right for someone who stepped out to the chemist. For a patient
 * we told to leave home fifty minutes ago it is not a second chance at all —
 * they are placed back in a line that will reach them again before they arrive,
 * and the same miss repeats until the token is finally cancelled. So the offset
 * is at least far enough to cover the journey they still have left.
 */
export function recallOffsetFor(token: any, paceMinutes: number = 10, now: Date = new Date()): number {
  const base = 3;
  if (!isInTransit(token, now)) return base;

  const travel = travelMinutesOf(token) as number;
  const arriveBy = new Date(token.departureAlertedAt).getTime() + travel * 60000;
  const remaining = Math.max(0, (arriveBy - now.getTime()) / 60000);
  const pace = Math.max(PACE_FLOOR, paceMinutes || 10);

  return Math.max(base, Math.ceil(remaining / pace));
}

/** Bilingual "set off now" notice. The clock times are this patient's own. */
function departureMessage(opts: {
  tokenNumber: string;
  doctorName: string;
  room: string;
  waitMinutes: number;
  travelMinutes: number;
  sitting: string;
}): string {
  const { tokenNumber, doctorName, room, waitMinutes, travelMinutes, sitting } = opts;
  const turn = formatApptTime(waitMinutes);
  const sittingEn = sitting ? `\n${doctorName} sits for ${sitting}.` : '';
  const sittingHi = sitting ? `\n${doctorName}: ${sitting}।` : '';

  return (
    `🚗 Time to set off — token ${tokenNumber}.\n` +
    `Your turn with ${doctorName} is about ${turn} (${waitMinutes} min from now), and you told us you need about ${travelMinutes} min to reach.` +
    `${sittingEn}\nPlease leave now and come straight to ${room}.\n\n` +
    `🚗 अब निकलने का समय — टोकन ${tokenNumber}।\n` +
    `${doctorName} के पास आपकी बारी लगभग ${turn} बजे है, और आपने बताया था कि आपको पहुँचने में करीब ${travelMinutes} मिनट लगते हैं।` +
    `${sittingHi}\nकृपया अभी निकलें और सीधे ${room} पहुँचें।`
  );
}

/**
 * WhatsApp everyone on this cabin's line whose departure moment has arrived.
 *
 * Takes an already-populated queue rather than doing its own lookups, so it can
 * be called from BOTH the ten-minute sweep and every queue advance without
 * doubling the database work. It is flag-guarded, so calling it from both is
 * safe — the extra call site exists because a fast-moving cabin can eat ten
 * minutes of queue between two sweeps, and being alerted late is the one
 * failure mode this feature cannot have.
 */
export async function sendDepartureAlerts(doctor: any, waiting: any[], io?: any): Promise<number> {
  if (!doctor || !Array.isArray(waiting) || waiting.length === 0) return 0;

  const { sendWhatsAppNotification } = require('./whatsappHelper');
  const doctorName = doctor.name || 'Your doctor';
  const room = doctor.currentRoom || 'the cabin';
  const sitting = describeNextSitting(doctor, new Date());
  let sent = 0;

  for (const token of waiting) {
    const wait = Number(token.estimatedWaitTime) || 0;
    if (!departureDue(token, wait)) continue;

    const patient = token.patient;
    if (!patient || !patient.phone) continue;

    const travel = travelMinutesOf(token) as number;
    try {
      await sendWhatsAppNotification(
        patient.phone,
        departureMessage({
          tokenNumber: token.tokenNumber,
          doctorName,
          room,
          waitMinutes: wait,
          travelMinutes: travel,
          sitting
        })
      );
      sent++;
    } catch (waErr) {
      // Leave the flag unset so the next sweep tries again — an undelivered
      // "leave now" is the one message worth retrying.
      logger.error('Departure alert WhatsApp error', { token: token.tokenNumber, err: waErr });
      continue;
    }

    // Mark by id, not on the populated doc, to stay mock-DB safe. The wait is
    // recorded as "told" as well, because this message quotes it — without that
    // the drift tracker would immediately follow it with an update saying the
    // same number.
    const stamp = { departureAlerted: true, departureAlertedAt: new Date(), lastNotifiedWait: wait };
    try {
      await (Token as any).findByIdAndUpdate(token._id, stamp);
      Object.assign(token, stamp);
    } catch (uErr) {
      logger.error('Departure alert flag update error', { err: uErr });
    }

    if (io) {
      try {
        io.to(`patient:${token._id}`).emit('departure-alert', {
          tokenNumber: token.tokenNumber,
          estimatedWaitTime: wait,
          travelMinutes: travel
        });
      } catch (_) {}
    }
  }

  if (sent > 0) logger.info('[DEPARTURE] Patients told to set off', { doctor: String(doctor._id), sent });
  return sent;
}

/**
 * Take the next PATIENT off the front of a cabin's line.
 *
 * The front entry and the next patient are not the same thing. A token can stop
 * waiting without leaving `activeQueue` — completed or marked absent down a path
 * that only touched the token document, moved to another cabin, deleted outright.
 * `recalculateQueueTimes` already steps over those when it numbers positions, so
 * the board shows the line correctly while the array still holds the corpse; a
 * cabin that calls index 0 blindly then opens for somebody who has already been
 * seen, and the patient holding the lowest live token sits through it. A token
 * number that does not decide who goes first is not a token number.
 *
 * Walks forward to the first genuinely waiting token and reports what it passed,
 * so a queue that is quietly accumulating dead entries is visible in the log
 * rather than only in the corridor. Mutates `queue.activeQueue`; the caller
 * saves, because it has other changes to write in the same breath.
 */
export async function takeNextWaiting(queue: any): Promise<{ token: any; skipped: string[] }> {
  const skipped: string[] = [];
  if (!queue || !Array.isArray(queue.activeQueue)) return { token: null, skipped };

  while (queue.activeQueue.length > 0) {
    const nextId = queue.activeQueue.shift();
    let candidate: any = null;
    try {
      candidate = await (Token as any).findById(nextId).populate('patient');
    } catch (err) {
      logger.error('Could not read the next token in a queue', { err });
    }

    if (candidate && candidate.status === 'Waiting') return { token: candidate, skipped };
    skipped.push(String((candidate && candidate.tokenNumber) || nextId));
  }

  return { token: null, skipped };
}

/**
 * Move one waiting token back `slots` places, pulling everyone behind it up.
 *
 * The queue's answer to a patient who is not at the door when their turn comes:
 * the alternative is a doctor sitting in an empty room while a full corridor
 * waits, and a patient who travelled an hour losing their place outright. This
 * costs the late patient a few minutes and costs the cabin nothing.
 *
 * Pure queue surgery — the caller recalculates the estimates and does the
 * messaging, because doctor and reception announce it differently.
 */
export async function deferToken(
  doctorId: any,
  tokenId: any,
  slots: number = 2
): Promise<{ moved: boolean; from: number; to: number; promoted: any[]; reason?: string }> {
  const none = { moved: false, from: -1, to: -1, promoted: [] as any[] };
  try {
    const queue = await (Queue as any).findOne({ doctor: doctorId });
    if (!queue || !Array.isArray(queue.activeQueue)) return { ...none, reason: 'no-queue' };

    const from = queue.activeQueue.findIndex(
      (id: any) => String(id && id._id ? id._id : id) === String(tokenId)
    );
    if (from === -1) return { ...none, reason: 'not-in-queue' };

    const step = Math.max(1, Math.round(Number(slots) || 0));
    const to = Math.min(from + step, queue.activeQueue.length - 1);
    if (to === from) return { ...none, from, reason: 'already-last' };

    // Who gains from this — the patients between the old and new position all
    // move up one, and the first of them is now at the front.
    const promoted = queue.activeQueue.slice(from + 1, to + 1);

    const [entry] = queue.activeQueue.splice(from, 1);
    queue.activeQueue.splice(to, 0, entry);
    await queue.save();

    return { moved: true, from, to, promoted };
  } catch (err) {
    logger.error('Error deferring a token', { err, tokenId: String(tokenId) });
    return { ...none, reason: 'error' };
  }
}

/**
 * Push a patient back, pull the queue up, and tell everyone affected — the whole
 * operation, so the doctor's console and reception cannot do half of it each.
 *
 * The deferred patient is told their new time (they are usually on the road, and
 * "you have lost your slot" would be both wrong and cruel); the patients who
 * moved up are handled by the ordinary recalculation and the front-of-queue
 * ping, which is exactly the path they would have taken anyway.
 *
 * Refuses past MAX_DEFERS. A token that keeps being pushed back is not a timing
 * problem any more — somebody has to decide whether that patient is coming at
 * all, and quietly sliding them down the line all afternoon hides that decision.
 */
export async function applyDeferral(
  doctorId: any,
  tokenId: any,
  options: { slots?: number; io?: any; actor?: string } = {}
): Promise<{ ok: boolean; reason?: string; token?: any; from?: number; to?: number; notified?: number }> {
  const { slots = 2, io, actor = 'Staff' } = options;

  const token = await (Token as any).findById(tokenId).populate('patient');
  if (!token) return { ok: false, reason: 'not-found' };
  if (token.status !== 'Waiting') return { ok: false, reason: 'not-waiting' };
  if ((token.deferCount || 0) >= MAX_DEFERS) return { ok: false, reason: 'defer-limit', token };

  const result = await deferToken(doctorId, tokenId, slots);
  if (!result.moved) return { ok: false, reason: result.reason || 'not-moved', token };

  try {
    await (Token as any).findByIdAndUpdate(token._id, {
      deferCount: (token.deferCount || 0) + 1,
      // They will pass the front of the queue again, and when they do the
      // "you are next" ping has to be able to fire a second time.
      arrivalAlerted: false
    });
  } catch (uErr) {
    logger.error('Defer bookkeeping error', { err: uErr });
  }

  await recalculateQueueTimes(doctorId);

  const fresh = (await (Token as any).findById(token._id)) || token;
  const doctor = await (Doctor as any).findById(doctorId);
  const room = (doctor && doctor.currentRoom) || 'the cabin';
  const newTime = formatApptTime(fresh.estimatedWaitTime || 0);

  let notified = 0;
  if (token.patient && token.patient.phone) {
    const { sendWhatsAppNotification } = require('./whatsappHelper');
    const msg =
      `🔄 Token ${token.tokenNumber}: you were not at ${room} when your turn came, so we have moved you a few places back ` +
      `rather than cancel you. Your new approximate turn: ${newTime}. Please come straight to ${room}.\n\n` +
      `🔄 टोकन ${token.tokenNumber}: आपकी बारी पर आप ${room} पर नहीं थे, इसलिए टोकन रद्द करने के बजाय आपको कुछ नंबर पीछे कर दिया गया है। ` +
      `आपका नया अनुमानित समय: ${newTime}। कृपया सीधे ${room} पहुँचें।`;
    try {
      await sendWhatsAppNotification(token.patient.phone, msg);
      notified = 1;
      await (Token as any).findByIdAndUpdate(token._id, {
        lastNotifiedWait: fresh.estimatedWaitTime || 0,
        lastTrackedAt: new Date()
      });
    } catch (waErr) {
      logger.error('Defer notice WhatsApp error', { token: token.tokenNumber, err: waErr });
    }
  }

  // Whoever is now at the front needs to know they are up next.
  await notifyUpcomingPatients(String(doctorId), io);

  if (io) {
    try {
      io.to(`patient:${token._id}`).emit('token-deferred', {
        tokenNumber: token.tokenNumber,
        position: (result.to as number) + 1,
        estimatedWaitTime: fresh.estimatedWaitTime || 0
      });
      io.to(`doctor:${doctorId}`).emit('queue-updated');
      io.to('queue:global').emit('queue-updated', { doctorId });
    } catch (_) {}
  }

  logger.info('[DEFER] Token pushed back', {
    token: token.tokenNumber,
    from: result.from,
    to: result.to,
    by: actor
  });

  return { ok: true, token: fresh, from: result.from, to: result.to, notified };
}

/**
 * Rewrite every waiting patient's estimate for one cabin.
 *
 * Three things decide the answer and all three are read here rather than
 * assumed: how far off the doctor's sitting is, how long the consultation
 * already under way still has to run, and how many minutes this doctor is
 * actually spending per patient today.
 *
 * A token that is no longer waiting — called away, marked absent, completed but
 * still referenced — does not occupy a place in the line. Counting it pushed
 * everybody behind it back by a whole consultation each, so the queue quoted a
 * longer wait than it would ever serve.
 */
export async function recalculateQueueTimes(doctorId: string): Promise<void> {
  try {
    const queue = await (Queue as any).findOne({ doctor: doctorId }).populate('activeQueue');
    if (!queue || !queue.activeQueue) return;

    const doctor = await (Doctor as any).findById(doctorId);
    const buffer = queue.bufferDelay || 0;
    const now = new Date();

    const pace = await measuredPaceMinutes(doctorId, (doctor && doctor.averageCheckupTime) || 10);
    const inCabinRemaining = await cabinRemainingFor(queue, pace, now);
    const context: WaitContext = { paceMinutes: pace, inCabinRemaining, now };

    let pos = 0;
    for (let i = 0; i < queue.activeQueue.length; i++) {
      const entry = queue.activeQueue[i];
      if (!entry) continue;

      let token = typeof entry.save === 'function' ? entry : null;
      if (!token) {
        try {
          token = await (Token as any).findById(entry._id || entry);
        } catch (_) {
          token = null;
        }
      }
      if (!token) continue;

      // Still listed, but not in the line any more.
      if (token.status && token.status !== 'Waiting') continue;

      token.estimatedWaitTime = estimateWaitMinutes(doctor, pos, buffer, context);
      await token.save();
      pos++;
    }
  } catch (err) {
    logger.error('Error in recalculateQueueTimes', { err });
  }
}

/**
 * The wait a patient joining this doctor's line RIGHT NOW would be quoted.
 *
 * The one place every "how long will it take" answer outside the queue itself
 * should come from — the chatbot's booking confirmation, reception's walk-in
 * screen, the triage router's choice of cabin. They each used to do their own
 * `waiting × averageCheckupTime`, which is how the same doctor could be
 * advertised at three different waits on three screens at the same moment.
 */
export async function projectedWaitMinutes(
  doctor: any,
  queue: any,
  positionsAhead?: number,
  now: Date = new Date()
): Promise<number> {
  const doctorId = (doctor && (doctor._id || doctor.id)) || doctor;
  const pace = await measuredPaceMinutes(doctorId, (doctor && doctor.averageCheckupTime) || 10);
  const inCabinRemaining = await cabinRemainingFor(queue, pace, now);
  const ahead =
    typeof positionsAhead === 'number'
      ? positionsAhead
      : (queue && Array.isArray(queue.activeQueue) && queue.activeQueue.length) || 0;

  return estimateWaitMinutes(doctor, ahead, (queue && queue.bufferDelay) || 0, {
    paceMinutes: pace,
    inCabinRemaining,
    now
  });
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

    // Departures first, and on every advance rather than only on the sweep: a
    // cabin running fast can clear ten minutes of queue between two sweeps, and
    // the patient an hour away cannot absorb that.
    await sendDepartureAlerts(doctor, waitingOf(queue), io);

    const frontTokens = queue.activeQueue.slice(0, ARRIVAL_ALERT_THRESHOLD);
    for (let i = 0; i < frontTokens.length; i++) {
      const token = frontTokens[i];
      if (!token || token.arrivalAlerted || token.status !== 'Waiting') continue;
      // Already on the road because we told them to be. "Please reach the cabin
      // now" to someone forty minutes out is not information, it is alarm.
      if (isInTransit(token)) continue;
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

/**
 * Bilingual, because the same queue serves both — matching the arrival alerts.
 *
 * `newStart` is the doctor's revised sitting time, when one was announced. It is
 * stated separately from the patient's own turn because they answer different
 * questions: "when does the doctor arrive" tells the patient whether to set off
 * at all, and "when is my turn" tells them when to be at the door. Quoting only
 * the second leaves a patient at the front of the queue unsure whether the
 * cabin is even open yet.
 */
function delayMessage(
  doctorName: string,
  minutes: number,
  reason: string,
  newTime: string,
  newStart: string = ''
): string {
  const because = reason ? ` (${reason})` : '';
  const startLineEn = newStart ? `${doctorName} now starts at ${newStart}.\n` : '';
  const startLineHi = newStart ? `${doctorName} अब ${newStart} बजे से बैठेंगे।\n` : '';
  return (
    `⏳ ${doctorName} is running about ${minutes} min late today${because}.\n` +
    startLineEn +
    `Your new approximate turn: ${newTime}. Please come accordingly — you do not need to wait here.\n\n` +
    `⏳ ${doctorName} आज लगभग ${minutes} मिनट देर से हैं${because}।\n` +
    startLineHi +
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
  options: { minutes?: number; reason?: string; newStart?: string; io?: any } = {}
): Promise<number> {
  const { minutes = 0, reason = '', newStart = '', io } = options;
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
          delayMessage(doctorName, minutes, reason, newTime, newStart)
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
            newStart,
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

      // "Leave now" outranks "your wait has changed": a patient who has not set
      // off yet needs the departure message, not a revised clock time they have
      // no plan to act on. Sending it here also marks the wait as told, so the
      // drift check below cannot follow it with a second message in the same
      // sweep saying the same number.
      notified += await sendDepartureAlerts(doctor, waiting, io);

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

/**
 * One queue, reduced to what a waiting-room TV is allowed to show.
 *
 * This is an ALLOW-LIST and the security boundary for `GET /public-tv-queues`,
 * which is unauthenticated because the screen on the wall has no login. It lives
 * here as a named function, rather than inline in the route, so it can be tested
 * against a fully-populated queue and so the list of what escapes is one
 * reviewable place.
 *
 * The route used to answer with `{ ...queue.toObject() }` over populated tokens
 * and patients. That handed anyone who sent an unauthenticated GET every waiting
 * patient's phone number, age and gender, and each token's `symptoms`,
 * `chatHistory`, `labTests`, `prescription` and `patientAlerts`.
 *
 * Two rules:
 *   1. Build the object field by field. Never spread a document. A projection
 *      passed to `populate()` is not sufficient either — the in-memory mock
 *      ignores populate's select argument, so the dev server would still serve
 *      the full record.
 *   2. If it isn't legible from across a waiting room, it does not belong here.
 */
export function publicQueueView(queue: any): Record<string, any> {
  if (!queue) return null as any;

  // The token number is what the room is watching for. A first name rides along
  // only for the patient currently called in — the display announces that one
  // out loud already. Never a phone number, an age, or anything clinical.
  const publicToken = (token: any, withName: boolean) => {
    if (!token) return null;
    return {
      _id: token._id,
      tokenNumber: token.tokenNumber,
      ...(withName ? { patient: { name: (token.patient && token.patient.name) || '' } } : {})
    };
  };

  const activeQueue = Array.isArray(queue.activeQueue) ? queue.activeQueue : [];

  return {
    _id: queue._id,
    doctor: queue.doctor
      ? {
          _id: queue.doctor._id,
          name: queue.doctor.name,
          department: queue.doctor.department,
          currentRoom: queue.doctor.currentRoom
        }
      : null,
    currentToken: publicToken(queue.currentToken, true),
    waitingCount: activeQueue.length,
    activeQueue: activeQueue.map((t: any) => publicToken(t, false)),
    delay: queue.doctor ? delayNotice(queue.doctor) : null,
    opdHoursToday: queue.doctor ? todayOpdHours(queue.doctor) : ''
  };
}
