/**
 * Filing a doctor's leave, and dealing with the patients already booked into it.
 *
 * Marking the absence is the easy half. The half that decides whether this
 * feature helps or hurts is what happens to the tokens that ALREADY exist on
 * those dates — because bookings roll up to `MAX_ROLL_DAYS` ahead
 * (`utils/bookingSlot`), so by the time a doctor files leave for next Tuesday
 * there can be people holding a Tuesday token.
 *
 * Those patients are the whole point. A doctor's leave that only stops NEW
 * bookings leaves behind the exact person this platform exists to protect: the
 * one who travelled an hour, on a token the system issued, to a cabin nobody is
 * in. They find out on arrival, which is the one outcome worse than never having
 * booked.
 *
 * So filing a leave does two things, in this order and for this reason:
 *
 *   1. **Save the leave.** First, always. A doctor who filed leave and saw an
 *      error would reasonably assume it did not save and stop trying — and the
 *      failure that is most likely here is in step 2, not step 1.
 *   2. **Tell the patients, then hand the list to reception.** The message goes
 *      out automatically because it cannot wait for a human to work through a
 *      queue; the RESCHEDULING is left to reception, because moving somebody to
 *      a different doctor or a different day is a conversation, not a default.
 *      Reception gets the list; the patient already knows by the time they are
 *      called.
 */

import Token from '../models/Token';
import Patient from '../models/Patient';
import {
  normalizeLeave,
  leaveOn,
  localDateKey,
  formatDateKey,
  backOnKey,
  type DoctorLeave
} from './shiftHelper';
import { notifyPatient } from './patientNotify';
import { toId } from './ids';
import logger from './logger';

const log = logger.child({ module: 'doctor-leave' });

/** Statuses that still expect to be seen. A finished visit is not disrupted. */
const LIVE_STATUSES = ['Waiting', 'Called', 'Active', 'Delayed'];

export interface AffectedToken {
  tokenId: string;
  tokenNumber: string;
  appointmentDate: string;
  status: string;
  patientName: string;
  patientPhone: string;
  notified: boolean;
}

/**
 * The date a token is for.
 *
 * `appointmentDate` has only been written since next-day booking existed, so an
 * older token falls back to the day it was created — the same rule
 * `getTokenCountForDate` uses. Two different answers to "which day is this
 * token for" would mean capacity and leave disagreed about the same token.
 */
function dateKeyOf(token: any): string {
  if (token && token.appointmentDate) return String(token.appointmentDate);
  return token && token.createdAt ? localDateKey(new Date(token.createdAt)) : '';
}

/**
 * Tokens this doctor is holding inside `leave` that still expect to be seen.
 *
 * Scoped to the doctor, which scopes it to the facility: a doctor belongs to
 * exactly one tenant, so there is no way for this to reach across facilities.
 */
export async function affectedTokens(doctor: any, leave: DoctorLeave): Promise<any[]> {
  const doctorId = toId(doctor);
  if (!doctorId || !leave) return [];

  try {
    const tokens = (await (Token as any).find({ doctor: doctorId }).populate('patient')) || [];
    return tokens.filter((token: any) => {
      if (!LIVE_STATUSES.includes(String(token.status || ''))) return false;
      const key = dateKeyOf(token);
      return Boolean(key) && key >= leave.from && key <= leave.to;
    });
  } catch (err: any) {
    log.error('Could not read the tokens a leave would affect', { err: err.message });
    return [];
  }
}

/** Bilingual notice for one patient whose doctor will not be in. */
function leaveMessage(doctor: any, leave: DoctorLeave, token: any): string {
  const name = (doctor && doctor.name) || 'Your doctor';
  const day = formatDateKey(dateKeyOf(token));
  const until = formatDateKey(leave.to);
  const why = leave.reason ? ` (${leave.reason})` : '';

  return (
    `🏖️ Token ${token.tokenNumber}: ${name} will NOT be available on ${day}${why}. ` +
    `They are on leave until ${until}.\n` +
    `Please do not travel to the hospital for this appointment. Reception will contact you to move it — ` +
    `or reply *HI* to book with another doctor.\n\n` +
    `🏖️ टोकन ${token.tokenNumber}: ${name} ${day} को उपलब्ध नहीं रहेंगे${why}। वे ${until} तक छुट्टी पर हैं। ` +
    `कृपया इस अपॉइंटमेंट के लिए अस्पताल न आएँ। रिसेप्शन आपसे संपर्क करेगा — ` +
    `या दूसरे डॉक्टर से बुक करने के लिए *HI* भेजें।`
  );
}

/** Resolve one token into the row reception works from. Sends nothing. */
async function describeToken(token: any, notified: boolean): Promise<AffectedToken> {
  let patient = token.patient;
  if (patient && !patient.name && toId(patient)) {
    try {
      patient = await (Patient as any).findById(toId(patient));
    } catch (_) {
      /* the row is still useful without it */
    }
  }
  return {
    tokenId: String(token._id),
    tokenNumber: token.tokenNumber,
    appointmentDate: dateKeyOf(token),
    status: String(token.status || ''),
    patientName: (patient && patient.name) || '',
    patientPhone: (patient && patient.phone) || '',
    notified
  };
}

