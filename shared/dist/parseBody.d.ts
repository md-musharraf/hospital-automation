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
import { Email, IntOptions, PersonName, Phone, Result, TextOptions } from './fieldTypes';
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
export declare const field: {
    /** A person's or thing's name: trimmed, inner whitespace collapsed. */
    name(opts?: Common & {
        min?: number;
        max?: number;
        required?: false;
    }): Field<PersonName, boolean>;
    /** Lower-cased, trimmed, shape-checked. Never stored as typed. */
    email(opts?: Common & {
        required?: false;
    }): Field<Email, boolean>;
    /** Canonical E.164, `+91` assumed for bare 10-digit numbers. */
    phone(opts?: Common & {
        required?: false;
    }): Field<Phone, boolean>;
    /** A whole number in a range. Rejects "12abc", "", true — all of which parseInt did not. */
    int(opts?: Common & IntOptions & {
        required?: false;
    }): Field<number, boolean>;
    /** An amount of money, rounded to paise. Tolerates "₹1,200.50" on paste. */
    money(opts?: Common & {
        required?: false;
    }): Field<number, boolean>;
    /** One of a fixed set, matched case-insensitively, returned in schema casing. */
    enum<const T extends readonly string[]>(allowed: T, opts?: Common & {
        required?: false;
    }): Field<T[number], boolean>;
    /** Trimmed free text with a length window — symptoms, notes, addresses. */
    text(opts?: Common & TextOptions): Field<string, boolean>;
    /** True/false from a checkbox, a JSON boolean, or the strings HTML forms send. */
    bool(opts?: Common & {
        required?: false;
    }): Field<boolean, boolean>;
    /**
     * An opaque identifier we pass through — a Mongo id, a facility slug.
     *
     * Not normalized beyond trimming, because these are OUR values echoed back,
     * not something a human composes. Length-capped so a hostile client cannot
     * post a megabyte where an id belongs.
     */
    id(opts?: Common & {
        required?: false;
    }): Field<string, boolean>;
};
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
export declare function parseBody<S extends Record<string, Field<unknown>>>(body: unknown, spec: S): ParseResult<S>;
export {};
//# sourceMappingURL=parseBody.d.ts.map