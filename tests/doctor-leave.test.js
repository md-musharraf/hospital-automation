/**
 * A doctor being away for a stretch of days.
 *
 * Three things already looked like they could express this and none of them
 * could, which is why the bugs worth pinning down here are mostly about the
 * feature being SILENTLY absent rather than wrong:
 *
 *   - `availabilityStatus: 'Unavailable'` carries no date, so nothing ever turns
 *     it back on.
 *   - `opdDays` is the permanent roster; editing it for one week rewrites the
 *     doctor's printed hours on the public page.
 *   - `shiftOverrides` can move today's start time but cannot cancel a sitting,
 *     and is scoped to a single date by design.
 *
 * The properties that matter:
 *
 *   - Leave must beat the roster EVERYWHERE. It is hooked into `shiftRunsOn`,
 *     which `sittingStatus` and `firstSittingOn` both funnel through, so a miss
 *     here shows up as one screen quietly still offering an absent doctor.
 *   - A doctor with NO shifts configured must still be able to take leave. Those
 *     are the small clinics — the majority — and the "no shifts means sits
 *     whenever" shortcut is exactly what would swallow their leave.
 *   - Bookings must not roll INTO a leave. Tokens are placed up to a week ahead,
 *     and the roll path does not go through `sittingStatus`.
 *   - Auto-triage must never assign an absent doctor, while a patient who PICKS
 *     one knowingly still can — those are different decisions.
 *   - Patients already holding a token must be told. That is the person this
 *     whole feature exists for.
 */
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';

const path = require('path');
const { installMockDb } = require('./helpers/mockDb');
const { section, check, report } = require('./helpers/assert');

const { BACKEND_DIST: BACKEND } = require('./helpers/backendPath');
const { models, outbound } = installMockDb(BACKEND);

const {
  normalizeLeave,
  leaveOn,
  isOnLeave,
  backOnKey,
  upcomingLeaves,
  pruneLeaves,
  shiftRunsOn,
  sittingStatus,
  firstSittingOn,
  localDateKey,
  formatDateKey,
  addDaysToKey,
  daysBetweenKeys,
  MAX_LEAVE_DAYS
} = require(path.join(BACKEND, 'utils', 'shiftHelper.js'));

const { resolveBookingSlot } = require(path.join(BACKEND, 'utils', 'bookingSlot.js'));
const { pickLeastBusyDoctor } = require(path.join(BACKEND, 'utils', 'triageHelper.js'));
const { affectedTokens, fileLeave, cancelLeave } = require(path.join(BACKEND, 'utils', 'leaveHelper.js'));

/** A fixed instant, so nothing here depends on the day the suite is run. */
const at = (y, m, d, h = 10) => new Date(y, m - 1, d, h, 0, 0, 0);

// Monday 24 August 2026 — a weekday, so an opdDays roster does not confuse the
// question of whether it was the LEAVE that took the doctor off.
const MON24 = at(2026, 8, 24);
const KEY = (date) => localDateKey(date);

/** A doctor sitting 10:00–13:00 every day, unless told otherwise. */
const doctorWith = (extra = {}) => ({
  _id: extra._id || 'doc-leave-1',
  name: 'Dr. Sharma',
  department: 'General Medicine',
  hospital: 'sunrise',
  averageCheckupTime: 10,
  availabilityStatus: 'Available',
  shifts: [{ label: 'Morning', start: '10:00', end: '13:00', days: [] }],
  leaves: [],
  ...extra
});

const oneShift = () => ({ label: 'Morning', start: '10:00', end: '13:00', days: [] });

