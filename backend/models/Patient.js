const mongoose = require('mongoose');

const PatientSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  age: { type: Number, required: true },
  gender: { type: String, enum: ['Male', 'Female', 'Other'], required: true },
  phone: { type: String, required: true, unique: true, index: true },
  visitCount: { type: Number, default: 1 },
}, { timestamps: true });

module.exports = mongoose.model('Patient', PatientSchema);
