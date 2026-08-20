/**
 * Booking after hours, and the day a token actually belongs to.
 *
 * A patient who opens the chat at 9pm is not booking for 9pm. The OPD is shut,
 * the doctor is at home, and the only useful token is one for the next sitting.
 * The platform used to answer that in two incompatible ways: the wait estimate
 * knew the cabin was closed, but the token was written with today's date and the
 * message said "leave for the hospital NOW". A day whose token limit was already
 * spent was worse — the booking was refused outright, so the last hour of every
 * evening turned every patient away instead of filling tomorrow morning.
 *
 * Both now go through one function. What is pinned here:
 *
 *   - The day comes from the DOCTOR's own schedule, never a platform-wide guess
 *     about when hospitals open. A doctor with no schedule keeps behaving
 *     exactly as they did before shifts existed.
 *   - A full day is a reason to book the next one, not to refuse.
 *   - Capacity is counted against the day the patient is SEEN. Counting a
 *     next-day booking against today is what filled today's limit with patients
 *     who were never coming today.
 *   - A token booked for tomorrow is still in tomorrow's queue after the
 *     midnight reset. It survived that reset as a record but was dropped from
 *     the queue, so the patient arrived to find themselves in no line at all.
 */
const path = require('path');
const { installMockDb } = require('./helpers/mockDb');
const { section, check, report } = require('./helpers/assert');

// chat.js pulls in middleware/auth, which refuses to load without a secret.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-not-used-for-signing-here';

const { BACKEND_DIST: BACKEND } = require('./helpers/backendPath');
const { models } = installMockDb(BACKEND);

const { resolveBookingSlot, MAX_ROLL_DAYS } = require(path.join(BACKEND, 'utils', 'bookingSlot.js'));
const { isDoctorFull, getTokenCountForDate } = require(path.join(BACKEND, 'utils', 'queueHelper.js'));
const { localDateKey, firstSittingOn } = require(path.join(BACKEND, 'utils', 'shiftHelper.js'));
const { requeueScheduledTokens } = require(path.join(BACKEND, 'jobs', 'dailyReset.js'));
const { doctorChoiceMessage } = require(path.join(BACKEND, 'utils', 'doctorChoices.js'));
const { recalculateQueueTimes } = require(path.join(BACKEND, 'utils', 'queueHelper.js'));

/** A fixed instant, so nothing here depends on the hour the suite is run. */
const at = (y, m, d, h, min = 0) => new Date(y, m - 1, d, h, min, 0, 0);

