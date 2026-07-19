const express = require('express');
const router = express.Router();
const Subscription = require('../models/Subscription');
const pushHelper = require('../utils/pushHelper');

// GET VAPID Public Key
router.get('/vapid-key', (req, res) => {
  if (!pushHelper.publicKey) {
    return res.status(500).json({ message: 'VAPID keys not configured on server' });
  }
  res.json({ publicKey: pushHelper.publicKey });
});

// POST Subscribe client to notifications
router.post('/subscribe', async (req, res) => {
  const { subscription, tokenId, role } = req.body;

  if (!subscription || !subscription.endpoint || !subscription.keys || !subscription.keys.auth || !subscription.keys.p256dh) {
    return res.status(400).json({ message: 'Invalid subscription payload' });
  }

  try {
    // Check if subscription already exists
    let existingSub = await Subscription.findOne({ endpoint: subscription.endpoint });

    if (existingSub) {
      existingSub.tokenId = tokenId || existingSub.tokenId;
      existingSub.role = role || existingSub.role;
      existingSub.keys = subscription.keys;
      await existingSub.save();
      return res.status(200).json({ message: 'Subscription updated successfully', subscription: existingSub });
    }

    const newSub = new Subscription({
      tokenId,
      role: role || 'Patient',
      endpoint: subscription.endpoint,
      keys: {
        auth: subscription.keys.auth,
        p256dh: subscription.keys.p256dh
      }
    });

    await newSub.save();

    // Send a welcome test push notification to verify it works
    await pushHelper.sendNotificationToUser(newSub, {
      title: 'CareSync Connected',
      body: 'You will receive real-time updates directly on your device.',
      icon: '/icon.svg',
      url: tokenId ? `/live-tracker/${tokenId}` : '/'
    });

    res.status(201).json({ message: 'Subscribed successfully', subscription: newSub });
  } catch (err) {
    console.error('Subscription saving failed:', err);
    res.status(500).json({ message: 'Failed to save subscription details', error: err.message });
  }
});

// POST Trigger test push notification for debug
router.post('/test-push', async (req, res) => {
  const { role, tokenId, title, body } = req.body;
  try {
    const payload = {
      title: title || 'Test Alert',
      body: body || 'This is a test notification from the CareSync console.',
      icon: '/icon.svg',
      url: '/'
    };

    if (tokenId) {
      await pushHelper.notifyByTokenId(tokenId, payload);
    } else if (role) {
      await pushHelper.notifyByRole(role, payload);
    } else {
      return res.status(400).json({ message: 'Must specify role or tokenId to test push' });
    }

    res.json({ message: 'Test push notifications dispatched successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to test push', error: err.message });
  }
});

module.exports = router;
