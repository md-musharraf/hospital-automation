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
const { estimateWaitMinutes } = require('../utils/queueHelper');
const { sittingStatus, delayNotice, todayOpdHours } = require('../utils/shiftHelper');

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

    // Per-doctor live load, so reception can steer the next walk-in to whoever
    // is actually free instead of guessing.
    const doctorLoad = doctors
      .map((doctor) => {
        const queue: any = queueByDoctor.get(toId(doctor));
        const waiting = (queue && queue.activeQueue && queue.activeQueue.length) || 0;
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
          // cabin guaranteed not to open.
          estimatedWait: estimateWaitMinutes(doctor, waiting, (queue && queue.bufferDelay) || 0),
          sitting: sittingStatus(doctor),
          // Today's announced delay, so the floor board and the waiting-room
          // screen carry the same revised start the patient was WhatsApped.
          delay: delayNotice(doctor),
          opdHoursToday: todayOpdHours(doctor),
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

export default router;
module.exports = router;
