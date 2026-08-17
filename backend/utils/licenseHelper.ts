/**
 * The subscription a facility runs on, and what happens when it lapses.
 *
 * A facility pays for a term — one month, six, twelve, twenty-four — and when
 * that term ends the consoles have to stop. The whole design question is what
 * "stop" means for software a hospital's front desk is standing at, and this
 * file answers it in one place so that answer cannot be re-decided differently
 * by each route.
 *
 * Three deliberate positions:
 *
 *  1. **Nothing is stored except what was bought.** Plan, start, expiry. The
 *     STATE — active, expiring, in grace, expired — is computed from the clock
 *     every time it is asked for. A stored `status: 'expired'` is a fact with a
 *     shelf life: it is written by a job, and the day the job does not run the
 *     platform is wrong about every tenant at once, in the direction that either
 *     locks out a paying hospital or lets a lapsed one run for free.
 *
 *  2. **A grace period, and it is not a courtesy.** Cutting a live OPD dead at
 *     midnight on the expiry date turns a billing event into a clinical one:
 *     reception cannot register the patient in front of them, the doctor's queue
 *     is gone, and nobody in that building can do anything about a payment.
 *     `GRACE_DAYS` keeps the software working while the alerts get louder, and
 *     only then does it stop. That is the difference between a business rule and
 *     an outage.
 *
 *  3. **A facility with no licence recorded is NOT expired.** Every tenant
 *     onboarded before this file existed has no licence data at all, and reading
 *     "no expiry date" as "expired at the epoch" would switch off every live
 *     facility on the platform the moment this deployed. They are grandfathered
 *     and shown as "no licence set" in the owner console, which is a prompt to
 *     act rather than a silent lockout.
 */

import Hospital from '../models/Hospital';
import logger from './logger';

/** The terms a facility can buy, in months. */
export const PLANS: Record<string, { months: number; label: string }> = {
  '1m': { months: 1, label: '1 month' },
  '6m': { months: 6, label: '6 months' },
  '12m': { months: 12, label: '12 months' },
  '24m': { months: 24, label: '2 years' }
};

/** Plan keys in the order the owner console offers them. */
export const PLAN_KEYS = Object.keys(PLANS);

/**
 * How long a new facility runs before anyone has paid.
 *
 * Onboarding a hospital and immediately locking it is nobody's intention, and
 * "we'll set the licence tomorrow" is how a real tenant gets stranded on a
 * Sunday. Fourteen days is long enough to finish setup and short enough that it
 * cannot be mistaken for the product being free.
 */
export const TRIAL_DAYS = 14;

/**
 * Days the consoles keep working AFTER the expiry date.
 *
 * See the note at the top: this is the window in which a hospital can still
 * treat patients while somebody arranges a payment. It is not silent — every day
 * inside it sends an alert and every screen carries a banner.
 */
export const GRACE_DAYS = 7;

/**
 * Days before expiry at which a renewal reminder goes out, loudest last.
 *
 * Thresholds rather than "every day from 30": a message a month out that repeats
 * daily is a message nobody reads by the time it matters. Each one fires once —
 * `license.lastRemindedDay` records which threshold has already been used.
 */
export const REMINDER_DAYS = [30, 15, 7, 3, 1];

/** A day, in milliseconds. */
const DAY = 24 * 60 * 60 * 1000;

export type LicenseStage = 'none' | 'active' | 'expiring' | 'grace' | 'expired' | 'suspended';

export interface LicenseState {
  /** Where this facility stands right now. */
  stage: LicenseStage;
  /** Is the software allowed to run? False only for `expired` and `suspended`. */
  active: boolean;
  /** Must every console refuse to work? The inverse of `active`, named for the guard that uses it. */
  blocked: boolean;
  /** Whole days until expiry. Negative once past it; null when no licence is set. */
  daysLeft: number | null;
  /** Days of grace still left once expired. 0 otherwise. */
  graceLeft: number;
  plan: string;
  planLabel: string;
  expiresAt: Date | null;
  /** A sentence for the banner, the WhatsApp and the blocked screen. */
  message: string;
}

