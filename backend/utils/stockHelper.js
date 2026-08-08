// Medicine-stock helpers shared by the doctor console (read-only availability
// while prescribing) and the pharmacy counter (decrement on dispense).
//
// Prescriptions are typed by hand, so matching a written "Paracetamol 500mg"
// against an inventory row named "Paracetamol" has to be forgiving — exact match
// first, then a normalised contains-match, then generic name.

const Medicine = require('../models/Medicine');
const { toFacility, toRole, logActivity } = require('./realtime');

const normalize = (s) => (s || '')
  .toString().toLowerCase()
  .replace(/\d+\s*(mg|ml|mcg|g|iu)\b/g, ' ')  // drop the strength
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

/** Stock level bucket for a row. */
function levelOf(med) {
  if (!med) return 'unknown';
  if (med.stockQty <= 0) return 'out';
  if (med.stockQty <= (med.reorderLevel || 0)) return 'low';
  return 'in-stock';
}

/** Is this row past (or near) its expiry date? */
function expiryFlag(med) {
  if (!med || !med.expiryDate) return null;
  const days = Math.floor((new Date(med.expiryDate) - Date.now()) / 86400000);
  if (days < 0) return 'expired';
  if (days <= 30) return 'expiring';
  return null;
}

/** Best inventory row for a written medicine name, within one facility. */
function matchMedicine(inventory, writtenName) {
  const n = normalize(writtenName);
  if (!n) return null;
  return inventory.find(m => normalize(m.name) === n)
    || inventory.find(m => normalize(m.name).includes(n) || n.includes(normalize(m.name)))
    || inventory.find(m => m.genericName && (normalize(m.genericName) === n || n.includes(normalize(m.genericName))))
    || null;
}

/**
 * Availability for a list of written medicine names.
 * Returns one entry per requested name, in the same order.
 */
async function checkAvailability(hospital, names = []) {
  const inventory = await Medicine.find({ hospital });
  return names.map(name => {
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
 *
 * @returns {{ deducted: Array, shortages: Array }}
 */
async function consumeStock(io, { hospital, medicines = [], by, tokenNumber }) {
  const inventory = await Medicine.find({ hospital });
  const deducted = [];
  const shortages = [];

  for (const line of medicines) {
    const name = line && (line.name || line);
    if (!name) continue;

    const med = matchMedicine(inventory, name);

    // A medicine we could NOT hand over is the most important thing that can
    // happen at this counter — the patient leaves without part of their course.
    // Raise it loudly (feed + pharmacy + reception) instead of silently skipping.
    if (!med || med.stockQty <= 0) {
      const reason = med ? 'out-of-stock' : 'not-in-inventory';
      shortages.push({ requested: name, matched: med ? med.name : null, reason });

      const alert = { name: med ? med.name : name, stockQty: 0, level: 'out', reason, tokenNumber };
      toRole(io, 'pharmacy', hospital, 'stock-alert', alert);
      toRole(io, 'staff', hospital, 'stock-alert', alert);
      await logActivity(io, {
        hospital, type: 'stock-out', role: 'pharmacy', actor: by || 'Pharmacy',
        message: med
          ? `Could not dispense ${med.name} for ${tokenNumber || 'a patient'} — OUT OF STOCK.`
          : `${name} was prescribed for ${tokenNumber || 'a patient'} but is not in the store's inventory.`,
        tokenNumber, refId: med && med._id, severity: 'critical'
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
        medicineId: String(med._id), name: med.name, stockQty: med.stockQty, level
      });
      toRole(io, 'staff', hospital, 'stock-alert', {
        medicineId: String(med._id), name: med.name, stockQty: med.stockQty, level
      });
      await logActivity(io, {
        hospital,
        type: level === 'out' ? 'stock-out' : 'stock-low',
        role: 'pharmacy',
        actor: by || 'Pharmacy',
        message: level === 'out'
          ? `${med.name} is OUT OF STOCK — reorder immediately.`
          : `${med.name} is running low (${med.stockQty} ${med.unit} left, reorder at ${med.reorderLevel}).`,
        tokenNumber,
        refId: med._id,
        severity: level === 'out' ? 'critical' : 'warning'
      });
    }
  }

  if (deducted.length > 0) {
    toFacility(io, hospital, 'inventory-updated', { changed: deducted.map(d => d.name) });
  }

  return { deducted, shortages };
}

/** Rows that need attention: at/below reorder level, out, expired or expiring. */
async function stockAlerts(hospital) {
  const inventory = await Medicine.find({ hospital });
  const out = [], low = [], expiring = [];
  for (const m of inventory) {
    const level = levelOf(m);
    if (level === 'out') out.push(m);
    else if (level === 'low') low.push(m);
    const e = expiryFlag(m);
    if (e) expiring.push({ medicine: m, flag: e });
  }
  return { out, low, expiring, total: inventory.length };
}

module.exports = { normalize, levelOf, expiryFlag, matchMedicine, checkAvailability, consumeStock, stockAlerts };
