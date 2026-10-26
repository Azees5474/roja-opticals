const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { requireOwner } = require('../middleware/authorization');
const { validateIdParam, validateCustomerInput, isValidDate } = require('../middleware/validation');
const { logCustomer } = require('../lib/sheets');
const { syncToSheets } = require('../lib/sheetsSync');
const { getCustomerFollowupSummary, setNextVisitDate } = require('../lib/autoFollowup');
const { sendWelcomeMessage } = require('../lib/whatsapp');

// GET /api/customers
router.get('/', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Customers API] GET error:', error.message);
      return res.status(500).json({ message: 'Unable to retrieve customers.' });
    }
    res.json(data || []);
  } catch (err) {
    console.error('[Customers API] Unexpected error in GET /:', err.message);
    res.status(500).json({ message: 'Unable to retrieve customers.' });
  }
});

// GET /api/customers/:id
router.get('/:id', validateIdParam('id'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !data) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    res.json(data);
  } catch (err) {
    console.error(`[Customers API] GET /${req.params.id} error:`, err.message);
    res.status(500).json({ message: 'Unable to retrieve customer details.' });
  }
});

// GET /api/customers/:id/followup-summary
router.get('/:id/followup-summary', validateIdParam('id'), async (req, res) => {
  try {
    const { data, error } = await getCustomerFollowupSummary(req.params.id);
    if (error || !data) {
      return res.status(404).json({ message: 'Follow-up summary not found for this customer.' });
    }
    res.json(data);
  } catch (err) {
    console.error(`[Customers API] Followup summary error:`, err.message);
    res.status(500).json({ message: 'Unable to retrieve follow-up summary.' });
  }
});

// POST /api/customers
router.post('/', validateCustomerInput(false), async (req, res) => {
  const { name, phone, email, age } = req.body;

  try {
    const cleanCustomer = {
      name: name.trim(),
      phone: phone.trim(),
      email: email && typeof email === 'string' ? email.trim() : null,
      age: age != null && age !== '' ? parseInt(age, 10) : null,
      whatsapp_reminders: true,
      last_purchase_date: null,
      next_visit_date: null,
    };

    const { data, error } = await supabase
      .from('customers')
      .insert([cleanCustomer])
      .select()
      .single();

    if (error || !data) {
      console.error('[Customers API] Create customer error:', error?.message);
      return res.status(500).json({ message: 'Unable to create customer record.' });
    }

    // Google Sheets sync (non-blocking)
    try {
      await logCustomer(data);
      syncToSheets('customer', data.id, data).catch(() => {});
    } catch {}

    // Create automatic 30-day and 180-day follow-ups
    const today = new Date();
    const date30 = new Date(today);
    date30.setDate(date30.getDate() + 30);
    const date180 = new Date(today);
    date180.setDate(date180.getDate() + 180);

    const followups = [
      {
        customer_id: data.id,
        type: '30day',
        title: '30-Day Review',
        description: 'Check if customer is comfortable with glasses',
        due_date: date30.toISOString().slice(0, 10),
        priority: 'Medium',
        status: 'Pending',
        done: false,
        auto_generated: true,
        reminder_key: `30day_${data.id}`,
        whatsapp_sent: false,
      },
      {
        customer_id: data.id,
        type: '180day',
        title: '180-Day Eye Checkup',
        description: 'Remind customer about next eye checkup',
        due_date: date180.toISOString().slice(0, 10),
        priority: 'Medium',
        status: 'Pending',
        done: false,
        auto_generated: true,
        reminder_key: `180day_${data.id}`,
        whatsapp_sent: false,
      },
    ];

    try {
      await supabase.from('followups').insert(followups);
    } catch (err) {
      console.warn('[Customers API] Failed to schedule initial followups:', err.message);
    }

    // Check if welcome messages are enabled
    let welcomeEnabled = true;
    try {
      const { data: settings } = await supabase
        .from('whatsapp_settings')
        .select('enabled, welcome_message')
        .eq('id', '00000000-0000-0000-0000-000000000001')
        .single();

      if (settings) {
        welcomeEnabled = settings.enabled && (settings.welcome_message !== false);
      }
    } catch {}

    // Send or prepare welcome message
    let welcomeMessageResult = null;
    if (data.phone && data.whatsapp_reminders !== false && welcomeEnabled) {
      try {
        welcomeMessageResult = await sendWelcomeMessage(data);
        if (welcomeMessageResult && welcomeMessageResult.success) {
          const messageStatus = welcomeMessageResult.method === 'twilio' ? 'sent' : 'pending';
          await supabase.from('whatsapp_messages').insert([{
            customer_id: data.id,
            customer_name: data.name,
            phone: data.phone,
            message_type: 'welcome',
            message_text: welcomeMessageResult.message,
            message_status: messageStatus,
            provider_message_id: welcomeMessageResult.messageId || null,
            sent_at: new Date().toISOString(),
          }]);
        }
      } catch (waErr) {
        console.warn('[Customers API] Welcome message preparation skipped:', waErr.message);
      }
    }

    res.status(201).json({
      ...data,
      welcomeMessage: welcomeMessageResult,
    });
  } catch (err) {
    console.error('[Customers API] POST / error:', err.message);
    res.status(500).json({ message: 'Unable to create customer.' });
  }
});

