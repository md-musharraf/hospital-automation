/**
 * Which day a booking actually lands on.
 *
 * A token is not always for right now. Somebody booking at 9pm is booking for
 * tomorrow's OPD, and somebody booking into a day whose token limit is already
 * spent is booking for the day after that. Both used to be handled — badly — in
 * two different places: the chat refused a full day outright ("come tomorrow"),
 * and `finalizeBooking` read the next sitting only to decide what to PRINT. So
 * the patient was told to come tomorrow while the token, if one was written at
 * all, said today.
 *
 * This is the one function that answers the question, and every booking goes
 * through it. It reads the doctor's OWN schedule — their shifts, or the printed
 * OPD hours those fall back to, with today's late-start override applied — and
 * never a platform-wide guess about when a hospital is open.
 *
 * A doctor with no schedule at all is treated as sitting now, exactly as before:
 * an empty schedule is the state every facility was in before shifts existed,
 * and reading it as "closed" would take them all off the board at once. Their
 * bookings can still roll forward on capacity.
 */

import { firstSittingOn, localDateKey, sittingStatus, isOnLeave } from './shiftHelper';
import { isDoctorFull } from './queueHelper';

/** How many days ahead a booking may roll before we admit there is no room. */
export const MAX_ROLL_DAYS = 7;

export interface BookingSlot {
  /** When the patient is actually seen. */
  scheduledDate: Date;
  /** That day as "YYYY-MM-DD" — what capacity is counted against. */
  appointmentDate: string;
  /** Is this for a later day than today? Drives the "come tomorrow" message. */
  isNextDay: boolean;
  /** Days rolled past a full schedule to find room. 0 for the first day tried. */
  rolledDays: number;
  /** True when every day in the window ahead is full — nothing was booked. */
  noRoom: boolean;
}

const addDays = (from: Date, days: number): Date => {
  const date = new Date(from);
  date.setDate(date.getDate() + days);
  return date;
};

/**
 * Resolve the day a new token for this doctor belongs to.
 *
 * Starts from where the doctor is right now — inside a sitting means today,
 * otherwise their next sitting, which is already tomorrow once the evening
 * shift has ended. Then rolls forward over any day whose token limit is spent.
 */
export async function resolveBookingSlot(doctor: any, now: Date = new Date()): Promise<BookingSlot> {
  const status = sittingStatus(doctor, now);

  // Where to start looking. `nextStart` is null both while sitting and for a
  // doctor with no schedule; in either case the answer is "now".
  const firstCandidate = status.nextStart && status.nextStart > now ? status.nextStart : now;

  const todayKey = localDateKey(now);
  let candidate = firstCandidate;

  for (let rolled = 0; rolled <= MAX_ROLL_DAYS; rolled++) {
    const dateKey = localDateKey(candidate);

    // A day the doctor is away is not a day a patient can be given.
    //
    // `sittingStatus` above already lands the FIRST candidate past any leave,
    // but the roll below does not go through it: when a day is full it falls
    // back to `nextDay` for any doctor whose `firstSittingOn` is null — which is
    // every doctor with no shifts configured, i.e. most small clinics. Without
    // this check, a full Monday would roll a patient straight onto the Tuesday
    // their doctor is on leave, and the booking would look perfectly normal
    // right up until they arrived.
    if (isOnLeave(doctor, candidate)) {
      const afterLeave = addDays(candidate, 1);
      candidate = firstSittingOn(doctor, afterLeave) || afterLeave;
      continue;
    }

    if (!(await isDoctorFull(doctor, dateKey))) {
      return {
        scheduledDate: candidate,
        appointmentDate: dateKey,
        isNextDay: dateKey !== todayKey,
        rolledDays: rolled,
        noRoom: false
      };
    }

    // That day is spent. Move to the doctor's next sitting after it — or, for a
    // doctor with no schedule, simply the next calendar day.
    const nextDay = addDays(candidate, 1);
    const sitting = firstSittingOn(doctor, nextDay);
    candidate = sitting || nextDay;
  }

  return {
    scheduledDate: candidate,
    appointmentDate: localDateKey(candidate),
    isNextDay: true,
    rolledDays: MAX_ROLL_DAYS,
    noRoom: true
  };
}
