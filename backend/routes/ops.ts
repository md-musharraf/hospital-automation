// Shared operations surface — one live picture of the facility that EVERY role
// can read (doctor, staff, lab, pharmacy). Previously each portal only knew
// about its own slice, so nobody could see that the lab was the bottleneck or
// that a doctor had 14 people waiting while another had 2.
//
// This router is also the reference for how routes are written here:
//   - `asyncHandler` instead of a try/catch in every handler
//   - `HttpError` to fail with a status instead of hand-writing a response
//   - `facilityOf` / `facilityTokens` for tenant scoping, never an ad-hoc filter
//   - `toId` / `sameId` instead of `x._id || x` spelled out again

const express = require('express');
const router = express.Router();
const Token = require('../models/Token');
const Queue = require('../models/Queue');
const ActivityLog = require('../models/ActivityLog');
const RefillRequest = require('../models/RefillRequest');
const { authenticateToken } = require('../middleware/auth');
const { asyncHandler, HttpError } = require('../middleware/asyncHandler');
const { stockAlerts } = require('../utils/stockHelper');
const { stageMessage } = require('../utils/journeyHelper');
const { onlyToday, minutesSince } = require('../utils/dates');
const { toId, sameId } = require('../utils/ids');
const { facilityOf, facilityDoctors } = require('../utils/tenancy');
const { estimateWaitMinutes, paceFromTokens, cabinRemainingFrom } = require('../utils/queueHelper');
const { sittingStatus, delayNotice, todayOpdHours, leaveOn, backOnKey } = require('../utils/shiftHelper');

/** This facility's tokens, created today. */
async function todaysTokens(hospital) {
  // Date filtering happens in JS so this behaves identically on real MongoDB and
  // the in-memory mock (which stores createdAt as an ISO string).
  return onlyToday((await Token.find({ hospital })) || []);
}

/** Count how many of `tokens` satisfy `predicate` — used a lot below. */
const countWhere = (tokens, predicate) => tokens.filter(predicate).length;

const hasOutstandingTest = (token) => (token.labTests || []).some((t) => t.status !== 'Completed');
const hasUndispensedRx = (token) =>
  Boolean(
    token.prescription && (token.prescription.medicines || []).length > 0 && !token.prescription.dispensed
  );

// GET the facility's live activity feed (newest first).
router.get(
  '/activity',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const hospital = facilityOf(req);
    const limit = Math.min(parseInt(req.query.limit, 10) || 40, 200);

    const rows = (await ActivityLog.find({ hospital })) || [];
    const newestFirst = rows
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, limit);

    res.json(newestFirst);
  })
);

// GET the whole-facility live overview: who is on duty, where every patient is,
// what each department's backlog looks like, and where the wait is worst.
router.get(
  '/overview',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const hospital = facilityOf(req);

    const [doctors, tokens] = await Promise.all([facilityDoctors(hospital), todaysTokens(hospital)]);

    const queues = (await Queue.find({ doctor: { $in: doctors.map((d) => d._id) } })) || [];
    const queueByDoctor = new Map(queues.map((q) => [toId(q.doctor), q]));

    // Today's tokens are already loaded, so the two facts that make a wait
    // estimate honest — how fast this doctor is really going, and how much of
    // the consultation in the room is left — cost no extra query here.
    const tokenById = new Map(tokens.map((t) => [String(t._id), t]));

    // Per-doctor live load, so reception can steer the next walk-in to whoever
    // is actually free instead of guessing.
    const doctorLoad = doctors
      .map((doctor) => {
        const queue: any = queueByDoctor.get(toId(doctor));
        const waiting = (queue && queue.activeQueue && queue.activeQueue.length) || 0;
        const pace = paceFromTokens(tokens, doctor._id, doctor.averageCheckupTime || 10);
        const inCabin = queue && queue.currentToken ? tokenById.get(String(toId(queue.currentToken))) : null;
        return {
          _id: doctor._id,
          name: doctor.name,
          department: doctor.department,
          room: doctor.currentRoom,
          availabilityStatus: doctor.availabilityStatus,
          waiting,
          inCabin: Boolean(queue && queue.currentToken),
          // Shift-aware, like the chatbot's estimate and the triage router.
          // Left as raw queue-length maths, this board contradicted them: at 2pm
          // the doctor whose next sitting is at five showed "0 min, free", so
          // the one surface a human steers walk-ins from recommended the one
          // cabin guaranteed not to open. It also read an occupied cabin with
          // nobody queued as "free now", which is only true for the patient
          // already inside it.
          estimatedWait: estimateWaitMinutes(doctor, waiting, (queue && queue.bufferDelay) || 0, {
            paceMinutes: pace,
            inCabinRemaining: cabinRemainingFrom(inCabin, pace)
          }),
          // What the cabin is really averaging today, so reception can see WHY a
          // queue of four is quoting fifty minutes.
          paceMinutes: pace,
          sitting: sittingStatus(doctor),
          // Today's announced delay, so the floor board and the waiting-room
          // screen carry the same revised start the patient was WhatsApped.
          delay: delayNotice(doctor),
          opdHoursToday: todayOpdHours(doctor),
          // Away for days, not merely closed for the evening. The floor board is
          // where a manager notices a cabin has nobody in it, and "on leave until
          // Friday" is the only version of that they can act on.
          onLeave: leaveOn(doctor),
          backOn: backOnKey(doctor),
          seenToday: countWhere(tokens, (t) => sameId(t.doctor, doctor) && t.status === 'Completed'),
          dailyTokenLimit: doctor.dailyTokenLimit || 0
        };
      })
      .sort((a, b) => b.waiting - a.waiting);

    // Where every patient in the building currently is.
    const byStage = tokens.reduce((acc, token) => {
      const stage = token.journeyStage || 'Waiting';
      acc[stage] = (acc[stage] || 0) + 1;
      return acc;
    }, {});

    // Who has been waiting longest — the number a floor manager actually acts on.
    const longestWaiting = tokens
      .filter((t) => t.status === 'Waiting')
      .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime())[0];

    const [alerts, pendingRefills] = await Promise.all([
      stockAlerts(hospital),
      RefillRequest.find({ hospital, status: 'Pending' })
    ]);

    res.json({
      hospital,
      generatedAt: new Date(),
      totals: {
        tokensToday: tokens.length,
        completed: countWhere(tokens, (t) => t.status === 'Completed'),
        waiting: countWhere(tokens, (t) => t.status === 'Waiting'),
        inCabin: countWhere(tokens, (t) => t.status === 'Active' || t.status === 'Called'),
        absent: countWhere(tokens, (t) => t.status === 'Absent'),
        emergency: countWhere(tokens, (t) => t.tokenType === 'Emergency'),
        priority: countWhere(tokens, (t) => t.priorityCategory && t.priorityCategory !== 'None')
      },
      byStage,
      departments: {
        lab: {
          pending: countWhere(tokens, hasOutstandingTest),
          urgent: countWhere(tokens, (t) =>
            (t.labTests || []).some((x) => x.status !== 'Completed' && x.urgency === 'Urgent')
          ),
          abnormal: countWhere(tokens, (t) => (t.labTests || []).some((x) => x.abnormal))
        },
        pharmacy: {
          pending: countWhere(tokens, hasUndispensedRx),
          outOfStock: alerts.out.length,
          lowStock: alerts.low.length,
          expiring: alerts.expiring.length
        },
        refills: { pending: (pendingRefills || []).length }
      },
      doctorsOnDuty: countWhere(doctorLoad, (d) => d.availabilityStatus === 'Available'),
      doctorLoad,
      longestWaitMins: longestWaiting ? minutesSince(longestWaiting.createdAt) : 0,
      longestWaitToken: longestWaiting ? longestWaiting.tokenNumber : null
    });
  })
);

