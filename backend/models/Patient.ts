import mongoose, { Schema, Document, Model } from 'mongoose';
import { normalizePhone } from '@careeai/shared';
import { tenantGuardPlugin } from '../utils/tenantGuard';

const PatientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    age: { type: Number, required: true },
    gender: { type: String, enum: ['Male', 'Female', 'Other'], required: true },
    // Canonicalized at the schema: `+91XXXXXXXXXX`, always.
    //
    // The `{phone, hospital}` unique index below cannot do its job on values
    // that are formatted differently. A patient who booked on WhatsApp was
    // stored as `+919876543210` (the chat engine canonicalized) and the same
    // patient registered at reception as `98765 43210` (reception did not) —
    // two records, one person, and a visit history split down the middle.
    //
    // This setter is the reason `phoneVariants()` can eventually go away: it
    // exists to find records written before there was one storage form.
    phone: {
      type: String,
      required: true,
      index: true,
      trim: true,
      set: (v: any) => normalizePhone(v)
    },
    hospital: { type: String, required: true, default: 'general-hospital', index: true },
    // How long this patient says they need to REACH the facility, in minutes.
    //
    // Asked once, at their first booking, and reused forever after — a bot that
    // re-asks five questions every visit is a bot nobody finishes. It is the
    // patient's own estimate rather than anything derived from a distance,
    // because distance does not decide travel time here: 20 km on a bike is half
    // an hour, the same 20 km by bus and on foot is ninety minutes, and no
    // address the system could store tells the two apart.
    //
    // `null` means NOBODY HAS SAID — never guessed, and it turns the departure
    // alert off for that patient rather than inventing a time to leave home.
    travelMinutes: { type: Number, default: null },
    visitCount: { type: Number, default: 1 }
  },
  { timestamps: true }
);

// Compound index for unique phone number per hospital tenant
PatientSchema.index({ phone: 1, hospital: 1 }, { unique: true });

// Same trap as Token: the unique index leads with `phone`, so listing a
// facility's patients could not use it and scanned every patient on the
// platform. This one leads with the tenant.
PatientSchema.index({ hospital: 1, createdAt: -1 });

// Tenant-owned. An unscoped query on this collection would read or modify every
// facility's rows at once, silently. See utils/tenantGuard.js.
PatientSchema.plugin(tenantGuardPlugin, { modelName: 'Patient' });

const Patient: Model<any> =
  (mongoose.models && mongoose.models.Patient) || mongoose.model<any>('Patient', PatientSchema);
export default Patient;
module.exports = Patient;
