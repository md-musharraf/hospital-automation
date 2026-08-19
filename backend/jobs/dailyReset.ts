/**
 * The nightly close-of-day: archive the day's tokens, clear the boards, and let
 * every facility start tomorrow at T-1.
 */

import Token from '../models/Token';
import Queue from '../models/Queue';
import Doctor from '../models/Doctor';
import ArchivedToken from '../models/ArchivedToken';
import logger from '../utils/logger';
import { toFacility } from '../utils/realtime';
import { pruneOverrides, localDateKey } from '../utils/shiftHelper';
import { insertTokenByPriority } from '../utils/queueHelper';

/**
 * Journey stages that mean treatment is still in progress.
 */
export const CARRY_FORWARD_STAGES: Set<string> = new Set([
  'In Consultation',
  'Lab Pending',
  'Lab Complete',
  'Pharmacy Pending'
]);

/** Flatten one token into the archive's denormalized shape. */
export function toArchiveRecord(token: any): Record<string, any> {
  return {
    tokenNumber: token.tokenNumber,
    hospital: token.hospital,
    status: token.status,
    tokenType: token.tokenType,
    patientDetails: token.patient
      ? {
          name: token.patient.name,
          age: token.patient.age,
          gender: token.patient.gender,
          phone: token.patient.phone
        }
      : { name: 'Unknown' },
    doctorDetails: token.doctor
      ? {
          name: token.doctor.name,
          department: token.doctor.department,
          currentRoom: token.doctor.currentRoom
        }
      : { name: 'Unknown' },
    symptoms: token.symptoms,
    calledAt: token.calledAt,
    completedAt: token.completedAt
  };
}

/**
 * Close the day for one facility.
 */
/**
 * Is this token still waiting on a message we promised to keep retrying?
 *
 * An evening discharge whose bill WhatsApp refused is queued with a backoff of
 * up to a couple of hours. Archiving the token at midnight would delete the
 * queue entry AND the tracker page the patient was pointed at — leaving someone
 * who was never told, with nowhere left to look. The wait is bounded: after the
 * last attempt the alert is abandoned, `alertRetryAt` clears, and the token
 * archives on the following night like any other.
 */
export function hasUndeliveredAlert(token: any): boolean {
  return Boolean(token && token.alertRetryAt);
}

/**
 * Is this token pre-booked for the upcoming day/future?
 * Tokens booked during off-hours/night for tomorrow's OPD must be preserved.
 */
export function isScheduledForFuture(token: any, now: Date = new Date()): boolean {
  if (!token) return false;
  if (token.isNextDay) return true;
  if (token.scheduledDate && new Date(token.scheduledDate) > now) return true;
  return false;
}

/**
 * Re-insert tokens whose appointment day has arrived into their doctor's queue.
 *
 * Anything dated later than today stays out — it is not this day's line yet, and
 * it will be re-inserted by the reset on the morning it is due. A token with no
 * appointment date predates next-day booking and is left alone.
 */
export async function requeueScheduledTokens(
  hospital: string,
  tokens: any[],
  now: Date = new Date()
): Promise<number> {
  const todayKey = localDateKey(now);
  const due = (tokens || []).filter(
    (t) => t.appointmentDate && t.appointmentDate <= todayKey && t.status === 'Waiting'
  );
  if (due.length === 0) return 0;

  // Oldest booking first, so the patient who booked at 9pm is ahead of the one
  // who booked at 11pm. Priority tiers still re-sort them on insert.
  due.sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());

  let requeued = 0;
  for (const token of due) {
    const doctorId = token.doctor && (token.doctor._id || token.doctor);
    if (!doctorId) continue;
    try {
      let queue = await (Queue as any).findOne({ doctor: doctorId });
      if (!queue) queue = new (Queue as any)({ doctor: doctorId, activeQueue: [] });
      const already = (queue.activeQueue || []).some((id: any) => String(id) === String(token._id));
      if (already) continue;
      await insertTokenByPriority(queue, token);
      await queue.save();
      requeued += 1;
    } catch (err) {
      // One unqueueable token must not stop the rest of the facility opening.
      logger.error('[DAILY-RESET] Could not requeue a scheduled token', {
        hospital,
        token: String(token._id),
        err
      });
    }
  }

  if (requeued > 0)
    logger.info('[DAILY-RESET] Scheduled tokens returned to the queue', { hospital, requeued });
  return requeued;
}

