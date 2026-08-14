import mongoose, { Schema, Document, Model } from 'mongoose';
import { tenantGuardPlugin } from '../utils/tenantGuard';

// The facility's medical-store stock.
//
// This is what closes the biggest gap between the doctor and the pharmacy: until
// now a doctor could prescribe a medicine the store ran out of days ago, and
// nobody found out until the patient was standing at the counter. With stock
// here, the doctor sees availability WHILE prescribing, dispensing decrements the
// count, and the store gets a low-stock warning before it hits zero.
const MedicineSchema = new mongoose.Schema(
  {
    hospital: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    genericName: { type: String, trim: true },
    form: {
      type: String,
      enum: ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Ointment', 'Drops', 'Other'],
      default: 'Tablet'
    },
    strength: { type: String }, // "500 mg"
    stockQty: { type: Number, default: 0, min: 0 },
    unit: { type: String, default: 'strip' }, // strip / bottle / vial
    // Warn at this level so the store can reorder BEFORE running out.
    reorderLevel: { type: Number, default: 10, min: 0 },
    pricePerUnit: { type: Number, default: 0, min: 0 },
    expiryDate: { type: Date },
    lastRestockedAt: { type: Date },
    updatedBy: { type: String }
  },
  { timestamps: true }
);

// One entry per medicine per facility (tenant-scoped, like every other model here).
MedicineSchema.index({ hospital: 1, name: 1 }, { unique: true });

// Tenant-owned. An unscoped query on this collection would read or modify every
// facility's rows at once, silently. See utils/tenantGuard.js.
MedicineSchema.plugin(tenantGuardPlugin, { modelName: 'Medicine' });

const Medicine: Model<any> =
  (mongoose.models && mongoose.models.Medicine) || mongoose.model<any>('Medicine', MedicineSchema);
export default Medicine;
module.exports = Medicine;
