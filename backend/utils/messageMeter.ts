/**
 * Counting each facility's WhatsApp traffic, and turning it into money.
 *
 * The platform sends from ONE Meta number on behalf of every tenant, so Meta's
 * monthly invoice is a single figure covering traffic that belongs to twenty
 * different hospitals. Without this file there is no way to answer "who sent
 * these?", which means no overage can be billed, no plan quota means anything,
 * and one 200-patient OPD can quietly consume the margin earned from ten
 * clinics. Metering is not a reporting nicety here — it is the difference
 * between a price list and a guess.
 *
 * ── Three positions, taken deliberately ─────────────────────────────────────
 *
 *  1. **Messages are counted, not conversations.** Meta bills per 24-hour
 *     conversation window; this counts each message that leaves. The two numbers
 *     differ, and ours is the larger one. It is still the right unit to sell on,
 *     because it is the only one a hospital can check for itself — the counter
 *     staff can scroll a patient's chat and count. An invoice line a customer
 *     cannot verify is an invoice line they dispute. The gap is absorbed in the
 *     per-message price, not passed on as an unexplainable rounding.
 *
 *  2. **Running out of quota never stops a message.** This is the same rule the
 *     licence grace period is built on (utils/licenseHelper) and for the same
 *     reason: the alert that tells a patient to leave home now is a clinical
 *     event, and silencing it to enforce a billing threshold turns our revenue
 *     problem into their medical one. Over quota, the counter simply keeps
 *     counting and the overage appears on the bill. Nothing here can refuse a
 *     send, and nothing here is on the send path's critical line — see
 *     `recordMessage`, which swallows every error it can produce.
 *
 *  3. **A message nobody can attribute is recorded loudly, not dropped.** A
 *     send whose caller passed no facility goes to `UNATTRIBUTED`, where it
 *     shows up in the owner console as its own row. The alternative — skipping
 *     it — makes every bill silently too low and leaves nothing to notice. A
 *     visible bucket with a number in it is a bug report; a missing count is
 *     nothing at all.
 */

import MessageMeter from '../models/MessageMeter';
import logger from './logger';

const log = logger.child({ module: 'message-meter' });

/**
 * Where a send with no facility lands.
 *
 * Prefixed so it can never collide with a real `Hospital.id` slug, which is
 * generated from a facility name and cannot begin with underscores.
 */
export const UNATTRIBUTED = '__unattributed';

/**
 * Every kind of message the platform sends, and whether the facility pays for it.
 *
 * `billable: false` is not a discount — it marks traffic that is ours rather
 * than theirs. A licence reminder is the platform asking a hospital to renew;
 * putting that on the hospital's own message bill would be charging them for our
 * dunning. It is still counted, because the volume is real and we pay Meta for
 * it either way.
 *
 * Adding a kind here is all that is needed — `byKind` on the model is `Mixed`
 * precisely so a new one does not require a migration.
 */
export const MESSAGE_KINDS: Record<string, { label: string; billable: boolean }> = {
  booking: { label: 'Booking confirmation', billable: true },
  arrival: { label: 'Your turn is near', billable: true },
  departure: { label: 'Leave home now', billable: true },
  defer: { label: 'Token pushed back', billable: true },
  recall: { label: 'No-show recall', billable: true },
  delay: { label: 'Doctor running late', billable: true },
  bill: { label: 'Invoice', billable: true },
  report: { label: 'Lab report', billable: true },
  prescription: { label: 'Prescription', billable: true },
  refill: { label: 'Medicine refill', billable: true },
  reminder: { label: 'Re-visit reminder', billable: true },
  chat: { label: 'Chatbot reply', billable: true },
  // `queue` and `info` exist because `utils/patientNotify` already labels its
  // alerts with exactly this vocabulary (Token.patientAlerts.kind). Mapping them
  // onto near-synonyms here would make the breakdown on a facility's bill
  // disagree with the alert feed its own patients are looking at.
  queue: { label: 'Queue update', billable: true },
  info: { label: 'General notice', billable: true },
  licence: { label: 'Licence / renewal notice', billable: false },
  other: { label: 'Other', billable: true }
};

/**
 * Dig the owning facility out of whatever the caller happens to be holding.
 *
 * Call sites reach this point with a token, a doctor, a patient, sometimes only
 * a slug, and often several of them in varying states of population. Written
 * inline that becomes `(token && token.hospital) || (doctor && doctor.hospital)`
 * repeated thirty times, each copy a chance to check one field fewer than the
 * one next to it — and a missed field does not fail, it just books the message
 * to nobody. Candidates are tried in order, so the caller states its preference
 * by argument order: the token's own facility beats the doctor's, because a
 * token records where the visit actually happened.
 */
