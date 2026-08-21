const express = require('express');
const router = express.Router();
const Token = require('../models/Token');
const Doctor = require('../models/Doctor');
const Patient = require('../models/Patient');
const Medicine = require('../models/Medicine');
const { startOfToday, onlyToday } = require('../utils/dates');
const { authenticateToken, ensureRole } = require('../middleware/auth');

// Role guard for this router (see middleware/auth.js).
const ensurePharmacy = ensureRole('pharmacy');
const { toRole, toDoctor, toFacility, logActivity, announceJourney } = require('../utils/realtime');
const { setStage, deriveStage } = require('../utils/journeyHelper');
const { checkAvailability, consumeStock, stockAlerts, levelOf, expiryFlag } = require('../utils/stockHelper');
const {
  pendingOf,
  dispenseStateOf,
  medicineKey,
  listNames,
  dispenseMessage
} = require('../utils/prescriptionHelper');
const logger = require('../utils/logger');

// GET all tokens with a doctor's prescription in the pharmacist's facility.
// Scoped strictly to the pharmacist's own facility (via that facility's doctors),
// so one facility's medical store never sees another facility's prescriptions.
// Each medicine line is annotated with LIVE stock, so the counter knows what it
// can actually hand over before it calls the patient forward.
router.get('/prescriptions', authenticateToken, ensurePharmacy, async (req, res) => {
  try {
    const hospital = req.user.hospital || 'general-hospital';
    const doctors = await Doctor.find({ hospital });
    const docIds = doctors.map((d) => d._id);

    // Fetch this facility's tokens then keep only those that actually carry a
    // prescription. We filter in JS (not a `prescription.medicines.0 $exists`
    // query) so it behaves identically on real MongoDB and the in-memory mock.
    const all = await Token.find({ doctor: { $in: docIds } })
      .populate('patient')
      .populate('doctor', '-passwordHash');

    const tokens = all
      .filter(
        (t) =>
          t.prescription && Array.isArray(t.prescription.medicines) && t.prescription.medicines.length > 0
      )
      .sort((a, b) => {
        // Anything still owed is still work, whether nothing was handed over or
        // only the last item is missing. Sorting on the `dispensed` boolean sent
        // a half-filled prescription to the bottom of the counter's list with
        // the finished ones.
        const ad = pendingOf(a.prescription).length > 0 ? 0 : 1;
        const bd = pendingOf(b.prescription).length > 0 ? 0 : 1;
        if (ad !== bd) return ad - bd;
        return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
      });

    // Annotate with live availability (read-only view — never saved back).
    const inventory = await Medicine.find({ hospital });
    const enriched = await Promise.all(
      tokens.map(async (t) => {
        const obj = t.toObject ? t.toObject() : { ...t };
        const names = (obj.prescription.medicines || []).map((m) => m.name).filter(Boolean);
        obj.stock = inventory.length > 0 ? await checkAvailability(hospital, names) : [];
        // Only a medicine the store TRACKS and has run out of. An item the
        // facility never entered is assumed to be on the shelf — see levelOf().
        obj.hasShortage = obj.stock.some((s) => s.level === 'out');
        // What the counter still owes this patient, so the portal shows the same
        // answer the patient's tracker and the doctor's board are showing.
        obj.dispenseState = dispenseStateOf(obj.prescription);
        obj.pendingMedicines = pendingOf(obj.prescription);
        return obj;
      })
    );

    res.json(enriched);
  } catch (err: any) {
    logger.error('Error fetching pharmacy prescriptions', { err: err });
    res.status(500).json({ message: 'Server error' });
  }
});

