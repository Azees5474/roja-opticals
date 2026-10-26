const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { requireOwner } = require('../middleware/authorization');
const { validateWhatsAppUrlInput, isValidId } = require('../middleware/validation');
const { buildWhatsAppUrl, getMessage } = require('../lib/whatsapp');
const { syncToSheets } = require('../lib/sheetsSync');
const { runNow } = require('../lib/whatsappScheduler');

const WHATSAPP_SETTINGS_ID = '00000000-0000-0000-0000-000000000001';

// GET /api/whatsapp/settings
router.get('/settings', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('whatsapp_settings')
      .select('*')
      .eq('id', WHATSAPP_SETTINGS_ID)
      .single();

    if (error || !data) {
      return res.json({
        id: WHATSAPP_SETTINGS_ID,
        enabled: true,
        welcome_message: true,
        review_30day: true,
        checkup_180day: true,
        next_visit_reminder: true,
        glasses_ready: true,
        payment_reminder: false,
      });
    }

    res.json(data);
  } catch (err) {
    console.error('[WhatsApp API] GET settings exception:', err.message);
    res.status(500).json({ message: 'Unable to retrieve WhatsApp settings.' });
  }
});

// PUT /api/whatsapp/settings — Owner-only configuration
router.put('/settings', requireOwner, async (req, res) => {
  const {
    enabled, welcome_message, review_30day, checkup_180day,
    next_visit_reminder, glasses_ready, payment_reminder,
  } = req.body;

  const updates = { updated_at: new Date().toISOString() };
  if (enabled !== undefined) updates.enabled = Boolean(enabled);
  if (welcome_message !== undefined) updates.welcome_message = Boolean(welcome_message);
  if (review_30day !== undefined) updates.review_30day = Boolean(review_30day);
  if (checkup_180day !== undefined) updates.checkup_180day = Boolean(checkup_180day);
  if (next_visit_reminder !== undefined) updates.next_visit_reminder = Boolean(next_visit_reminder);
  if (glasses_ready !== undefined) updates.glasses_ready = Boolean(glasses_ready);
  if (payment_reminder !== undefined) updates.payment_reminder = Boolean(payment_reminder);

  try {
    const { data, error } = await supabase
      .from('whatsapp_settings')
      .update(updates)
      .eq('id', WHATSAPP_SETTINGS_ID)
      .select()
      .single();

    if (error || !data) {
      console.error('[WhatsApp API] PUT settings error:', error?.message);
      return res.status(500).json({ message: 'Unable to update WhatsApp settings.' });
    }

    res.json(data);
  } catch (err) {
    console.error('[WhatsApp API] PUT settings exception:', err.message);
    res.status(500).json({ message: 'Unable to update WhatsApp settings.' });
  }
});

// POST /api/whatsapp/url — generate WhatsApp click URL
router.post('/url', validateWhatsAppUrlInput, async (req, res) => {
  const { phone, message_type, customer_name, followup_id, title, description } = req.body;

  try {
    const message = getMessage(message_type, customer_name, title, description);
    const url = buildWhatsAppUrl(phone, message);

    // Record that a click-to-chat link was generated (not sent by server)
    const { data: msgLog } = await supabase.from('whatsapp_messages').insert([{
      followup_id: followup_id && isValidId(followup_id) ? followup_id : null,
      customer_name: customer_name.trim(),
      phone: phone.trim(),
      message_type: message_type.trim(),
      message_text: message,
      message_status: 'link_generated',
      generated_at: new Date().toISOString(),
    }]).select().single();

    if (msgLog) {
      syncToSheets('whatsapp', msgLog.id, msgLog).catch(() => {});
    }

    if (followup_id && isValidId(followup_id)) {
      await supabase.from('followups').update({ whatsapp_sent: false, link_generated: true }).eq('id', followup_id);
    }

    res.json({ url, message });
  } catch (err) {
    console.error('[WhatsApp API] POST url exception:', err.message);
    res.status(500).json({ message: 'Unable to generate WhatsApp URL.' });
  }
});

// GET /api/whatsapp/messages
router.get('/messages', async (req, res) => {
  const { customer_id, message_type, limit = 100 } = req.query;

  try {
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    let query = supabase
      .from('whatsapp_messages')
      .select('*')
      .order('sent_at', { ascending: false })
      .limit(parsedLimit);

    if (customer_id && isValidId(customer_id)) {
      query = query.eq('customer_id', customer_id);
    }

    if (message_type && typeof message_type === 'string') {
      query = query.eq('message_type', message_type.trim());
    }

    const { data, error } = await query;
    if (error) {
      console.error('[WhatsApp API] GET messages error:', error.message);
      return res.status(500).json({ message: 'Unable to retrieve messages.' });
    }

    res.json(data || []);
  } catch (err) {
    console.error('[WhatsApp API] GET messages exception:', err.message);
    res.status(500).json({ message: 'Unable to retrieve messages.' });
  }
});

// POST /api/whatsapp/run-now — Owner-only trigger
router.post('/run-now', requireOwner, async (_req, res) => {
  try {
    console.log('[WhatsApp API] Manual scheduler run requested by owner.');
    runNow().catch(err => console.error('[WhatsApp API] Scheduler execution warning:', err.message));
    res.json({
      message: 'WhatsApp scheduler triggered successfully',
      status: 'processing',
    });
  } catch (err) {
    console.error('[WhatsApp API] run-now exception:', err.message);
    res.status(500).json({ message: 'Unable to trigger WhatsApp scheduler.' });
  }
});

// GET /api/whatsapp/status
router.get('/status', async (_req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { count: pendingCount } = await supabase
      .from('followups')
      .select('*', { count: 'exact', head: true })
      .lte('due_date', today)
      .in('status', ['Pending', 'Due'])
      .eq('whatsapp_sent', false)
      .eq('auto_generated', true);

    const { count: sentCount } = await supabase
      .from('whatsapp_messages')
      .select('*', { count: 'exact', head: true });

    const { count: todayCount } = await supabase
      .from('whatsapp_messages')
      .select('*', { count: 'exact', head: true })
      .gte('sent_at', today);

    const { data: settings } = await supabase
      .from('whatsapp_settings')
      .select('enabled, review_30day, checkup_180day')
      .eq('id', WHATSAPP_SETTINGS_ID)
      .single();

    res.json({
      scheduler: {
        active: process.env.DISABLE_SCHEDULER !== 'true',
        schedule: '0 9 * * *',
        timezone: 'Asia/Kolkata',
        nextRun: 'Daily at 9:00 AM IST',
      },
      settings: settings || { enabled: true, review_30day: true, checkup_180day: true },
      stats: {
        pendingFollowups: pendingCount || 0,
        totalMessagesSent: sentCount || 0,
        messagesSentToday: todayCount || 0,
      },
      status: 'operational',
      method: process.env.USE_TWILIO === 'true' ? 'Twilio WhatsApp API' : 'Free (wa.me API)',
    });
  } catch (err) {
    console.error('[WhatsApp API] status exception:', err.message);
    res.status(500).json({ message: 'Unable to retrieve status.' });
  }
});

module.exports = router;