export function facilityFrom(...candidates: any[]): string | null {
  for (const candidate of candidates) {
    if (!candidate) continue;

    if (typeof candidate === 'string') {
      const slug = candidate.trim();
      if (slug) return slug;
      continue;
    }

    const owner = candidate.hospital;
    if (typeof owner === 'string' && owner.trim()) return owner.trim();
    // A populated `hospital` ref, rather than the usual slug string.
    if (owner && typeof owner === 'object' && owner.id) return String(owner.id);
  }
  return null;
}

/** A kind we do not recognise is still counted, under `other`. */
export function normalizeKind(kind?: string | null): string {
  const key = String(kind || '')
    .trim()
    .toLowerCase();
  return MESSAGE_KINDS[key] ? key : 'other';
}

/** Does this kind go on the facility's bill? */
export function isBillableKind(kind?: string | null): boolean {
  return MESSAGE_KINDS[normalizeKind(kind)].billable;
}

/**
 * What each plan tier includes, and what a message beyond it costs.
 *
 * Money is in PAISE, as whole numbers. Rupees-as-float would accumulate the
 * usual binary-fraction error across twenty thousand messages, and the figure
 * that comes out the other end is one a hospital's accountant will re-add by
 * hand.
 *
 * The included volumes are sized so a facility running normally never sees an
 * overage line: a two-doctor clinic at ~30 patients a day sends roughly 3,000
 * messages a month, a busy OPD at ~200 a day sends roughly 21,000. The quota is
 * there to catch the outlier that would otherwise be unpriced, not to nickel a
 * customer who is using the product as intended.
 */
export const METER_TIERS: Record<string, { label: string; included: number; overagePaise: number }> = {
  standalone: { label: 'Lab / Medical store', included: 1500, overagePaise: 30 },
  starter: { label: 'Starter', included: 3000, overagePaise: 30 },
  growth: { label: 'Growth', included: 10000, overagePaise: 30 },
  hospital: { label: 'Hospital', included: 30000, overagePaise: 25 }
};

export const TIER_KEYS = Object.keys(METER_TIERS);

/**
 * The tier a facility is on, or `null` when nobody has set one.
 *
 * Null is not "the cheapest tier". Every facility onboarded before metering
 * existed has no tier recorded, and defaulting them to Starter would invent an
 * overage bill for hospitals that never agreed to one — the same trap
 * `licenseHelper` avoids by refusing to read a missing expiry date as "expired
 * in 1970". They are reported as `tier: null`, which the owner console shows as
 * an unset tier to go and fix.
 */
export function tierOf(facility: any): string | null {
  const raw = facility && facility.license && facility.license.tier;
  const key = String(raw || '')
    .trim()
    .toLowerCase();
  return METER_TIERS[key] ? key : null;
}

/**
 * The billing period a moment falls in, as "YYYY-MM".
 *
 * Local parts on purpose: the process is pinned to the facility's timezone at
 * boot (utils/timezone.ts), so this is IST wall-clock. Reading UTC would move
 * every message sent after 6:30 PM IST on the last day of a month into the next
 * one — a small number, arriving every single month, in the direction that makes
 * the total disagree with what the facility counted.
 */
