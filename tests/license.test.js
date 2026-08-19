/**
 * The subscription lifecycle: sold, warned, lapsed, switched off, restored.
 *
 * Two properties matter more than any other here, and both are about the way
 * this feature can go wrong rather than the way it goes right:
 *
 *   - A facility that has PAID must never be blocked. That includes every tenant
 *     onboarded before licensing existed, whose record has no term at all — the
 *     day this deployed, reading "no expiry date" as "expired" would have taken
 *     the whole platform down at once.
 *
 *   - A facility that has NOT paid must not be cut off mid-consultation with no
 *     warning. The grace period and the escalating reminders are the feature;
 *     the shutdown is only the last step of it.
 *
 * Everything is evaluated against an injected `now`, because a licence test that
 * depends on the real clock is a test that passes until the day it is a month
 * from the boundary.
 */
const { installMockDb } = require('./helpers/mockDb');
const { section, check, report } = require('./helpers/assert');

const { BACKEND_DIST: BACKEND } = require('./helpers/backendPath');
const { models, outbound } = installMockDb(BACKEND);

const path = require('path');
const {
  PLANS,
  PLAN_KEYS,
  GRACE_DAYS,
  TRIAL_DAYS,
  REMINDER_DAYS,
  addMonths,
  licenseState,
  renewLicense,
  trialLicense,
  dueReminder,
  runLicenseSweep
} = require(path.join(BACKEND, 'utils', 'licenseHelper.js'));

/** A fixed instant, so nothing here depends on the day the suite is run. */
const at = (y, m, d, h = 10) => new Date(y, m - 1, d, h, 0, 0, 0);
const JAN15 = at(2026, 1, 15);

/** A facility holding exactly one term. */
const facilityWith = (license, name = 'Ashoka Life Care') => ({ id: 'ashoka', name, license });

