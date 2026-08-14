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
