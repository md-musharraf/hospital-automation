/**
 * When a doctor actually sits, and what that means for the person waiting.
 *
 * `opdHours` was a free-text label — "10:00 AM – 1:00 PM" — written for a
 * patient to read on the landing page. Nothing could compute with it, so the
 * queue behaved as though every doctor were on duty every minute of the day.
 * That produced the wrong answer in the two cases a clinic runs on:
 *
 *   - Two sittings. A doctor who takes OPD 10–1 and again 5–8 is empty at 2pm,
 *     so an empty queue was read as "no wait" and the chatbot told a patient
 *     "Approx. wait: 0 min" for a cabin nobody would be in for three hours.
 *   - Booking before the doors open. Same sum, same wrong answer, at 8am.
 *
 * A shift is therefore stored as structured time, and the wait is measured from
 * when consultation will REALLY start. `opdHours` stays as the printed label —
 * derived from the shifts rather than typed separately, so the public page and
 * the queue can no longer disagree about the same doctor.
 *
 * Times are local wall-clock at the facility, which is what a receptionist
 * means by "five o'clock". The server is pinned to FACILITY_TIMEZONE for the
 * same reason the nightly jobs are.
 */

import { OPD_DAYS } from './facilityProfile';

/** How many sittings one doctor can have in a day. Two is the real case
 *  (morning + evening); the third is slack, and a fourth is a data-entry
 *  mistake we would rather refuse than render. */
export const MAX_SHIFTS = 3;

export interface Shift {
  label: string;
  start: string; // "HH:MM", 24-hour
  end: string; // "HH:MM", 24-hour
  days: string[]; // [] means "whenever the doctor's OPD days say"
}

