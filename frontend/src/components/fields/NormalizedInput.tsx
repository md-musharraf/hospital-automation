import React, { useState } from 'react';
import { formatPhoneForDisplay, normalizeEmail, normalizePhone, toInt, toMoney } from '@careeai/shared';

/**
 * Inputs that store what they promise.
 * ---------------------------------------------------------------------------
 * The backend now normalizes everything it is sent, so the DATA is safe without
 * these. What these fix is the other half of the problem: what the person at
 * the keyboard SEES.
 *
 * A receptionist who types `Rao@Clinic.IN`, saves, and sees `Rao@Clinic.IN` on
 * screen has no idea it was stored lower-cased — so when the doctor list shows
 * `rao@clinic.in` later it looks like the system changed their data behind
 * their back. Normalizing in the field means the screen and the database never
 * disagree, and nobody has to be told about a rule they cannot see.
 *
 * WHEN each type normalizes is a deliberate per-field decision, not a blanket
 * one:
 *
 *   email   — as you type. Lower-casing is invisible-feeling (every login form
 *             does it) and the cursor never moves, so there is nothing to fight.
 *   phone   — on blur, NEVER mid-keystroke. Rewriting "98765" into "+919876..."
 *             while someone is still typing jumps the caret and eats digits;
 *             this is the single most common way a "smart" phone field becomes
 *             unusable. Free typing, then one tidy-up when they leave.
 *   number  — as you type, but only by refusing characters that are not part of
 *             a number. The value handed to the parent is a NUMBER, so the old
 *             `parseInt(e.target.value)` at every call site can go.
 *
 * Written in TypeScript against the same `@careeai/shared` module the schemas
 * use, so the form and the database cannot drift apart about what a valid value
 * is — there is one definition and both sides import it.
 */

type BaseProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur' | 'type'>;

/* ── Email ───────────────────────────────────────────────────────────────── */

export interface EmailInputProps extends BaseProps {
  value: string;
  onChange: (value: string) => void;
  /** Called on blur with the canonical address, or null if it is not valid. */
  onValidated?: (email: string | null) => void;
}

export function EmailInput({ value, onChange, onValidated, ...rest }: EmailInputProps) {
  return (
    <input
      {...rest}
      type="email"
      inputMode="email"
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      value={value}
      // Lower-cased on the way in, so what is on screen is what will be stored.
      // Spaces are stripped rather than trimmed: a pasted address often carries
      // a trailing one, and an inner space is never valid in an address anyway.
      onChange={(e) => onChange(e.target.value.replace(/\s+/g, '').toLowerCase())}
      onBlur={() => onValidated?.(normalizeEmail(value))}
    />
  );
}

/* ── Phone ───────────────────────────────────────────────────────────────── */

export interface PhoneInputProps extends BaseProps {
  value: string;
  onChange: (value: string) => void;
  /** Called on blur with the canonical `+91XXXXXXXXXX`, or null if unusable. */
  onValidated?: (phone: string | null) => void;
}

export function PhoneInput({ value, onChange, onValidated, ...rest }: PhoneInputProps) {
  const [touched, setTouched] = useState(false);
  const canonical = normalizePhone(value);
  const invalid = touched && value.trim().length > 0 && canonical === null;

  return (
    <input
      {...rest}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      value={value}
      // Deliberately unfiltered while typing. People paste numbers with
      // brackets, dots and country codes, and rejecting those characters
      // keystroke-by-keystroke makes a paste silently lose digits.
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => {
        setTouched(true);
        // Tidy to the display grouping rather than to raw E.164: `+91 98765
        // 43210` is the form a person can check against the card in their hand.
        // What gets SENT is canonicalized by the parent on submit and again by
        // the schema, so display and storage are free to differ here.
        if (canonical) onChange(formatPhoneForDisplay(canonical));
        onValidated?.(canonical);
      }}
      aria-invalid={invalid || undefined}
      {...(invalid ? { 'data-invalid': 'true' } : {})}
    />
  );
}

/* ── Number ──────────────────────────────────────────────────────────────── */

export interface NumberInputProps extends BaseProps {
  /** Empty string means "the field is blank", which is not the same as 0. */
  value: number | string;
  onChange: (value: any) => void;
  min?: number;
  max?: number;
  /** Allow decimals and round to 2 places — fees, prices, totals. */
  money?: boolean;
}

export function NumberInput({ value, onChange, min, max, money = false, ...rest }: NumberInputProps) {
  // Held as text while editing so a half-typed "1." or a cleared field does not
  // get coerced into 1 or 0 under the user's fingers.
  const [draft, setDraft] = useState<string>(value === '' ? '' : String(value));

  // Re-sync when the parent changes the value from outside (loading a record
  // into the form, resetting after a save).
  const parentText = value === '' ? '' : String(value);
  const [lastParent, setLastParent] = useState(parentText);
  if (parentText !== lastParent) {
    setLastParent(parentText);
    setDraft(parentText);
  }

  const commit = (text: string) => {
    if (text.trim() === '') {
      onChange('');
      return;
    }
    const parsed = money
      ? toMoney(text)
      : toInt(text, { ...(min !== undefined && { min }), ...(max !== undefined && { max }) });
    // An unparseable or out-of-range entry leaves the parent's value alone; the
    // draft still shows what was typed, so the person can see and fix it rather
    // than watching the field silently snap back to something they did not type.
    if (parsed !== null) onChange(parsed);
  };

  return (
    <input
      {...rest}
      type="text"
      inputMode={money ? 'decimal' : 'numeric'}
      value={draft}
      onChange={(e) => {
        // Refuse characters that cannot be part of a number, rather than
        // accepting them and failing at submit. `parseInt('12abc')` returning
        // 12 is exactly the silent corruption this replaces.
        const allowed = money ? /[^0-9.]/g : /[^0-9]/g;
        const cleaned = e.target.value.replace(allowed, '');
        setDraft(cleaned);
        commit(cleaned);
      }}
      onBlur={() => {
        // Normalize the display on the way out: "007" becomes "7", "12.5"
        // stays "12.5", and a blank field stays blank.
        if (draft.trim() === '') return;
        const parsed = money
          ? toMoney(draft)
          : toInt(draft, { ...(min !== undefined && { min }), ...(max !== undefined && { max }) });
        if (parsed !== null) setDraft(String(parsed));
      }}
    />
  );
}