// GET the counter's live numbers for its dashboard header.
router.get('/stats', authenticateToken, ensurePharmacy, async (req, res) => {
  try {
    const hospital = req.user.hospital || 'general-hospital';
    const start = startOfToday().getTime();
    const doctors = await Doctor.find({ hospital });
    const docIds = doctors.map((d) => String(d._id));

    const all = await Token.find({ hospital });
    const withRx = (all || []).filter((t) => {
      const did = t.doctor && (t.doctor._id || t.doctor);
      return docIds.includes(String(did)) && t.prescription && (t.prescription.medicines || []).length > 0;
    });

    const alerts = await stockAlerts(hospital);

    res.json({
      // Counted the same way the list is ordered: outstanding means anything
      // still owed, not merely "the button has never been pressed".
      pending: withRx.filter((t) => pendingOf(t.prescription).length > 0).length,
      partlyDispensed: withRx.filter((t) => dispenseStateOf(t.prescription) === 'partial').length,
      dispensedToday: withRx.filter(
        (t) =>
          t.prescription.dispensed &&
          t.prescription.dispensedAt &&
          new Date(t.prescription.dispensedAt).getTime() >= start
      ).length,
      totalPrescriptions: withRx.length,
      inventoryCount: alerts.total,
      outOfStock: alerts.out.length,
      lowStock: alerts.low.length,
      expiringSoon: alerts.expiring.length
    });
  } catch (err: any) {
    logger.error('Error building pharmacy stats', { err: err });
    res.status(500).json({ message: 'Server error' });
  }
});

// ---------------------------------------------------------------------------
// Inventory — the facility's medicine stock.
// ---------------------------------------------------------------------------

// GET the full stock list (optionally filtered by ?q= or ?alertsOnly=true).
router.get('/inventory', authenticateToken, ensurePharmacy, async (req, res) => {
  try {
    const hospital = req.user.hospital || 'general-hospital';
    const { q, alertsOnly } = req.query;

    let rows = await Medicine.find({ hospital });
    if (q && typeof q === 'string') {
      const needle = q.toLowerCase();
      rows = rows.filter(
        (m) =>
          (m.name || '').toLowerCase().includes(needle) ||
          (m.genericName || '').toLowerCase().includes(needle)
      );
    }

    const decorated = rows.map((m) => {
      const obj = m.toObject ? m.toObject() : { ...m };
      obj.level = levelOf(m);
      obj.expiry = expiryFlag(m);
      return obj;
    });

    const filtered =
      alertsOnly === 'true' ? decorated.filter((m) => m.level !== 'in-stock' || m.expiry) : decorated;

    // Problems first, then alphabetical — the order a storekeeper works in.
    const rank = { out: 0, low: 1, untracked: 2, 'in-stock': 3 };
    filtered.sort((a, b) => rank[a.level] - rank[b.level] || a.name.localeCompare(b.name));

    res.json(filtered);
  } catch (err: any) {
    logger.error('Error fetching inventory', { err: err });
    res.status(500).json({ message: 'Server error' });
  }
});

// GET just the things that need attention (used for the alert badge).
router.get('/inventory/alerts', authenticateToken, ensurePharmacy, async (req, res) => {
  try {
    const hospital = req.user.hospital || 'general-hospital';
    res.json(await stockAlerts(hospital));
  } catch (err: any) {
    logger.error('Error fetching stock alerts', { err: err });
    res.status(500).json({ message: 'Server error' });
  }
});

