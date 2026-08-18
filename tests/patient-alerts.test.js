/**
 * Getting the bill and the lab report to the patient when WhatsApp will not
 * carry them.
 *
 * The bug these cover: both documents had exactly one delivery route, a WhatsApp
 * text, and `sendWhatsAppNotification` resolves on a Meta rejection instead of
 * throwing. So a refused send produced a correct "not sent" in the response and
 * nothing else — no bill, no report, no trace on the tracker the patient was
 * told to watch, and no retry unless a human noticed and pressed a button.
 *
 * Every check below is about the same rule: the announcement is RECORDED first
 * and delivered second, so a dead channel costs a text and not the document.
 */

const path = require('path');
const { installMockDb } = require('./helpers/mockDb');
const { section, check, report } = require('./helpers/assert');

const { BACKEND_DIST: BACKEND } = require('./helpers/backendPath');
const { models } = installMockDb(BACKEND);

// The stub installed above always succeeds. Delivery failure is the whole
// subject here, so take control of it: the compiled code calls through the
// module object on every send, which makes this swap effective mid-test.
const whatsappStub = require.cache[path.resolve(BACKEND, 'utils', 'whatsappHelper.js')].exports;
const outbound = [];
let deliver = true;
whatsappStub.sendWhatsAppNotification = async (phone, message) => {
  outbound.push({ phone, message });
  return deliver ? { status: 'sent' } : { status: 'failed', error: 'Meta error 190' };
};

const { notifyPatient, retryPatientAlerts, markAlertsRead, MAX_WHATSAPP_ATTEMPTS } = require(
  path.resolve(BACKEND, 'utils', 'patientNotify.js')
);
const { hasUndeliveredAlert } = require(path.resolve(BACKEND, 'jobs', 'dailyReset.js'));

/** Wind an alert's backoff into the past so the sweep considers it due. */
function makeDue(token) {
  for (const alert of token.patientAlerts || []) {
    if (alert.nextRetryAt) alert.nextRetryAt = new Date(Date.now() - 60_000);
  }
  token.alertRetryAt = new Date(Date.now() - 60_000);
}

