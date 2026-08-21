/**
 * Per-facility WhatsApp metering: what each tenant sent, and what it owes.
 *
 * The properties worth pinning down here are all about the ways a meter is wrong
 * rather than the way it is right, because a counter that is quietly off by a
 * little produces an invoice that looks perfectly plausible:
 *
 *   - A message that FAILED must never be billed. Meta charges us nothing for a
 *     rejection, and a hospital invoiced for messages its patients never got is
 *     a hospital that disputes the whole bill.
 *
 *   - A message nobody can attribute must be VISIBLE. Dropping it makes every
 *     total slightly too low with nothing anywhere to notice.
 *
 *   - A metering failure must cost a COUNT, never a MESSAGE. This runs inside
 *     the send that tells a patient to leave home for their appointment.
 *
 *   - The month must be the facility's month. Reading UTC would sprinkle a few
 *     of every month's messages into its neighbour, every month, in a number the
 *     customer is checking against their own phone.
 *
 * Everything is evaluated against an injected `now`, so nothing here passes only
 * until the day the suite is run near a month boundary.
 */
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';

const path = require('path');
const { installMockDb } = require('./helpers/mockDb');
const { section, check, report } = require('./helpers/assert');

const { BACKEND_DIST: BACKEND } = require('./helpers/backendPath');
const { models } = installMockDb(BACKEND);

const meter = require(path.join(BACKEND, 'utils', 'messageMeter.js'));
const {
  UNATTRIBUTED,
  MESSAGE_KINDS,
  METER_TIERS,
  TIER_KEYS,
  normalizeKind,
  isBillableKind,
  facilityFrom,
  tierOf,
  periodKey,
  previousPeriod,
  recordMessage,
  usageFor,
  usageAcrossFacilities,
  overageOf,
  formatPaise
} = meter;

/** A fixed instant, so no assertion depends on the day this is run. */
const at = (y, m, d, h = 10, min = 0) => new Date(y, m - 1, d, h, min, 0, 0);
const AUG21 = at(2026, 8, 21);

