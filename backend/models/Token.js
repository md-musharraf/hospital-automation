const mongoose = require('mongoose');

const TokenSchema = new mongoose.Schema({
  tokenNumber: { type: String, required: true, index: true }, // e.g., "T-102"
  hospital: { type: String, required: true, default: 'general-hospital', index: true },
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
  labTests: [{
    testName: { type: String, required: true },
    status: { type: String, enum: ['Pending', 'Completed'], default: 'Pending' },
    remarks: { type: String },
    completedAt: { type: Date }
  }],
  prescription: {
    medicines: [{
      name: { type: String },
      dosage: { type: String },
      duration: { type: String },
      instructions: { type: String }
    }],
    advice: { type: String }
  },
  estimatedWaitTime: { type: Number, default: 0 }, // in minutes
  calledAt: { type: Date },
  completedAt: { type: Date }
}, { timestamps: true });

// Compound index for unique tokenNumber per hospital tenant
TokenSchema.index({ tokenNumber: 1, hospital: 1 }, { unique: true });

module.exports = mongoose.model('Token', TokenSchema);
