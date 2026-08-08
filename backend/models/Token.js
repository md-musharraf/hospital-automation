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
  // Vulnerable-group priority (govt-mandated): these patients are placed ahead of
  // Regular tokens but never ahead of a true Emergency. Auto-detected (Senior from
  // age, Pregnant from symptoms) or set by reception.
  priorityCategory: {
    type: String,
    enum: ['None', 'Senior', 'Pregnant', 'Disabled'],
    default: 'None'
  },
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
  symptoms: { type: String, required: true },
  chatHistory: [{
    sender: { type: String, enum: ['user', 'bot'] },
    message: { type: String },
    timestamp: { type: Date, default: Date.now }
  }],
  // Where this patient is in the hospital RIGHT NOW. This is the spine that lets
  // reception, the doctor, the lab and the pharmacy see one shared patient
  // journey instead of each role guessing from its own silo.
  journeyStage: {
    type: String,
    enum: [
      'Waiting',          // in the doctor's queue
      'In Consultation',  // inside the cabin
      'Lab Pending',      // doctor ordered tests, waiting on the lab
      'Lab Complete',     // results in — patient goes BACK to the doctor
      'Pharmacy Pending', // prescription written, medicines not handed over yet
      'Dispensed',        // medicines collected
      'Completed',        // done, nothing outstanding
      'Absent'
    ],
    default: 'Waiting',
    index: true
  },
  // Append-only trail of stage changes — powers the patient's progress tracker
  // and lets staff see exactly where time is being lost.
  stageHistory: [{
    stage: { type: String },
    at: { type: Date, default: Date.now },
    by: { type: String }
  }],
  labTests: [{
    testName: { type: String, required: true },
    // Collected = sample taken, work in progress. Without it the doctor cannot
    // tell "the lab hasn't started" from "the lab is running it right now".
    status: { type: String, enum: ['Pending', 'Collected', 'Completed'], default: 'Pending' },
    urgency: { type: String, enum: ['Routine', 'Urgent'], default: 'Routine' },
    // Structured result instead of one free-text blob, so an out-of-range value
    // can be flagged automatically and shown in red to the doctor.
    resultValue: { type: String },
    unit: { type: String },
    normalRange: { type: String },
    abnormal: { type: Boolean, default: false },
    remarks: { type: String },
    requestedBy: { type: String },
    collectedAt: { type: Date },
    completedBy: { type: String },
    completedAt: { type: Date }
  }],
  prescription: {
    medicines: [{
      name: { type: String },
      dosage: { type: String },
      duration: { type: String },
      instructions: { type: String }
    }],
    advice: { type: String },
    // Set by the facility's pharmacy/medical store when the medicines are handed over
    dispensed: { type: Boolean, default: false },
    dispensedAt: { type: Date },
    dispensedBy: { type: String },
    // Anything the pharmacy could not give (out of stock) — recorded so the
    // doctor and reception can see the patient left without part of their course.
    partialNote: { type: String }
  },
  estimatedWaitTime: { type: Number, default: 0 }, // in minutes
  // Set true once the "your turn is near, please reach the hospital" WhatsApp has
  // been sent, so a patient is pinged exactly once as they approach the front of
  // the queue (lets them wait at home instead of crowding the OPD hall).
  arrivalAlerted: { type: Boolean, default: false },
  // How many times a no-show has been auto-recalled (given a second chance in the
  // queue instead of being sent back to reception). Capped so it can't loop forever.
  recallCount: { type: Number, default: 0 },
  calledAt: { type: Date },
  completedAt: { type: Date }
}, { timestamps: true });

// Compound index for unique tokenNumber per hospital tenant
TokenSchema.index({ tokenNumber: 1, hospital: 1 }, { unique: true });

module.exports = mongoose.model('Token', TokenSchema);
