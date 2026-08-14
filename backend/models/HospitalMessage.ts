import mongoose, { Schema, Document, Model } from 'mongoose';
import { tenantGuardPlugin } from '../utils/tenantGuard';

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

// Tenant-owned. An unscoped query on this collection would read or modify every
// facility's rows at once, silently. See utils/tenantGuard.js.
HospitalMessageSchema.plugin(tenantGuardPlugin, { modelName: 'HospitalMessage' });

const HospitalMessage: Model<any> =
  (mongoose.models && mongoose.models.HospitalMessage) ||
  mongoose.model<any>('HospitalMessage', HospitalMessageSchema);
export default HospitalMessage;
module.exports = HospitalMessage;
