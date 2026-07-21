const mongoose = require('mongoose');

const PatientSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  age: { type: Number, required: true },
  gender: { type: String, enum: ['Male', 'Female', 'Other'], required: true },
  phone: { type: String, required: true, index: true },
  hospital: { type: String, required: true, default: 'general-hospital', index: true },
  visitCount: { type: Number, default: 1 },
}, { timestamps: true });

// Compound index for unique phone number per hospital tenant
PatientSchema.index({ phone: 1, hospital: 1 }, { unique: true });

module.exports = mongoose.model('Patient', PatientSchema);
