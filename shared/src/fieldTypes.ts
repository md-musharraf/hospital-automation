/**
 * One canonical shape per field type, for the whole platform.
 * ---------------------------------------------------------------------------
 * The bug this exists to kill: the same person could occupy two records.
 *
 *   - A doctor onboarded as `Rao@clinic.in` and later re-added as
 *     `rao@clinic.in` passed every duplicate check we had, because
 *     `Doctor.findOne({ email })`, the `seenDoctorEmails` Set in
 *     register-hospital, and the `{email, hospital}` unique index are ALL
 *     case-sensitive. Two doctors, one person, two queues.
 *   - A patient who books on WhatsApp is stored as `+919876543210` (the chat
 *     engine canonicalized) but the same patient registered at reception is
 *     stored as `98765 43210` (reception did not). Their visit history splits,
 *     and `phoneVariants()` — a nine-way `$or` — exists purely to paper over it.
 *
 * The fix is not "remember to lowercase it at each call site"; that is the
 * thing that already failed. It is that a raw string is a DIFFERENT TYPE from a
 * normalized one, so the compiler refuses the call.
 *
 * `Email` and `Phone` below are branded: structurally they are strings, but
 * TypeScript will not let a plain `string` be passed where one is required.
 * The only way to obtain one is to go through `normalizeEmail` /
 * `normalizePhone`. That is what makes this enforceable rather than a
 * convention people forget under deadline.
 *
 * Consumed by BOTH runtimes: the backend `require()`s the compiled CommonJS in
 * `shared/dist`, the frontend imports the source through Vite's `@shared`
 * alias. There is exactly one implementation of "what is a phone number here".
 */

/* ── Branded primitives ──────────────────────────────────────────────────── */

declare const brand: unique symbol;

/** A string that has been through `normalizeEmail`: trimmed and lower-cased. */
export type Email = string & { readonly [brand]: 'Email' };

/** A string that has been through `normalizePhone`: E.164, e.g. `+919876543210`. */
export type Phone = string & { readonly [brand]: 'Phone' };

/** A string that has been through `normalizeName`: trimmed, inner runs of whitespace collapsed. */
export type PersonName = string & { readonly [brand]: 'PersonName' };

/* ── Result ──────────────────────────────────────────────────────────────── */

/**
 * Success or a human sentence explaining the refusal.
 *
 * Deliberately not exceptions. Every one of these failures is a person typing
 * something into a form at a reception desk, and the message goes straight back
 * to them — so the failure path has to carry a sentence, not a stack trace.
 */
export type Ok<T> = { ok: true; value: T };
export type Err = { ok: false; error: string };
export type Result<T> = Ok<T> | Err;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = (error: string): Err => ({ ok: false, error });

/* ── Primitives ──────────────────────────────────────────────────────────── */

/** Everything that is not 0-9, removed. */
export function digitsOnly(raw: unknown): string {
  return String(raw ?? '').replace(/[^0-9]/g, '');
}

/**
 * Collapse whitespace and trim.
 *
 * Reception types "  Ram   Kumar " far more often than anyone expects, and a
 * trailing space is enough to make a name lookup miss.
 */
export function normalizeName(raw: unknown): PersonName {
  return String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ') as PersonName;
}

/* ── Email ───────────────────────────────────────────────────────────────── */

/**
 * Practical, not RFC 5322.
 *
 * A full RFC-compliant pattern accepts addresses no mail server here will ever
 * route and is unreadable to whoever maintains it next. This rejects what
 * people actually mistype: missing `@`, missing dot in the domain, spaces,
 * double dots, leading/trailing punctuation.
 */
const EMAIL_RE =
  /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

/**
 * The canonical form of an email address: trimmed and lower-cased.
 *
 * Case-folding the WHOLE address, local part included, is a deliberate choice.
 * The local part is technically case-sensitive per RFC 5321, so `A@x.com` and
 * `a@x.com` may in theory be different mailboxes — but no mail provider a
 * clinic in India actually uses treats them as different, and the alternative
 * is what we had: two doctor records for one person, each with their own queue.
 * Predictable identity beats standards purity for a login handle.
 */
export function normalizeEmail(raw: unknown): Email | null {
  const cleaned = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!cleaned) return null;
  return EMAIL_RE.test(cleaned) ? (cleaned as Email) : null;
}

