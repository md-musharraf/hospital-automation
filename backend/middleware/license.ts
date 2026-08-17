/**
 * The gate that actually switches a facility off.
 *
 * `utils/licenseHelper.ts` decides what a licence MEANS; this decides where that
 * decision is enforced, and it is enforced in exactly one place: inside
 * `authenticateToken`, which every console route in the app already passes
 * through. Adding a second guard to a hundred route definitions would work until
 * the first route somebody forgets — and the route somebody forgets is, by
 * definition, the one a lapsed tenant keeps using.
 *
 * Two things stay open on purpose even for a blocked facility:
 *
 *   - Signing in. A hospital that cannot log in cannot be TOLD why nothing
 *     works, and the renewal screen lives behind the login.
 *   - The licence endpoints themselves, so the console can show the state and
 *     the owner can act on it.
 *
 * The super-admin console never comes through here at all — it authenticates
 * with the platform secret (`verifyAdminSecret`), so the owner can always reach
 * a suspended tenant to un-suspend it.
 */

import Hospital from '../models/Hospital';
import logger from '../utils/logger';
import { licenseState, type LicenseState } from '../utils/licenseHelper';

/**
 * How long a facility's licence row is reused before it is read again.
 *
 * Without this, licensing would add one database round trip to every single
 * authenticated request in the platform — for a value that changes a few times a
 * year. Sixty seconds is short enough that a renewal is live before the owner
 * has finished telling the hospital, and `invalidateLicense` makes it instant on
 * the path that matters.
 */
const CACHE_TTL_MS = 60 * 1000;

const cache = new Map<string, { facility: any; at: number }>();

/** Drop a facility's cached licence — called the moment a term is granted or revoked. */
export function invalidateLicense(hospitalId?: string | null): void {
  if (hospitalId) cache.delete(String(hospitalId));
  else cache.clear();
}

/** The facility row behind a licence decision, cached briefly. */
async function facilityFor(hospitalId: string): Promise<any> {
  const key = String(hospitalId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.facility;

  const facility = await (Hospital as any).findOne({ id: key });
  cache.set(key, { facility, at: Date.now() });
  return facility;
}

/** Where this facility stands right now, for any caller that needs to say so. */
export async function licenseFor(hospitalId: string, now: Date = new Date()): Promise<LicenseState> {
  const facility = await facilityFor(hospitalId);
  return licenseState(facility, now);
}

/**
 * Paths that must keep working for a blocked facility.
 *
 * Matched against the full request path. Kept deliberately short: everything
 * here is a way to SEE the problem or FIX it, and nothing here treats a patient.
 */
const ALWAYS_OPEN = [/^\/api\/v1\/auth\//, /\/license$/, /^\/api\/v1\/notifications\/vapid/];

function isAlwaysOpen(path: string): boolean {
  return ALWAYS_OPEN.some((re) => re.test(path || ''));
}

/**
 * Refuse a request from a facility whose licence has run out.
 *
 * Returns true when the request was answered (and the caller must stop), false
 * when it may continue. Written as a plain function rather than a middleware so
 * `authenticateToken` can call it from inside its jwt callback, which is the
 * only point where the tenant is known.
 *
 * A lookup failure lets the request THROUGH. The alternative — refusing every
 * request on a database hiccup — turns an unrelated outage into a platform-wide
 * shutdown of hospitals that have paid, which is a far worse failure than a
 * lapsed tenant getting a few extra minutes.
 */
export async function refuseIfUnlicensed(req: any, res: any): Promise<boolean> {
  try {
    const hospitalId = req.user && req.user.hospital;
    if (!hospitalId) return false;
    if (isAlwaysOpen(req.originalUrl || req.path)) return false;

    const state = await licenseFor(hospitalId);
    if (!state.blocked) {
      // Handed downstream so a route can mention the grace period without
      // looking the licence up a second time.
      req.license = state;
      return false;
    }

    logger.warn('[LICENCE] Blocked request from an unlicensed facility', {
      hospital: hospitalId,
      stage: state.stage,
      path: req.originalUrl
    });

    // 402 Payment Required, which is exactly what this is. A 403 would be
    // indistinguishable from a permissions bug on the console side.
    res.status(402).json({
      message: state.message,
      licenseBlocked: true,
      license: {
        stage: state.stage,
        plan: state.plan,
        planLabel: state.planLabel,
        expiresAt: state.expiresAt,
        daysLeft: state.daysLeft
      }
    });
    return true;
  } catch (err) {
    logger.error('[LICENCE] Could not evaluate a licence — allowing the request', { err });
    return false;
  }
}