(async () => {
  // ─────────────────────────────────────────────────────────────────────────
  section('Filing a leave: what is accepted and what is refused');

  const good = normalizeLeave({ from: '2026-08-24', to: '2026-08-28', reason: 'Family function' });
  check(
    'A five-day range is stored as one row',
    good.from === '2026-08-24' && good.to === '2026-08-28',
    good
  );
  check('…and the reason travels with it', good.reason === 'Family function', good);
  check('Five days is five days, both ends counted', daysBetweenKeys(good.from, good.to) === 5);

  const single = normalizeLeave({ from: '2026-08-24' });
  check('A missing end date means one day, not forever', single.to === '2026-08-24', single);

  const reversed = normalizeLeave({ from: '2026-08-28', to: '2026-08-24' });
  check(
    'A reversed range is straightened, never silently ignored',
    reversed.from === '2026-08-28' && reversed.to === '2026-08-28',
    reversed
  );

  const refuse = (input, label) => {
    let threw = false;
    try {
      normalizeLeave(input);
    } catch (_) {
      threw = true;
    }
    check(label, threw, input);
  };
  refuse({ from: '24-08-2026' }, 'A day-first date is refused rather than guessed at');
  refuse({ from: '' }, 'A blank start date is refused');
  refuse({ from: 'next week' }, 'Prose is refused');
  refuse(
    { from: '2026-08-24', to: '2027-08-24' },
    'A year-long leave is refused — that is a typo in the year'
  );
  check(`…and the cap is ${MAX_LEAVE_DAYS} days`, MAX_LEAVE_DAYS === 180);

  // ─────────────────────────────────────────────────────────────────────────
  section('Which days a leave covers');

  const away = doctorWith({ leaves: [{ from: '2026-08-24', to: '2026-08-28' }] });

  check('The first day is inside', isOnLeave(away, at(2026, 8, 24)) === true);
  check('A middle day is inside', isOnLeave(away, at(2026, 8, 26)) === true);
  check('The last day is inside — a leave "to the 28th" includes the 28th', isOnLeave(away, at(2026, 8, 28)));
  check('The day before is not', isOnLeave(away, at(2026, 8, 23)) === false);
  check('The day after is not', isOnLeave(away, at(2026, 8, 29)) === false);
  check('A late evening on the last day is still inside', isOnLeave(away, at(2026, 8, 28, 23)) === true);

  check(
    'The covering leave is reported, not just a boolean',
    leaveOn(away, at(2026, 8, 26)).to === '2026-08-28'
  );
  check(
    'They are back the day after',
    backOnKey(away, at(2026, 8, 26)) === '2026-08-29',
    backOnKey(away, at(2026, 8, 26))
  );

  const chained = doctorWith({
    leaves: [
      { from: '2026-08-24', to: '2026-08-26' },
      { from: '2026-08-27', to: '2026-08-28' }
    ]
  });
  check(
    'Back-to-back leaves read as one absence',
    backOnKey(chained, at(2026, 8, 25)) === '2026-08-29',
    backOnKey(chained, at(2026, 8, 25))
  );

  const malformed = doctorWith({
    leaves: [
      { from: '', to: '' },
      { from: 'rubbish', to: 'x' }
    ]
  });
  check('A malformed row never accidentally covers a date', isOnLeave(malformed, MON24) === false);

  // ─────────────────────────────────────────────────────────────────────────
  section('Leave beats the roster, at the one place every screen reads');

  check('A shift does not run on a leave day', shiftRunsOn(oneShift(), away, at(2026, 8, 26)) === false);
  check('…and does run the day they are back', shiftRunsOn(oneShift(), away, at(2026, 8, 29)) === true);

  check('No sitting can be found on a leave day', firstSittingOn(away, at(2026, 8, 26)) === null);
  check('…and one can the day after', firstSittingOn(away, at(2026, 8, 29)) !== null);

  const midLeave = sittingStatus(away, at(2026, 8, 26, 11));
  check('At 11am on a leave day the doctor is NOT sitting', midLeave.sitting === false, midLeave);
  check('…the leave itself is reported', Boolean(midLeave.onLeave), midLeave);
  check('…with the date they are back', midLeave.backOn === '2026-08-29', midLeave);
  check(
    '…and the next sitting is after the leave, not during it',
    midLeave.nextStart && localDateKey(midLeave.nextStart) === '2026-08-29',
    midLeave.nextStart
  );

  const present = doctorWith();
  check('A doctor with no leave is unaffected', sittingStatus(present, at(2026, 8, 26, 11)).sitting === true);
  check('…and reports no leave', sittingStatus(present, at(2026, 8, 26, 11)).onLeave === null);

  // ─────────────────────────────────────────────────────────────────────────
  section('A doctor with no shifts configured can still take leave');

  // The majority case: a small clinic that never filled in sitting hours. The
  // "no shifts means sits whenever" shortcut returns before any shift is
  // examined, so leave has to be handled there explicitly or it does nothing
  // for exactly the facilities most likely to use it.
  const unscheduled = doctorWith({ shifts: [], leaves: [{ from: '2026-08-24', to: '2026-08-28' }] });

  const freeDay = sittingStatus(unscheduled, at(2026, 8, 20, 11));
  check(
    'Off leave, they still sit whenever',
    freeDay.sitting === true && freeDay.unscheduled === true,
    freeDay
  );

  const onLeaveDay = sittingStatus(unscheduled, at(2026, 8, 26, 11));
  check('On leave, they are NOT sitting', onLeaveDay.sitting === false, onLeaveDay);
  check('…the leave is reported', Boolean(onLeaveDay.onLeave), onLeaveDay);
  check('…they resume on the day they are back', onLeaveDay.backOn === '2026-08-29', onLeaveDay);
  check('…and that is when the estimate counts from', onLeaveDay.nextStart !== null, onLeaveDay);

  // ─────────────────────────────────────────────────────────────────────────
  section('A booking is never placed on a day the doctor is away');

  const bookable = doctorWith({ _id: 'doc-book-1', leaves: [{ from: '2026-08-24', to: '2026-08-28' }] });
  const slot = await resolveBookingSlot(bookable, at(2026, 8, 24, 9));
  check('Booking during a leave lands after it', slot.appointmentDate === '2026-08-29', slot);
  check('…and is flagged as a later day', slot.isNextDay === true, slot);

  const unscheduledBookable = doctorWith({
    _id: 'doc-book-2',
    shifts: [],
    leaves: [{ from: '2026-08-24', to: '2026-08-28' }]
  });
  const slot2 = await resolveBookingSlot(unscheduledBookable, at(2026, 8, 24, 9));
  check(
    'A doctor with no shifts is not booked into their own leave either',
    slot2.appointmentDate === '2026-08-29',
    slot2
  );

  const clear = await resolveBookingSlot(doctorWith({ _id: 'doc-book-3' }), at(2026, 8, 24, 11));
  check('Without leave, today is still today', clear.appointmentDate === KEY(MON24), clear);

  // ─────────────────────────────────────────────────────────────────────────
  section('Auto-assignment skips an absent doctor; a patient choosing one does not');

  const here = doctorWith({ _id: 'doc-here', name: 'Dr. Present' });
  const gone = doctorWith({
    _id: 'doc-gone',
    name: 'Dr. Away',
    leaves: [{ from: '2026-08-24', to: '2026-08-28' }]
  });

  const picked = await pickLeastBusyDoctor([gone, here], 'General Medicine', at(2026, 8, 26));
  check(
    'Triage routes to the doctor who is actually in',
    picked.doctor && picked.doctor.name === 'Dr. Present'
  );

  const noneLeft = await pickLeastBusyDoctor([gone], 'General Medicine', at(2026, 8, 26));
  check('With everyone away, nobody is assigned', noneLeft.doctor === null, noneLeft);
  check('…and the reason is stated, not left as a generic miss', noneLeft.allOnLeave === true, noneLeft);

  const backAgain = await pickLeastBusyDoctor([gone], 'General Medicine', at(2026, 8, 29));
  check('After the leave they are assignable again', backAgain.doctor !== null, backAgain);

  // ─────────────────────────────────────────────────────────────────────────
  section('The patients already booked into the leave are told');

  const doctor = new models.Doctor(doctorWith({ _id: undefined, name: 'Dr. Iyer' }));
  await doctor.save();

  const patient = new models.Patient({ name: 'Ramesh Kumar', phone: '+919876500111', hospital: 'sunrise' });
  await patient.save();

  const mk = async (tokenNumber, appointmentDate, status = 'Waiting') => {
    const token = new models.Token({
      tokenNumber,
      hospital: 'sunrise',
      doctor: doctor._id,
      patient: patient._id,
      status,
      appointmentDate,
      patientAlerts: []
    });
    await token.save();
    return token;
  };

  await mk('T-1', '2026-08-26'); // inside the leave
  await mk('T-2', '2026-08-28'); // last day, inside
  await mk('T-3', '2026-08-29'); // the day they are back — untouched
  await mk('T-4', '2026-08-20'); // before the leave — untouched
  await mk('T-5', '2026-08-25', 'Completed'); // inside, but already seen

  const range = normalizeLeave({ from: '2026-08-24', to: '2026-08-28' });
  const hit = await affectedTokens(doctor, range);
  const numbers = hit.map((t) => t.tokenNumber).sort();

  check('Only tokens inside the leave are affected', numbers.join(',') === 'T-1,T-2', numbers);
  check('…the day they return is not disrupted', !numbers.includes('T-3'), numbers);
  check('…nor is a visit that already happened', !numbers.includes('T-5'), numbers);

  const before = outbound.length;
  const filed = await fileLeave(
    doctor,
    { from: '2026-08-24', to: '2026-08-28', reason: 'Surgery camp' },
    {
      by: 'reception'
    }
  );

  check('The leave is recorded on the doctor', isOnLeave(doctor, at(2026, 8, 26)) === true);
  check('…and reception gets the list to work through', filed.affected.length === 2, filed.affected);
  check(
    '…every row carries a phone to call',
    filed.affected.every((row) => row.patientPhone),
    filed.affected
  );
  check('…the patients were messaged', outbound.length - before === 2, outbound.length - before);
  check(
    '…and the message names the date they must not travel on',
    outbound.slice(-2).every((msg) => msg.message.includes('leave')),
    outbound.slice(-1)[0]
  );
  check('…in Hindi as well as English', outbound.slice(-1)[0].message.includes('छुट्टी'));
  check('…and says when the doctor is back', filed.backOn === '2026-08-29', filed.backOn);

  const again = await fileLeave(doctor, { from: '2026-08-24', to: '2026-08-28' }, { by: 'reception' });
  check('Filing the same leave twice does not duplicate it', again.alreadyFiled === true);
  check('…and does not re-message anyone', outbound.length - before === 2, outbound.length - before);

  // ─────────────────────────────────────────────────────────────────────────
  section('Cancelling, listing and clearing out');

  check('It shows in the upcoming list', upcomingLeaves(doctor, MON24).length === 1);
  check('Cancelling by start date works', (await cancelLeave(doctor, '2026-08-24')) === true);
  check('…the doctor is back on the board', isOnLeave(doctor, at(2026, 8, 26)) === false);
  check(
    'Cancelling something that is not there says so',
    (await cancelLeave(doctor, '2026-01-01')) === false
  );

  const stale = doctorWith({
    leaves: [
      { from: '2026-07-01', to: '2026-07-05' }, // finished
      { from: '2026-08-24', to: '2026-08-28' } // current
    ]
  });
  check('Finished leaves are pruned', pruneLeaves(stale, at(2026, 8, 26)) === true);
  check('…and the current one is kept', stale.leaves.length === 1 && stale.leaves[0].from === '2026-08-24');

  const endingToday = doctorWith({ leaves: [{ from: '2026-08-20', to: '2026-08-26' }] });
  check(
    'A leave ending TODAY survives the prune — they are still away this afternoon',
    pruneLeaves(endingToday, at(2026, 8, 26)) === false,
    endingToday.leaves
  );

  check('Nothing to prune reports no change', pruneLeaves(doctorWith(), MON24) === false);

  // ─────────────────────────────────────────────────────────────────────────
  section('Dates as a patient reads them');

  check(
    'A date key is spoken, not numeric',
    formatDateKey('2026-08-28') === '28 Aug',
    formatDateKey('2026-08-28')
  );
  check('A bad key renders as nothing rather than "Invalid Date"', formatDateKey('rubbish') === '');
  check('Day arithmetic crosses a month end', addDaysToKey('2026-08-31', 1) === '2026-09-01');
  check('…and a year end', addDaysToKey('2026-12-31', 1) === '2027-01-01');

  report();
})();
