/**
 * Cross-role integration test — requires a RUNNING backend.
 *
 *   cd backend && AUTO_SEED=true node index.js      (terminal 1)
 *   npm run test:integration                        (terminal 2)
 *
 * Walks one patient through the whole building — Reception -> Doctor -> Lab ->
 * back to Doctor -> Pharmacy — and asserts that every role sees the same shared
 * state, that stock is decremented, that shortages are surfaced, and that the
 * activity feed written by one role is readable by another.
 *
 * Expects a FRESH backend (the in-memory store resets on restart): several
 * assertions check absolute counts.
 */
const { section, check, report } = require('./helpers/assert');

const BASE = process.env.API_BASE || 'http://localhost:5000/api/v1';
const HOSPITAL = 'general-hospital';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'supersecret123';

async function api(path, { method = 'GET', token, body, headers = {} } = {}) {
  const response = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: response.status, json };
}

async function login(role, credentials) {
  const { json } = await api(`/auth/${role}/login`, { method: 'POST', body: credentials });
  if (!json.token) throw new Error(`${role} login failed: ${JSON.stringify(json)}`);
  return json.token;
}

const DOCTOR_EMAIL = {
  'Dr. Sarah Jenkins': 'sarah.jenkins@hospital.com',
  'Dr. Robert Chen': 'robert.chen@hospital.com',
  'Dr. Emily Taylor': 'emily.taylor@hospital.com'
};

