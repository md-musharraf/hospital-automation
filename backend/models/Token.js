const mongoose = require('mongoose');

const TokenSchema = new mongoose.Schema({
  tokenNumber: { type: String, required: true, unique: true, index: true }, // e.g., "T-102"
  status: { 
    type: String, 
    enum: ['Waiting', 'Called', 'Active', 'Completed', 'Absent', 'Delayed'], 
    default: 'Waiting',
    index: true 
  },
  tokenType: { 
    type: String, 
    enum: ['Regular', 'Re-visit', 'Emergency'], 
    default: 'Regular' 
  },
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
  symptoms: { type: String, required: true },
  chatHistory: [{
    sender: { type: String, enum: ['user', 'bot'] },
    message: { type: String },
    timestamp: { type: Date, default: Date.now }
  }],
  estimatedWaitTime: { type: Number, default: 0 }, // in minutes
  calledAt: { type: Date },
  completedAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('Token', TokenSchema);