(async () => {
  section('The four plans a facility can buy');

  check('One month is on sale', PLANS['1m'].months === 1);
  check('Six months is on sale', PLANS['6m'].months === 6);
  check('Twelve months is on sale', PLANS['12m'].months === 12);
  check('Two years is on sale', PLANS['24m'].months === 24, PLANS['24m']);
  check('…and reads as "2 years", not "24 months"', PLANS['24m'].label === '2 years', PLANS['24m'].label);
  check('Nothing else is', PLAN_KEYS.length === 4, PLAN_KEYS);

  section('Counting months the way a calendar does');

  check('A month later is the same date', addMonths(JAN15, 1).getMonth() === 1, addMonths(JAN15, 1));
  check('A year later is the same day next year', addMonths(JAN15, 12).getFullYear() === 2027);
  check('Two years is two years', addMonths(JAN15, 24).getFullYear() === 2028);

  // setMonth alone turns 31 Jan + 1 month into 3 March, because February has no
  // 31st and JavaScript rolls over instead of clamping. A licence sold on the
  // 31st would then quietly run two days long, every single time.
  const endOfJan = addMonths(at(2026, 1, 31), 1);
  check(
    'A term sold on the 31st ends in February, not March',
    endOfJan.getMonth() === 1 && endOfJan.getDate() === 28,
    endOfJan.toDateString()
  );

  section('A facility nobody has licensed is NOT a facility that has expired');

  const legacy = licenseState(facilityWith({}), JAN15);
  check('A pre-licensing tenant keeps working', legacy.active === true, legacy);
  check('…and is never blocked', legacy.blocked === false, legacy);
  check('…but is flagged for the owner to act on', legacy.stage === 'none', legacy);
  check(
    'A facility record with no licence key at all is safe too',
    licenseState({}, JAN15).blocked === false
  );
  check('So is a null facility', licenseState(null, JAN15).blocked === false);

  section('A term that is running');

  const year = renewLicense({}, '12m', { now: JAN15 });
  check('The term ends a year out', new Date(year.expiresAt).getFullYear() === 2027, year.expiresAt);
  check('The plan is recorded', year.plan === '12m', year);
  check('…as is when it started', Boolean(year.startedAt), year);
  check('A new term is Active', year.status === 'Active', year);

  const midTerm = licenseState(facilityWith(year), at(2026, 6, 1));
  check('Half way through, the facility is simply active', midTerm.stage === 'active', midTerm);
  check('…and not warned about anything', midTerm.blocked === false && midTerm.daysLeft > 200, midTerm);

  const monthOut = licenseState(facilityWith(year), at(2026, 12, 20));
  check('A month out it starts warning', monthOut.stage === 'expiring', monthOut);
  check('…while still working normally', monthOut.active === true && monthOut.blocked === false, monthOut);
  check('…and says how many days are left', monthOut.daysLeft === 26, monthOut.daysLeft);

  section('Expiry day, and the grace period that follows it');

  const shortTerm = renewLicense({}, '1m', { now: JAN15 }); // ends 15 Feb
  const onExpiry = licenseState(facilityWith(shortTerm), at(2026, 2, 15));

  // The decisive call in this whole feature. Cutting a live OPD dead at midnight
  // turns a billing event into a clinical one: reception cannot register the
  // patient in front of them and nobody in the building can pay anything.
  check('On the expiry date itself, services still run', onExpiry.blocked === false, onExpiry);
  check('…and the console says so plainly', onExpiry.stage === 'grace', onExpiry);
  check('…counting down the grace period', onExpiry.graceLeft === GRACE_DAYS, onExpiry);

  const midGrace = licenseState(facilityWith(shortTerm), at(2026, 2, 19));
  check('Four days later it is still working', midGrace.blocked === false, midGrace);
  check('…with less grace left', midGrace.graceLeft === GRACE_DAYS - 4, midGrace);

  const lastGraceDay = licenseState(facilityWith(shortTerm), at(2026, 2, 21));
  check('The final grace day still works', lastGraceDay.blocked === false, lastGraceDay);

  const afterGrace = licenseState(facilityWith(shortTerm), at(2026, 2, 22));
  check('The day after grace, services are off', afterGrace.blocked === true, afterGrace);
  check('…and the state says exactly that', afterGrace.stage === 'expired', afterGrace);
  check(
    '…naming the date it expired, not just "expired"',
    afterGrace.message.includes('15/2/2026') || /Feb|2\/2026|2026/.test(afterGrace.message),
    afterGrace.message
  );

  section('Renewing does not throw away time already paid for');

  // A hospital that renews a fortnight early must keep that fortnight. The naive
  // version — always add twelve months to today — bills for time it deletes, and
  // the only person who notices is the customer who renewed responsibly.
  const early = renewLicense(facilityWith(shortTerm), '12m', { now: at(2026, 2, 1) });
  check(
    'An early renewal counts from the old expiry, not from today',
    new Date(early.expiresAt).getMonth() === 1 && new Date(early.expiresAt).getFullYear() === 2027,
    early.expiresAt
  );

  const late = renewLicense(facilityWith(shortTerm), '1m', { now: at(2026, 3, 10) });
  check(
    'A renewal after expiry counts from today',
    new Date(late.expiresAt).getMonth() === 3 && new Date(late.expiresAt).getDate() === 10,
    late.expiresAt
  );

  check('Every term is kept in the history', (early.history || []).length >= 1, early.history);
  check(
    '…recording what was granted and when',
    early.history[early.history.length - 1].plan === '12m',
    early.history
  );

  // A facility that renewed at three days left must be able to hear about the
  // NEXT expiry; without this reset it never would.
  const wasReminded = facilityWith({ ...shortTerm, lastRemindedDay: 3 });
  check('Renewing re-arms the reminders', renewLicense(wasReminded, '6m').lastRemindedDay === null);

  check(
    'An unknown plan is refused rather than guessed',
    (() => {
      try {
        renewLicense({}, '3m');
        return false;
      } catch (err) {
        return /Unknown plan/.test(err.message);
      }
    })()
  );

  section('A new facility starts on a trial, not on nothing');

  const trial = trialLicense(JAN15);
  const trialState = licenseState(facilityWith(trial), JAN15);
  check('The trial runs', trialState.blocked === false, trialState);
  check('…for a known number of days', trialState.daysLeft === TRIAL_DAYS, trialState.daysLeft);
  check(
    '…and expires like any other term',
    licenseState(facilityWith(trial), at(2026, 2, 20)).blocked === true
  );

  section('Suspension beats the dates, in both directions');

  const suspended = licenseState(facilityWith({ ...year, status: 'Suspended' }), at(2026, 6, 1));
  check('A suspended facility is blocked even mid-term', suspended.blocked === true, suspended);
  check('…and is told it was suspended, not that it expired', suspended.stage === 'suspended', suspended);
  check(
    'Restoring does not silently extend the term',
    licenseState(facilityWith({ ...year, status: 'Active' }), at(2026, 6, 1)).expiresAt.getTime() ===
      new Date(year.expiresAt).getTime()
  );

  section('One reminder per threshold, louder as the date approaches');

  const stateAt = (when) => licenseState(facilityWith(year), when);

  check('Nothing is due while the term is comfortable', dueReminder(stateAt(at(2026, 6, 1)), null) === null);
  check('The first notice goes out a month ahead', dueReminder(stateAt(at(2026, 12, 17)), null) === 30);
  check('…and is not repeated the next day', dueReminder(stateAt(at(2026, 12, 18)), 30) === null);
  check('The next threshold does fire', dueReminder(stateAt(at(2027, 1, 2)), 30) === 15, REMINDER_DAYS);
  check('The last-day notice fires', dueReminder(stateAt(at(2027, 1, 14)), 3) === 1);

  // Once expired the software is about to stop, so a daily notice is warranted —
  // and each day is still sent only once.
  check('Expiry day itself sends a notice', dueReminder(stateAt(at(2027, 1, 15)), 1) === 0);
  check('…once', dueReminder(stateAt(at(2027, 1, 15)), 0) === null);
  check('…and again the following day', dueReminder(stateAt(at(2027, 1, 16)), 0) === -1);
  check(
    'A facility with no licence is never nagged',
    dueReminder(licenseState(facilityWith({})), null) === null
  );

  section('The daily sweep messages the people who can act');

  const soon = renewLicense({}, '1m', { now: new Date() });
  soon.expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // three days out

  await new models.Hospital({
    id: 'sweep-clinic',
    name: 'Sweep Clinic',
    city: 'Patna',
    phone: '+919800000001',
    license: soon
  }).save();

  await new models.Hospital({
    id: 'comfortable-hospital',
    name: 'Comfortable Hospital',
    city: 'Patna',
    phone: '+919800000002',
    license: renewLicense({}, '24m', { now: new Date() })
  }).save();

  await new models.Hospital({
    id: 'legacy-hospital',
    name: 'Legacy Hospital',
    city: 'Patna',
    phone: '+919800000003',
    license: {}
  }).save();

  outbound.length = 0;
  const first = await runLicenseSweep();

  check('Only the facility approaching expiry is messaged', first.sent === 1, `${first.sent} sent`);
  check(
    '…and it is the right one',
    outbound.length === 1 && outbound[0].phone === '+919800000001',
    outbound.map((m) => m.phone)
  );
  check(
    'The notice names the facility and the days left',
    /Sweep Clinic/.test(outbound[0].message) && /3 day/.test(outbound[0].message),
    outbound[0].message
  );
  check('…bilingually, like every other message this platform sends', /[ऀ-ॿ]/.test(outbound[0].message));

  // The property that stops a daily job becoming daily spam.
  outbound.length = 0;
  const second = await runLicenseSweep();
  check('A second sweep on the same day sends nothing', second.sent === 0, `${second.sent} sent`);
  check(
    '…nothing at all',
    outbound.length === 0,
    outbound.map((m) => m.phone)
  );

  const swept = models.Hospital._rows.find((h) => h.id === 'sweep-clinic');
  check('The threshold is recorded against the facility', swept.license.lastRemindedDay === 3, swept.license);

  // Inside the grace period the message changes from "renew soon" to "services
  // will stop", because those are different instructions.
  swept.license = {
    ...swept.license,
    expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    lastRemindedDay: 1
  };
  outbound.length = 0;
  await runLicenseSweep();
  check(
    'An expired facility is told services are about to stop',
    outbound.length === 1 && /keeps working for|grace/i.test(outbound[0].message),
    outbound[0] && outbound[0].message
  );

  // =========================================================================
  section('Month-end arithmetic — the clamp the comment promises');

  // A term sold on the 31st must not expire two days later than one sold on the
  // 1st. `setMonth` alone rolls 31 January into 3 March; every assertion here
  // exists because that rollover is invisible on an invoice until a customer
  // adds the days up.
  const JAN31 = at(2026, 1, 31);
  check(
    '31 January + 1 month lands on the last day of February',
    addMonths(JAN31, 1).getDate() === 28,
    addMonths(JAN31, 1).toDateString()
  );
  check('…in the right month', addMonths(JAN31, 1).getMonth() === 1, addMonths(JAN31, 1).toDateString());
  check(
    '31 August + 6 months clamps to 28 February',
    addMonths(at(2026, 8, 31), 6).getDate() === 28,
    addMonths(at(2026, 8, 31), 6).toDateString()
  );
  check(
    'A leap February keeps its 29th',
    addMonths(at(2028, 1, 31), 1).getDate() === 29,
    addMonths(at(2028, 1, 31), 1).toDateString()
  );
  check(
    '31 March + 1 month clamps to 30 April',
    addMonths(at(2026, 3, 31), 1).getDate() === 30,
    addMonths(at(2026, 3, 31), 1).toDateString()
  );

  section('Renewing early must not delete time already paid for');

  const paidYear = facilityWith(renewLicense({}, '12m', { now: JAN15 }));
  const renewedEarly = renewLicense(paidYear, '12m', { now: at(2026, 12, 1) });
  check(
    'A facility renewing six weeks early is counted from its expiry, not from today',
    new Date(renewedEarly.expiresAt).getFullYear() === 2028 &&
      new Date(renewedEarly.expiresAt).getMonth() === 0,
    new Date(renewedEarly.expiresAt).toDateString()
  );

  // The function reads `hospital.license`, so handing it the licence itself
  // finds no current term and silently restarts the clock from today. Nothing
  // throws and the response looks right — the customer just loses the unexpired
  // remainder. Pinned here so a refactor that "simplifies" the argument gets caught.
  const wrongShape = renewLicense(paidYear.license, '12m', { now: at(2026, 12, 1) });
  check(
    'Passing the licence instead of the facility would lose that time (argument shape is load-bearing)',
    new Date(wrongShape.expiresAt).getFullYear() === 2027,
    new Date(wrongShape.expiresAt).toDateString()
  );

  const lapsedThenRenewed = renewLicense(facilityWith(renewLicense({}, '1m', { now: JAN15 })), '12m', {
    now: at(2026, 6, 1)
  });
  check(
    'A facility renewing after a lapse starts from today, not from the dead term',
    new Date(lapsedThenRenewed.expiresAt).getFullYear() === 2027 &&
      new Date(lapsedThenRenewed.expiresAt).getMonth() === 5,
    new Date(lapsedThenRenewed.expiresAt).toDateString()
  );

  section('Suspension, and coming back from it');

  const suspendedFacility = facilityWith({
    ...renewLicense({}, '12m', { now: JAN15 }),
    status: 'Suspended'
  });
  check(
    'A suspension blocks even a facility with time left',
    licenseState(suspendedFacility, at(2026, 6, 1)).blocked === true
  );
  const restored = renewLicense(suspendedFacility, '6m', { now: at(2026, 6, 1) });
  check('Granting a term lifts the suspension', restored.status === 'Active', restored.status);
  check(
    '…and the facility is working again immediately',
    licenseState({ license: restored }, at(2026, 6, 1)).blocked === false
  );

  let rejected = null;
  try {
    renewLicense({}, 'lifetime');
  } catch (err) {
    rejected = err.message;
  }
  check('A plan nobody sells is refused rather than stored', /Unknown plan/.test(rejected || ''), rejected);

  section('The gate that actually switches a facility off');

  const { refuseIfUnlicensed, invalidateLicense } = require(path.join(BACKEND, 'middleware', 'license.js'));

  /** Capture what the gate did instead of letting it talk to a socket. */
  const fakeRes = () => {
    const out = { status: null, body: null };
    return {
      out,
      status(code) {
        out.status = code;
        return this;
      },
      json(payload) {
        out.body = payload;
        return this;
      }
    };
  };
  const reqFor = (hospital, url) => ({ user: { hospital }, originalUrl: url, path: url });

  await new models.Hospital({
    id: 'lapsed-clinic',
    name: 'Lapsed Clinic',
    license: { plan: '1m', expiresAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), status: 'Active' }
  }).save();
  await new models.Hospital({
    id: 'paid-clinic',
    name: 'Paid Clinic',
    license: { plan: '12m', expiresAt: new Date(Date.now() + 200 * 24 * 60 * 60 * 1000), status: 'Active' }
  }).save();

  invalidateLicense();

  const blockedRes = fakeRes();
  const wasBlocked = await refuseIfUnlicensed(reqFor('lapsed-clinic', '/api/v1/staff/tokens'), blockedRes);
  check('A lapsed facility is refused', wasBlocked === true);
  check(
    '…with 402 Payment Required, not a 403 that reads as a permissions bug',
    blockedRes.out.status === 402,
    blockedRes.out.status
  );
  check(
    '…flagged so the console can show a renewal screen',
    blockedRes.out.body && blockedRes.out.body.licenseBlocked === true,
    blockedRes.out.body
  );
  check(
    '…and told why',
    /expired/i.test((blockedRes.out.body || {}).message || ''),
    (blockedRes.out.body || {}).message
  );

  const paidRes = fakeRes();
  const paidReq = reqFor('paid-clinic', '/api/v1/staff/tokens');
  check('A paying facility passes through', (await refuseIfUnlicensed(paidReq, paidRes)) === false);
  check(
    '…and its licence rides along so routes need not look it up again',
    paidReq.license && paidReq.license.blocked === false,
    paidReq.license
  );

  // Two doors stay open on purpose: a blocked facility must be able to sign in
  // and read its own licence, or it cannot be told why nothing works.
  for (const openPath of ['/api/v1/auth/facility/login', '/api/v1/ops/license']) {
    const res = fakeRes();
    check(
      `A blocked facility can still reach ${openPath}`,
      (await refuseIfUnlicensed(reqFor('lapsed-clinic', openPath), res)) === false,
      res.out
    );
  }

  const anonRes = fakeRes();
  check(
    'A request with no tenant is not the licence gate to answer',
    (await refuseIfUnlicensed({ originalUrl: '/api/v1/chat/hospitals' }, anonRes)) === false
  );

  // Refusing every request on a database hiccup would turn an unrelated outage
  // into a platform-wide shutdown of hospitals that have paid.
  const brokenRes = fakeRes();
  const findOne = models.Hospital.findOne;
  models.Hospital.findOne = () => Promise.reject(new Error('database is down'));
  invalidateLicense();
  const duringOutage = await refuseIfUnlicensed(reqFor('lapsed-clinic', '/api/v1/staff/tokens'), brokenRes);
  models.Hospital.findOne = findOne;
  invalidateLicense();
  check(
    'A licence lookup failure lets the request through rather than shutting the platform',
    duringOutage === false,
    brokenRes.out
  );

  report();
})();
