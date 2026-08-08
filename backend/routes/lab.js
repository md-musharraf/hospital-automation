const express = require('express');
const router = express.Router();
const Token = require('../models/Token');
const Doctor = require('../models/Doctor');
const Patient = require('../models/Patient');
const { authenticateToken, ensureRole } = require('../middleware/auth');
const { startOfToday } = require('../utils/dates');
const { toId } = require('../utils/ids');
const { facilityOf, facilityTokens } = require('../utils/tenancy');
const { toRole, toDoctor, toFacility, logActivity, announceJourney } = require('../utils/realtime');
const { setStage, allTestsComplete } = require('../utils/journeyHelper');
const logger = require('../utils/logger');

// Role guard for this router (see middleware/auth.js).
const ensureLab = ensureRole('lab');

// GET the lab worklist: every token with tests that are not finished yet.
// Urgent tests first, then oldest request first — the order a bench actually works in.
router.get('/queues/pending-tests', authenticateToken, ensureLab, async (req, res) => {
  try {
    const hospital = facilityOf(req);
    const tokens = await facilityTokens(hospital);

    const pending = tokens
      .filter((t) => (t.labTests || []).some((x) => x.status !== 'Completed'))
      .sort((a, b) => {
        const au = (a.labTests || []).some((x) => x.status !== 'Completed' && x.urgency === 'Urgent') ? 0 : 1;
        const bu = (b.labTests || []).some((x) => x.status !== 'Completed' && x.urgency === 'Urgent') ? 0 : 1;
        if (au !== bu) return au - bu;
        return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
      });

    res.json(pending);
  } catch (err) {
    logger.error('Error fetching pending tests', { err: err });
    res.status(500).json({ message: 'Server error' });
  }
});

// GET reports finished today — the bench's own record, and what the doctor sees
// arriving on the other side.
router.get('/completed-today', authenticateToken, ensureLab, async (req, res) => {
  try {
    const hospital = facilityOf(req);
    const start = startOfToday().getTime();
    const tokens = await facilityTokens(hospital);

    const done = tokens
      .filter((t) =>
        (t.labTests || []).some(
          (x) => x.status === 'Completed' && x.completedAt && new Date(x.completedAt).getTime() >= start
        )
      )
      .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

    res.json(done);
  } catch (err) {
    logger.error('Error fetching completed tests', { err: err });
    res.status(500).json({ message: 'Server error' });
  }
});

// GET the lab's live workload numbers for the dashboard header.
router.get('/stats', authenticateToken, ensureLab, async (req, res) => {
  try {
    const hospital = facilityOf(req);
    const start = startOfToday().getTime();
    const tokens = await facilityTokens(hospital);

    let pending = 0,
      collected = 0,
      completedToday = 0,
      urgentPending = 0,
      abnormalToday = 0;
    let turnaroundTotal = 0,
      turnaroundCount = 0;

    for (const t of tokens) {
      for (const test of t.labTests || []) {
        if (test.status === 'Pending') {
          pending++;
          if (test.urgency === 'Urgent') urgentPending++;
        } else if (test.status === 'Collected') {
          collected++;
          if (test.urgency === 'Urgent') urgentPending++;
        } else if (test.completedAt && new Date(test.completedAt).getTime() >= start) {
          completedToday++;
          if (test.abnormal) abnormalToday++;
          // Turnaround = sample collected -> result entered. Falls back to the
          // token's creation time when the collection step was skipped.
          const from = test.collectedAt || t.createdAt;
          if (from) {
            turnaroundTotal += (new Date(test.completedAt) - new Date(from)) / 60000;
            turnaroundCount++;
          }
        }
      }
    }

    res.json({
      pending,
      collected,
      completedToday,
      urgentPending,
      abnormalToday,
      avgTurnaroundMins: turnaroundCount > 0 ? Math.round(turnaroundTotal / turnaroundCount) : 0,
      patientsWaiting: tokens.filter((t) => (t.labTests || []).some((x) => x.status !== 'Completed')).length
    });
  } catch (err) {
    logger.error('Error building lab stats', { err: err });
    res.status(500).json({ message: 'Server error' });
  }
});

