const fs = require('fs');
const path = require('path');
const webPush = require('web-push');

const KEYS_PATH = path.join(__dirname, '../vapid_keys.json');

let vapidKeys = {
  publicKey: process.env.VAPID_PUBLIC_KEY,
  privateKey: process.env.VAPID_PRIVATE_KEY
};

// If not provided in environment, try loading from local file or generate them
if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
  if (fs.existsSync(KEYS_PATH)) {
    try {
      vapidKeys = JSON.parse(fs.readFileSync(KEYS_PATH, 'utf8'));
      console.log('[PushHelper] Loaded existing VAPID keys from vapid_keys.json');
    } catch (err) {
      console.error('[PushHelper] Error reading VAPID keys file:', err);
    }
  }

  if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
    try {
      vapidKeys = webPush.generateVAPIDKeys();
      fs.writeFileSync(KEYS_PATH, JSON.stringify(vapidKeys, null, 2), 'utf8');
      console.log('[PushHelper] Generated and saved new VAPID keys in vapid_keys.json');
    } catch (err) {
      console.error('[PushHelper] Failed to generate VAPID keys:', err);
    }
  }
}

// Configure Web Push with VAPID details
if (vapidKeys.publicKey && vapidKeys.privateKey) {
  webPush.setVapidDetails(
    'mailto:support@caresync.com',
    vapidKeys.publicKey,
    vapidKeys.privateKey
  );
}

const sendNotificationToUser = async (subscription, payload) => {
  try {
    const pushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        auth: subscription.keys.auth,
        p256dh: subscription.keys.p256dh
      }
    };

    await webPush.sendNotification(pushSubscription, JSON.stringify(payload));
    console.log(`[PushHelper] Successfully sent notification to subscription: ${subscription.endpoint.substring(0, 40)}...`);
    return true;
  } catch (err) {
    console.error(`[PushHelper] Failed to send push notification to ${subscription.endpoint.substring(0, 40)}:`, err.message);
    if (err.statusCode === 410 || err.statusCode === 404) {
      // Subscription expired or gone - remove from database
      const Subscription = require('../models/Subscription');
      await Subscription.deleteOne({ endpoint: subscription.endpoint });
      console.log(`[PushHelper] Cleaned up expired subscription: ${subscription.endpoint.substring(0, 40)}`);
    }
    return false;
  }
};

const notifyByTokenId = async (tokenId, payload) => {
  const Subscription = require('../models/Subscription');
  const subs = await Subscription.find({ tokenId });
  const results = await Promise.all(subs.map(sub => sendNotificationToUser(sub, payload)));
  return results;
};

const notifyByRole = async (role, payload) => {
  const Subscription = require('../models/Subscription');
  const subs = await Subscription.find({ role });
  const results = await Promise.all(subs.map(sub => sendNotificationToUser(sub, payload)));
  return results;
};

module.exports = {
  publicKey: vapidKeys.publicKey,
  sendNotificationToUser,
  notifyByTokenId,
  notifyByRole
};
