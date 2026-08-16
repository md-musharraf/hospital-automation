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

import crypto from 'crypto';

export const isProduction = (): boolean => process.env.NODE_ENV === 'production';

/**
 * Whether to run against the in-memory store.
 *
 * Production can never reach it, whatever the variable says. The flag exists so
 * this project runs on a laptop that cannot reach Atlas — that is a development
 * convenience, and a convenience must not be one typo away from serving a
 * hospital from RAM.
 */
export const useMockDb = (): boolean => !isProduction() && process.env.USE_MOCK_DB === 'true';

/**
 * Whether CORS should accept any origin.
 *
 * Deliberately keyed off NODE_ENV alone. It used to also key off USE_MOCK_DB,
 * which meant one unrelated database flag could open the API to every origin on
 * the internet.
 */
export const allowAnyOrigin = (): boolean => !isProduction();

/** Where the patient-facing app is served from, without a trailing slash. */
const DEFAULT_APP_URL = 'https://hospital-automation-wine.vercel.app';

/**
 * The base URL to put in a link we send a patient.
 *
 * This was written out longhand at each of the places that WhatsApps a link —
 * the booking confirmation, the prescription, the lab result — so moving the
 * front end to a facility's own domain meant finding every one of them. A
 * message with a link to the wrong host is worse than no link, because the
 * patient has no way to tell it is wrong.
 */
export const publicAppUrl = (): string =>
  String(process.env.PUBLIC_APP_URL || DEFAULT_APP_URL).replace(/\/+$/, '');

/** The tracker page for a token: where the patient watches their own queue. */
export const trackerUrl = (tokenId: string | object): string => `${publicAppUrl()}/track/${String(tokenId)}`;

/** The prescription/report page for a token. */
export const prescriptionUrl = (tokenId: string | object): string =>
  `${publicAppUrl()}/prescription/${String(tokenId)}`;

/**
 * Secrets that must be present, and long enough to be worth having.
 *
 * The names here must match what the code actually reads. `MONGODB_URI` is the
 * one index.js uses; an earlier version of this list asked for `MONGO_URI`,
 * which no part of the app has ever read — so a correctly configured deploy was
 * rejected for a variable that would have done nothing if it were set.
 */
export const REQUIRED_IN_PRODUCTION: Array<{ name: string; minLength: number }> = [
  { name: 'JWT_SECRET', minLength: 32 },
  { name: 'ADMIN_SECRET', minLength: 16 },
  { name: 'MONGODB_URI', minLength: 1 }
];

/**
 * Values that once shipped as fallbacks in this codebase. They are in the git
 * history, so they are public — refusing them by name stops the most likely
 * mistake, which is pasting the old default into the hosting dashboard.
 */
export const BANNED_VALUES: Set<string> = new Set([
  'supersecret123',
  'secret',
  'changeme' /* BANNED */,
  'admin',
  'password'
]);

/**
 * Validate the environment. Returns the problems rather than throwing, so the
 * caller can report all of them at once — a deploy that fails three times for
 * three separate missing variables wastes an afternoon.
 */
export function collectEnvProblems(): string[] {
  const problems: string[] = [];

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

  if (process.env.AUTO_SEED === 'true') {
    problems.push(
      'AUTO_SEED=true is set in production. On an empty database this inserts the ' +
        'demo facilities, doctors and staff (Dr. Clara Watson, Alice Smith, and the ' +
        'rest) as real records in a live tenant. Remove this variable.'
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
export function assertEnvironment(): void {
  const problems = collectEnvProblems();
  if (problems.length === 0) return;

  console.error('\nFATAL: this server cannot start safely in production.\n');
  problems.forEach((problem, i) => console.error(`  ${i + 1}. ${problem}`));
  console.error('\nSet these in your hosting dashboard, then redeploy.');
  console.error('To generate a strong secret locally:');
  console.error("  node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"\n");
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
export function safeCompare(submitted?: string | null, expected?: string | null): boolean {
  if (typeof submitted !== 'string' || typeof expected !== 'string') return false;
  if (!submitted || !expected) return false;

  const digest = (value: string) => crypto.createHash('sha256').update(value).digest();
  return crypto.timingSafeEqual(digest(submitted), digest(expected));
}
