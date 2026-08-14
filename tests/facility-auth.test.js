/**
 * One login per facility.
 *
 * The platform used to issue four credentials per tenant — reception, doctor,
 * lab, pharmacy — and a four-person clinic kept all four on one sticky note.
 * There is one facility password now, and what it can reach is decided by the
 * facility's own module map rather than by which of four passwords was typed.
 *
 * Three things have to hold for that to be safe, and all three are the kind
 * that fail silently:
 *
 *   1. A facility's token must not reach a console it does not run. When the
 *      lab had its own password, a pathology-lab-only tenant simply had no
 *      doctor account; now every tenant signs in through the same door, so the
 *      scope list is the only thing standing between a lab and the cabin API.
 *   2. A facility must not be able to act as another facility's doctor. The
 *      cabin is chosen by id from the client — believe it without a tenant
 *      check and it becomes a way to run any cabin on the platform.
 *   3. No default password may exist anywhere. A shared fallback is the whole
 *      platform's skeleton key, and it is never rotated.
 *
 * Runs without a database or a server: the decisions live in pure functions and
 * one middleware, which is the part worth pinning down.
 */
const fs = require('fs');
const path = require('path');
const { section, check, report } = require('./helpers/assert');

const {
  scopesForFacility,
  rejectWeakPassword,
  facilityTokenClaims,
  PASSWORD_MIN_LENGTH
} = require('../backend/dist/utils/facilityAuth');

// middleware/auth.js refuses to load without a secret, and generating one per
// run is exactly what it does for development anyway.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-not-used-for-signing-here';
const { ensureRole } = require('../backend/dist/middleware/auth');

/** Capture what a middleware did instead of letting it talk to a socket. */
function runGuard(guard, user) {
  const result = { status: null, body: null, passed: false };
  const res = {
    status(code) {
      result.status = code;
      return res;
    },
    json(payload) {
      result.body = payload;
      return res;
    }
  };
  guard({ user }, res, () => {
    result.passed = true;
  });
  return result;
}

const hospitalWith = (modules, type = 'Hospital') => ({ id: 'h1', name: 'Test Facility', type, modules });

