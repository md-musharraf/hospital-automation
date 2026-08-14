/**
 * One login per facility.
 * ---------------------------------------------------------------------------
 * A hospital we onboard gets ONE credential. Reception, the doctors' cabins,
 * the lab bench and the pharmacy counter are not four accounts with four
 * passwords — they are four rooms inside the one console that credential opens.
 *
 * That is not only a convenience. Four accounts per tenant meant four passwords
 * to hand out, four to rotate when someone left, and — because nobody rotates
 * four passwords — four copies of the same sticky note on the same desk. A
 * single facility credential is the one thing a small clinic can actually keep
 * track of, and the owner can reset it in one place.
 *
 * What a credential is allowed to reach is decided by the facility's OWN module
 * map, not by which password was typed: a pathology lab that runs no OPD has no
 * doctor scope in its token at all, so the doctor endpoints are closed to it
 * even though it signs in through the same door as a district hospital.
 *
 * There is deliberately no default password anywhere in this file or its
 * callers. A facility with no FacilityCredential row cannot be signed into at
 * all — the owner has to set one. A shared fallback would be the whole
 * platform's skeleton key, and "we'll change it later" is exactly how it stays
 * `password123` in production.
 */

import { accountKindsFor, legacyModulesFrom } from './facilityProfile';

/**
 * Minimum facility password length.
 *
 * Long rather than clever: a facility password is typed by a receptionist at the
 * start of a shift, not by a security engineer, so "at least twelve characters"
 * survives contact with reality where "one symbol and one digit" produces
 * `Passw0rd!` on every deployment.
 */
export const PASSWORD_MIN_LENGTH = 12;

/**
 * The passwords we refuse outright.
 *
 * A length rule alone still admits `hospital1234`. These are the ones that get
 * typed when someone is filling a required field rather than choosing a secret.
 */
export const BANNED_PASSWORD_PATTERNS: RegExp[] = [
  /^password/i,
  /^hospital/i,
  /^clinic/i,
  /^admin/i,
  /^welcome/i,
  /^123456/,
  /^qwerty/i
];

/**
 * The account kinds a module map implies, expressed as the console scopes a
 * token carries. `accountKindsFor` says "doctors"; every route guard in the app
 * says `role: 'doctor'`. This is where the two vocabularies meet, once.
 */
export const KIND_TO_SCOPE: Record<string, string> = {
  staff: 'staff',
  doctors: 'doctor',
  lab: 'lab',
  pharmacy: 'pharmacy'
};

/** Every scope this codebase knows about, in the order the console shows them. */
export const ALL_SCOPES: string[] = ['staff', 'doctor', 'lab', 'pharmacy'];

/**
 * Which consoles this facility's credential may open.
 *
 * Facilities registered before the module map existed have `modules: {}`. They
 * are not scope-less — they are pre-module, and `legacyModulesFrom` reconstructs
 * what they run from their type and the two legacy booleans. Getting this wrong
 * would silently lock an existing tenant out of its own lab.
 */
export function scopesForFacility(hospital: any): string[] {
  if (!hospital) return [];
  const modules =
    hospital.modules && Object.keys(hospital.modules).length ? hospital.modules : legacyModulesFrom(hospital);

  const scopes = accountKindsFor(modules, hospital.type)
    .map((kind: string) => KIND_TO_SCOPE[kind])
    .filter(Boolean) as string[];

  // Every facility has a front desk, whatever its module map says. Reception is
  // where a walk-in is registered and a bill is raised; a tenant that can sign
  // in but cannot admit a patient is not an operable tenant, and the alternative
  // is an owner discovering it at 9am on a Monday.
  if (!scopes.includes('staff')) scopes.push('staff');

  return ALL_SCOPES.filter((s) => scopes.includes(s));
}

/**
 * Is this password good enough to become a facility's only credential?
 * Returns `null` when it is, or the sentence to show the owner when it is not.
 */
export function rejectWeakPassword(password?: string | null): string | null {
  if (typeof password !== 'string' || !password.trim()) {
    return 'A facility password is required.';
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `The facility password must be at least ${PASSWORD_MIN_LENGTH} characters. It is the only credential for this facility, so it is worth making it a phrase rather than a word.`;
  }
  if (BANNED_PASSWORD_PATTERNS.some((re) => re.test(password))) {
    return 'That password starts with something guessable (password / hospital / admin / 123456). Choose a phrase nobody would try first.';
  }
  return null;
}