(async () => {
  // ─────────────────────────────────────────────────────────────────────────
  section('The billing period is the facility’s month, not UTC’s');

  check('A date in August reads as its month', periodKey(AUG21) === '2026-08', periodKey(AUG21));
  check('Single-digit months are padded', periodKey(at(2026, 1, 9)) === '2026-01', periodKey(at(2026, 1, 9)));

  // 11:30 PM IST on the 31st is still 18:00 UTC on the 31st — this one is safe
  // either way. The 1st at 6 AM IST is the dangerous direction: 00:30 UTC.
  check(
    'Late on the last night of the month stays in that month',
    periodKey(at(2026, 8, 31, 23, 30)) === '2026-08',
    periodKey(at(2026, 8, 31, 23, 30))
  );
  check(
    'Early on the first morning belongs to the NEW month',
    periodKey(at(2026, 9, 1, 6, 0)) === '2026-09',
    periodKey(at(2026, 9, 1, 6, 0))
  );

  check('The month before August is July', previousPeriod('2026-08') === '2026-07');
  check('The month before January is last December', previousPeriod('2026-01') === '2025-12');
  check('Nonsense falls back to now, not to a crash', /^\d{4}-\d{2}$/.test(previousPeriod('rubbish')));

  // ─────────────────────────────────────────────────────────────────────────
  section('What counts as a message, and what a facility actually pays for');

  check('A booking confirmation is billable', MESSAGE_KINDS.booking.billable === true);
  check('An arrival ping is billable', isBillableKind('arrival') === true);
  check(
    'A LICENCE reminder is counted but never billed',
    MESSAGE_KINDS.licence.billable === false,
    MESSAGE_KINDS.licence
  );
  check('Kinds are case-insensitive', normalizeKind('ARRIVAL') === 'arrival');
  check('An unknown kind is still counted, as "other"', normalizeKind('smoke-signal') === 'other');
  check('A missing kind is still counted', normalizeKind(undefined) === 'other');
  check(
    'patientNotify’s own vocabulary maps one-to-one',
    ['bill', 'report', 'prescription', 'queue', 'info'].every((k) => normalizeKind(k) === k)
  );

  // ─────────────────────────────────────────────────────────────────────────
  section('Finding the facility a message belongs to');

  check('A token’s own facility', facilityFrom({ hospital: 'sunrise' }) === 'sunrise');
  check(
    'The first candidate wins — a token beats its doctor',
    facilityFrom({ hospital: 'sunrise' }, { hospital: 'district' }) === 'sunrise'
  );
  check(
    'Empty candidates are skipped',
    facilityFrom(null, undefined, { hospital: 'district' }) === 'district'
  );
  check('A bare slug is accepted', facilityFrom('sunrise') === 'sunrise');
  check('A blank string is not a facility', facilityFrom('   ', { hospital: 'district' }) === 'district');
  check(
    'A populated hospital ref resolves to its id',
    facilityFrom({ hospital: { id: 'sunrise' } }) === 'sunrise'
  );
  check('Nothing to go on returns null, not a guess', facilityFrom(null, {}, undefined) === null);

  // ─────────────────────────────────────────────────────────────────────────
  section('Counting one facility’s month');

  for (let i = 0; i < 3; i++) {
    await recordMessage({ hospital: 'sunrise', kind: 'arrival', ok: true, now: AUG21 });
  }
  let sunrise = await usageFor('sunrise', '2026-08');

  check('Three sends are three sends', sunrise.sent === 3, sunrise);
  check('…all of them billable', sunrise.billable === 3, sunrise);
  check('…and broken down by kind', sunrise.byKind.arrival === 3, sunrise.byKind);
  check('The month opened at the first message', String(sunrise.firstAt) === String(AUG21), sunrise.firstAt);

  await recordMessage({ hospital: 'sunrise', kind: 'bill', ok: false, now: at(2026, 8, 22) });
  sunrise = await usageFor('sunrise', '2026-08');

  check('A rejected message is recorded', sunrise.failed === 1, sunrise);
  check('…but is NOT counted as sent', sunrise.sent === 3, sunrise);
  check('…and is NOT billed', sunrise.billable === 3, sunrise);
  check('…while still showing in the breakdown', sunrise.byKind.bill === 1, sunrise.byKind);

  await recordMessage({ hospital: 'sunrise', kind: 'licence', ok: true, now: at(2026, 8, 23) });
  sunrise = await usageFor('sunrise', '2026-08');

  check('A licence reminder is sent', sunrise.sent === 4, sunrise);
  check('…and costs the facility nothing', sunrise.billable === 3, sunrise);

  check(
    'The opening timestamp did not drift to the latest message',
    String(sunrise.firstAt) === String(AUG21),
    sunrise.firstAt
  );
  check(
    '…while the last-seen stamp did move',
    String(sunrise.lastAt) === String(at(2026, 8, 23)),
    sunrise.lastAt
  );

  // ─────────────────────────────────────────────────────────────────────────
  section('One facility’s traffic never lands on another’s bill');

  await recordMessage({ hospital: 'district', kind: 'arrival', ok: true, now: AUG21 });
  const district = await usageFor('district', '2026-08');
  sunrise = await usageFor('sunrise', '2026-08');

  check('The second facility has its own count', district.billable === 1, district);
  check('…and the first one is untouched', sunrise.billable === 3, sunrise);

  await recordMessage({ hospital: 'sunrise', kind: 'arrival', ok: true, now: at(2026, 9, 2) });
  const september = await usageFor('sunrise', '2026-09');

  check('A new month starts a new meter', september.billable === 1, september);
  check('…leaving the closed month alone', (await usageFor('sunrise', '2026-08')).billable === 3);
  check(
    'A month with no traffic reads as zero, not as an error',
    (await usageFor('sunrise', '2020-01')).sent === 0
  );

  // ─────────────────────────────────────────────────────────────────────────
  section('A message nobody can attribute is visible, not dropped');

  await recordMessage({ hospital: '', kind: 'arrival', ok: true, now: AUG21 });
  await recordMessage({ hospital: null, kind: 'other', ok: true, now: AUG21 });
  const orphans = await usageFor(UNATTRIBUTED, '2026-08');

  check('Both landed somewhere', orphans.sent === 2, orphans);
  check('…in a bucket that cannot collide with a real slug', UNATTRIBUTED.startsWith('__'), UNATTRIBUTED);

  const platform = await usageAcrossFacilities('2026-08');
  check(
    'The unattributed bucket shows up in the platform view',
    platform.some((row) => row.hospital === UNATTRIBUTED),
    platform.map((r) => r.hospital)
  );
  check(
    'The platform view is ranked by what is billable',
    platform[0].hospital === 'sunrise',
    platform.map((r) => `${r.hospital}:${r.billable}`)
  );
  check(
    'A month with no traffic anywhere is an empty list, not a throw',
    (await usageAcrossFacilities('2019-05')).length === 0
  );

  // ─────────────────────────────────────────────────────────────────────────
  section('The four tiers on sale');

  check('Four of them', TIER_KEYS.length === 4, TIER_KEYS);
  check('A standalone lab or medical store', METER_TIERS.standalone.included === 1500);
  check('Starter covers a small clinic’s month', METER_TIERS.starter.included === 3000);
  check('Growth covers a poly-clinic', METER_TIERS.growth.included === 10000);
  check('Hospital covers a busy OPD', METER_TIERS.hospital.included === 30000);
  check(
    'Every tier prices its overage in whole paise',
    TIER_KEYS.every((k) => Number.isInteger(METER_TIERS[k].overagePaise) && METER_TIERS[k].overagePaise > 0)
  );

  check('A facility on a tier reports it', tierOf({ license: { tier: 'growth' } }) === 'growth');
  check('Tier names are case-insensitive', tierOf({ license: { tier: 'Growth' } }) === 'growth');
  check('An unknown tier is treated as unset', tierOf({ license: { tier: 'platinum' } }) === null);
  check('A facility onboarded before tiers existed is unset, not Starter', tierOf({ license: {} }) === null);
  check('…and so is one with no licence at all', tierOf({}) === null);

  // ─────────────────────────────────────────────────────────────────────────
  section('Turning a month into money');

  const usageOf = (billable) => ({
    hospital: 'x',
    period: '2026-08',
    sent: billable,
    failed: 0,
    billable,
    byKind: {}
  });

  const under = overageOf(usageOf(2500), 'starter');
  check('Inside the included volume there is nothing to pay', under.amountPaise === 0, under);
  check('…and nothing is flagged', under.overQuota === false, under);
  check('…but the usage is reported as a percentage', under.percentUsed === 83, under);

  const exact = overageOf(usageOf(3000), 'starter');
  check(
    'Landing exactly on the quota is not over it',
    exact.overQuota === false && exact.overage === 0,
    exact
  );

  const over = overageOf(usageOf(3400), 'starter');
  check('Beyond it, only the excess is charged', over.overage === 400, over);
  check('…at the tier’s own rate', over.amountPaise === 400 * 30, over);
  check('…rendered as rupees', over.amountLabel === '₹120', over.amountLabel);
  check('…and flagged for the console', over.overQuota === true, over);

  const bigOpd = overageOf(usageOf(34500), 'hospital');
  check('A busy hospital pays its cheaper overage rate', bigOpd.amountPaise === 4500 * 25, bigOpd);
  check('…which reads as ₹1125', bigOpd.amountLabel === '₹1125', bigOpd.amountLabel);

  const untiered = overageOf(usageOf(99999), null);
  check('With no tier set, nothing is charged', untiered.amountPaise === 0, untiered);
  check('…nothing is flagged as over', untiered.overQuota === false, untiered);
  check(
    '…and the gap is reported rather than hidden',
    untiered.included === null && untiered.tier === null,
    untiered
  );
  check('…with usage still visible', untiered.billable === 99999, untiered);

  check('Whole rupees stay whole', formatPaise(12000) === '₹120', formatPaise(12000));
  check('Part rupees keep two places', formatPaise(12550) === '₹125.50', formatPaise(12550));
  check('Nothing owed reads as ₹0', formatPaise(0) === '₹0', formatPaise(0));

  // ─────────────────────────────────────────────────────────────────────────
  section('A metering failure costs a count, never a message');

  const realFind = models.MessageMeter.findOneAndUpdate;
  models.MessageMeter.findOneAndUpdate = async () => {
    throw new Error('database unreachable');
  };

  let threw = false;
  try {
    await recordMessage({ hospital: 'sunrise', kind: 'arrival', ok: true, now: AUG21 });
  } catch (_) {
    threw = true;
  }
  models.MessageMeter.findOneAndUpdate = realFind;

  check('recordMessage swallows a dead database', threw === false);
  check('…and the month is simply short one count', (await usageFor('sunrise', '2026-08')).billable === 3);

  // ─────────────────────────────────────────────────────────────────────────
  // The choke point itself. Every WhatsApp in the app funnels through
  // `sendWhatsAppNotification`, so this is the one place the wiring can be
  // proved rather than assumed. The real helper is loaded (the mock DB stubs it
  // out for every other suite) with `fetch` replaced, so nothing touches Meta.
  // ─────────────────────────────────────────────────────────────────────────
  section('The choke point meters what Meta actually accepted');

  const whatsappFile = path.resolve(BACKEND, 'utils', 'whatsappHelper.js');
  delete require.cache[whatsappFile];
  process.env.META_WHATSAPP_ACCESS_TOKEN = 'test-token-not-a-real-one';
  process.env.META_PHONE_NUMBER_ID = '1234567890';
  const { sendWhatsAppNotification } = require(whatsappFile);

  global.fetch = async () => ({
    ok: true,
    json: async () => ({ messages: [{ id: 'wamid.TEST' }] })
  });

  const accepted = await sendWhatsAppNotification('+919876500001', 'Your turn is near', [], null, null, {
    hospital: 'chokepoint',
    kind: 'arrival'
  });
  let choke = await usageFor('chokepoint', periodKey());

  check('Meta accepted it', accepted.status === 'sent', accepted);
  check('…so the facility’s meter moved', choke.sent === 1, choke);
  check('…and it is billable', choke.billable === 1, choke);

  global.fetch = async () => ({
    ok: false,
    json: async () => ({ error: { code: 190, message: 'Access token has expired' } })
  });

  const rejected = await sendWhatsAppNotification('+919876500002', 'Your bill is ready', [], null, null, {
    hospital: 'chokepoint',
    kind: 'bill'
  });
  choke = await usageFor('chokepoint', periodKey());

  check('Meta rejected it', rejected.status === 'failed', rejected);
  check('…the failure is recorded', choke.failed === 1, choke);
  check('…the send count did not move', choke.sent === 1, choke);
  check('…and NOTHING was added to the bill', choke.billable === 1, choke);

  const noPhone = await sendWhatsAppNotification('', 'nobody to tell', [], null, null, {
    hospital: 'chokepoint',
    kind: 'arrival'
  });
  check('A message with no recipient is skipped', noPhone.status === 'skipped', noPhone);
  check(
    '…and never reaches the meter',
    (await usageFor('chokepoint', periodKey())).sent === 1,
    await usageFor('chokepoint', periodKey())
  );

  // Without Meta credentials the helper falls back to logging the message. That
  // path delivers nothing, so it must bill nothing — otherwise the first
  // credentials outage would also invoice every hospital for the messages their
  // patients did not receive.
  delete process.env.META_WHATSAPP_ACCESS_TOKEN;
  delete process.env.META_PHONE_NUMBER_ID;
  delete require.cache[whatsappFile];
  const offline = require(whatsappFile);

  const simulated = await offline.sendWhatsAppNotification('+919876500003', 'simulated', [], null, null, {
    hospital: 'chokepoint',
    kind: 'arrival'
  });
  check('The simulation gateway reports success', simulated.status === 'sent', simulated);
  check('…on a path that is deliberately not billed', simulated.provider === 'auto_gateway', simulated);
  check(
    '…so the meter is unchanged',
    (await usageFor('chokepoint', periodKey())).sent === 1,
    await usageFor('chokepoint', periodKey())
  );

  report();
})();
