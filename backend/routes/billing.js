const express = require('express');
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
const logger = require('../utils/logger');

// Helper: Recalculate subtotal, totalAmount, balanceDue
function recalculateInvoice(invoice) {
  invoice.subtotal = (invoice.items || []).reduce((acc, item) => acc + (item.totalPrice || 0), 0);
  const disc = invoice.discount || 0;
  const taxVal = invoice.tax || 0;
  invoice.totalAmount = Math.max(0, invoice.subtotal - disc + taxVal);
  invoice.balanceDue = Math.max(0, invoice.totalAmount - (invoice.amountPaid || 0));
  return invoice;
}

// Helper: Generate Unique Invoice Number
async function generateInvoiceNumber(hospital) {
  const count = await Invoice.countDocuments({ hospital });
  return `INV-${1000 + count + 1}`;
}

// GET all invoices for staff member's hospital tenant
router.get('/invoices', authenticateToken, async (req, res) => {
  try {
    const hospital = req.user.hospital || 'general-hospital';
    const { status, patientId, tokenId } = req.query;

    const query = { hospital };
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
      // Auto-initialize invoice for token if it doesn't exist yet
      const invoiceNumber = await generateInvoiceNumber(hospital);
      const defaultItems = [
        {
          category: 'Consultation',
          itemName: `OPD Doctor Consultation Fee (${token.doctor ? token.doctor.name : 'General'})`,
          quantity: 1,
          unitPrice: 300,
          totalPrice: 300,
          addedBy: 'System Auto-billing'
        }
      ];

      invoice = new Invoice({
        invoiceNumber,
        hospital,
        patient: token.patient._id,
        token: token._id,
        status: 'Pending',
        items: defaultItems
      });

      recalculateInvoice(invoice);
      await invoice.save();
      invoice = await Invoice.findById(invoice._id).populate('patient').populate('token');
    }

    res.json(invoice);
  } catch (error) {
    logger.error('Error fetching/creating invoice by token', { err: error });
    res.status(500).json({ message: 'Server error' });
  }
});

// POST create new patient invoice
router.post('/invoices', authenticateToken, ensureStaff, async (req, res) => {
  try {
    const { patientId, tokenId, items, discount, notes } = req.body;
    const hospital = req.user.hospital || 'general-hospital';

    const patient = await Patient.findById(patientId);
    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    const invoiceNumber = await generateInvoiceNumber(hospital);
    const invoice = new Invoice({
      invoiceNumber,
      hospital,
      patient: patient._id,
      token: tokenId || null,
      items: items || [],
      discount: discount || 0,
      notes: notes || ''
    });

    recalculateInvoice(invoice);
    await invoice.save();

    const populated = await Invoice.findById(invoice._id).populate('patient').populate('token');

    if (req.io) {
      req.io.to(`hospital:${hospital}`).emit('billing-updated', { invoiceId: invoice._id });
    }

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
    const { category, itemName, quantity, unitPrice } = req.body;
    const hospital = req.user.hospital || 'general-hospital';

    if (!itemName || unitPrice === undefined || isNaN(parseFloat(unitPrice))) {
      return res.status(400).json({ message: 'Valid itemName and unitPrice are required' });
    }

    const invoice = await Invoice.findById(id);
    if (!invoice || invoice.hospital !== hospital) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    if (invoice.status === 'Discharged') {
      return res.status(400).json({ message: 'Cannot modify a discharged invoice' });
    }

    const qty = Math.max(1, parseInt(quantity) || 1);
    const price = Math.max(0, parseFloat(unitPrice));
    const totalPrice = qty * price;

    invoice.items.push({
      category: category || 'Other',
      itemName: itemName.trim(),
      quantity: qty,
      unitPrice: price,
      totalPrice,
      addedBy: req.user.username || 'Staff',
      addedAt: new Date()
    });

    recalculateInvoice(invoice);
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
    recalculateInvoice(invoice);
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

    let addedCount = 0;

    // 1. Sync Prescribed Medicines
    if (token.prescription && Array.isArray(token.prescription.medicines)) {
      for (const med of token.prescription.medicines) {
        if (!med.name) continue;
        const exists = invoice.items.some(
          (i) => i.category === 'Medicine' && i.itemName.toLowerCase() === med.name.toLowerCase()
        );
        if (!exists) {
          // Price lookup from inventory stock or default ₹50
          const stockMed = await Medicine.findOne({ hospital, name: new RegExp(med.name, 'i') });
          const unitPrice = stockMed && stockMed.unitPrice ? stockMed.unitPrice : 50;

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
          const unitPrice = lab.urgency === 'Urgent' ? 500 : 350;
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

    recalculateInvoice(invoice);
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

// POST Discharge Patient & Finalize Bill (Collect Payment)
router.post('/invoices/:id/discharge', authenticateToken, ensureStaff, async (req, res) => {
  try {
    const { id } = req.params;
    const { amountPaid, paymentMethod, discount, notes } = req.body;
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

    recalculateInvoice(invoice);

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

    // Send WhatsApp Discharge Invoice Receipt to Patient
    if (invoice.patient && invoice.patient.phone) {
      const receiptMsg =
        `🏥 DISCHARGE INVOICE SUMMARY — ${invoice.hospital.toUpperCase()}\n` +
        `Patient: ${invoice.patient.name}\n` +
        `Invoice #: ${invoice.invoiceNumber}\n` +
        `Total Amount: ₹${invoice.totalAmount}\n` +
        `Amount Paid: ₹${invoice.amountPaid} (${invoice.paymentMethod})\n` +
        `Balance Due: ₹${invoice.balanceDue}\n\n` +
        `Thank you for choosing CareeAi Health. Get well soon! 🙏`;
      try {
        await sendWhatsAppNotification(invoice.patient.phone, receiptMsg);
      } catch (waErr) {
        logger.error('Discharge WhatsApp alert error', { err: waErr });
      }
    }

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
      invoice
    });
  } catch (error) {
    logger.error('Error discharging patient and finalizing bill', { err: error });
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
