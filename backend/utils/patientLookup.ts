/**
 * Finding a patient by phone number, once, for everyone.
 * ---------------------------------------------------------------------------
 * Three routes needed this and three routes wrote it differently:
 *
 *   - `chat.js`   built a nine-way `$or` over every spelling of the number
 *   - `staff.js`  queried the raw string exactly as reception typed it
 *   - `billing.js` queried `String(phone).trim()` and nothing more
 *
 * So the same patient could be found by the chat engine and not by reception,
 * which is how one person ended up with two records and a visit history split
 * between them.
 *
 * `Patient.phone` is now canonicalized by the schema, so everything WRITTEN
 * from here on is `+91XXXXXXXXXX`. Rows written before that are not, which is
 * why this still searches the variants — it is reading history, not tolerating
 * sloppiness. Once a back-fill has rewritten the old rows, `phoneVariants` can
 * come out and this becomes a single-key lookup.
 */

import { normalizePhone, phoneVariants } from '@careeai/shared';
import Patient from '../models/Patient';

/**
 * The one patient at `hospital` with this number, or null.
 *
 * ALWAYS tenant-scoped. An unscoped patient lookup would return another
 * facility's record for the same phone number, which is a cross-tenant leak of
 * exactly the kind `utils/tenantGuard.js` exists to prevent — a patient can
 * legitimately be registered at two facilities, and those are two records.
 */
export async function findPatientByPhone(hospital: string, rawPhone?: string | null): Promise<any> {
  if (!hospital)
    throw new Error('findPatientByPhone requires a hospital — an unscoped lookup leaks tenants.');
  if (!rawPhone) return null;

  const variants = phoneVariants(rawPhone);
  if (variants.length === 0) return null;

  // The canonical form first as its own query: it hits the `{phone, hospital}`
  // index directly, where the `$or` over nine spellings cannot.
  const canonical = normalizePhone(rawPhone);
  if (canonical) {
    const exact = await (Patient as any).findOne({ phone: canonical, hospital });
    if (exact) return exact;
  }

  return (Patient as any).findOne({ hospital, $or: variants.map((phone) => ({ phone })) });
}

/**
 * Is this number already taken by a DIFFERENT patient at this facility?
 *
 * Returns the conflicting patient, or null. `exceptId` is what makes this
 * usable from an edit route — a patient keeping their own number is not a
 * conflict with themselves, and treating it as one is a bug reception meets
 * the first time they fix a typo in a name.
 */
export async function findPhoneConflict(
  hospital: string,
  rawPhone?: string | null,
  exceptId: any = null
): Promise<any> {
  const found = await findPatientByPhone(hospital, rawPhone);
  if (!found) return null;
  if (exceptId && String(found._id) === String(exceptId)) return null;
  return found;
}
