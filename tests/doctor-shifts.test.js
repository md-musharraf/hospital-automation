/**
 * Two sittings a day, and what a delay owes the people waiting.
 *
 * The behaviour under test is the one the old code could not express: a doctor
 * who takes OPD 10–1 and again 5–8 is not available at 2pm, however empty their
 * queue looks. Reading an empty queue as "no wait" is what told a patient
 * "Approx. wait: 0 min" for a cabin nobody would enter for three hours — and
 * what sent walk-ins to the one doctor guaranteed not to be sitting.
 *
 * The delay half is checked for who it reaches as much as what it says: a
 * message to a patient who has already been seen is worse than no message.
 */
const { installMockDb } = require('./helpers/mockDb');
const { section, check, report } = require('./helpers/assert');

const { BACKEND_DIST: BACKEND } = require('./helpers/backendPath');
const { models, outbound } = installMockDb(BACKEND);

const {
  normalizeShifts,
  sittingStatus,
  shiftsToOpdHours,
  formatHhMm,
  parseHhMm
} = require('../backend/dist/utils/shiftHelper');
const { estimateWaitMinutes, broadcastDelay } = require('../backend/dist/utils/queueHelper');

/** A fixed Wednesday, so a weekday-scoped shift is not at the mercy of the calendar. */
const on = (hours, minutes = 0) => new Date(2026, 7, 12, hours, minutes, 0, 0); // Wed 12 Aug 2026

const TWO_SITTINGS = [
  { label: 'Morning', start: '10:00', end: '13:00', days: [] },
  { label: 'Evening', start: '17:00', end: '20:00', days: [] }
];

