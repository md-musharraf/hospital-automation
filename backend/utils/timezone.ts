/**
 * Pin the process to the facility's wall clock. Imported FIRST, before anything
 * that can read a date.
 *
 * Every date decision in this platform is wall-clock reasoning: a shift starting
 * at "09:30", an OPD day that ends at midnight, a token dated "2026-08-20". All
 * of it is built with `setHours`, `getHours` and `toLocaleTimeString`, which
 * read the PROCESS timezone — and on a cloud host that is UTC unless somebody
 * says otherwise.
 *
 * Nobody had. `FACILITY_TIMEZONE` was passed to the cron schedules and to
 * nothing else, while `shiftHelper` documented the server as "pinned to
 * FACILITY_TIMEZONE" — a comment describing an intention rather than a fact.
 * For an Indian facility every printed time was therefore 5½ hours early: a
 * doctor whose OPD was set for 9:31 AM was announced to patients as sitting at
 * 4:01 AM, and a patient booking at 9:30 AM was told their turn was at 4:11 AM,
 * a time that had already passed. The queue was right and the clock was wrong,
 * which is the hardest version of this bug to see.
 *
 * Setting `TZ` here fixes every one of those call sites at once, rather than
 * rewriting several hundred date expressions and hoping none is missed. Node
 * re-reads the zone on the next date operation, so this takes effect as long as
 * it runs before the first one — hence the import-first rule above.
 */

export const FACILITY_TIMEZONE: string = process.env.FACILITY_TIMEZONE || 'Asia/Kolkata';

/**
 * Apply it. Returns the zone in force, so a caller can log what it actually got
 * rather than what it asked for.
 */
export function pinFacilityTimezone(): string {
  // An explicit TZ from the host wins: somebody who set it meant it, and
  // overriding that would make a deliberate deployment choice unexplainable.
  if (!process.env.TZ) {
    process.env.TZ = FACILITY_TIMEZONE;
  }

  try {
    // Proves the zone actually resolved. An invalid name leaves the process on
    // UTC silently, which is the failure this file exists to prevent.
    return Intl.DateTimeFormat().resolvedOptions().timeZone || process.env.TZ || 'UTC';
  } catch (_) {
    return process.env.TZ || 'UTC';
  }
}

/** The zone in force, applied at import. */
export const ACTIVE_TIMEZONE: string = pinFacilityTimezone();
