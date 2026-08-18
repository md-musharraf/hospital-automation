/**
 * Finding the bill for a visit, once, for everyone.
 *
 * `Invoice.findOne({ token: tokenId })` looks obviously correct and misses the
 * bills that matter. Several billing routes load an invoice with
 * `.populate('token')` and then save it, which writes the whole Token DOCUMENT
 * over the ObjectId in that field — so from the discharge onwards, an equality
 * query on the ref matches nothing, for exactly the visits that have been all
 * the way through the building. It is the same trap documented in
 * `routes/doctor.ts` for `Token.find({ patient })`.
 *
 * Two things went wrong because of it, both of them silent:
 *
 *   - Reception's bill follow-up answered "No bill has been raised for this
 *     patient yet" for a patient who had just been discharged and paid.
 *   - `GET /billing/token/:tokenId` treats a miss as "no invoice exists" and
 *     AUTO-CREATES one, so the visit ends up with a second, empty bill sitting
 *     next to the real one.
 *
 * The rule, as everywhere else in this codebase: scope by `hospital` — always a
 * plain string, and covered by the tenant index — and compare the reference in
 * JS, where either shape resolves the same way.
 */

import Invoice from '../models/Invoice';
import { toId } from './ids';

/**
 * The most recent invoice raised for one visit at one facility, or null.
 *
 * Newest first, because a facility that has (through the bug above, or a manual
 * correction) ended up with two rows for one visit should be answered with the
 * one currently in use, not the one it superseded.
 */
export async function findInvoiceForToken(hospital: string, tokenRef: any): Promise<any> {
  const wanted = toId(tokenRef);
  if (!wanted) return null;

  const rows = (await (Invoice as any).find({ hospital })) || [];
  const mine = rows.filter((invoice: any) => toId(invoice.token) === wanted);
  if (mine.length === 0) return null;

  mine.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  return mine[0];
}
