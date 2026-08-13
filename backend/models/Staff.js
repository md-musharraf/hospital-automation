const mongoose = require('mongoose');
const { tenantGuardPlugin } = require('../utils/tenantGuard');

const StaffSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    counterNumber: { type: String, required: true }, // e.g., "Counter 1"
    hospital: { type: String, default: 'general-hospital' },

    // Kept, unused, and never required. Reception used to be a login account
    // with its own username and password; the facility now signs in once and
    // reception is a tab inside it. Rows written before that change still carry
    // these two fields, and dropping the paths from the schema would make
    // Mongoose discard them on the next save of a record someone is still
    // reading names from. Nothing authenticates against them.
    username: { type: String, index: true },
    passwordHash: { type: String }
  },
  { timestamps: true }
);

// Historic uniqueness on the retired username. Sparse, because rows created
// since single sign-in have no username at all and a plain unique index would
// let exactly one of them exist per facility.
StaffSchema.index({ username: 1, hospital: 1 }, { unique: true, sparse: true });

// Tenant-owned. An unscoped query on this collection would read or modify every
// facility's rows at once, silently. See utils/tenantGuard.js.
StaffSchema.plugin(tenantGuardPlugin, { modelName: 'Staff' });

module.exports = mongoose.model('Staff', StaffSchema);
