/**
 * The clock every printed time is read in.
 *
 * This platform reasons in wall-clock time everywhere: a shift stored as
 * "09:30", an OPD day that ends at midnight, a token dated "2026-08-20", a turn
 * quoted as "9:41 AM". All of it is built from `setHours`, `getHours` and
 * `toLocaleTimeString`, every one of which reads the PROCESS timezone — and on
 * a cloud host that is UTC unless something says otherwise.
 *
 * Nothing did. `FACILITY_TIMEZONE` was handed to the cron schedules and to
 * nothing else, while `shiftHelper` described the server as "pinned to
 * FACILITY_TIMEZONE" — an intention, not a fact. For an Indian facility every
 * patient-facing time was therefore 5½ hours early. A doctor whose OPD was set
 * for 9:31 AM was announced as sitting at 4:01 AM, and a patient booking at
 * 9:30 AM was told their turn was 4:11 AM — a time that had already passed.
 *
 * The queue was never wrong. Only the clock it was quoted in was, which is why
 * nothing in the logs looked broken.
 *
 * Checked by starting real child processes, because the thing under test is
 * what a process inherits at boot; asserting it inside this one would only
 * prove what this one already happens to have.
 */
const { execFileSync } = require('child_process');
const path = require('path');
const { section, check, report } = require('./helpers/assert');

const { BACKEND_DIST: BACKEND } = require('./helpers/backendPath');
const TZ_MODULE = path.join(BACKEND, 'utils', 'timezone.js').replace(/\\/g, '/');

/** Run a snippet in a fresh node process with a controlled environment. */
function inFreshProcess(script, env) {
  const out = execFileSync(process.execPath, ['-e', script], {
    env: { ...process.env, ...env },
    encoding: 'utf8'
  });
  return JSON.parse(out.trim().split('\n').pop());
}

(async () => {
  section('The process is pinned to the facility’s clock, not the host’s');

  // A host in UTC — which is every cloud region this deploys to by default.
  const pinned = inFreshProcess(
    `const t = require('${TZ_MODULE}');
     // Offset rather than name: ICU normalises Asia/Kolkata to its older IANA
     // spelling Asia/Calcutta on some platforms, and they are the same zone.
     // What has to be true is the clock, not the label.
     const jan = new Date('2026-01-15T00:00:00Z');
     console.log(JSON.stringify({ active: t.ACTIVE_TIMEZONE, tz: process.env.TZ,
       resolved: Intl.DateTimeFormat().resolvedOptions().timeZone,
       offsetMinutes: -jan.getTimezoneOffset() }));`,
    { TZ: '', FACILITY_TIMEZONE: 'Asia/Kolkata' }
  );
  check('An unset host timezone is replaced by the facility’s', pinned.tz === 'Asia/Kolkata', pinned);
  check('…and the process really runs 5h30m ahead of UTC', pinned.offsetMinutes === 330, pinned);
  check(
    '…on a zone that resolved rather than silently falling back to UTC',
    /Asia\/(Kolkata|Calcutta)/.test(pinned.resolved),
    pinned
  );

  // Somebody who set TZ on the host meant it; overriding that would make a
  // deliberate deployment choice impossible to explain.
  const explicit = inFreshProcess(
    `const t = require('${TZ_MODULE}');
     console.log(JSON.stringify({ tz: process.env.TZ }));`,
    { TZ: 'UTC', FACILITY_TIMEZONE: 'Asia/Kolkata' }
  );
  check('An explicit host timezone is left alone', explicit.tz === 'UTC', explicit);

  // A facility outside India is configured, not assumed.
  const elsewhere = inFreshProcess(
    `const t = require('${TZ_MODULE}');
     console.log(JSON.stringify({ tz: process.env.TZ }));`,
    { TZ: '', FACILITY_TIMEZONE: 'Asia/Dubai' }
  );
  check('The zone is configuration, not a hardcoded India', elsewhere.tz === 'Asia/Dubai', elsewhere);

  section('The bug this prevents, stated as a number');

  // The exact shape of the screenshot: a shift set for 09:31 local, read by a
  // process running in UTC.
  const drift = inFreshProcess(
    `const asUtc = new Date('2026-08-20T04:01:00Z');
     process.env.TZ = 'UTC';
     const utcHour = asUtc.getHours();
     process.env.TZ = 'Asia/Kolkata';
     const istHour = asUtc.getHours();
     console.log(JSON.stringify({ utcHour, istHour }));`,
    { TZ: '' }
  );
  check(
    'The same instant reads as 4am on a UTC host and 9am at the facility',
    drift.utcHour === 4 && drift.istHour === 9,
    drift
  );

  section('A quoted turn time is never in the past');

  // `formatApptTime` counts forward from now, so with the process on the
  // facility's clock it cannot name a time that has already gone by. That was
  // the visible symptom: "your approx. turn: 4:11 AM" arriving at 9:30 AM.
  const quoted = inFreshProcess(
    `require('${TZ_MODULE}');
     const { formatApptTime } = require('${path.join(BACKEND, 'utils', 'queueHelper.js').replace(/\\/g, '/')}');
     const label = formatApptTime(11);
     const now = new Date();
     const [clock, ampm] = label.split(' ');
     let [h, m] = clock.split(':').map(Number);
     if (ampm === 'PM' && h !== 12) h += 12;
     if (ampm === 'AM' && h === 12) h = 0;
     const turn = new Date(now); turn.setHours(h, m, 0, 0);
     // Crossing midnight is the one legitimate way the label can read "earlier".
     const rolled = turn.getTime() < now.getTime() - 60000 && now.getHours() >= 23;
     console.log(JSON.stringify({ label, aheadOfNow: turn.getTime() >= now.getTime() - 60000 || rolled }));`,
    { TZ: '', FACILITY_TIMEZONE: 'Asia/Kolkata' }
  );
  check(
    'The turn quoted to a patient is at or after the current facility time',
    quoted.aheadOfNow === true,
    quoted
  );

  report();
})();