/** Midnight-to-midnight day difference, so "expires today" is 0 and not 0.4. */
function daysBetween(from: Date, to: Date): number {
  const a = new Date(from);
  const b = new Date(to);
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / DAY);
}

/**
 * Add whole calendar months, clamped to the end of the target month.
 *
 * `setMonth` alone turns 31 January + 1 month into 3 March, because February has
 * no 31st and JavaScript rolls over rather than clamping. A licence sold on the
 * 31st would then expire two or three days later than the customer's other
 * months, every time — small, invisible, and exactly the kind of arithmetic a
 * customer eventually notices on an invoice.
 */
export function addMonths(from: Date, months: number): Date {
  const date = new Date(from);
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);

  const lastDayOfTargetMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDayOfTargetMonth));
  return date;
}

/** The licence sub-document, tolerating a facility that has none. */
function licenseOf(hospital: any): any {
  return (hospital && hospital.license) || {};
}

/**
 * Where this facility stands, computed fresh from the clock every time.
 *
 * The one function every banner, guard, sweep and console screen goes through,
 * so a facility cannot be "expired" to the middleware and "active" on the screen
 * that is supposed to explain why nothing works.
 */
export function licenseState(hospital: any, now: Date = new Date()): LicenseState {
  const license = licenseOf(hospital);
  const plan = license.plan || '';
  const planLabel = (PLANS[plan] && PLANS[plan].label) || (plan === 'trial' ? `${TRIAL_DAYS}-day trial` : '');
  const name = (hospital && hospital.name) || 'This facility';

  const base = { plan, planLabel, expiresAt: null as Date | null, graceLeft: 0 };

  // Switched off by hand from the owner console. Beats every date: a facility
  // suspended for non-payment or misuse must not come back because its term
  // happens not to have run out yet.
  if (license.status === 'Suspended') {
    return {
      ...base,
      stage: 'suspended',
      active: false,
      blocked: true,
      daysLeft: license.expiresAt ? daysBetween(now, new Date(license.expiresAt)) : null,
      expiresAt: license.expiresAt ? new Date(license.expiresAt) : null,
      message: `${name}'s account has been suspended by the platform owner. Please contact support to restore service.`
    };
  }

  // Grandfathered: onboarded before licensing existed. Never blocked — see the
  // third note at the top of this file.
  if (!license.expiresAt) {
    return {
      ...base,
      stage: 'none',
      active: true,
      blocked: false,
      daysLeft: null,
      message: `No licence term is set for ${name}. Everything keeps working; the platform owner should assign a plan.`
    };
  }

  const expiresAt = new Date(license.expiresAt);
  const daysLeft = daysBetween(now, expiresAt);

  if (daysLeft > 0) {
    const expiring = daysLeft <= REMINDER_DAYS[0];
    return {
      ...base,
      stage: expiring ? 'expiring' : 'active',
      active: true,
      blocked: false,
      daysLeft,
      expiresAt,
      message: expiring
        ? `${name}'s ${planLabel || 'licence'} ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'} (${expiresAt.toLocaleDateString()}). Renew to avoid interruption.`
        : `Licence active until ${expiresAt.toLocaleDateString()}.`
    };
  }

  // Expired today or earlier. `graceLeft` counts the days of working software
  // still owed before anything switches off.
  const graceLeft = GRACE_DAYS + daysLeft;
  if (graceLeft > 0) {
    return {
      ...base,
      stage: 'grace',
      active: true,
      blocked: false,
      daysLeft,
      graceLeft,
      expiresAt,
      message:
        `${name}'s licence expired on ${expiresAt.toLocaleDateString()}. ` +
        `Services keep running for ${graceLeft} more day${graceLeft === 1 ? '' : 's'} — renew now to avoid a shutdown.`
    };
  }

  return {
    ...base,
    stage: 'expired',
    active: false,
    blocked: true,
    daysLeft,
    expiresAt,
    message:
      `${name}'s licence expired on ${expiresAt.toLocaleDateString()} and the ${GRACE_DAYS}-day grace period is over. ` +
      `Services are paused until it is renewed.`
  };
}

