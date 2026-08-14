import mongoose, { Schema, Document, Model } from 'mongoose';

const QueueSchema = new mongoose.Schema(
  {
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true, unique: true },
    currentToken: { type: mongoose.Schema.Types.ObjectId, ref: 'Token', default: null },
    activeQueue: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Token' }], // Ordered list of waiting tokens
    isPaused: { type: Boolean, default: false },
    bufferDelay: { type: Number, default: 0 } // Extra manual delay in minutes added by Doctor
  },
  { timestamps: true }
);

const Queue: Model<any> =
  (mongoose.models && mongoose.models.Queue) || mongoose.model<any>('Queue', QueueSchema);
export default Queue;
module.exports = Queue;
