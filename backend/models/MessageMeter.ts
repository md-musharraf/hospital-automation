import mongoose, { Schema, Document, Model } from 'mongoose';
import { tenantGuardPlugin } from '../utils/tenantGuard';

/**
 * What each facility sent over WhatsApp this month, and what of it is billable.
 *
 * WhatsApp is the platform's largest variable cost and, until this existed, the
 * only cost nobody could attribute. Meta bills US per message on one number that
 * every tenant shares, so the invoice arrives as a single figure while the
 * traffic behind it belongs to twenty different hospitals. A 200-patient OPD
 * sending booking, departure, arrival, bill and report messages generates
 * roughly twenty thousand messages a month; a two-doctor clinic sends a few
 * hundred. Charging both the same flat fee means the busy one is subsidised by
 * the quiet one until the margin is gone, and no report anywhere would say so.
 *
 * One document per facility per calendar month. Deliberately not one row per
 * message: an audit trail of every message ever sent is a table that grows
 * forever to answer a question nobody asks, while the question that IS asked at
 * the end of every month — "how many did Sunrise send?" — is a single read.
 * `utils/whatsappHelper` already keeps the last 200 dispatches in memory for
 * debugging, which is the other half of this and the one with a bounded size.
 *
 * ── Two counters, because they are not the same fact ────────────────────────
 *
 *  - `sent` is what Meta accepted. `failed` is what it rejected — an expired
 *    token, a number not on WhatsApp, a blocked app. Meta does not charge us for
 *    those and we must not charge the facility either: a line item for messages
 *    that never arrived is the fastest way to lose a hospital's trust in the
 *    whole bill.
 *
 *  - `billable` is narrower still. Licence reminders are the PLATFORM messaging
 *    the facility about its own renewal; billing a hospital for the message that
 *    asks it to pay us is indefensible. `utils/messageMeter` decides which kinds
 *    count, and this model only stores the verdict.
 */
const MessageMeterSchema = new mongoose.Schema(
  {
    // The facility slug (`Hospital.id`), or the `__unattributed` bucket for a
    // send whose caller passed no facility. See utils/messageMeter.
    hospital: { type: String, required: true, index: true },

    // "YYYY-MM" in the facility's own wall clock, never UTC.
    //
    // The process is pinned to `FACILITY_TIMEZONE` at boot (utils/timezone.ts),
    // so plain local date parts already mean IST here. That matters at exactly
    // one moment and it is the moment that gets noticed: a message sent at
    // 11:30 PM IST on the 31st is 6:00 PM UTC on the 31st, but one sent at
    // 6:00 AM IST on the 1st is 12:30 AM UTC on the 1st — reading UTC would
    // scatter a handful of each month's messages into its neighbour and make
    // the totals irreproducible against the facility's own records.
    period: { type: String, required: true, index: true },

    /** Accepted by Meta. */
    sent: { type: Number, default: 0, min: 0 },

    /** Rejected by Meta. Counted so an outage is visible; never charged. */
    failed: { type: Number, default: 0, min: 0 },

    /** Accepted AND chargeable — the number the invoice is built from. */
    billable: { type: Number, default: 0, min: 0 },

    /**
     * Per-kind breakdown: `{ arrival: 412, bill: 88, report: 40 }`.
     *
     * `Mixed`, for the same reason `ChatSession.tempData` and `Hospital.modules`
     * are. A declared sub-schema silently drops keys it does not know about, so
     * the day somebody adds a new message kind, every meter already in the
     * database would discard it on the next save — and the loss would show up as
     * a slightly-too-low invoice, not as an error.
     */
    byKind: { type: Schema.Types.Mixed, default: () => ({}) },

    /** When this month's first and most recent message went out. */
    firstAt: { type: Date, default: null },
    lastAt: { type: Date, default: null }
  },
  { timestamps: true }
);

// One meter per facility per month. Unique so the upsert in `recordMessage`
// cannot race two concurrent sends into two half-counted documents — the second
// insert loses, retries, and increments the winner instead.
MessageMeterSchema.index({ hospital: 1, period: 1 }, { unique: true });

MessageMeterSchema.plugin(tenantGuardPlugin, { modelName: 'MessageMeter' });

const MessageMeter: Model<any> =
  (mongoose.models && mongoose.models.MessageMeter) ||
  mongoose.model<any>('MessageMeter', MessageMeterSchema);

export default MessageMeter;
module.exports = MessageMeter;
