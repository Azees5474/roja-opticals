const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { requireOwner } = require('../middleware/authorization');
const { validateIdParam, validateBillingInput } = require('../middleware/validation');
const { logBill } = require('../lib/sheets');
const { createAutoFollowups } = require('../lib/autoFollowup');
const { syncToSheets } = require('../lib/sheetsSync');

// GET /api/billing
router.get('/', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('billing')
      .select('*, customers(name)')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Billing API] GET error:', error.message);
      return res.status(500).json({ message: 'Unable to retrieve billing invoices.' });
    }

    const bills = (data || []).map(b => ({
      ...b,
      customer_name: b.customers?.name || b.customer_name || '',
      customers: undefined,
    }));

    res.json(bills);
  } catch (err) {
    console.error('[Billing API] GET exception:', err.message);
    res.status(500).json({ message: 'Unable to retrieve billing invoices.' });
  }
});

// POST /api/billing — generate invoice
router.post('/', validateBillingInput, async (req, res) => {
  const { customer_id, items, subtotal, discount = 0, gst = 0 } = req.body;

  try {
    // Verify customer exists
    const { data: customer } = await supabase.from('customers').select('id, name').eq('id', customer_id).single();
    if (!customer) {
      return res.status(400).json({ message: 'Referenced customer does not exist.' });
    }

    const values = [subtotal, discount, gst].map(Number);
    const total = values[0] - values[1] + values[2];

    const cleanBill = {
      customer_id,
      items,
      subtotal: values[0],
      discount: values[1],
      gst: values[2],
      total,
      paid: false,
    };

    const { data, error } = await supabase
      .from('billing')
      .insert([cleanBill])
      .select('*, customers(name)')
      .single();

    if (error || !data) {
      console.error('[Billing API] Create invoice error:', error?.message);
      return res.status(500).json({ message: 'Unable to create invoice.' });
    }

    const flattened = {
      ...data,
      customer_name: data.customers?.name || customer.name || '',
      customers: undefined,
    };

    try {
      await logBill(flattened);
    } catch {}

    res.status(201).json(flattened);
  } catch (err) {
    console.error('[Billing API] POST exception:', err.message);
    res.status(500).json({ message: 'Unable to create invoice.' });
  }
});

// PATCH /api/billing/:id/pay — mark as paid + trigger auto follow-ups
router.patch('/:id/pay', validateIdParam('id'), async (req, res) => {
  try {
    const { data: existing } = await supabase.from('billing').select('id, customer_id, created_at').eq('id', req.params.id).single();
    if (!existing) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    const { data, error } = await supabase
      .from('billing')
      .update({ paid: true })
      .eq('id', req.params.id)
      .select('*, customers(name)')
      .single();

    if (error || !data) {
      return res.status(500).json({ message: 'Unable to mark invoice as paid.' });
    }

    // Trigger automatic follow-ups based on purchase date
    const purchaseDate = data.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10);
    if (data.customer_id) {
      createAutoFollowups(data.customer_id, purchaseDate).catch(err => {
        console.warn('[Billing API] Auto follow-up creation warning:', err.message);
      });
    }

    // Sync to Google Sheets (non-blocking)
    syncToSheets('billing', data.id, data).catch(() => {});

    res.json({
      ...data,
      customer_name: data.customers?.name || data.customer_name || '',
      customers: undefined,
    });
  } catch (err) {
    console.error('[Billing API] PATCH pay exception:', err.message);
    res.status(500).json({ message: 'Unable to update payment status.' });
  }
});

// DELETE /api/billing/:id — Owner-only destructive action
router.delete('/:id', requireOwner, validateIdParam('id'), async (req, res) => {
  try {
    const { data: existing } = await supabase.from('billing').select('id').eq('id', req.params.id).single();
    if (!existing) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    const { error } = await supabase.from('billing').delete().eq('id', req.params.id);
    if (error) {
      console.error('[Billing API] DELETE error:', error.message);
      return res.status(500).json({ message: 'Unable to delete invoice.' });
    }

    res.json({ message: 'Invoice deleted successfully' });
  } catch (err) {
    console.error('[Billing API] DELETE exception:', err.message);
    res.status(500).json({ message: 'Unable to delete invoice.' });
  }
});

module.exports = router;