(async () => {
  section('Reading a schedule in');

  const cleaned = normalizeShifts([
    { label: 'Morning', start: '10:00', end: '13:00', days: ['mon', 'WED', 'banana'] },
    { label: 'Evening', start: '17:00', end: '20:00' },
    { label: 'Broken', start: '10.00', end: '13:00' }, // a dot, not a colon
    { label: 'Half', start: '09:00' } // no end
  ]);

  check('Valid sittings are kept', cleaned.length === 2, cleaned);
  check(
    'Days are normalised to the week vocabulary',
    cleaned[0].days.join(',') === 'Mon,Wed',
    cleaned[0].days
  );
  check('A non-day is dropped rather than stored', !cleaned[0].days.includes('banana'), cleaned[0].days);
  check('A malformed time is refused, not guessed', !cleaned.some((s) => s.label === 'Broken'), cleaned);
  check('A sitting with no end is refused', !cleaned.some((s) => s.label === 'Half'), cleaned);
  check('A fourth sitting cannot be stored', normalizeShifts(new Array(6).fill(TWO_SITTINGS[0])).length <= 3);

  check(
    '24-hour times print as a patient reads them',
    formatHhMm('17:00') === '5:00 PM',
    formatHhMm('17:00')
  );
  check('Midnight prints as 12, not 0', formatHhMm('00:30') === '12:30 AM', formatHhMm('00:30'));
  check('A bad time has no printed form', formatHhMm('25:00') === '', formatHhMm('25:00'));
  check('Minutes past midnight are parsed', parseHhMm('13:05') === 785, parseHhMm('13:05'));
  check(
    'The public label is built from the sittings',
    shiftsToOpdHours(TWO_SITTINGS) === '10:00 AM – 1:00 PM · 5:00 PM – 8:00 PM',
    shiftsToOpdHours(TWO_SITTINGS)
  );

  section('Where the doctor is in their day');

  const twoShift = { shifts: TWO_SITTINGS, opdDays: [], averageCheckupTime: 10 };

  const morning = sittingStatus(twoShift, on(11));
  check('Inside the morning OPD, the doctor is sitting', morning.sitting === true, morning);
  check('A sitting doctor has no lead time', morning.minutesUntilStart === 0, morning);

  const gap = sittingStatus(twoShift, on(14));
  check('In the afternoon gap, the doctor is NOT sitting', gap.sitting === false, gap);
  check('The gap counts down to the evening sitting', gap.minutesUntilStart === 180, gap);

  const beforeDoors = sittingStatus(twoShift, on(8));
  check('Before the doors open, the wait starts at 10', beforeDoors.minutesUntilStart === 120, beforeDoors);

  const afterHours = sittingStatus(twoShift, on(21));
  check(
    'After the last sitting, the next is tomorrow morning',
    afterHours.sitting === false && afterHours.minutesUntilStart === 13 * 60,
    afterHours
  );

  const unscheduled = sittingStatus({ shifts: [], opdDays: [] }, on(14));
  check(
    'A doctor with no shifts is treated as always sitting',
    unscheduled.sitting === true && unscheduled.unscheduled === true,
    unscheduled
  );

  // A consultant who only sits Tue/Thu, asked about on a Wednesday.
  const visiting = {
    shifts: [{ label: 'Visiting', start: '10:00', end: '13:00', days: ['Tue', 'Thu'] }],
    opdDays: []
  };
  const nextVisit = sittingStatus(visiting, on(11));
  check('A day-scoped sitting does not run on the wrong day', nextVisit.sitting === false, nextVisit);
  check('It points at the next day it DOES run', nextVisit.minutesUntilStart === 23 * 60, nextVisit);

  section('What the patient is quoted');

  check(
    'An empty queue during a sitting really is no wait',
    estimateWaitMinutes(twoShift, 0, 0, on(11)) === 0
  );
  check(
    'An empty queue in the afternoon gap is NOT quoted as 0 min',
    estimateWaitMinutes(twoShift, 0, 0, on(14)) === 180,
    estimateWaitMinutes(twoShift, 0, 0, on(14))
  );
  check(
    'Queue position is added on top of the lead time',
    estimateWaitMinutes(twoShift, 3, 0, on(14)) === 210,
    estimateWaitMinutes(twoShift, 3, 0, on(14))
  );
  check(
    'A running-late buffer is added too',
    estimateWaitMinutes(twoShift, 2, 25, on(11)) === 45,
    estimateWaitMinutes(twoShift, 2, 25, on(11))
  );
  check(
    'An unscheduled doctor is estimated exactly as before',
    estimateWaitMinutes({ averageCheckupTime: 10, shifts: [] }, 4, 5, on(14)) === 45
  );

  section('Announcing a delay to the people waiting');

  const doctor = await new models.Doctor({
    name: 'Dr Tushar Jyothi',
    hospital: 'ashoka-life-care-hospital',
    currentRoom: 'Cabin 1',
    averageCheckupTime: 10,
    shifts: TWO_SITTINGS
  }).save();

  const mkPatient = (name, phone) => new models.Patient({ name, phone }).save();
  const waiting1 = await mkPatient('Ramesh', '+919000000001');
  const waiting2 = await mkPatient('Sunita', '+919000000002');
  const alreadySeen = await mkPatient('Imran', '+919000000003');
  const noPhone = await mkPatient('Anon', '');

  const mkToken = (tokenNumber, patient, status, estimatedWaitTime) =>
    new models.Token({
      tokenNumber,
      patient: patient._id,
      doctor: doctor._id,
      hospital: 'ashoka-life-care-hospital',
      status,
      estimatedWaitTime
    }).save();

  const t1 = await mkToken('T-1', waiting1, 'Waiting', 30);
  const t2 = await mkToken('T-2', waiting2, 'Waiting', 40);
  const t3 = await mkToken('T-3', alreadySeen, 'Completed', 0);
  const t4 = await mkToken('T-4', noPhone, 'Waiting', 50);

  await new models.Queue({
    doctor: doctor._id,
    activeQueue: [t1._id, t2._id, t3._id, t4._id]
  }).save();

  outbound.length = 0;
  const sent = await broadcastDelay(String(doctor._id), { minutes: 30, reason: 'emergency case' });

  check('Only the waiting, reachable patients are messaged', sent === 2, `sent ${sent}`);
  check('One message per patient', outbound.length === 2, outbound.length);
  check(
    'A patient who has already been seen is not messaged',
    !outbound.some((m) => m.phone === '+919000000003'),
    outbound.map((m) => m.phone)
  );
  check(
    'A patient with no phone number is skipped, not crashed on',
    !outbound.some((m) => !m.phone),
    outbound.map((m) => m.phone)
  );
  check(
    'The message names the doctor',
    outbound.every((m) => m.message.includes('Dr Tushar Jyothi')),
    outbound[0] && outbound[0].message
  );
  check(
    'The message carries the delay and the reason',
    outbound.every((m) => m.message.includes('30 min') && m.message.includes('emergency case')),
    outbound[0] && outbound[0].message
  );
  check(
    'Each patient is told their OWN revised time, not a shared one',
    outbound[0].message !== outbound[1].message,
    'both patients got an identical message'
  );
  check(
    'The message is bilingual, like the arrival alerts',
    outbound.every((m) => /[ऀ-ॿ]/.test(m.message)),
    outbound[0] && outbound[0].message
  );

  // What they were told is recorded, so the tracker does not immediately repeat it.
  const after1 = models.Token._rows.find((t) => t.tokenNumber === 'T-1');
  check('What the patient was told is recorded', after1.lastNotifiedWait === 30, after1.lastNotifiedWait);

  report();
})();
