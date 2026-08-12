const mongoose = require('mongoose');
const { randomUUID } = require('crypto');
const { tenantGuardPlugin } = require('../utils/tenantGuard');

/**
 * Per-facility billing environment.
 *
 * Every hospital on the platform charges different money for the same thing — a
 * dressing is ₹150 at one clinic and ₹40 at a village setup, and a district
 * hospital may not charge consultation at all. Those numbers used to be constants
 * inside routes/billing.js and inside the reception UI's quick-add buttons, which
 * meant onboarding a second hospital required editing code.
 *
 * One document per `hospital` holds that facility's rate card: the default fees
 * the auto-billing paths use, the tax it collects, the letterhead its printed
 * invoice carries, and a catalogue of named services reception can add with one
 * click. Nothing here is shared between tenants.
 */

const ServiceSchema = new mongoose.Schema({
  // A plain string id, not an ObjectId: the reception UI addresses a service by
  // id when charging it, and the offline/mock database used for local runs and
  // tests cannot mint ObjectIds for sub-documents.
  _id: { type: String, default: () => randomUUID() },
  category: {
    type: String,
    enum: [
      'Medicine',
      'Lab Test',
      'Consultation',
      'Nursing / Bandage',
      'Room / Bed',
      'Equipment / Consumable',
      'Other'
    ],
    default: 'Other'
  },
  name: { type: String, required: true, trim: true },
  price: { type: Number, required: true, min: 0 },
  active: { type: Boolean, default: true }
});

const BillingConfigSchema = new mongoose.Schema(
  {
    hospital: { type: String, required: true, unique: true, index: true },

    // Letterhead — what the patient sees on the printed/PDF bill.
    displayName: { type: String, default: '' },
    address: { type: String, default: '' },
    phone: { type: String, default: '' },
    gstin: { type: String, default: '' },
    footerNote: { type: String, default: 'Thank you for choosing us. Get well soon!' },

    currencySymbol: { type: String, default: '₹' },
    invoicePrefix: { type: String, default: 'INV' },

    // Applied on (subtotal − discount) when the bill is recalculated. 0 = no tax,
    // which is the common case for clinical charges in India.
    taxPercent: { type: Number, default: 0, min: 0, max: 100 },

    // Rates the automatic paths fall back to when nothing more specific is known.
    consultationFee: { type: Number, default: 300, min: 0 },
    labTestPrice: { type: Number, default: 350, min: 0 },
    urgentLabTestPrice: { type: Number, default: 500, min: 0 },
    defaultMedicinePrice: { type: Number, default: 50, min: 0 },
    registrationFee: { type: Number, default: 0, min: 0 },

    services: [ServiceSchema],

    updatedBy: { type: String, default: '' }
  },
  { timestamps: true }
);

// Tenant-owned. An unscoped query on this collection would read or modify every
// facility's rows at once, silently. See utils/tenantGuard.js.
BillingConfigSchema.plugin(tenantGuardPlugin, { modelName: 'BillingConfig' });

module.exports = mongoose.model('BillingConfig', BillingConfigSchema);
