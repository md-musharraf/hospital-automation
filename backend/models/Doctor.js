const mongoose = require('mongoose');

const DoctorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, index: true },
    passwordHash: { type: String, required: true },
    department: { type: String, required: true },
    specialization: { type: String },
    // What KIND of doctor this is at the facility — a visiting consultant who sits
    // two days a week is a different thing from the resident who covers the ward,
    // and reception needs to see which is which when routing a patient. Set when
    // the admin onboards the facility; editable from the admin panel afterwards.
    doctorType: {
      type: String,
      enum: ['Consultant', 'Visiting', 'Resident', 'Surgeon', 'Emergency Officer', 'General Physician'],
      default: 'Consultant'
    },
    availabilityStatus: {
      type: String,
      enum: ['Available', 'In Surgery', 'On Break', 'Unavailable'],
      default: 'Available'
    },
    averageCheckupTime: { type: Number, default: 10 }, // in minutes
    // Max regular OPD tokens this doctor will see per day. 0 = unlimited (default,
    // keeps existing facilities unchanged). Emergencies always bypass this cap.
    dailyTokenLimit: { type: Number, default: 0 },
    currentRoom: { type: String, required: true }, // e.g., "Cabin A"
    hospital: { type: String, default: 'general-hospital' }
  },
  { timestamps: true }
);

// Compound index to ensure unique email per hospital tenant
DoctorSchema.index({ email: 1, hospital: 1 }, { unique: true });

module.exports = mongoose.model('Doctor', DoctorSchema);
