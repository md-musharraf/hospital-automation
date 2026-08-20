// Medicine-stock helpers shared by the doctor console (read-only availability
// while prescribing) and the pharmacy counter (decrement on dispense).
//
// Prescriptions are typed by hand, so matching a written "Paracetamol 500mg"
// against an inventory row named "Paracetamol" has to be forgiving — exact match
// first, then a normalised contains-match, then generic name.

import Medicine from '../models/Medicine';
import { toFacility, toRole, logActivity } from './realtime';

export const normalize = (s?: string | null): string =>
  (s || '')
    .toString()
    .toLowerCase()
    .replace(/\d+\s*(mg|ml|mcg|g|iu)\b/g, ' ') // drop the strength
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Stock level bucket for a row.
 *
 * `untracked` is not a problem state: it means this facility never entered the
 * medicine, which is the normal case for a store that carries thousands of
 * items and has typed in a few dozen. Treating it as a shortage told patients a
 * medicine sitting on the shelf was unavailable.
 */
export function levelOf(med?: any): string {
  if (!med) return 'untracked';
  if (med.stockQty <= 0) return 'out';
  if (med.stockQty <= (med.reorderLevel || 0)) return 'low';
  return 'in-stock';
}

/** Is this row past (or near) its expiry date? */
export function expiryFlag(med?: any): string | null {
  if (!med || !med.expiryDate) return null;
  const days = Math.floor((new Date(med.expiryDate).getTime() - Date.now()) / 86400000);
  if (days < 0) return 'expired';
  if (days <= 30) return 'expiring';
  return null;
}

/** Best inventory row for a written medicine name, within one facility. */
export function matchMedicine(inventory: any[], writtenName: string): any {
  const n = normalize(writtenName);
  if (!n) return null;
  return (
    inventory.find((m) => normalize(m.name) === n) ||
    inventory.find((m) => normalize(m.name).includes(n) || n.includes(normalize(m.name))) ||
    inventory.find(
      (m) => m.genericName && (normalize(m.genericName) === n || n.includes(normalize(m.genericName)))
    ) ||
    null
  );
}

/**
 * Availability for a list of written medicine names.
 * Returns one entry per requested name, in the same order.
 */
export async function checkAvailability(hospital: string, names: string[] = []): Promise<any[]> {
  const inventory = (await (Medicine as any).find({ hospital })) || [];
  return names.map((name) => {
    const med = matchMedicine(inventory, name);
    return {
      requested: name,
      matched: med ? med.name : null,
      medicineId: med ? String(med._id) : null,
      level: levelOf(med),
      stockQty: med ? med.stockQty : 0,
      unit: med ? med.unit : null,
      expiry: expiryFlag(med)
    };
  });
}

/**
 * Take the prescribed medicines out of stock at dispense time.
 * Never blocks the handover — a store may keep items off-system — but reports
 * exactly what could not be covered so the counter can tell the patient, and the
 * shortage is broadcast so the doctor and reception see it too.
 */
export async function consumeStock(
  io: any,
  { hospital, medicines = [], by, tokenNumber }: any
): Promise<{ deducted: any[]; shortages: any[]; untracked: string[] }> {
  const inventory = (await (Medicine as any).find({ hospital })) || [];
  const deducted: any[] = [];
  const shortages: any[] = [];
  const untracked: string[] = [];

  for (const line of medicines) {
    const name = line && (line.name || line);
    if (!name) continue;

    const med = matchMedicine(inventory, name);

    // NOT IN THE INVENTORY IS NOT OUT OF STOCK.
    //
    // A medical store carries thousands of items and typing every one of them
    // into this system is work nobody has time for. Treating an absent row as a
    // shortage punished exactly the facilities that had not done that data
    // entry: the medicine was sitting on the shelf, the counter handed it over,
    // and the patient still got a WhatsApp saying it was unavailable.
    //
    // So stock tracking is opt-in by nature — a facility tracks whatever it has
    // chosen to enter, and everything else is assumed to be on the shelf. The
    // storekeeper is still told, quietly, so they can add the row if they want
    // it counted; the patient is not, because as far as they are concerned
    // nothing went wrong.
    if (!med) {
      untracked.push(name);
      await logActivity(io, {
        hospital,
        type: 'stock-untracked',
        role: 'pharmacy',
        actor: by || 'Pharmacy',
        message: `${name} was handed over for ${tokenNumber || 'a patient'}. It is not in the inventory, so no stock was adjusted — add it if you want this counted.`,
        tokenNumber,
        severity: 'info'
      });
      continue;
    }

    // A tracked medicine that has genuinely run out. This one the patient does
    // need to hear about — they are leaving without part of their course.
    if (med.stockQty <= 0) {
      shortages.push({ requested: name, matched: med.name, reason: 'out-of-stock' });

      const alert = {
        name: med.name,
        stockQty: 0,
        level: 'out',
        reason: 'out-of-stock',
        tokenNumber
      };
      toRole(io, 'pharmacy', hospital, 'stock-alert', alert);
      toRole(io, 'staff', hospital, 'stock-alert', alert);
      await logActivity(io, {
        hospital,
        type: 'stock-out',
        role: 'pharmacy',
        actor: by || 'Pharmacy',
        message: `Could not dispense ${med.name} for ${tokenNumber || 'a patient'} — OUT OF STOCK.`,
        tokenNumber,
        refId: med._id,
        severity: 'critical'
      });
      continue;
    }

    med.stockQty = Math.max(0, med.stockQty - 1);
    med.updatedBy = by || 'Pharmacy';
    await med.save();
    deducted.push({ name: med.name, remaining: med.stockQty, unit: med.unit });

    // Warn the moment a medicine crosses its reorder line or empties out.
    const level = levelOf(med);
    if (level === 'out' || level === 'low') {
      toRole(io, 'pharmacy', hospital, 'stock-alert', {
        medicineId: String(med._id),
        name: med.name,
        stockQty: med.stockQty,
        level
      });
      toRole(io, 'staff', hospital, 'stock-alert', {
        medicineId: String(med._id),
        name: med.name,
        stockQty: med.stockQty,
        level
      });
      await logActivity(io, {
        hospital,
        type: level === 'out' ? 'stock-out' : 'stock-low',
        role: 'pharmacy',
        actor: by || 'Pharmacy',
        message:
          level === 'out'
            ? `${med.name} is OUT OF STOCK — reorder immediately.`
            : `${med.name} is running low (${med.stockQty} ${med.unit} left, reorder at ${med.reorderLevel}).`,
        tokenNumber,
        refId: med._id,
        severity: level === 'out' ? 'critical' : 'warning'
      });
    }
  }

  if (deducted.length > 0) {
    toFacility(io, hospital, 'inventory-updated', { changed: deducted.map((d) => d.name) });
  }

  return { deducted, shortages, untracked };
}

/** Rows that need attention: at/below reorder level, out, expired or expiring. */
export async function stockAlerts(
  hospital: string
): Promise<{ out: any[]; low: any[]; expiring: any[]; total: number }> {
  const inventory = (await (Medicine as any).find({ hospital })) || [];
  const out: any[] = [];
  const low: any[] = [];
  const expiring: any[] = [];
  for (const m of inventory) {
    const level = levelOf(m);
    if (level === 'out') out.push(m);
    else if (level === 'low') low.push(m);
    const e = expiryFlag(m);
    if (e) expiring.push({ medicine: m, flag: e });
  }
  return { out, low, expiring, total: inventory.length };
}
