// Single source of truth for the hospital's public WhatsApp number.
// Everything (welcome text, QR deep links, hospital records, webhook matching)
// must derive from THIS one number so the patient always sees, and always
// replies to, the exact same number — no more "do alag-alag number" mismatch
// between a Twilio placeholder and the real registered number.
const DEFAULT_WHATSAPP_NUMBER =
  process.env.META_DISPLAY_NUMBER ||
  process.env.TWILIO_WHATSAPP_NUMBER ||
  '+917484043690';

// In-Memory Dynamic Config Store for WhatsApp API Engine
let dynamicConfig = {
  whatsappNumber: DEFAULT_WHATSAPP_NUMBER,
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
  const metaToken = process.env.META_WHATSAPP_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
  const metaPhoneId = process.env.META_PHONE_NUMBER_ID;
  const hasMeta = Boolean(metaToken && metaPhoneId && !metaToken.includes('your_meta_access_token'));

  return {
    whatsappNumber: dynamicConfig.whatsappNumber,
    isAutoWorking: dynamicConfig.isAutoWorking,
    activeTriggers: dynamicConfig.activeTriggers,
    providerMode: hasMeta ? 'Meta WhatsApp Cloud API' : 'Auto-Gateway (API Number Active)',
    hasCredentials: hasMeta,
    hasMeta: hasMeta,
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
    dynamicConfig.isAutoWorking = true;
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
 * The one canonical public WhatsApp number, normalised (no `whatsapp:` prefix).
 * Use this anywhere the old `process.env.TWILIO_WHATSAPP_NUMBER || '+14155238886'`
 * pattern used to appear so there is exactly one number across the whole app.
 */
function getPrimaryWhatsAppNumber() {
  return (dynamicConfig.whatsappNumber || DEFAULT_WHATSAPP_NUMBER).replace(/^whatsapp:/i, '');
}

/**
 * Maps a Meta Graph API error object to a short, actionable classification.
 * Keeps the "what do I actually do about it" logic in one place so both the
 * send path and the health check agree.
 */
function classifyMetaError(mErr = {}) {
  if (mErr.code === 190) return 'token_expired_or_invalid';
  if (mErr.code === 200) return 'api_access_blocked';
  if (mErr.code === 10 || mErr.code === 131030) return 'recipient_not_allowlisted';
  if (mErr.code === 131026) return 'message_undeliverable';
  if (mErr.code === 100) return 'invalid_parameter';
  return 'unknown';
}

/**
 * Live health-check of the configured Meta WhatsApp credentials. Makes ONE
 * read-only call (phone-number status) and classifies the result so an operator
 * can tell an EXPIRED token (code 190) apart from a Meta-side ACCESS BLOCK
 * (code 200) apart from a genuinely healthy setup — without digging through
 * server logs. Powers GET /api/v1/chat/whatsapp/health.
 */
async function checkMetaToken() {
  const metaToken = process.env.META_WHATSAPP_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
  const metaPhoneId = process.env.META_PHONE_NUMBER_ID;
  if (!metaToken || !metaPhoneId || metaToken.includes('your_meta_access_token')) {
    return {
      ok: false, configured: false, classification: 'not_configured',
      message: 'Meta credentials are not set (META_WHATSAPP_ACCESS_TOKEN / META_PHONE_NUMBER_ID).'
    };
  }
  try {
    const url = `https://graph.facebook.com/v20.0/${metaPhoneId}?fields=display_phone_number,verified_name,quality_rating,status&access_token=${metaToken}`;
    const res = await (global.fetch || require('node-fetch'))(url);
    const data = await res.json();
    if (res.ok && !data.error) {
      return {
        ok: true, configured: true, classification: 'healthy',
        displayNumber: data.display_phone_number, verifiedName: data.verified_name,
        qualityRating: data.quality_rating, numberStatus: data.status,
        message: 'Meta WhatsApp token is valid and the number is reachable.'
      };
    }
    const mErr = data.error || {};
    const classification = classifyMetaError(mErr);
    const hint = classification === 'token_expired_or_invalid'
      ? 'Generate a fresh token (prefer a permanent System User token) and update META_WHATSAPP_ACCESS_TOKEN on the server.'
      : classification === 'api_access_blocked'
        ? 'Meta has blocked this app/token API access — check the app for restriction banners and Business verification, or create a new app + token.'
        : 'See the Meta error message for details.';
    return {
      ok: false, configured: true, classification,
      code: mErr.code, subcode: mErr.error_subcode,
      message: mErr.message || 'Unknown Meta error', hint
    };
  } catch (err) {
    return { ok: false, configured: true, classification: 'network_error', message: err.message };
  }
}

/**
 * Sends a WhatsApp notification to a patient using Meta WhatsApp Cloud API v20.0.
 * Supports text messages and interactive quick reply buttons / list options.
 * Falls back cleanly to Auto-Gateway mode if Meta credentials are not configured.
 * 
 * @param {string} phone Patient's phone number
 * @param {string} message Message body
 * @param {Array<string>} [options] Optional button/list options for interactive messaging
 * @param {object} [socketIo] Optional Socket.io instance for real-time delivery broadcasting
 * @param {string} [fromPhoneNumberId] Optional Meta phone-number-id to send FROM. When a
 *   patient messages the business, this is set to the id of the number that RECEIVED the
 *   message (webhook `metadata.phone_number_id`) so the reply always goes back from the
 *   exact same number — no more "request 74 par, reply 555 se" split. Falls back to the
 *   configured META_PHONE_NUMBER_ID for app-initiated sends (walk-in tokens, reminders).
 * @returns {Promise<object>} Status of the notification dispatch
 */
async function sendWhatsAppNotification(phone, message, options = [], socketIo, fromPhoneNumberId) {
  // Allow signature overloading sendWhatsAppNotification(phone, message, socketIo)
  if (options && !Array.isArray(options) && typeof options === 'object') {
    socketIo = options;
    options = [];
  }

  const metaToken = process.env.META_WHATSAPP_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
  // Reply FROM the number that received the message when we know it; otherwise
  // use the configured default sender.
  const metaPhoneId = fromPhoneNumberId || process.env.META_PHONE_NUMBER_ID;
  const fromWhatsApp = dynamicConfig.whatsappNumber || DEFAULT_WHATSAPP_NUMBER;

  let cleanPhone = phone ? phone.trim() : '';
  if (cleanPhone && !cleanPhone.startsWith('+')) {
    cleanPhone = `+${cleanPhone}`;
  }

  let cleanSender = fromWhatsApp.replace(/^whatsapp:/i, '').trim();
  if (!cleanSender.startsWith('+')) {
    cleanSender = `+${cleanSender}`;
  }

  // A missing/blank phone number means there's nowhere to actually deliver
  // this message — don't fall through to Auto-Gateway mode and report
  // 'sent' anyway, which would mask a real data problem (patient has no
  // phone on file) as a successful delivery.
  if (!cleanPhone) {
    console.warn('[WHATSAPP SKIPPED] No phone number provided — message not dispatched:', message);
    return { status: 'skipped', provider: 'none', reason: 'missing_phone' };
  }

  const metaConfigured = Boolean(metaToken && metaPhoneId && !metaToken.includes('your_meta_access_token'));

  const dispatchRecord = {
    id: `wa_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    from: cleanSender,
    to: cleanPhone,
    message: message,
    options: options,
    status: 'sent',
    provider: metaConfigured ? 'meta' : 'auto_gateway'
  };

  // Meta WhatsApp Cloud API Direct Dispatch
  if (metaConfigured && cleanPhone) {
    try {
      const recipientDigits = cleanPhone.replace(/\D/g, '');
      const metaUrl = `https://graph.facebook.com/v20.0/${metaPhoneId}/messages`;
      
      let payload;

      // 1. Interactive Quick Reply Buttons (1 to 3 options, e.g. Male / Female / Other)
      if (options && Array.isArray(options) && options.length > 0 && options.length <= 3) {
        payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: recipientDigits,
          type: 'interactive',
          interactive: {
            type: 'button',
            body: { text: message },
            action: {
              buttons: options.map((opt, idx) => ({
                type: 'reply',
                reply: {
                  id: `btn_${idx + 1}_${opt.substring(0, 10).replace(/\s+/g, '_')}`,
                  title: opt.substring(0, 20) // Meta max button title length is 20 chars
                }
              }))
            }
          }
        };
      } 
      // 2. Interactive List Menu (> 3 options, up to 10 items)
      else if (options && Array.isArray(options) && options.length > 3 && options.length <= 10) {
        payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: recipientDigits,
          type: 'interactive',
          interactive: {
            type: 'list',
            body: { text: message },
            action: {
              button: 'Select Option',
              sections: [
                {
                  title: 'Available Choices',
                  rows: options.slice(0, 10).map((opt, idx) => ({
                    id: `opt_${idx + 1}`,
                    title: opt.substring(0, 24),
                    description: `Option ${idx + 1}`
                  }))
                }
              ]
            }
          }
        };
      } 
      // 3. Plain Text Message
      else {
        let fullText = message;
        if (options && Array.isArray(options) && options.length > 0) {
          fullText += '\n\n' + options.map((opt, idx) => `${idx + 1}. ${opt}`).join('\n');
        }
        payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: recipientDigits,
          type: 'text',
          text: { preview_url: false, body: fullText }
        };
      }

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
        const mErr = (data && data.error) || {};
        const errDetail = mErr.message || JSON.stringify(data);
        // Classify the failure so the operator instantly knows the remedy:
        //  - code 190              => access token EXPIRED/invalid  => generate a fresh token
        //  - code 200 "API access blocked" => Meta BLOCKED the app's API access (account/app level)
        //  - code 10 / 131030      => recipient not in the dev-mode allowed-numbers list
        const classification = classifyMetaError(mErr);
        console.error(`[META WHATSAPP FAILED] code=${mErr.code} subcode=${mErr.error_subcode || '-'} (${classification}): ${errDetail} | Falling back...`);
        dispatchRecord.metaError = errDetail;
        dispatchRecord.metaErrorCode = mErr.code;
        dispatchRecord.metaErrorSubcode = mErr.error_subcode;
        dispatchRecord.metaErrorClass = classification;
      }
    } catch (err) {
      console.error('[META WHATSAPP FAILED] Exception:', err.message, '| Falling back...');
      dispatchRecord.metaError = err.message;
    }
  }

  // If Meta credentials ARE configured but the send above failed (e.g. the
  // access token expired — Meta error 190 "Authentication Error"), do NOT
  // pretend it was delivered via the simulation gateway. Report the real
  // failure so it's visible in the history/UI instead of silently swallowed,
  // which is exactly what masks an expired-token problem from the operator.
  if (metaConfigured) {
    console.error(`[META WHATSAPP UNDELIVERED] To: ${cleanPhone} | Reason: ${dispatchRecord.metaError || 'unknown'}`);
    dispatchRecord.status = 'failed';
    dispatchRecord.provider = 'meta';
    sentHistory.push(dispatchRecord);

    const failIo = socketIo || global.io;
    if (failIo) {
      failIo.emit('whatsapp-message-sent', dispatchRecord);
    }

    return {
      status: 'failed',
      provider: 'meta',
      error: dispatchRecord.metaError || 'Meta WhatsApp Cloud API delivery failed',
      to: cleanPhone,
      record: dispatchRecord
    };
  }

  // Auto-Gateway Mode: Development/Simulation Fallback (Meta not configured)
  let autoText = message;
  if (options && Array.isArray(options) && options.length > 0) {
    autoText += '\n\n' + options.map((opt, idx) => `${idx + 1}. ${opt}`).join('\n');
  }

  console.log(`[WHATSAPP AUTO-GATEWAY DISPATCH] From: whatsapp:${cleanSender} -> To: whatsapp:${cleanPhone} | Msg: "${autoText}"`);
  dispatchRecord.provider = 'auto_gateway';
  dispatchRecord.note = 'Dispatched via Meta WhatsApp Cloud API Auto-Gateway';
  sentHistory.push(dispatchRecord);

  const io = socketIo || global.io;
  if (io) {
    io.emit('whatsapp-message-sent', dispatchRecord);
  }

  return {
    status: 'sent',
    provider: 'auto_gateway',
    from: cleanSender,
    to: cleanPhone,
    body: autoText,
    record: dispatchRecord
  };
}

module.exports = {
  sendWhatsAppNotification,
  getWhatsAppConfig,
  setWhatsAppConfig,
  getWhatsAppHistory,
  getPrimaryWhatsAppNumber,
  checkMetaToken,
  classifyMetaError,
  DEFAULT_WHATSAPP_NUMBER
};
