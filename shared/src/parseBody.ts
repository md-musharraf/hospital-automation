/**
 * Declarative request-body parsing, typed end to end.
 * ---------------------------------------------------------------------------
 * Before this, every route hand-rolled the same twenty lines:
 *
 *     const { name, age, gender, phone, symptoms } = req.body;
 *     if (!name || !age || !gender || !phone || !symptoms) return res.status(400)...
 *     if (typeof name !== 'string' || name.trim().length < 2) return ...
 *     const parsedAge = parseInt(age);
 *     if (isNaN(parsedAge) || parsedAge < 1 || parsedAge > 130) return ...
 *
 * Three things went wrong with that, all of them observed in this codebase:
 *
 *  1. It VALIDATES but does not NORMALIZE. `phone` was checked for length and
 *     then stored exactly as typed, which is the whole duplicate-patient bug.
 *  2. Each copy drifted. `staff.js` bounds age 1–130; the chat engine does not
 *     bound it at all; `billing.js` trims the phone and nothing else.
 *  3. The parsed values stay `any`, so `age` being a string all the way into
 *     mongoose is invisible until a comparison silently does the wrong thing.
 *
 * Here the spec IS the type. `Infer<typeof spec>` gives the exact shape the
 * handler receives, `phone` comes out as `Phone` (never a raw string), and
 * every message is a sentence someone at a reception desk can act on.
 */

import {
  Email,
  IntOptions,
  PersonName,
  Phone,
  Result,
  TextOptions,
  err,
  normalizeName,
  ok,
  parseEmail,
  parseEnum,
  parseInteger,
  parseMoney,
  parsePhone,
  parseText
} from './fieldTypes';

/* ── Field ───────────────────────────────────────────────────────────────── */

export interface Field<T, Req extends boolean = boolean> {
  readonly required: Req;
  readonly label: string | undefined;
  parse(raw: unknown, label: string): Result<T>;
}

/** A required field yields `T`; an optional one yields `T | undefined`. */
type ValueOf<F> = F extends Field<infer T, infer R> ? (R extends true ? T : T | undefined) : never;

/** The exact object a handler receives for a given spec. */
export type Infer<S extends Record<string, Field<unknown>>> = {
  [K in keyof S]: ValueOf<S[K]>;
};

/**
 * Turn a key into something worth showing a human.
 *
 * `doctorId` → "Doctor id", `dailyTokenLimit` → "Daily token limit". Any field
 * whose auto-label reads badly passes an explicit one — the point is that the
 * DEFAULT is already presentable, so nobody ships "phone is required".
 */
