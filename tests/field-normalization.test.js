/**
 * The duplicate-record bugs, proved dead.
 *
 * Two people could occupy four rows before this:
 *
 *   1. A doctor onboarded as `Rao@clinic.in` and later re-added as
 *      `rao@clinic.in`. The `seenDoctorEmails` Set, the `Doctor.findOne`, and
 *      the `{email, hospital}` unique index are all case-sensitive, so every
 *      guard passed and the facility got two cabins for one person.
 *   2. A patient who booked on WhatsApp (stored `+919876543210`, because the
 *      chat engine canonicalized) and then walked in (stored `98765 43210`,
 *      because reception did not). Two records, split visit history.
 *
 * The fix is schema-level: `Doctor.email` lower-cases and `Patient.phone`
 * canonicalizes on WRITE, so it cannot be bypassed by a route that forgets.
 * This suite runs against the REAL `backend/utils/mongooseMock.js` — not the
 * simplified test mock — because the mock previously applied defaults and
 * nothing else, which meant the schema declarations were silently inert under
 * `USE_MOCK_DB=true`. That is how this project is developed and how every other
 * suite runs, so mock and Mongo agreeing is part of the fix, not a detail.
 */
const path = require('path');
const Module = require('module');
const { section, check, report } = require('./helpers/assert');

// Install the real in-memory mock in place of mongoose BEFORE the models load,
// exactly as backend/index.js does when USE_MOCK_DB is on.
const { BACKEND_DIST: BACKEND } = require('./helpers/backendPath');
const mongooseMock = require(path.join(BACKEND, 'utils', 'mongooseMock'));

// `mongoose` lives in backend/node_modules, so it is not resolvable from
// tests/ — resolve it from the backend's own path, which is the same module
// identity the models will ask for.
const mongoosePath = require.resolve('mongoose', { paths: [BACKEND] });
const stub = new Module(mongoosePath, null);
stub.exports = mongooseMock;
stub.loaded = true;
require.cache[mongoosePath] = stub;

const Doctor = require(path.join(BACKEND, 'models', 'Doctor'));
const Patient = require(path.join(BACKEND, 'models', 'Patient'));
const BillingConfig = require(path.join(BACKEND, 'models', 'BillingConfig'));

/** Did this write throw a duplicate-key error? */
async function duplicateRejected(fn) {
  try {
    await fn();
    return false;
  } catch (e) {
    return e && e.code === 11000;
  }
}

(async () => {
  section('Doctor email — the case-sensitivity bug');

  const first = await new Doctor({
    name: 'Dr. Rao',
    email: 'Rao@Clinic.IN',
    department: 'General Medicine',
    currentRoom: 'Cabin 1',
    hospital: 'city-hospital'
  }).save();

  check('an email typed with capitals is STORED lower-cased', first.email === 'rao@clinic.in', first.email);

  const found = await Doctor.findOne({ email: 'rao@clinic.in', hospital: 'city-hospital' });
  check('the stored doctor is findable by the canonical address', Boolean(found));

  const rejected = await duplicateRejected(() =>
    new Doctor({
      name: 'Dr. Rao again',
      email: 'rao@CLINIC.in',
      department: 'General Medicine',
      currentRoom: 'Cabin 2',
      hospital: 'city-hospital'
    }).save()
  );
  check('the same address in different case is refused as a duplicate', rejected === true);

  const otherTenant = await new Doctor({
    name: 'Dr. Rao elsewhere',
    email: 'RAO@clinic.in',
    department: 'General Medicine',
    currentRoom: 'Cabin 1',
    hospital: 'apex-clinic'
  }).save();
  check(
    'the same address at a DIFFERENT facility is still allowed',
    otherTenant.email === 'rao@clinic.in',
    otherTenant.email
  );

  section('Doctor email — normalization survives a mutate-then-save');

  const editable = await Doctor.findOne({ email: 'rao@clinic.in', hospital: 'apex-clinic' });
  editable.email = '  NewAddress@Clinic.IN  ';
  await editable.save();
  check(
    'assigning a raw value and saving still normalizes it',
    editable.email === 'newaddress@clinic.in',
    editable.email
  );

  section('Patient phone — the split-history bug');

  const booked = await new Patient({
    name: 'Ram Kumar',
    age: 61,
    gender: 'Male',
    phone: '+91 98765 43210',
    hospital: 'city-hospital'
  }).save();
  check('a spaced number is stored canonically', booked.phone === '+919876543210', booked.phone);

  const walkInRejected = await duplicateRejected(() =>
    new Patient({
      name: 'Ram Kumar',
      age: 61,
      gender: 'Male',
      phone: '9876543210',
      hospital: 'city-hospital'
    }).save()
  );
  check(
    'the same number typed bare is recognised as the SAME patient, not a new one',
    walkInRejected === true
  );

  const zeroPrefixRejected = await duplicateRejected(() =>
    new Patient({
      name: 'Ram Kumar',
      age: 61,
      gender: 'Male',
      phone: '09876543210',
      hospital: 'city-hospital'
    }).save()
  );
  check('a 0-prefixed spelling is also recognised as the same patient', zeroPrefixRejected === true);

  const differentFacility = await new Patient({
    name: 'Ram Kumar',
    age: 61,
    gender: 'Male',
    phone: '9876543210',
    hospital: 'apex-clinic'
  }).save();
  check(
    'the same person at another facility is still a separate record',
    differentFacility.phone === '+919876543210'
  );

  section('Patient age — stored as a number, not the string that was posted');

  const posted = await new Patient({
    name: 'Sita Devi',
    age: '34',
    gender: 'Female',
    phone: '9000000001',
    hospital: 'city-hospital'
  }).save();
  check(
    'an age posted as a string is stored as a number',
    posted.age === 34 && typeof posted.age === 'number',
    {
      value: posted.age,
      type: typeof posted.age
    }
  );
  check('a stored age compares correctly against a number', posted.age > 30 && posted.age < 40, posted.age);

  section('Name — trimmed by the schema, as it always claimed to be');

  const spaced = await new Patient({
    name: '  Ravi  Shankar  ',
    age: 40,
    gender: 'Male',
    phone: '9000000002',
    hospital: 'city-hospital'
  }).save();
  check('a name with surrounding whitespace is trimmed', spaced.name === 'Ravi  Shankar', spaced.name);

  section('Billing letterhead — optional fields stay optional');

  const config = await new BillingConfig({
    hospital: 'city-hospital',
    phone: '  98765 43210 ',
    gstin: '22aaaaa0000a1z5'
  }).save();
  check('a letterhead phone is canonicalized', config.phone === '+919876543210', config.phone);
  check('a GSTIN is upper-cased', config.gstin === '22AAAAA0000A1Z5', config.gstin);

  const blank = await new BillingConfig({ hospital: 'apex-clinic' }).save();
  check('an unset letterhead phone stays empty rather than becoming null', blank.phone === '', blank.phone);

  report();
})();
