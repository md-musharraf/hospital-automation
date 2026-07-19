const mongoose = require('mongoose');

const SubscriptionSchema = new mongoose.Schema({
  tokenId: { type: String, required: false, index: true },
  role: { type: String, enum: ['Patient', 'Doctor', 'Staff', 'Lab'], required: true },
  endpoint: { type: String, required: true, unique: true, index: true },
  expirationTime: { type: Date, required: false },
  keys: {
    auth: { type: String, required: true },
    p256dh: { type: String, required: true }
  }
}, { timestamps: true });

module.exports = mongoose.model('Subscription', SubscriptionSchema);