/** Same, but says why when it refuses — for form and route errors. */
export function parseEmail(raw: unknown, label = 'Email'): Result<Email> {
  const cleaned = String(raw ?? '').trim();
  if (!cleaned) return err(`${label} is required.`);
  const normalized = normalizeEmail(cleaned);
  if (!normalized) return err(`"${cleaned}" is not a valid ${label.toLowerCase()} address.`);
  return ok(normalized);
}

/* ── Phone ───────────────────────────────────────────────────────────────── */

/** India, because that is where every facility on this platform is. */
const DEFAULT_COUNTRY_CODE = '91';

/** Shortest and longest a real international subscriber number gets (E.164). */
const MIN_PHONE_DIGITS = 7;
const MAX_PHONE_DIGITS = 15;

/**
 * The canonical stored form of a phone number: `+` followed by digits, E.164.
 *
 * A bare 10-digit number is assumed Indian and gains `+91`; a leading `0` on an
 * 11-digit number is the domestic trunk prefix and is dropped. This is
 * BYTE-FOR-BYTE the behaviour `routes/chat.js` already had, which matters more
 * than it looks: every patient who has ever booked over WhatsApp is already
 * stored in this form, so adopting it platform-wide reconciles reception and
 * billing UP to the existing records rather than orphaning them.
 *
 * Returns `null` rather than echoing the input back when there is no plausible
 * number in it. The old version returned the raw string on failure, which is
 * how unparseable junk ended up in the `phone` column in the first place.
 */
export function normalizePhone(raw: unknown): Phone | null {
  const d = digitsOnly(raw);
  if (!d) return null;

  let national = d;
  if (d.length === 11 && d.startsWith('0')) national = d.slice(1);

  const withCode = national.length === 10 ? `${DEFAULT_COUNTRY_CODE}${national}` : national;

  if (withCode.length < MIN_PHONE_DIGITS || withCode.length > MAX_PHONE_DIGITS) return null;
  return `+${withCode}` as Phone;
}

/** Same, but says why when it refuses. */
export function parsePhone(raw: unknown, label = 'Phone number'): Result<Phone> {
  const cleaned = String(raw ?? '').trim();
  if (!cleaned) return err(`${label} is required.`);
  const normalized = normalizePhone(cleaned);
  if (!normalized) {
    return err(
      `"${cleaned}" is not a usable ${label.toLowerCase()}. Enter ${MIN_PHONE_DIGITS}–${MAX_PHONE_DIGITS} digits, e.g. 9876543210.`
    );
  }
  return ok(normalized);
}

/**
 * Every spelling of one number that might be sitting in the database.
 *
 * MIGRATION SCAFFOLDING, not a permanent lookup strategy. Records written
 * before canonicalization exist in half a dozen shapes, so a lookup has to
 * tolerate them until they are all rewritten. New writes go through
 * `normalizePhone`, so this list shrinks to one entry over time — and once the
 * back-fill has run, callers should query the canonical form alone.
 */
export function phoneVariants(raw: unknown): string[] {
  const trimmed = String(raw ?? '').trim();
  const d = digitsOnly(trimmed);
  if (!d) return trimmed ? [trimmed] : [];
  const last10 = d.slice(-10);
  const canonical = normalizePhone(trimmed);

  return [
    ...new Set(
      [
        canonical,
        trimmed,
        trimmed.replace(/\s+/g, ''),
        d,
        `+${d}`,
        last10,
        `+${DEFAULT_COUNTRY_CODE}${last10}`,
        `${DEFAULT_COUNTRY_CODE}${last10}`,
        `0${last10}`
      ].filter((v): v is string => Boolean(v))
    )
  ];
}

/** Display form for a +91 number: `+91 98765 43210`. Never stored — screens only. */
export function formatPhoneForDisplay(phone: Phone | string | null | undefined): string {
  const s = String(phone ?? '');
  const d = digitsOnly(s);
  if (d.length === 12 && d.startsWith(DEFAULT_COUNTRY_CODE)) {
    return `+${DEFAULT_COUNTRY_CODE} ${d.slice(2, 7)} ${d.slice(7)}`;
  }
  return s;
}

/* ── Numbers ─────────────────────────────────────────────────────────────── */

