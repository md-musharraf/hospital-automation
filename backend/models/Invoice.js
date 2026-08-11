const mongoose = require('mongoose');

const InvoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, index: true },
    hospital: { type: String, required: true, default: 'general-hospital', index: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
    token: { type: mongoose.Schema.Types.ObjectId, ref: 'Token' },
    status: {
      type: String,
      enum: ['Pending', 'Paid', 'Discharged', 'Cancelled'],
      default: 'Pending',
      index: true
    },
    items: [
      {
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
        itemName: { type: String, required: true },
        quantity: { type: Number, default: 1, min: 1 },
        unitPrice: { type: Number, required: true, min: 0 },
        totalPrice: { type: Number, required: true, min: 0 },
        addedBy: { type: String, default: 'Staff' },
        addedAt: { type: Date, default: Date.now }
      }
    ],
    subtotal: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    amountPaid: { type: Number, default: 0 },
    balanceDue: { type: Number, default: 0 },
    paymentMethod: {
      type: String,
      enum: ['Unpaid', 'Cash', 'UPI', 'Card', 'Net Banking', 'Insurance'],
      default: 'Unpaid'
    },
    dischargedAt: { type: Date },
    dischargedBy: { type: String },
    notes: { type: String }
  },
  { timestamps: true }
);

// Billing is read per facility and almost always newest-first — the counter's
// list, the daily totals, the discharge screen. Without this the reception
// billing tab scanned every invoice on the platform.
InvoiceSchema.index({ hospital: 1, createdAt: -1 });
InvoiceSchema.index({ hospital: 1, status: 1 });

module.exports = mongoose.model('Invoice', InvoiceSchema);