// POST mark a sample as collected. Small step, big effect: the doctor can now
// tell "the lab has not started" apart from "the lab is running it right now",
// and the patient stops asking reception.
router.post('/tests/:tokenId/collect', authenticateToken, ensureLab, async (req, res) => {
  try {
    const { testName } = req.body;
    if (!testName || typeof testName !== 'string' || testName.length > 100) {
      return res
        .status(400)
        .json({ message: 'testName is required and must be a string up to 100 characters' });
    }

    const hospital = facilityOf(req);
    const token = await Token.findById(req.params.tokenId);
    if (!token) return res.status(404).json({ message: 'Token not found' });
    if (token.hospital !== hospital) {
      return res.status(403).json({ message: 'This token belongs to another facility' });
    }

    const test = (token.labTests || []).find((t) => t.testName.toLowerCase() === testName.toLowerCase());
    if (!test) return res.status(404).json({ message: `Test "${testName}" not found on this token` });
    if (test.status === 'Completed') {
      return res.status(400).json({ message: `Test "${testName}" is already completed` });
    }

    test.status = 'Collected';
    test.collectedAt = new Date();
    token.markModified && token.markModified('labTests');
    await token.save();

    const io = req.io;
    toDoctor(io, toId(token.doctor), 'lab-updated', {
      tokenId: String(token._id),
      testName,
      status: 'Collected'
    });
    toRole(io, 'lab', hospital, 'lab-updated', { tokenId: String(token._id), testName, status: 'Collected' });
    await logActivity(io, {
      hospital,
      type: 'lab-collected',
      role: 'lab',
      actor: req.user.username || 'Lab',
      message: `Sample collected for ${testName} (${token.tokenNumber}).`,
      tokenNumber: token.tokenNumber,
      refId: token._id
    });

    res.json({ message: `Sample for "${testName}" marked as collected.`, token });
  } catch (err) {
    logger.error('Error marking sample collected', { err: err });
    res.status(500).json({ message: 'Server error' });
  }
});

