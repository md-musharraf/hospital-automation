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

/** One credential opens every room; start the backend with the same value. */
const signIn = async (hospital) =>
  (
    await api('/auth/facility/login', {
      method: 'POST',
      body: { hospital, password: process.env.SEED_FACILITY_PASSWORD }
    })
  ).json;

/** Narrow the facility token to one doctor's cabin. */
const takeCabin = async (token, doctorId) =>
  (await api('/auth/facility/cabin', { method: 'POST', token, body: { doctorId } })).json.token;

(async () => {
  const hospital = 'general-hospital';
  if (!process.env.SEED_FACILITY_PASSWORD) {
    throw new Error(
      'Set SEED_FACILITY_PASSWORD to the same value the backend was started with — there is no default.'
    );
  }
  const facility = await signIn(hospital);
  if (!facility.token) throw new Error(`sign-in failed: ${facility.message || 'no token'}`);

  const walkIn = await api('/staff/tokens/walk-in', {
    method: 'POST',
    token: facility.token,
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

  const assigned = facility.doctors.find((d) => d.name === token.doctor.name);
  if (!assigned) throw new Error(`${token.doctor.name} is not on this facility's roster`);
  const doctor = await takeCabin(facility.token, assigned.id);

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