export interface IntOptions {
  min?: number;
  max?: number;
}

/**
 * A whole number, or null.
 *
 * `parseInt` is not good enough here and never was: `parseInt('12abc')` is 12,
 * `parseInt('')` is NaN, and `parseInt(null)` is NaN — so an age field fed junk
 * became `NaN`, which mongoose then happily stored. This accepts a number or a
 * string that is ENTIRELY a number, and rejects everything else.
 *
 * Booleans are refused on purpose: `Number(true)` is 1, and an age of 1 arriving
 * from a checkbox is a silent data corruption, not a conversion.
 */
export function toInt(raw: unknown, opts: IntOptions = {}): number | null {
  if (typeof raw === 'boolean' || raw === null || raw === undefined) return null;

  let n: number;
  if (typeof raw === 'number') {
    n = raw;
  } else {
    const s = String(raw).trim();
    if (!/^[+-]?\d+$/.test(s)) return null;
    n = Number(s);
  }

  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  if (opts.min !== undefined && n < opts.min) return null;
  if (opts.max !== undefined && n > opts.max) return null;
  return n;
}

/** Same, but says why when it refuses. */
export function parseInteger(raw: unknown, label: string, opts: IntOptions = {}): Result<number> {
  const n = toInt(raw, opts);
  if (n !== null) return ok(n);

  const shown = String(raw ?? '').trim();
  if (!shown) return err(`${label} is required.`);
  if (opts.min !== undefined && opts.max !== undefined) {
    return err(`${label} must be a whole number between ${opts.min} and ${opts.max}.`);
  }
  return err(`${label} must be a whole number.`);
}

/**
 * Money, held as a number rounded to 2 decimal places.
 *
 * Rounds via `Math.round(n * 100) / 100` rather than `toFixed`, because
 * `toFixed` returns a STRING and a fee that is sometimes a string and sometimes
 * a number is how a bill total ends up as "1200500" — string concatenation
 * wearing a number's clothes.
 */
export function toMoney(raw: unknown): number | null {
  if (typeof raw === 'boolean' || raw === null || raw === undefined) return null;

  let n: number;
  if (typeof raw === 'number') {
    n = raw;
  } else {
    // Tolerate what people paste out of a rate card: "₹1,200.50".
    const s = String(raw)
      .trim()
      .replace(/[₹,\s]/g, '');
    if (!/^[+-]?\d+(\.\d+)?$/.test(s)) return null;
    n = Number(s);
  }

  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

/** Same, but says why when it refuses. */
export function parseMoney(raw: unknown, label: string): Result<number> {
  const n = toMoney(raw);
  if (n !== null) return ok(n);
  const shown = String(raw ?? '').trim();
  if (!shown) return err(`${label} is required.`);
  return err(`${label} must be an amount of money, e.g. 250 or 250.50.`);
}

/* ── Enums ───────────────────────────────────────────────────────────────── */

/**
 * One of a fixed set, matched case-insensitively but STORED in the schema's own
 * casing.
 *
 * "male" typed at reception and "Male" in the enum used to be a validation
 * failure that reception could not explain. The value the caller sees back is
 * always the canonical member, so nothing downstream has to case-fold again.
 */
export function parseEnum<const T extends readonly string[]>(
  raw: unknown,
  allowed: T,
  label: string
): Result<T[number]> {
  const s = String(raw ?? '').trim();
  if (!s) return err(`${label} is required.`);
  const hit = allowed.find((a) => a.toLowerCase() === s.toLowerCase());
  if (!hit) return err(`${label} must be one of: ${allowed.join(', ')}.`);
  return ok(hit);
}

/* ── Free text ───────────────────────────────────────────────────────────── */

export interface TextOptions {
  min?: number;
  max?: number;
  required?: boolean;
}

/** Trimmed free text with a length window — symptoms, notes, addresses. */
export function parseText(raw: unknown, label: string, opts: TextOptions = {}): Result<string> {
  const { min = 0, max = 1000, required = true } = opts;
  const s = String(raw ?? '').trim();

  if (!s) return required ? err(`${label} is required.`) : ok('');
  if (s.length < min) return err(`${label} must be at least ${min} characters.`);
  if (s.length > max) return err(`${label} must be ${max} characters or fewer.`);
  return ok(s);
}
