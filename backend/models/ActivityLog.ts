import mongoose, { Schema, Document, Model } from 'mongoose';
import { tenantGuardPlugin } from '../utils/tenantGuard';

// One line in the facility's live activity feed — "Dr. Sharma called T-105",
// "Lab completed CBC for T-102 (ABNORMAL)", "Pharmacy dispensed T-101".
//
// This is what turns five separate portals into one hospital: every role writes
// to the same stream and every dashboard can watch it in real time, so reception
// knows a doctor is running late, the doctor knows a report just landed, and the
// manager can see the whole floor without walking it.
const ActivityLogSchema = new mongoose.Schema(
  {
    hospital: { type: String, required: true, index: true },
    // Machine-readable kind, used for filtering/icons on the dashboards.
    type: {
      type: String,
      enum: [
        'token-created',
        'token-called',
        'token-completed',
        'token-absent',
        'token-recalled',
        'lab-requested',
        'lab-collected',
        'lab-completed',
        'rx-prescribed',
        'rx-dispensed',
        'refill-requested',
        'refill-decided',
        'stock-low',
        'stock-out',
        'stock-updated',
        'doctor-status',
        'buffer-added',
        'system'
      ],
      required: true,
      index: true
    },
    role: {
      type: String,
      enum: ['doctor', 'staff', 'lab', 'pharmacy', 'patient', 'system'],
      default: 'system'
    },
    actor: { type: String }, // human name shown in the feed ("Dr. Sarah Jenkins")
    message: { type: String, required: true },
    tokenNumber: { type: String }, // so a dashboard can deep-link to the token
    refId: { type: String }, // token / medicine / refill id
    severity: { type: String, enum: ['info', 'success', 'warning', 'critical'], default: 'info' }
  },
  { timestamps: true }
);

// Newest-first reads are the only access pattern.
ActivityLogSchema.index({ hospital: 1, createdAt: -1 });

// Self-cleaning: the feed is an operational view, not an audit archive
// (ArchivedToken already covers the permanent record). 24h is plenty and keeps
// the collection from growing without bound in a busy OPD.
ActivityLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

// Tenant-owned. An unscoped query on this collection would read or modify every
// facility's rows at once, silently. See utils/tenantGuard.js.
ActivityLogSchema.plugin(tenantGuardPlugin, { modelName: 'ActivityLog' });

const ActivityLog: Model<any> =
  (mongoose.models && mongoose.models.ActivityLog) || mongoose.model<any>('ActivityLog', ActivityLogSchema);
export default ActivityLog;
module.exports = ActivityLog;
