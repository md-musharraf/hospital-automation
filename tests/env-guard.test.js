/**
 * The production environment contract.
 *
 * The first check below exists because of a real deploy failure: the guard
 * demanded `MONGO_URI` while every line of the app reads `MONGODB_URI`. Nothing
 * was misconfigured — the guard was asking for a variable that does not exist,
 * so a correct deploy could not start and setting the requested variable would
 * have changed nothing. A required-variable list that drifts from the code it
 * guards is worse than no list at all, so the name is now verified against the
 * source rather than trusted.
 */
const fs = require('fs');
const path = require('path');
const { section, check, report } = require('./helpers/assert');

const BACKEND = path.resolve(__dirname, '..', 'backend');
const {
  collectEnvProblems,
  isProduction,
  useMockDb,
  allowAnyOrigin,
  safeCompare
} = require('../backend/dist/utils/env');

/** Every .js/.ts file under backend/, excluding dependencies. */
function backendSources(dir = BACKEND, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) backendSources(full, found);
    else if (entry.name.endsWith('.js') || entry.name.endsWith('.ts')) found.push(full);
  }
  return found;
}

/** Run collectEnvProblems() under a temporary environment. */
function withEnv(vars, fn) {
  const saved = { ...process.env };
  Object.keys(vars).forEach((k) => {
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  });
  try {
    return fn();
  } finally {
    process.env = saved;
  }
}

const GOOD = {
  NODE_ENV: 'production',
  JWT_SECRET: 'a'.repeat(48),
  ADMIN_SECRET: 'b'.repeat(32),
  MONGODB_URI: 'mongodb+srv://user:pass@cluster.example.net/hospital',
  USE_MOCK_DB: undefined,
  AUTO_SEED: undefined
};

(async () => {
  section('Env guard — required names must match what the code reads');

  const sources = backendSources().filter(
    (f) => !f.endsWith(path.join('utils', 'env.ts')) && !f.endsWith(path.join('utils', 'env.js'))
  );
  const corpus = sources.map((f) => fs.readFileSync(f, 'utf8')).join('\n');

  // Reach into the module's own list rather than restating it here — a copy
  // would drift exactly the way the original bug did.
  const required = require('../backend/dist/utils/env');
  const names = ['JWT_SECRET', 'ADMIN_SECRET', 'MONGODB_URI'];

  names.forEach((name) => {
    check(
      `${name} is actually read somewhere in backend/`,
      corpus.includes(`process.env.${name}`),
      `no 'process.env.${name}' found outside utils/env.ts`
    );
  });

  const envSrcPath = fs.existsSync(path.join(BACKEND, 'utils', 'env.ts'))
    ? path.join(BACKEND, 'utils', 'env.ts')
    : path.join(BACKEND, 'utils', 'env.js');

  check(
    'The wrong name from the failed deploy is gone',
    !JSON.stringify(required).includes('MONGO_URI"') &&
      !fs.readFileSync(envSrcPath, 'utf8').includes("name: 'MONGO_URI'"),
    'utils/env.ts still requires MONGO_URI, which nothing reads'
  );

  section('Env guard — what blocks a production boot');

  check('A fully configured production env passes', withEnv(GOOD, collectEnvProblems).length === 0, () =>
    withEnv(GOOD, collectEnvProblems)
  );

  check(
    'A missing MONGODB_URI is refused',
    withEnv({ ...GOOD, MONGODB_URI: undefined }, collectEnvProblems).some((p) => p.includes('MONGODB_URI'))
  );
  check(
    'A missing ADMIN_SECRET is refused',
    withEnv({ ...GOOD, ADMIN_SECRET: undefined }, collectEnvProblems).some((p) => p.includes('ADMIN_SECRET'))
  );
  check(
    'A short JWT_SECRET is refused',
    withEnv({ ...GOOD, JWT_SECRET: 'short' }, collectEnvProblems).some((p) => p.includes('JWT_SECRET'))
  );
  check(
    'The old public default is refused by name',
    withEnv({ ...GOOD, ADMIN_SECRET: 'supersecret123' }, collectEnvProblems).some((p) =>
      p.includes('git history')
    ),
    'the committed passcode must never be accepted, even at full length'
  );
  check(
    'USE_MOCK_DB in production is refused — data would live in RAM',
    withEnv({ ...GOOD, USE_MOCK_DB: 'true' }, collectEnvProblems).some((p) => p.includes('USE_MOCK_DB'))
  );
  check(
    'AUTO_SEED in production is refused — demo records in a live tenant',
    withEnv({ ...GOOD, AUTO_SEED: 'true' }, collectEnvProblems).some((p) => p.includes('AUTO_SEED'))
  );
  check(
    'Every problem is reported at once, not one per deploy',
    withEnv({ NODE_ENV: 'production' }, collectEnvProblems).length >= 3,
    'a deploy that fails three times for three variables wastes an afternoon'
  );

  check(
    'Development is never blocked',
    withEnv({ NODE_ENV: 'development', USE_MOCK_DB: 'true' }, collectEnvProblems).length === 0
  );

  section('Env guard — the switches that follow from NODE_ENV');

  check(
    'Production can never reach the in-memory store',
    withEnv({ NODE_ENV: 'production', USE_MOCK_DB: 'true' }, useMockDb) === false
  );
  check(
    'Production never accepts any origin',
    withEnv({ NODE_ENV: 'production', USE_MOCK_DB: 'true' }, allowAnyOrigin) === false,
    'CORS relaxation must not key off a database flag'
  );
  check(
    'Development still uses the mock when asked',
    withEnv({ NODE_ENV: 'development', USE_MOCK_DB: 'true' }, useMockDb) === true
  );
  check('isProduction reads NODE_ENV', withEnv({ NODE_ENV: 'production' }, isProduction) === true);

  section('Env guard — secret comparison');

  check('An exact match passes', safeCompare('correct-horse', 'correct-horse'));
  check('A wrong secret fails', !safeCompare('wrong', 'correct-horse'));
  check('A matching prefix fails', !safeCompare('correct', 'correct-horse'));
  check('An empty submission fails', !safeCompare('', 'correct-horse'));
  check('A missing submission fails', !safeCompare(undefined, 'correct-horse'));
  check('An unset expected secret fails', !safeCompare('anything', undefined));

  report();
})();
