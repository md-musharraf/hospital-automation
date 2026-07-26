const mongoose = require('mongoose');

// A chronic patient's request to repeat their previous medicines WITHOUT taking an
// OPD slot. The patient raises it over chat/WhatsApp; the doctor approves or rejects
// in one tap; on approval the medicines flow straight to the pharmacy for pickup.
// This is the big doctor-load reducer for BP/sugar/thyroid follow-ups.
const RefillRequestSchema = new mongoose.Schema({
  hospital: { type: String, required: true, index: true },
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
  // The original completed token whose prescription is being repeated.
  sourceToken: { type: mongoose.Schema.Types.ObjectId, ref: 'Token' },
  // Snapshot of the medicines at request time (so later edits to the source token
  // don't change what was requested).
  medicines: [{
    name: { type: String },
    dosage: { type: String },
    duration: { type: String },
    instructions: { type: String }
  }],
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Pending',
    index: true
  },
  note: { type: String },
  decidedAt: { type: Date },
  // The new prescription token created when a refill is approved (for pharmacy pickup).
  fulfilledToken: { type: mongoose.Schema.Types.ObjectId, ref: 'Token' }
}, { timestamps: true });

module.exports = mongoose.model('RefillRequest', RefillRequestSchema);
