/**
 * Personal sign-in — one person, one console.
 *
 * The facility password stays: a clinic that keeps one password on the front
 * desk is unaffected. This adds a second, NARROWER door — a named person who
 * reaches exactly one console — and the value of it is entirely in that
 * narrowness. So the properties worth pinning down are the ones that would
 * quietly give a personal token more than it should have:
 *
 *   1. A personal token must carry ONE scope. The whole point is that a
 *      receptionist cannot reach the pharmacy API; if the token inherited the
 *      facility's full scope list, a personal login would be strictly worse than
 *      the shared one — same power, plus a second credential to leak.
 *   2. The lookup must be scoped to the facility being signed into. Emails are
 *      unique per TENANT, not globally, so the same address can exist at two
 *      hospitals and an unscoped query would sign someone into the wrong one.
 *   3. The password hash must actually be read. `passwordHash` is `select:false`
 *      on all four schemas, and — this is the trap — the in-memory mock ignores
 *      `.select()` completely. A route missing `+passwordHash` therefore passes
 *      every database-backed test here and fails on the real Mongoose in
 *      production. That one is asserted against the source.
 *   4. A doctor's cabin must come from who they are, not from a posted id.
 */
const fs = require('fs');
const path = require('path');
const { section, check, report } = require('./helpers/assert');

const { BACKEND_DIST: BACKEND } = require('./helpers/backendPath');
const {
  personTokenClaims,
  rejectWeakPersonPassword,
  PERSON_ROLES,
  PERSON_PASSWORD_MIN_LENGTH,
  scopesForFacility
} = require(path.join(BACKEND, 'utils', 'facilityAuth'));

const authRoute = fs.readFileSync(path.join(BACKEND, 'routes', 'auth.js'), 'utf8');

(async () => {
  section('A personal token reaches exactly one console');

  const receptionist = { _id: 'staff-1', name: 'Alice Smith' };
  const staffClaims = personTokenClaims(receptionist, 'staff', 'city-hospital');

  check('the token names the tenant', staffClaims.hospital === 'city-hospital');
  check('the role is the console, not "facility"', staffClaims.role === 'staff');
  check('exactly one scope is carried', staffClaims.scopes.length === 1 && staffClaims.scopes[0] === 'staff');
  check(
    'a receptionist carries no doctor scope',
    !staffClaims.scopes.includes('doctor'),
    'this is the entire reason a personal login is worth having'
  );
  check('no pharmacy scope either', !staffClaims.scopes.includes('pharmacy'));
  check('the person is identified for the activity log', staffClaims.personId === 'staff-1');
  check(
    'the token carries no credential material',
    !JSON.stringify(staffClaims).toLowerCase().includes('password')
  );

  section("A doctor's cabin comes from who signed in");

  const doctor = { _id: 'doc-9', name: 'Dr. Rao' };
  const docClaims = personTokenClaims(doctor, 'doctor', 'city-hospital');

  check('the cabin is set at sign-in', docClaims.actingDoctor === 'doc-9');
  check(
    '...and it is the doctor themselves, never a posted id',
    docClaims.actingDoctor === String(doctor._id),
    'the facility flow picks a cabin from a roster; a doctor already answered that by logging in'
  );
  check('a receptionist gets no cabin at all', staffClaims.actingDoctor === undefined);
  check(
    'a lab tech gets no cabin',
    personTokenClaims({ _id: 'l1', name: 'L' }, 'lab', 'h').actingDoctor === undefined
  );

  section('Every role a person can hold is one the guards understand');

  const scopes = PERSON_ROLES.map((r) => r.scope);
  for (const expected of ['staff', 'doctor', 'lab', 'pharmacy']) {
    check(`${expected} is a signable role`, scopes.includes(expected));
  }
  check('no role exists that no console serves', scopes.length === 4);
  check(
    'each role names the collection it lives in',
    PERSON_ROLES.every((r) => ['Staff', 'Doctor', 'LabAssistant', 'Pharmacist'].includes(r.model))
  );

  section('Personal passwords have a floor, but a lower one than a facility');

  check('an absent password is refused', Boolean(rejectWeakPersonPassword(undefined)));
  check('an empty password is refused', Boolean(rejectWeakPersonPassword('   ')));
  check(
    'a short password is refused',
    Boolean(rejectWeakPersonPassword('abc123')),
    `minimum is ${PERSON_PASSWORD_MIN_LENGTH}`
  );
  check('a guessable one is refused despite its length', Boolean(rejectWeakPersonPassword('password1234')));
  check('"admin" prefixed is refused', Boolean(rejectWeakPersonPassword('admin12345')));
  check('a reasonable personal password is accepted', rejectWeakPersonPassword('reception-9f2x') === null);
  check(
    'it is lower than the facility bar, on purpose',
    PERSON_PASSWORD_MIN_LENGTH < 12,
    'typed at the start of every shift; an painful rule produces one password on a sticky note for the department'
  );

  section('The sign-in route reads the hash the schema hides');

  check(
    'the login route asks for +passwordHash explicitly',
    /\.select\('\+passwordHash'\)/.test(authRoute),
    'passwordHash is select:false on all four schemas — without this every sign-in fails in production, ' +
      'and the in-memory mock ignores .select() so no other test here can catch it'
  );

  section('The lookup cannot cross a tenant');

  check(
    'the person is looked up by email AND hospital',
    /findOne\(\{\s*email:\s*normalized,\s*hospital\s*\}\)/.test(authRoute),
    'emails are unique per tenant, so an unscoped lookup signs someone into the wrong facility'
  );
  check(
    'setting a password is scoped to the facility too',
    /_id:\s*personId,\s*hospital:\s*id/.test(authRoute),
    'an id from another tenant must not be a way to set somebody else’s password'
  );

  section('Both doors exist, and both are rate-limited');

  check(
    'the facility password still works',
    /router\.post\('\/facility\/login', loginLimiter/.test(authRoute),
    'adding personal logins must not take away the credential live facilities are using'
  );
  check(
    'the personal login exists',
    /router\.post\('\/login', loginLimiter/.test(authRoute),
    'and is rate-limited, because an email address is a guessable half of the secret'
  );
  for (const removed of ['/doctor/login', '/staff/login', '/lab/login', '/pharmacy/login']) {
    check(
      `${removed} is still gone`,
      !new RegExp(`router\\.post\\('${removed}'`).test(authRoute),
      'one login route resolves the role from the person, rather than four routes naming it'
    );
  }

  section('A person cannot reach a console their facility does not run');

  const pathologyLab = { id: 'apex-labs', type: 'Lab', modules: { lab: { enabled: true } } };
  const labScopes = scopesForFacility(pathologyLab);
  check('a lab facility runs a lab', labScopes.includes('lab'));
  check('...and no OPD', !labScopes.includes('doctor'));
  check(
    'so a doctor account there is refused at sign-in',
    !labScopes.includes('doctor'),
    'the route checks the facility’s scopes before minting the token'
  );
  check(
    'the route performs that check',
    /facilityScopes\.includes\(found\.scope\)/.test(authRoute),
    'someone may hold a lab account at a facility whose lab was later switched off'
  );

  section('A wrong email and a wrong password are indistinguishable');

  const invalidCount = (authRoute.match(/Invalid email or password\./g) || []).length;
  check(
    'every failure path returns the same sentence',
    invalidCount >= 4,
    `found ${invalidCount} — unknown address, missing hash and wrong password must not be tellable apart, ` +
      'or the response confirms who works where'
  );

  report();
})();