/**
 * Extend a facility's term, WITHOUT throwing away time already paid for.
 *
 * Counted from the later of "now" and the current expiry, so a hospital that
 * renews a fortnight early keeps that fortnight. The naive version — always add
 * twelve months to today — silently bills for time it then deletes, and the only
 * person who notices is the customer who renewed responsibly.
 *
 * Returns the licence object to store; the caller saves it. `history` keeps
 * every term ever granted, because "when did we last renew them?" is the first
 * question asked when a facility disputes a shutdown.
 */
export function renewLicense(
  hospital: any,
  plan: string,
  options: { now?: Date; by?: string; note?: string } = {}
): any {
  const { now = new Date(), by = 'owner', note = '' } = options;
  const current = licenseOf(hospital);

  const term = PLANS[plan];
  if (!term && plan !== 'trial') {
    throw new Error(`Unknown plan "${plan}". Choose one of: ${PLAN_KEYS.join(', ')}.`);
  }

  // Never shorten. An unexpired term is time the facility already owns.
  const currentExpiry = current.expiresAt ? new Date(current.expiresAt) : null;
  const countFrom = currentExpiry && currentExpiry.getTime() > now.getTime() ? currentExpiry : now;

  const expiresAt = term
    ? addMonths(countFrom, term.months)
    : new Date(countFrom.getTime() + TRIAL_DAYS * DAY);

  const history = Array.isArray(current.history) ? current.history.slice(-19) : [];
  history.push({
    plan,
    months: term ? term.months : 0,
    at: now,
    expiresAt,
    by,
    note
  });

  return {
    plan,
    startedAt: current.startedAt || now,
    expiresAt,
    // A renewal lifts a suspension only when the owner explicitly renews — which
    // is what calling this function IS.
    status: 'Active',
    // The new term must be able to remind again; without this reset a facility
    // that renewed at three days left would never hear about the next expiry.
    lastRemindedDay: null,
    notifyPhone: current.notifyPhone || '',
    history
  };
}

/** The licence a brand-new facility starts with. */
export function trialLicense(now: Date = new Date()): any {
  return renewLicense({}, 'trial', { now, by: 'onboarding', note: 'Automatic trial at registration' });
}

/**
 * Which reminder threshold this state is due, or null.
 *
 * Returns the LARGEST threshold that has been crossed and not yet used, so a
 * facility that nobody looked at for a fortnight gets one message about where it
 * actually stands rather than four about days that have already passed.
 */
export function dueReminder(state: LicenseState, lastRemindedDay: any): number | null {
  if (state.stage === 'none' || state.stage === 'suspended') return null;

  const last = typeof lastRemindedDay === 'number' ? lastRemindedDay : null;

  // Past the expiry date: one message a day is warranted — the software is about
  // to stop. Encoded as thresholds 0 and below so the same "already sent" field
  // works for both halves of the lifecycle.
  if (state.daysLeft !== null && state.daysLeft <= 0) {
    const marker = state.daysLeft; // 0, -1, -2 …
    return last !== null && last <= marker ? null : marker;
  }

  const crossed = REMINDER_DAYS.filter((d) => (state.daysLeft as number) <= d);
  if (crossed.length === 0) return null;

  const smallest = Math.min(...crossed);
  if (last !== null && last <= smallest) return null;
  return smallest;
}