(async () => {
  // The seed puts its pharmacist in another facility, so make one here.
  await api('/auth/super-admin/register-pharmacist', {
    method: 'POST',
    headers: { 'x-admin-secret': ADMIN_SECRET },
    body: { hospital: HOSPITAL, name: 'Store Keeper', username: 'it_pharm', password: 'password123' }
  });

  const staff = await login('staff', {
    username: 'alice_staff',
    password: 'password123',
    hospital: HOSPITAL
  });
  const lab = await login('lab', { username: 'lab_assistant', password: 'password123', hospital: HOSPITAL });
  const pharmacy = await login('pharmacy', {
    username: 'it_pharm',
    password: 'password123',
    hospital: HOSPITAL
  });

  section('Pharmacy stocks the medical store');
  const stockItems = [
    { name: 'Paracetamol', strength: '500 mg', stockQty: 40, reorderLevel: 10 },
    { name: 'Amoxicillin', strength: '250 mg', stockQty: 2, reorderLevel: 5 },
    { name: 'Azithromycin', stockQty: 0, reorderLevel: 5 }
  ];
  for (const item of stockItems) {
    const res = await api('/pharmacy/inventory', { method: 'POST', token: pharmacy, body: item });
    check(`stocked ${item.name}`, res.status < 300, res.json);
  }
  const inventory = await api('/pharmacy/inventory', { token: pharmacy });
  check('inventory lists every medicine', inventory.json.length === 3, inventory.json.length);
  check(
    'problems sort first',
    inventory.json[0].level === 'out',
    inventory.json.map((m) => `${m.name}:${m.level}`)
  );

  section('Reception registers a walk-in (auto-triaged)');
  const walkIn = await api('/staff/tokens/walk-in', {
    method: 'POST',
    token: staff,
    body: {
      name: 'Sunita Devi',
      age: 42,
      gender: 'Female',
      phone: '9998887770',
      symptoms: 'high fever and body pain for 3 days'
    }
  });
  const token = walkIn.json.token;
  check('token created', Boolean(token && token.tokenNumber), walkIn.json);
  check('journey starts at Waiting', token.journeyStage === 'Waiting', token.journeyStage);

  const doctor = await login('doctor', {
    email: DOCTOR_EMAIL[token.doctor.name],
    password: 'password123',
    hospital: HOSPITAL
  });
  console.log(`      (auto-assigned to ${token.doctor.name})`);

  section('Doctor calls the patient in');
  const called = await api('/doctor/queue/call-next', { method: 'POST', token: doctor });
  check('patient called', called.status === 200, called.json);
  check(
    'stage becomes In Consultation',
    called.json.currentToken && called.json.currentToken.journeyStage === 'In Consultation',
    called.json.currentToken && called.json.currentToken.journeyStage
  );

  section('Doctor orders a lab panel');
  const order = await api('/doctor/queue/lab-request', {
    method: 'POST',
    token: doctor,
    body: { testNames: ['CBC', 'Malaria Antigen'], urgency: 'Urgent' }
  });
  check('both tests ordered at once', order.json.added && order.json.added.length === 2, order.json);
  check(
    'stage becomes Lab Pending',
    order.json.token.journeyStage === 'Lab Pending',
    order.json.token.journeyStage
  );

  section('Lab receives the order');
  const worklist = await api('/lab/queues/pending-tests', { token: lab });
  check(
    'order is on the lab worklist',
    worklist.json.some((t) => t.tokenNumber === token.tokenNumber),
    worklist.json.length
  );
  const labStats = await api('/lab/stats', { token: lab });
  check('lab counts 2 pending', labStats.json.pending === 2, labStats.json);
  check('lab flags them urgent', labStats.json.urgentPending === 2, labStats.json);

  section('Lab collects samples and files structured results');
  const collected = await api(`/lab/tests/${token._id}/collect`, {
    method: 'POST',
    token: lab,
    body: { testName: 'CBC' }
  });
  check('sample marked collected', collected.status === 200, collected.json);

  const first = await api(`/lab/tests/${token._id}/complete`, {
    method: 'POST',
    token: lab,
    body: {
      testName: 'CBC',
      resultValue: '11.2',
      unit: 'g/dL',
      normalRange: '12-16',
      abnormal: true,
      remarks: 'Mild anaemia'
    }
  });
  check('first result saved', first.status === 200, first.json);
  check(
    'not complete while one test is outstanding',
    first.json.allComplete === false,
    first.json.allComplete
  );

  const second = await api(`/lab/tests/${token._id}/complete`, {
    method: 'POST',
    token: lab,
    body: { testName: 'Malaria Antigen', resultValue: 'Negative', normalRange: 'Negative', abnormal: false }
  });
  check('second result saved', second.status === 200, second.json);
  check('all tests complete', second.json.allComplete === true, second.json.allComplete);
  check(
    'stage becomes Lab Complete',
    second.json.token.journeyStage === 'Lab Complete',
    second.json.token.journeyStage
  );

  section('Patient returns to the doctor automatically');
  const ready = await api('/doctor/lab-results', { token: doctor });
  const mine = ready.json.find((r) => r.tokenNumber === token.tokenNumber);
  check("patient is on the doctor's results list", Boolean(mine), ready.json);
  check('abnormal result is flagged', mine && mine.hasAbnormal === true, mine);
  check(
    'structured value survives the round trip',
    mine && mine.labTests.some((t) => t.resultValue === '11.2' && t.unit === 'g/dL'),
    mine && mine.labTests
  );

  section('Doctor sees live stock before prescribing');
  const availability = await api(
    '/doctor/medicines?names=' + encodeURIComponent('Paracetamol 500mg|Azithromycin|Vitamin D'),
    { token: doctor }
  );
  const levels = Object.fromEntries(availability.json.map((a) => [a.requested, a.level]));
  check('stocked medicine reads in-stock', levels['Paracetamol 500mg'] === 'in-stock', levels);
  check('empty medicine reads out', levels.Azithromycin === 'out', levels);
  check('uncatalogued medicine reads unknown', levels['Vitamin D'] === 'unknown', levels);

  section('Doctor completes with a prescription');
  const completed = await api('/doctor/queue/complete', {
    method: 'POST',
    token: doctor,
    body: {
      medicines: [
        { name: 'Paracetamol', dosage: '1-0-1', duration: '5 days' },
        { name: 'Azithromycin', dosage: '0-0-1', duration: '3 days' }
      ],
      advice: 'Plenty of fluids'
    }
  });
  check('checkup completed', completed.status === 200, completed.json);
  check('stage becomes Pharmacy Pending', completed.json.nextStage === 'Pharmacy Pending', completed.json);

  section('Pharmacy dispenses and stock moves');
  const prescriptions = await api('/pharmacy/prescriptions', { token: pharmacy });
  const prescription = prescriptions.json.find((t) => t.tokenNumber === token.tokenNumber);
  check(
    'prescription reached the counter',
    Boolean(prescription),
    prescriptions.json.map((t) => t.tokenNumber)
  );
  check(
    'shortage is visible before calling the patient',
    prescription && prescription.hasShortage === true,
    prescription && prescription.stock
  );

  const dispensed = await api(`/pharmacy/prescriptions/${token._id}/dispense`, {
    method: 'POST',
    token: pharmacy
  });
  check('dispensed', dispensed.status === 200, dispensed.json);
  check(
    'stock decremented for the available medicine',
    dispensed.json.deducted.some((d) => d.name === 'Paracetamol' && d.remaining === 39),
    dispensed.json.deducted
  );
  check(
    'shortage reported back',
    dispensed.json.shortages.some((s) => s.requested === 'Azithromycin'),
    dispensed.json.shortages
  );
  check(
    'stage becomes Dispensed',
    dispensed.json.token.journeyStage === 'Dispensed',
    dispensed.json.token.journeyStage
  );

  section('Stock alerting');
  const alerts = await api('/pharmacy/inventory/alerts', { token: pharmacy });
  check(
    'empty medicine listed as out',
    alerts.json.out.some((m) => m.name === 'Azithromycin'),
    alerts.json.out.map((m) => m.name)
  );
  check(
    'below-reorder medicine listed as low',
    alerts.json.low.some((m) => m.name === 'Amoxicillin'),
    alerts.json.low.map((m) => m.name)
  );

  section('Everyone shares one live picture');
  const overview = await api('/ops/overview', { token: staff });
  check("overview counts today's tokens", overview.json.totals.tokensToday >= 1, overview.json.totals);
  check(
    'overview knows the stock problem',
    overview.json.departments.pharmacy.outOfStock === 1,
    overview.json.departments
  );
  check(
    "overview lists this facility's doctors only",
    overview.json.doctorLoad.every((d) => d.name !== 'Dr. Robert Chen'),
    overview.json.doctorLoad.map((d) => d.name)
  );
  check('overview tracks the journey', Boolean(overview.json.byStage.Dispensed), overview.json.byStage);

  const feed = await api('/ops/activity?limit=50', { token: lab });
  const kinds = feed.json.map((a) => a.type);
  for (const kind of [
    'token-created',
    'token-called',
    'lab-requested',
    'lab-completed',
    'rx-prescribed',
    'rx-dispensed',
    'stock-out'
  ]) {
    check(`feed records ${kind}`, kinds.includes(kind), kinds);
  }
  check('a role can read what another role wrote', feed.json.length > 0, feed.json.length);

  const journey = await api(`/ops/journey/${token._id}`, { token: pharmacy });
  check(
    'journey history captured every hop',
    journey.json.history
      .map((h) => h.stage)
      .join(' > ')
      .includes('In Consultation > Lab Pending > Lab Complete'),
    journey.json.history
  );

  section('Patient-facing tracker');
  const publicView = await api(`/chat/token/${token._id}`);
  check('patient sees their stage', publicView.json.journey.stage === 'Dispensed', publicView.json.journey);
  check('instruction is bilingual', publicView.json.journey.message.includes('/'), publicView.json.journey);

  report();
})().catch((err) => {
  console.error('\nINTEGRATION HARNESS ERROR:', err.message);
  console.error('Is the backend running?  cd backend && AUTO_SEED=true node index.js');
  process.exit(2);
});
