import fs from 'fs';
import path from 'path';
import webPush from 'web-push';
import logger from './logger';

const log = logger.child({ module: 'push' });
const KEYS_PATH = path.join(__dirname, '../vapid_keys.json');

export interface VapidKeys {
  publicKey?: string | undefined;
  privateKey?: string | undefined;
}

let vapidKeys: VapidKeys = {
  publicKey: process.env.VAPID_PUBLIC_KEY,
  privateKey: process.env.VAPID_PRIVATE_KEY
};

// If not provided in environment, try loading from local file or generate them
if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
  if (fs.existsSync(KEYS_PATH)) {
    try {
      vapidKeys = JSON.parse(fs.readFileSync(KEYS_PATH, 'utf8'));
      log.info('Loaded existing VAPID keys from vapid_keys.json');
    } catch (err) {
      log.error('Error reading VAPID keys file:', { err });
    }
  }

  if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
    try {
      vapidKeys = webPush.generateVAPIDKeys();
      fs.writeFileSync(KEYS_PATH, JSON.stringify(vapidKeys, null, 2), 'utf8');
      log.info('Generated and saved new VAPID keys in vapid_keys.json');
    } catch (err) {
      log.error('Failed to generate VAPID keys:', { err });
    }
  }
}

// Configure Web Push with VAPID details
if (vapidKeys.publicKey && vapidKeys.privateKey) {
  webPush.setVapidDetails('mailto:support@careeai.com', vapidKeys.publicKey, vapidKeys.privateKey);
}

export const publicKey = vapidKeys.publicKey;

export const sendNotificationToUser = async (subscription: any, payload: any): Promise<boolean> => {
  try {
    const pushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        auth: subscription.keys.auth,
        p256dh: subscription.keys.p256dh
      }
    };

    await webPush.sendNotification(pushSubscription, JSON.stringify(payload));
    log.info(`Successfully sent notification to subscription: ${subscription.endpoint.substring(0, 40)}...`);
    return true;
  } catch (err: any) {
    log.error(`Failed to send push notification to ${subscription.endpoint.substring(0, 40)}:`, {
      error: err.message
    });
    if (err.statusCode === 410 || err.statusCode === 404) {
      // Subscription expired or gone - remove from database
      const Subscription = require('../models/Subscription');
      await Subscription.deleteOne({ endpoint: subscription.endpoint });
      log.info(`Cleaned up expired subscription: ${subscription.endpoint.substring(0, 40)}`);
    }
    return false;
  }
};

export const notifyByTokenId = async (tokenId: string, payload: any): Promise<boolean[]> => {
  const Subscription = require('../models/Subscription');
  const subs = await Subscription.find({ tokenId });
  const results = await Promise.all(subs.map((sub: any) => sendNotificationToUser(sub, payload)));
  return results;
};

export const notifyByRole = async (role: string, payload: any): Promise<boolean[]> => {
  const Subscription = require('../models/Subscription');
  const subs = await Subscription.find({ role });
  const results = await Promise.all(subs.map((sub: any) => sendNotificationToUser(sub, payload)));
  return results;
};
