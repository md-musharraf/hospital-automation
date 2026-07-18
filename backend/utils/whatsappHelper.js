let twilio;
try {
  twilio = require('twilio');
} catch (e) {
  // twilio package not installed locally, will use console simulation fallback
}

/**
 * Sends a WhatsApp notification to a patient.
 * If Twilio credentials are provided in env, sends a real WhatsApp message.
 * Otherwise, logs a simulated message in the console.
 * 
 * @param {string} phone Patient's phone number
 * @param {string} message Message body
 * @returns {Promise<object>} Status of the notification dispatch
 */
async function sendWhatsAppNotification(phone, message) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromWhatsApp = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886'; // default Twilio sandbox number

  // Normalize phone number (ensure + prefix)
  let cleanPhone = phone ? phone.trim() : '';
  if (cleanPhone && !cleanPhone.startsWith('+')) {
    cleanPhone = `+${cleanPhone}`;
  }

  if (accountSid && authToken && twilio && cleanPhone) {
    try {
      const client = twilio(accountSid, authToken);
      const res = await client.messages.create({
        body: message,
        from: fromWhatsApp.startsWith('whatsapp:') ? fromWhatsApp : `whatsapp:${fromWhatsApp}`,
        to: `whatsapp:${cleanPhone}`
      });
      console.log(`[REAL WHATSAPP SENT] Twilio SID: ${res.sid} to ${cleanPhone}`);
      return { status: 'sent', provider: 'twilio', sid: res.sid };
    } catch (err) {
      console.error('[REAL WHATSAPP FAILED] Twilio error:', err.message);
    }
  }

  // Simulation Fallback
  console.log(`[SIMULATED WHATSAPP SENT] To: whatsapp:${cleanPhone} | Msg: "${message}"`);
  return { status: 'simulated', to: cleanPhone, body: message };
}

module.exports = {
  sendWhatsAppNotification
};
