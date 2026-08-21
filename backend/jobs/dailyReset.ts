/**
 * The nightly close-of-day: archive the day's tokens, clear the boards, and let
 * every facility start tomorrow at T-1.
 */

import Token from '../models/Token';
import Queue from '../models/Queue';
import Doctor from '../models/Doctor';
import Hospital from '../models/Hospital';
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

/** Record that `hospital`'s board has been closed for the local day `now` falls in. */
async function markFacilityReset(hospital: string, now: Date = new Date()): Promise<void> {
  try {
    const doc = await (Hospital as any).findOne({ id: hospital });
    if (!doc) return; // A tenant with tokens but no facility record — nothing to stamp.
    doc.lastDailyReset = localDateKey(now);
    await doc.save();
  } catch (err) {
    // A missed stamp costs one redundant reset attempt, which is idempotent.
    logger.error('[DAILY-RESET] Could not record the close-of-day marker', { hospital, err });
  }
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

  // Stamp the day AFTER the work, never before: a facility whose reset threw
  // half way through must be retried, not recorded as done.
  await markFacilityReset(hospital);

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

/* ── Recovering a night the process slept through ────────────────────────── */

/**
 * The local day this PROCESS has already opened, so the check below costs one
 * string compare and no database round trip for the rest of the day.
 *
 * Deliberately in memory as well as on the facility record. The marker on the
 * facility is what makes the recovery correct across restarts; this is what
 * makes calling it from a request path free.
 */
let openedDayKey = '';

/** Test seam: forget that this process has opened today. */
export function _forgetOpenedDay(): void {
  openedDayKey = '';
}

/**
 * Open today, whether or not anybody was awake at midnight to do it.
 *
 * The close-of-day is a cron at 00:00, and a cron in a web process only fires
 * while that process is running. On a free hosting plan it is not: the instance
 * is shut down after fifteen minutes without a request, and every night is
 * fifteen minutes without a request. So on that plan the job had never run at
 * all — with two consequences, one visible and one not:
 *
 *   - Yesterday's queue was still on the board this morning. Visible, annoying,
 *     and worked around by hand.
 *   - A token booked for TODAY was never put into today's queue. Not visible to
 *     anybody: the token existed, the tracker page worked, and the patient was
 *     told to come. They arrived to find themselves in no line at all. This is
 *     the half that makes next-day booking — the whole point of booking after
 *     the OPD has closed — quietly not work.
 *
 * Two things happen here and they are deliberately not the same thing:
 *
 *   1. Requeue what is due. Idempotent, cheap, and safe at any hour, so it runs
 *      whenever the day has turned — including the very first day, before any
 *      marker exists. This is the half a patient feels.
 *   2. Close a day that was genuinely missed: archive, clear the board, prune
 *      yesterday's late-start overrides. Destructive, so it runs only when a
 *      facility's own marker says a day boundary was crossed unattended. A
 *      facility that has never been stamped is stamped without being reset —
 *      an empty marker means "we have not been tracking", not "yesterday was
 *      never closed", and reading it the second way would archive a live
 *      morning's board on the deploy that introduced this.
 */
export async function openTodaysBoards(
  io?: any,
  now: Date = new Date()
): Promise<{ ranFor: string; requeued: number; closed: string[]; seeded: string[] }> {
  const todayKey = localDateKey(now);
  const result = { ranFor: todayKey, requeued: 0, closed: [] as string[], seeded: [] as string[] };
  if (openedDayKey === todayKey) return result;
  // Set before the work, not after: a second caller arriving while this one is
  // still running must not start the same sweep again.
  openedDayKey = todayKey;

  // ── 1. Close any day that turned while nothing was listening ──────────────
  try {
    const hospitals = (await (Hospital as any).find({})) || [];
    const stale: any[] = [];

    for (const hospital of hospitals) {
      const marker = hospital.lastDailyReset || '';
      if (!marker) {
        hospital.lastDailyReset = todayKey;
        await hospital.save();
        result.seeded.push(hospital.id);
      } else if (marker < todayKey) {
        stale.push(hospital);
      }
    }

    if (stale.length > 0) {
      const ids = stale.map((h) => h.id);
      const tokens =
        (await (Token as any)
          .find({ hospital: { $in: ids } }, null, { allTenants: true })
          .populate('patient')
          .populate('doctor')) || [];

      const byFacility = new Map<string, any[]>();
      for (const id of ids) byFacility.set(id, []);
      for (const token of tokens) {
        const bucket = byFacility.get(token.hospital);
        if (bucket) bucket.push(token);
      }

      for (const hospital of stale) {
        try {
          await resetFacility(io, hospital.id, byFacility.get(hospital.id) || []);
          result.closed.push(hospital.id);
        } catch (err: any) {
          // One facility's failure must not hold the rest of the platform shut.
          logger.error('[DAILY-RESET] Catch-up failed for a facility', {
            hospital: hospital.id,
            err: err && err.message
          });
        }
      }
    }
  } catch (err: any) {
    logger.error('[DAILY-RESET] Catch-up sweep failed', { err: err && err.message });
  }

  // ── 2. Put every token whose day has arrived into its queue ───────────────
  //
  // Runs even when nothing above was stale — `resetFacility` does this for the
  // facilities it closed, but a facility closed on time by the cron and then
  // booked into afterwards still needs it, and so does the very first day.
  try {
    const due =
      (await (Token as any)
        .find({ status: 'Waiting', isNextDay: true, appointmentDate: { $lte: todayKey } }, null, {
          allTenants: true
        })
        .populate('doctor')) || [];

    const byFacility = new Map<string, any[]>();
    for (const token of due) {
      const hospital = token.hospital || 'general-hospital';
      if (!byFacility.has(hospital)) byFacility.set(hospital, []);
      (byFacility.get(hospital) as any[]).push(token);
    }

    for (const [hospital, tokens] of byFacility) {
      result.requeued += await requeueScheduledTokens(hospital, tokens, now);
    }
  } catch (err: any) {
    logger.error('[DAILY-RESET] Could not requeue the day\u2019s scheduled tokens', {
      err: err && err.message
    });
  }

  if (result.closed.length > 0 || result.requeued > 0) {
    logger.info('[DAILY-RESET] Opened today', {
      day: todayKey,
      closedLate: result.closed.length,
      requeued: result.requeued
    });
  }

  return result;
}
