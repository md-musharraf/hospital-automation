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

/** Does this shift run on `date`? An empty `days` falls back to the doctor's OPD days. */
export function shiftRunsOn(shift: Shift, doctor: any, date: Date): boolean {
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
 */
export function sittingStatus(doctor: any, now: Date = new Date()): SittingStatus {
  const shifts: Shift[] = (doctor && Array.isArray(doctor.shifts) && doctor.shifts) || [];
  const usable = shifts.filter((s) => parseHhMm(s.start) !== null && parseHhMm(s.end) !== null);

  if (usable.length === 0) {
    return { sitting: true, minutesUntilStart: 0, nextStart: null, shift: null, unscheduled: true };
  }

  let best: { start: Date; shift: Shift } | null = null;

  for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
    const date = new Date(now);
    date.setDate(date.getDate() + dayOffset);

    for (const shift of usable) {
      if (!shiftRunsOn(shift, doctor, date)) continue;
      const window = shiftWindow(shift, date);
      if (!window) continue;

      // Inside a sitting — nothing to wait for.
      if (now >= window.start && now < window.end) {
        return { sitting: true, minutesUntilStart: 0, nextStart: null, shift, unscheduled: false };
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
    return { sitting: false, minutesUntilStart: 0, nextStart: null, shift: null, unscheduled: false };
  }

  return {
    sitting: false,
    minutesUntilStart: Math.max(0, Math.round((best.start.getTime() - now.getTime()) / 60000)),
    nextStart: best.start,
    shift: best.shift,
    unscheduled: false
  };
}

/**
 * The lead time to add to a wait estimate: how long before the doctor is even
 * in the room. Zero while sitting, so nothing changes for a live OPD.
 */
export function shiftLeadMinutes(doctor: any, now: Date = new Date()): number {
  return sittingStatus(doctor, now).minutesUntilStart;
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