// POST add a new medicine, or top up an existing one by name (idempotent by
// design — a storekeeper re-entering the same name means "more of this arrived",
// not "create a duplicate row").
router.post('/inventory', authenticateToken, ensurePharmacy, async (req, res) => {
  try {
    const hospital = req.user.hospital || 'general-hospital';
    const { name, genericName, form, strength, stockQty, unit, reorderLevel, pricePerUnit, expiryDate } =
      req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0 || name.length > 120) {
      return res.status(400).json({ message: 'Medicine name is required (up to 120 characters)' });
    }
    const qty = Number(stockQty);
    if (stockQty !== undefined && (isNaN(qty) || qty < 0 || qty > 1000000)) {
      return res.status(400).json({ message: 'stockQty must be a number between 0 and 1,000,000' });
    }
    const reorder = Number(reorderLevel);
    if (reorderLevel !== undefined && (isNaN(reorder) || reorder < 0 || reorder > 100000)) {
      return res.status(400).json({ message: 'reorderLevel must be a number between 0 and 100,000' });
    }

    const existing = (await Medicine.find({ hospital })).find(
      (m) => (m.name || '').toLowerCase() === name.trim().toLowerCase()
    );

    let med;
    if (existing) {
      existing.stockQty = (existing.stockQty || 0) + (isNaN(qty) ? 0 : qty);
      if (genericName) existing.genericName = genericName;
      if (form) existing.form = form;
      if (strength) existing.strength = strength;
      if (unit) existing.unit = unit;
      if (!isNaN(reorder)) existing.reorderLevel = reorder;
      if (pricePerUnit !== undefined && !isNaN(Number(pricePerUnit)))
        existing.pricePerUnit = Number(pricePerUnit);
      if (expiryDate) existing.expiryDate = new Date(expiryDate);
      existing.lastRestockedAt = new Date();
      existing.updatedBy = req.user.username || 'Pharmacy';
      med = await existing.save();
    } else {
      med = await new Medicine({
        hospital,
        name: name.trim(),
        genericName,
        form,
        strength,
        stockQty: isNaN(qty) ? 0 : qty,
        unit: unit || 'strip',
        reorderLevel: isNaN(reorder) ? 10 : reorder,
        pricePerUnit: Number(pricePerUnit) || 0,
        expiryDate: expiryDate ? new Date(expiryDate) : undefined,
        lastRestockedAt: new Date(),
        updatedBy: req.user.username || 'Pharmacy'
      }).save();
    }

    const io = req.io;
    toFacility(io, hospital, 'inventory-updated', {
      medicineId: String(med._id),
      name: med.name,
      stockQty: med.stockQty
    });
    await logActivity(io, {
      hospital,
      type: 'stock-updated',
      role: 'pharmacy',
      actor: req.user.username || 'Pharmacy',
      message: existing
        ? `Restocked ${med.name} — now ${med.stockQty} ${med.unit}.`
        : `Added ${med.name} to inventory (${med.stockQty} ${med.unit}).`,
      refId: med._id,
      severity: 'success'
    });

    res.status(existing ? 200 : 201).json({
      message: existing ? `Restocked ${med.name}.` : `${med.name} added to inventory.`,
      medicine: med
    });
  } catch (err: any) {
    logger.error('Error saving medicine', { err: err });
    res.status(500).json({ message: 'Server error' });
  }
});