(async () => {
  section('A facility reaches exactly the consoles it runs');

  const fullHospital = hospitalWith({
    staffDesk: { enabled: true },
    opd: { enabled: true },
    lab: { enabled: true },
    pharmacy: { enabled: true }
  });
  check(
    'a full hospital opens all four rooms',
    JSON.stringify(scopesForFacility(fullHospital)) ===
      JSON.stringify(['staff', 'doctor', 'lab', 'pharmacy']),
    scopesForFacility(fullHospital)
  );

  const pathologyLab = hospitalWith({ staffDesk: { enabled: true }, lab: { enabled: true } }, 'Lab');
  const labScopes = scopesForFacility(pathologyLab);
  check('a pathology lab gets its bench', labScopes.includes('lab'), labScopes);
  check('a pathology lab gets NO cabin', !labScopes.includes('doctor'), labScopes);
  check('a pathology lab gets NO pharmacy', !labScopes.includes('pharmacy'), labScopes);

  const medicalStore = hospitalWith({ staffDesk: { enabled: true }, pharmacy: { enabled: true } }, 'Medical');
  const storeScopes = scopesForFacility(medicalStore);
  check('a medical store gets its counter', storeScopes.includes('pharmacy'), storeScopes);
  check('a medical store gets NO lab bench', !storeScopes.includes('lab'), storeScopes);

  // Facilities onboarded before the module map exists have `modules: {}`. They
  // are pre-module, not scope-less — reading them as "runs nothing" would lock
  // an existing tenant out of its own lab on the day this shipped.
  const legacy = { id: 'old', name: 'Legacy', type: 'Hospital', modules: {}, hasInternalLab: true };
  const legacyScopes = scopesForFacility(legacy);
  check('a pre-module facility is not locked out', legacyScopes.length > 0, legacyScopes);
  check('a pre-module facility keeps its lab', legacyScopes.includes('lab'), legacyScopes);

  // Every facility admits patients, whatever its module map says. A tenant that
  // can sign in but cannot register a walk-in is not an operable tenant.
  check(
    'reception is never missing',
    scopesForFacility(hospitalWith({ lab: { enabled: true } }, 'Lab')).includes('staff'),
    scopesForFacility(hospitalWith({ lab: { enabled: true } }, 'Lab'))
  );
  check('a missing facility yields no scopes at all', scopesForFacility(null).length === 0);

  section('The route guard honours those scopes');

  const labSession = { role: 'facility', hospital: 'lab1', scopes: ['staff', 'lab'] };

  check('the lab bench opens for a lab facility', runGuard(ensureRole('lab'), labSession).passed);
  check('reception opens for a lab facility', runGuard(ensureRole('staff'), labSession).passed);

  const refusedCabin = runGuard(ensureRole('doctor'), labSession);
  check('the cabin API is closed to a facility with no OPD', !refusedCabin.passed);
  check('...and refuses with 403', refusedCabin.status === 403, refusedCabin);
  check(
    '...and says why, so the owner knows to switch the module on',
    /does not run a doctor unit/.test(refusedCabin.body.message),
    refusedCabin.body
  );

  const pharmacyOnly = { role: 'facility', hospital: 'store1', scopes: ['staff', 'pharmacy'] };
  check('the pharmacy counter is closed to a lab', !runGuard(ensureRole('pharmacy'), labSession).passed);
  check('the lab bench is closed to a medical store', !runGuard(ensureRole('lab'), pharmacyOnly).passed);

  // A route guarding several consoles is satisfied by holding any one of them.
  check(
    'a multi-console route accepts any one of its scopes',
    runGuard(ensureRole('doctor', 'lab'), labSession).passed
  );

  // A token with no scopes array at all — hand-edited, or minted by an older
  // build — must be refused rather than treated as unrestricted.
  const scopeless = { role: 'facility', hospital: 'h1' };
  check('a token with no scopes reaches nothing', !runGuard(ensureRole('staff'), scopeless).passed);

  section('The session token carries the tenant and its scopes');

  const claims = facilityTokenClaims(fullHospital);
  check('the token names the tenant', claims.hospital === 'h1', claims);
  check('the token says it is a facility session', claims.role === 'facility', claims);
  check(
    'the token carries the scope list',
    Array.isArray(claims.scopes) && claims.scopes.length === 4,
    claims
  );
  check(
    'the token carries no credential material',
    !('password' in claims) && !('passwordHash' in claims),
    Object.keys(claims)
  );

  section('No password is accepted that would end up shared or guessed');

  check('an absent password is refused', rejectWeakPassword(undefined) !== null);
  check('an empty password is refused', rejectWeakPassword('   ') !== null);
  check('a short password is refused', rejectWeakPassword('abc123') !== null);
  check(
    `the minimum length is stated in the refusal (${PASSWORD_MIN_LENGTH})`,
    rejectWeakPassword('abc123').includes(String(PASSWORD_MIN_LENGTH)),
    rejectWeakPassword('abc123')
  );

  // Length alone still admits the ones people actually type when filling a
  // required field rather than choosing a secret.
  for (const guessable of ['password1234', 'hospital2024', 'admin1234567', '123456789012', 'Welcome123456']) {
    check(`'${guessable}' is refused despite being long enough`, rejectWeakPassword(guessable) !== null);
  }

  check('a real phrase is accepted', rejectWeakPassword('purple-tractor-mango-91') === null);

  section('No default password exists anywhere in the source');

  // The failure this prevents is not subtle, it is just easy: someone adds a
  // convenience default to unblock a local run, and it ships. A grep is a blunt
  // instrument and exactly the right one here.
  const { BACKEND_DIST: BACKEND } = require('./helpers/backendPath');
  const sources = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) sources.push(full);
    }
  })(BACKEND);

  // Two kinds of match are not defaults and must not be flagged, or the check
  // becomes noise someone learns to skip: a comment explaining why the default
  // is gone, and env.js's list of values it REFUSES to accept.
  const isDocumentation = (line) => /^\s*(\/\/|\*|\/\*)/.test(line);
  const isDenyList = (line) => /BANNED|FORBIDDEN|REJECT|WEAK|isWeak/i.test(line);

  const offenders = sources.filter((file) =>
    fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .some(
        (line) => /password123|['"]changeme['"]/i.test(line) && !isDocumentation(line) && !isDenyList(line)
      )
  );
  check(
    'no seeded or fallback password is hardcoded in the backend',
    offenders.length === 0,
    offenders.map((f) => path.relative(BACKEND, f))
  );

  // The seeds are the likeliest place for one to reappear, so they are checked
  // by name rather than only by the sweep above.
  for (const file of ['seed.js', 'index.js']) {
    const body = fs.readFileSync(path.join(BACKEND, file), 'utf8');
    check(
      `${file} generates or reads its facility password rather than hardcoding one`,
      !/password123/.test(body) && /SEED_FACILITY_PASSWORD/.test(body),
      file
    );
  }

  section('A facility can only act as its own doctors');

  // The cabin is chosen client-side, so the tenant check in
  // routes/doctor.js#resolveActingDoctor is the only thing preventing one
  // facility from running another's cabin. Assert the query it issues is scoped
  // by hospital — a `findOne({ _id })` here would be the whole bug.
  const doctorRoute = fs.readFileSync(path.join(BACKEND, 'routes', 'doctor.js'), 'utf8');
  check(
    'the acting-doctor lookup is scoped to the tenant',
    /Doctor\.findOne\(\{\s*_id:\s*actingId,\s*hospital:\s*req\.user\.hospital\s*\}\)/.test(doctorRoute),
    'resolveActingDoctor must filter by hospital, not by _id alone'
  );
  check(
    'a request with no cabin chosen is refused rather than defaulted',
    /ACTING_DOCTOR_REQUIRED/.test(doctorRoute)
  );

  const authRoute = fs.readFileSync(path.join(BACKEND, 'routes', 'auth.js'), 'utf8');
  check(
    'minting a cabin token re-checks the tenant',
    /Doctor\.findOne\(\{\s*_id:\s*doctorId,\s*hospital:\s*req\.user\.hospital\s*\}\)/.test(authRoute),
    'POST /auth/facility/cabin must not trust the posted doctorId'
  );

  section('The retired per-role logins are gone');

  for (const removed of ['/doctor/login', '/staff/login', '/lab/login', '/pharmacy/login']) {
    check(
      `${removed} no longer exists`,
      !new RegExp(`router\\.post\\('${removed}'`).test(authRoute),
      `${removed} is still registered — there should be exactly one login`
    );
  }
  check(
    'the one facility login exists',
    /router\.post\('\/facility\/login'/.test(authRoute),
    'POST /auth/facility/login is the only sign-in route'
  );
  check(
    'the facility login is rate-limited',
    /router\.post\('\/facility\/login', loginLimiter/.test(authRoute),
    'the facility id is public, so the password is the whole secret'
  );

  report();
})();
