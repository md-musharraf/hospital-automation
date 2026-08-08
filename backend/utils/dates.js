/**
 * Date helpers for the OPD day.
 *
 * `startOfToday()` had been re-implemented in five files (ops, lab, pharmacy,
 * doctor, queueHelper). Identical today — but five copies is five chances to
 * drift, and a hospital's "today" boundary is exactly the kind of rule that
 * eventually changes (a night shift that rolls over at 6am, say). One
 * definition, one place to change it.
 */

/** Midnight this morning, in server local time. */
function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

/** Was `value` created during the current OPD day? Missing dates count as today. */
function isToday(value) {
  if (!value) return true;
  return new Date(value).getTime() >= startOfToday().getTime();
}

/** Keep only the records from today (the standard filter for daily stats). */
function onlyToday(records = [], field = 'createdAt') {
  return records.filter((record) => isToday(record && record[field]));
}

/** Whole minutes between two instants; 0 when either is missing. */
function minutesBetween(from, to) {
  if (!from || !to) return 0;
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000);
}

/** Minutes elapsed since `from` until now. */
function minutesSince(from) {
  return from ? minutesBetween(from, new Date()) : 0;
}

module.exports = { startOfToday, isToday, onlyToday, minutesBetween, minutesSince };
