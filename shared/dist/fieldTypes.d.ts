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
declare const brand: unique symbol;
/** A string that has been through `normalizeEmail`: trimmed and lower-cased. */
export type Email = string & {
    readonly [brand]: 'Email';
};
/** A string that has been through `normalizePhone`: E.164, e.g. `+919876543210`. */
export type Phone = string & {
    readonly [brand]: 'Phone';
};
/** A string that has been through `normalizeName`: trimmed, inner runs of whitespace collapsed. */
export type PersonName = string & {
    readonly [brand]: 'PersonName';
};
/**
 * Success or a human sentence explaining the refusal.
 *
 * Deliberately not exceptions. Every one of these failures is a person typing
 * something into a form at a reception desk, and the message goes straight back
 * to them — so the failure path has to carry a sentence, not a stack trace.
 */
export type Ok<T> = {
    ok: true;
    value: T;
};
export type Err = {
    ok: false;
    error: string;
};
export type Result<T> = Ok<T> | Err;
export declare const ok: <T>(value: T) => Ok<T>;
export declare const err: (error: string) => Err;
/** Everything that is not 0-9, removed. */
export declare function digitsOnly(raw: unknown): string;
/**
 * Collapse whitespace and trim.
 *
 * Reception types "  Ram   Kumar " far more often than anyone expects, and a
 * trailing space is enough to make a name lookup miss.
 */
export declare function normalizeName(raw: unknown): PersonName;
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
export declare function normalizeEmail(raw: unknown): Email | null;
/** Same, but says why when it refuses — for form and route errors. */
export declare function parseEmail(raw: unknown, label?: string): Result<Email>;
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
export declare function normalizePhone(raw: unknown): Phone | null;
/** Same, but says why when it refuses. */
export declare function parsePhone(raw: unknown, label?: string): Result<Phone>;
/**
 * Every spelling of one number that might be sitting in the database.
 *
 * MIGRATION SCAFFOLDING, not a permanent lookup strategy. Records written
 * before canonicalization exist in half a dozen shapes, so a lookup has to
 * tolerate them until they are all rewritten. New writes go through
 * `normalizePhone`, so this list shrinks to one entry over time — and once the
 * back-fill has run, callers should query the canonical form alone.
 */
export declare function phoneVariants(raw: unknown): string[];
/** Display form for a +91 number: `+91 98765 43210`. Never stored — screens only. */
export declare function formatPhoneForDisplay(phone: Phone | string | null | undefined): string;
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
export declare function toInt(raw: unknown, opts?: IntOptions): number | null;
/** Same, but says why when it refuses. */
export declare function parseInteger(raw: unknown, label: string, opts?: IntOptions): Result<number>;
/**
 * Money, held as a number rounded to 2 decimal places.
 *
 * Rounds via `Math.round(n * 100) / 100` rather than `toFixed`, because
 * `toFixed` returns a STRING and a fee that is sometimes a string and sometimes
 * a number is how a bill total ends up as "1200500" — string concatenation
 * wearing a number's clothes.
 */
export declare function toMoney(raw: unknown): number | null;
/** Same, but says why when it refuses. */
export declare function parseMoney(raw: unknown, label: string): Result<number>;
/**
 * One of a fixed set, matched case-insensitively but STORED in the schema's own
 * casing.
 *
 * "male" typed at reception and "Male" in the enum used to be a validation
 * failure that reception could not explain. The value the caller sees back is
 * always the canonical member, so nothing downstream has to case-fold again.
 */
export declare function parseEnum<const T extends readonly string[]>(raw: unknown, allowed: T, label: string): Result<T[number]>;
export interface TextOptions {
    min?: number;
    max?: number;
    required?: boolean;
}
/** Trimmed free text with a length window — symptoms, notes, addresses. */
export declare function parseText(raw: unknown, label: string, opts?: TextOptions): Result<string>;
export {};
//# sourceMappingURL=fieldTypes.d.ts.map