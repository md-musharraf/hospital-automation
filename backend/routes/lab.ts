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
const { prescriptionUrl } = require('../utils/env');
const logger = require('../utils/logger');

// Role guard for this router (see middleware/auth.js).
const ensureLab = ensureRole('lab');

/**
 * Can this stored report be put in a message as a link?
 *
 * `reportPdf` holds one of two very different things: a cloud object URL, or —
 * when cloud storage is unconfigured — the entire PDF inlined as a base64 data
 * URI. Only the first is a link. Sending the second would push a few hundred
 * kilobytes of base64 into a WhatsApp text body.
 */
function isShareableLink(value?: string | null): boolean {
  return typeof value === 'string' && /^https?:\/\/\S+$/i.test(value.trim()) && value.length <= 2000;
}

/** Ceiling for a report inlined as a data URI, in characters (~600 KB of base64). */
const MAX_INLINE_REPORT_CHARS = 800_000;

/**
 * What "the patient has already been sent THIS document" means.
 *
 * For a cloud report it is the URL, so replacing a wrong report with a
 * corrected one is a different value and does notify again. An inlined report
 * has no URL to compare, so it is identified by its file name and size —
 * different enough that a re-upload of a corrected PDF re-notifies, stable
 * enough that saving the same worksheet twice does not.
 */
function shareSignature(reportPdf?: string | null, reportFileName?: string | null): string {
  const value = String(reportPdf || '');
  if (!value) return '';
  if (isShareableLink(value)) return value;
  return `inline:${String(reportFileName || 'report.pdf')}:${value.length}`;
}

/**
 * Put a copy of the report in the patient's hand, whatever form it is stored in.
 *
 * The rule this enforces: filing a report IS publishing it. The patient should
 * never have to walk back to a counter to ask whether their result exists, and
 * they should never be handed a link that does not open.
 *
 * A cloud report is sent as a direct download link. An INLINED one — the
 * fallback when cloud storage is unconfigured — is sent as a link to the
 * patient's own report page instead. It has to be: the stored value is a
 * base64 data URI holding the whole PDF, and pasting one into a message body
 * would push several hundred kilobytes of text at a phone. Before this, that
 * case sent the patient nothing at all, so an entire facility running without
 * ImageKit keys silently had no report delivery — the feature looked fine in
 * testing and did nothing in the field.
 *
 * Returns whether a message actually left, which every caller reports back:
 * `sendWhatsAppNotification` RESOLVES on a Meta rejection rather than throwing,
 * so an optimistic "sent" would mark the patient as told and suppress the retry
 * forever. See utils/whatsappHelper.
 */
async function shareReportWithPatient(options: {
  token: any;
  test: any;
  patient: any;
  doctor: any;
  /** Overrides the result line, e.g. the freshly entered value on completion. */
  resultLine?: string;
  /** Appended after the links — "all your reports are ready, go back to Dr X". */
  closing?: string;
}): Promise<{ sent: boolean; link: string; direct: boolean; reason?: string }> {
  const { token, test, patient, doctor, resultLine = '', closing = '' } = options;

  if (!patient || !patient.phone) return { sent: false, link: '', direct: false, reason: 'no_phone' };
  if (!test || !test.reportPdf) return { sent: false, link: '', direct: false, reason: 'no_report' };

  const direct = isShareableLink(test.reportPdf);
  const pageLink = prescriptionUrl(token._id);
  const link = direct ? test.reportPdf : pageLink;
  const doctorName = doctor ? doctor.name : 'your doctor';
  const room = doctor && doctor.currentRoom ? ` (${doctor.currentRoom})` : '';

  const message =
    `Hello ${patient.name}, your lab report is ready.\n` +
    `🧪 Test: ${test.testName}\n` +
    (resultLine ? `📊 Result: ${resultLine}\n` : '') +
    (test.abnormal ? `⚠️ This value is outside the normal range.\n` : '') +
    (direct
      ? `\n📄 Download your official PDF report:\n${link}\n`
      : `\n📄 Open your report here:\n${link}\n`) +
    (direct ? `\nAll your reports: ${pageLink}\n` : '') +
    (closing ||
      `\n➡️ Please show this report to ${doctorName}${room}. No need to take a new token.\n` +
        `➡️ कृपया यह रिपोर्ट डॉक्टर को दिखाएँ। नया टोकन लेने की ज़रूरत नहीं।`);

  try {
    const { sendWhatsAppNotification } = require('../utils/whatsappHelper');
    const result = await sendWhatsAppNotification(patient.phone, message);
    const sent = Boolean(result && result.status === 'sent');
    if (sent) {
      test.reportSharedAt = new Date();
      test.reportSharedUrl = shareSignature(test.reportPdf, test.reportFileName);
    }
    return { sent, link, direct, ...(sent ? {} : { reason: (result && result.error) || 'delivery_failed' }) };
  } catch (err) {
    logger.error('Lab report share WhatsApp failed', { err, tokenId: String(token._id) });
    return { sent: false, link, direct, reason: 'delivery_failed' };
  }
}