(async () => {
  const patient = new models.Patient({ name: 'Asha Devi', phone: '+919812345678' });
  await patient.save();
  const doctor = new models.Doctor({ name: 'Dr. Rao', hospital: 'general-hospital' });
  await doctor.save();

  const newToken = async (number) => {
    const token = new models.Token({
      tokenNumber: number,
      hospital: 'general-hospital',
      patient: patient._id,
      doctor: doctor._id,
      symptoms: 'Fever',
      journeyStage: 'Completed',
      patientAlerts: []
    });
    await token.save();
    return token;
  };

  // ---------------------------------------------------------------------
  section('A refused WhatsApp no longer means the patient was never told');

  deliver = false;
  const failedToken = await newToken('T-1');
  const failed = await notifyPatient({
    token: failedToken,
    patient,
    kind: 'bill',
    title: 'Your bill is ready',
    body: 'Invoice INV-1001 — total ₹800, paid ₹800.',
    message: 'Full WhatsApp body for INV-1001',
    link: 'https://cdn.example.com/bills/INV-1001.pdf',
    linkLabel: 'Download bill (PDF)',
    dedupeKey: 'bill:INV-1001:800:800'
  });

  check('the send is reported as failed, honestly', failed.sent === false);
  check('...but the bill was recorded where the patient can see it', failed.recorded === true);
  check('...and it is on the token', (failedToken.patientAlerts || []).length === 1);
  check('...as a bill', failedToken.patientAlerts[0].kind === 'bill');
  check(
    '...carrying the download link',
    failedToken.patientAlerts[0].link === 'https://cdn.example.com/bills/INV-1001.pdf'
  );
  check('...marked undelivered rather than sent', failedToken.patientAlerts[0].whatsappStatus === 'failed');
  check('...and queued for another attempt', failed.willRetry === true);
  check('...with the retry stamped on the token for the sweep', Boolean(failedToken.alertRetryAt));

  // ---------------------------------------------------------------------
  section('A whole PDF is never put where a link belongs');

  const dataUriToken = await newToken('T-2');
  await notifyPatient({
    token: dataUriToken,
    patient,
    kind: 'report',
    title: 'CBC report ready',
    body: 'Result: normal.',
    message: 'body',
    // What `reportPdf` holds when the facility has no cloud storage: the entire
    // document. Rendering it in an href produces a button that silently does
    // nothing, and pasting it in a message body sends hundreds of KB of base64.
    link: 'data:application/pdf;base64,JVBERi0xLjQKJUVPRg=='
  });
  check('a data URI is refused as a link', dataUriToken.patientAlerts[0].link === '');

  // ---------------------------------------------------------------------
  section('No phone number is no longer the end of the road');

  const orphan = new models.Patient({ name: 'Walk-in', phone: '' });
  await orphan.save();
  const noPhoneToken = new models.Token({
    tokenNumber: 'T-3',
    hospital: 'general-hospital',
    patient: orphan._id,
    doctor: doctor._id,
    symptoms: 'Cough',
    patientAlerts: []
  });
  await noPhoneToken.save();

  const noPhone = await notifyPatient({
    token: noPhoneToken,
    patient: orphan,
    kind: 'report',
    title: 'Your lab report is ready',
    body: 'Show it to your doctor.',
    message: 'body'
  });
  check('nothing is sent, and it says so', noPhone.sent === false && noPhone.reason === 'no_phone');
  check('...but the report still reaches their tracker', noPhone.recorded === true);
  check('...and it is not queued for a pointless retry', !noPhoneToken.alertRetryAt);

  // ---------------------------------------------------------------------
  section('The same announcement twice is one card, not two');

  const dupToken = await newToken('T-4');
  for (let i = 0; i < 3; i += 1) {
    await notifyPatient({
      token: dupToken,
      patient,
      kind: 'report',
      title: 'Blood Sugar report ready',
      body: 'Result: 96 mg/dL.',
      message: 'body',
      dedupeKey: 'report:Blood Sugar:https://cdn.example.com/r1.pdf'
    });
  }
  check('re-announcing the same document updates one entry', dupToken.patientAlerts.length === 1);

  await notifyPatient({
    token: dupToken,
    patient,
    kind: 'report',
    title: 'Blood Sugar report ready (corrected)',
    body: 'Result: 196 mg/dL.',
    message: 'body',
    dedupeKey: 'report:Blood Sugar:https://cdn.example.com/r2-corrected.pdf'
  });
  check('a CORRECTED document is a new entry', dupToken.patientAlerts.length === 2);

  // ---------------------------------------------------------------------
  section('The follow-up: the sweep delivers what the outage swallowed');

  makeDue(failedToken);
  deliver = true;
  const before = outbound.length;
  const swept = await retryPatientAlerts(null);

  check('the queued bill is retried', swept.attempted >= 1);
  check('...and goes out once the channel is back', swept.sent >= 1);
  check('...as a real message carrying the composed body', outbound.length > before);
  check('...and the alert is marked delivered', failedToken.patientAlerts[0].whatsappStatus === 'sent');
  check('...with the token dropped from the retry queue', failedToken.alertRetryAt === null);

  // ---------------------------------------------------------------------
  section('A channel that never comes back is handed to a human');

  deliver = false;
  const doomed = await newToken('T-5');
  await notifyPatient({
    token: doomed,
    patient,
    kind: 'bill',
    title: 'Your bill is ready',
    body: 'Invoice INV-2002.',
    message: 'body',
    dedupeKey: 'bill:INV-2002'
  });

  let sweeps = 0;
  while (doomed.patientAlerts[0].whatsappStatus === 'failed' && sweeps < 10) {
    makeDue(doomed);
    await retryPatientAlerts(null);
    sweeps += 1;
  }

  check('it gives up rather than retrying forever', doomed.patientAlerts[0].whatsappStatus === 'abandoned');
  check(
    `...after exactly ${MAX_WHATSAPP_ATTEMPTS} attempts`,
    doomed.patientAlerts[0].attempts === MAX_WHATSAPP_ATTEMPTS,
    doomed.patientAlerts[0].attempts
  );
  check('...and stops being picked up', doomed.alertRetryAt === null);
  check('...while the patient can still read it on their tracker', Boolean(doomed.patientAlerts[0].title));

  // ---------------------------------------------------------------------
  section('"Try now" after the credential is fixed does not burn the budget');

  deliver = false;
  const halfway = await newToken('T-6');
  await notifyPatient({
    token: halfway,
    patient,
    kind: 'report',
    title: 'Report ready',
    body: 'Result: normal.',
    message: 'body',
    dedupeKey: 'report:forced'
  });
  const attemptsBefore = halfway.patientAlerts[0].attempts;
  const scheduledBefore = String(halfway.patientAlerts[0].nextRetryAt);

  await retryPatientAlerts(null, { force: true, hospital: 'general-hospital' });
  check(
    'a forced attempt that also fails costs no automatic attempt',
    halfway.patientAlerts[0].attempts === attemptsBefore
  );
  check('...and leaves the schedule alone', String(halfway.patientAlerts[0].nextRetryAt) === scheduledBefore);

  deliver = true;
  const forced = await retryPatientAlerts(null, { force: true, hospital: 'general-hospital' });
  check('...and delivers immediately once the channel works', forced.sent >= 1);
  check('...without waiting out the backoff', halfway.patientAlerts[0].whatsappStatus === 'sent');

  // ---------------------------------------------------------------------
  section('An undelivered message survives the close of day');

  deliver = false;
  const evening = await newToken('T-7');
  await notifyPatient({
    token: evening,
    patient,
    kind: 'bill',
    title: 'Your bill is ready',
    body: 'Invoice INV-3003.',
    message: 'body',
    dedupeKey: 'bill:INV-3003'
  });

  check('a token still owing a message is held back from the archive', hasUndeliveredAlert(evening));
  check('...and a settled one is not', hasUndeliveredAlert(failedToken) === false);

  // ---------------------------------------------------------------------
  section('The unread badge clears');

  check(
    'a new alert starts unread',
    evening.patientAlerts.every((a) => !a.readAt)
  );
  const cleared = await markAlertsRead(String(evening._id));
  check('reading them clears the badge', cleared === 1);
  check(
    '...on the stored document',
    evening.patientAlerts.every((a) => Boolean(a.readAt))
  );
  check('...and a second read is a no-op', (await markAlertsRead(String(evening._id))) === 0);

  report();
})();
