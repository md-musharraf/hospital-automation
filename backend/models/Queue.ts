import mongoose, { Schema, Document, Model } from 'mongoose';

const QueueSchema = new mongoose.Schema(
  {
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true, unique: true },
    currentToken: { type: mongoose.Schema.Types.ObjectId, ref: 'Token', default: null },
    activeQueue: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Token' }], // Ordered list of waiting tokens
    isPaused: { type: Boolean, default: false },
    bufferDelay: { type: Number, default: 0 }, // Extra manual delay in minutes added by Doctor

    // ---- Running late -------------------------------------------------------
    // Why the cabin is behind, in the doctor's own words ("stuck in traffic",
    // "emergency case"). Sent to the waiting patients verbatim: a delay with a
    // reason is tolerated, an unexplained one is what makes people crowd the
    // reception desk to ask.
    delayReason: { type: String, default: '' },
    // When the doctor now expects to start seeing patients. Set when they报 a
    // report a late arrival, cleared once they start calling tokens.
    delayedUntil: { type: Date, default: null },
    // The delay figure the waiting patients were last TOLD. Kept so the tracker
    // can tell a real change from a recalculation of the same number, and only
    // spend a WhatsApp message when the answer has actually moved. Without it a
    // five-minute job would message every patient every five minutes.
    lastNotifiedDelay: { type: Number, default: 0 },
    lastDelayNotifiedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

const Queue: Model<any> =
  (mongoose.models && mongoose.models.Queue) || mongoose.model<any>('Queue', QueueSchema);
export default Queue;
module.exports = Queue;
