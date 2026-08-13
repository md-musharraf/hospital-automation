const mongoose = require('mongoose');
const { tenantGuardPlugin } = require('../utils/tenantGuard');

const LabAssistantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    hospital: { type: String, default: 'general-hospital' },

    // Retired credential fields — see models/Staff.js for why they stay.
    username: { type: String, index: true },
    passwordHash: { type: String }
  },
  { timestamps: true }
);

LabAssistantSchema.index({ username: 1, hospital: 1 }, { unique: true, sparse: true });

// Tenant-owned. An unscoped query on this collection would read or modify every
// facility's rows at once, silently. See utils/tenantGuard.js.
LabAssistantSchema.plugin(tenantGuardPlugin, { modelName: 'LabAssistant' });

module.exports = mongoose.model('LabAssistant', LabAssistantSchema);
