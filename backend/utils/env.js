/**
 * The environment contract, checked once at boot.
 *
 * Three settings used to fail silently, and all three were dangerous the moment
 * a real facility depended on this server:
 *
 *   - ADMIN_SECRET, when unset, fell back to a passcode written in this
 *     repository. Anyone who read the source could register facilities.
 *   - USE_MOCK_DB=true swapped the database for an in-memory mock, so a restart
 *     erased the day's tokens, invoices and patients without an error anywhere.
 *   - That same flag also switched CORS from an allow-list to "accept every
 *     origin", because the relaxation for local development keyed off it.
 *
 * None of these announced themselves. The process booted, answered health
 * checks, and served traffic while being unsafe. So the contract is asserted
 * here instead: a production process that cannot satisfy it refuses to start,
 * which is the failure a human notices immediately.
 */

const crypto = require('crypto');

const isProduction = () => process.env.NODE_ENV === 'production';

/**
 * Whether to run against the in-memory store.
 *
 * Production can never reach it, whatever the variable says. The flag exists so
 * this project runs on a laptop that cannot reach Atlas — that is a development
 * convenience, and a convenience must not be one typo away from serving a
 * hospital from RAM.
 */
const useMockDb = () => !isProduction() && process.env.USE_MOCK_DB === 'true';

/**
 * Whether CORS should accept any origin.
 *
 * Deliberately keyed off NODE_ENV alone. It used to also key off USE_MOCK_DB,
 * which meant one unrelated database flag could open the API to every origin on
 * the internet.
 */
const allowAnyOrigin = () => !isProduction();

/** Secrets that must be present, and long enough to be worth having. */
const REQUIRED_IN_PRODUCTION = [
  { name: 'JWT_SECRET', minLength: 32 },
  { name: 'ADMIN_SECRET', minLength: 16 },
  { name: 'MONGO_URI', minLength: 1 }
];

/**
 * Values that once shipped as fallbacks in this codebase. They are in the git
 * history, so they are public — refusing them by name stops the most likely
 * mistake, which is pasting the old default into the hosting dashboard.
 */
const BANNED_VALUES = new Set(['supersecret123', 'secret', 'changeme', 'admin', 'password']);

/**
 * Validate the environment. Returns the problems rather than throwing, so the
 * caller can report all of them at once — a deploy that fails three times for
 * three separate missing variables wastes an afternoon.
 */
function collectEnvProblems() {
  const problems = [];

  if (!isProduction()) {
    return problems;
  }

  if (process.env.USE_MOCK_DB === 'true') {
    problems.push(
      'USE_MOCK_DB=true is set in production. The in-memory store keeps every ' +
        'patient, token and invoice in RAM and loses all of it on restart. Remove ' +
        'this variable from the production environment.'
    );
  }

  for (const { name, minLength } of REQUIRED_IN_PRODUCTION) {
    const value = process.env[name];

    if (!value) {
      problems.push(`${name} is not set.`);
      continue;
    }
    if (value.length < minLength) {
      problems.push(`${name} is shorter than ${minLength} characters — generate a stronger value.`);
    }
    if (BANNED_VALUES.has(value.toLowerCase())) {
      problems.push(
        `${name} is set to a value that was once a hardcoded default in this repository. ` +
          'It is public in the git history. Rotate it.'
      );
    }
  }

  return problems;
}

/**
 * Assert the contract, or exit.
 *
 * Called before anything else in index.js — including the mongoose mock swap —
 * so an unsafe production process never reaches the point of accepting a
 * request.
 */
function assertEnvironment() {
  const problems = collectEnvProblems();
  if (problems.length === 0) return;

  console.error('\nFATAL: this server cannot start safely in production.\n');
  problems.forEach((problem, i) => console.error(`  ${i + 1}. ${problem}`));
  console.error('\nFix the environment variables in your hosting dashboard and redeploy.\n');
  process.exit(1);
}

/**
 * Compare a submitted secret against the expected one without leaking its
 * length or its matching prefix through timing.
 *
 * Both sides are hashed first so `timingSafeEqual` always receives two buffers
 * of the same size — it throws on a length mismatch, and that throw would
 * itself be the timing signal we are trying to remove.
 */
function safeCompare(submitted, expected) {
  if (typeof submitted !== 'string' || typeof expected !== 'string') return false;
  if (!submitted || !expected) return false;

  const digest = (value) => crypto.createHash('sha256').update(value).digest();
  return crypto.timingSafeEqual(digest(submitted), digest(expected));
}

module.exports = {
  isProduction,
  useMockDb,
  allowAnyOrigin,
  assertEnvironment,
  collectEnvProblems,
  safeCompare
};