// POST complete a specific lab test WITH a structured result.
// When the last outstanding test lands, the patient's journey flips to
// "Lab Complete" and the ordering doctor is pinged — so the patient walks
// straight back to the cabin instead of re-queuing at reception.
router.post('/tests/:tokenId/complete', authenticateToken, ensureLab, async (req, res) => {
  try {
    const { tokenId } = req.params;
    const { testName, remarks, resultValue, unit, normalRange, abnormal } = req.body;

    if (!testName || typeof testName !== 'string' || testName.trim().length === 0 || testName.length > 100) {
      return res
        .status(400)
        .json({ message: 'testName is required and must be a string up to 100 characters' });
    }
    if (remarks && (typeof remarks !== 'string' || remarks.length > 500)) {
      return res.status(400).json({ message: 'Remarks must be a valid string up to 500 characters' });
    }
    for (const [field, val] of [
      ['resultValue', resultValue],
      ['unit', unit],
      ['normalRange', normalRange]
    ]) {
      if (val !== undefined && val !== null && (typeof val !== 'string' || val.length > 100)) {
        return res.status(400).json({ message: `${field} must be a string up to 100 characters` });
      }
    }

    const hospital = facilityOf(req);
    // Load WITHOUT populate: saving a populated document writes the nested
    // objects back in place of the ObjectIds, which then breaks every later
    // `{ doctor: <id> }` lookup — including the doctor's own "results ready"
    // list. Fetch the related docs separately for the notifications below.
    const token = await Token.findById(tokenId);
    if (!token) {
      return res.status(404).json({ message: 'Token not found' });
    }
    if (token.hospital !== hospital) {
      return res.status(403).json({ message: 'This token belongs to another facility' });
    }
    const [tokenPatient, tokenDoctor] = await Promise.all([
      token.patient ? Patient.findById(toId(token.patient)) : null,
      token.doctor ? Doctor.findById(toId(token.doctor)) : null
    ]);

    const test = (token.labTests || []).find((t) => t.testName.toLowerCase() === testName.toLowerCase());
    if (!test) {
      return res.status(404).json({ message: `Test "${testName}" not found on this token` });
    }
    if (test.status === 'Completed') {
      return res.status(400).json({ message: `Test "${testName}" has already been completed` });
    }

    test.status = 'Completed';
    test.resultValue = resultValue || test.resultValue;
    test.unit = unit || test.unit;
    test.normalRange = normalRange || test.normalRange;
    test.abnormal = Boolean(abnormal);
    test.remarks = remarks || test.remarks || 'No remarks provided';
    test.completedBy = req.user.username || 'Lab';
    test.completedAt = new Date();
    token.markModified && token.markModified('labTests');

    // All reports in => send the patient BACK to the doctor, not to reception.
    const everythingDone = allTestsComplete(token);
    if (everythingDone) {
      setStage(token, 'Lab Complete', req.user.username || 'Lab');
    }
    await token.save();

    const io = req.io;
    const doctorId = toId(token.doctor);
    const resultLine = test.resultValue
      ? `${test.resultValue}${test.unit ? ' ' + test.unit : ''}${test.normalRange ? ` (normal ${test.normalRange})` : ''}`
      : test.remarks;

    // The doctor who ordered it gets a targeted event — their "results ready"
    // panel updates without them refreshing anything.
    toDoctor(io, doctorId, 'lab-result-ready', {
      tokenId: String(token._id),
      tokenNumber: token.tokenNumber,
      patientName: tokenPatient && tokenPatient.name,
      testName,
      result: resultLine,
      abnormal: test.abnormal,
      allComplete: everythingDone
    });
    toRole(io, 'lab', hospital, 'lab-updated', { tokenId: String(token._id), testName, status: 'Completed' });
    toFacility(
      io,
      hospital,
      'lab-updated',
      { tokenId: String(token._id), testName, status: 'Completed' },
      { alsoLegacy: true }
    );

    await logActivity(io, {
      hospital,
      type: 'lab-completed',
      role: 'lab',
      actor: req.user.username || 'Lab',
      message: `${testName} result for ${token.tokenNumber}: ${resultLine}${test.abnormal ? ' — ABNORMAL' : ''}.`,
      tokenNumber: token.tokenNumber,
      refId: token._id,
      severity: test.abnormal ? 'critical' : 'success'
    });

    if (everythingDone) {
      await announceJourney(io, {
        hospital,
        token,
        stage: 'Lab Complete',
        role: 'lab',
        actor: req.user.username || 'Lab',
        type: 'lab-completed',
        message: `All reports ready for ${token.tokenNumber} — patient can return to ${tokenDoctor ? tokenDoctor.name : 'the doctor'}.`,
        severity: 'success'
      });
    }

    // Trigger Web Push Notification to Patient
    try {
      const pushHelper = require('../utils/pushHelper');
      await pushHelper.notifyByTokenId(token._id.toString(), {
        title: test.abnormal ? 'Lab Report Ready ⚠️' : 'Lab Report Ready! 🧪',
        body: everythingDone
          ? 'All your reports are ready. Please return to your doctor.'
          : `Your report for "${testName}" is now available.`,
        icon: '/icon.svg',
        url: `/prescription/${token._id}`
      });
    } catch (err) {
      logger.error('Push notification failed on lab complete', { err: err });
    }

    // Trigger WhatsApp notification to patient
    if (tokenPatient && tokenPatient.phone) {
      try {
        const { sendWhatsAppNotification } = require('../utils/whatsappHelper');
        const doctorName = tokenDoctor ? tokenDoctor.name : 'your doctor';
        const backToDoctor = everythingDone
          ? `\n\n➡️ All your reports are ready — please go back to ${doctorName}${tokenDoctor && tokenDoctor.currentRoom ? ` (${tokenDoctor.currentRoom})` : ''}. No need to take a new token.\n➡️ आपकी सभी रिपोर्ट तैयार हैं — कृपया सीधे डॉक्टर के पास जाएँ। नया टोकन लेने की ज़रूरत नहीं।`
          : '';
        const alertMsg =
          `Hello ${tokenPatient.name}, your lab report for "${testName}" is ready.\n` +
          `🧪 Result: ${resultLine}${test.abnormal ? '\n⚠️ This value is outside the normal range — please show it to your doctor.' : ''}\n` +
          `View online: https://hospital-automation-wine.vercel.app/prescription/${token._id}` +
          backToDoctor;
        await sendWhatsAppNotification(tokenPatient.phone, alertMsg);
      } catch (waErr) {
        logger.error('Lab WhatsApp notify failed', { err: waErr });
      }
    }

    res.json({
      message: `Test "${testName}" completed successfully.`,
      allComplete: everythingDone,
      token
    });
  } catch (err) {
    logger.error('Error completing test', { err: err });
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