/** The facility's letterhead name, so a report message is not branded with a slug. */
async function facilityDisplayName(hospital: string): Promise<string> {
  try {
    const { getBillingConfig } = require('../utils/billingConfig');
    const config = await getBillingConfig(hospital);
    return (config && config.displayName) || hospital;
  } catch (err) {
    logger.error('Could not read facility letterhead for a lab message', { err, hospital });
    return hospital;
  }
}

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
        return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
      });

    res.json(pending);
  } catch (err: any) {
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
      .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());

    res.json(done);
  } catch (err: any) {
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
            turnaroundTotal += (new Date(test.completedAt).getTime() - new Date(from).getTime()) / 60000;
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
  } catch (err: any) {
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
  } catch (err: any) {
    logger.error('Error marking sample collected', { err: err });
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/v1/lab/tests/:tokenId/report — attach a report PDF and send it.
 *
 * The bench used to attach the file and the patient heard nothing until the
 * test was separately marked complete, which in practice happened at the end of
 * a shift or not at all. So the report existed, the patient did not know, and
 * they came back to the counter to ask — which is exactly the queue this system
 * is meant to remove. Attaching the PDF now IS the act of publishing it.
 *
 * Only a real https link is ever put in the message. `reportPdf` may also hold
 * a base64 data URI (the fallback when cloud storage is unconfigured), and a
 * data URI is a whole PDF — pasting one into a WhatsApp body would send several
 * hundred kilobytes of base64 to a patient's phone as text. Those are stored
 * but announced without a link, pointing at the tracker page instead.
 */
router.post('/tests/:tokenId/report', authenticateToken, ensureLab, async (req, res) => {
  try {
    const { testName, reportPdf, reportFileName, notify = true } = req.body || {};

    if (!testName || typeof testName !== 'string' || testName.length > 100) {
      return res
        .status(400)
        .json({ message: 'testName is required and must be a string up to 100 characters' });
    }
    if (!reportPdf || typeof reportPdf !== 'string') {
      return res.status(400).json({ message: 'reportPdf is required.' });
    }
    if (reportFileName && (typeof reportFileName !== 'string' || reportFileName.length > 200)) {
      return res.status(400).json({ message: 'reportFileName must be a string up to 200 characters' });
    }

    const shareable = isShareableLink(reportPdf);
    if (!shareable && !/^data:application\/pdf[;,]/i.test(reportPdf)) {
      return res.status(400).json({ message: 'reportPdf must be an https link or a PDF data URI.' });
    }

    // An inlined report is stored ON the token document, and that document also
    // holds the patient's whole visit — prescription, journey, every other test.
    // A few large scans would push it toward Mongo's 16 MB ceiling and the write
    // that finally fails takes the visit with it, not just the attachment. The
    // 1 MB body limit already bounds one request; this states the real ceiling
    // and says which file is too big instead of returning a bare 413.
    if (!shareable && reportPdf.length > MAX_INLINE_REPORT_CHARS) {
      return res.status(413).json({
        message:
          'That report is too large to store inline. Configure cloud storage (ImageKit) so reports upload as links, or attach a smaller PDF.'
      });
    }

    const hospital = facilityOf(req);
    const token = await Token.findById(req.params.tokenId);
    if (!token) return res.status(404).json({ message: 'Token not found' });
    if (token.hospital !== hospital) {
      return res.status(403).json({ message: 'This token belongs to another facility' });
    }

    const test = (token.labTests || []).find((t) => t.testName.toLowerCase() === testName.toLowerCase());
    if (!test) return res.status(404).json({ message: `Test "${testName}" not found on this token` });

    const [tokenPatient, tokenDoctor] = await Promise.all([
      token.patient ? Patient.findById(toId(token.patient)) : null,
      token.doctor ? Doctor.findById(toId(token.doctor)) : null
    ]);

    test.reportPdf = reportPdf;
    if (reportFileName) test.reportFileName = reportFileName;
    // A report exists, so the bench has clearly started: never leave the test
    // reading "Pending" with a PDF hanging off it.
    if (test.status === 'Pending') test.status = 'Collected';

    // Not the same document they were already sent — a re-save of an unchanged
    // worksheet must not message twice, but a corrected report must.
    const alreadySent =
      Boolean(test.reportSharedUrl) &&
      test.reportSharedUrl === shareSignature(reportPdf, reportFileName || test.reportFileName);
    let notified = false;
    let shareFailure = '';

    if (notify !== false && !alreadySent) {
      const share = await shareReportWithPatient({
        token,
        test,
        patient: tokenPatient,
        doctor: tokenDoctor
      });
      notified = share.sent;
      if (!share.sent && share.reason) shareFailure = share.reason;
    }

    token.markModified && token.markModified('labTests');
    await token.save();

    const io = req.io;
    const payload = {
      tokenId: String(token._id),
      testName: test.testName,
      status: test.status,
      reportPdf: shareable ? reportPdf : '',
      notified
    };
    toDoctor(io, toId(token.doctor), 'lab-report-attached', payload);
    toRole(io, 'lab', hospital, 'lab-updated', payload);
    toFacility(io, hospital, 'lab-updated', payload, { alsoLegacy: true });
    if (io) io.to(`patient:${String(token._id)}`).emit('journey-updated', payload);

    await logActivity(io, {
      hospital,
      type: 'lab-report-attached',
      role: 'lab',
      actor: req.user.username || 'Lab',
      message:
        `Report PDF attached for ${test.testName} (${token.tokenNumber})` +
        (notified ? ' and sent to the patient on WhatsApp.' : '.'),
      tokenNumber: token.tokenNumber,
      refId: token._id,
      severity: 'success'
    });

    res.json({
      message: notified
        ? `Report attached and sent to ${tokenPatient ? tokenPatient.name : 'the patient'} on WhatsApp.` +
          (shareable
            ? ''
            : ' Cloud storage is off, so they were sent their report page rather than the file.')
        : alreadySent
          ? 'Report attached. The patient already has this document.'
          : shareFailure === 'no_phone'
            ? 'Report attached. This patient has no phone number on file, so nothing could be sent.'
            : 'Report attached, but WhatsApp did not accept the message. Use Resend once it is working.',
      notified,
      shareable,
      token
    });
  } catch (err: any) {
    logger.error('Error attaching lab report', { err: err });
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/v1/lab/tests/:tokenId/report/resend — send a stored report again.
 *
 * For the patient who says the message never arrived, or who deleted it. The
 * bench used to do this by opening a wa.me link, which drafts the message in
 * whatever WhatsApp account the counter machine is signed into: it needs a human
 * to press send, it leaves from a personal number rather than the lab's, and it
 * silently produced a broken link whenever the report was stored inline as a
 * data URI rather than uploaded to cloud storage.
 */
router.post('/tests/:tokenId/report/resend', authenticateToken, ensureLab, async (req, res) => {
  try {
    const { testName } = req.body || {};
    if (!testName || typeof testName !== 'string' || testName.length > 100) {
      return res.status(400).json({ message: 'testName is required.' });
    }

    const hospital = facilityOf(req);
    const token = await Token.findById(req.params.tokenId);
    if (!token) return res.status(404).json({ message: 'Token not found' });
    if (token.hospital !== hospital) {
      return res.status(403).json({ message: 'This token belongs to another facility' });
    }

    const test = (token.labTests || []).find((t) => t.testName.toLowerCase() === testName.toLowerCase());
    if (!test) return res.status(404).json({ message: `Test "${testName}" not found on this token` });

    const [tokenPatient, tokenDoctor] = await Promise.all([
      token.patient ? Patient.findById(toId(token.patient)) : null,
      token.doctor ? Doctor.findById(toId(token.doctor)) : null
    ]);
    if (!tokenPatient || !tokenPatient.phone) {
      return res.status(400).json({ message: 'This patient has no phone number on file.' });
    }

    // A direct download when the report lives in cloud storage; otherwise the
    // patient's report page, which serves the inlined PDF. Either way there is
    // always a link — a "here is your report again" message with nothing to
    // open is the reason the patient asked twice in the first place.
    const direct = isShareableLink(test.reportPdf) ? test.reportPdf : '';
    const link = direct || prescriptionUrl(token._id);
    const resultLine = test.resultValue
      ? `${test.resultValue}${test.unit ? ' ' + test.unit : ''}${test.normalRange ? ` (normal ${test.normalRange})` : ''}`
      : test.remarks || 'Completed';

    const message =
      `🧪 ${String((await facilityDisplayName(hospital)) || hospital).toUpperCase()}\n` +
      `Hello ${tokenPatient.name}, here is your lab report again.\n\n` +
      `Test: ${test.testName}\n` +
      `Result: ${resultLine}${test.abnormal ? '\n⚠️ This value is outside the normal range.' : ''}\n` +
      (direct
        ? `\n📄 Download your official PDF report:\n${direct}\n\nView online: ${prescriptionUrl(token._id)}\n`
        : `\n📄 Open your report here:\n${link}\n`) +
      `Please show this to ${tokenDoctor ? tokenDoctor.name : 'your doctor'}. 🙏`;

    const { sendWhatsAppNotification } = require('../utils/whatsappHelper');
    const result = await sendWhatsAppNotification(tokenPatient.phone, message);
    const sent = result && result.status === 'sent';

    await logActivity(req.io, {
      hospital,
      type: 'lab-report-resent',
      role: 'lab',
      actor: req.user.username || 'Lab',
      message: `${test.testName} report ${sent ? 'resent to' : 'resend attempted for'} ${tokenPatient.name} (${token.tokenNumber}).`,
      tokenNumber: token.tokenNumber,
      refId: token._id,
      severity: sent ? 'success' : 'warning'
    });

    if (!sent) {
      return res.status(502).json({
        message: `WhatsApp did not accept the message${result && result.error ? ` — ${result.error}` : ''}.`,
        sent: false,
        hasPdfLink: Boolean(test.reportPdf)
      });
    }

    // Record what they now hold, so an attach of this same file does not send a
    // third copy behind the resend.
    if (test.reportPdf) {
      test.reportSharedAt = new Date();
      test.reportSharedUrl = shareSignature(test.reportPdf, test.reportFileName);
      token.markModified && token.markModified('labTests');
      try {
        await token.save();
      } catch (saveErr) {
        logger.error('Could not record the report resend', { err: saveErr });
      }
    }

    res.json({
      message: `Report resent to ${tokenPatient.name} on WhatsApp.`,
      sent: true,
      hasPdfLink: Boolean(test.reportPdf),
      direct: Boolean(direct)
    });
  } catch (err: any) {
    logger.error('Error resending lab report', { err: err });
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
    test.resultValue =
      resultValue || test.resultValue || (req.body.reportPdf ? 'PDF Report Uploaded' : 'Normal');
    test.unit = unit || test.unit;
    test.normalRange = normalRange || test.normalRange;
    test.abnormal = Boolean(abnormal);
    test.remarks = remarks || test.remarks || 'Report completed';
    if (req.body.reportPdf) test.reportPdf = req.body.reportPdf;
    if (req.body.reportFileName) test.reportFileName = req.body.reportFileName;
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
    } catch (err: any) {
      logger.error('Push notification failed on lab complete', { err: err });
    }

    // The patient gets their copy at the same moment the doctor does.
    //
    // "Send to doctor" is the button the bench actually presses, and it used to
    // be the only step in the flow that could leave the patient with nothing
    // openable: the PDF line was dropped whenever the report was stored inline,
    // which is every facility running without cloud storage keys. Now the
    // report always goes out — the file itself when it is a link, otherwise the
    // patient's own report page, which serves the same document.
    const doctorName = tokenDoctor ? tokenDoctor.name : 'your doctor';
    const room = tokenDoctor && tokenDoctor.currentRoom ? ` (${tokenDoctor.currentRoom})` : '';
    const backToDoctor = everythingDone
      ? `\n➡️ All your reports are ready — please go back to ${doctorName}${room}. No need to take a new token.\n➡️ आपकी सभी रिपोर्ट तैयार हैं — कृपया सीधे डॉक्टर के पास जाएँ। नया टोकन लेने की ज़रूरत नहीं।`
      : '';

    let patientNotified = false;
    if (tokenPatient && tokenPatient.phone) {
      if (test.reportPdf) {
        const share = await shareReportWithPatient({
          token,
          test,
          patient: tokenPatient,
          doctor: tokenDoctor,
          resultLine,
          ...(backToDoctor ? { closing: backToDoctor } : {})
        });
        patientNotified = share.sent;
        // The stamp above lives on the sub-document; persist it so a later
        // attach of the same file does not send this all over again.
        if (share.sent) {
          token.markModified && token.markModified('labTests');
          try {
            await token.save();
          } catch (saveErr) {
            logger.error('Could not record that the report was shared', { err: saveErr });
          }
        }
      } else {
        // No document filed at all — the result is the whole report. Still
        // worth a message: the value and where to take it.
        try {
          const { sendWhatsAppNotification } = require('../utils/whatsappHelper');
          const alertMsg =
            `Hello ${tokenPatient.name}, your lab report for "${testName}" is ready.\n` +
            `🧪 Result: ${resultLine}${test.abnormal ? '\n⚠️ This value is outside the normal range — please show it to your doctor.' : ''}` +
            `\nView online: ${prescriptionUrl(token._id)}\n` +
            backToDoctor;
          const result = await sendWhatsAppNotification(tokenPatient.phone, alertMsg);
          patientNotified = Boolean(result && result.status === 'sent');
        } catch (waErr) {
          logger.error('Lab WhatsApp notify failed', { err: waErr });
        }
      }
    }

    res.json({
      message: `Test "${testName}" completed successfully.`,
      allComplete: everythingDone,
      patientNotified,
      token
    });
  } catch (err: any) {
    logger.error('Error completing test', { err: err });
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
module.exports = router;