// GET one patient's full journey — every role can pull this up so nobody has to
// phone another counter to ask "where is this patient / what's pending?".
router.get(
  '/journey/:tokenId',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const token = await Token.findById(req.params.tokenId)
      .populate('patient')
      .populate('doctor', '-passwordHash');

    if (!token) throw new HttpError(404, 'Token not found');
    if (token.hospital !== facilityOf(req)) {
      throw new HttpError(403, 'This token belongs to another facility.');
    }

    const stage = token.journeyStage || 'Waiting';
    res.json({
      tokenNumber: token.tokenNumber,
      stage,
      stageMessage: stageMessage(stage),
      history: token.stageHistory || [],
      patient: token.patient
        ? { name: token.patient.name, age: token.patient.age, phone: token.patient.phone }
        : null,
      doctor: token.doctor
        ? { name: token.doctor.name, department: token.doctor.department, room: token.doctor.currentRoom }
        : null,
      labTests: token.labTests || [],
      prescription: token.prescription || null,
      status: token.status,
      estimatedWaitTime: token.estimatedWaitTime
    });
  })
);

/**
 * GET this facility's own subscription state.
 *
 * The one licensing endpoint a tenant may read, and it stays reachable when
 * everything else is refused (see the ALWAYS_OPEN list in middleware/license.ts)
 * — a console that cannot ask why it is blocked can only show a spinner.
 *
 * Read-only by design. A facility can see its term; only the platform owner can
 * change it.
 */
router.get(
  '/license',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const Hospital = require('../models/Hospital');
    const { licenseState } = require('../utils/licenseHelper');

    const facility = await Hospital.findOne({ id: facilityOf(req) });
    if (!facility) throw new HttpError(404, 'Facility not found');

    res.json(licenseState(facility));
  })
);

/**
 * GET this facility's own WhatsApp usage for a month.
 *
 * A meter the customer cannot read is not a meter, it is a surprise at the end
 * of the month. The facility sees the same numbers the owner console bills from
 * — total sent, the per-kind breakdown, how much of the plan's included volume
 * is gone, and what any overage costs — so a disputed invoice is settled by
 * looking at the same screen rather than by arguing about our word for it.
 *
 * Read-only. A tenant can see its usage; only the platform owner sets the tier
 * that prices it.
 */
router.get(
  '/usage',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const Hospital = require('../models/Hospital');
    const { meterSummary, periodKey, previousPeriod, MESSAGE_KINDS } = require('../utils/messageMeter');

    const facility = await Hospital.findOne({ id: facilityOf(req) });
    if (!facility) throw new HttpError(404, 'Facility not found');

    // "YYYY-MM", defaulting to the month in progress. Validated rather than
    // trusted: an unparseable period would otherwise read as a month with no
    // traffic, which looks identical to a quiet one.
    const requested = String(req.query.period || '').trim();
    const period = /^\d{4}-\d{2}$/.test(requested) ? requested : periodKey();

    const [current, previous] = await Promise.all([
      meterSummary(facility, period),
      meterSummary(facility, previousPeriod(period))
    ]);

    res.json({
      ...current,
      // Last month beside this one, because a number alone does not tell a
      // hospital whether it is about to go over — the trend does.
      previous: { period: previous.period, billable: previous.billable, sent: previous.usage.sent },
      kinds: MESSAGE_KINDS
    });
  })
);

export default router;
module.exports = router;
