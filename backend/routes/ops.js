// Shared operations surface — one live picture of the facility that EVERY role
// can read (doctor, staff, lab, pharmacy). Previously each portal only knew
// about its own slice, so nobody could see that the lab was the bottleneck or
// that a doctor had 14 people waiting while another had 2.

const express = require('express');
const router = express.Router();
const Token = require('../models/Token');
const Doctor = require('../models/Doctor');
const Queue = require('../models/Queue');
const ActivityLog = require('../models/ActivityLog');
const RefillRequest = require('../models/RefillRequest');
const { authenticateToken } = require('../middleware/auth');
const { stockAlerts } = require('../utils/stockHelper');
const { stageMessage } = require('../utils/journeyHelper');

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

/** Tokens belonging to this facility, created today. */
async function todaysTokens(hospital) {
  const start = startOfToday().getTime();
  const all = await Token.find({ hospital });
  // Date filtering in JS keeps this identical on real Mongo and the in-memory
  // mock (which stores createdAt as an ISO string).
  return (all || []).filter(t => !t.createdAt || new Date(t.createdAt).getTime() >= start);
}

// GET the facility's live activity feed (newest first).
router.get('/activity', authenticateToken, async (req, res) => {
  try {
    const hospital = req.user.hospital || 'general-hospital';
    const limit = Math.min(parseInt(req.query.limit, 10) || 40, 200);
    const rows = await ActivityLog.find({ hospital });
    const sorted = (rows || [])
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, limit);
    res.json(sorted);
  } catch (err) {
    console.error('Error fetching activity feed:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET the whole-facility live overview: who is on duty, where every patient is,
// what each department's backlog looks like, and where the wait is worst.
router.get('/overview', authenticateToken, async (req, res) => {
  try {
    const hospital = req.user.hospital || 'general-hospital';

    const [doctors, tokens] = await Promise.all([
      Doctor.find({ hospital }, '-passwordHash'),
      todaysTokens(hospital)
    ]);

    const queues = await Queue.find({ doctor: { $in: doctors.map(d => d._id) } });
    const queueByDoctor = new Map(queues.map(q => [String(q.doctor), q]));

    // Per-doctor live load, so reception can steer the next walk-in to whoever
    // is actually free instead of guessing.
    const doctorLoad = doctors.map(d => {
      const q = queueByDoctor.get(String(d._id));
      const waiting = (q && q.activeQueue && q.activeQueue.length) || 0;
      const seen = tokens.filter(t =>
        String(t.doctor && (t.doctor._id || t.doctor)) === String(d._id) && t.status === 'Completed').length;
      return {
        _id: d._id,
        name: d.name,
        department: d.department,
        room: d.currentRoom,
        availabilityStatus: d.availabilityStatus,
        waiting,
        inCabin: Boolean(q && q.currentToken),
        estimatedWait: waiting * (d.averageCheckupTime || 10) + ((q && q.bufferDelay) || 0),
        seenToday: seen,
        dailyTokenLimit: d.dailyTokenLimit || 0
      };
    }).sort((a, b) => b.waiting - a.waiting);

    // Where every patient in the building currently is.
    const byStage = {};
    for (const t of tokens) {
      const s = t.journeyStage || 'Waiting';
      byStage[s] = (byStage[s] || 0) + 1;
    }

    const labPending = tokens.filter(t => (t.labTests || []).some(x => x.status !== 'Completed')).length;
    const labUrgent = tokens.filter(t =>
      (t.labTests || []).some(x => x.status !== 'Completed' && x.urgency === 'Urgent')).length;
    const abnormalResults = tokens.filter(t => (t.labTests || []).some(x => x.abnormal)).length;
    const rxPending = tokens.filter(t =>
      t.prescription && (t.prescription.medicines || []).length > 0 && !t.prescription.dispensed).length;

    // Who has been waiting longest — the number a floor manager actually acts on.
    const waitingTokens = tokens
      .filter(t => t.status === 'Waiting')
      .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    const oldest = waitingTokens[0];
    const longestWaitMins = oldest && oldest.createdAt
      ? Math.round((Date.now() - new Date(oldest.createdAt).getTime()) / 60000)
      : 0;

    const [alerts, pendingRefills] = await Promise.all([
      stockAlerts(hospital),
      RefillRequest.find({ hospital, status: 'Pending' })
    ]);

    res.json({
      hospital,
      generatedAt: new Date(),
      totals: {
        tokensToday: tokens.length,
        completed: tokens.filter(t => t.status === 'Completed').length,
        waiting: tokens.filter(t => t.status === 'Waiting').length,
        inCabin: tokens.filter(t => t.status === 'Active' || t.status === 'Called').length,
        absent: tokens.filter(t => t.status === 'Absent').length,
        emergency: tokens.filter(t => t.tokenType === 'Emergency').length,
        priority: tokens.filter(t => t.priorityCategory && t.priorityCategory !== 'None').length
      },
      byStage,
      departments: {
        lab: { pending: labPending, urgent: labUrgent, abnormal: abnormalResults },
        pharmacy: { pending: rxPending, outOfStock: alerts.out.length, lowStock: alerts.low.length, expiring: alerts.expiring.length },
        refills: { pending: (pendingRefills || []).length }
      },
      doctorsOnDuty: doctorLoad.filter(d => d.availabilityStatus === 'Available').length,
      doctorLoad,
      longestWaitMins,
      longestWaitToken: oldest ? oldest.tokenNumber : null
    });
  } catch (err) {
    console.error('Error building ops overview:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET one patient's full journey — every role can pull this up so nobody has to
// phone another counter to ask "where is this patient / what's pending?".
router.get('/journey/:tokenId', authenticateToken, async (req, res) => {
  try {
    const token = await Token.findById(req.params.tokenId)
      .populate('patient')
      .populate('doctor', '-passwordHash');
    if (!token) {
      return res.status(404).json({ message: 'Token not found' });
    }
    if (token.hospital !== (req.user.hospital || 'general-hospital')) {
      return res.status(403).json({ message: 'This token belongs to another facility' });
    }

    const stage = token.journeyStage || 'Waiting';
    res.json({
      tokenNumber: token.tokenNumber,
      stage,
      stageMessage: stageMessage(stage),
      history: token.stageHistory || [],
      patient: token.patient ? { name: token.patient.name, age: token.patient.age, phone: token.patient.phone } : null,
      doctor: token.doctor ? { name: token.doctor.name, department: token.doctor.department, room: token.doctor.currentRoom } : null,
      labTests: token.labTests || [],
      prescription: token.prescription || null,
      status: token.status,
      estimatedWaitTime: token.estimatedWaitTime
    });
  } catch (err) {
    console.error('Error fetching patient journey:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
