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
    // Optional, because a doctor is not REQUIRED to be an account.
    //
    // The facility credential still opens every room and picks a cabin from the
    // roster, so a clinic that wants one password kept on the front desk carries
    // on unchanged. Setting a password here adds a second, narrower way in: the
    // doctor signs in as themselves and the cabin is implied by who they are,
    // instead of being chosen from a list after the fact.
    //
    // Never selected by default — every read of this collection that reaches a
    // client goes through `.select('-passwordHash')`.
    passwordHash: { type: String, select: false },
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
    // The PRINTED sitting hours. Derived from `shifts` whenever those are set,
    // so the public page cannot claim one thing while the queue computes
    // another — which it could when both were typed in by hand.
    opdHours: { type: String, default: '' }, // e.g. "10:00 AM – 1:00 PM"

    // The COMPUTABLE sitting hours.
    //
    // Most doctors here sit twice — morning OPD and evening OPD — with a gap in
    // between. `opdHours` was a sentence, so the queue could not see that gap:
    // an empty queue at 2pm looked like "no wait", and a patient booking then
    // was told to expect a 0-minute wait for a cabin nobody would enter for
    // three hours. Structured start/end times let the estimate begin from when
    // consultation actually resumes. See utils/shiftHelper.js.
    //
    // Empty means unscheduled, which is read as "sits whenever" — so every
    // facility that predates this behaves exactly as it did before.
    shifts: [
      {
        label: { type: String, default: '' }, // "Morning" / "Evening"
        start: { type: String, default: '' }, // "10:00", 24-hour local
        end: { type: String, default: '' }, // "13:00"
        days: [{ type: String }] // [] = follow opdDays
      }
    ],

    // TODAY's revision to a sitting, when the doctor is not going to make it.
    //
    // "Running 30 minutes late" was already expressible as a queue buffer, but a
    // buffer only moves wait estimates — the doctor's printed hours, the landing
    // page and the waiting-room screen all carried on announcing 11:00 while
    // everyone knew it was 11:30. A patient reads the printed time, not the
    // queue arithmetic, so the two have to agree.
    //
    // Scoped to one date on purpose. A late morning is a fact about today, not a
    // change to the doctor's schedule, and an override that outlived the day
    // would quietly rewrite the roster. `date` is a local "YYYY-MM-DD" string
    // rather than a Date so that comparing "is this for today" is a string
    // equality and cannot drift by a timezone. The nightly reset clears anything
    // stale; a missed reset is harmless because a past date never matches.
    shiftOverrides: [
      {
        date: { type: String, default: '' }, // "YYYY-MM-DD", facility local
        shiftIndex: { type: Number, default: 0 }, // which sitting was moved
        start: { type: String, default: '' }, // revised "HH:MM"
        end: { type: String, default: '' }, // revised end, '' = unchanged
        reason: { type: String, default: '' },
        createdAt: { type: Date, default: Date.now }
      }
    ],
    // Days this doctor is not coming in at all.
    //
    // Distinct from all three things that already exist, because each of them
    // answers a different question and none of them answers this one:
    //
    //   - `availabilityStatus: 'Unavailable'` is about THIS MOMENT. It carries
    //     no date, so nothing ever turns it back on — a doctor who flips it
    //     before a week's leave has to remember to flip it back, and until they
    //     do the cabin reads as closed forever.
    //   - `opdDays` is the STANDING roster. Editing it for one week's absence
    //     rewrites the doctor's permanent schedule, and the printed hours on the
    //     public landing page along with it.
    //   - `shiftOverrides` is TODAY's revised timing. It can move a sitting; it
    //     cannot cancel one, and it is scoped to a single date by design.
    //
    // A range rather than one row per day: "24th to 28th" is one decision a
    // human made, and storing it as five rows means five chances for a partial
    // delete to leave a doctor half on leave. `from`/`to` are inclusive local
    // "YYYY-MM-DD" strings for the same reason `shiftOverrides.date` is — the
    // question asked of them is always "is this date inside?", which is a string
    // comparison that cannot drift by a timezone the way a Date would.
    leaves: [
      {
        from: { type: String, default: '' }, // "YYYY-MM-DD", facility local
        to: { type: String, default: '' }, // inclusive; same as `from` for one day
        reason: { type: String, default: '' },
        by: { type: String, default: '' }, // who filed it — doctor or reception
        createdAt: { type: Date, default: Date.now }
      }
    ],

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
