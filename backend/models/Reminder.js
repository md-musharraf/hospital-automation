const mongoose = require('mongoose');

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

module.exports = mongoose.model('Reminder', ReminderSchema);
