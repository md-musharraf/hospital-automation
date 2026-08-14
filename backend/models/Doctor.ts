import mongoose, { Schema, Document, Model } from 'mongoose';
import { normalizeEmail } from '@careeai/shared';
import { tenantGuardPlugin } from '../utils/tenantGuard';

const DoctorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // Lower-cased at the schema, not at each call site.
    //
    // The `{email, hospital}` unique index below is case-SENSITIVE, so before
    // this a doctor onboarded as `Rao@clinic.in` and re-added as
    // `rao@clinic.in` cleared every duplicate check we had — the Set in
    // register-hospital, the `findOne`, and the index itself — and the facility
    // ended up with two records for one person, each with its own queue.
    //
    // `set` runs on every write path including `doc.email = x; doc.save()`,
    // which is the shape the admin panel's edit route uses. `lowercase: true`
    // alone would not survive a value that fails validation, so the setter
    // returns the normalized address or null and `required` refuses the rest.
    email: {
      type: String,
      required: true,
      index: true,
      trim: true,
      lowercase: true,
      set: (v: any) => normalizeEmail(v)
    },
    // No password. A doctor is not an account — the facility signs in once and
    // picks which cabin it is running (see utils/facilityAuth.js). The email is
    // kept because it is this doctor's unique handle within the tenant and is
    // where their own copies of reports go.
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

const Doctor: Model<any> =
  (mongoose.models && mongoose.models.Doctor) || mongoose.model<any>('Doctor', DoctorSchema);
export default Doctor;
module.exports = Doctor;
