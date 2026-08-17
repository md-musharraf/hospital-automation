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
  parseHhMm,
  localDateKey,
  effectiveShifts,
  todayOpdHours,
  delayNotice,
  pruneOverrides
} = require('../backend/dist/utils/shiftHelper');
const {
  estimateWaitMinutes,
  broadcastDelay,
  trackWaitingPatients,
  cabinRemainingFrom,
  paceFromTokens,
  recalculateQueueTimes
} = require('../backend/dist/utils/queueHelper');

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

  section("Pushing today's start time");

  /** A doctor whose morning OPD has been moved to 11:30 for `date` only. */
  const withOverride = (date, start, opts = {}) => ({
    name: 'Dr. Rao',
    shifts: TWO_SITTINGS,
    opdDays: [],
    averageCheckupTime: 10,
    shiftOverrides: [
      {
        date: localDateKey(date),
        shiftIndex: opts.shiftIndex ?? 0,
        start,
        end: opts.end || '',
        reason: opts.reason || ''
      }
    ]
  });

  check(
    'A local date key does not roll over with the timezone',
    localDateKey(on(23, 30)) === '2026-08-12',
    localDateKey(on(23, 30))
  );

  const late = withOverride(on(11), '11:30', { reason: 'stuck in traffic' });

  check(
    "Today's shifts carry the revised start",
    effectiveShifts(late, on(11))[0].start === '11:30',
    effectiveShifts(late, on(11))[0]
  );
  check(
    'The other sitting is untouched',
    effectiveShifts(late, on(11))[1].start === '17:00',
    effectiveShifts(late, on(11))[1]
  );
  check(
    'Tomorrow uses the standing schedule again',
    effectiveShifts(late, new Date(2026, 7, 13, 11))[0].start === '10:00',
    effectiveShifts(late, new Date(2026, 7, 13, 11))[0]
  );
  check('The stored schedule itself is not rewritten', late.shifts[0].start === '10:00', late.shifts[0]);

  // The bug this whole feature exists to fix: at 11:15 the old code said the
  // doctor was sitting, because 11:15 is inside 10:00–13:00.
  const atElevenFifteen = sittingStatus(late, on(11, 15));
  check(
    'At 11:15 a doctor who moved to 11:30 is NOT sitting',
    atElevenFifteen.sitting === false,
    atElevenFifteen
  );
  check(
    '…and the wait counts from the revised start',
    atElevenFifteen.minutesUntilStart === 15,
    atElevenFifteen
  );
  check('At 11:45 they are sitting again', sittingStatus(late, on(11, 45)).sitting === true);
  check(
    'A patient booking at 09:00 is quoted the revised start',
    estimateWaitMinutes(late, 0, 0, on(9)) === 150,
    estimateWaitMinutes(late, 0, 0, on(9))
  );

  const printed = todayOpdHours(late, on(11));
  check(
    'The printed hours show the revised time today',
    printed === '11:30 AM – 1:00 PM · 5:00 PM – 8:00 PM',
    printed
  );
  check(
    'Tomorrow prints the standing hours',
    todayOpdHours(late, new Date(2026, 7, 13, 9)) === '10:00 AM – 1:00 PM · 5:00 PM – 8:00 PM',
    todayOpdHours(late, new Date(2026, 7, 13, 9))
  );

  const notice = delayNotice(late, on(11));
  check('The delay is reported as 90 minutes', notice.minutesLate === 90, notice);
  check(
    '…naming both clock times the way a patient reads them',
    notice.revisedStart === '11:30 AM' && notice.originalStart === '10:00 AM',
    notice
  );
  check('…and carrying the reason through', notice.reason === 'stuck in traffic', notice);
  check('A doctor with no override has no delay notice', delayNotice(twoShift, on(11)).delayed === false);

  // An evening-only delay must not move the morning.
  const eveningLate = withOverride(on(18), '18:30', { shiftIndex: 1 });
  check(
    'Moving the evening leaves the morning alone',
    effectiveShifts(eveningLate, on(18))[0].start === '10:00' &&
      effectiveShifts(eveningLate, on(18))[1].start === '18:30',
    effectiveShifts(eveningLate, on(18))
  );

  // The last word wins: a doctor who slips twice means the later time.
  const slippedTwice = withOverride(on(11), '11:30');
  slippedTwice.shiftOverrides.push({
    date: localDateKey(on(11)),
    shiftIndex: 0,
    start: '12:00',
    end: '',
    reason: ''
  });
  check(
    'A second slip replaces the first',
    effectiveShifts(slippedTwice, on(11))[0].start === '12:00',
    effectiveShifts(slippedTwice, on(11))[0]
  );

  const stale = withOverride(new Date(2026, 7, 11, 11), '11:30'); // yesterday
  check(
    "Yesterday's delay does not apply today",
    effectiveShifts(stale, on(11))[0].start === '10:00',
    effectiveShifts(stale, on(11))[0]
  );
  check('…and the nightly prune removes it', pruneOverrides(stale, on(11)) === true, stale.shiftOverrides);
  check('…leaving nothing behind', stale.shiftOverrides.length === 0, stale.shiftOverrides);
  check(
    'Pruning a clean record changes nothing',
    pruneOverrides(late, on(11)) === false,
    late.shiftOverrides
  );

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

  section('The tracker keeps estimates honest without becoming spam');

  const row = (n) => models.Token._rows.find((t) => t.tokenNumber === n);

  // T-1 was told 30 and the queue has since slipped to 95; T-2 was told 40 and
  // has crept to 46, which is inside the noise threshold.
  row('T-1').estimatedWaitTime = 95;
  row('T-2').estimatedWaitTime = 46;

  outbound.length = 0;
  const drifted = await trackWaitingPatients();

  check('Only the patient whose wait really moved is messaged', drifted === 1, `notified ${drifted}`);
  check(
    'A few minutes of slippage is not worth a message',
    !outbound.some((m) => m.phone === '+919000000002'),
    outbound.map((m) => m.phone)
  );
  check(
    'The message carries the revised wait',
    outbound[0] && outbound[0].message.includes('95'),
    outbound[0] && outbound[0].message
  );
  check('The new figure is recorded against the token', row('T-1').lastNotifiedWait === 95, row('T-1'));

  // The decisive property: sweeping again changes nothing, because the patient
  // is now holding the current number. Without the bookkeeping this is where a
  // ten-minute job turns into a message every ten minutes, forever.
  outbound.length = 0;
  const repeat = await trackWaitingPatients();
  check('A second sweep does not repeat itself', repeat === 0, `notified ${repeat}`);
  check(
    '…and sends nothing at all',
    outbound.length === 0,
    outbound.map((m) => m.phone)
  );

  // A patient nobody has quoted yet adopts the current figure silently — their
  // booking confirmation already carried it.
  const fresh = await mkToken('T-9', waiting1, 'Waiting', 60);
  const q = models.Queue._rows.find((x) => String(x.doctor) === String(doctor._id));
  q.activeQueue.push(fresh._id);

  outbound.length = 0;
  await trackWaitingPatients();
  check('A never-notified patient is seeded, not messaged', outbound.length === 0, outbound.length);
  check('…and is seeded from the current estimate', row('T-9').lastNotifiedWait === 60, row('T-9'));

  section('The person already in the room counts');

  // `position` is how many people are ahead of you IN THE LINE. The patient
  // being seen right now is not in the line, so quoting position 0 as "0 min"
  // told the patient at the front they were due immediately while somebody
  // else's consultation was still running.
  const sitting = { averageCheckupTime: 10, shifts: TWO_SITTINGS };

  check(
    'A consultation just started leaves the front of the queue its remainder',
    cabinRemainingFrom({ status: 'Active', calledAt: on(11, 0) }, 10, on(11, 2)) === 8,
    cabinRemainingFrom({ status: 'Active', calledAt: on(11, 0) }, 10, on(11, 2))
  );
  check(
    'A consultation running over still never reads as zero',
    cabinRemainingFrom({ status: 'Active', calledAt: on(11, 0) }, 10, on(11, 40)) === 2,
    cabinRemainingFrom({ status: 'Active', calledAt: on(11, 0) }, 10, on(11, 40))
  );
  check('An empty cabin adds nothing', cabinRemainingFrom(null, 10, on(11)) === 0);
  check(
    'A token that has been completed is not still in the room',
    cabinRemainingFrom({ status: 'Completed', calledAt: on(11, 0) }, 10, on(11, 2)) === 0
  );

  check(
    'The front of the queue is quoted the rest of the current consultation',
    estimateWaitMinutes(sitting, 0, 0, { now: on(11), inCabinRemaining: 6 }) === 6,
    estimateWaitMinutes(sitting, 0, 0, { now: on(11), inCabinRemaining: 6 })
  );
  check(
    'Third in line waits for the room plus the two ahead',
    estimateWaitMinutes(sitting, 2, 0, { now: on(11), inCabinRemaining: 6 }) === 26,
    estimateWaitMinutes(sitting, 2, 0, { now: on(11), inCabinRemaining: 6 })
  );
  check(
    'Waiting for the doors to open subsumes waiting for the current patient',
    estimateWaitMinutes(sitting, 0, 0, { now: on(14), inCabinRemaining: 6 }) === 180,
    estimateWaitMinutes(sitting, 0, 0, { now: on(14), inCabinRemaining: 6 })
  );
  check(
    'A measured pace replaces the configured average',
    estimateWaitMinutes(sitting, 3, 0, { now: on(11), paceMinutes: 18 }) === 54,
    estimateWaitMinutes(sitting, 3, 0, { now: on(11), paceMinutes: 18 })
  );

  section('The pace the cabin is really keeping');

  const paced = { _id: 'doc-paced', averageCheckupTime: 10 };
  const consult = (from, to) => ({
    doctor: 'doc-paced',
    status: 'Completed',
    calledAt: new Date(Date.now() - from * 60000),
    completedAt: new Date(Date.now() - to * 60000)
  });

  check(
    'One slow patient does not rewrite the board',
    paceFromTokens([consult(60, 30)], paced._id, 10) === 10,
    paceFromTokens([consult(60, 30)], paced._id, 10)
  );

  // Three consultations of 20 minutes each against a configured 10: the
  // measured figure is weighted in rather than swapped in wholesale.
  const slowDay = [consult(180, 160), consult(150, 130), consult(120, 100)];
  const blended = paceFromTokens(slowDay, paced._id, 10);
  check(
    'A cabin running at twice its configured pace is quoted slower',
    blended > 10 && blended < 20,
    blended
  );
  check(
    'A consultation nobody pressed complete on is not a measurement',
    paceFromTokens([consult(600, 60), consult(600, 61), consult(600, 62)], paced._id, 10) === 10,
    paceFromTokens([consult(600, 60), consult(600, 61), consult(600, 62)], paced._id, 10)
  );
  check(
    "Another doctor's day says nothing about this one",
    paceFromTokens(slowDay, 'someone-else', 10) === 10
  );

  section('A queue recalculation counts only the people still in it');

  const paceDoc = await new models.Doctor({
    name: 'Dr Neelam Rao',
    hospital: 'ashoka-life-care-hospital',
    currentRoom: 'Cabin 4',
    averageCheckupTime: 10
    // No shifts: always sitting, so the arithmetic under test is not mixed up
    // with lead time.
  }).save();

  const inCabin = await new models.Token({
    tokenNumber: 'R-0',
    patient: waiting1._id,
    doctor: paceDoc._id,
    hospital: 'ashoka-life-care-hospital',
    status: 'Active',
    calledAt: new Date(Date.now() - 4 * 60000)
  }).save();

  const mkWaiting = (n, status) =>
    new models.Token({
      tokenNumber: n,
      patient: waiting2._id,
      doctor: paceDoc._id,
      hospital: 'ashoka-life-care-hospital',
      status
    }).save();

  const r1 = await mkWaiting('R-1', 'Waiting');
  const rGone = await mkWaiting('R-2', 'Absent');
  const r3 = await mkWaiting('R-3', 'Waiting');

  await new models.Queue({
    doctor: paceDoc._id,
    currentToken: inCabin._id,
    activeQueue: [r1._id, rGone._id, r3._id]
  }).save();

  await recalculateQueueTimes(String(paceDoc._id));

  // 10-minute average, 4 minutes already spent in the room => 6 left.
  check('The front of the queue waits out the cabin', row('R-1').estimatedWaitTime === 6, row('R-1'));
  check(
    'A patient marked absent does not push the queue back a whole consultation',
    row('R-3').estimatedWaitTime === 16,
    row('R-3')
  );
  check('…and is not quoted a wait of its own', !row('R-2').estimatedWaitTime, row('R-2'));

  report();
})();
