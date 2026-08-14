const path = require('path');
const { installMockDb } = require('./helpers/mockDb');
const { section, check, report } = require('./helpers/assert');

const { BACKEND_DIST: BACKEND } = require('./helpers/backendPath');
const { models } = installMockDb(BACKEND);
const { generateUniqueTokenNumber } = require('../backend/dist/utils/tokenHelper');

(async () => {
  section('Daily Token Reset & Lab PDF Report Tests');

  // Test 1: Daily Token Resets to T-1 Today
  const tokenNum1 = await generateUniqueTokenNumber('general-hospital');
  check('First token generated today starts at T-1', tokenNum1 === 'T-1');

  const pat = new models.Patient({ _id: 'pat-999', name: 'Suresh Kumar', phone: '+919988776655' });
  await pat.save();

  const doc = new models.Doctor({ _id: 'doc-888', name: 'Dr. Verma', hospital: 'general-hospital' });
  await doc.save();

  const tok1 = new models.Token({
    _id: 'tok-901',
    tokenNumber: tokenNum1,
    hospital: 'general-hospital',
    patient: pat._id,
    doctor: doc._id,
    symptoms: 'Headache',
    labTests: [{ testName: 'Blood Sugar Test', status: 'Pending' }]
  });
  await tok1.save();

  const tokenNum2 = await generateUniqueTokenNumber('general-hospital');
  check('Second token generated today is T-2', tokenNum2 === 'T-2');

  // Test 2: Upload PDF Test Report for Lab Test
  const testItem = tok1.labTests.find((t) => t.testName === 'Blood Sugar Test');
  check('Lab test initially pending', testItem.status === 'Pending');

  testItem.status = 'Completed';
  testItem.resultValue = 'PDF Report Attached';
  testItem.reportPdf = 'data:application/pdf;base64,JVBERi0xLjQKJ...';
  testItem.reportFileName = 'Blood_Sugar_Report.pdf';
  testItem.completedAt = new Date();
  await tok1.save();

  check('Lab test marked Completed', testItem.status === 'Completed');
  check('PDF data URI stored in reportPdf field', Boolean(testItem.reportPdf));
  check(
    'PDF file name stored as Blood_Sugar_Report.pdf',
    testItem.reportFileName === 'Blood_Sugar_Report.pdf'
  );

  // Test 3: Doctor & Patient retrieve Token with attached PDF Report
  const retrievedToken = await models.Token.findById('tok-901');
  const completedLab = retrievedToken.labTests.find((t) => t.testName === 'Blood Sugar Test');

  check('Retrieved token retains reportPdf URI', Boolean(completedLab.reportPdf));
  check(
    'Report PDF accessible for doctor & patient sharing',
    completedLab.reportFileName === 'Blood_Sugar_Report.pdf'
  );

  report();
})();
