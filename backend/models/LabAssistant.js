const mongoose = require('mongoose');
const { tenantGuardPlugin } = require('../utils/tenantGuard');

const LabAssistantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    username: { type: String, required: true, index: true },
    passwordHash: { type: String, required: true },
    hospital: { type: String, default: 'general-hospital' }
  },
  { timestamps: true }
);

// Compound index to ensure unique username per hospital tenant
LabAssistantSchema.index({ username: 1, hospital: 1 }, { unique: true });

// Tenant-owned. An unscoped query on this collection would read or modify every
// facility's rows at once, silently. See utils/tenantGuard.js.
LabAssistantSchema.plugin(tenantGuardPlugin, { modelName: 'LabAssistant' });

module.exports = mongoose.model('LabAssistant', LabAssistantSchema);
