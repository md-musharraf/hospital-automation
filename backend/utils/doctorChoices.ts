/**
 * The doctor list a patient chooses from, with the one thing they need to
 * choose well: when that doctor actually sits.
 *
 * The list used to be names and departments. A patient picking at 9pm had no
 * way to tell that one doctor opens at 9am tomorrow and another not until
 * Friday, so the choice was effectively blind and the day they were given came
 * as a surprise at the end of the booking. The same three facts the console and
 * the waiting-room screen already show — sitting hours, whether the cabin is
 * open right now, and how many are waiting — are what this puts in front of the
 * patient BEFORE they pick.
 *
 * Today's revised start is honoured, not the printed one: a doctor who has
 * pushed 11:00 to 11:30 is announced at 11:30 here, on the console, and in the
 * queue estimate, because a patient told two different start times will believe
 * the wrong one.
 */

import Queue from '../models/Queue';
import Token from '../models/Token';
import {
  sittingStatus,
  todayOpdHours,
  describeNextSitting,
  delayNotice,
  localDateKey,
  formatDateKey
} from './shiftHelper';

export interface DoctorChoice {
  /** The tappable label. Kept short — WhatsApp truncates a list row at 24 chars. */
  option: string;
  /** The line describing this doctor in the message body. */
  line: string;
  /**
   * The same facts as fields, for a client that draws a card instead of
   * printing a line. The web portal used to fill that card with a hardcoded
   * "4.9" rating and a "Free Slot" badge that was true of every doctor at every
   * hour — invented data sitting where the patient looks for real data.
   */
  card: {
    name: string;
    department: string;
    room: string;
    photoUrl: string;
    /** Printed sitting hours for today, e.g. "9:00 AM – 1:00 PM". */
    hours: string;
    /** Is the cabin open AND the doctor actually in it right now? */
    sitting: boolean;
    /** The doctor's own status: Available, In Surgery, On Break, Unavailable. */
    availability: string;
    /** Inside their hours but out of the room — they are coming back. */
    awayNow: boolean;
    /** True when this doctor keeps no fixed hours at all. */
    unscheduled: boolean;
    /** Away for a stretch of days — not merely closed for the evening. */
    onLeave: boolean;
    /** Last day of that leave, "YYYY-MM-DD". Empty when not on leave. */
    leaveUntil: string;
    /** First day they are back, "YYYY-MM-DD". Empty when not on leave. */
    backOn: string;
    /** Why, when they said. Shown to the patient — "Family function" reads better than silence. */
    leaveReason: string;
    /** When they next sit, when they are not sitting now. */
    nextSitting: string;
    /** How many patients are already waiting for the day in question. */
    waiting: number;
    /** Today's revised start, when they have pushed it back. */
    revisedStart: string;
    delayReason: string;
  };
}

/** How many patients are waiting for this doctor on a given day. */
async function waitingCountFor(doctorId: any, dateKey: string): Promise<number> {
  try {
    const queue = await (Queue as any).findOne({ doctor: doctorId });
    const live = (queue && queue.activeQueue && queue.activeQueue.length) || 0;
    if (live > 0) return live;
    // Nothing live yet — for a day that has not started, count what is booked.
    const toks = await (Token as any).find({ doctor: doctorId, status: 'Waiting' });
    return (toks || []).filter((t: any) => t.appointmentDate === dateKey).length;
  } catch (_) {
    return 0;
  }
}

/**
 * Build the numbered list of doctors, each with their sitting hours and where
 * they are in their day right now.
 */
