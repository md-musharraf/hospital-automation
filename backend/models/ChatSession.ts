import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Every step the patient conversation can be parked at.
 *
 * Exported so the test suite can compare this list against the states
 * `routes/chat.ts` actually assigns — see the note on `currentState` below.
 */
export const CHAT_STATES: string[] = [
  'LANGUAGE',
  'AWAITING_FACILITY', // patient is choosing which hospital/clinic to book at
  'AWAITING_STATE', // location cascade: which state
  'AWAITING_DISTRICT', // location cascade: which district
  'WELCOME',
  'AWAITING_PHONE',
  'AWAITING_NAME',
  'AWAITING_AGE',
  'AWAITING_GENDER',
  'AWAITING_SYMPTOMS',
  'AWAITING_TRIAGE_CONFIRM', // patient is confirming the smart-triage recommendation
  'AWAITING_DOCTOR_CHOICE', // patient is picking a doctor from the manual list
  'AWAITING_NEXTDAY_CONFIRM', // the doctor's day is over/full — patient is agreeing to the next one
  'AWAITING_TRAVEL_TIME', // patient is saying how long they need to reach the hospital
  'AWAITING_TOKEN', // patient is typing a token number for a status check
  'COMPLETED'
];

const ChatSessionSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, unique: true, index: true }, // e.g. Socket ID or phone number
    currentState: {
      type: String,
      // Exported, and asserted against the state engine by tests/chat-engine.test.js.
      //
      // A state added to routes/chat.ts and not to this list does not fail at the
      // moment somebody writes it — it fails on the patient's screen, mid-booking,
      // as "validation failed: X is not a valid enum value". That is exactly how
      // AWAITING_TRAVEL_TIME shipped: the flow was complete and tested against the
      // in-memory DB, which has no schema, so nothing caught it until a real
      // Mongo rejected the save and every booking at every facility stopped at
      // the same step. The list stays (it is worth catching a typo), but the test
      // is what makes a second occurrence impossible.
      enum: CHAT_STATES,
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
// Named export for CommonJS callers (the test suite), alongside the default.
module.exports.CHAT_STATES = CHAT_STATES;
