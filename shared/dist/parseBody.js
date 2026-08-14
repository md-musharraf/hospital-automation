"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.field = void 0;
exports.parseBody = parseBody;
const fieldTypes_1 = require("./fieldTypes");
/**
 * Turn a key into something worth showing a human.
 *
 * `doctorId` → "Doctor id", `dailyTokenLimit` → "Daily token limit". Any field
 * whose auto-label reads badly passes an explicit one — the point is that the
 * DEFAULT is already presentable, so nobody ships "phone is required".
 */
function humanize(key) {
    const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
    return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}
function makeField(required, label, parse) {
    return { required, label, parse };
}
/**
 * Every field type the platform accepts from a user, in one place.
 *
 * Adding a new kind of input means adding it here, which is deliberate: the
 * moment a route hand-parses a field again, the normalization guarantee is
 * gone for that field and nobody finds out until two records exist.
 */
exports.field = {
    /** A person's or thing's name: trimmed, inner whitespace collapsed. */
    name(opts = {}) {
        const required = opts.required !== false;
        const { min = 2, max = 100 } = opts;
        return makeField(required, opts.label, (raw, label) => {
            const cleaned = (0, fieldTypes_1.normalizeName)(raw);
            if (!cleaned)
                return required ? (0, fieldTypes_1.err)(`${label} is required.`) : (0, fieldTypes_1.ok)('');
            if (cleaned.length < min)
                return (0, fieldTypes_1.err)(`${label} must be at least ${min} characters.`);
            if (cleaned.length > max)
                return (0, fieldTypes_1.err)(`${label} must be ${max} characters or fewer.`);
            return (0, fieldTypes_1.ok)(cleaned);
        });
    },
    /** Lower-cased, trimmed, shape-checked. Never stored as typed. */
    email(opts = {}) {
        const required = opts.required !== false;
        return makeField(required, opts.label, (raw, label) => {
            const shown = String(raw ?? '').trim();
            if (!shown && !required)
                return (0, fieldTypes_1.ok)('');
            return (0, fieldTypes_1.parseEmail)(raw, label);
        });
    },
    /** Canonical E.164, `+91` assumed for bare 10-digit numbers. */
    phone(opts = {}) {
        const required = opts.required !== false;
        return makeField(required, opts.label, (raw, label) => {
            const shown = String(raw ?? '').trim();
            if (!shown && !required)
                return (0, fieldTypes_1.ok)('');
            return (0, fieldTypes_1.parsePhone)(raw, label);
        });
    },
    /** A whole number in a range. Rejects "12abc", "", true — all of which parseInt did not. */
    int(opts = {}) {
        const required = opts.required !== false;
        return makeField(required, opts.label, (raw, label) => {
            if ((raw === undefined || raw === null || raw === '') && !required)
                return (0, fieldTypes_1.ok)(0);
            return (0, fieldTypes_1.parseInteger)(raw, label, opts);
        });
    },
    /** An amount of money, rounded to paise. Tolerates "₹1,200.50" on paste. */
    money(opts = {}) {
        const required = opts.required !== false;
        return makeField(required, opts.label, (raw, label) => {
            if ((raw === undefined || raw === null || raw === '') && !required)
                return (0, fieldTypes_1.ok)(0);
            return (0, fieldTypes_1.parseMoney)(raw, label);
        });
    },
    /** One of a fixed set, matched case-insensitively, returned in schema casing. */
    enum(allowed, opts = {}) {
        const required = opts.required !== false;
        return makeField(required, opts.label, (raw, label) => {
            const shown = String(raw ?? '').trim();
            if (!shown && !required)
                return (0, fieldTypes_1.ok)(allowed[0]);
            return (0, fieldTypes_1.parseEnum)(raw, allowed, label);
        });
    },
    /** Trimmed free text with a length window — symptoms, notes, addresses. */
    text(opts = {}) {
        const required = opts.required !== false;
        return makeField(required, opts.label, (raw, label) => (0, fieldTypes_1.parseText)(raw, label, { ...opts, required }));
    },
    /** True/false from a checkbox, a JSON boolean, or the strings HTML forms send. */
    bool(opts = {}) {
        const required = opts.required !== false;
        return makeField(required, opts.label, (raw, label) => {
            if (typeof raw === 'boolean')
                return (0, fieldTypes_1.ok)(raw);
            const s = String(raw ?? '')
                .trim()
                .toLowerCase();
            if (!s)
                return required ? (0, fieldTypes_1.err)(`${label} is required.`) : (0, fieldTypes_1.ok)(false);
            if (['true', '1', 'yes', 'on'].includes(s))
                return (0, fieldTypes_1.ok)(true);
            if (['false', '0', 'no', 'off'].includes(s))
                return (0, fieldTypes_1.ok)(false);
            return (0, fieldTypes_1.err)(`${label} must be true or false.`);
        });
    },
    /**
     * An opaque identifier we pass through — a Mongo id, a facility slug.
     *
     * Not normalized beyond trimming, because these are OUR values echoed back,
     * not something a human composes. Length-capped so a hostile client cannot
     * post a megabyte where an id belongs.
     */
    id(opts = {}) {
        const required = opts.required !== false;
        return makeField(required, opts.label, (raw, label) => {
            const s = String(raw ?? '').trim();
            if (!s)
                return required ? (0, fieldTypes_1.err)(`${label} is required.`) : (0, fieldTypes_1.ok)('');
            if (s.length > 128)
                return (0, fieldTypes_1.err)(`${label} is not a valid identifier.`);
            return (0, fieldTypes_1.ok)(s);
        });
    }
};
/**
 * Validate and NORMALIZE a request body against a spec.
 *
 * Collects every failure rather than stopping at the first. A receptionist
 * fixing one field, resubmitting, and being told about the next one is how a
 * four-field form takes four round trips — and they are usually standing in
 * front of the patient while they do it.
 */
function parseBody(body, spec) {
    const source = body !== null && typeof body === 'object' ? body : {};
    const value = {};
    const errors = {};
    for (const key of Object.keys(spec)) {
        const f = spec[key];
        if (!f)
            continue;
        const label = f.label ?? humanize(key);
        const raw = source[key];
        // An absent optional field stays absent. Writing `undefined` into the
        // result would overwrite a stored value with nothing on a PUT — the
        // difference between "leave the phone alone" and "clear the phone".
        if (!f.required && (raw === undefined || raw === null))
            continue;
        const parsed = f.parse(raw, label);
        if (parsed.ok) {
            value[key] = parsed.value;
        }
        else {
            errors[key] = parsed.error;
        }
    }
    const firstKey = Object.keys(errors)[0];
    if (firstKey !== undefined) {
        return { ok: false, error: errors[firstKey], errors };
    }
    return { ok: true, value: value };
}
//# sourceMappingURL=parseBody.js.map