export async function describeDoctorChoices(
  doctors: any[],
  lang: string = 'en',
  now: Date = new Date()
): Promise<DoctorChoice[]> {
  const hi = lang === 'hi';

  return Promise.all(
    (doctors || []).map(async (doctor) => {
      const option = `${doctor.name} (${doctor.department})`;
      const hours = todayOpdHours(doctor, now);
      const status = sittingStatus(doctor, now);
      const delay = delayNotice(doctor, now);
      const waiting = await waitingCountFor(doctor._id, localDateKey(now));

      // What the patient is choosing between: open now, or open later, or a
      // doctor who keeps no fixed hours at all.
      //
      // Two clocks have to agree here. The shift says when this doctor sits;
      // `availabilityStatus` says what they are doing at this moment, set by
      // hand from the console. They were read separately, so a doctor who had
      // marked themselves On Break was still announced to patients as "Sitting
      // now" — the schedule was right and the room was empty.
      const standing = String(doctor.availabilityStatus || 'Available');
      const awayNow = standing === 'In Surgery' || standing === 'On Break';

      let when: string;
      // Leave is checked before everything else, including the by-hand
      // `availabilityStatus`. It is the only state here with an END DATE, so it
      // is the only one that can answer the question the patient is actually
      // asking — not "can I book now" but "when should I come". Rendering an
      // absent doctor as "Closed now" or "No fixed OPD hours" sends someone to
      // a cabin that will be dark all week.
      if (status.onLeave) {
        const back = formatDateKey(status.backOn);
        const until = formatDateKey(status.onLeave.to);
        const why = status.onLeave.reason ? ` (${status.onLeave.reason})` : '';
        when = hi
          ? `🏖️ ${until} तक छुट्टी पर${why}${back ? ` · ${back} से उपलब्ध` : ''}`
          : `🏖️ On leave until ${until}${why}${back ? ` · back on ${back}` : ''}`;
      } else if (standing === 'Unavailable') {
        const next = describeNextSitting(doctor, now);
        when = hi
          ? `⛔ अभी उपलब्ध नहीं${next ? ` · अगली बैठक: ${next}` : ''}`
          : `⛔ Not available right now${next ? ` · Next: ${next}` : ''}`;
      } else if (awayNow && (status.sitting || status.unscheduled)) {
        // Inside their hours but out of the room. The patient can still book —
        // the doctor is coming back — they simply should not be told the cabin
        // is running when it is not.
        const label = standing === 'In Surgery' ? 'In surgery' : 'On a break';
        const labelHi = standing === 'In Surgery' ? 'सर्जरी में' : 'ब्रेक पर';
        when = hi
          ? `⏸️ ${labelHi} — जल्द लौटेंगे${hours ? ` · ${hours}` : ''} · ${waiting} इंतज़ार में`
          : `⏸️ ${label} — back shortly${hours ? ` · ${hours}` : ''} · ${waiting} waiting`;
      } else if (status.unscheduled) {
        when = hi ? '🕒 समय तय नहीं — कभी भी बुक करें' : '🕒 No fixed OPD hours — bookable any time';
      } else if (status.sitting) {
        when = hi
          ? `✅ अभी बैठे हैं${hours ? ` · ${hours}` : ''} · ${waiting} इंतज़ार में`
          : `✅ Sitting now${hours ? ` · ${hours}` : ''} · ${waiting} waiting`;
      } else {
        const next = describeNextSitting(doctor, now);
        when = hi
          ? `🌙 अभी बंद${hours ? ` · समय: ${hours}` : ''}${next ? ` · अगली बैठक: ${next}` : ''}`
          : `🌙 Closed now${hours ? ` · Hours: ${hours}` : ''}${next ? ` · Next: ${next}` : ''}`;
      }

      // A late start today changes the answer for everyone in that cabin, so it
      // is said here rather than discovered on arrival.
      const lateLine = delay.delayed
        ? hi
          ? `\n   ⏰ आज ${delay.revisedStart} से शुरू${delay.reason ? ` (${delay.reason})` : ''}`
          : `\n   ⏰ Starting ${delay.revisedStart} today${delay.reason ? ` (${delay.reason})` : ''}`
        : '';

      return {
        option,
        line: `${doctor.name} — ${doctor.department}\n   ${when}${lateLine}`,
        card: {
          name: doctor.name,
          department: doctor.department || '',
          room: doctor.currentRoom || '',
          photoUrl: doctor.photoUrl || '',
          hours,
          sitting: Boolean(status.sitting) && standing !== 'Unavailable' && !awayNow,
          // Reported as false for a doctor on leave, whatever their shifts say:
          // the card's "bookable any time" hint reads off this, and an absent
          // doctor is the one person it must never be shown for.
          unscheduled: Boolean(status.unscheduled) && !status.onLeave,
          onLeave: Boolean(status.onLeave),
          leaveUntil: status.onLeave ? status.onLeave.to : '',
          backOn: status.backOn || '',
          leaveReason: (status.onLeave && status.onLeave.reason) || '',
          // What the doctor set by hand, so the card can say "on a break"
          // rather than implying an empty cabin is open.
          availability: standing,
          awayNow,
          nextSitting: status.sitting ? '' : describeNextSitting(doctor, now),
          waiting,
          revisedStart: delay.delayed ? delay.revisedStart : '',
          delayReason: delay.delayed ? delay.reason || '' : ''
        }
      };
    })
  );
}

/** The whole prompt: the ask, then one numbered entry per doctor. */
export async function doctorChoiceMessage(
  doctors: any[],
  prompt: string,
  lang: string = 'en',
  now: Date = new Date()
): Promise<{ text: string; options: string[]; doctorCards: DoctorChoice['card'][] }> {
  const choices = await describeDoctorChoices(doctors, lang, now);
  const body = choices.map((c, i) => `${i + 1}. ${c.line}`).join('\n');
  return {
    text: `${prompt}\n\n${body}`,
    options: choices.map((c) => c.option),
    // Same facts as `line`, for a client that draws a card. Sent alongside
    // rather than instead of the text, because WhatsApp only ever gets text.
    doctorCards: choices.map((c) => c.card)
  };
}
