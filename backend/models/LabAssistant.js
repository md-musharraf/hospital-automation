const mongoose = require('mongoose');

const LabAssistantSchema = new mongoose.Schema({
  name: { type: String, required: true },
  username: { type: String, required: true, unique: true, index: true },
  passwordHash: { type: String, required: true },
  hospital: { type: String, default: 'general-hospital' }
}, { timestamps: true });

module.exports = mongoose.model('LabAssistant', LabAssistantSchema);
