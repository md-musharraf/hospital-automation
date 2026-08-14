/**
 * The normalization contract.
 *
 * This suite exists because two real bugs were shipped, and both were "we
 * validated it but stored what was typed":
 *
 *   - `Doctor.findOne({ email })`, the `seenDoctorEmails` Set in
 *     register-hospital and the `{email, hospital}` unique index are all
 *     case-sensitive, so `Rao@clinic.in` and `rao@clinic.in` became two
 *     doctors, one person, two queues.
 *   - The chat engine canonicalized phone numbers to `+91XXXXXXXXXX`; reception
 *     and billing stored whatever was typed. The same patient booking on
 *     WhatsApp and walking in got two records and a split visit history.
 *
 * The rule these tests defend: anything that identifies a person has exactly
 * one stored form, and it is produced by this module and nowhere else.
 */
const { section, check, report } = require('./helpers/assert');
const {
  normalizeEmail,
  normalizePhone,
  normalizeName,
  phoneVariants,
  formatPhoneForDisplay,
  toInt,
  toMoney,
  parseEnum,
  field,
  parseBody
} = require('../shared/dist');

(async () => {
  section('Email — one stored form regardless of how it was typed');

  const CASINGS = ['rao@clinic.in', 'Rao@Clinic.in', 'RAO@CLINIC.IN', '  RaO@ClInIc.In  '];
  const normalized = CASINGS.map(normalizeEmail);
  check(
    'every casing of one address normalizes to the same value',
    new Set(normalized).size === 1 && normalized[0] === 'rao@clinic.in',
    normalized
  );
  check('surrounding whitespace is removed', normalizeEmail('  a@b.co  ') === 'a@b.co');
  check('a missing @ is refused', normalizeEmail('rao.clinic.in') === null);
  check('a missing domain dot is refused', normalizeEmail('rao@clinic') === null);
  check('an inner space is refused', normalizeEmail('ra o@clinic.in') === null);
  check('empty is refused', normalizeEmail('') === null);
  check('null is refused rather than crashing', normalizeEmail(null) === null);
  check('a plus-addressed mailbox is accepted', normalizeEmail('rao+opd@clinic.in') === 'rao+opd@clinic.in');
  check('a subdomain is accepted', normalizeEmail('a@mail.clinic.co.in') === 'a@mail.clinic.co.in');

  section('Phone — the same number typed six ways is one record');

  const SAME_NUMBER = [
    '9876543210',
    '98765 43210',
    '+91 98765 43210',
    '+919876543210',
    '919876543210',
    '09876543210'
  ];
  const phones = SAME_NUMBER.map(normalizePhone);
  check(
    'all six spellings collapse to one canonical form',
    new Set(phones).size === 1 && phones[0] === '+919876543210',
    phones
  );
  check('the canonical form is what the chat engine already wrote', phones[0] === '+919876543210');
  check('junk with no digits is refused', normalizePhone('not a phone') === null);
  check('too few digits is refused', normalizePhone('12345') === null);
  check('too many digits is refused', normalizePhone('1234567890123456') === null);
  check('empty is refused', normalizePhone('') === null);
  check('null is refused rather than echoed back', normalizePhone(null) === null);
  check(
    'a non-Indian number keeps its own country code',
    normalizePhone('+1 415 555 0134') === '+14155550134',
    normalizePhone('+1 415 555 0134')
  );

  section('Phone — lookup still finds records written before canonicalization');

  const variants = phoneVariants('+91 98765 43210');
  check('the canonical form is among the variants', variants.includes('+919876543210'));
  check('a bare 10-digit legacy row is still found', variants.includes('9876543210'));
  check('a 0-prefixed legacy row is still found', variants.includes('09876543210'));
  check('a no-plus legacy row is still found', variants.includes('919876543210'));
  check('variants are de-duplicated', new Set(variants).size === variants.length);
  check('an empty input produces no variants', phoneVariants('').length === 0);

  section('Phone — display formatting never becomes the stored form');

  check('a +91 number is grouped for reading', formatPhoneForDisplay('+919876543210') === '+91 98765 43210');
  check(
    'display formatting is not reversible into storage by accident',
    normalizePhone(formatPhoneForDisplay('+919876543210')) === '+919876543210'
  );

  section('Names — trimmed and collapsed');

  check('leading and trailing space is removed', normalizeName('  Ram Kumar  ') === 'Ram Kumar');
  check('runs of inner whitespace collapse', normalizeName('Ram   Kumar') === 'Ram Kumar');
  check('a tab counts as whitespace', normalizeName('Ram\tKumar') === 'Ram Kumar');

  section('Numbers — what parseInt got wrong');

  check('a clean integer parses', toInt('42') === 42);
  check('a real number passes through', toInt(42) === 42);
  check("'12abc' is refused where parseInt returned 12", toInt('12abc') === null);
  check("'' is refused where parseInt returned NaN", toInt('') === null);
  check('null is refused', toInt(null) === null);
  check('true is refused where Number(true) returned 1', toInt(true) === null);
  check('a decimal is refused when a whole number is required', toInt('3.5') === null);
  check('a value under the minimum is refused', toInt('0', { min: 1, max: 130 }) === null);
  check('a value over the maximum is refused', toInt('131', { min: 1, max: 130 }) === null);
  check('a value inside the range is accepted', toInt('61', { min: 1, max: 130 }) === 61);
  check('a negative is parsed when no minimum is set', toInt('-5') === -5);

  section('Money — a number, never a string');

  check('a whole amount parses', toMoney('250') === 250);
  check('paise are kept', toMoney('250.50') === 250.5);
  check('a pasted rate-card value is tolerated', toMoney('₹1,200.50') === 1200.5);
  check('the result is a number, not a string', typeof toMoney('250.50') === 'number');
  check('rounding is to two places', toMoney(10.005) === 10.01, toMoney(10.005));
  check('a negative amount is refused', toMoney('-5') === null);
  check('junk is refused', toMoney('free') === null);

  section('Enums — matched case-insensitively, stored in schema casing');

  const GENDERS = ['Male', 'Female', 'Other'];
  const lower = parseEnum('male', GENDERS, 'Gender');
  check('lower case input matches', lower.ok === true && lower.value === 'Male', lower);
  check('the value returned is the schema casing', lower.ok && lower.value === 'Male');
  const bad = parseEnum('man', GENDERS, 'Gender');
  check('an unknown value is refused', bad.ok === false);
  check('the refusal lists the allowed values', !bad.ok && bad.error.includes('Male, Female, Other'), bad);

  section('parseBody — a walk-in, normalized in one call');

  const walkInSpec = {
    name: field.name({ label: 'Patient name' }),
    age: field.int({ min: 1, max: 130 }),
    gender: field.enum(['Male', 'Female', 'Other']),
    phone: field.phone(),
    symptoms: field.text({ max: 1000 }),
    doctorId: field.id({ required: false })
  };

  const messy = parseBody(
    {
      name: '  Ram   Kumar ',
      age: '61',
      gender: 'male',
      phone: '098765 43210',
      symptoms: '  fever and headache  '
    },
    walkInSpec
  );

  check('a messy but valid body is accepted', messy.ok === true, messy);
  check('the name is collapsed', messy.ok && messy.value.name === 'Ram Kumar');
  check('the age is a number, not a string', messy.ok && messy.value.age === 61);
  check('the gender is canonically cased', messy.ok && messy.value.gender === 'Male');
  check('the phone is canonical', messy.ok && messy.value.phone === '+919876543210');
  check('the symptoms are trimmed', messy.ok && messy.value.symptoms === 'fever and headache');
  check(
    'an absent optional field is left absent, not set to undefined',
    messy.ok && !('doctorId' in messy.value),
    messy.ok ? Object.keys(messy.value) : messy
  );

  section('parseBody — every problem reported at once');

  const broken = parseBody({ name: 'R', age: '200', gender: 'man', phone: '123', symptoms: '' }, walkInSpec);
  check('an invalid body is refused', broken.ok === false);
  check(
    'all five bad fields are reported together',
    !broken.ok && Object.keys(broken.errors).length === 5,
    !broken.ok ? broken.errors : broken
  );
  check('the single-message field carries the first problem', !broken.ok && Boolean(broken.error));
  check(
    'the label given in the spec is used in the message',
    !broken.ok && broken.errors.name.startsWith('Patient name'),
    !broken.ok ? broken.errors.name : null
  );
  check(
    'a field name is humanized when no label is given',
    !broken.ok && broken.errors.age.startsWith('Age'),
    !broken.ok ? broken.errors.age : null
  );

  section('parseBody — a missing body does not crash');

  const empty = parseBody(undefined, walkInSpec);
  check('undefined is treated as an empty body', empty.ok === false);
  check('a string body is treated as an empty body', parseBody('nope', walkInSpec).ok === false);

  report();
})();
