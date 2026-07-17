const mongoose = require('mongoose');

const ArchivedTokenSchema = new mongoose.Schema({
  tokenNumber: { type: String, required: true },
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
}, { timestamps: true });

module.exports = mongoose.model('ArchivedToken', ArchivedTokenSchema);
