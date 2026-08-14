import mongoose, { Schema, Document, Model } from 'mongoose';
import { normalizeEmail } from '@careeai/shared';
import { tenantGuardPlugin } from '../utils/tenantGuard';

const LabAssistantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    hospital: { type: String, default: 'general-hospital' },

    // This person's own sign-in, if they have one — see models/Staff.js.
    email: {
      type: String,
      index: true,
      trim: true,
      lowercase: true,
      set: (v: any) => normalizeEmail(v)
    },
    passwordHash: { type: String, select: false },

    // Retired credential field — see models/Staff.js for why it stays.
    username: { type: String, index: true }
  },
  { timestamps: true }
);

LabAssistantSchema.index({ username: 1, hospital: 1 }, { unique: true, sparse: true });
LabAssistantSchema.index({ email: 1, hospital: 1 }, { unique: true, sparse: true });

// Tenant-owned. An unscoped query on this collection would read or modify every
// facility's rows at once, silently. See utils/tenantGuard.js.
LabAssistantSchema.plugin(tenantGuardPlugin, { modelName: 'LabAssistant' });

const LabAssistant: Model<any> =
  (mongoose.models && mongoose.models.LabAssistant) ||
  mongoose.model<any>('LabAssistant', LabAssistantSchema);
export default LabAssistant;
module.exports = LabAssistant;
