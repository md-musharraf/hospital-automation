const mongoose = require('mongoose');

const LabAssistantSchema = new mongoose.Schema({
  name: { type: String, required: true },
  username: { type: String, required: true, index: true },
  passwordHash: { type: String, required: true },
  hospital: { type: String, default: 'general-hospital' }
}, { timestamps: true });

// Compound index to ensure unique username per hospital tenant
LabAssistantSchema.index({ username: 1, hospital: 1 }, { unique: true });

module.exports = mongoose.model('LabAssistant', LabAssistantSchema);