function humanize(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

function makeField<T, Req extends boolean>(
  required: Req,
  label: string | undefined,
  parse: (raw: unknown, label: string) => Result<T>
): Field<T, Req> {
  return { required, label, parse };
}

/* ── The field catalogue ─────────────────────────────────────────────────── */

interface Common {
  label?: string;
}

/**
 * Every field type the platform accepts from a user, in one place.
 *
 * Adding a new kind of input means adding it here, which is deliberate: the
 * moment a route hand-parses a field again, the normalization guarantee is
 * gone for that field and nobody finds out until two records exist.
 */
export const field = {
  /** A person's or thing's name: trimmed, inner whitespace collapsed. */
  name(opts: Common & { min?: number; max?: number; required?: false } = {}) {
    const required = opts.required !== false;
    const { min = 2, max = 100 } = opts;
    return makeField<PersonName, boolean>(required, opts.label, (raw, label) => {
      const cleaned = normalizeName(raw);
      if (!cleaned) return required ? err(`${label} is required.`) : ok('' as PersonName);
      if (cleaned.length < min) return err(`${label} must be at least ${min} characters.`);
      if (cleaned.length > max) return err(`${label} must be ${max} characters or fewer.`);
      return ok(cleaned);
    });
  },

  /** Lower-cased, trimmed, shape-checked. Never stored as typed. */
  email(opts: Common & { required?: false } = {}) {
    const required = opts.required !== false;
    return makeField<Email, boolean>(required, opts.label, (raw, label) => {
      const shown = String(raw ?? '').trim();
      if (!shown && !required) return ok('' as Email);
      return parseEmail(raw, label);
    });
  },

  /** Canonical E.164, `+91` assumed for bare 10-digit numbers. */
  phone(opts: Common & { required?: false } = {}) {
    const required = opts.required !== false;
    return makeField<Phone, boolean>(required, opts.label, (raw, label) => {
      const shown = String(raw ?? '').trim();
      if (!shown && !required) return ok('' as Phone);
      return parsePhone(raw, label);
    });
  },

  /** A whole number in a range. Rejects "12abc", "", true — all of which parseInt did not. */
  int(opts: Common & IntOptions & { required?: false } = {}) {
    const required = opts.required !== false;
    return makeField<number, boolean>(required, opts.label, (raw, label) => {
      if ((raw === undefined || raw === null || raw === '') && !required) return ok(0);
      return parseInteger(raw, label, opts);
    });
  },

  /** An amount of money, rounded to paise. Tolerates "₹1,200.50" on paste. */
  money(opts: Common & { required?: false } = {}) {
    const required = opts.required !== false;
    return makeField<number, boolean>(required, opts.label, (raw, label) => {
      if ((raw === undefined || raw === null || raw === '') && !required) return ok(0);
      return parseMoney(raw, label);
    });
  },

  /** One of a fixed set, matched case-insensitively, returned in schema casing. */
  enum<const T extends readonly string[]>(allowed: T, opts: Common & { required?: false } = {}) {
    const required = opts.required !== false;
    return makeField<T[number], boolean>(required, opts.label, (raw, label) => {
      const shown = String(raw ?? '').trim();
      if (!shown && !required) return ok(allowed[0] as T[number]);
      return parseEnum(raw, allowed, label);
    });
  },

  /** Trimmed free text with a length window — symptoms, notes, addresses. */
  text(opts: Common & TextOptions = {}) {
    const required = opts.required !== false;
    return makeField<string, boolean>(required, opts.label, (raw, label) =>
      parseText(raw, label, { ...opts, required })
    );
  },

  /** True/false from a checkbox, a JSON boolean, or the strings HTML forms send. */
  bool(opts: Common & { required?: false } = {}) {
    const required = opts.required !== false;
    return makeField<boolean, boolean>(required, opts.label, (raw, label) => {
      if (typeof raw === 'boolean') return ok(raw);
      const s = String(raw ?? '')
        .trim()
        .toLowerCase();
      if (!s) return required ? err(`${label} is required.`) : ok(false);
      if (['true', '1', 'yes', 'on'].includes(s)) return ok(true);
      if (['false', '0', 'no', 'off'].includes(s)) return ok(false);
      return err(`${label} must be true or false.`);
    });
  },

  /**
   * An opaque identifier we pass through — a Mongo id, a facility slug.
   *
   * Not normalized beyond trimming, because these are OUR values echoed back,
   * not something a human composes. Length-capped so a hostile client cannot
   * post a megabyte where an id belongs.
   */
  id(opts: Common & { required?: false } = {}) {
    const required = opts.required !== false;
    return makeField<string, boolean>(required, opts.label, (raw, label) => {
      const s = String(raw ?? '').trim();
      if (!s) return required ? err(`${label} is required.`) : ok('');
      if (s.length > 128) return err(`${label} is not a valid identifier.`);
      return ok(s);
    });
  }
};

/* ── The parser ──────────────────────────────────────────────────────────── */

export interface ParseFailure {
  ok: false;
  /** The first problem, for routes that answer with a single `message`. */
  error: string;
  /** Every problem, keyed by field — so a form can mark all its bad inputs at once. */
  errors: Record<string, string>;
}

export type ParseSuccess<S extends Record<string, Field<unknown>>> = {
  ok: true;
  value: Infer<S>;
};

export type ParseResult<S extends Record<string, Field<unknown>>> = ParseSuccess<S> | ParseFailure;

/**
 * Validate and NORMALIZE a request body against a spec.
 *
 * Collects every failure rather than stopping at the first. A receptionist
 * fixing one field, resubmitting, and being told about the next one is how a
 * four-field form takes four round trips — and they are usually standing in
 * front of the patient while they do it.
 */
export function parseBody<S extends Record<string, Field<unknown>>>(body: unknown, spec: S): ParseResult<S> {
  const source: Record<string, unknown> =
    body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : {};

  const value: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  for (const key of Object.keys(spec)) {
    const f = spec[key];
    if (!f) continue;
    const label = f.label ?? humanize(key);
    const raw = source[key];

    // An absent optional field stays absent. Writing `undefined` into the
    // result would overwrite a stored value with nothing on a PUT — the
    // difference between "leave the phone alone" and "clear the phone".
    if (!f.required && (raw === undefined || raw === null)) continue;

    const parsed = f.parse(raw, label);
    if (parsed.ok) {
      value[key] = parsed.value;
    } else {
      errors[key] = (parsed as any).error;
    }
  }

  const firstKey = Object.keys(errors)[0];
  if (firstKey !== undefined) {
    return { ok: false, error: errors[firstKey] as string, errors };
  }

  return { ok: true, value: value as Infer<S> };
}