// PATCH set an exact stock count (physical stock-take correction).
router.patch('/inventory/:id', authenticateToken, ensurePharmacy, async (req, res) => {
  try {
    const hospital = req.user.hospital || 'general-hospital';
    const med = await Medicine.findById(req.params.id);
    if (!med) return res.status(404).json({ message: 'Medicine not found' });
    if (med.hospital !== hospital) {
      return res.status(403).json({ message: 'This medicine belongs to another facility' });
    }

    const { stockQty, reorderLevel, pricePerUnit, expiryDate } = req.body;
    if (stockQty !== undefined) {
      const qty = Number(stockQty);
      if (isNaN(qty) || qty < 0 || qty > 1000000) {
        return res.status(400).json({ message: 'stockQty must be a number between 0 and 1,000,000' });
      }
      med.stockQty = qty;
      med.lastRestockedAt = new Date();
    }
    if (reorderLevel !== undefined && !isNaN(Number(reorderLevel))) med.reorderLevel = Number(reorderLevel);
    if (pricePerUnit !== undefined && !isNaN(Number(pricePerUnit))) med.pricePerUnit = Number(pricePerUnit);
    if (expiryDate) med.expiryDate = new Date(expiryDate);
    med.updatedBy = req.user.username || 'Pharmacy';
    await med.save();

    const io = req.io;
    toFacility(io, hospital, 'inventory-updated', {
      medicineId: String(med._id),
      name: med.name,
      stockQty: med.stockQty
    });
    await logActivity(io, {
      hospital,
      type: 'stock-updated',
      role: 'pharmacy',
      actor: req.user.username || 'Pharmacy',
      message: `Stock corrected: ${med.name} set to ${med.stockQty} ${med.unit}.`,
      refId: med._id
    });

    res.json({ message: `${med.name} updated.`, medicine: med });
  } catch (err: any) {
    logger.error('Error updating medicine', { err: err });
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE remove a medicine from the catalogue.
router.delete('/inventory/:id', authenticateToken, ensurePharmacy, async (req, res) => {
  try {
    const hospital = req.user.hospital || 'general-hospital';
    const med = await Medicine.findById(req.params.id);
    if (!med) return res.status(404).json({ message: 'Medicine not found' });
    if (med.hospital !== hospital) {
      return res.status(403).json({ message: 'This medicine belongs to another facility' });
    }

    await Medicine.findByIdAndDelete(med._id);
    toFacility(req.io, hospital, 'inventory-updated', { removed: String(med._id) });
    res.json({ message: `${med.name} removed from inventory.` });
  } catch (err: any) {
    logger.error('Error deleting medicine', { err: err });
    res.status(500).json({ message: 'Server error' });
  }
});

// POST mark a token's prescription as dispensed (medicines handed to the patient).
// Now also: decrements stock, records anything that could not be given, moves the
// patient's journey to Dispensed, and tells the doctor + reception live.
router.post('/prescriptions/:tokenId/dispense', authenticateToken, ensurePharmacy, async (req, res) => {
  try {
    const { tokenId } = req.params;
    const hospital = req.user.hospital || 'general-hospital';

    // Load WITHOUT populate so token.doctor / token.patient stay ObjectIds — saving
    // a populated document would persist the nested objects and break later
    // `{ doctor: { $in: docIds } }` lookups. Fetch the related docs separately.
    const token = await Token.findById(tokenId);
    if (!token) {
      return res.status(404).json({ message: 'Token not found' });
    }

    // TENANT ISOLATION: the token's doctor must belong to this pharmacist's facility.
    const doctor = token.doctor ? await Doctor.findById(token.doctor) : null;
    if (!doctor || doctor.hospital !== hospital) {
      return res.status(403).json({ message: 'This prescription belongs to another facility.' });
    }

    if (!token.prescription || !token.prescription.medicines || token.prescription.medicines.length === 0) {
      return res.status(400).json({ message: 'This token has no prescription to dispense.' });
    }

    // Only a COMPLETE handover closes this prescription. A counter that could
    // supply two of three items has not finished with the patient, and the
    // patient must be able to come back for the third once it is in stock —
    // which the old "already dispensed" refusal made impossible.
    const owedBefore = pendingOf(token.prescription);
    if (owedBefore.length === 0) {
      return res.status(400).json({ message: 'This prescription has already been dispensed in full.' });
    }

    const io = req.io;
    const by = req.user.username || 'Pharmacy';

    // Try only what is still owed. Re-running this must not deduct stock a
    // second time for medicines the patient already walked away with.
    const owedKeys = new Set(owedBefore.map(medicineKey));
    const toDispense = (token.prescription.medicines || []).filter((m: any) =>
      owedKeys.has(medicineKey(m && m.name))
    );

    // Take the medicines out of stock. Shortages are reported, never blocking:
    // a store may hold items off-system, and the patient is standing there.
    const { deducted, shortages } = await consumeStock(io, {
      hospital,
      medicines: toDispense,
      by,
      tokenNumber: token.tokenNumber
    });

    // What the patient is walking away with, and what they are still owed.
    const stillOwed = shortages.map((s: any) => String(s.requested));
    const stillOwedKeys = new Set(stillOwed.map(medicineKey));
    const handedOverNow = toDispense
      .map((m: any) => String(m && m.name))
      .filter((n: string) => n && !stillOwedKeys.has(medicineKey(n)));

    token.prescription.pendingMedicines = stillOwed;
    token.prescription.dispensed = stillOwed.length === 0;
    token.prescription.dispensedAt = new Date();
    token.prescription.dispensedBy = by;
    token.prescription.partialNote =
      stillOwed.length > 0 ? `Not handed over (unavailable): ${listNames(stillOwed)}` : '';
    if (token.markModified) token.markModified('prescription');

    // Journey: medicines collected. If tests are still outstanding the derived
    // stage keeps the patient in "Lab Pending" rather than falsely finishing them.
    setStage(token, deriveStage(token) === 'Completed' ? 'Dispensed' : deriveStage(token), by);
    await token.save();

    // Notify the patient that their medicines are ready
    const patient = token.patient ? await Patient.findById(token.patient) : null;
    if (patient && patient.phone) {
      try {
        const { sendWhatsAppNotification } = require('../utils/whatsappHelper');
        // Three different things can have happened at that counter, and they
        // now read as three different messages. The old text asserted the
        // handover in its first sentence and contradicted it in the second.
        const { facilityFrom } = require('../utils/messageMeter');
        await sendWhatsAppNotification(
          patient.phone,
          dispenseMessage(patient.name, token.tokenNumber, handedOverNow, stillOwed),
          [],
          null,
          null,
          { hospital: facilityFrom(token, patient, req.user), kind: 'prescription' }
        );
      } catch (waErr) {
        logger.error('Pharmacy WhatsApp notify failed', { err: waErr });
      }
    }

    // Live: the doctor sees their patient actually got the medicines, and a
    // shortage reaches them immediately so they can prescribe an alternative.
    // Every screen is told the same thing: what was handed over, what is still
    // owed, and whether this patient is finished at the counter. They used to
    // receive only `shortages` and infer the rest, which is how the doctor's
    // board could show a patient as done while they were still owed medicines.
    const dispenseState = dispenseStateOf(token.prescription);
    const outcome = {
      tokenId: String(token._id),
      tokenNumber: token.tokenNumber,
      state: dispenseState,
      handedOver: handedOverNow,
      pending: stillOwed,
      shortages
    };

    toDoctor(io, String(doctor._id), 'rx-dispensed', outcome);
    toRole(io, 'pharmacy', hospital, 'pharmacy-updated', outcome);
    toRole(io, 'staff', hospital, 'pharmacy-updated', outcome);

    await announceJourney(io, {
      hospital,
      token,
      stage: token.journeyStage,
      role: 'pharmacy',
      actor: by,
      type: 'rx-dispensed',
      message:
        stillOwed.length === 0
          ? `Medicines dispensed for ${token.tokenNumber}${deducted.length ? ` (${deducted.length} item(s) stock-adjusted)` : ''}.`
          : handedOverNow.length === 0
            ? `NOTHING handed over for ${token.tokenNumber} — ${listNames(stillOwed)} out of stock. The patient is still owed their course.`
            : `Partly dispensed for ${token.tokenNumber} — still owed: ${listNames(stillOwed)}.`,
      severity: stillOwed.length > 0 ? 'warning' : 'success'
    });

    // Re-fetch populated for the client response (this copy is NOT saved).
    const updated = await Token.findById(tokenId).populate('patient').populate('doctor', '-passwordHash');
    res.json({
      message:
        stillOwed.length === 0
          ? `Medicines for token ${token.tokenNumber} handed over in full.`
          : handedOverNow.length === 0
            ? `Nothing could be handed over for ${token.tokenNumber}. Still owed: ${listNames(stillOwed)}.`
            : `Partly handed over for ${token.tokenNumber}. Still owed: ${listNames(stillOwed)}.`,
      state: dispenseState,
      handedOver: handedOverNow,
      pending: stillOwed,
      token: updated,
      deducted,
      shortages
    });
  } catch (err: any) {
    logger.error('Error dispensing prescription', { err: err });
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
module.exports = router;
