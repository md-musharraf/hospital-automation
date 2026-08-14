import mongoose, { Schema, Document, Model } from 'mongoose';

const ChatSessionSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, unique: true, index: true }, // e.g. Socket ID or phone number
    currentState: {
      type: String,
      enum: [
        'LANGUAGE',
        'AWAITING_FACILITY', // patient is choosing which hospital/clinic to book at
        'WELCOME',
        'AWAITING_PHONE',
        'AWAITING_NAME',
        'AWAITING_AGE',
        'AWAITING_GENDER',
        'AWAITING_SYMPTOMS',
        'AWAITING_TRIAGE_CONFIRM', // patient is confirming the smart-triage recommendation
        'AWAITING_DOCTOR_CHOICE', // patient is picking a doctor from the manual list
        'AWAITING_TOKEN', // patient is typing a token number for a status check
        'COMPLETED'
      ],
      default: 'LANGUAGE'
    },
    // Scratch data for the in-progress conversation (phone, name, age, gender,
    // symptoms, hospitalId, language, tokenType, refillMode, suggestedDoctorId,
    // pendingSymptoms, …). Deliberately Mixed rather than a fixed sub-schema:
    // with declared paths only, Mongoose SILENTLY STRIPS any key the schema does
    // not know about on save, so every new conversation flag added to the state
    // engine (refillMode, suggestedDoctorId) vanished on the very next turn and
    // the flow fell back to the wrong branch. Every write path already calls
    // `session.markModified('tempData')`, which is what Mixed requires.
    tempData: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    lastActivity: { type: Date, default: Date.now, expires: 3600 } // TTL index: auto-expires after 1 hour of inactivity
  },
  { timestamps: true }
);

const ChatSession: Model<any> =
  (mongoose.models && mongoose.models.ChatSession) || mongoose.model<any>('ChatSession', ChatSessionSchema);
export default ChatSession;
module.exports = ChatSession;
