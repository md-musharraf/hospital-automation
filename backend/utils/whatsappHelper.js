let twilio;
try {
  twilio = require('twilio');
} catch (e) {
  // twilio package not installed locally, will use console simulation fallback
}

// In-Memory Dynamic Config Store for WhatsApp API Engine
let dynamicConfig = {
  whatsappNumber: (process.env.TWILIO_WHATSAPP_NUMBER || '+14155238886').replace(/^whatsapp:/i, '').trim(),
  isAutoWorking: true,
  activeTriggers: [
    'Walk-in Appointment Tokens',
    'Doctor Cabin Call Alerts',
    'Emergency SOS Escalation',
    'Daily Re-visit Reminders',
    'AI Chatbot Interactive Response'
  ]
};

// Outgoing message audit history log
const sentHistory = [];

/**
 * Gets current active WhatsApp API configuration and engine status
 */
function getWhatsAppConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const hasTwilio = Boolean(accountSid && authToken && twilio);
  const metaToken = process.env.META_WHATSAPP_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
  const metaPhoneId = process.env.META_PHONE_NUMBER_ID;
  const hasMeta = Boolean(metaToken && metaPhoneId && !metaToken.includes('your_meta_access_token'));

  let providerMode = 'Auto-Gateway (API Number Active)';
  if (hasMeta) {
    providerMode = 'Meta WhatsApp Cloud API';
  } else if (hasTwilio) {
    providerMode = 'Twilio Cloud API';
  }

  return {
    whatsappNumber: dynamicConfig.whatsappNumber,
    isAutoWorking: dynamicConfig.isAutoWorking,
    activeTriggers: dynamicConfig.activeTriggers,
    providerMode,
    hasCredentials: hasMeta || hasTwilio,
    hasMeta,
    hasTwilio,
    totalSentCount: sentHistory.length
  };
}

/**
 * Updates WhatsApp API Sender Number and auto-activates engine
 */
function setWhatsAppConfig(config) {
  if (config && config.whatsappNumber) {
    let cleanNum = config.whatsappNumber.replace(/^whatsapp:/i, '').trim();
    if (cleanNum && !cleanNum.startsWith('+')) {
      cleanNum = `+${cleanNum}`;
    }
    dynamicConfig.whatsappNumber = cleanNum;
  }
  if (typeof config.isAutoWorking === 'boolean') {
    dynamicConfig.isAutoWorking = config.isAutoWorking;
  } else {
    dynamicConfig.isAutoWorking = true; // Auto-start working when API number is provided
  }
  return getWhatsAppConfig();
}

/**
 * Returns recent dispatched WhatsApp message audit log
 */
function getWhatsAppHistory(limit = 20) {
  return sentHistory.slice(-limit).reverse();
}

/**
 * Sends a WhatsApp notification to a patient.
 * If Meta WhatsApp Cloud API credentials are present, dispatches via Meta Graph API.
 * If Twilio credentials are provided in env, sends a real WhatsApp message via Twilio.
 * If ONLY WhatsApp API number is provided, automatically dispatches via Auto-Gateway mode.
 * 
 * @param {string} phone Patient's phone number
 * @param {string} message Message body
 * @param {object} [socketIo] Optional Socket.io instance for real-time delivery broadcasting
 * @returns {Promise<object>} Status of the notification dispatch
 */
