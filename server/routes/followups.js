const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { requireOwner } = require('../middleware/authorization');
const { validateIdParam, validateFollowupInput, validateFollowupStatus, isValidId } = require('../middleware/validation');
const { syncToSheets } = require('../lib/sheetsSync');
const { buildWhatsAppUrl, getMessage } = require('../lib/whatsapp');

// GET /api/followups
router.get('/', async (req, res) => {
  try {
    const { customer_id, status } = req.query;
    let query = supabase
      .from('followups')
      .select('*, customers(name, phone)')
      .order('due_date', { ascending: true });

    if (customer_id) {
      if (typeof customer_id === 'string' && isValidId(customer_id)) {
        query = query.eq('customer_id', customer_id);
      } else {
        return res.status(400).json({ message: 'Invalid customer_id filter' });
      }
    }

    if (status) {
      const validStatuses = new Set(['Pending', 'Due', 'Completed', 'Skipped', 'Cancelled']);
      if (typeof status === 'string' && validStatuses.has(status)) {
        query = query.eq('status', status);
      } else {
        return res.status(400).json({ message: 'Invalid status filter' });
      }
    }

    const { data, error } = await query;
    if (error) {
      console.error('[Followups API] GET error:', error.message);
      return res.status(500).json({ message: 'Unable to retrieve follow-ups.' });
    }

    res.json((data || []).map(f => ({
      ...f,
      customer_name: f.customers?.name || f.customer_name || '',
      phone: f.customers?.phone || f.phone || '',
      customers: undefined,
    })));
  } catch (err) {
    console.error('[Followups API] GET exception:', err.message);
    res.status(500).json({ message: 'Unable to retrieve follow-ups.' });
  }
});

// POST /api/followups
router.post('/', validateFollowupInput, async (req, res) => {
  const {
    customer_id, type, title, description,
    due_date, priority = 'Medium',
    auto_generated = false, reminder_key,
  } = req.body;

  try {
    // Verify customer exists
    const { data: customer } = await supabase.from('customers').select('id, name, phone').eq('id', customer_id).single();
    if (!customer) {
      return res.status(400).json({ message: 'Referenced customer does not exist.' });
    }

    const cleanFollowup = {
      customer_id,
      type: type.trim(),
      title: title && typeof title === 'string' ? title.trim() : type.trim(),
      description: description && typeof description === 'string' ? description.trim() : null,
      due_date: due_date || null,
      priority: priority || 'Medium',
      status: 'Pending',
      done: false,
      auto_generated: Boolean(auto_generated),
      reminder_key: reminder_key ? String(reminder_key).trim() : null,
      whatsapp_sent: false,
    };

    const { data, error } = await supabase
      .from('followups')
      .insert([cleanFollowup])
      .select('*, customers(name, phone)')
      .single();

    if (error || !data) {
      console.error('[Followups API] Create error:', error?.message);
      return res.status(500).json({ message: 'Unable to create follow-up.' });
    }

    const row = {
      ...data,
      customer_name: data.customers?.name || customer.name || '',
      phone: data.customers?.phone || customer.phone || '',
      customers: undefined,
    };

    syncToSheets('followup', data.id, row).catch(() => {});
    res.status(201).json(row);
  } catch (err) {
    console.error('[Followups API] POST exception:', err.message);
    res.status(500).json({ message: 'Unable to create follow-up.' });
  }
});

// PATCH /api/followups/:id
router.patch('/:id', validateIdParam('id'), async (req, res) => {
  const allowed = ['title', 'description', 'due_date', 'priority', 'type'];
  const updates = {};
  allowed.forEach(k => {
    if (req.body[k] !== undefined) updates[k] = req.body[k];
  });

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: 'No valid fields provided to update.' });
  }

  try {
    const { data: existing } = await supabase.from('followups').select('id').eq('id', req.params.id).single();
    if (!existing) {
      return res.status(404).json({ message: 'Follow-up not found' });
    }

    const { data, error } = await supabase
      .from('followups')
      .update(updates)
      .eq('id', req.params.id)
      .select('*, customers(name, phone)')
      .single();

    if (error || !data) {
      return res.status(500).json({ message: 'Unable to update follow-up.' });
    }

    res.json({
      ...data,
      customer_name: data.customers?.name || data.customer_name || '',
      phone: data.customers?.phone || data.phone || '',
      customers: undefined,
    });
  } catch (err) {
    console.error('[Followups API] PATCH exception:', err.message);
    res.status(500).json({ message: 'Unable to update follow-up.' });
  }
});

