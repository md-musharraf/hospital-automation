const mongoose = require('mongoose');

const PatientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    age: { type: Number, required: true },
    gender: { type: String, enum: ['Male', 'Female', 'Other'], required: true },
    phone: { type: String, required: true, index: true },
    hospital: { type: String, required: true, default: 'general-hospital', index: true },
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

module.exports = mongoose.model('Patient', PatientSchema);
