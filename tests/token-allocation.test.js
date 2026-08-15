/**
 * Daily token numbering, and the deadlock that stopped a facility booking at all.
 *
 * The unique index on Token is `{tokenNumber, hospital}` — global, with no date
 * in it. The generator, meanwhile, numbers from TODAY's tokens so each morning
 * opens at T-1. Those two rules disagree whenever a token from an earlier day is
 * still in the collection, which the close-of-day guarantees: it deliberately
 * carries forward anyone still mid-treatment.
 *
 * When they disagreed, the retry loop asked for "another number" and got the
 * same one back every time, because nothing in the calculation had changed — so
 * booking failed with "Could not allocate a free token number after 5 attempts"
 * and the patient got no token. The mock below enforces the real index so that
 * deadlock is reproducible here.
 */
const path = require('path');
const { installMockDb } = require('./helpers/mockDb');
const { section, check, report } = require('./helpers/assert');

const { BACKEND_DIST: BACKEND } = require('./helpers/backendPath');
const { models } = installMockDb(BACKEND);
const { generateUniqueTokenNumber, saveTokenWithRetry } = require('../backend/dist/utils/tokenHelper');

const Token = models.Token;

// Enforce the production unique index — the plain test mock does not.
const plainSave = Token.prototype.save;
Token.prototype.save = async function save() {
  const clash = Token._rows.some(
    (row) => row !== this && row.tokenNumber === this.tokenNumber && row.hospital === this.hospital
  );
  if (clash) {
    const err = new Error(
      `E11000 duplicate key error collection: Token index: tokenNumber_1_hospital_1 dup key: { tokenNumber: "${this.tokenNumber}" }`
    );
    err.code = 11000;
    throw err;
  }
  return plainSave.call(this);
};

const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

/** A token already sitting in the collection, dated `age` days back. */
async function existing(tokenNumber, hospital, age = 0, journeyStage = 'Waiting') {
  const token = new Token({ tokenNumber, hospital, journeyStage, createdAt: daysAgo(age) });
  await token.save();
  return token;
}

/** A fresh booking, as the routes build one. */
const booking = (hospital, tokenNumber) => new Token({ tokenNumber, hospital, journeyStage: 'Waiting' });

(async () => {
  section('Daily token numbering');

  const fresh = await generateUniqueTokenNumber('city-hospital');
  check('A facility with no tokens starts at T-1', fresh === 'T-1', fresh);

  await existing('T-1', 'city-hospital');
  await existing('T-2', 'city-hospital');
  const third = await generateUniqueTokenNumber('city-hospital');
  check("Today's numbering continues from the highest issued", third === 'T-3', third);

  const otherTenant = await generateUniqueTokenNumber('apex-clinic');
  check("Another facility's tokens never shift this one's numbering", otherTenant === 'T-1', otherTenant);

  section('The carried-forward token deadlock');

  // Yesterday's patient is still waiting on a lab result, so close-of-day kept
  // their T-1 — exactly the state that broke booking this morning.
  await existing('T-1', 'dumka-hospital', 1, 'Lab Pending');

  const proposed = await generateUniqueTokenNumber('dumka-hospital');
  check(
    'A number still held from an earlier day is not proposed again',
    proposed !== 'T-1',
    `proposed ${proposed}`
  );
  check('Numbering steps past the carried-forward token', proposed === 'T-2', proposed);

  // The full booking path, starting from the number the old code would pick.
  const saved = await saveTokenWithRetry(booking('dumka-hospital', 'T-1'));
  check('Booking succeeds instead of failing after N attempts', Boolean(saved), saved);
  check('The patient gets a free number', saved.tokenNumber === 'T-2', saved.tokenNumber);
  check(
    'The token is really in the collection, not just returned',
    Token._rows.some((r) => r === saved),
    'token was not persisted'
  );

  section('A close-of-day that never ran');

  // Host restarted overnight, nothing was archived: every one of yesterday's
  // numbers is still taken. Before the fix this deadlocked identically.
  for (const n of ['T-1', 'T-2', 'T-3', 'T-4', 'T-5', 'T-6', 'T-7']) {
    await existing(n, 'sleepy-clinic', 1, 'Completed');
  }
  const afterBacklog = await saveTokenWithRetry(booking('sleepy-clinic', 'T-1'));
  check(
    'Booking clears a whole day of stale numbers',
    afterBacklog.tokenNumber === 'T-8',
    afterBacklog.tokenNumber
  );

  section('Concurrent bookings racing for the same number');

  // Two patients booking in the same instant both read "T-1 is free". The index
  // lets exactly one through; the loser must land on a different number rather
  // than re-proposing the one it just saw rejected.
  const [a, b] = await Promise.all([
    saveTokenWithRetry(booking('race-hospital', 'T-1')),
    saveTokenWithRetry(booking('race-hospital', 'T-1'))
  ]);
  check('Both patients keep a token', Boolean(a && b));
  check(
    'The two tokens are different',
    a.tokenNumber !== b.tokenNumber,
    `${a.tokenNumber} / ${b.tokenNumber}`
  );
  check(
    'Neither is a random fallback number',
    [a.tokenNumber, b.tokenNumber].every((n) => /^T-\d{1,3}$/.test(n)),
    `${a.tokenNumber} / ${b.tokenNumber}`
  );

  report();
})();
