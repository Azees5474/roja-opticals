/**
 * whatsappScheduler.js
 * ──────────────────────────────────────────────────────────
 * Automated WhatsApp message scheduler for follow-ups.
 * 
 * Features:
 * - Runs daily to check for due follow-ups (30-day and 180-day)
 * - Automatically sends WhatsApp messages using free click-to-chat API
 * - Logs all messages in whatsapp_messages table
 * - Marks followups as whatsapp_sent
 * - Respects global and per-customer WhatsApp preferences
 * 
 * Free Method:
 * - Uses WhatsApp's wa.me API (no cost, no API key needed)
 * - Messages are sent as click-to-chat links that auto-open WhatsApp
 * - For true automation, you can integrate with services like:
 *   - Twilio WhatsApp API (paid)
 *   - WhatsApp Business API (paid)
 *   - Open-source solutions like Baileys (requires setup)
 * 
 * For now: This creates the message records and wa.me URLs.
 * You can manually send them or integrate a free service.
 */

const cron = require('node-cron');
const supabase = require('./supabase');
const { getMessage, buildWhatsAppUrl } = require('./whatsapp');
const { sendTwilioWhatsAppMessage, isTwilioEnabled } = require('./twilioWhatsApp');

// ── Configuration ─────────────────────────────────────────
const CRON_SCHEDULE = '0 9 * * *'; // Run daily at 9:00 AM
const DRY_RUN = false; // Set to true for testing without sending
const USE_TWILIO = process.env.USE_TWILIO === 'true'; // Enable Twilio via env var

// ── Get WhatsApp global settings ─────────────────────────
async function getWhatsAppSettings() {
  const { data, error } = await supabase
    .from('whatsapp_settings')
    .select('*')
    .eq('id', '00000000-0000-0000-0000-000000000001')
    .single();

  if (error || !data) {
    // Default settings if not found
    return {
      enabled: true,
      review_30day: true,
      checkup_180day: true,
    };
  }

  return data;
}

// ── Get due follow-ups that need WhatsApp messages ────────
async function getDueFollowups() {
  const today = new Date().toISOString().slice(0, 10);

  // Get follow-ups that are:
  // 1. Due today or overdue
  // 2. Status is Pending or Due
  // 3. Not yet sent via WhatsApp
  // 4. Auto-generated (30-day or 180-day)
  const { data, error } = await supabase
    .from('followups')
    .select(`
      *,
      customers (
        id,
        name,
        phone,
        whatsapp_reminders
      )
    `)
    .lte('due_date', today)
    .in('status', ['Pending', 'Due'])
    .eq('whatsapp_sent', false)
    .eq('auto_generated', true)
    .order('due_date', { ascending: true });

  if (error) {
    console.error('[WhatsApp Scheduler] Error fetching due follow-ups:', error.message);
    return [];
  }

  return data || [];
}

// ── Determine message type from follow-up type ────────────
function getMessageType(followupType) {
  if (followupType.includes('30') || followupType.toLowerCase().includes('review')) {
    return '30day';
  }
  if (followupType.includes('180') || followupType.toLowerCase().includes('checkup')) {
    return '180day';
  }
  return 'custom';
}

// ── Send WhatsApp message (via wa.me URL) ─────────────────
async function sendWhatsAppMessage(followup, customer, messageType) {
  try {
    // Generate message content
    const messageText = getMessage(messageType, customer.name);
    const whatsappUrl = buildWhatsAppUrl(customer.phone, messageText);

    // Log message in database
    const { data: messageRecord, error: insertError } = await supabase
      .from('whatsapp_messages')
      .insert([{
        followup_id: followup.id,
        customer_id: customer.id,
        customer_name: customer.name,
        phone: customer.phone,
        message_type: messageType,
        message_text: messageText,
        message_status: 'pending', // Will be 'sent' when clicked
        sent_at: new Date().toISOString(),
      }])
      .select()
      .single();

    if (insertError) {
      console.error(`[WhatsApp] Failed to log message for ${customer.name}:`, insertError.message);
      return { success: false, error: insertError.message };
    }

    // Mark follow-up as WhatsApp sent
    await supabase
      .from('followups')
      .update({ 
        whatsapp_sent: true,
        status: 'Due', // Update status to Due
      })
      .eq('id', followup.id);

    console.log(`[WhatsApp Scheduler] Follow-up processed for record: ${followup.id} (Type: ${messageType})`);

    return {
      success: true,
      messageId: messageRecord.id,
      url: whatsappUrl,
      messageText,
    };
  } catch (err) {
    console.error(`[WhatsApp Scheduler] Error processing follow-up ${followup.id}:`, err.message);
    
    // Log failed message
    await supabase
      .from('whatsapp_messages')
      .insert([{
        followup_id: followup.id,
        customer_id: customer.id,
        customer_name: customer.name,
        phone: customer.phone,
        message_type: messageType,
        message_text: getMessage(messageType, customer.name),
        message_status: 'failed',
        error: err.message,
        sent_at: new Date().toISOString(),
      }]);

    return { success: false, error: err.message };
  }
}