/** Bilingual renewal notice — the facility's owner reads this on WhatsApp. */
export function reminderMessage(state: LicenseState, hospitalName: string): string {
  if (state.stage === 'expired') {
    return (
      `🛑 ${hospitalName}: your CareeAi licence expired on ${state.expiresAt?.toLocaleDateString()} and the ` +
      `${GRACE_DAYS}-day grace period is over. Reception, cabins, lab and pharmacy are paused until it is renewed.\n\n` +
      `🛑 ${hospitalName}: आपका CareeAi लाइसेंस समाप्त हो चुका है और छूट अवधि भी खत्म हो गई है। ` +
      `नवीनीकरण होने तक सेवाएँ बंद रहेंगी।`
    );
  }

  if (state.stage === 'grace') {
    return (
      `⚠️ ${hospitalName}: your CareeAi licence expired on ${state.expiresAt?.toLocaleDateString()}. ` +
      `Everything keeps working for ${state.graceLeft} more day${state.graceLeft === 1 ? '' : 's'}, then services will pause. ` +
      `Please renew now.\n\n` +
      `⚠️ ${hospitalName}: आपका लाइसेंस समाप्त हो गया है। सेवाएँ ${state.graceLeft} दिन और चलेंगी, ` +
      `उसके बाद बंद हो जाएँगी। कृपया अभी नवीनीकरण कराएँ।`
    );
  }

  return (
    `🔔 ${hospitalName}: your CareeAi licence ends in ${state.daysLeft} day${state.daysLeft === 1 ? '' : 's'} ` +
    `(${state.expiresAt?.toLocaleDateString()}). Renew before then so reception, cabins, lab and pharmacy keep running.\n\n` +
    `🔔 ${hospitalName}: आपका CareeAi लाइसेंस ${state.daysLeft} दिन में समाप्त हो रहा है ` +
    `(${state.expiresAt?.toLocaleDateString()})। सेवाएँ बंद होने से पहले कृपया नवीनीकरण कराएँ।`
  );
}

/**
 * The daily sweep: warn every facility whose term is running out, once per
 * threshold.
 *
 * Platform-wide by design — this is the one job that is ABOUT the tenants rather
 * than inside one, like the close-of-day reset. Hospital is not a tenant-scoped
 * collection, so no `allTenants` flag is needed here.
 *
 * Returns what it sent so the caller can log it; a facility with no phone on
 * file is counted as skipped rather than failed, because the console banner
 * still reaches them.
 */
export async function runLicenseSweep(now: Date = new Date()): Promise<{ sent: number; skipped: number }> {
  let sent = 0;
  let skipped = 0;

  try {
    const facilities = (await (Hospital as any).find({})) || [];
    const { sendWhatsAppNotification } = require('./whatsappHelper');

    for (const facility of facilities) {
      const state = licenseState(facility, now);
      const license = licenseOf(facility);
      const threshold = dueReminder(state, license.lastRemindedDay);
      if (threshold === null) continue;

      const phone = license.notifyPhone || facility.phone;
      if (!phone) {
        skipped++;
        continue;
      }

      try {
        await sendWhatsAppNotification(phone, reminderMessage(state, facility.name || 'Your facility'));
        sent++;
      } catch (waErr) {
        // One unreachable owner must not stop the rest of the platform being
        // warned. The threshold is left unrecorded so tomorrow tries again.
        logger.error('[LICENCE] Reminder failed', { hospital: facility.id, err: waErr });
        continue;
      }

      try {
        facility.license = { ...license, lastRemindedDay: threshold };
        facility.markModified && facility.markModified('license');
        await facility.save();
      } catch (saveErr) {
        logger.error('[LICENCE] Could not record a sent reminder', { hospital: facility.id, err: saveErr });
      }
    }
  } catch (err) {
    logger.error('[LICENCE] Sweep failed', { err });
  }

  if (sent > 0 || skipped > 0) logger.info('[LICENCE] Renewal reminders', { sent, skipped });
  return { sent, skipped };
}
