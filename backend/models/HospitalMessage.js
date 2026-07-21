const mongoose = require('mongoose');

const HospitalMessageSchema = new mongoose.Schema({
  senderRole: {
    type: String,
    enum: ['Staff', 'Doctor', 'Lab'],
    required: true
  },
  senderName: {
    type: String,
    required: true
  },
  receiverRole: {
    type: String,
    enum: ['Staff', 'Doctor', 'Lab'],
    required: true
  },
  receiverId: {
    type: String, // Doctor ID or generic 'Lab'/'Staff'
    default: null
  },
  hospital: {
    type: String,
    required: true,
    default: 'general-hospital',
    index: true
  },
  content: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('HospitalMessage', HospitalMessageSchema);
