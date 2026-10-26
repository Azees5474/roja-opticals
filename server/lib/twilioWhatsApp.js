/**
 * twilioWhatsApp.js
 * ──────────────────────────────────────────────────────────
 * Twilio WhatsApp API Integration
 * 
 * Sends WhatsApp messages automatically using Twilio's API
 * Requires Twilio account and WhatsApp Business approval
 */

const twilio = require('twilio');

// ── Configuration ─────────────────────────────────────────
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';

// Initialize Twilio client
let twilioClient = null;

function initializeTwilio() {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    console.warn('[Twilio] Credentials not configured. Twilio integration disabled.');
    return null;
  }

  try {
    twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    console.log('[Twilio] WhatsApp API initialized successfully');
    return twilioClient;
  } catch (error) {
    console.error('[Twilio] Initialization failed:', error.message);
    return null;
  }
}

/**
 * Check if Twilio is configured and ready
 */
function isTwilioEnabled() {
  return twilioClient !== null && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN;
}

/**
 * Send WhatsApp message via Twilio
 * @param {string} phone - Customer phone number (without country code)
 * @param {string} message - Message text to send
 * @param {string} customerName - Customer name (for logging)
 * @returns {Object} - { success, messageId, status, error }
 */
async function sendTwilioWhatsAppMessage(phone, message, customerName = '') {
  // Check if Twilio is enabled
  if (!isTwilioEnabled()) {
    return {
      success: false,
      error: 'Twilio not configured. Please add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to .env',
      method: 'twilio_disabled'
    };
  }

  try {
    // Format phone number for Twilio
    // Remove spaces, dashes, parentheses
    const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');
    
    // Add country code if missing (India = 91)
    let formattedPhone = cleanPhone;
    if (!cleanPhone.startsWith('+')) {
      if (cleanPhone.startsWith('91') && cleanPhone.length === 12) {
        formattedPhone = `+${cleanPhone}`;
      } else {
        formattedPhone = `+91${cleanPhone}`;
      }
    }

    // Twilio requires 'whatsapp:' prefix
    const toNumber = `whatsapp:${formattedPhone}`;

    console.log(`[Twilio] Sending WhatsApp message to ${customerName} (${toNumber})...`);

    // Send message via Twilio
    const twilioMessage = await twilioClient.messages.create({
      from: TWILIO_WHATSAPP_FROM,
      to: toNumber,
      body: message
    });

    console.log(`[Twilio] ✓ Message sent successfully!`);
    console.log(`[Twilio] Message SID: ${twilioMessage.sid}`);
    console.log(`[Twilio] Status: ${twilioMessage.status}`);

    return {
      success: true,
      messageId: twilioMessage.sid,
      status: twilioMessage.status,
      to: toNumber,
      from: TWILIO_WHATSAPP_FROM,
      method: 'twilio',
      price: twilioMessage.price || null,
      priceUnit: twilioMessage.priceUnit || null,
    };

  } catch (error) {
    console.error(`[Twilio] ✗ Failed to send message:`, error.message);
    
    // Parse Twilio error
    let errorMessage = error.message;
    if (error.code) {
      errorMessage = `Twilio Error ${error.code}: ${error.message}`;
    }

    return {
      success: false,
      error: errorMessage,
      errorCode: error.code || null,
      method: 'twilio',
    };
  }
}

/**
 * Send bulk messages (for scheduler)
 * @param {Array} messages - Array of { phone, message, customerName }
 * @returns {Object} - { sent, failed, results }
 */
async function sendBulkMessages(messages) {
  if (!isTwilioEnabled()) {
    console.warn('[Twilio] Bulk send skipped - Twilio not configured');
    return {
      sent: 0,
      failed: messages.length,
      skipped: messages.length,
      results: messages.map(m => ({
        phone: m.phone,
        success: false,
        error: 'Twilio not configured'
      }))
    };
  }

  console.log(`[Twilio] Sending ${messages.length} messages...`);

  const results = [];
  let sent = 0;
  let failed = 0;

  for (const msg of messages) {
    const result = await sendTwilioWhatsAppMessage(msg.phone, msg.message, msg.customerName);
    results.push({
      phone: msg.phone,
      customerName: msg.customerName,
      ...result
    });

    if (result.success) {
      sent++;
    } else {
      failed++;
    }

    // Small delay to avoid rate limiting (50 messages/sec limit)
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  console.log(`[Twilio] Bulk send complete: ${sent} sent, ${failed} failed`);

  return {
    sent,
    failed,
    total: messages.length,
    results
  };
}

/**
 * Get Twilio account info (for testing)
 */
async function getTwilioAccountInfo() {
  if (!isTwilioEnabled()) {
    return { enabled: false, error: 'Twilio not configured' };
  }

  try {
    const account = await twilioClient.api.accounts(TWILIO_ACCOUNT_SID).fetch();
    return {
      enabled: true,
      accountSid: account.sid,
      accountName: account.friendlyName,
      status: account.status,
      type: account.type,
      whatsappFrom: TWILIO_WHATSAPP_FROM,
    };
  } catch (error) {
    return {
      enabled: false,
      error: error.message
    };
  }
}

// Initialize on module load
initializeTwilio();

module.exports = {
  sendTwilioWhatsAppMessage,
  sendBulkMessages,
  isTwilioEnabled,
  getTwilioAccountInfo,
  initializeTwilio,
};
