const mongoose = require('mongoose');
const { tenantGuardPlugin } = require('../utils/tenantGuard');

// A Pharmacist operates a facility's internal "Medical" store / pharmacy —
// the counterpart to LabAssistant for the internal lab. Scoped per facility
// tenant exactly like every other staff account.
const PharmacistSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    username: { type: String, required: true, index: true },
    passwordHash: { type: String, required: true },
    counterNumber: { type: String, default: 'Pharmacy Counter' },
    hospital: { type: String, default: 'general-hospital' }
  },
  { timestamps: true }
);

// Compound index to ensure unique username per hospital tenant
PharmacistSchema.index({ username: 1, hospital: 1 }, { unique: true });

// Tenant-owned. An unscoped query on this collection would read or modify every
// facility's rows at once, silently. See utils/tenantGuard.js.
PharmacistSchema.plugin(tenantGuardPlugin, { modelName: 'Pharmacist' });

module.exports = mongoose.model('Pharmacist', PharmacistSchema);