// ── Main scheduler job ────────────────────────────────────
async function processFollowups() {
  console.log('\n[WhatsApp Scheduler] Starting daily follow-up check...');
  console.log('[WhatsApp Scheduler] Time:', new Date().toISOString());

  try {
    // Check if WhatsApp reminders are enabled globally
    const settings = await getWhatsAppSettings();
    
    if (!settings.enabled) {
      console.log('[WhatsApp Scheduler] WhatsApp reminders are disabled globally. Skipping.');
      return;
    }

    // Get all due follow-ups
    const followups = await getDueFollowups();
    console.log(`[WhatsApp Scheduler] Found ${followups.length} due follow-ups`);

    if (followups.length === 0) {
      console.log('[WhatsApp Scheduler] No follow-ups to process.');
      return;
    }

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const followup of followups) {
      const customer = followup.customers;

      if (!customer) {
        console.log(`[WhatsApp] Skipping followup ${followup.id}: No customer data`);
        skipped++;
        continue;
      }

      // Check if customer has WhatsApp reminders enabled
      if (customer.whatsapp_reminders === false) {
        console.log(`[WhatsApp] Skipping ${customer.name}: WhatsApp reminders disabled`);
        skipped++;
        continue;
      }

      // Check if phone number exists
      if (!customer.phone) {
        console.log(`[WhatsApp] Skipping ${customer.name}: No phone number`);
        skipped++;
        continue;
      }

      // Determine message type
      const messageType = getMessageType(followup.type);

      // Check if this message type is enabled in settings
      if (messageType === '30day' && !settings.review_30day) {
        console.log(`[WhatsApp] Skipping ${customer.name}: 30-day reviews disabled`);
        skipped++;
        continue;
      }

      if (messageType === '180day' && !settings.checkup_180day) {
        console.log(`[WhatsApp] Skipping ${customer.name}: 180-day checkups disabled`);
        skipped++;
        continue;
      }

      // Send the message (or prepare it in dry-run mode)
      if (DRY_RUN) {
        console.log(`[WhatsApp] DRY RUN: Would send ${messageType} to ${customer.name} (${customer.phone})`);
        sent++;
      } else {
        const result = await sendWhatsAppMessage(followup, customer, messageType);
        if (result.success) {
          sent++;
        } else {
          failed++;
        }
      }

      // Small delay to avoid rate limiting (if using real API in future)
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('\n[WhatsApp Scheduler] Summary:');
    console.log(`  ✓ Sent: ${sent}`);
    console.log(`  ⊘ Skipped: ${skipped}`);
    console.log(`  ✗ Failed: ${failed}`);
    console.log('[WhatsApp Scheduler] Completed.\n');

  } catch (error) {
    console.error('[WhatsApp Scheduler] Fatal error:', error);
  }
}

// ── Start the scheduler ───────────────────────────────────
function startScheduler() {
  console.log('[WhatsApp Scheduler] Initializing...');
  console.log(`[WhatsApp Scheduler] Schedule: ${CRON_SCHEDULE} (Daily at 9:00 AM)`);
  console.log(`[WhatsApp Scheduler] Dry Run: ${DRY_RUN}`);

  // Schedule the cron job
  cron.schedule(CRON_SCHEDULE, processFollowups, {
    timezone: 'Asia/Kolkata' // Adjust to your timezone
  });

  console.log('[WhatsApp Scheduler] Started successfully!\n');
}

// ── Manual trigger (for testing) ──────────────────────────
async function runNow() {
  console.log('[WhatsApp Scheduler] Manual trigger activated');
  await processFollowups();
}

module.exports = {
  startScheduler,
  runNow,
  processFollowups,
};
