/**
 * The nightly close-of-day: archive the day's tokens, clear the boards, and let
 * every facility start tomorrow at T-1.
 *
 * This used to live inline in index.js and did four things wrong, each of which
 * only becomes visible once a real facility depends on the system:
 *
 *   1. It ran at `0 0 * * *` with no timezone. Render runs UTC, so on a deployed
 *      server midnight fired at 05:30 IST — during morning OPD preparation,
 *      not overnight.
 *
 *   2. The archive records never copied `hospital`. ArchivedToken defaults that
 *      field to 'general-hospital', so every facility's history was silently
 *      relabelled as one tenant's. Nothing errored, and the damage is not
 *      recoverable after the source tokens are deleted — the attribution is
 *      simply gone.
 *
 *   3. It deleted every token in the platform, including patients still mid
 *      journey. A patient inside a consultation, or waiting on a lab result, at
 *      the moment the job ran lost their token entirely.
 *
 *   4. It cleared ChatSession, which already auto-expires after an hour of
 *      inactivity via a TTL index. The only sessions it actually destroyed were
 *      the live ones — patients typing their booking at midnight.
 *
 * Facilities are processed one at a time so that a failure in one tenant cannot
 * abort the close-of-day for the rest.
 */

const Token = require('../models/Token');
const Queue = require('../models/Queue');
const Doctor = require('../models/Doctor');
const ArchivedToken = require('../models/ArchivedToken');
const logger = require('./../utils/logger');
const { toFacility } = require('../utils/realtime');

/**
 * Journey stages that mean treatment is still in progress.
 *
 * A token in one of these is carried into the next day rather than archived: the
 * patient is physically still in the building, or is coming back for a result.
 * Everything else — Waiting (never showed), Dispensed, Completed, Absent — has
 * finished for the day and belongs in the archive.
 */
const CARRY_FORWARD_STAGES = new Set(['In Consultation', 'Lab Pending', 'Lab Complete', 'Pharmacy Pending']);

/** Flatten one token into the archive's denormalized shape. */
function toArchiveRecord(token) {
  return {
    tokenNumber: token.tokenNumber,
    // The field whose absence quietly rewrote every facility's history.
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
 * Returns a summary so the caller can log one line per tenant.
 */
async function resetFacility(io, hospital, tokens) {
  const finished = tokens.filter((t) => !CARRY_FORWARD_STAGES.has(t.journeyStage));
  const carried = tokens.length - finished.length;

  if (finished.length > 0) {
    await ArchivedToken.insertMany(finished.map(toArchiveRecord));
    await Token.deleteMany({ _id: { $in: finished.map((t) => t._id) } });
  }

  // Queue has no `hospital` of its own — it hangs off a doctor — so the tenant's
  // boards have to be reached through that facility's roster. Clearing with an
  // empty filter here would reset all two hundred facilities at once.
  const doctors = await Doctor.find({ hospital }).select('_id');
  if (doctors.length > 0) {
    await Queue.updateMany(
      { doctor: { $in: doctors.map((d) => d._id) } },
      { currentToken: null, activeQueue: [], bufferDelay: 0 }
    );
  }

  // Addressed to this facility's room rather than broadcast platform-wide. The
  // old `io.emit` woke every dashboard in every tenant, which is the exact leak
  // the room-based realtime layer exists to prevent.
  toFacility(io, hospital, 'queue-reset', { archived: finished.length, carried });

  return { hospital, archived: finished.length, carried, doctors: doctors.length };
}

/**
 * Run the close-of-day for every facility that had activity.
 *
 * Exported separately from the schedule so it can be run by hand (or by a test)
 * without waiting for midnight.
 */
async function runDailyReset(io) {
  const startedAt = Date.now();
  logger.info('[DAILY-RESET] Starting close-of-day');

  // Genuinely platform-wide: close-of-day runs for every tenant at once. Said out
  // loud so the tenant guard can tell this apart from a forgotten filter.
  const tokens = await Token.find({}, null, { allTenants: true }).populate('patient').populate('doctor');

  // Group in memory rather than with `distinct`: the in-memory development store
  // does not implement it, and this collection is bounded by one day of activity.
  const byFacility = new Map();
  for (const token of tokens) {
    const hospital = token.hospital || 'general-hospital';
    if (!byFacility.has(hospital)) byFacility.set(hospital, []);
    byFacility.get(hospital).push(token);
  }

  const summaries = [];
  for (const [hospital, facilityTokens] of byFacility) {
    try {
      summaries.push(await resetFacility(io, hospital, facilityTokens));
    } catch (err) {
      // One tenant's failure must not cost the others their close-of-day.
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

  // ChatSession is deliberately left alone. Its `lastActivity` field carries a
  // TTL index that expires idle conversations after an hour, so the only
  // sessions a sweep here could remove are the ones still being typed into.

  return summaries;
}

module.exports = { runDailyReset, CARRY_FORWARD_STAGES };
