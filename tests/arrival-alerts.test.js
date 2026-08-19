/**
 * Distance-aware arrival alerts: telling each patient to leave at THEIR time.
 *
 * The queue used to ping whoever reached the top two waiting slots — right for
 * the patient standing outside, useless for the one two hours away, who is told
 * to come when their turn is twenty minutes off. They lose the token, and the
 * lesson they take is to arrive at 6am and wait all day, which is the crowd the
 * product exists to remove.
 *
 * So the patient states one number at booking — how long they need to reach us —
 * and every departure alert is counted back from their own estimate. The
 * properties worth pinning down are therefore about WHO is told and WHEN, not
 * about the text: at one and the same remaining wait, the far patients must
 * already be on the road and the near ones must not have been disturbed.
 *
 * The second half covers what happens when that timing does not survive contact
 * with traffic — staff pushing one token back so the cabin keeps moving.
 */
const { installMockDb } = require('./helpers/mockDb');
const { section, check, report } = require('./helpers/assert');

const { BACKEND_DIST: BACKEND } = require('./helpers/backendPath');
const { models, outbound } = installMockDb(BACKEND);

const path = require('path');
const {
  parseTravelMinutes,
  travelMinutesOf,
  departureDueMinutes,
  departureDue,
  leaveByLabel,
  isInTransit,
  recallOffsetFor,
  deferToken,
  applyDeferral,
  trackWaitingPatients,
  notifyUpcomingPatients,
  PREP_BUFFER_MINUTES,
  QUEUE_SWEEP_MINUTES,
  MAX_DEFERS
} = require(path.join(BACKEND, 'utils', 'queueHelper.js'));

const HOSP = 'ashoka-life-care-hospital';

/** Messages sent to one phone since the last reset. */
const sentTo = (phone) => outbound.filter((m) => m.phone === phone);

