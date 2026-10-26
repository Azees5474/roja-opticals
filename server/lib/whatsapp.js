function buildWelcomeMessage(name, shop = {}) {
  const shopName = shop?.name || 'Roja Opticals';
  const contactLines = [];
  if (shop?.address) contactLines.push(`Address: ${shop.address}`);
  if (shop?.phone) contactLines.push(`Phone: ${shop.phone}`);
  if (shop?.email) contactLines.push(`Email: ${shop.email}`);

  const contactSection = contactLines.length > 0 ? `\n\n${contactLines.join('\n')}` : '';

  return (
    `Hello ${name}, Welcome to ${shopName}! 👓\n\n` +
    `Thank you for choosing us for your eye care needs.\n\n` +
    `We are committed to providing you with the best quality eyewear and exceptional service.\n\n` +
    `Feel free to contact us anytime for assistance or to book an appointment.` +
    contactSection +
    `\n\nWe look forward to serving you!\n\n` +
    `Best regards,\n${shopName}`
  );
}

// ── WhatsApp message templates ────────────────────────────
const TEMPLATES = {
  'welcome': (name, shop) => buildWelcomeMessage(name, shop),

  '30day': (name) =>
    `Hello ${name}, this is Roja Opticals.\n\nIt has been 30 days since your recent purchase. We hope you are comfortable with your new glasses.\n\nIf you are experiencing any discomfort or have any issues, please contact us or visit Roja Opticals.\n\nThank you!\nRoja Opticals`,

  '180day': (name) =>
    `Hello ${name}, this is Roja Opticals.\n\nIt has been around 6 months since your last visit. This is a friendly reminder to schedule your next eye checkup.\n\nPlease contact Roja Opticals to book your visit.\n\nThank you!\nRoja Opticals`,

  'glasses_ready': (name) =>
    `Hello ${name}, this is Roja Opticals.\n\nYour glasses are ready for collection.\n\nPlease visit our shop at your convenience.\n\nThank you!\nRoja Opticals`,

  'payment': (name) =>
    `Hello ${name}, this is Roja Opticals.\n\nThis is a friendly reminder that you have a pending payment with us.\n\nPlease contact us at your earliest convenience.\n\nThank you!\nRoja Opticals`,

  'next_visit': (name) =>
    `Hello ${name}, this is Roja Opticals.\n\nThis is a reminder about your upcoming visit to our shop.\n\nPlease let us know if you need to reschedule.\n\nThank you!\nRoja Opticals`,

  'custom': (name, title, description) =>
    `Hello ${name}, this is Roja Opticals.\n\n${description || title}\n\nThank you!\nRoja Opticals`,
}

// Generate WhatsApp click-to-chat URL
function buildWhatsAppUrl(phone, message) {
  // Clean phone number — remove spaces, dashes, +
  const cleanPhone = phone.replace(/[\s\-\(\)]/g, '')
  // Add country code if missing (India = 91)
  const fullPhone = cleanPhone.startsWith('+')
    ? cleanPhone.replace('+', '')
    : cleanPhone.startsWith('91') && cleanPhone.length === 12
      ? cleanPhone
      : `91${cleanPhone}`
  const encoded = encodeURIComponent(message)
  return `https://wa.me/${fullPhone}?text=${encoded}`
}

function getMessage(type, name, title, description, shop) {
  const fn = TEMPLATES[type] || TEMPLATES['custom']
  if (type === 'custom') return fn(name, title, description)
  if (type === 'welcome') return fn(name, shop)
  return fn(name)
}

/**
 * Send a welcome message to a new customer
 * Supports both Twilio (automatic) and wa.me (manual) methods
 * @param {Object} customer - Customer object with id, name, phone
 * @param {Object} [shop] - Optional shop settings { name, address, phone, email }
 * @returns {Object} - { success, messageId, url, error, method }
 */
async function sendWelcomeMessage(customer, shop = null) {
  if (!customer.phone) {
    return { success: false, error: 'No phone number provided' }
  }

  try {
    let shopInfo = shop;
    if (!shopInfo) {
      try {
        const localDb = require('./localDb');
        const shopRes = await localDb.readLocal('shop_settings', '00000000-0000-0000-0000-000000000002');
        if (shopRes.success && shopRes.data?.shop) {
          shopInfo = shopRes.data.shop;
        }
      } catch {}
    }

    const message = getMessage('welcome', customer.name, null, null, shopInfo)
    
    // Check if Twilio is enabled
    const USE_TWILIO = process.env.USE_TWILIO === 'true'
    
    if (USE_TWILIO) {
      // Try to use Twilio for automatic sending
      try {
        const { sendTwilioWhatsAppMessage, isTwilioEnabled } = require('./twilioWhatsApp')
        
        if (isTwilioEnabled()) {
          console.log(`[Welcome] Using Twilio API for ${customer.name}`)
          const twilioResult = await sendTwilioWhatsAppMessage(customer.phone, message, customer.name)
          
          if (twilioResult.success) {
            return {
              success: true,
              message,
              phone: customer.phone,
              customerName: customer.name,
              method: 'twilio',
              messageId: twilioResult.messageId,
              status: twilioResult.status,
            }
          } else {
            console.warn(`[Welcome] Twilio failed, falling back to wa.me: ${twilioResult.error}`)
          }
        }
      } catch (err) {
        console.warn(`[Welcome] Twilio error, falling back to wa.me: ${err.message}`)
      }
    }
    
    // Fallback to free wa.me method
    const url = buildWhatsAppUrl(customer.phone, message)
    console.log(`[Welcome] Using wa.me URL for ${customer.name}`)
    
    return {
      success: true,
      url,
      message,
      phone: customer.phone,
      customerName: customer.name,
      method: 'wa.me',
    }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

module.exports = { buildWhatsAppUrl, getMessage, sendWelcomeMessage, TEMPLATES }