/**
 * Minimum length for ONE PERSON's password.
 *
 * Shorter than a facility's twelve, deliberately. A facility credential is the
 * skeleton key to a whole tenant and is typed a handful of times a week; a
 * personal password is typed at the start of every shift by someone standing at
 * a counter with patients waiting, and a rule that makes it painful is a rule
 * that produces one password written on the monitor for the whole department —
 * which is the exact failure the personal login exists to remove. Eight, plus
 * the same guessable-prefix ban, is the honest trade.
 */
export const PERSON_PASSWORD_MIN_LENGTH = 8;

/**
 * Is this password good enough for one person's sign-in?
 * Returns `null` when it is, or the sentence to show the admin when it is not.
 */
export function rejectWeakPersonPassword(password?: string | null): string | null {
  if (typeof password !== 'string' || !password.trim()) {
    return 'A password is required.';
  }
  if (password.length < PERSON_PASSWORD_MIN_LENGTH) {
    return `A personal password must be at least ${PERSON_PASSWORD_MIN_LENGTH} characters.`;
  }
  if (BANNED_PASSWORD_PATTERNS.some((re) => re.test(password))) {
    return 'That password starts with something guessable (password / hospital / admin / 123456). Choose something nobody would try first.';
  }
  return null;
}

/**
 * The four collections a person can sign in from, and the console each opens.
 *
 * Written as data rather than a switch because three separate places need to
 * walk the same list — sign-in, password-setting, and the roster the admin panel
 * shows — and a role that exists in one of those and not the others is how a
 * pharmacist ends up creatable but unable to log in.
 *
 * `scope` is what the token carries; every route guard in this app is written
 * against these four strings (see ALL_SCOPES).
 */
export const PERSON_ROLES: Array<{ scope: string; model: string; label: string }> = [
  { scope: 'staff', model: 'Staff', label: 'Reception' },
  { scope: 'doctor', model: 'Doctor', label: 'Doctor' },
  { scope: 'lab', model: 'LabAssistant', label: 'Lab' },
  { scope: 'pharmacy', model: 'Pharmacist', label: 'Pharmacy' }
];

export interface PersonTokenClaims {
  role: string;
  hospital: string;
  name: string;
  scopes: string[];
  personId: string;
  personRole: string;
  actingDoctor?: string;
}

/**
 * The claims ONE PERSON's session carries.
 *
 * Shaped to slot into the guards that already exist rather than to be tidy:
 * `role` is the scope string because `ensureRole` compares against exactly that,
 * and `scopes` is the same single value as a list because the facility session
 * carries a list and the multi-scope routes check it. A person therefore reaches
 * precisely one console, which is the whole point — a receptionist's token has
 * no doctor scope in it at all.
 *
 * For a doctor, `actingDoctor` is set here at sign-in. The facility flow gets
 * that claim from POST /facility/cabin after choosing from a roster; a doctor
 * signing in as themselves has already answered that question by logging in, so
 * asking again would be asking someone to confirm who they are.
 */
export function personTokenClaims(person: any, scope: string, hospitalId: string): PersonTokenClaims {
  const claims: PersonTokenClaims = {
    role: scope,
    hospital: hospitalId,
    name: person.name,
    scopes: [scope],
    personId: String(person._id),
    personRole: scope
  };

  if (scope === 'doctor') {
    claims.actingDoctor = String(person._id);
  }

  return claims;
}

export interface FacilityTokenClaims {
  role: string;
  hospital: string;
  name: string;
  scopes: string[];
}

/**
 * The claims a facility session carries.
 *
 * `hospital` is the tenant every route already scopes its queries by, so a
 * facility token slots into the existing tenancy checks unchanged. `scopes` is
 * the new part, and it is baked into the token at sign-in: a facility that
 * switches its lab off mid-shift keeps its lab scope until the token expires,
 * which is the right trade — revoking a running shift's access mid-patient is
 * worse than a stale scope for at most twelve hours.
 */
export function facilityTokenClaims(hospital: any): FacilityTokenClaims {
  return {
    role: 'facility',
    hospital: hospital.id,
    name: hospital.name,
    scopes: scopesForFacility(hospital)
  };
}
