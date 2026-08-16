const express = require('express');
const { randomUUID } = require('crypto');
const router = express.Router();
const Invoice = require('../models/Invoice');
const Patient = require('../models/Patient');
const Token = require('../models/Token');
const Doctor = require('../models/Doctor');
const Medicine = require('../models/Medicine');
const { authenticateToken, ensureRole } = require('../middleware/auth');
const ensureStaff = ensureRole('staff');
const { logActivity, announceJourney } = require('../utils/realtime');
const { sendWhatsAppNotification } = require('../utils/whatsappHelper');
const { getBillingConfig, priceOf, recalculateInvoice } = require('../utils/billingConfig');
const { findPatientByPhone } = require('../utils/patientLookup');
const { setStage, deriveStage } = require('../utils/journeyHelper');
const logger = require('../utils/logger');

// Helper: Generate Unique Invoice Number, prefixed per facility so two hospitals
// on the platform never hand a patient the same-looking invoice number.
async function generateInvoiceNumber(hospital, config) {
  const count = await Invoice.countDocuments({ hospital });
  const prefix = (config && config.invoicePrefix) || 'INV';
  return `${prefix}-${1000 + count + 1}`;
}

/**
 * WhatsApp a discharged patient their itemised bill, exactly once.
 *
 * Idempotent by design. Three different paths want to send this — the discharge
 * itself, the PDF being attached a second later, and reception's fallback — and
 * which one gets there first depends on whether cloud storage is configured. The
 * `receiptSentAt` stamp is what turns "whoever is ready" into one message.
 *
 * The stamp is only written on a delivery that succeeded. `sendWhatsAppNotification`
 * RESOLVES on a Meta rejection rather than throwing, so recording an optimistic
 * success would mark the patient as told and permanently block the retry.
 *
 * @param options.onlyWithPdf  Skip unless a bill PDF is attached. Used by the
 *   discharge route, which runs before the browser has uploaded one.
 * @param options.force        Send even if already sent (reception's "resend").
 */
interface ReceiptOptions {
  /** Skip unless a bill PDF is attached. */
  onlyWithPdf?: boolean;
  /** Send even if the patient was already sent this receipt. */
  force?: boolean;
}

interface ReceiptResult {
  sent: boolean;
  reason?: string;
  error?: string;
  withPdf?: boolean;
}