(async () => {
  // A Wednesday. Morning clinic only, so 9pm is unambiguously after hours.
  const WED_MORNING = at(2026, 8, 19, 10, 30);
  const WED_NIGHT = at(2026, 8, 19, 21, 30);

  const morningDoc = await new models.Doctor({
    name: 'Dr. Sarah Jenkins',
    hospital: 'general-hospital',
    shifts: [{ label: 'Morning', start: '09:00', end: '13:00' }],
    dailyTokenLimit: 0
  }).save();

  section('The day a booking lands on comes from the doctor, not the clock alone');

  const during = await resolveBookingSlot(morningDoc, WED_MORNING);
  check(
    'Booking inside the sitting is for today',
    during.isNextDay === false && during.appointmentDate === localDateKey(WED_MORNING),
    during
  );

  const night = await resolveBookingSlot(morningDoc, WED_NIGHT);
  check('Booking after the sitting has ended is not for today', night.isNextDay === true, night);
  check(
    '…it is for the next day the doctor sits',
    night.appointmentDate === localDateKey(at(2026, 8, 20, 9, 0)),
    night.appointmentDate
  );
  check(
    '…starting when that sitting starts, not at midnight',
    night.scheduledDate.getHours() === 9 && night.scheduledDate.getMinutes() === 0,
    night.scheduledDate.toString()
  );
  check('…and nothing was rolled past', night.rolledDays === 0 && night.noRoom === false, night);

  // A doctor who sits Mon/Wed/Fri, booked on a Wednesday night: the answer is
  // Friday, not "tomorrow". This is the case a platform-wide 9-to-5 default
  // gets wrong every time.
  const altDoc = await new models.Doctor({
    name: 'Dr. Rao',
    hospital: 'general-hospital',
    shifts: [{ label: 'Clinic', start: '11:00', end: '14:00', days: ['Mon', 'Wed', 'Fri'] }]
  }).save();
  const altNight = await resolveBookingSlot(altDoc, WED_NIGHT);
  check(
    'A Mon/Wed/Fri consultant booked on Wednesday night gets Friday, not Thursday',
    altNight.appointmentDate === localDateKey(at(2026, 8, 21, 11, 0)),
    altNight.appointmentDate
  );

  section('A doctor with no schedule keeps working exactly as before');

  const unscheduledDoc = await new models.Doctor({
    name: 'Dr. Clara Watson',
    hospital: 'apex-pharmacy',
    shifts: []
  }).save();
  const anytime = await resolveBookingSlot(unscheduledDoc, WED_NIGHT);
  check(
    'No shifts means available now — an empty schedule is not a closed one',
    anytime.isNextDay === false && anytime.appointmentDate === localDateKey(WED_NIGHT),
    anytime
  );

  section('Capacity is counted against the day the patient is seen');

  const cappedDoc = await new models.Doctor({
    name: 'Dr. Emily Taylor',
    hospital: 'general-hospital',
    shifts: [{ label: 'Morning', start: '10:00', end: '13:00' }],
    dailyTokenLimit: 2
  }).save();

  const todayKey = localDateKey(WED_MORNING);
  const tomorrowKey = localDateKey(at(2026, 8, 20, 10, 0));

  // Two tokens for TODAY fill today's limit.
  for (const n of ['A-1', 'A-2']) {
    await new models.Token({
      tokenNumber: n,
      hospital: 'general-hospital',
      doctor: cappedDoc._id,
      status: 'Waiting',
      appointmentDate: todayKey
    }).save();
  }

  check(
    "Today's tokens are counted against today",
    (await getTokenCountForDate(cappedDoc._id, todayKey)) === 2,
    await getTokenCountForDate(cappedDoc._id, todayKey)
  );
  check('The doctor is full today', (await isDoctorFull(cappedDoc, todayKey)) === true);
  check('…but not tomorrow', (await isDoctorFull(cappedDoc, tomorrowKey)) === false);

  const rolled = await resolveBookingSlot(cappedDoc, WED_MORNING);
  check(
    'A full day is a reason to book the next one, not to refuse',
    rolled.noRoom === false && rolled.isNextDay === true,
    rolled
  );
  check(
    '…rolling exactly one day',
    rolled.rolledDays === 1 && rolled.appointmentDate === tomorrowKey,
    rolled
  );

  // The bug this replaces: a token created tonight FOR tomorrow used to count
  // against tonight, so an evening of next-day bookings closed today's OPD.
  await new models.Token({
    tokenNumber: 'A-3',
    hospital: 'general-hospital',
    doctor: cappedDoc._id,
    status: 'Waiting',
    appointmentDate: tomorrowKey,
    createdAt: WED_NIGHT
  }).save();
  check(
    "A token booked tonight for tomorrow does not consume today's capacity",
    (await getTokenCountForDate(cappedDoc._id, todayKey)) === 2,
    await getTokenCountForDate(cappedDoc._id, todayKey)
  );
  check(
    '…it consumes tomorrow',
    (await getTokenCountForDate(cappedDoc._id, tomorrowKey)) === 1,
    await getTokenCountForDate(cappedDoc._id, tomorrowKey)
  );

  // No-shows free their slot back up, so a day of absentees is not a closed day.
  await new models.Token({
    tokenNumber: 'A-4',
    hospital: 'general-hospital',
    doctor: cappedDoc._id,
    status: 'Absent',
    appointmentDate: todayKey
  }).save();
  check(
    'A no-show does not hold a slot against the day',
    (await getTokenCountForDate(cappedDoc._id, todayKey)) === 2,
    await getTokenCountForDate(cappedDoc._id, todayKey)
  );

  section('When there is genuinely no room, nothing is booked');

  const bookedOutDoc = await new models.Doctor({
    name: 'Dr. Full',
    hospital: 'general-hospital',
    shifts: [{ label: 'Morning', start: '09:00', end: '13:00' }],
    dailyTokenLimit: 1
  }).save();

  // Fill every day the resolver is willing to look at.
  for (let i = 0; i <= MAX_ROLL_DAYS + 1; i++) {
    const day = new Date(WED_MORNING);
    day.setDate(day.getDate() + i);
    await new models.Token({
      tokenNumber: `F-${i}`,
      hospital: 'general-hospital',
      doctor: bookedOutDoc._id,
      status: 'Waiting',
      appointmentDate: localDateKey(day)
    }).save();
  }

  const noRoom = await resolveBookingSlot(bookedOutDoc, WED_MORNING);
  check('A week with no free day reports no room', noRoom.noRoom === true, noRoom);
  check(
    '…rather than silently booking a day that is already full',
    noRoom.rolledDays === MAX_ROLL_DAYS,
    noRoom
  );

  section('A token booked for tomorrow is in tomorrow’s queue');

  const nightDoc = await new models.Doctor({
    name: 'Dr. Night',
    hospital: 'general-hospital',
    shifts: [{ label: 'Morning', start: '09:00', end: '13:00' }]
  }).save();
  await new models.Queue({ doctor: nightDoc._id, activeQueue: [] }).save();

  const today = localDateKey(new Date());
  const laterKey = localDateKey(new Date(Date.now() + 5 * 24 * 60 * 60 * 1000));

  const dueToday = await new models.Token({
    tokenNumber: 'N-1',
    hospital: 'general-hospital',
    doctor: nightDoc._id,
    status: 'Waiting',
    isNextDay: true,
    appointmentDate: today
  }).save();
  const dueLater = await new models.Token({
    tokenNumber: 'N-2',
    hospital: 'general-hospital',
    doctor: nightDoc._id,
    status: 'Waiting',
    isNextDay: true,
    appointmentDate: laterKey
  }).save();

  const requeued = await requeueScheduledTokens('general-hospital', [dueToday, dueLater]);
  check('The token whose day has arrived is put back in the queue', requeued === 1, requeued);

  const queue = await models.Queue.findOne({ doctor: nightDoc._id });
  const queuedIds = (queue.activeQueue || []).map(String);
  check('…and it is the right one', queuedIds.includes(String(dueToday._id)), queuedIds);
  check(
    'A booking for next week is not dragged into today’s line',
    !queuedIds.includes(String(dueLater._id)),
    queuedIds
  );

  // Running twice must not double-book anyone — the reset is a job, and jobs
  // get retried.
  await requeueScheduledTokens('general-hospital', [dueToday, dueLater]);
  const after = await models.Queue.findOne({ doctor: nightDoc._id });
  check(
    'Running the reset twice does not put the same patient in the line twice',
    (after.activeQueue || []).filter((id) => String(id) === String(dueToday._id)).length === 1,
    after.activeQueue
  );

  section('The sitting a rolled booking is announced for');

  check(
    'A doctor sitting on a given day reports that day’s start time',
    firstSittingOn(morningDoc, at(2026, 8, 20, 0, 0)).getHours() === 9
  );
  check(
    'A doctor who does not sit that day reports nothing to announce',
    firstSittingOn(altDoc, at(2026, 8, 20, 0, 0)) === null
  );

  section('Today’s queue holds today’s patients only');

  // Built relative to the real clock rather than a fixed date, because
  // `finalizeBooking` reads `new Date()` itself: a doctor who sits only
  // TOMORROW is after-hours no matter which hour this suite runs at.
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const tomorrowName = DAY_NAMES[new Date(Date.now() + 24 * 60 * 60 * 1000).getDay()];
  const HOSP = 'sync-hospital';

  await new models.Hospital({
    id: HOSP,
    name: 'Sync Care',
    address: 'Main Road',
    city: 'Patna',
    phone: '+910000',
    whatsappNumber: '+917484043690'
  }).save();

  const tomorrowOnlyDoc = await new models.Doctor({
    _id: 'syncdoc',
    name: 'Dr. Meera Sharma',
    department: 'General Medicine',
    currentRoom: 'Cabin 7',
    averageCheckupTime: 10,
    availabilityStatus: 'Available',
    hospital: HOSP,
    shifts: [{ label: 'Morning', start: '09:00', end: '13:00', days: [tomorrowName] }]
  }).save();
  await new models.Queue({ doctor: tomorrowOnlyDoc._id, activeQueue: [] }).save();

  const { processChatMessage } = require(path.join(BACKEND, 'routes', 'chat.js'))._internals;
  const chat = async (sessionId, message) => {
    const result = await processChatMessage({ sessionId, message, hospitalId: HOSP });
    return { ...result, flat: result.messages.map((m) => m.text).join(' | ') };
  };

  const cs = 'sync-booking';
  for (const step of ['hi', 'English', '1', '+91 90000 11111', 'Meena Devi', '40', 'f', 'fever']) {
    await chat(cs, step);
  }
  const listed = await chat(cs, '1');
  const finished = await chat(cs, '30 minutes');
  check('The booking completes', /Booking Complete/i.test(finished.flat), finished.flat);
  check(
    '…and says it is for another day',
    /confirmed for/i.test(finished.flat) || /OPD/i.test(finished.flat),
    finished.flat
  );

  const scheduled = models.Token._rows.find((t) => t.hospital === HOSP);
  check('The token is marked as a future booking', scheduled && scheduled.isNextDay === true, scheduled);

  // The point of the whole change: a patient who is at home tonight is not
  // standing in today's line, is not on the waiting-room screen, and is not
  // pushing anyone else's estimate out by a consultation.
  const syncQueue = await models.Queue.findOne({ doctor: tomorrowOnlyDoc._id });
  check(
    'A booking for another day is NOT put in today’s live queue',
    (syncQueue.activeQueue || []).length === 0,
    syncQueue.activeQueue
  );
  check(
    '…but the patient is still given a time to work back from',
    scheduled && scheduled.estimatedWaitTime > 0,
    scheduled && scheduled.estimatedWaitTime
  );

  section('The doctor list shows when each doctor actually sits');

  const menu = await doctorChoiceMessage([morningDoc, tomorrowOnlyDoc], 'Pick one:');
  check('Every doctor is still tappable', menu.options.length === 2, menu.options);
  check(
    'The option label stays short enough for a WhatsApp list row',
    menu.options.every((o) => o.length <= 24 || /\(/.test(o)),
    menu.options
  );
  check('The message names the sitting hours', /9:00 AM/.test(menu.text), menu.text);
  check(
    'A doctor who is not sitting today is shown as closed with their next sitting',
    /Closed now/.test(menu.text) && /Next:/.test(menu.text),
    menu.text
  );
  check(
    '…and the one who is sitting is shown as open',
    /Sitting now|No fixed OPD/.test(menu.text),
    menu.text
  );

  const hindiMenu = await doctorChoiceMessage([tomorrowOnlyDoc], 'चुनें:', 'hi');
  check(
    'The same list speaks Hindi when the patient does',
    /बंद|बैठे|समय/.test(hindiMenu.text),
    hindiMenu.text
  );

  section('A queue estimate ignores tokens dated for a later day');

  const mixedDoc = await new models.Doctor({
    name: 'Dr. Mixed',
    hospital: HOSP,
    averageCheckupTime: 10,
    shifts: []
  }).save();
  const todayTok = await new models.Token({
    tokenNumber: 'M-1',
    hospital: HOSP,
    doctor: mixedDoc._id,
    status: 'Waiting',
    appointmentDate: localDateKey(new Date())
  }).save();
  const futureTok = await new models.Token({
    tokenNumber: 'M-2',
    hospital: HOSP,
    doctor: mixedDoc._id,
    status: 'Waiting',
    appointmentDate: localDateKey(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000))
  }).save();
  // A queue left holding both, as an older build would have written it.
  await new models.Queue({ doctor: mixedDoc._id, activeQueue: [futureTok._id, todayTok._id] }).save();

  await recalculateQueueTimes(mixedDoc._id);
  const recalcToday = models.Token._rows.find((t) => t.tokenNumber === 'M-1');
  check(
    'The patient here today is first in line, not second behind next week',
    recalcToday.estimatedWaitTime === 0,
    recalcToday.estimatedWaitTime
  );

  report();
})();
