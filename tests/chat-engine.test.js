/**
 * Chat state-engine tests — no database, no server, no network.
 *
 * Runs the real `processChatMessage` against in-memory models, so a full patient
 * conversation (web widget AND WhatsApp) is verified in about a second. This is
 * the suite the pre-commit hook runs.
 *
 *   npm test
 */
const path = require('path');
const { installMockDb } = require('./helpers/mockDb');
const { section, check, report } = require('./helpers/assert');

const { BACKEND_DIST: BACKEND } = require('./helpers/backendPath');
const { models } = installMockDb(BACKEND);

// Seed one facility with three departments so triage has somewhere to route.
new models.Hospital({
  id: 'general-hospital',
  name: 'City General',
  address: 'MG Road',
  city: 'Patna',
  phone: '+910000',
  whatsappNumber: '+917484043690'
}).save();

const seedDoctor = (id, name, department, room) =>
  new models.Doctor({
    _id: id,
    name,
    department,
    currentRoom: room,
    averageCheckupTime: 10,
    availabilityStatus: 'Available',
    hospital: 'general-hospital'
  }).save();

seedDoctor('docA', 'Dr. Sarah Jenkins', 'General Medicine', 'Cabin 101');
seedDoctor('docB', 'Dr. James Chen', 'Cardiology', 'Cabin 202');
seedDoctor('docC', 'Dr. Ana Silva', 'Orthopedics', 'Cabin 303');

const { processChatMessage } = require(path.join(BACKEND, 'routes', 'chat.js'))._internals;

/** Send one message and return the flattened bot reply. */
async function say(sessionId, message) {
  const result = await processChatMessage({ sessionId, message, hospitalId: 'general-hospital' });
  return { ...result, flat: result.messages.map((m) => m.text).join(' | ') };
}