export function periodKey(now: Date = new Date()): string {
  const at = now instanceof Date && !isNaN(now.getTime()) ? now : new Date();
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}`;
}

/** The period before `period`, for month-on-month comparisons. */
export function previousPeriod(period: string): string {
  const [year, month] = String(period || '')
    .split('-')
    .map(Number);
  if (!year || !month) return periodKey();
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
}

export interface RecordMessageInput {
  /** `Hospital.id`. Missing or blank lands in the `UNATTRIBUTED` bucket. */
  hospital?: string | null;
  /** A key of `MESSAGE_KINDS`; anything else is filed under `other`. */
  kind?: string | null;
  /** Did Meta accept it? A rejected message is counted but never billed. */
  ok: boolean;
  /** Injectable for tests — a meter that depends on the real clock is untestable. */
  now?: Date;
}

/**
 * Record one outgoing message against a facility's month.
 *
 * **This function never throws and never rejects.** It is called from inside
 * `sendWhatsAppNotification`, on the path that tells a patient to leave for the
 * hospital. A metering failure — a dropped connection, a duplicate-key race, a
 * database that is briefly unreachable — must cost us a count, never a message.
 * Everything below is wrapped, and the catch deliberately does nothing except
 * log: there is no recovery worth attempting at this point in a send.
 */
export async function recordMessage({ hospital, kind, ok, now }: RecordMessageInput): Promise<void> {
  try {
    const facility = String(hospital || '').trim() || UNATTRIBUTED;
    const at = now instanceof Date && !isNaN(now.getTime()) ? now : new Date();
    const period = periodKey(at);
    const kindKey = normalizeKind(kind);

    if (facility === UNATTRIBUTED) {
      // Loud, because the fix is a one-line change at whichever call site this
      // came from and there is nothing else that would ever reveal it.
      log.warn('WhatsApp send had no facility attached — counted as unattributed', { kind: kindKey });
    }

    const inc: Record<string, number> = { [`byKind.${kindKey}`]: 1 };
    if (ok) {
      inc.sent = 1;
      if (MESSAGE_KINDS[kindKey].billable) inc.billable = 1;
    } else {
      inc.failed = 1;
    }

    await (MessageMeter as any).findOneAndUpdate(
      { hospital: facility, period },
      { $inc: inc, $set: { lastAt: at }, $setOnInsert: { firstAt: at } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (err: any) {
    log.error('Could not record WhatsApp usage', { error: err && err.message });
  }
}

export interface Usage {
  hospital: string;
  period: string;
  sent: number;
  failed: number;
  billable: number;
  byKind: Record<string, number>;
  firstAt: Date | null;
  lastAt: Date | null;
}

/** An empty month, so callers never branch on "no meter yet". */
function emptyUsage(hospital: string, period: string): Usage {
  return { hospital, period, sent: 0, failed: 0, billable: 0, byKind: {}, firstAt: null, lastAt: null };
}

/** One facility's usage for one month. Absent means zero, not an error. */
export async function usageFor(hospital: string, period: string = periodKey()): Promise<Usage> {
  const row = await (MessageMeter as any).findOne({ hospital, period });
  if (!row) return emptyUsage(hospital, period);
  return {
    hospital,
    period,
    sent: row.sent || 0,
    failed: row.failed || 0,
    billable: row.billable || 0,
    byKind: row.byKind || {},
    firstAt: row.firstAt || null,
    lastAt: row.lastAt || null
  };
}

/**
 * Every facility's usage for one month, busiest first.
 *
 * Genuinely platform-wide — the owner console needs all tenants in one table to
 * see who is about to go over — so it says `allTenants` out loud rather than
 * tripping the tenant guard's unscoped-query alarm.
 */
export async function usageAcrossFacilities(period: string = periodKey()): Promise<Usage[]> {
  const rows = (await (MessageMeter as any).find({ period }, null, { allTenants: true })) || [];
  return rows
    .map((row: any) => ({
      hospital: row.hospital,
      period,
      sent: row.sent || 0,
      failed: row.failed || 0,
      billable: row.billable || 0,
      byKind: row.byKind || {},
      firstAt: row.firstAt || null,
      lastAt: row.lastAt || null
    }))
    .sort((a: Usage, b: Usage) => b.billable - a.billable);
}

export interface Overage {
  tier: string | null;
  tierLabel: string;
  included: number | null;
  billable: number;
  /** Messages beyond the included volume. Zero when there is no tier to exceed. */
  overage: number;
  overagePaise: number;
  amountPaise: number;
  amountLabel: string;
  /** How much of the included volume is gone, 0–100. Null with no tier set. */
  percentUsed: number | null;
  /** Past the included volume — a flag for the console, never a switch. */
  overQuota: boolean;
}

/** Whole rupees when it divides evenly, two decimals when it does not. */
export function formatPaise(paise: number): string {
  const rupees = (Math.round(paise) || 0) / 100;
  return `₹${Number.isInteger(rupees) ? rupees : rupees.toFixed(2)}`;
}

/**
 * What this month's usage costs the facility on top of its plan.
 *
 * A facility with no tier set is charged NOTHING for overage — see `tierOf`.
 * Reporting a bill against a quota the customer was never sold would be
 * inventing a debt, so the figure stays zero and the console shows the gap.
 */
export function overageOf(usage: Usage, tier: string | null): Overage {
  const billable = (usage && usage.billable) || 0;
  const plan = tier && METER_TIERS[tier] ? METER_TIERS[tier] : null;

  if (!plan) {
    return {
      tier: null,
      tierLabel: 'No tier set',
      included: null,
      billable,
      overage: 0,
      overagePaise: 0,
      amountPaise: 0,
      amountLabel: formatPaise(0),
      percentUsed: null,
      overQuota: false
    };
  }

  const overage = Math.max(0, billable - plan.included);
  const amountPaise = overage * plan.overagePaise;

  return {
    tier,
    tierLabel: plan.label,
    included: plan.included,
    billable,
    overage,
    overagePaise: plan.overagePaise,
    amountPaise,
    amountLabel: formatPaise(amountPaise),
    percentUsed: Math.round((billable / plan.included) * 100),
    overQuota: overage > 0
  };
}

/**
 * Usage plus cost for one facility — what both consoles actually render.
 */
export async function meterSummary(facility: any, period: string = periodKey()): Promise<any> {
  const hospital = (facility && facility.id) || String(facility || '');
  const usage = await usageFor(hospital, period);
  const tier = tierOf(facility);
  return {
    hospital,
    name: (facility && facility.name) || hospital,
    period,
    usage,
    tier,
    ...overageOf(usage, tier)
  };
}