async function sendDischargeReceipt(
  invoice: any,
  config: any,
  options: ReceiptOptions = {}
): Promise<ReceiptResult> {
  const { onlyWithPdf = false, force = false } = options;

  if (!invoice || !invoice.patient || !invoice.patient.phone) {
    return { sent: false, reason: 'no_phone' };
  }
  if (invoice.receiptSentAt && !force) {
    return { sent: false, reason: 'already_sent' };
  }

  // Only a real link. `pdfUrl` is written by the client after a cloud upload, so
  // it is either an https URL or absent — but a stored data URI would be the
  // whole PDF, and putting that in a message body sends hundreds of kilobytes
  // of base64 to a patient's phone.
  const pdfLink = /^https?:\/\/\S+$/i.test(String(invoice.pdfUrl || '').trim())
    ? String(invoice.pdfUrl).trim()
    : '';

  if (onlyWithPdf && !pdfLink) {
    return { sent: false, reason: 'awaiting_pdf' };
  }

  // The receipt carries the facility's own letterhead, currency and closing
  // note — a patient of Sunrise Clinic should never receive a message branded
  // as some other hospital on the platform.
  const cur = (config && config.currencySymbol) || '₹';
  const facilityName = String((config && config.displayName) || invoice.hospital).toUpperCase();
  const itemLines = (invoice.items || [])
    .map((item) => `• ${item.itemName} x${item.quantity} — ${cur}${item.totalPrice}`)
    .join('\n');

  const message =
    `🏥 DISCHARGE INVOICE SUMMARY — ${facilityName}\n` +
    `Patient: ${invoice.patient.name}\n` +
    `Invoice #: ${invoice.invoiceNumber}\n\n` +
    `${itemLines}\n\n` +
    `Subtotal: ${cur}${invoice.subtotal}\n` +
    (invoice.discount > 0 ? `Discount: -${cur}${invoice.discount}\n` : '') +
    (invoice.tax > 0 ? `Tax (${(config && config.taxPercent) || 0}%): ${cur}${invoice.tax}\n` : '') +
    `Total Amount: ${cur}${invoice.totalAmount}\n` +
    `Amount Paid: ${cur}${invoice.amountPaid} (${invoice.paymentMethod})\n` +
    `Balance Due: ${cur}${invoice.balanceDue}\n` +
    (pdfLink ? `\n📄 Download Official PDF Bill:\n${pdfLink}\n` : '') +
    `\n${(config && config.footerNote) || 'Thank you. Get well soon!'} 🙏`;

  try {
    const result = await sendWhatsAppNotification(invoice.patient.phone, message);
    if (!result || result.status !== 'sent') {
      logger.error('Discharge receipt was not accepted for delivery', {
        invoice: invoice.invoiceNumber,
        status: result && result.status,
        error: result && result.error
      });
      return { sent: false, reason: 'delivery_failed', error: result && result.error };
    }

    invoice.receiptSentAt = new Date();
    await invoice.save();
    return { sent: true, withPdf: Boolean(pdfLink) };
  } catch (err) {
    logger.error('Discharge receipt WhatsApp error', { err, invoice: invoice.invoiceNumber });
    return { sent: false, reason: 'delivery_failed', error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Facility rate card ("this hospital's billing environment")
// ---------------------------------------------------------------------------

// GET this facility's rate card — seeded with starter prices on first call
router.get('/config', authenticateToken, async (req, res) => {
  try {
    const hospital = req.user.hospital || 'general-hospital';
    const config = await getBillingConfig(hospital);
    res.json(config);
  } catch (error) {
    logger.error('Error loading billing config', { err: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT update this facility's rates, tax and invoice letterhead
router.put('/config', authenticateToken, ensureStaff, async (req, res) => {
  try {
    const hospital = req.user.hospital || 'general-hospital';
    const config = await getBillingConfig(hospital);

    const numericFields = [
      'taxPercent',
      'consultationFee',
      'labTestPrice',
      'urgentLabTestPrice',
      'defaultMedicinePrice',
      'registrationFee'
    ];
    for (const field of numericFields) {
      if (req.body[field] !== undefined && !isNaN(parseFloat(req.body[field]))) {
        config[field] = Math.max(0, parseFloat(req.body[field]));
      }
    }
    if (config.taxPercent > 100) config.taxPercent = 100;

    const textFields = [
      'displayName',
      'address',
      'phone',
      'gstin',
      'footerNote',
      'currencySymbol',
      'invoicePrefix'
    ];
    for (const field of textFields) {
      if (typeof req.body[field] === 'string') {
        config[field] = req.body[field].trim();
      }
    }

    config.updatedBy = req.user.username || 'Reception';
    await config.save();

    if (req.io) {
      req.io.to(`hospital:${hospital}`).emit('billing-config-updated', { hospital });
    }

    res.json({ message: 'Billing rate card updated', config });
  } catch (error) {
    logger.error('Error updating billing config', { err: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// POST add a chargeable service to this facility's catalogue
router.post('/config/services', authenticateToken, ensureStaff, async (req, res) => {
  try {
    const hospital = req.user.hospital || 'general-hospital';
    const { category, name, price } = req.body;

    if (!name || String(name).trim().length < 2) {
      return res.status(400).json({ message: 'Service name is required (min 2 characters)' });
    }
    if (price === undefined || isNaN(parseFloat(price)) || parseFloat(price) < 0) {
      return res.status(400).json({ message: 'A valid price is required' });
    }

    const config = await getBillingConfig(hospital);
    const cleanName = String(name).trim();

    const duplicate = (config.services || []).find(
      (service) => String(service.name).toLowerCase() === cleanName.toLowerCase()
    );
    if (duplicate) {
      return res.status(400).json({ message: 'This facility already charges for a service with that name' });
    }

    config.services.push({
      _id: randomUUID(),
      category: category || 'Other',
      name: cleanName,
      price: parseFloat(price),
      active: true
    });
    config.updatedBy = req.user.username || 'Reception';
    await config.save();

    if (req.io) {
      req.io.to(`hospital:${hospital}`).emit('billing-config-updated', { hospital });
    }

    res.status(201).json({ message: `${cleanName} added to the rate card`, config });
  } catch (error) {
    logger.error('Error adding billing service', { err: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT edit one catalogue service (price change / rename / disable)
router.put('/config/services/:serviceId', authenticateToken, ensureStaff, async (req, res) => {
  try {
    const hospital = req.user.hospital || 'general-hospital';
    const { serviceId } = req.params;
    const { name, category, price, active } = req.body;

    const config = await getBillingConfig(hospital);
    const service = (config.services || []).find((entry) => String(entry._id) === String(serviceId));
    if (!service) {
      return res.status(404).json({ message: 'Service not found on this facility rate card' });
    }

    if (typeof name === 'string' && name.trim().length >= 2) service.name = name.trim();
    if (category) service.category = category;
    if (price !== undefined && !isNaN(parseFloat(price))) service.price = Math.max(0, parseFloat(price));
    if (active !== undefined) service.active = Boolean(active);

    config.updatedBy = req.user.username || 'Reception';
    config.markModified('services');
    await config.save();

    if (req.io) {
      req.io.to(`hospital:${hospital}`).emit('billing-config-updated', { hospital });
    }

    res.json({ message: 'Rate updated', config });
  } catch (error) {
    logger.error('Error updating billing service', { err: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE remove a service from this facility's catalogue
router.delete('/config/services/:serviceId', authenticateToken, ensureStaff, async (req, res) => {
  try {
    const hospital = req.user.hospital || 'general-hospital';
    const { serviceId } = req.params;

    const config = await getBillingConfig(hospital);
    config.services = (config.services || []).filter((service) => String(service._id) !== String(serviceId));
    config.updatedBy = req.user.username || 'Reception';
    config.markModified('services');
    await config.save();

    if (req.io) {
      req.io.to(`hospital:${hospital}`).emit('billing-config-updated', { hospital });
    }

    res.json({ message: 'Service removed from rate card', config });
  } catch (error) {
    logger.error('Error deleting billing service', { err: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// GET all invoices for staff member's hospital tenant
router.get('/invoices', authenticateToken, async (req, res) => {
  try {
    const hospital = req.user.hospital || 'general-hospital';
    const { status, patientId, tokenId } = req.query;

    const query: any = { hospital };
    if (status) query.status = status;
    if (patientId) query.patient = patientId;
    if (tokenId) query.token = tokenId;

    const invoices = await Invoice.find(query).populate('patient').populate('token').sort({ updatedAt: -1 });

    res.json(invoices);
  } catch (error) {
    logger.error('Error fetching invoices', { err: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// GET or auto-initialize invoice for a specific token / patient
router.get('/token/:tokenId', authenticateToken, async (req, res) => {
  try {
    const { tokenId } = req.params;
    const hospital = req.user.hospital || 'general-hospital';

    const token = await Token.findById(tokenId).populate('patient').populate('doctor');
    if (!token) {
      return res.status(404).json({ message: 'Token not found' });
    }

    let invoice = await Invoice.findOne({ token: tokenId, hospital }).populate('patient').populate('token');

    if (!invoice) {
      // Auto-initialize invoice for token if it doesn't exist yet, at THIS
      // facility's rates — a hospital that charges nothing for consultation
      // (fee set to 0) simply starts the patient on an empty bill.
      const config = await getBillingConfig(hospital);
      const invoiceNumber = await generateInvoiceNumber(hospital, config);
      const defaultItems = [];

      if (config.consultationFee > 0) {
        defaultItems.push({
          category: 'Consultation',
          itemName: `OPD Doctor Consultation Fee (${token.doctor ? token.doctor.name : 'General'})`,
          quantity: 1,
          unitPrice: config.consultationFee,
          totalPrice: config.consultationFee,
          addedBy: 'System Auto-billing'
        });
      }
      if (config.registrationFee > 0) {
        defaultItems.push({
          category: 'Other',
          itemName: 'Registration / File Charge',
          quantity: 1,
          unitPrice: config.registrationFee,
          totalPrice: config.registrationFee,
          addedBy: 'System Auto-billing'
        });
      }

      invoice = new Invoice({
        invoiceNumber,
        hospital,
        patient: token.patient._id,
        token: token._id,
        status: 'Pending',
        items: defaultItems
      });

      recalculateInvoice(invoice, config);
      await invoice.save();
      invoice = await Invoice.findById(invoice._id).populate('patient').populate('token');
    }

    res.json(invoice);
  } catch (error) {
    logger.error('Error fetching/creating invoice by token', { err: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// POST open a bill for ANY patient — one already on file, or a walk-in who has
// never been registered (dressing, injection, a test only: no doctor, no token).
router.post('/invoices', authenticateToken, ensureStaff, async (req, res) => {
  try {
    const { patientId, tokenId, items, discount, notes, newPatient, addConsultationFee } = req.body;
    const hospital = req.user.hospital || 'general-hospital';

    let patient = null;

    if (patientId) {
      patient = await Patient.findById(patientId);
      if (!patient || patient.hospital !== hospital) {
        return res.status(404).json({ message: 'Patient not found at this facility' });
      }
    } else if (newPatient && newPatient.name && newPatient.phone) {
      // Register the walk-in on the spot. If reception typed a phone number that
      // already exists here, bill that existing record rather than failing on the
      // per-facility unique phone index.
      //
      // `.trim()` alone was not enough: it matched "+919876543210" only if
      // reception typed it that way, so the same patient got a second record
      // and a second billing history under a differently-spaced number.
      const existing = await findPatientByPhone(hospital, newPatient.phone);
      if (existing) {
        patient = existing;
      } else {
        const parsedAge = parseInt(newPatient.age);
        if (isNaN(parsedAge) || parsedAge < 1 || parsedAge > 130) {
          return res.status(400).json({ message: 'Age must be a number between 1 and 130' });
        }
        if (!['Male', 'Female', 'Other'].includes(newPatient.gender)) {
          return res.status(400).json({ message: 'Gender must be Male, Female, or Other' });
        }
        patient = new Patient({
          name: String(newPatient.name).trim(),
          phone: String(newPatient.phone).trim(),
          age: parsedAge,
          gender: newPatient.gender,
          hospital
        });
        await patient.save();
      }
    } else {
      return res.status(400).json({ message: 'Select an existing patient or provide new patient details' });
    }

    const config = await getBillingConfig(hospital);
    const invoiceNumber = await generateInvoiceNumber(hospital, config);

    const lineItems = Array.isArray(items) ? [...items] : [];
    if (addConsultationFee && config.consultationFee > 0) {
      lineItems.unshift({
        category: 'Consultation',
        itemName: 'Doctor Consultation Fee',
        quantity: 1,
        unitPrice: config.consultationFee,
        totalPrice: config.consultationFee,
        addedBy: req.user.username || 'Reception'
      });
    }

    const invoice = new Invoice({
      invoiceNumber,
      hospital,
      patient: patient._id,
      token: tokenId || null,
      items: lineItems,
      discount: discount || 0,
      notes: notes || ''
    });

    recalculateInvoice(invoice, config);
    await invoice.save();

    const populated = await Invoice.findById(invoice._id).populate('patient').populate('token');

    if (req.io) {
      req.io.to(`hospital:${hospital}`).emit('billing-updated', { invoiceId: invoice._id });
    }

    await logActivity(req.io, {
      hospital,
      type: 'billing-opened',
      role: 'staff',
      actor: req.user.username || 'Reception',
      message: `Opened bill ${invoiceNumber} for ${patient.name}.`,
      severity: 'info'
    });

    res.status(201).json({ message: 'Invoice generated successfully', invoice: populated });
  } catch (error) {
    logger.error('Error creating invoice', { err: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// POST add line item to invoice (daily dawa, test, bandage, room charges, custom)
router.post('/invoices/:id/items', authenticateToken, ensureStaff, async (req, res) => {
  try {
    const { id } = req.params;
    const { serviceId, quantity } = req.body;
    const hospital = req.user.hospital || 'general-hospital';

    const invoice = await Invoice.findById(id);
    if (!invoice || invoice.hospital !== hospital) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    if (invoice.status === 'Discharged') {
      return res.status(400).json({ message: 'Cannot modify a discharged invoice' });
    }

    const config = await getBillingConfig(hospital);

    // Two ways to charge: pick a service off this facility's rate card (the
    // price is then resolved here, so the counter can never bill a stale
    // number), or type a one-off charge that has no catalogue entry.
    let category = req.body.category;
    let itemName = req.body.itemName;
    let unitPrice = req.body.unitPrice;

    if (serviceId) {
      const service = (config.services || []).find((entry) => String(entry._id) === String(serviceId));
      if (!service) {
        return res.status(404).json({ message: 'Service not found on this facility rate card' });
      }
      category = service.category;
      itemName = service.name;
      unitPrice = service.price;
    }

    if (!itemName || unitPrice === undefined || isNaN(parseFloat(unitPrice))) {
      return res.status(400).json({ message: 'Valid itemName and unitPrice are required' });
    }

    const qty = Math.max(1, parseInt(quantity) || 1);
    const price = Math.max(0, parseFloat(unitPrice));
    const totalPrice = qty * price;

    invoice.items.push({
      category: category || 'Other',
      itemName: String(itemName).trim(),
      quantity: qty,
      unitPrice: price,
      totalPrice,
      addedBy: req.user.username || 'Staff',
      addedAt: new Date()
    });

    recalculateInvoice(invoice, config);
    await invoice.save();

    const updated = await Invoice.findById(id).populate('patient').populate('token');

    // Real-time broadcast
    if (req.io) {
      req.io.to(`hospital:${hospital}`).emit('billing-updated', {
        invoiceId: id,
        patientId: invoice.patient,
        tokenId: invoice.token
      });
      if (invoice.token) {
        req.io.to(`patient:${invoice.token}`).emit('billing-updated', { invoiceId: id });
      }
    }

    await logActivity(req.io, {
      hospital,
      type: 'billing-item-added',
      role: 'staff',
      actor: req.user.username || 'Billing Staff',
      message: `Added ₹${totalPrice} (${category}: ${itemName}) to ${updated.patient ? updated.patient.name : 'Patient'}'s bill.`,
      severity: 'info'
    });

    res.json({ message: 'Line item added successfully', invoice: updated });
  } catch (error) {
    logger.error('Error adding invoice item', { err: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE remove line item from invoice
router.delete('/invoices/:id/items/:itemId', authenticateToken, ensureStaff, async (req, res) => {
  try {
    const { id, itemId } = req.params;
    const hospital = req.user.hospital || 'general-hospital';

    const invoice = await Invoice.findById(id);
    if (!invoice || invoice.hospital !== hospital) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    if (invoice.status === 'Discharged') {
      return res.status(400).json({ message: 'Cannot modify a discharged invoice' });
    }

    invoice.items = invoice.items.filter((item) => String(item._id) !== String(itemId));
    recalculateInvoice(invoice, await getBillingConfig(hospital));
    await invoice.save();

    const updated = await Invoice.findById(id).populate('patient').populate('token');

    if (req.io) {
      req.io.to(`hospital:${hospital}`).emit('billing-updated', { invoiceId: id });
      if (invoice.token) {
        req.io.to(`patient:${invoice.token}`).emit('billing-updated', { invoiceId: id });
      }
    }

    res.json({ message: 'Item removed from invoice', invoice: updated });
  } catch (error) {
    logger.error('Error deleting invoice item', { err: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// POST 1-click auto-pull Doctor Prescriptions & Lab Tests into bill
router.post('/invoices/:id/sync-prescriptions', authenticateToken, ensureStaff, async (req, res) => {
  try {
    const { id } = req.params;
    const hospital = req.user.hospital || 'general-hospital';

    const invoice = await Invoice.findById(id);
    if (!invoice || invoice.hospital !== hospital) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    if (!invoice.token) {
      return res.status(400).json({ message: 'Invoice is not linked to an active token' });
    }

    const token = await Token.findById(invoice.token);
    if (!token) {
      return res.status(404).json({ message: 'Linked token not found' });
    }

    const config = await getBillingConfig(hospital);
    let addedCount = 0;

    // 1. Sync Prescribed Medicines
    if (token.prescription && Array.isArray(token.prescription.medicines)) {
      for (const med of token.prescription.medicines) {
        if (!med.name) continue;
        const exists = invoice.items.some(
          (i) => i.category === 'Medicine' && i.itemName.toLowerCase() === med.name.toLowerCase()
        );
        if (!exists) {
          // Price authority, in order: this facility's pharmacy stock → its rate
          // card → its configured default medicine price.
          const stockMed = await Medicine.findOne({ hospital, name: new RegExp(med.name, 'i') });
          const unitPrice =
            stockMed && stockMed.unitPrice
              ? stockMed.unitPrice
              : priceOf(config, 'Medicine', med.name, config.defaultMedicinePrice);

          invoice.items.push({
            category: 'Medicine',
            itemName: `Rx: ${med.name} (${med.dosage || 'Standard'}, ${med.duration || '5 days'})`,
            quantity: 1,
            unitPrice,
            totalPrice: unitPrice,
            addedBy: 'Doctor Rx Auto-sync',
            addedAt: new Date()
          });
          addedCount++;
        }
      }
    }

    // 2. Sync Lab Tests
    if (Array.isArray(token.labTests)) {
      for (const lab of token.labTests) {
        if (!lab.testName) continue;
        const exists = invoice.items.some(
          (i) => i.category === 'Lab Test' && i.itemName.toLowerCase().includes(lab.testName.toLowerCase())
        );
        if (!exists) {
          // A named test on the rate card wins; otherwise the facility's flat
          // routine/urgent test price.
          const fallback = lab.urgency === 'Urgent' ? config.urgentLabTestPrice : config.labTestPrice;
          const unitPrice = priceOf(config, 'Lab Test', lab.testName, fallback);
          invoice.items.push({
            category: 'Lab Test',
            itemName: `Lab: ${lab.testName} (${lab.urgency || 'Routine'})`,
            quantity: 1,
            unitPrice,
            totalPrice: unitPrice,
            addedBy: 'Lab Request Auto-sync',
            addedAt: new Date()
          });
          addedCount++;
        }
      }
    }

    recalculateInvoice(invoice, config);
    await invoice.save();

    const updated = await Invoice.findById(id).populate('patient').populate('token');

    if (req.io) {
      req.io.to(`hospital:${hospital}`).emit('billing-updated', { invoiceId: id });
      if (invoice.token) {
        req.io.to(`patient:${invoice.token}`).emit('billing-updated', { invoiceId: id });
      }
    }

    res.json({
      message: `Successfully synced ${addedCount} prescribed item(s) & test(s) into bill.`,
      addedCount,
      invoice: updated
    });
  } catch (error) {
    logger.error('Error auto-syncing prescriptions', { err: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// POST attach or update generated PDF URL for an invoice
router.post('/invoices/:id/pdf', authenticateToken, ensureStaff, async (req, res) => {
  try {
    const { id } = req.params;
    const { pdfUrl, pdfKey } = req.body;
    const hospital = req.user.hospital || 'general-hospital';

    if (!pdfUrl || typeof pdfUrl !== 'string') {
      return res.status(400).json({ message: 'A valid pdfUrl string is required' });
    }

    const invoice = await Invoice.findById(id);
    if (!invoice || invoice.hospital !== hospital) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    invoice.pdfUrl = pdfUrl.trim();
    if (pdfKey) invoice.pdfKey = String(pdfKey).trim();
    await invoice.save();

    const updated = await Invoice.findById(id).populate('patient').populate('token');

    // This is where a discharged patient actually gets their bill.
    //
    // The discharge itself deliberately held the message back, because at that
    // moment there was no PDF to link to — the browser generates it from the
    // discharge response and uploads it, arriving here a second later. Sending
    // from this point is what puts the bill in the patient's hands instead of a
    // summary with nothing attached.
    let receipt: ReceiptResult = { sent: false, reason: 'not_discharged' };
    if (updated && updated.status === 'Discharged') {
      const config = await getBillingConfig(hospital);
      receipt = await sendDischargeReceipt(updated, config);
    }

    if (req.io) {
      req.io.to(`hospital:${hospital}`).emit('billing-updated', { invoiceId: id });
      if (invoice.token) {
        req.io.to(`patient:${invoice.token}`).emit('billing-updated', { invoiceId: id });
      }
    }

    res.json({
      message: receipt.sent
        ? 'Bill PDF stored and sent to the patient on WhatsApp.'
        : 'Invoice PDF attached successfully',
      invoice: updated,
      receiptSent: receipt.sent
    });
  } catch (error) {
    logger.error('Error attaching invoice PDF', { err: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// POST Discharge Patient & Finalize Bill (Collect Payment)
router.post('/invoices/:id/discharge', authenticateToken, ensureStaff, async (req, res) => {
  try {
    const { id } = req.params;
    const { amountPaid, paymentMethod, discount, notes, pdfUrl, pdfKey } = req.body;
    const hospital = req.user.hospital || 'general-hospital';

    const invoice = await Invoice.findById(id).populate('patient').populate('token');
    if (!invoice || invoice.hospital !== hospital) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    if (invoice.status === 'Discharged') {
      return res.status(400).json({ message: 'Patient is already discharged' });
    }

    if (discount !== undefined && !isNaN(parseFloat(discount))) {
      invoice.discount = Math.max(0, parseFloat(discount));
    }
    if (notes) {
      invoice.notes = notes;
    }
    if (pdfUrl && typeof pdfUrl === 'string') {
      invoice.pdfUrl = pdfUrl.trim();
    }
    if (pdfKey && typeof pdfKey === 'string') {
      invoice.pdfKey = pdfKey.trim();
    }

    const config = await getBillingConfig(hospital);
    recalculateInvoice(invoice, config);

    const paid = parseFloat(amountPaid) || invoice.totalAmount;
    invoice.amountPaid = paid;
    invoice.balanceDue = Math.max(0, invoice.totalAmount - paid);
    invoice.paymentMethod = paymentMethod || 'Cash';
    invoice.status = 'Discharged';
    invoice.dischargedAt = new Date();
    invoice.dischargedBy = req.user.username || 'Reception';
    await invoice.save();

    // Mark token status completed / discharged if linked
    if (invoice.token && invoice.token._id) {
      const token = await Token.findById(invoice.token._id);
      if (token) {
        token.status = 'Completed';
        token.completedAt = new Date();
        // The journey stage has to move too, not just the status.
        //
        // These are two different fields and only the second one is what the
        // patient's tracker renders. Setting the status alone left a discharged
        // patient looking at "Reports ready" — the stage their visit happened to
        // reach before billing — with no indication the visit had ended.
        setStage(token, deriveStage(token), req.user.username || 'Reception');
        await token.save();
      }
    }

    // Real-time Socket Event
    if (req.io) {
      req.io.to(`hospital:${hospital}`).emit('billing-updated', { invoiceId: id, discharged: true });
      req.io.to(`hospital:${hospital}`).emit('queue-updated');
      if (invoice.token) {
        req.io.to(`patient:${invoice.token._id}`).emit('token-called', { status: 'Completed' });
        req.io
          .to(`patient:${invoice.token._id}`)
          .emit('billing-updated', { invoiceId: id, discharged: true });
      }
    }

    // The receipt is NOT sent here unless the bill PDF already exists.
    //
    // Sending from this point was the bug: the browser generates the PDF from
    // the discharged invoice this response returns, uploads it, and only then
    // attaches the URL — so `pdfUrl` was always empty at this moment and the
    // patient's one billing message never carried the bill. `sendDischargeReceipt`
    // is idempotent via `receiptSentAt`, so whichever path arrives first (the
    // PDF attach below, the client's fallback, or this call when a URL was
    // supplied in the request body) sends exactly one message.
    const receipt = await sendDischargeReceipt(invoice, config, { onlyWithPdf: true });

    await logActivity(req.io, {
      hospital,
      type: 'patient-discharged',
      role: 'staff',
      actor: req.user.username || 'Reception',
      message: `Patient ${invoice.patient ? invoice.patient.name : ''} discharged. Invoice ${invoice.invoiceNumber} paid (₹${invoice.amountPaid} via ${invoice.paymentMethod}).`,
      severity: 'success'
    });

    res.json({
      message: `Patient ${invoice.patient ? invoice.patient.name : ''} successfully discharged!`,
      invoice,
      // The client attaches the PDF next; if that fails it must call
      // POST /invoices/:id/receipt so the patient still hears from us.
      receiptSent: receipt.sent,
      receiptPending: !receipt.sent
    });
  } catch (error) {
    logger.error('Error discharging patient and finalizing bill', { err: error });
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/v1/billing/invoices/:id/receipt — send the discharge receipt now.
 *
 * Two callers. The reception UI uses it as the fallback when the PDF upload
 * fails, so a patient is never left unmessaged just because cloud storage was
 * misconfigured. A human uses it with `{ resend: true }` when a patient says the
 * message never arrived.
 */
router.post('/invoices/:id/receipt', authenticateToken, ensureStaff, async (req, res) => {
  try {
    const hospital = req.user.hospital || 'general-hospital';
    const invoice = await Invoice.findById(req.params.id).populate('patient').populate('token');
    if (!invoice || invoice.hospital !== hospital) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    if (invoice.status !== 'Discharged') {
      return res.status(400).json({ message: 'This patient has not been discharged yet.' });
    }

    const config = await getBillingConfig(hospital);
    const receipt = await sendDischargeReceipt(invoice, config, {
      force: req.body && req.body.resend === true
    });

    if (!receipt.sent) {
      return res.status(receipt.reason === 'already_sent' ? 200 : 502).json({
        message:
          receipt.reason === 'already_sent'
            ? 'The patient has already been sent this receipt. Use "resend" to send it again.'
            : `WhatsApp did not accept the receipt${receipt.error ? ` — ${receipt.error}` : ''}.`,
        sent: false,
        reason: receipt.reason
      });
    }

    res.json({ message: `Receipt sent to ${invoice.patient?.name || 'the patient'}.`, sent: true });
  } catch (error) {
    logger.error('Error sending discharge receipt', { err: error });
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
module.exports = router;