export async function resetFacility(io: any, hospital: string, tokens: any[]): Promise<Record<string, any>> {
  const finished = tokens.filter(
    (t) => !CARRY_FORWARD_STAGES.has(t.journeyStage) && !hasUndeliveredAlert(t) && !isScheduledForFuture(t)
  );
  const archivedIds = new Set(finished.map((t) => String(t._id)));
  // What survives the night. Only these may be put back into a queue — the rest
  // are about to be deleted, and re-inserting one would point the new day's line
  // at a token that no longer exists.
  const kept = tokens.filter((t) => !archivedIds.has(String(t._id)));
  const carried = tokens.length - finished.length;

  if (finished.length > 0) {
    await (ArchivedToken as any).insertMany(finished.map(toArchiveRecord));
    await (Token as any).deleteMany({ _id: { $in: finished.map((t) => t._id) } });
  }

  const doctors = await (Doctor as any).find({ hospital }).select('_id shiftOverrides');
  if (doctors.length > 0) {
    await (Queue as any).updateMany(
      { doctor: { $in: doctors.map((d: any) => d._id) } },
      { currentToken: null, activeQueue: [], bufferDelay: 0, delayReason: '', delayedUntil: null }
    );

    // Put back the tokens that were booked FOR the day now beginning.
    //
    // Clearing every queue is right — yesterday's line is over — but the tokens
    // kept above are kept precisely because they belong to a day that has not
    // happened yet, and a patient who booked at 9pm for this morning's OPD was
    // left holding a token that existed, tracked, and appeared in no queue at
    // all. They arrived to find themselves not in the line.
    await requeueScheduledTokens(hospital, kept);

    // Yesterday's "I'll be 30 minutes late" must not survive into today. The
    // lookup is keyed by date so a stale row never applies, but clearing it
    // keeps the record from growing one sub-document per late day forever, and
    // keeps the doctor's own screen from showing a delay banner at 8am.
    for (const doctor of doctors) {
      if (pruneOverrides(doctor)) {
        try {
          doctor.markModified && doctor.markModified('shiftOverrides');
          await doctor.save();
        } catch (err) {
          logger.error('Could not prune stale shift overrides', { err, doctor: String(doctor._id) });
        }
      }
    }
  }

  toFacility(io, hospital, 'queue-reset', { archived: finished.length, carried });

  return { hospital, archived: finished.length, carried, doctors: doctors.length };
}

/**
 * Run the close-of-day for every facility that had activity.
 */
export async function runDailyReset(io?: any): Promise<any[]> {
  const startedAt = Date.now();
  logger.info('[DAILY-RESET] Starting close-of-day');

  const tokens = await (Token as any)
    .find({}, null, { allTenants: true })
    .populate('patient')
    .populate('doctor');

  const byFacility = new Map<string, any[]>();
  for (const token of tokens || []) {
    const hospital = token.hospital || 'general-hospital';
    if (!byFacility.has(hospital)) byFacility.set(hospital, []);
    (byFacility.get(hospital) as any[]).push(token);
  }

  const summaries: any[] = [];
  for (const [hospital, facilityTokens] of byFacility) {
    try {
      summaries.push(await resetFacility(io, hospital, facilityTokens));
    } catch (err: any) {
      logger.error('[DAILY-RESET] Facility failed', { hospital, err: err.message });
      summaries.push({ hospital, failed: true, error: err.message });
    }
  }

  logger.info('[DAILY-RESET] Complete', {
    facilities: summaries.length,
    archived: summaries.reduce((n, s) => n + (s.archived || 0), 0),
    carriedForward: summaries.reduce((n, s) => n + (s.carried || 0), 0),
    failed: summaries.filter((s) => s.failed).length,
    ms: Date.now() - startedAt
  });

  return summaries;
}