(async () => {
  section('Reading a travel time out of what the patient actually types');

  check('A button answer is understood', parseTravelMinutes('30 minutes') === 30);
  check('Bare minutes are minutes', parseTravelMinutes('45') === 45);
  check('Hours are converted', parseTravelMinutes('2 hours') === 120, parseTravelMinutes('2 hours'));
  check('Hinglish hours count too', parseTravelMinutes('1 ghanta') === 60, parseTravelMinutes('1 ghanta'));
  check('Devanagari hours count too', parseTravelMinutes('2 घंटे') === 120, parseTravelMinutes('2 घंटे'));
  check('Half an hour is half an hour', parseTravelMinutes('aadha ghanta') === 30);
  check('So is डेढ़ घंटा', parseTravelMinutes('डेढ़ घंटा') === 90);
  check('Fractions survive', parseTravelMinutes('1.5 hrs') === 90, parseTravelMinutes('1.5 hrs'));

  // "I am already here" is an ANSWER, and the answer is zero. Reading it as
  // "no answer" would leave a patient at the gate on the far-away path.
  check('Being at the hospital is zero, not unknown', parseTravelMinutes("I'm at the hospital") === 0);
  check('…in Hindi as well', parseTravelMinutes('मैं अस्पताल में ही हूँ') === 0);

  // The distinction the whole feature rests on: nothing said is NOT zero.
  check('No answer stays no answer', parseTravelMinutes('') === null);
  check('Nonsense is not a time', parseTravelMinutes('idk maybe') === null);
  check('Null is not zero', parseTravelMinutes(null) === null);
  check('A wild answer is capped, not stored', parseTravelMinutes('40 hours') === 8 * 60);

  section('When each patient has to leave');

  const due = (mins) => departureDueMinutes({ travelMinutes: mins });
  check('An hour away leaves 70 minutes out', due(60) === 60 + PREP_BUFFER_MINUTES, due(60));
  check('Ten minutes away leaves 20 minutes out', due(10) === 20, due(10));
  check('A patient already here has no departure at all', due(0) === null, due(0));
  check('An unasked patient has none either', due(null) === null, due(null));

  // The headline property. One queue, one remaining wait, four patients at four
  // distances: the far two are already travelling, the near two are still at
  // home and undisturbed. No separate rule produces this — it is one sum.
  const at = (mins) => ({ travelMinutes: mins, status: 'Waiting' });
  check('At 65 min out, the 100-min patient is told to leave', departureDue(at(100), 65));
  check('…so is the 50-min patient', departureDue(at(50), 65));
  check('…the 20-min patient is not', !departureDue(at(20), 65));
  check('…and neither is the 10-min patient', !departureDue(at(10), 65));

  check(
    'The near patient IS told once their own moment arrives',
    departureDue(at(10), 20),
    'a 10-minute journey should be alerted at 20 minutes'
  );
  check(
    'A sweep that would otherwise fire late fires early instead',
    departureDue(at(60), 70 + QUEUE_SWEEP_MINUTES),
    'the lookahead must cover one whole sweep interval'
  );
  check('Nobody is alerted twice', !departureDue({ ...at(60), departureAlerted: true }, 30));
  check('A patient no longer waiting is not alerted', !departureDue({ ...at(60), status: 'Absent' }, 30));

  check(
    'Leave-by is a clock time',
    /^\d{1,2}:\d{2} (AM|PM)$/.test(leaveByLabel(200, 60)),
    leaveByLabel(200, 60)
  );
  check('A wait shorter than the journey means leave now', leaveByLabel(30, 60) === 'now');
  check('A patient at the hospital gets no leave-by line', leaveByLabel(200, 0) === '');

  section('The sweep tells the far patients and leaves the near ones alone');

  const doctor = await new models.Doctor({
    name: 'Dr Meera Iyer',
    hospital: HOSP,
    currentRoom: 'Cabin 3',
    averageCheckupTime: 10
  }).save();

  const mkPatient = (name, phone, travelMinutes) =>
    new models.Patient({ name, phone, hospital: HOSP, travelMinutes }).save();

  const farid = await mkPatient('Farid', '+919100000100', 100);
  const nita = await mkPatient('Nita', '+919100000050', 50);
  const om = await mkPatient('Om', '+919100000020', 20);
  const riya = await mkPatient('Riya', '+919100000010', 10);
  const walkIn = await mkPatient('Walk-in Wasim', '+919100000000', 0);
  const unasked = await mkPatient('Unasked Usha', '+919100000999', null);

  const mkToken = (tokenNumber, patient, travelMinutes, estimatedWaitTime) =>
    new models.Token({
      tokenNumber,
      hospital: HOSP,
      patient: patient._id,
      doctor: doctor._id,
      status: 'Waiting',
      travelMinutes,
      estimatedWaitTime
    }).save();

  // Everyone is 65 minutes from their turn. Nobody has been told anything yet.
  const tFar = await mkToken('D-100', farid, 100, 65);
  const tMid = await mkToken('D-050', nita, 50, 65);
  const tNear = await mkToken('D-020', om, 20, 65);
  const tClose = await mkToken('D-010', riya, 10, 65);
  const tHere = await mkToken('D-000', walkIn, 0, 65);
  const tBlank = await mkToken('D-999', unasked, null, 65);

  await new models.Queue({
    doctor: doctor._id,
    activeQueue: [tFar._id, tMid._id, tNear._id, tClose._id, tHere._id, tBlank._id]
  }).save();

  outbound.length = 0;
  await trackWaitingPatients();

  check('The patient 100 minutes out is told to set off', sentTo(farid.phone).length === 1, outbound.length);
  check('So is the patient 50 minutes out', sentTo(nita.phone).length === 1);
  check(
    'The patient 20 minutes out is NOT disturbed yet',
    sentTo(om.phone).length === 0,
    sentTo(om.phone).map((m) => m.message)
  );
  check('Nor is the patient 10 minutes out', sentTo(riya.phone).length === 0);
  check('A patient already at the hospital is never sent a journey alert', sentTo(walkIn.phone).length === 0);
  check(
    'A patient who was never asked keeps the old behaviour entirely',
    sentTo(unasked.phone).length === 0,
    'an unasked patient must not be given an invented departure time'
  );

  const farMsg = sentTo(farid.phone)[0].message;
  check('The message names the token', farMsg.includes('D-100'), farMsg);
  check('…and the cabin to come to', farMsg.includes('Cabin 3'), farMsg);
  check('…and their own journey length', farMsg.includes('100'), farMsg);
  check('…and is bilingual, like every other queue message', /[ऀ-ॿ]/.test(farMsg), farMsg);

  const row = (n) => models.Token._rows.find((t) => t.tokenNumber === n);
  check('The alert is recorded against the token', row('D-100').departureAlerted === true, row('D-100'));
  check('…with the instant it went out', Boolean(row('D-100').departureAlertedAt), row('D-100'));
  check(
    'The quoted wait counts as told, so the drift tracker will not echo it',
    row('D-100').lastNotifiedWait === 65,
    row('D-100')
  );

  // The property that decides whether a patient keeps trusting the channel.
  outbound.length = 0;
  await trackWaitingPatients();
  check(
    'A second sweep repeats nothing',
    outbound.length === 0,
    outbound.map((m) => m.phone)
  );

  // …and the near patients are told when THEIR moment comes, not before.
  row('D-020').estimatedWaitTime = 25;
  row('D-010').estimatedWaitTime = 25;
  outbound.length = 0;
  await trackWaitingPatients();
  check('The 20-minute patient is told at 25 minutes out', sentTo(om.phone).length === 1);
  check('So is the 10-minute patient', sentTo(riya.phone).length === 1);

  section('A patient we told to leave is not a no-show');

  const enRoute = {
    departureAlerted: true,
    departureAlertedAt: new Date(Date.now() - 20 * 60000),
    travelMinutes: 60
  };
  check('Twenty minutes into an hour-long journey, they are in transit', isInTransit(enRoute));
  check(
    'Long after they should have arrived, they are not',
    !isInTransit({ ...enRoute, departureAlertedAt: new Date(Date.now() - 5 * 60 * 60000) })
  );
  check('Someone never told to leave is not "in transit"', !isInTransit({ travelMinutes: 60 }));
  check(
    'Neither is a patient who was standing here all along',
    !isInTransit({ ...enRoute, travelMinutes: 0 })
  );

  // A recall that lands before the patient can physically arrive is the same
  // no-show scheduled twice.
  check('A patient who stepped out is recalled three slots back', recallOffsetFor({}, 10) === 3);
  check(
    'A patient still forty minutes from the door is recalled further back',
    recallOffsetFor(enRoute, 10) === 4,
    recallOffsetFor(enRoute, 10)
  );

  // The arrival ping must not tell someone already driving to "reach the cabin
  // now" — they are doing exactly what we asked.
  const inTransitPatient = await mkPatient('Transit Tara', '+919100000777', 60);
  const tTransit = await new models.Token({
    tokenNumber: 'D-777',
    hospital: HOSP,
    patient: inTransitPatient._id,
    doctor: doctor._id,
    status: 'Waiting',
    estimatedWaitTime: 15,
    ...enRoute
  }).save();

  const transitDoctor = await new models.Doctor({
    name: 'Dr Anil Bose',
    hospital: HOSP,
    currentRoom: 'Cabin 9',
    averageCheckupTime: 10
  }).save();
  tTransit.doctor = transitDoctor._id;
  await tTransit.save();
  await new models.Queue({ doctor: transitDoctor._id, activeQueue: [tTransit._id] }).save();

  outbound.length = 0;
  await notifyUpcomingPatients(String(transitDoctor._id));
  check(
    'Someone already on the road is not told to "reach the cabin now"',
    sentTo(inTransitPatient.phone).length === 0,
    sentTo(inTransitPatient.phone).map((m) => m.message)
  );

  section('Pushing a late patient back keeps the cabin working');

  const late = await mkPatient('Late Lakhan', '+919100000321', 45);
  const behind1 = await mkPatient('Behind One', '+919100000322', 0);
  const behind2 = await mkPatient('Behind Two', '+919100000323', 0);
  const behind3 = await mkPatient('Behind Three', '+919100000324', 0);

  const pushDoctor = await new models.Doctor({
    name: 'Dr Kavita Menon',
    hospital: HOSP,
    currentRoom: 'Cabin 5',
    averageCheckupTime: 10
  }).save();

  const mkPushToken = (n, patient) =>
    new models.Token({
      tokenNumber: n,
      hospital: HOSP,
      patient: patient._id,
      doctor: pushDoctor._id,
      status: 'Waiting',
      estimatedWaitTime: 0
    }).save();

  const pLate = await mkPushToken('P-1', late);
  const pNext = await mkPushToken('P-2', behind1);
  const pThird = await mkPushToken('P-3', behind2);
  const pFourth = await mkPushToken('P-4', behind3);

  const pushQueue = await new models.Queue({
    doctor: pushDoctor._id,
    activeQueue: [pLate._id, pNext._id, pThird._id, pFourth._id]
  }).save();

  outbound.length = 0;
  const deferred = await applyDeferral(pushDoctor._id, pLate._id, { actor: 'Reception' });

  const order = () =>
    pushQueue.activeQueue.map((entry) => {
      const id = entry && entry._id ? entry._id : entry;
      return (models.Token._rows.find((t) => String(t._id) === String(id)) || {}).tokenNumber;
    });

  check('The push-back is accepted', deferred.ok === true, deferred);
  check('The late patient moves two places down', order().join(',') === 'P-2,P-3,P-1,P-4', order());
  check('…so the next patient is now at the front', order()[0] === 'P-2', order());
  check('The move is counted against the token', row('P-1').deferCount === 1, row('P-1'));
  check(
    'Their front-of-queue ping is armed again for the second approach',
    row('P-1').arrivalAlerted === false,
    row('P-1')
  );

  const lateMsg = sentTo(late.phone)[0];
  check(
    'The pushed-back patient is told, not silently moved',
    Boolean(lateMsg),
    outbound.map((m) => m.phone)
  );
  check(
    '…and is told they still have their visit, with a new time',
    lateMsg && /moved you a few places back/.test(lateMsg.message),
    lateMsg && lateMsg.message
  );
  check('…bilingually', lateMsg && /[ऀ-ॿ]/.test(lateMsg.message), lateMsg && lateMsg.message);

  // Estimates are rewritten for everyone, not just the two who swapped.
  check(
    'The promoted patient inherits the front-of-queue wait',
    row('P-2').estimatedWaitTime === 0,
    row('P-2')
  );
  check(
    'The pushed-back patient is quoted the two consultations now ahead of them',
    row('P-1').estimatedWaitTime === 20,
    row('P-1')
  );

  // Sliding one patient down the line all afternoon hides a decision nobody
  // made. The cap forces it back to a human. (A longer line, so the cap is what
  // stops it rather than simply running out of queue.)
  for (const n of ['P-5', 'P-6', 'P-7', 'P-8']) {
    const filler = await mkPushToken(n, behind3);
    pushQueue.activeQueue.push(filler._id);
  }

  await applyDeferral(pushDoctor._id, pLate._id, {});
  await applyDeferral(pushDoctor._id, pLate._id, {});
  const overCap = await applyDeferral(pushDoctor._id, pLate._id, {});
  check('A token can be pushed back only so many times', row('P-1').deferCount === MAX_DEFERS, row('P-1'));
  check('…and then the queue refuses', overCap.ok === false && overCap.reason === 'defer-limit', overCap);

  const backMarker = pushQueue.activeQueue[pushQueue.activeQueue.length - 1];
  const last = await deferToken(
    pushDoctor._id,
    backMarker && backMarker._id ? backMarker._id : backMarker,
    2
  );
  check('A token already at the back cannot go further', last.moved === false, last);

  const absent = await new models.Token({
    tokenNumber: 'P-9',
    hospital: HOSP,
    patient: behind1._id,
    doctor: pushDoctor._id,
    status: 'Absent'
  }).save();
  const refused = await applyDeferral(pushDoctor._id, absent._id, {});
  check('Only a patient still in the line can be pushed back', refused.ok === false, refused);

  section('The chatbot asks the question once, and remembers the answer');

  await new models.Hospital({
    id: HOSP,
    name: 'Ashoka Life Care',
    address: 'Station Road',
    city: 'Patna',
    phone: '+910000',
    whatsappNumber: '+917484043690'
  }).save();

  await new models.Doctor({
    _id: 'chatdoc',
    name: 'Dr. Sarah Jenkins',
    department: 'General Medicine',
    currentRoom: 'Cabin 101',
    averageCheckupTime: 10,
    availabilityStatus: 'Available',
    hospital: HOSP
  }).save();

  const { processChatMessage } = require(path.join(BACKEND, 'routes', 'chat.js'))._internals;
  const say = async (sessionId, message) => {
    const result = await processChatMessage({ sessionId, message, hospitalId: HOSP });
    return { ...result, flat: result.messages.map((m) => m.text).join(' | ') };
  };

  const s1 = 'travel-web-1';
  await say(s1, 'hi');
  await say(s1, 'English');
  await say(s1, 'mujhe 2 din se bukhar hai');
  await say(s1, '+91 98765 43219');
  await say(s1, 'Ramesh Kumar');
  await say(s1, '34');
  await say(s1, 'm');

  // The patient now picks their own doctor off the list instead of confirming a
  // recommendation; the travel-time question follows the choice either way.
  let reply = await say(s1, '1');
  check(
    'Choosing the doctor asks how long they need to reach us',
    /how long do you need to REACH/i.test(reply.flat),
    reply.flat
  );
  check('…offering tappable answers', (reply.options || []).length >= 4, reply.options);
  check('The token is NOT booked until that is answered', !/Booking Complete/i.test(reply.flat), reply.flat);

  reply = await say(s1, 'nonsense');
  check(
    'An unreadable answer re-asks rather than guessing',
    /tap one of the options/i.test(reply.flat),
    reply.flat
  );

  reply = await say(s1, '1 hour');
  check('A readable answer books the token', /Booking Complete/i.test(reply.flat), reply.flat);
  check('…and confirms what we will do with it', /60 min/.test(reply.flat), reply.flat);
  check('…telling them when to leave home', /Leave (home by|for the hospital)/i.test(reply.flat), reply.flat);

  // Found by the symptoms the patient typed rather than by doctor id: the
  // patient picks off the list now, so which doctor they land on is their
  // choice and not something this test should pin.
  const booked = models.Token._rows.find((t) => t.symptoms === 'mujhe 2 din se bukhar hai');
  check('The travel time is stored on the token', booked && booked.travelMinutes === 60, booked);

  const ramesh = models.Patient._rows.find((p) => p.name === 'Ramesh Kumar');
  check('…and remembered on the patient', ramesh && ramesh.travelMinutes === 60, ramesh);

  const waMsg = sentTo(ramesh.phone).find((m) => /token/i.test(m.message));
  check(
    'The booking WhatsApp carries a leave-home time',
    waMsg && /Leave home by/.test(waMsg.message),
    waMsg && waMsg.message
  );

  // Second visit: the question is not asked again.
  const s2 = 'travel-web-2';
  await say(s2, 'hi');
  await say(s2, 'English');
  await say(s2, 'phir se bukhar hai');
  await say(s2, '+91 98765 43219');
  reply = await say(s2, '1');
  check(
    'A returning patient is never asked the same question twice',
    !/how long do you need to REACH/i.test(reply.flat),
    reply.flat
  );
  check('…and their booking completes in one tap', /Booking Complete/i.test(reply.flat), reply.flat);

  // …but they can correct it whenever it changes.
  const s3 = 'travel-web-3';
  await say(s3, 'hi');
  await say(s3, 'English');
  await say(s3, 'headache');
  await say(s3, '+91 98765 43219');
  reply = await say(s3, 'time 20');
  check('A patient can correct a remembered travel time', /about 20 min/i.test(reply.flat), reply.flat);
  const moved = models.Patient._rows.find((p) => p.name === 'Ramesh Kumar');
  check('…and it is written back to their record', moved.travelMinutes === 20, moved);

  section('A tapped option means the option, not its number');

  // WhatsApp never sends the label back. Meta collapses an interactive reply to
  // its 1-based option number, and the Twilio path prints a numbered list the
  // patient answers the same way — so the whole question arrives as a single
  // digit. Read as a duration, "1 hour" (option 4) became four minutes and the
  // departure alert that the question exists to time went out hours late.
  const s5 = 'travel-wa-option';
  await say(s5, 'hi');
  await say(s5, 'English');
  await say(s5, 'stomach pain since morning');
  await say(s5, '+91 98765 43777');
  await say(s5, 'Sunita Devi');
  await say(s5, '41');
  await say(s5, 'f');
  await say(s5, '1'); // pick the first doctor off the list

  reply = await say(s5, '4'); // the "1 hour" button
  check('Option 4 is one hour, not four minutes', /about 60 min/i.test(reply.flat), reply.flat);

  const sunita = models.Patient._rows.find((p) => p.name === 'Sunita Devi');
  check('…and 60 is what gets stored', sunita && sunita.travelMinutes === 60, sunita);

  // Option 1 is "I'm at the hospital" — zero, which must survive as zero and
  // not become "one minute away".
  const s6 = 'travel-wa-here';
  await say(s6, 'hi');
  await say(s6, 'English');
  await say(s6, 'ear pain');
  await say(s6, '+91 98765 43888');
  await say(s6, 'Alok Nath');
  await say(s6, '29');
  await say(s6, 'm');
  await say(s6, '1'); // pick the first doctor off the list

  reply = await say(s6, '1'); // the "I'm at the hospital" button
  check('Option 1 means already here', /you are here already/i.test(reply.flat), reply.flat);
  const alok = models.Patient._rows.find((p) => p.name === 'Alok Nath');
  check('…stored as zero', alok && alok.travelMinutes === 0, alok);

  section('An emergency is never made to answer a question first');

  const s4 = 'travel-emergency';
  await say(s4, 'hi');
  await say(s4, 'English');
  await say(s4, 'severe chest pain and breathlessness');
  await say(s4, '+91 98765 43555');
  await say(s4, 'Imran Ali');
  await say(s4, '52');
  reply = await say(s4, 'm');
  const emergencyReply = /Booking Complete/i.test(reply.flat) ? reply : await say(s4, '1');
  check(
    'A red-flag booking goes straight through',
    /Booking Complete/i.test(emergencyReply.flat),
    emergencyReply.flat
  );
  check(
    '…without stopping to ask about the journey',
    !/how long do you need to REACH/i.test(emergencyReply.flat),
    emergencyReply.flat
  );

  report();
})();
