const mongoose = require('mongoose');
const { tenantGuardPlugin } = require('../utils/tenantGuard');

const ArchivedTokenSchema = new mongoose.Schema(
  {
    tokenNumber: { type: String, required: true },
    hospital: { type: String, required: true, default: 'general-hospital', index: true },
    status: { type: String, required: true },
    tokenType: { type: String, required: true },
    patientDetails: {
      name: String,
      age: Number,
      gender: String,
      phone: String
    },
    doctorDetails: {
      name: String,
      department: String,
      currentRoom: String
    },
    symptoms: { type: String },
    calledAt: { type: Date },
    completedAt: { type: Date }
  },
  { timestamps: true }
);

// Tenant-owned. An unscoped query on this collection would read or modify every
// facility's rows at once, silently. See utils/tenantGuard.js.
ArchivedTokenSchema.plugin(tenantGuardPlugin, { modelName: 'ArchivedToken' });

module.exports = mongoose.model('ArchivedToken', ArchivedTokenSchema);