// PUT /api/customers/:id
router.put('/:id', validateIdParam('id'), validateCustomerInput(true), async (req, res) => {
  const { name, phone, email, age, next_visit_date, whatsapp_reminders } = req.body;

  try {
    // Check existence first
    const { data: existing } = await supabase.from('customers').select('id').eq('id', req.params.id).single();
    if (!existing) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (phone !== undefined) updates.phone = phone.trim();
    if (email !== undefined) updates.email = email && typeof email === 'string' ? email.trim() : null;
    if (age !== undefined) updates.age = age != null && age !== '' ? parseInt(age, 10) : null;
    if (next_visit_date !== undefined) updates.next_visit_date = next_visit_date || null;
    if (whatsapp_reminders !== undefined) updates.whatsapp_reminders = Boolean(whatsapp_reminders);

    const { data, error } = await supabase
      .from('customers')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error || !data) {
      console.error('[Customers API] Update error:', error?.message);
      return res.status(500).json({ message: 'Unable to update customer.' });
    }

    syncToSheets('customer', data.id, data).catch(() => {});
    res.json(data);
  } catch (err) {
    console.error('[Customers API] PUT /:id error:', err.message);
    res.status(500).json({ message: 'Unable to update customer.' });
  }
});

// PATCH /api/customers/:id/next-visit
router.patch('/:id/next-visit', validateIdParam('id'), async (req, res) => {
  const { next_visit_date } = req.body;
  if (next_visit_date !== null && next_visit_date !== undefined && next_visit_date !== '') {
    if (!isValidDate(next_visit_date)) {
      return res.status(400).json({ message: 'next_visit_date must be a valid date in YYYY-MM-DD format.' });
    }
  }

  try {
    const { data, error } = await setNextVisitDate(req.params.id, next_visit_date);
    if (error || !data) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    syncToSheets('customer', data.id, data).catch(() => {});
    res.json(data);
  } catch (err) {
    console.error('[Customers API] PATCH next-visit error:', err.message);
    res.status(500).json({ message: 'Unable to update next visit date.' });
  }
});

// PATCH /api/customers/:id/whatsapp-reminders
router.patch('/:id/whatsapp-reminders', validateIdParam('id'), async (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ message: 'enabled must be a boolean' });
  }

  try {
    const { data: existing } = await supabase.from('customers').select('id').eq('id', req.params.id).single();
    if (!existing) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    const { data, error } = await supabase
      .from('customers')
      .update({ whatsapp_reminders: enabled })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error || !data) {
      return res.status(500).json({ message: 'Unable to update WhatsApp preferences.' });
    }
    res.json(data);
  } catch (err) {
    console.error('[Customers API] PATCH whatsapp-reminders error:', err.message);
    res.status(500).json({ message: 'Unable to update WhatsApp preferences.' });
  }
});

// DELETE /api/customers/:id — Owner-only destructive action
router.delete('/:id', requireOwner, validateIdParam('id'), async (req, res) => {
  try {
    const { data: existing } = await supabase.from('customers').select('id').eq('id', req.params.id).single();
    if (!existing) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    // Cascade delete related records to protect privacy and prevent orphaned data
    await supabase.from('followups').delete().eq('customer_id', req.params.id);
    await supabase.from('whatsapp_messages').delete().eq('customer_id', req.params.id);
    await supabase.from('prescriptions').delete().eq('customer_id', req.params.id);

    const { error } = await supabase.from('customers').delete().eq('id', req.params.id);
    if (error) {
      console.error('[Customers API] DELETE error:', error.message);
      return res.status(500).json({ message: 'Unable to delete customer.' });
    }

    res.json({ message: 'Customer deleted successfully' });
  } catch (err) {
    console.error('[Customers API] DELETE exception:', err.message);
    res.status(500).json({ message: 'Unable to delete customer.' });
  }
});

module.exports = router;