// PATCH /api/followups/:id/status
router.patch('/:id/status', validateIdParam('id'), validateFollowupStatus, async (req, res) => {
  const { status, completed_by } = req.body;

  try {
    const { data: existing } = await supabase.from('followups').select('id').eq('id', req.params.id).single();
    if (!existing) {
      return res.status(404).json({ message: 'Follow-up not found' });
    }

    const updates = { status, done: status === 'Completed' };
    if (status === 'Completed') {
      updates.completed_at = new Date().toISOString();
      if (completed_by && typeof completed_by === 'string') {
        updates.completed_by = completed_by.trim().slice(0, 100);
      }
    }

    const { data, error } = await supabase
      .from('followups')
      .update(updates)
      .eq('id', req.params.id)
      .select('*, customers(name, phone)')
      .single();

    if (error || !data) {
      return res.status(500).json({ message: 'Unable to update follow-up status.' });
    }

    const row = {
      ...data,
      customer_name: data.customers?.name || data.customer_name || '',
      phone: data.customers?.phone || data.phone || '',
      customers: undefined,
    };

    syncToSheets('followup', data.id, row).catch(() => {});
    res.json(row);
  } catch (err) {
    console.error('[Followups API] PATCH status exception:', err.message);
    res.status(500).json({ message: 'Unable to update follow-up status.' });
  }
});

// PATCH /api/followups/:id/done
router.patch('/:id/done', validateIdParam('id'), async (req, res) => {
  try {
    const { data: existing } = await supabase.from('followups').select('id').eq('id', req.params.id).single();
    if (!existing) {
      return res.status(404).json({ message: 'Follow-up not found' });
    }

    const { data, error } = await supabase
      .from('followups')
      .update({ status: 'Completed', done: true, completed_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select('*, customers(name, phone)')
      .single();

    if (error || !data) {
      return res.status(500).json({ message: 'Unable to mark follow-up as completed.' });
    }

    const row = {
      ...data,
      customer_name: data.customers?.name || data.customer_name || '',
      phone: data.customers?.phone || data.phone || '',
      customers: undefined,
    };

    syncToSheets('followup', data.id, row).catch(() => {});
    res.json(row);
  } catch (err) {
    console.error('[Followups API] PATCH done exception:', err.message);
    res.status(500).json({ message: 'Unable to mark follow-up as completed.' });
  }
});

// DELETE /api/followups/:id — Owner-only destructive action
router.delete('/:id', requireOwner, validateIdParam('id'), async (req, res) => {
  try {
    const { data: existing } = await supabase.from('followups').select('id').eq('id', req.params.id).single();
    if (!existing) {
      return res.status(404).json({ message: 'Follow-up not found' });
    }

    const { error } = await supabase.from('followups').delete().eq('id', req.params.id);
    if (error) {
      console.error('[Followups API] DELETE error:', error.message);
      return res.status(500).json({ message: 'Unable to delete follow-up.' });
    }

    res.json({ message: 'Follow-up deleted successfully' });
  } catch (err) {
    console.error('[Followups API] DELETE exception:', err.message);
    res.status(500).json({ message: 'Unable to delete follow-up.' });
  }
});

// GET /api/followups/:id/whatsapp-url
router.get('/:id/whatsapp-url', validateIdParam('id'), async (req, res) => {
  try {
    const { data: followup, error } = await supabase
      .from('followups')
      .select('*, customers(name, phone)')
      .eq('id', req.params.id)
      .single();

    if (error || !followup) {
      return res.status(404).json({ message: 'Follow-up not found' });
    }

    const phone = followup.customers?.phone || followup.phone;
    const customerName = followup.customers?.name || followup.customer_name || 'Customer';

    if (!phone) {
      return res.status(400).json({ message: 'No phone number available for this customer.' });
    }

    const messageText = getMessage(followup.type, customerName, followup.title, followup.description);
    const url = buildWhatsAppUrl(phone, messageText);

    // Record the message attempt
    try {
      await supabase.from('whatsapp_messages').insert([{
        customer_id: followup.customer_id,
        customer_name: customerName,
        phone,
        message_type: followup.type,
        message_text: messageText,
        message_status: 'pending',
        sent_at: new Date().toISOString(),
      }]);
    } catch {}

    res.json({
      success: true,
      url,
      message: messageText,
      phone,
      customerName,
      followupId: followup.id,
    });
  } catch (err) {
    console.error('[Followups API] whatsapp-url exception:', err.message);
    res.status(500).json({ message: 'Unable to generate WhatsApp link.' });
  }
});

module.exports = router;