/**
 * The affected list WITHOUT messaging anyone.
 *
 * Used when a leave is re-filed over dates it already covers: reception still
 * needs the list of people to call, but those people were told the first time
 * and a second identical "your doctor is on leave" is spam they now have to
 * interpret — and a message we pay Meta for.
 */
export async function summariseAffected(tokens: any[]): Promise<AffectedToken[]> {
  const rows: AffectedToken[] = [];
  for (const token of tokens) rows.push(await describeToken(token, false));
  return rows;
}

/**
 * Tell every affected patient, and report who was reached.
 *
 * Goes through `notifyPatient` rather than WhatsApp directly, which means the
 * notice is WRITTEN to the token first and delivered second — so a patient with
 * no phone, or one Meta refuses, still has the cancellation on their live
 * tracker, and a failed send is retried on the existing backoff instead of being
 * lost. That module also carries the facility and kind through to the message
 * meter, so these count like every other message.
 *
 * One failure never stops the rest of the list: the second patient's notice does
 * not depend on the first patient's phone being valid.
 */
export async function notifyLeaveAffected(
  doctor: any,
  leave: DoctorLeave,
  tokens: any[],
  io?: any
): Promise<AffectedToken[]> {
  const results: AffectedToken[] = [];

  for (const token of tokens) {
    let patient = token.patient;
    if (patient && !patient.name && toId(patient)) {
      try {
        patient = await (Patient as any).findById(toId(patient));
      } catch (_) {
        /* the alert is still recorded without it */
      }
    }

    let notified = false;
    try {
      const outcome = await notifyPatient({
        io,
        token,
        patient,
        kind: 'info',
        title: 'Your doctor is on leave',
        body: `${(doctor && doctor.name) || 'Your doctor'} will not be in on ${formatDateKey(dateKeyOf(token))}.`,
        message: leaveMessage(doctor, leave, token),
        // Keyed to this leave so re-filing the same dates updates the existing
        // card instead of stacking a second identical warning in the feed.
        dedupeKey: `leave:${leave.from}:${leave.to}`
      });
      notified = Boolean(outcome && outcome.sent);
    } catch (err: any) {
      log.error('Could not tell a patient about their doctor’s leave', {
        err: err.message,
        token: token.tokenNumber
      });
    }

    results.push(await describeToken({ ...token, patient }, notified));
  }

  return results;
}

export interface FileLeaveResult {
  leave: DoctorLeave;
  backOn: string | null;
  affected: AffectedToken[];
  alreadyFiled: boolean;
}

/**
 * Record a leave on `doctor` and deal with the fallout.
 *
 * Throws only on bad INPUT (see `normalizeLeave`), which the caller turns into a
 * 400. Everything after the save is best-effort: the leave is a fact once it is
 * stored, and a notification problem must not be reported as a failure to file.
 */
export async function fileLeave(
  doctor: any,
  input: any,
  options: { by?: string; io?: any; notify?: boolean } = {}
): Promise<FileLeaveResult> {
  const { by = '', io, notify = true } = options;
  const leave = normalizeLeave({ ...input, by });

  const existing = Array.isArray(doctor.leaves) ? doctor.leaves : [];
  const duplicate = existing.some(
    (entry: any) => entry && entry.from === leave.from && entry.to === leave.to
  );

  // The tokens are read BEFORE the leave is saved, because the moment it is
  // saved is the moment these patients stop being bookable — and this list is
  // exactly the people who slipped in before that.
  const tokens = await affectedTokens(doctor, leave);

  if (!duplicate) {
    doctor.leaves = [...existing, { ...leave, createdAt: new Date() }];
    doctor.markModified && doctor.markModified('leaves');
    await doctor.save();
  }

  // Re-filing a leave that already exists changes nothing, so nobody is
  // messaged again — but reception still gets the list, because the reason they
  // re-filed is usually that they are looking for exactly that list.
  const affected =
    tokens.length === 0
      ? []
      : notify && !duplicate
        ? await notifyLeaveAffected(doctor, leave, tokens, io)
        : await summariseAffected(tokens);

  log.info('Leave filed', {
    doctor: String(toId(doctor)),
    from: leave.from,
    to: leave.to,
    affected: tokens.length,
    duplicate
  });

  return {
    leave,
    backOn: backOnKey(doctor, new Date(`${leave.from}T00:00:00`)),
    affected,
    alreadyFiled: duplicate
  };
}

/**
 * Remove a leave starting on `fromKey`. Returns whether anything was removed.
 *
 * Matched on the start date alone: a doctor cancelling "my leave from the 24th"
 * should not have to reproduce the end date exactly, and two leaves beginning on
 * the same day is not a real state.
 */
export async function cancelLeave(doctor: any, fromKey: string): Promise<boolean> {
  const existing = Array.isArray(doctor.leaves) ? doctor.leaves : [];
  const kept = existing.filter((entry: any) => !entry || entry.from !== fromKey);
  if (kept.length === existing.length) return false;

  doctor.leaves = kept;
  doctor.markModified && doctor.markModified('leaves');
  await doctor.save();

  log.info('Leave cancelled', { doctor: String(toId(doctor)), from: fromKey });
  return true;
}

/** Is this doctor away right now? Convenience for routes that only need a flag. */
export function awayToday(doctor: any, now: Date = new Date()): DoctorLeave | null {
  return leaveOn(doctor, now);
}
