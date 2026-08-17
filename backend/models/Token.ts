import mongoose, { Schema, Document, Model } from 'mongoose';
import { tenantGuardPlugin } from '../utils/tenantGuard';

const TokenSchema = new mongoose.Schema(
  {
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
    // WHERE this booking came from. Reception needs to tell a patient standing at
    // the counter apart from one who booked from home on WhatsApp — the second
    // group never passes the desk, so their bill and their special-needs priority
    // have to be handled from the arrivals list instead of face to face.
    bookingSource: {
      type: String,
      enum: ['Reception', 'WhatsApp', 'Web Assistant', 'QR Scan'],
      default: 'Reception',
      index: true
    },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
    symptoms: { type: String, required: true },
    chatHistory: [
      {
        sender: { type: String, enum: ['user', 'bot'] },
        message: { type: String },
        timestamp: { type: Date, default: Date.now }
      }
    ],
    // Where this patient is in the hospital RIGHT NOW. This is the spine that lets
    // reception, the doctor, the lab and the pharmacy see one shared patient
    // journey instead of each role guessing from its own silo.
    journeyStage: {
      type: String,
      enum: [
        'Waiting', // in the doctor's queue
        'In Consultation', // inside the cabin
        'Lab Pending', // doctor ordered tests, waiting on the lab
        'Lab Complete', // results in — patient goes BACK to the doctor
        'Pharmacy Pending', // prescription written, medicines not handed over yet
        'Dispensed', // medicines collected
        'Completed', // done, nothing outstanding
        'Absent'
      ],
      default: 'Waiting',
      index: true
    },
    // Append-only trail of stage changes — powers the patient's progress tracker
    // and lets staff see exactly where time is being lost.
    stageHistory: [
      {
        stage: { type: String },
        at: { type: Date, default: Date.now },
        by: { type: String }
      }
    ],
    labTests: [
      {
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
        reportPdf: { type: String }, // Base64 PDF Data URI or Document Link
        reportFileName: { type: String },
        // When the patient was WhatsApped this report, and WHICH document.
        //
        // The report goes out the moment the lab attaches the PDF; without a
        // record of what was sent, re-saving an unchanged worksheet would send
        // the same document again and read to the patient as a second, different
        // result. Holds a signature rather than a bare URL: the cloud URL when
        // there is one, otherwise `inline:<filename>:<length>` — because an
        // inlined report has no URL to compare and still has to be told apart
        // from a corrected re-upload, which DOES notify again.
        reportSharedAt: { type: Date },
        reportSharedUrl: { type: String },
        requestedBy: { type: String },
        collectedAt: { type: Date },
        completedBy: { type: String },
        completedAt: { type: Date }
      }
    ],
    prescription: {
      medicines: [
        {
          name: { type: String },
          dosage: { type: String },
          duration: { type: String },
          instructions: { type: String }
        }
      ],
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
    // What this patient told us at booking about how long they need to REACH the
    // facility. Copied from their record so it is fixed for this visit — someone
    // who normally travels an hour but is at a relative's house down the road
    // today should not be pulled out of bed an hour early.
    //
    // 0 means "already here" (a walk-in registered at the counter); null means
    // nobody was asked, which leaves this token on the old position-based alert
    // only.
    travelMinutes: { type: Number, default: null },
    // Set once the "leave for the hospital NOW" WhatsApp has gone out, with the
    // instant it went. The flag stops the sweep repeating itself; the timestamp
    // is what lets the cabin tell a patient who is ON THE ROAD from one who
    // simply never set off — the first must not be marked absent, they were told
    // to arrive at a time that has not come yet.
    departureAlerted: { type: Boolean, default: false },
    departureAlertedAt: { type: Date, default: null },
    // How many times staff pushed this token back to let the queue keep moving.
    // Capped, so a patient who is repeatedly not there cannot be deferred to the
    // end of the day one slot at a time with nobody noticing.
    deferCount: { type: Number, default: 0 },
    // The wait this patient was last TOLD on WhatsApp, and when. The queue
    // tracker compares against these instead of against the previous estimate,
    // so a patient is messaged when the answer they are holding has gone stale —
    // not every time the number is recomputed. Nothing else reads them; they
    // exist purely to stop the tracker becoming a source of spam.
    lastNotifiedWait: { type: Number, default: null },
    lastTrackedAt: { type: Date, default: null },
    // How many times a no-show has been auto-recalled (given a second chance in the
    // queue instead of being sent back to reception). Capped so it can't loop forever.
    recallCount: { type: Number, default: 0 },
    calledAt: { type: Date },
    completedAt: { type: Date }
  },
  { timestamps: true }
);

// Compound index for unique tokenNumber per hospital tenant
TokenSchema.index({ tokenNumber: 1, hospital: 1 }, { unique: true });

// ...and one the tenant's own queries can actually use.
//
// The unique index above has `hospital` as its SECOND field, so it cannot serve
// a query that filters on `hospital` alone — an index is only usable from its
// leading field inwards. Every "today's tokens at this facility" read (the
// reception board, the overview counts, the doctor's stats) was therefore
// scanning the entire Token collection, across every tenant. That is invisible
// at four facilities and ruinous at two hundred, because Token is both the
// largest collection and the fastest-growing one.
TokenSchema.index({ hospital: 1, createdAt: -1 });

// The queue reads: "what is in front of this doctor right now".
TokenSchema.index({ doctor: 1, status: 1 });

// Tenant-owned. An unscoped query on this collection would read or modify every
// facility's rows at once, silently. See utils/tenantGuard.js.
TokenSchema.plugin(tenantGuardPlugin, { modelName: 'Token' });

const Token: Model<any> =
  (mongoose.models && mongoose.models.Token) || mongoose.model<any>('Token', TokenSchema);
export default Token;
module.exports = Token;
