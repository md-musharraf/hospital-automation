const mongoose = require('mongoose');
const { tenantGuardPlugin } = require('../utils/tenantGuard');

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
    hospital: { type: String, default: 'general-hospital' },

    // ---- Public profile ----------------------------------------------------
    // What a patient reads on the facility's landing page to decide WHO to book
    // with. A list of bare names tells someone choosing between four doctors
    // nothing; qualification, experience and the days a doctor actually sits are
    // what turn a directory into a decision. All optional — the landing page
    // renders whatever is filled in and quietly omits the rest, so no existing
    // doctor record has to be back-filled.
    photoUrl: { type: String, default: '' },
    qualification: { type: String, default: '' }, // e.g. "MBBS, MD (Medicine)"
    experienceYears: { type: Number, default: 0 },
    // Medical council registration. Real clinics display this, and patients in
    // India increasingly check it — showing it is a trust signal, not clutter.
    registrationNumber: { type: String, default: '' },
    languages: [{ type: String }],
    opdDays: [{ type: String }], // e.g. ['Mon', 'Tue', 'Thu']
    opdHours: { type: String, default: '' }, // e.g. "10:00 AM – 1:00 PM"
    consultationFee: { type: Number, default: 0 }, // 0 = "ask at reception"
    about: { type: String, default: '' }
  },
  { timestamps: true }
);

// Compound index to ensure unique email per hospital tenant
DoctorSchema.index({ email: 1, hospital: 1 }, { unique: true });

// Tenant-owned. An unscoped query on this collection would read or modify every
// facility's rows at once, silently. See utils/tenantGuard.js.
DoctorSchema.plugin(tenantGuardPlugin, { modelName: 'Doctor' });

module.exports = mongoose.model('Doctor', DoctorSchema);