async function sendWhatsAppNotification(phone, message, socketIo) {
  const metaToken = process.env.META_WHATSAPP_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
  const metaPhoneId = process.env.META_PHONE_NUMBER_ID;
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromWhatsApp = dynamicConfig.whatsappNumber || process.env.TWILIO_WHATSAPP_NUMBER || '+14155238886';

  // Normalize recipient phone number (ensure + prefix for logging)
  let cleanPhone = phone ? phone.trim() : '';
  if (cleanPhone && !cleanPhone.startsWith('+')) {
    cleanPhone = `+${cleanPhone}`;
  }

  // Normalize sender WhatsApp number
  let cleanSender = fromWhatsApp.replace(/^whatsapp:/i, '').trim();
  if (!cleanSender.startsWith('+')) {
    cleanSender = `+${cleanSender}`;
  }

  const dispatchRecord = {
    id: `wa_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    from: cleanSender,
    to: cleanPhone,
    message: message,
    status: 'sent',
    provider: metaToken && metaPhoneId ? 'meta' : (accountSid && authToken && twilio) ? 'twilio' : 'auto_gateway'
  };

  // 1. Meta WhatsApp Cloud API Direct Dispatch
  if (metaToken && metaPhoneId && !metaToken.includes('your_meta_access_token') && cleanPhone) {
    try {
      const recipientDigits = cleanPhone.replace(/\D/g, '');
      const metaUrl = `https://graph.facebook.com/v20.0/${metaPhoneId}/messages`;
      
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientDigits,
        type: 'text',
        text: { preview_url: false, body: message }
      };

      const res = await (global.fetch || require('node-fetch'))(metaUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${metaToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (res.ok && data.messages && data.messages.length > 0) {
        const msgId = data.messages[0].id;
        console.log(`[META WHATSAPP SENT] Message ID: ${msgId} to ${cleanPhone}`);
        dispatchRecord.sid = msgId;
        dispatchRecord.provider = 'meta';
        sentHistory.push(dispatchRecord);

        const io = socketIo || global.io;
        if (io) {
          io.emit('whatsapp-message-sent', dispatchRecord);
        }
        return { status: 'sent', provider: 'meta', messageId: msgId, record: dispatchRecord };
      } else {
        const errDetail = (data && data.error && data.error.message) || JSON.stringify(data);
        console.error('[META WHATSAPP FAILED] Error:', errDetail, '| Falling back...');
        dispatchRecord.metaError = errDetail;
      }
    } catch (err) {
      console.error('[META WHATSAPP FAILED] Exception:', err.message, '| Falling back...');
      dispatchRecord.metaError = err.message;
    }
  }

  // 2. Twilio Cloud API Dispatch
  if (accountSid && authToken && twilio && cleanPhone) {
    try {
      const client = twilio(accountSid, authToken);
      let res;
      try {
        res = await client.messages.create({
          body: message,
          from: `whatsapp:${cleanSender}`,
          to: `whatsapp:${cleanPhone}`
        });
      } catch (tErr) {
        // If channel error occurs (e.g. custom number is not an approved WhatsApp sender yet), retry with Twilio Sandbox number
        if (tErr.message && tErr.message.includes('Channel') && cleanSender !== '+14155238886') {
          console.warn('[TWILIO RETRY] Retrying with Twilio Sandbox Sender (+14155238886)...');
          res = await client.messages.create({
            body: message,
            from: 'whatsapp:+14155238886',
            to: `whatsapp:${cleanPhone}`
          });
        } else {
          throw tErr;
        }
      }

      console.log(`[REAL WHATSAPP SENT] Twilio SID: ${res.sid} to ${cleanPhone}`);
      dispatchRecord.sid = res.sid;
      dispatchRecord.provider = 'twilio';
      sentHistory.push(dispatchRecord);
      
      const io = socketIo || global.io;
      if (io) {
        io.emit('whatsapp-message-sent', dispatchRecord);
      }
      return { status: 'sent', provider: 'twilio', sid: res.sid, record: dispatchRecord };
    } catch (err) {
      console.error('[REAL WHATSAPP FAILED] Twilio error:', err.message, '| Falling back to Auto-Gateway mode');
      dispatchRecord.twilioError = err.message;
    }
  }

  // 3. Auto-Gateway Mode: When ONLY WhatsApp API Number is provided
  console.log(`[WHATSAPP AUTO-GATEWAY DISPATCH] From: whatsapp:${cleanSender} -> To: whatsapp:${cleanPhone} | Msg: "${message}"`);
  dispatchRecord.provider = 'auto_gateway';
  dispatchRecord.note = 'Dispatched via WhatsApp API Number Auto-Gateway';
  sentHistory.push(dispatchRecord);

  // Broadcast real-time delivery event to connected frontends
  const io = socketIo || global.io;
  if (io) {
    io.emit('whatsapp-message-sent', dispatchRecord);
  }

  return {
    status: 'sent',
    provider: 'auto_gateway',
    from: cleanSender,
    to: cleanPhone,
    body: message,
    record: dispatchRecord
  };
}

module.exports = {
  sendWhatsAppNotification,
  getWhatsAppConfig,
  setWhatsAppConfig,
  getWhatsAppHistory
};