/** Minutes since midnight for "HH:MM"; null when it isn't a time. */
export function parseHhMm(value?: string | null): number | null {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (isNaN(hours) || isNaN(minutes) || hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** "13:05" → "1:05 PM", the form a patient reads. */
export function formatHhMm(value?: string | null): string {
  const total = parseHhMm(value);
  if (total === null) return '';
  const minutes = total % 60;
  let hours = Math.floor(total / 60);
  const meridiem = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${String(minutes).padStart(2, '0')} ${meridiem}`;
}

/** Short day name for a Date, in the same vocabulary as `opdDays`. */
export function dayName(date: Date = new Date()): string {
  return OPD_DAYS[(date.getDay() + 6) % 7]; // JS weeks start Sunday; ours start Mon.
}

/**
 * A date as "YYYY-MM-DD" in LOCAL time.
 *
 * Deliberately not `toISOString().slice(0, 10)`, which converts to UTC first —
 * for a facility in IST that returns yesterday's date for the whole evening
 * OPD, so an override set at 6pm would be filed against the wrong day and never
 * apply.
 */
export function localDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export interface ShiftOverride {
  date: string;
  shiftIndex: number;
  start: string;
  end?: string;
  reason?: string;
}

/** This doctor's override for `date`, or null. Last one written wins. */
export function overrideFor(doctor: any, date: Date = new Date()): ShiftOverride | null {
  const overrides = (doctor && Array.isArray(doctor.shiftOverrides) && doctor.shiftOverrides) || [];
  const key = localDateKey(date);

  let found: ShiftOverride | null = null;
  for (const entry of overrides) {
    if (!entry || entry.date !== key) continue;
    if (parseHhMm(entry.start) === null) continue;
    found = entry; // A doctor who pushes 11:00 to 11:30 and then to 12:00 means 12:00.
  }
  return found;
}

// ── Leave ───────────────────────────────────────────────────────────────────
//
// A doctor being away for a stretch of days. Everything below compares
// "YYYY-MM-DD" strings with `<=` and `>=`, which is exact for this format
// because it is fixed-width and most-significant-first — the same property that
// makes it sort correctly. Doing it with Date objects would drag a timezone into
// a question ("is the 26th inside the 24th–28th?") that has nothing to do with
// clocks, and that is how an evening in IST becomes yesterday.

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export interface DoctorLeave {
  from: string;
  to: string;
  reason?: string;
  by?: string;
}

/**
 * The longest single leave anyone can file.
 *
 * Not a policy about holidays — a guard against a slip in the year field. `to:
 * '2027-08-28'` instead of `'2026-08-28'` would take a doctor off every booking
 * screen for a year, and the symptom (patients quietly routed elsewhere) is one
 * nobody reports as a bug.
 */
export const MAX_LEAVE_DAYS = 180;

/** A day count between two date keys, inclusive of both ends. */
export function daysBetweenKeys(from: string, to: string): number {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}

/** Shift a "YYYY-MM-DD" key by whole days, staying in local time. */
export function addDaysToKey(key: string, days: number): string {
  const date = new Date(`${key}T00:00:00`);
  if (isNaN(date.getTime())) return key;
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

/**
 * "2026-08-28" → "28 Aug". How a date is said to a patient.
 *
 * Never the numeric form: "08/28" and "28/08" are the same six characters to a
 * clinic in Patna and to whoever wrote the code, and they mean months apart.
 */
export function formatDateKey(key?: string | null): string {
  const raw = String(key || '').trim();
  if (!DATE_KEY.test(raw)) return '';
  const date = new Date(`${raw}T00:00:00`);
  if (isNaN(date.getTime())) return '';
  return `${date.getDate()} ${MONTH_NAMES[date.getMonth()]}`;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A stored leave as a usable range, or null if it is malformed. */
function leaveRange(entry: any): { from: string; to: string } | null {
  if (!entry) return null;
  const from = String(entry.from || '').trim();
  let to = String(entry.to || '').trim() || from;
  if (!DATE_KEY.test(from) || !DATE_KEY.test(to)) return null;
  // A reversed range is a typo. Reading it as "covers nothing" is the dangerous
  // repair: the doctor looks available, patients keep being booked, and the
  // absence is discovered by whoever travelled in. Straighten it instead.
  if (to < from) to = from;
  return { from, to };
}

/** The leave covering `date`, or null. */
export function leaveOn(doctor: any, date: Date = new Date()): DoctorLeave | null {
  const leaves = (doctor && Array.isArray(doctor.leaves) && doctor.leaves) || [];
  const key = localDateKey(date);

  for (const entry of leaves) {
    const range = leaveRange(entry);
    if (!range) continue;
    if (key >= range.from && key <= range.to) {
      return { ...range, reason: (entry && entry.reason) || '', by: (entry && entry.by) || '' };
    }
  }
  return null;
}

/** Is this doctor away on `date`? */
export function isOnLeave(doctor: any, date: Date = new Date()): boolean {
  return leaveOn(doctor, date) !== null;
}

/**
 * The first date this doctor is back, as a key — the day after the leave they
 * are currently inside. Null when they are not on leave.
 *
 * Chained: back-to-back leaves ("24th–26th" then "27th–28th") are one absence to
 * the patient standing at the counter, and telling them to come on the 27th
 * because that is where one row happens to end is worse than not telling them.
 */
export function backOnKey(doctor: any, date: Date = new Date()): string | null {
  const leave = leaveOn(doctor, date);
  if (!leave) return null;

  let next = addDaysToKey(leave.to, 1);
  // Bounded by MAX_LEAVE_DAYS so a cycle in bad data cannot spin here.
  for (let guard = 0; guard < MAX_LEAVE_DAYS; guard++) {
    const following = leaveOn(doctor, new Date(`${next}T00:00:00`));
    if (!following) break;
    next = addDaysToKey(following.to, 1);
  }
  return next;
}

/** Leaves that have not finished yet, soonest first — what a console lists. */
export function upcomingLeaves(doctor: any, from: Date = new Date()): DoctorLeave[] {
  const leaves = (doctor && Array.isArray(doctor.leaves) && doctor.leaves) || [];
  const today = localDateKey(from);

  return leaves
    .map((entry: any) => {
      const range = leaveRange(entry);
      if (!range) return null;
      return { ...range, reason: (entry && entry.reason) || '', by: (entry && entry.by) || '' };
    })
    .filter((leave: DoctorLeave | null): leave is DoctorLeave => Boolean(leave) && leave!.to >= today)
    .sort((a: DoctorLeave, b: DoctorLeave) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
}

/**
 * Coerce a posted leave into something storable, or throw with the reason.
 *
 * Throws rather than returning null because every failure here has a specific
 * cause the person filing it can fix, and "leave not saved" with no reason is
 * how a doctor ends up believing they are marked away when they are not.
 */
export function normalizeLeave(input: any): DoctorLeave {
  const from = String((input && input.from) || '').trim();
  const to = String((input && input.to) || '').trim() || from;

  if (!DATE_KEY.test(from)) throw new Error('Give a start date as YYYY-MM-DD.');
  if (!DATE_KEY.test(to)) throw new Error('Give an end date as YYYY-MM-DD, or leave it blank for one day.');

  const range = { from, to: to < from ? from : to };
  const days = daysBetweenKeys(range.from, range.to);
  if (days < 1) throw new Error('That is not a real date range.');
  if (days > MAX_LEAVE_DAYS) {
    throw new Error(`A single leave cannot be longer than ${MAX_LEAVE_DAYS} days — check the year.`);
  }

  return {
    ...range,
    reason: String((input && input.reason) || '')
      .trim()
      .slice(0, 200),
    by: String((input && input.by) || '')
      .trim()
      .slice(0, 80)
  };
}

/**
 * Drop leaves that finished before `keepDate`. Returns whether anything changed.
 *
 * Mirrors `pruneOverrides`, and is called from the same nightly job. Unlike an
 * override, a leave is kept for the whole of its last day — a leave ending today
 * still explains why the cabin is dark this afternoon.
 */
export function pruneLeaves(doctor: any, keepDate: Date = new Date()): boolean {
  const leaves = (doctor && Array.isArray(doctor.leaves) && doctor.leaves) || [];
  if (leaves.length === 0) return false;

  const today = localDateKey(keepDate);
  const kept = leaves.filter((entry: any) => {
    const range = leaveRange(entry);
    // Malformed rows are dropped here too: they can never match a date, so all
    // they do is grow the document forever.
    return Boolean(range) && range!.to >= today;
  });

  if (kept.length === leaves.length) return false;
  doctor.leaves = kept;
  return true;
}

/**
 * The doctor's sittings for `date`, with today's delay applied.
 *
 * Every reader of the schedule goes through this rather than `doctor.shifts`
 * directly, so the queue estimate, the printed OPD hours and the patient's
 * tracker cannot disagree about when consultation actually starts.
 */
export function effectiveShifts(doctor: any, date: Date = new Date()): Shift[] {
  const shifts: Shift[] = scheduledShifts(doctor);
  const override = overrideFor(doctor, date);
  if (!override) return shifts;

  return shifts.map((shift, index) => {
    if (index !== override.shiftIndex) return shift;

    const revisedEnd = override.end && parseHhMm(override.end) !== null ? override.end : shift.end;
    // A start pushed past its own end would make the sitting vanish; keeping the
    // original end in that case leaves a short sitting rather than none.
    const endIsSane = parseHhMm(revisedEnd) !== null;
    return {
      ...(typeof (shift as any).toObject === 'function' ? (shift as any).toObject() : shift),
      start: override.start,
      end: endIsSane ? revisedEnd : shift.end
    };
  });
}

/**
 * Coerce whatever a client posted into storable shifts.
 *
 * Anything without a valid start AND end is dropped rather than stored half
 * formed — a shift with no end time cannot be reasoned about, and a queue that
 * silently ignores a malformed row is easier to trust than one that guesses.
 * Overnight shifts (end before start, e.g. 22:00–02:00) are accepted and
 * treated as running past midnight.
 */
export function normalizeShifts(input: any): Shift[] {
  if (!Array.isArray(input)) return [];

  const out: Shift[] = [];
  for (const raw of input.slice(0, MAX_SHIFTS)) {
    if (!raw || typeof raw !== 'object') continue;

    const start = String(raw.start || '').trim();
    const end = String(raw.end || '').trim();
    if (parseHhMm(start) === null || parseHhMm(end) === null) continue;

    const asked = (Array.isArray(raw.days) ? raw.days : [])
      .map((d: any) =>
        String(d || '')
          .slice(0, 3)
          .toLowerCase()
      )
      .filter(Boolean);

    out.push({
      label: String(raw.label || '')
        .trim()
        .slice(0, 24),
      start,
      end,
      days: OPD_DAYS.filter((day) => asked.includes(day.toLowerCase()))
    });
  }
  return out;
}

/** The printed label for a public page: "10:00 AM – 1:00 PM · 5:00 PM – 8:00 PM". */
export function shiftsToOpdHours(shifts?: Shift[] | null): string {
  if (!Array.isArray(shifts) || shifts.length === 0) return '';
  return shifts
    .map((s) => `${formatHhMm(s.start)} – ${formatHhMm(s.end)}`)
    .filter((s) => s !== ' – ')
    .join(' · ')
    .slice(0, 60);
}

// The word forms carry \b so a separator can never be found inside a word — an
// unbounded "se" would cut a label in half at a place no time follows, and the
// whole sitting would be dropped for a reason nobody could see.
/** How the two halves of one sitting are separated: "10:00 AM – 1:00 PM". */
const RANGE_SEPARATOR = /\s*(?:–|—|−|-|\bto\b|\btill\b|\buntil\b|\bse\b)\s*/i;

/** How two sittings are separated: "10 AM – 1 PM · 5 PM – 8 PM". */
const SITTING_SEPARATOR = /\s*(?:·|•|\||;|,|&|\band\b)\s*/i;

/** One clock time as a patient writes it: "10", "10:30", "10 AM", "1:05pm". */
const CLOCK = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/i;

interface ClockPart {
  hours: number;
  minutes: number;
  meridiem: 'am' | 'pm' | null;
}

function readClock(raw: string): ClockPart | null {
  const match = String(raw || '')
    .trim()
    .match(CLOCK);
  if (!match) return null;

  const hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  if (isNaN(hours) || isNaN(minutes) || hours > 23 || minutes > 59) return null;

  const suffix = (match[3] || '').replace(/\./g, '').toLowerCase();
  return { hours, minutes, meridiem: suffix === 'am' || suffix === 'pm' ? (suffix as any) : null };
}

/** A part as minutes-since-midnight under an assumed meridiem. */
function atMeridiem(part: ClockPart, meridiem: 'am' | 'pm' | null): number {
  let hours = part.hours;
  if (meridiem === 'am' && hours === 12) hours = 0;
  else if (meridiem === 'pm' && hours < 12) hours += 12;
  return hours * 60 + part.minutes;
}

const hhmm = (total: number): string =>
  `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;

/**
 * Turn one printed range — "10:00 AM – 1:00 PM", "5-8 PM", "10:00-13:00" — into
 * a start/end pair, or null when it cannot be read with confidence.
 *
 * The hard part is the half that carries no AM/PM, which is how people actually
 * write these: "10:00 – 1:00 PM" and "5 – 8 PM" are both one unmarked hour
 * followed by a marked one, and they mean 10am and 5pm respectively. The rule
 * that gets both right is to assume the unmarked side shares its neighbour's
 * meridiem, and to fall back to the other only when that would run the sitting
 * backwards. Guessing wrong by twelve hours is worse than not guessing, so
 * anything still ambiguous after that is dropped.
 */
function readRange(raw: string): { start: string; end: string } | null {
  const halves = String(raw || '')
    .trim()
    .split(RANGE_SEPARATOR)
    .map((s) => s.trim())
    .filter(Boolean);
  if (halves.length !== 2) return null;

  const from = readClock(halves[0]);
  const to = readClock(halves[1]);
  if (!from || !to) return null;

  let startMins = atMeridiem(from, from.meridiem);
  let endMins = atMeridiem(to, to.meridiem);

  if (from.meridiem === null && to.meridiem !== null) {
    const sameSide = atMeridiem(from, to.meridiem);
    startMins = sameSide < endMins ? sameSide : atMeridiem(from, to.meridiem === 'pm' ? 'am' : 'pm');
  } else if (to.meridiem === null && from.meridiem !== null) {
    const sameSide = atMeridiem(to, from.meridiem);
    endMins = sameSide > startMins ? sameSide : atMeridiem(to, from.meridiem === 'pm' ? 'am' : 'pm');
  } else if (from.meridiem === null && to.meridiem === null && endMins <= startMins) {
    // No marks at all. "10:00-13:00" is 24-hour and already reads correctly;
    // "10-1" is a morning OPD written the short way, so the end is an
    // afternoon. If that still does not move forward, the label was not a
    // range we understand and the check below drops it.
    endMins = atMeridiem(to, 'pm');
  }

  // A sitting that does not move forward was misread, not written badly. An
  // overnight OPD is real but cannot be told apart from a bad guess here, so it
  // stays a job for the structured editor.
  if (endMins <= startMins) return null;

  return { start: hhmm(startMins), end: hhmm(endMins) };
}

/**
 * Read the PRINTED OPD hours back into computable sittings — the inverse of
 * `shiftsToOpdHours`.
 *
 * `opdHours` is free text, and until now it was the only place most facilities
 * ever recorded when their doctors sit: the admin panel's onboarding form asks
 * for "10:00 AM – 1:00 PM" and stores exactly that, while structured `shifts`
 * are only ever filled in by a doctor who signs in personally and opens the
 * schedule panel. So in practice `doctor.shifts` was empty almost everywhere,
 * every doctor read as "unscheduled" — which `sittingStatus` treats as sitting
 * around the clock — and the wait quoted at 7am counted from 7am. A patient
 * booking the second slot of a 10am OPD was told "about 10 min".
 *
 * The label is the facility's own statement of its hours, so honouring it is
 * not a guess. Anything unreadable yields nothing and the old
 * always-available behaviour stands.
 */
export function shiftsFromOpdHours(label?: string | null): Shift[] {
  if (typeof label !== 'string' || !label.trim()) return [];

  const out: Shift[] = [];
  for (const chunk of label.split(SITTING_SEPARATOR)) {
    if (out.length >= MAX_SHIFTS) break;
    const range = readRange(chunk);
    if (!range) continue;
    out.push({ label: '', start: range.start, end: range.end, days: [] });
  }
  return out;
}

/**
 * This doctor's standing sittings, from wherever they are actually recorded.
 *
 * Structured `shifts` win whenever they hold anything usable — they are the
 * editable truth, and their INDEXES are what `shiftOverrides.shiftIndex` points
 * at. The printed label is the fallback, so a facility that only ever filled in
 * the onboarding form still gets a queue that knows when its doctors sit.
 *
 * Every reader goes through this rather than `doctor.shifts`, so the estimate,
 * the printed hours and today's delay cannot disagree about which list they are
 * indexing into.
 */
export function scheduledShifts(doctor: any): Shift[] {
  const stored: Shift[] = (doctor && Array.isArray(doctor.shifts) && doctor.shifts) || [];
  const usable = stored.filter((s) => parseHhMm(s.start) !== null && parseHhMm(s.end) !== null);
  // The stored list, not the filtered one: dropping a malformed row would shift
  // every index after it out from under the overrides.
  if (usable.length > 0) return stored;
  return shiftsFromOpdHours(doctor && doctor.opdHours);
}

/** Does this shift run on `date`? An empty `days` falls back to the doctor's OPD days. */
export function shiftRunsOn(shift: Shift, doctor: any, date: Date): boolean {
  // Leave beats the roster, and it is checked here rather than at each screen on
  // purpose. `sittingStatus` and `firstSittingOn` both funnel through this
  // function, and everything a patient or a receptionist sees about when a
  // doctor sits funnels through those two — the chatbot's doctor list, the
  // printed OPD hours, the landing page, the wait estimate, the floor board.
  // One line here is what stops those disagreeing about an absent doctor the
  // way they once disagreed about a late one.
  if (isOnLeave(doctor, date)) return false;

  const today = dayName(date);
  if (shift.days && shift.days.length > 0) return shift.days.includes(today);

  const opdDays = (doctor && Array.isArray(doctor.opdDays) && doctor.opdDays) || [];
  // A doctor who has never filled in their OPD days is treated as sitting every
  // day. Reading "no days listed" as "never available" would take an entire
  // facility off the board the moment shifts were introduced.
  return opdDays.length === 0 || opdDays.includes(today);
}

/** A shift's start and end as real instants on `date`, ends rolled past midnight. */
function shiftWindow(shift: Shift, date: Date): { start: Date; end: Date } | null {
  const startMins = parseHhMm(shift.start);
  const endMins = parseHhMm(shift.end);
  if (startMins === null || endMins === null) return null;

  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setMinutes(startMins);

  const end = new Date(start);
  end.setMinutes(
    end.getMinutes() + (endMins > startMins ? endMins - startMins : 24 * 60 - startMins + endMins)
  );

  return { start, end };
}

export interface SittingStatus {
  /** Is the doctor inside a sitting right now? */
  sitting: boolean;
  /** Minutes until consultation next starts. 0 while sitting. */
  minutesUntilStart: number;
  /** When the next sitting begins, or null if none is scheduled ahead. */
  nextStart: Date | null;
  /** The shift the answer came from. */
  shift: Shift | null;
  /** True when the doctor keeps no shifts at all — treat as always available. */
  unscheduled: boolean;
  /**
   * The leave covering `now`, when there is one.
   *
   * Reported separately rather than folded into `sitting: false`, because "the
   * cabin is shut until 5pm" and "the doctor is away until Friday" lead to
   * completely different sentences — and the second one is the only reason a
   * patient should be sent to a different doctor rather than told to come back.
   */
  onLeave: DoctorLeave | null;
  /** First date they are back, as "YYYY-MM-DD". Null unless on leave. */
  backOn: string | null;
}

/**
 * Where this doctor is in their day.
 *
 * A doctor with no shifts is "always sitting". That is the honest reading of an
 * empty schedule, and it keeps every facility that has not filled this in
 * behaving exactly as it did before shifts existed.
 *
 * Looks up to 7 days ahead so a Tue/Thu consultant booked on a Friday still
 * gets a real answer instead of falling through to "available now".
 *
 * Today's shifts are the OVERRIDDEN ones — a doctor who has pushed their 11:00
 * start to 11:30 is not "sitting" at 11:15, and the wait quoted to a patient
 * counts from 11:30. Later days use the standing schedule, because an override
 * is only ever about today.
 */
export function sittingStatus(doctor: any, now: Date = new Date()): SittingStatus {
  const standing: Shift[] = scheduledShifts(doctor);
  const unscheduled =
    standing.filter((s) => parseHhMm(s.start) !== null && parseHhMm(s.end) !== null).length === 0;

  const leave = leaveOn(doctor, now);
  const backOn = leave ? backOnKey(doctor, now) : null;

  if (unscheduled) {
    // "No shifts" normally means "sits whenever", and that reading is what keeps
    // every facility that never filled this in working. A leave is the one dated
    // fact we DO have about such a doctor, so it has to win — otherwise the
    // clinics most likely to be on leave (small ones, no shifts configured) are
    // exactly the ones where leave does nothing.
    if (!leave) {
      return {
        sitting: true,
        minutesUntilStart: 0,
        nextStart: null,
        shift: null,
        unscheduled: true,
        onLeave: null,
        backOn: null
      };
    }

    // They keep no hours, so the honest answer for when they resume is the
    // start of the first day they are back, not an invented clock time.
    const resumes = backOn ? new Date(`${backOn}T00:00:00`) : null;
    return {
      sitting: false,
      minutesUntilStart:
        resumes && resumes > now ? Math.max(0, Math.round((resumes.getTime() - now.getTime()) / 60000)) : 0,
      nextStart: resumes,
      shift: null,
      unscheduled: true,
      onLeave: leave,
      backOn
    };
  }

  let best: { start: Date; shift: Shift } | null = null;

  for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
    const date = new Date(now);
    date.setDate(date.getDate() + dayOffset);

    const usable = effectiveShifts(doctor, date).filter(
      (s) => parseHhMm(s.start) !== null && parseHhMm(s.end) !== null
    );

    for (const shift of usable) {
      if (!shiftRunsOn(shift, doctor, date)) continue;
      const window = shiftWindow(shift, date);
      if (!window) continue;

      // Inside a sitting — nothing to wait for.
      if (now >= window.start && now < window.end) {
        return {
          sitting: true,
          minutesUntilStart: 0,
          nextStart: null,
          shift,
          unscheduled: false,
          onLeave: null,
          backOn: null
        };
      }
      if (window.start > now && (!best || window.start < best.start)) {
        best = { start: window.start, shift };
      }
    }

    // Only stop once a candidate is found AND we are past the day it starts on,
    // so an evening shift today still beats a morning shift tomorrow.
    if (best && dayOffset >= 1) break;
  }

  if (!best) {
    // Scheduled, but nothing within the week ahead. Refusing to estimate is
    // better than inventing a number; callers fall back to queue-length maths.
    //
    // A leave longer than the scan window lands here, which is why `onLeave` is
    // still reported: "nothing found" and "away until the 14th" look identical
    // in the other fields, and only one of them can be explained to a patient.
    return {
      sitting: false,
      minutesUntilStart: 0,
      nextStart: null,
      shift: null,
      unscheduled: false,
      onLeave: leave,
      backOn
    };
  }

  return {
    sitting: false,
    minutesUntilStart: Math.max(0, Math.round((best.start.getTime() - now.getTime()) / 60000)),
    nextStart: best.start,
    shift: best.shift,
    unscheduled: false,
    onLeave: leave,
    backOn
  };
}

/**
 * The lead time to add to a wait estimate: how long before the doctor is even
 * in the room. Zero while sitting, so nothing changes for a live OPD.
 */
/**
 * The doctor's first sitting on a given calendar day, or null if they do not sit.
 *
 * `sittingStatus` answers "what is next from right now", which is the wrong
 * question once a booking has to be placed on a SPECIFIC day — a patient rolled
 * past a full Tuesday needs Wednesday's start time, not the next start from now.
 * Overrides only ever describe today, so `effectiveShifts` applies them for
 * today and the standing schedule answers for every later day.
 */
export function firstSittingOn(doctor: any, date: Date): Date | null {
  const usable = effectiveShifts(doctor, date).filter(
    (s) => parseHhMm(s.start) !== null && parseHhMm(s.end) !== null
  );

  let earliest: Date | null = null;
  for (const shift of usable) {
    if (!shiftRunsOn(shift, doctor, date)) continue;
    const window = shiftWindow(shift, date);
    if (!window) continue;
    if (!earliest || window.start < earliest) earliest = window.start;
  }
  return earliest;
}

export function shiftLeadMinutes(doctor: any, now: Date = new Date()): number {
  return sittingStatus(doctor, now).minutesUntilStart;
}

/**
 * The sitting hours to PRINT today: "10:00 AM – 1:00 PM · 5:00 PM – 8:00 PM",
 * with a delay already folded in.
 *
 * `doctor.opdHours` is the standing label and stays untouched, because the
 * standing schedule has not changed. Screens that show a patient what is
 * happening now — the landing page, the waiting-room display, the tracker —
 * call this instead, so nothing ever announces 11:00 for a doctor who has said
 * they will arrive at 11:30.
 */
export function todayOpdHours(doctor: any, now: Date = new Date()): string {
  const hours = shiftsToOpdHours(effectiveShifts(doctor, now));
  return hours || (doctor && doctor.opdHours) || '';
}

export interface DelayNotice {
  /** Is today's schedule revised at all? */
  delayed: boolean;
  /** How many minutes later than the standing start, when known. */
  minutesLate: number;
  /** The original start, as printed: "11:00 AM". */
  originalStart: string;
  /** The revised start, as printed: "11:30 AM". */
  revisedStart: string;
  /** Whatever the doctor typed, e.g. "stuck in traffic". */
  reason: string;
  /** A whole sentence a patient can read. Empty when not delayed. */
  message: string;
}

/**
 * Today's delay, described the way a patient needs to hear it.
 *
 * Returns `delayed: false` rather than throwing or guessing when there is no
 * override — every caller renders the banner only when this says so.
 */
export function delayNotice(doctor: any, now: Date = new Date()): DelayNotice {
  const none: DelayNotice = {
    delayed: false,
    minutesLate: 0,
    originalStart: '',
    revisedStart: '',
    reason: '',
    message: ''
  };

  const override = overrideFor(doctor, now);
  if (!override) return none;

  const shifts: Shift[] = scheduledShifts(doctor);
  const original = shifts[override.shiftIndex];
  if (!original) return none;

  const originalMins = parseHhMm(original.start);
  const revisedMins = parseHhMm(override.start);
  if (originalMins === null || revisedMins === null) return none;

  const minutesLate = Math.max(0, revisedMins - originalMins);
  const label = original.label ? `${original.label} OPD` : 'OPD';
  const revisedStart = formatHhMm(override.start);

  return {
    delayed: true,
    minutesLate,
    originalStart: formatHhMm(original.start),
    revisedStart,
    reason: override.reason || '',
    message:
      `${label} is running ${minutesLate} min late today — ${doctor.name || 'the doctor'} now starts at ${revisedStart}.` +
      (override.reason ? ` (${override.reason})` : '')
  };
}

/**
 * Drop overrides that are not for `keepDate`.
 *
 * Called by the nightly reset. Yesterday's delay is not wrong so much as noise:
 * it never matches a lookup, but it accumulates one sub-document per late day
 * forever, and a doctor's record should not grow without bound.
 */
export function pruneOverrides(doctor: any, keepDate: Date = new Date()): boolean {
  const overrides = (doctor && Array.isArray(doctor.shiftOverrides) && doctor.shiftOverrides) || [];
  if (overrides.length === 0) return false;

  const key = localDateKey(keepDate);
  const kept = overrides.filter((entry: any) => entry && entry.date === key);
  if (kept.length === overrides.length) return false;

  doctor.shiftOverrides = kept;
  return true;
}

/** "Evening OPD (5:00 PM)" — how a sitting is named in a patient's message. */
export function describeNextSitting(doctor: any, now: Date = new Date()): string {
  const status = sittingStatus(doctor, now);
  if (status.sitting || !status.shift || !status.nextStart) return '';

  const label = status.shift.label ? `${status.shift.label} ` : '';
  const clock = formatHhMm(status.shift.start);
  const sameDay = status.nextStart.toDateString() === now.toDateString();
  return `${label}OPD ${sameDay ? 'at' : `on ${dayName(status.nextStart)} at`} ${clock}`.trim();
}
