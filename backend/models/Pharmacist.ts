import mongoose, { Schema, Document, Model } from 'mongoose';
import { tenantGuardPlugin } from '../utils/tenantGuard';

// A Pharmacist operates a facility's internal "Medical" store / pharmacy —
// the counterpart to LabAssistant for the internal lab. Scoped per facility
// tenant exactly like every other staff account.
const PharmacistSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    counterNumber: { type: String, default: 'Pharmacy Counter' },
    hospital: { type: String, default: 'general-hospital' },

    // Retired credential fields — see models/Staff.js for why they stay.
    username: { type: String, index: true },
    passwordHash: { type: String }
  },
  { timestamps: true }
);

PharmacistSchema.index({ username: 1, hospital: 1 }, { unique: true, sparse: true });

// Tenant-owned. An unscoped query on this collection would read or modify every
// facility's rows at once, silently. See utils/tenantGuard.js.
PharmacistSchema.plugin(tenantGuardPlugin, { modelName: 'Pharmacist' });

const Pharmacist: Model<any> =
  (mongoose.models && mongoose.models.Pharmacist) || mongoose.model<any>('Pharmacist', PharmacistSchema);
export default Pharmacist;
module.exports = Pharmacist;
