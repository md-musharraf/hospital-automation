const mongoose = require('mongoose');

const StaffSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  username: { type: String, required: true, unique: true, index: true },
  passwordHash: { type: String, required: true },
  counterNumber: { type: String, required: true }, // e.g., "Counter 1"
  hospital: { type: String, default: 'general-hospital' }
}, { timestamps: true });

module.exports = mongoose.model('Staff', StaffSchema);
