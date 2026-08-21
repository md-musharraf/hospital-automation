/**
 * Close-of-day behaviour.
 *
 * Every check here corresponds to something the old inline cron got wrong, and
 * each failure was silent: no exception, no log, just wrong data the next
 * morning. The archive-attribution case is the one that cannot be undone — once
 * the source tokens are deleted, a mislabelled archive is the only record left.
 */
const path = require('path');
const { installMockDb } = require('./helpers/mockDb');
const { section, check, report } = require('./helpers/assert');

const { BACKEND_DIST: BACKEND } = require('./helpers/backendPath');
const { models } = installMockDb(BACKEND);
const { runDailyReset, openTodaysBoards, _forgetOpenedDay } = require('../backend/dist/jobs/dailyReset');
const { localDateKey } = require('../backend/dist/utils/shiftHelper');

/** Records every room an event was addressed to, so we can prove tenant scoping. */
function fakeIo() {
  const emissions = [];
  return {
    emissions,
    to(room) {
      return {
        emit(event, payload) {
          emissions.push({ room, event, payload });
        }
      };
    }
  };
}

(async () => {
  section('Close-of-day: archival, tenant scope and in-flight patients');

  const cityDoctor = await new models.Doctor({ name: 'Dr. Rao', hospital: 'city-hospital' }).save();
  const apexDoctor = await new models.Doctor({ name: 'Dr. Iqbal', hospital: 'apex-clinic' }).save();

  await new models.Queue({ doctor: cityDoctor._id, activeQueue: ['stale'], bufferDelay: 25 }).save();
  await new models.Queue({ doctor: apexDoctor._id, activeQueue: ['stale'], bufferDelay: 40 }).save();

  const patient = await new models.Patient({ name: 'Ramesh', age: 54, phone: '+919000000001' }).save();

  const makeToken = (id, hospital, doctor, journeyStage) =>
    new models.Token({
      _id: id,
      tokenNumber: `T-${id}`,
      hospital,
      doctor: doctor._id,
      patient: patient._id,
      symptoms: 'Fever',
      status: 'Waiting',
      journeyStage
    }).save();

  await makeToken('1', 'city-hospital', cityDoctor, 'Completed');
  await makeToken('2', 'city-hospital', cityDoctor, 'Waiting');
  await makeToken('3', 'city-hospital', cityDoctor, 'Lab Pending'); // still mid-treatment
  await makeToken('4', 'apex-clinic', apexDoctor, 'Completed');
  await makeToken('5', 'apex-clinic', apexDoctor, 'In Consultation'); // still mid-treatment

  const io = fakeIo();
  const summaries = await runDailyReset(io);

  // --- Archive attribution: the bug that permanently rewrote history ---
  const archives = models.ArchivedToken._rows;
  check('Every finished token is archived', archives.length === 3, `got ${archives.length}`);
  check(
    'Archives keep the facility they belonged to',
    archives.every((a) => a.hospital === 'city-hospital' || a.hospital === 'apex-clinic'),
    archives.map((a) => a.hospital)
  );
  check(
    "No archive is silently relabelled 'general-hospital'",
    archives.every((a) => a.hospital !== 'general-hospital'),
    archives.map((a) => `${a.tokenNumber}:${a.hospital}`)
  );
  check(
    "City's two finished tokens are attributed to city-hospital",
    archives.filter((a) => a.hospital === 'city-hospital').length === 2
  );
  check(
    "Apex's one finished token is attributed to apex-clinic",
    archives.filter((a) => a.hospital === 'apex-clinic').length === 1
  );

  // --- In-flight patients survive the night ---
  const remaining = models.Token._rows;
  check('Tokens still mid-treatment are carried forward', remaining.length === 2, `got ${remaining.length}`);
  check(
    'A patient waiting on a lab result keeps their token',
    remaining.some((t) => t.journeyStage === 'Lab Pending')
  );
  check(
    'A patient inside a consultation keeps their token',
    remaining.some((t) => t.journeyStage === 'In Consultation')
  );
  check(
    'A no-show waiting since morning is archived, not carried',
    !remaining.some((t) => t.journeyStage === 'Waiting')
  );

  // --- Queue boards are cleared, per facility ---
  const queues = models.Queue._rows;
  check(
    'Every facility board is cleared of yesterday',
    queues.every((q) => q.activeQueue.length === 0 && q.bufferDelay === 0)
  );

  // --- Realtime stays inside the tenant ---
  const resetEvents = io.emissions.filter((e) => e.event === 'queue-reset');
  check('Each facility is told separately', resetEvents.length === 2, `got ${resetEvents.length}`);
  check(
    'queue-reset is addressed to facility rooms, never broadcast platform-wide',
    resetEvents.every((e) => e.room.startsWith('hospital:')),
    resetEvents.map((e) => e.room)
  );
  check(
    'city-hospital gets its own reset event',
    resetEvents.some((e) => e.room === 'hospital:city-hospital')
  );
  check(
    'apex-clinic gets its own reset event',
    resetEvents.some((e) => e.room === 'hospital:apex-clinic')
  );

  // --- The summary a human reads in the logs ---
  check('One summary per facility', summaries.length === 2, summaries);
  check(
    'No facility failed',
    summaries.every((s) => !s.failed),
    summaries
  );

  // -------------------------------------------------------------------------
  section('A night the server slept through is still closed in the morning');
  // -------------------------------------------------------------------------
  //
  // The midnight cron only fires while the process is running, and on a free
  // hosting plan it is not: the instance sleeps after fifteen minutes of
  // silence, which every night is. So the job never ran — and the half nobody
  // could see was that a token booked for TODAY never entered today's queue.
  // The patient held a token, tracked it, arrived, and was in no line at all.

  const todayKey = localDateKey(new Date());
  const yesterdayKey = localDateKey(new Date(Date.now() - 24 * 60 * 60 * 1000));

  const sleepyDoctor = await new models.Doctor({ name: 'Dr. Bose', hospital: 'sleepy-clinic' }).save();
  await new models.Queue({ doctor: sleepyDoctor._id, activeQueue: ['left-over-from-yesterday'] }).save();
  const sleepy = await new models.Hospital({
    id: 'sleepy-clinic',
    name: 'Sleepy Clinic',
    slug: 'sleepy-clinic',
    address: 'Station Road',
    city: 'Ranchi',
    phone: '+919000000009',
    whatsappNumber: '+917484043690',
    coordinates: { lat: 23.3, lng: 85.3 },
    lastDailyReset: yesterdayKey
  }).save();

  // Booked last night for this morning's OPD, exactly as the chatbot writes it.
  const dueThisMorning = await new models.Token({
    _id: 'due-today',
    tokenNumber: 'T-77',
    hospital: 'sleepy-clinic',
    doctor: sleepyDoctor._id,
    patient: patient._id,
    status: 'Waiting',
    journeyStage: 'Waiting',
    isNextDay: true,
    appointmentDate: todayKey
  }).save();

  _forgetOpenedDay();
  const opened = await openTodaysBoards(fakeIo());

  check('The missed night is recognised and closed', opened.closed.includes('sleepy-clinic'), opened);
  const sleepyQueue = await models.Queue.findOne({ doctor: sleepyDoctor._id });
  check(
    "Yesterday's leftovers are off the board",
    !(sleepyQueue.activeQueue || []).includes('left-over-from-yesterday'),
    sleepyQueue.activeQueue
  );
  check(
    'The token booked last night is in this morning’s queue',
    (sleepyQueue.activeQueue || []).some((id) => String(id) === String(dueThisMorning._id)),
    sleepyQueue.activeQueue
  );
  const stamped = await models.Hospital.findOne({ id: 'sleepy-clinic' });
  check(
    'The facility is stamped so it is not reset twice',
    stamped.lastDailyReset === todayKey,
    stamped.lastDailyReset
  );

  // Same process, same day: the whole thing must cost nothing the second time.
  const again = await openTodaysBoards(fakeIo());
  check('A second call the same day does no work', again.closed.length === 0 && again.requeued === 0, again);

  // A facility nobody has ever stamped has NOT necessarily missed a night —
  // reading an empty marker as "yesterday was never closed" would archive a
  // live morning's board on the deploy that introduced the marker.
  const fresh = await new models.Hospital({
    id: 'fresh-clinic',
    name: 'Fresh Clinic',
    slug: 'fresh-clinic',
    address: 'New Road',
    city: 'Gaya',
    phone: '+919000000010',
    whatsappNumber: '+917484043690',
    coordinates: { lat: 24.8, lng: 85 }
  }).save();
  const freshDoctor = await new models.Doctor({ name: 'Dr. New', hospital: 'fresh-clinic' }).save();
  await new models.Queue({ doctor: freshDoctor._id, activeQueue: ['this-mornings-patient'] }).save();

  _forgetOpenedDay();
  const firstSight = await openTodaysBoards(fakeIo());
  check(
    'A never-stamped facility is stamped, not wiped',
    firstSight.seeded.includes('fresh-clinic') && !firstSight.closed.includes('fresh-clinic'),
    firstSight
  );
  const freshQueue = await models.Queue.findOne({ doctor: freshDoctor._id });
  check(
    "…so this morning's live queue survives the upgrade",
    (freshQueue.activeQueue || []).includes('this-mornings-patient'),
    freshQueue.activeQueue
  );

  report();
})();
