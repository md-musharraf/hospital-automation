/**
 * Manual live-update probe.
 *
 * Registers a walk-in and orders an urgent lab panel through the API, so you can
 * watch an already-open Lab console update with no refresh and no interaction.
 * Used to verify the realtime layer end to end; not part of `npm test`.
 *
 *   node tests/manual/push-lab-order.js
 */
const BASE = process.env.API_BASE || 'http://localhost:5000/api/v1';

const api = async (path, { method = 'GET', token, body } = {}) => {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
};

const login = async (role, body) => (await api(`/auth/${role}/login`, { method: 'POST', body })).json.token;

const DOCTOR_EMAIL = {
  'Dr. Sarah Jenkins': 'sarah.jenkins@hospital.com',
  'Dr. Emily Taylor': 'emily.taylor@hospital.com'
};

(async () => {
  const hospital = 'general-hospital';
  const staff = await login('staff', { username: 'alice_staff', password: 'password123', hospital });

  const walkIn = await api('/staff/tokens/walk-in', {
    method: 'POST',
    token: staff,
    body: {
      name: 'Ramesh Yadav',
      age: 55,
      gender: 'Male',
      phone: '9112223334',
      symptoms: 'chest pain and breathlessness'
    }
  });
  const token = walkIn.json.token;
  console.log('registered:', token.tokenNumber, '->', token.doctor.name, '| type:', token.tokenType);

  const doctor = await login('doctor', {
    email: DOCTOR_EMAIL[token.doctor.name],
    password: 'password123',
    hospital
  });

  await api('/doctor/queue/call-next', { method: 'POST', token: doctor });
  const order = await api('/doctor/queue/lab-request', {
    method: 'POST',
    token: doctor,
    body: { testNames: ['Troponin I', 'ECG'], urgency: 'Urgent' }
  });
  console.log('ordered:', order.json.added, '| stage:', order.json.token.journeyStage);
  console.log('\nAn open Lab console should now show these WITHOUT a refresh.');
})().catch((err) => {
  console.error('Probe failed:', err.message);
  process.exit(1);
});
