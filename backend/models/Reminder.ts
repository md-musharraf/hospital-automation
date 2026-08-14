import mongoose, { Schema, Document, Model } from 'mongoose';
import { tenantGuardPlugin } from '../utils/tenantGuard';

const ReminderSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true
    },
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      required: true
    },
    token: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Token',
      required: true
    },
    hospital: {
      type: String,
      required: true,
      default: 'general-hospital',
      index: true
    },
    scheduledDate: {
      type: Date,
      required: true
    },
    revisitDays: {
      type: Number,
      required: true
    },
    status: {
      type: String,
      enum: ['Pending', 'Sent', 'Cancelled'],
      default: 'Pending',
      index: true
    },
    message: {
      type: String,
      required: true
    },
    sentAt: {
      type: Date
    }
  },
  { timestamps: true }
);

// Follow-ups are always read for one facility.
ReminderSchema.index({ hospital: 1, createdAt: -1 });

// Tenant-owned. An unscoped query on this collection would read or modify every
// facility's rows at once, silently. See utils/tenantGuard.js.
ReminderSchema.plugin(tenantGuardPlugin, { modelName: 'Reminder' });

const Reminder: Model<any> =
  (mongoose.models && mongoose.models.Reminder) || mongoose.model<any>('Reminder', ReminderSchema);
export default Reminder;
module.exports = Reminder;