(async () => {
  section('Free-text symptoms start a booking (new patient, web)');
  let session = 'web1';
  await say(session, 'hi');
  await say(session, 'English');

  let reply = await say(session, 'mujhe 2 din se bukhar hai');
  check('Hinglish symptoms are understood and ask for a phone', /phone number/i.test(reply.flat), reply.flat);

  reply = await say(session, '+91 98765 43210');
  check('unknown number begins registration', /full name/i.test(reply.flat), reply.flat);

  reply = await say(session, 'Ramesh Kumar');
  check('asks for age', /age of Ramesh/i.test(reply.flat), reply.flat);

  reply = await say(session, '34 years');
  check('accepts "34 years"', /gender/i.test(reply.flat), reply.flat);

  reply = await say(session, 'm');
  check('accepts "m" as gender', !/gender/i.test(reply.flat), reply.flat);
  check('does not ask for symptoms twice', !/describe/i.test(reply.flat), reply.flat);
  check('recommends a doctor', /Recommended/i.test(reply.flat), reply.flat);
  check('fever routes to General Medicine', /General Medicine/.test(reply.flat), reply.flat);

  reply = await say(session, 'yes');
  // A first-time patient is asked one more thing before the token is minted:
  // how long they need to reach us, which is what every later "leave now"
  // alert is counted back from. See tests/arrival-alerts.test.js.
  check(
    'a new patient is asked their travel time',
    /how long do you need to REACH/i.test(reply.flat),
    reply.flat
  );

  reply = await say(session, '30 minutes');
  check('one-tap confirm books the token', /Booking Complete/i.test(reply.flat), reply.flat);

  const tokenNumber = (models.Token._rows[0] || {}).tokenNumber;
  check('token was created', Boolean(tokenNumber), `${models.Token._rows.length} tokens`);
  check(
    'phone stored in canonical form',
    (models.Patient._rows[0] || {}).phone === '+919876543210',
    (models.Patient._rows[0] || {}).phone
  );

  section('A token number typed anywhere returns live status');
  reply = await say(session, tokenNumber);
  check('status without navigating the menu', /Live Status/i.test(reply.flat), reply.flat);
  reply = await say(session, tokenNumber.replace('-', ''));
  check('a bare number works too', /Live Status/i.test(reply.flat), reply.flat);

  section('Returning patient is recognised across phone formats');
  session = 'web2';
  await say(session, 'hi');
  await say(session, 'English');
  await say(session, '1');
  reply = await say(session, '9876543210');
  check('same patient found from a different format', /Welcome back, Ramesh/i.test(reply.flat), reply.flat);
  check('registration is skipped', !/full name/i.test(reply.flat), reply.flat);

  reply = await say(session, 'seene me dard ho raha hai');
  check('chest pain escalates to emergency', /URGENT|EMERGENCY/i.test(reply.flat), reply.flat);
  check('chest pain routes to Cardiology', /Cardiology/.test(reply.flat), reply.flat);

  reply = await say(session, '1');
  check('booked', /Booking Complete/i.test(reply.flat), reply.flat);
  check('no duplicate patient record', models.Patient._rows.length === 1, `${models.Patient._rows.length}`);

  section('WhatsApp never asks for a phone number');
  session = 'wa_919876543210';
  await say(session, 'hi');
  reply = await say(session, '1'); // English
  check('menu is offered', /Book New Appointment/.test((reply.options || []).join()), reply.options);

  reply = await say(session, '1'); // book
  check('sender number is used automatically', /Using your WhatsApp number/i.test(reply.flat), reply.flat);
  check('and the patient is recognised', /Welcome back/i.test(reply.flat), reply.flat);

  reply = await say(session, 'ghutne me dard');
  check('knee pain routes to Orthopedics', /Orthopedics/.test(reply.flat), reply.flat);

  reply = await say(session, '2'); // choose another doctor
  check('manual doctor list offered', /Select an available doctor/i.test(reply.flat), reply.flat);

  reply = await say(session, 'dr chen');
  check('loose doctor-name match books it', /Booking Complete/i.test(reply.flat), reply.flat);

  section('Global commands work in every state');
  session = 'web3';
  await say(session, 'hi');
  await say(session, 'English');
  await say(session, '1');
  reply = await say(session, 'help');
  check('help works mid-flow', /How to use/i.test(reply.flat), reply.flat);
  reply = await say(session, 'menu');
  check('menu returns to the main menu', /Main Menu/i.test(reply.flat), reply.flat);
  reply = await say(session, 'hi');
  check(
    'a greeting does not re-ask the language',
    !/select your preferred language/i.test(reply.flat),
    reply.flat
  );
  reply = await say(session, 'blah blah zzz');
  check('unrecognised input gets a friendly retry', /didn't quite get that/i.test(reply.flat), reply.flat);

  section('Hindi and emergency free text');
  session = 'web4';
  await say(session, 'restart');
  reply = await say(session, 'hindi');
  check('"hindi" selects Hindi', /स्वागत/.test(reply.flat), reply.flat);
  reply = await say(session, 'मुझे साँस लेने में तकलीफ है');
  check('Hindi red flag starts the emergency path', /मोबाइल नंबर/.test(reply.flat), reply.flat);

  section('WhatsApp can book at ANY registered facility');
  // A second facility, reachable only through the shared WhatsApp number.
  new models.Hospital({
    id: 'bright-dental',
    name: 'BrightDental Clinic',
    address: 'Station Road',
    city: 'Gaya',
    phone: '+910001',
    type: 'Clinic',
    whatsappNumber: '+917484043690'
  }).save();
  new models.Doctor({
    _id: 'docD',
    name: 'Dr. Neha Rao',
    department: 'Dental',
    currentRoom: 'Room 1',
    averageCheckupTime: 10,
    availabilityStatus: 'Available',
    hospital: 'bright-dental'
  }).save();

  // No hospitalId is passed — exactly what the shared WhatsApp number does.
  const waSay = async (sessionId, message) => {
    const result = await processChatMessage({ sessionId, message });
    return { ...result, flat: result.messages.map((m) => m.text).join(' | ') };
  };

  session = 'wa_919000000001';
  reply = await waSay(session, 'hi');
  check('"hi" lists the hospitals straight away', /Which hospital or clinic/i.test(reply.flat), reply.flat);
  check(
    'every registered facility is listed',
    /City General/.test(reply.flat) && /BrightDental/.test(reply.flat),
    reply.flat
  );

  reply = await waSay(session, 'gaya');
  check('search by city selects the facility', /BrightDental Clinic/.test(reply.flat), reply.flat);
  check(
    'language is asked after the facility, branded with it',
    /select your preferred language/i.test(reply.flat) && /BrightDental/.test(reply.flat),
    reply.flat
  );

  reply = await waSay(session, 'English');
  check('and the menu follows', /select an option/i.test(reply.flat), reply.flat);

  // New patient at this facility, so registration runs; the WhatsApp number is
  // taken automatically as always.
  reply = await waSay(session, 'daant me dard');
  check(
    'uses the WhatsApp number without asking',
    /Using your WhatsApp number/i.test(reply.flat),
    reply.flat
  );
  await waSay(session, 'Anil Kumar');
  await waSay(session, '30');
  reply = await waSay(session, 'male');
  check("routed to the CHOSEN facility's own doctor", /Neha Rao/.test(reply.flat), reply.flat);
  check('and to the right department', /Dental/.test(reply.flat), reply.flat);

  await waSay(session, 'yes');
  reply = await waSay(session, '15 minutes'); // travel time, asked once per patient
  check('token booked at the chosen facility', /Booking Complete/i.test(reply.flat), reply.flat);
  const dentalToken = models.Token._rows.find((t) => t.hospital === 'bright-dental');
  check(
    'token is stored against that facility',
    Boolean(dentalToken),
    models.Token._rows.map((t) => t.hospital)
  );
  // What makes the booking show up on the RIGHT reception desk: the facility the
  // patient picked, tagged as a remote WhatsApp arrival rather than a walk-in.
  check(
    'token is tagged as a WhatsApp arrival',
    dentalToken && dentalToken.bookingSource === 'WhatsApp',
    dentalToken && dentalToken.bookingSource
  );

  session = 'wa_919000000002';
  await waSay(session, 'hi');
  reply = await waSay(session, '2');
  check('numeric pick works', /BrightDental|City General/.test(reply.flat), reply.flat);

  reply = await waSay(session, 'hospital');
  check('HOSPITAL command reopens the picker', /Which hospital or clinic/i.test(reply.flat), reply.flat);

  // A returning patient greeting the shared number again gets the full list back —
  // they may want a different hospital today.
  reply = await waSay('wa_919000000001', 'hi');
  check('a later "hi" re-opens the hospital list', /Which hospital or clinic/i.test(reply.flat), reply.flat);
  check('with the last facility offered first', /BrightDental/.test(reply.flat), reply.flat);

  section('The web widget never sees the picker');
  session = 'web_facility';
  await say(session, 'hi');
  reply = await say(session, 'English');
  check(
    'a facility-scoped page goes straight to the menu',
    !/Which hospital/i.test(reply.flat) && /select an option/i.test(reply.flat),
    reply.flat
  );

  section('Every state the engine parks a patient in is a state the schema allows');

  // The bug this exists to prevent, in full: AWAITING_TRAVEL_TIME was added to
  // the state engine and not to the ChatSession enum. Nothing failed in
  // development, because the in-memory DB used by this very suite has no schema
  // — so the flow passed its tests, shipped, and stopped every booking at every
  // facility the moment a real MongoDB refused the save:
  //
  //   ChatSession validation failed: currentState: `AWAITING_TRAVEL_TIME`
  //   is not a valid enum value for path `currentState`.
  //
  // A schemaless test database cannot catch a schema mistake, so the check has
  // to be made against the source itself.
  {
    const fs = require('fs');
    // Read from the file rather than `require`-ing it: this suite replaces every
    // model in require.cache with an in-memory stand-in, so requiring the module
    // would hand back the fake — which is precisely the thing that cannot see a
    // schema. The list has to come from the schema's own source.
    const schemaSource = fs.readFileSync(path.join(BACKEND, 'models', 'ChatSession.js'), 'utf8');
    const declaration = schemaSource.match(/CHAT_STATES\s*=\s*\[([\s\S]*?)\]/);
    const CHAT_STATES = declaration ? [...declaration[1].matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]) : [];
    const engine = fs.readFileSync(path.join(BACKEND, 'routes', 'chat.js'), 'utf8');

    check('The schema declares a state list at all', CHAT_STATES.length >= 12, CHAT_STATES);

    // Every literal the engine assigns to currentState, however it is written.
    const assigned = new Set();
    for (const m of engine.matchAll(/currentState\s*=\s*'([A-Z_]+)'/g)) assigned.add(m[1]);
    for (const m of engine.matchAll(/currentState:\s*'([A-Z_]+)'/g)) assigned.add(m[1]);

    const missing = [...assigned].filter((state) => !CHAT_STATES.includes(state));

    check('The engine assigns at least a dozen states', assigned.size >= 12, `${assigned.size} found`);
    check(
      'Every state the engine writes is allowed by the schema',
      missing.length === 0,
      `missing from the ChatSession enum: ${missing.join(', ')}`
    );
    check('AWAITING_TRAVEL_TIME specifically', CHAT_STATES.includes('AWAITING_TRAVEL_TIME'), CHAT_STATES);
  }

  section('Unknown token is handled');
  session = 'web5';
  await say(session, 'hi');
  await say(session, 'English');
  await say(session, 'check status');
  reply = await say(session, 'T-999');
  check('unknown token reports not found', /not found/i.test(reply.flat), reply.flat);

  report();
})().catch((err) => {
  console.error('TEST HARNESS ERROR', err);
  process.exit(2);
});
