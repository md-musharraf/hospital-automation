const mongoose = require('mongoose');

const ChatSessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true, index: true }, // e.g. Socket ID or phone number
  currentState: { 
    type: String, 
    enum: ['LANGUAGE', 'WELCOME', 'AWAITING_PHONE', 'AWAITING_NAME', 'AWAITING_AGE', 'AWAITING_GENDER', 'AWAITING_SYMPTOMS', 'COMPLETED'], 
    default: 'LANGUAGE' 
  },
  tempData: {
    phone: { type: String },
    name: { type: String },
    age: { type: Number },
    gender: { type: String },
    symptoms: { type: String },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
    hospitalId: { type: String }
  },
  lastActivity: { type: Date, default: Date.now, expires: 3600 } // TTL index: auto-expires after 1 hour of inactivity
}, { timestamps: true });

module.exports = mongoose.model('ChatSession', ChatSessionSchema);
