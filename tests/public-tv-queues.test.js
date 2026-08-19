/**
 * What the waiting-room TV is allowed to say out loud.
 *
 * `GET /api/v1/chat/public-tv-queues` has no login — the screen on the wall
 * cannot hold one — and the room it hangs in is open to the street. So the
 * response is an allow-list, and this is the test that keeps it one.
 *
 * The leak this guards against was real and silent. The route populated tokens
 * and patients in full and answered with `{ ...queue.toObject() }`, so an
 * unauthenticated GET returned, for every patient sitting in every queue on the
 * platform: their phone number, age and gender, and their token's `symptoms`,
 * `chatHistory`, `labTests`, `prescription` and `patientAlerts`. Diagnoses and
 * prescriptions, to anyone who asked.
 *
 * The check below is deliberately written as "nothing outside this set escapes"
 * rather than "these fields are present". A test that only asserts the presence
 * of the good fields passes just as happily when someone re-adds a spread.
 */
const { publicQueueView } = require('../backend/dist/utils/queueHelper');
const { section, check, report } = require('./helpers/assert');

/** A patient record as it arrives once Mongoose has populated it. */
const patient = (name) => ({
  _id: `pt-${name}`,
  name,
  age: 34,
  gender: 'Female',
  phone: '+919876543210',
  hospital: 'city-hospital',
  travelMinutes: 25,
  visitCount: 7
});

/** A token carrying everything the clinical flow hangs off it. */
const token = (number, patientName) => ({
  _id: `tk-${number}`,
  tokenNumber: number,
  hospital: 'city-hospital',
  status: 'Waiting',
  patient: patient(patientName),
  symptoms: 'chest pain, shortness of breath',
  chatHistory: [{ sender: 'patient', text: 'I have been having chest pain since morning' }],
  labTests: [
    { testName: 'Troponin I', result: 'elevated', reportUrl: 'https://ik.imagekit.io/x/report.pdf' }
  ],
  prescription: { medicines: [{ name: 'Aspirin 75mg', dosage: '1-0-0' }], notes: 'refer to cardiology' },
  patientAlerts: [{ channel: 'whatsapp', text: 'Your bill of Rs 4,200 is ready', to: '+919876543210' }],
  journeyStage: 'With Doctor',
  estimatedWaitTime: 40
});

const queue = {
  _id: 'q-1',
  doctor: {
    _id: 'dr-1',
    name: 'Dr Sarah Jenkins',
    department: 'Cardiology',
    currentRoom: 'Cabin 3',
    email: 'sarah@city-hospital.test',
    passwordHash: '$2a$10$notarealhash',
    hospital: 'city-hospital',
    opdDays: ['Mon', 'Tue'],
    opdHours: '09:00-13:00'
  },
  currentToken: token('T-101', 'Anita Rao'),
  activeQueue: [token('T-102', 'Vikram Shah'), token('T-103', 'Priya Nair')],
  bufferDelay: 10
};

/** Every string that appears anywhere in the payload, however deeply nested. */
function allStrings(value, out = []) {
  if (value === null || value === undefined) return out;
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => allStrings(v, out));
  else if (typeof value === 'object') Object.values(value).forEach((v) => allStrings(v, out));
  return out;
}

/** Every key name that appears anywhere in the payload. */
function allKeys(value, out = []) {
  if (!value || typeof value !== 'object') return out;
  if (Array.isArray(value)) {
    value.forEach((v) => allKeys(v, out));
    return out;
  }
  Object.keys(value).forEach((k) => {
    out.push(k);
    allKeys(value[k], out);
  });
  return out;
}

(async () => {
  const view = publicQueueView(queue);
  const strings = allStrings(view);
  const keys = allKeys(view);
  const blob = JSON.stringify(view);

  section('Public TV queue — the screen still works');

  check('The cabin and department are shown', view.doctor.department === 'Cardiology');
  check('The doctor is named', view.doctor.name === 'Dr Sarah Jenkins');
  check('The room is named', view.doctor.currentRoom === 'Cabin 3');
  check('The token being seen now is shown', view.currentToken.tokenNumber === 'T-101');
  check('...with the first name the display announces aloud', view.currentToken.patient.name === 'Anita Rao');
  check('The number waiting is shown', view.waitingCount === 2);
  check('Who is next is shown', view.activeQueue[0].tokenNumber === 'T-102');
  check('The delay banner is still computed', view.delay !== undefined);

  section('Public TV queue — no patient identity leaves the building');

  check('No phone number', !blob.includes('9876543210'), blob);
  check('No age', !keys.includes('age'));
  check('No gender', !keys.includes('gender'));
  check('No visit history', !keys.includes('visitCount'));
  check('No travel time', !keys.includes('travelMinutes'));
  check(
    'A waiting patient is a token number and nothing else',
    view.activeQueue.every((t) => Object.keys(t).sort().join(',') === '_id,tokenNumber'),
    JSON.stringify(view.activeQueue[0])
  );

  section('Public TV queue — nothing clinical leaves the building');

  check('No symptoms', !keys.includes('symptoms') && !strings.some((s) => s.includes('chest pain')));
  check('No chat history', !keys.includes('chatHistory'));
  check('No lab tests or results', !keys.includes('labTests') && !blob.includes('Troponin'));
  check('No prescription', !keys.includes('prescription') && !blob.includes('Aspirin'));
  check('No report links', !blob.includes('imagekit'));
  check('No alert log (it carries bill amounts)', !keys.includes('patientAlerts') && !blob.includes('4,200'));
  check('No journey stage', !keys.includes('journeyStage'));

  section('Public TV queue — no staff credentials leave the building');

  check('No password hash', !keys.includes('passwordHash') && !blob.includes('$2a$10$'));
  check('No staff email', !blob.includes('sarah@city-hospital.test'));

  section('Public TV queue — the allow-list is closed, not merely tidy');

  // The point of this one: a future `...queue.toObject()` fails here even if it
  // happens to reintroduce a field this test has never heard of.
  const ALLOWED = [
    '_id',
    'doctor',
    'name',
    'department',
    'currentRoom',
    'currentToken',
    'tokenNumber',
    'patient',
    'waitingCount',
    'activeQueue',
    'delay',
    'opdHoursToday',
    // delayNotice()'s own shape — the banner the room reads.
    'delayed',
    'minutesLate',
    'originalStart',
    'revisedStart',
    'reason',
    'message'
  ];
  const unexpected = [...new Set(keys)].filter((k) => !ALLOWED.includes(k));
  check('No field outside the allow-list appears', unexpected.length === 0, unexpected.join(', '));

  section('Public TV queue — the empty cabin');

  const idle = publicQueueView({ _id: 'q-2', doctor: null, currentToken: null, activeQueue: [] });
  check('An idle cabin renders without a doctor', idle.currentToken === null && idle.waitingCount === 0);
  check('A missing queue is not an exception', publicQueueView(null) === null);

  report();
})();
