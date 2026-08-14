import mongoose, { Schema, Document, Model } from 'mongoose';
import { normalizeEmail } from '@careeai/shared';
import { tenantGuardPlugin } from '../utils/tenantGuard';

const StaffSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    counterNumber: { type: String, required: true }, // e.g., "Counter 1"
    hospital: { type: String, default: 'general-hospital' },

    // This person's own sign-in, if they have one.
    //
    // Optional by design: the facility credential still opens reception, so a
    // clinic that wants one password on the front desk is unaffected. A row with
    // an email and a hash can additionally be signed into as itself, which is
    // what puts a name against each action in the activity log instead of
    // "the facility".
    //
    // Normalized at the schema for the same reason Doctor.email is: the unique
    // index is case-sensitive, so `A@x.com` and `a@x.com` would otherwise be two
    // people, and the duplicate checks that compare raw strings would miss it.
    email: {
      type: String,
      index: true,
      trim: true,
      lowercase: true,
      set: (v: any) => normalizeEmail(v)
    },
    // Never selected by default — a read that forgets to exclude it cannot leak
    // it. The login path asks for it explicitly with `.select('+passwordHash')`.
    passwordHash: { type: String, select: false },

    // Retired. Reception used to sign in with a username; that endpoint is gone.
    // The path stays because dropping it would make Mongoose discard the stored
    // value on the next save of a pre-migration row. Nothing authenticates
    // against it — `email` above is what a person signs in with now.
    username: { type: String, index: true }
  },
  { timestamps: true }
);

// Historic uniqueness on the retired username. Sparse, because rows created
// since single sign-in have no username at all and a plain unique index would
// let exactly one of them exist per facility.
StaffSchema.index({ username: 1, hospital: 1 }, { unique: true, sparse: true });

// One address identifies one person inside one facility. Sparse for the same
// reason: most rows have no email, and they must not collide with each other.
StaffSchema.index({ email: 1, hospital: 1 }, { unique: true, sparse: true });

// Tenant-owned. An unscoped query on this collection would read or modify every
// facility's rows at once, silently. See utils/tenantGuard.js.
StaffSchema.plugin(tenantGuardPlugin, { modelName: 'Staff' });

const Staff: Model<any> =
  (mongoose.models && mongoose.models.Staff) || mongoose.model<any>('Staff', StaffSchema);
export default Staff;
module.exports = Staff;
