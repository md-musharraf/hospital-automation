import logger from './logger';

const log = logger.child({ module: 'whatsapp' });

// Single source of truth for the hospital's public WhatsApp number.
export const DEFAULT_WHATSAPP_NUMBER =
  process.env.META_DISPLAY_NUMBER || process.env.TWILIO_WHATSAPP_NUMBER || '+917484043690';

export interface DynamicWhatsAppConfig {
  whatsappNumber: string;
  isAutoWorking: boolean;
  activeTriggers: string[];
}

// In-Memory Dynamic Config Store for WhatsApp API Engine
const dynamicConfig: DynamicWhatsAppConfig = {
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

export interface DispatchRecord {
  id: string;
  timestamp: string;
  from: string;
  to: string;
  message: string;
  options?: any[];
  status: string;
  provider: string;
  sid?: string;
  note?: string;
  metaError?: string;
  metaErrorCode?: number;
  metaErrorSubcode?: number;
  metaErrorClass?: string;
  [key: string]: any;
}

// Outgoing message audit history log
const sentHistory: DispatchRecord[] = [];

/**
 * Gets current active WhatsApp API configuration and engine status
 */
export function getWhatsAppConfig(): Record<string, any> {
  const metaToken = process.env.META_WHATSAPP_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
  const metaPhoneId = process.env.META_PHONE_NUMBER_ID;
  const hasMeta = Boolean(metaToken && metaPhoneId && !metaToken.includes('your_meta_access_token'));

  return {
    whatsappNumber: dynamicConfig.whatsappNumber,
    isAutoWorking: dynamicConfig.isAutoWorking,
    activeTriggers: dynamicConfig.activeTriggers,
    providerMode: hasMeta ? 'Meta WhatsApp Cloud API' : 'Auto-Gateway (API Number Active)',
    hasCredentials: hasMeta,
    hasMeta,
    totalSentCount: sentHistory.length
  };
}

/**
 * Updates WhatsApp API Sender Number and auto-activates engine
 */
export function setWhatsAppConfig(config?: Partial<DynamicWhatsAppConfig>): Record<string, any> {
  if (config && config.whatsappNumber) {
    let cleanNum = config.whatsappNumber.replace(/^whatsapp:/i, '').trim();
    if (cleanNum && !cleanNum.startsWith('+')) {
      cleanNum = `+${cleanNum}`;
    }
    dynamicConfig.whatsappNumber = cleanNum;
  }
  if (config && typeof config.isAutoWorking === 'boolean') {
    dynamicConfig.isAutoWorking = config.isAutoWorking;
  } else {
    dynamicConfig.isAutoWorking = true;
  }
  return getWhatsAppConfig();
}

/**
 * Returns recent dispatched WhatsApp message audit log
 */
export function getWhatsAppHistory(limit: number = 20): DispatchRecord[] {
  return sentHistory.slice(-limit).reverse();
}

/**
 * The one canonical public WhatsApp number, normalised (no `whatsapp:` prefix).
 */
export function getPrimaryWhatsAppNumber(): string {
  return (dynamicConfig.whatsappNumber || DEFAULT_WHATSAPP_NUMBER).replace(/^whatsapp:/i, '');
}

/**
 * Maps a Meta Graph API error object to a short, actionable classification.
 */
export function classifyMetaError(mErr: Record<string, any> = {}): string {
  if (mErr.code === 190) return 'token_expired_or_invalid';
  if (mErr.code === 200) return 'api_access_blocked';
  if (mErr.code === 10 || mErr.code === 131030) return 'recipient_not_allowlisted';
  if (mErr.code === 131026) return 'message_undeliverable';
  if (mErr.code === 100) return 'invalid_parameter';
  return 'unknown';
}

/**
 * Live health-check of the configured Meta WhatsApp credentials.
 */
export async function checkMetaToken(): Promise<Record<string, any>> {
  const metaToken = process.env.META_WHATSAPP_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
  const metaPhoneId = process.env.META_PHONE_NUMBER_ID;
  if (!metaToken || !metaPhoneId || metaToken.includes('your_meta_access_token')) {
    return {
      ok: false,
      configured: false,
      classification: 'not_configured',
      message: 'Meta credentials are not set (META_WHATSAPP_ACCESS_TOKEN / META_PHONE_NUMBER_ID).'
    };
  }
  try {
    const url = `https://graph.facebook.com/v20.0/${metaPhoneId}?fields=display_phone_number,verified_name,quality_rating,status&access_token=${metaToken}`;
    const fetchFn = (global as any).fetch || require('node-fetch');
    const res = await fetchFn(url);
    const data = await res.json();
    if (res.ok && !data.error) {
      return {
        ok: true,
        configured: true,
        classification: 'healthy',
        displayNumber: data.display_phone_number,
        verifiedName: data.verified_name,
        qualityRating: data.quality_rating,
        numberStatus: data.status,
        message: 'Meta WhatsApp token is valid and the number is reachable.'
      };
    }
    const mErr = data.error || {};
    const classification = classifyMetaError(mErr);
    const hint =
      classification === 'token_expired_or_invalid'
        ? 'Generate a fresh token (prefer a permanent System User token) and update META_WHATSAPP_ACCESS_TOKEN on the server.'
        : classification === 'api_access_blocked'
          ? 'Meta has blocked this app/token API access — check the app for restriction banners and Business verification, or create a new app + token.'
          : 'See the Meta error message for details.';
    return {
      ok: false,
      configured: true,
      classification,
      code: mErr.code,
      subcode: mErr.error_subcode,
      message: mErr.message || 'Unknown Meta error',
      hint
    };
  } catch (err: any) {
    return { ok: false, configured: true, classification: 'network_error', message: err.message };
  }
}

/**
 * Sends a WhatsApp notification to a patient using Meta WhatsApp Cloud API v20.0.
 */
export async function sendWhatsAppNotification(
  phone?: string | null,
  message?: string | null,
  options: any = [],
  socketIo?: any,
  fromPhoneNumberId?: string | null
): Promise<Record<string, any>> {
  if (options && !Array.isArray(options) && typeof options === 'object') {
    socketIo = options;
    options = [];
  }

  const metaToken = process.env.META_WHATSAPP_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
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

  if (!cleanPhone) {
    log.warn('No phone number provided — message not dispatched:', { message });
    return { status: 'skipped', provider: 'none', reason: 'missing_phone' };
  }

  const metaConfigured = Boolean(metaToken && metaPhoneId && !metaToken.includes('your_meta_access_token'));

  const dispatchRecord: DispatchRecord = {
    id: `wa_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    from: cleanSender,
    to: cleanPhone,
    message: message || '',
    options: options || [],
    status: 'sent',
    provider: metaConfigured ? 'meta' : 'auto_gateway'
  };

  // Meta WhatsApp Cloud API Direct Dispatch
  if (metaConfigured && cleanPhone) {
    try {
      const recipientDigits = cleanPhone.replace(/\D/g, '');
      const metaUrl = `https://graph.facebook.com/v20.0/${metaPhoneId}/messages`;

      let payload: any;

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
              buttons: options.map((opt: string, idx: number) => ({
                type: 'reply',
                reply: {
                  id: `btn_${idx + 1}_${opt.substring(0, 10).replace(/\s+/g, '_')}`,
                  title: opt.substring(0, 20)
                }
              }))
            }
          }
        };
      } else if (options && Array.isArray(options) && options.length > 3 && options.length <= 10) {
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
                  rows: options.slice(0, 10).map((opt: string, idx: number) => ({
                    id: `opt_${idx + 1}`,
                    title: opt.substring(0, 24),
                    description: `Option ${idx + 1}`
                  }))
                }
              ]
            }
          }
        };
      } else {
        let fullText = message || '';
        if (options && Array.isArray(options) && options.length > 0) {
          fullText += '\n\n' + options.map((opt: string, idx: number) => `${idx + 1}. ${opt}`).join('\n');
        }
        payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: recipientDigits,
          type: 'text',
          text: { preview_url: false, body: fullText }
        };
      }

      const fetchFn = (global as any).fetch || require('node-fetch');
      const res = await fetchFn(metaUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${metaToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (res.ok && data.messages && data.messages.length > 0) {
        const msgId = data.messages[0].id;
        log.info(`Message ID: ${msgId} to ${cleanPhone}`);
        dispatchRecord.sid = msgId;
        dispatchRecord.provider = 'meta';
        sentHistory.push(dispatchRecord);

        const io = socketIo || (global as any).io;
        if (io) {
          io.emit('whatsapp-message-sent', dispatchRecord);
        }
        return { status: 'sent', provider: 'meta', messageId: msgId, record: dispatchRecord };
      } else {
        const mErr = (data && data.error) || {};
        const errDetail = mErr.message || JSON.stringify(data);
        const classification = classifyMetaError(mErr);
        log.error(
          `code=${mErr.code} subcode=${mErr.error_subcode || '-'} (${classification}): ${errDetail} | Falling back...`
        );
        dispatchRecord.metaError = errDetail;
        dispatchRecord.metaErrorCode = mErr.code;
        dispatchRecord.metaErrorSubcode = mErr.error_subcode;
        dispatchRecord.metaErrorClass = classification;
      }
    } catch (err: any) {
      log.error('Exception:', { error: err.message });
      dispatchRecord.metaError = err.message;
    }
  }

  if (metaConfigured) {
    log.error(`To: ${cleanPhone} | Reason: ${dispatchRecord.metaError || 'unknown'}`);
    dispatchRecord.status = 'failed';
    dispatchRecord.provider = 'meta';
    sentHistory.push(dispatchRecord);

    const failIo = socketIo || (global as any).io;
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

  // Auto-Gateway Mode: Development/Simulation Fallback
  let autoText = message || '';
  if (options && Array.isArray(options) && options.length > 0) {
    autoText += '\n\n' + options.map((opt: string, idx: number) => `${idx + 1}. ${opt}`).join('\n');
  }

  log.info(`From: whatsapp:${cleanSender} -> To: whatsapp:${cleanPhone} | Msg: "${autoText}"`);
  dispatchRecord.provider = 'auto_gateway';
  dispatchRecord.note = 'Dispatched via Meta WhatsApp Cloud API Auto-Gateway';
  sentHistory.push(dispatchRecord);

  const io = socketIo || (global as any).io;
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
