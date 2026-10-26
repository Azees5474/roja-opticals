const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { requireOwner } = require('../middleware/authorization');
const { validateIdParam, validateOrderInput, validateOrderStatus } = require('../middleware/validation');
const { logOrder } = require('../lib/sheets');

const ALLOWED_STATUSES = new Set(['Pending', 'In Progress', 'Ready', 'Delivered', 'Cancelled']);

// GET /api/orders
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    let query = supabase
      .from('orders')
      .select('*, customers(name)')
      .order('created_at', { ascending: false });

    if (status) {
      if (typeof status === 'string' && ALLOWED_STATUSES.has(status)) {
        query = query.eq('status', status);
      } else {
        return res.status(400).json({ message: 'Invalid status filter' });
      }
    }

    const { data, error } = await query;
    if (error) {
      console.error('[Orders API] GET error:', error.message);
      return res.status(500).json({ message: 'Unable to retrieve orders.' });
    }

    const orders = (data || []).map(o => ({
      ...o,
      customer_name: o.customers?.name || o.customer_name || '',
      customers: undefined,
    }));

    res.json(orders);
  } catch (err) {
    console.error('[Orders API] GET exception:', err.message);
    res.status(500).json({ message: 'Unable to retrieve orders.' });
  }
});

// GET /api/orders/:id
router.get('/:id', validateIdParam('id'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*, customers(name)')
      .eq('id', req.params.id)
      .single();

    if (error || !data) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.json({
      ...data,
      customer_name: data.customers?.name || data.customer_name || '',
      customers: undefined,
    });
  } catch (err) {
    console.error(`[Orders API] GET /${req.params.id} exception:`, err.message);
    res.status(500).json({ message: 'Unable to retrieve order details.' });
  }
});

// POST /api/orders
router.post('/', validateOrderInput, async (req, res) => {
  const { customer_id, product, amount, status = 'Pending' } = req.body;

  try {
    // Verify customer exists
    const { data: customer } = await supabase.from('customers').select('id, name').eq('id', customer_id).single();
    if (!customer) {
      return res.status(400).json({ message: 'Referenced customer does not exist.' });
    }

    const cleanOrder = {
      customer_id,
      product: product.trim(),
      amount: Number(amount),
      status: status || 'Pending',
    };

    const { data, error } = await supabase
      .from('orders')
      .insert([cleanOrder])
      .select('*, customers(name)')
      .single();

    if (error || !data) {
      console.error('[Orders API] Create error:', error?.message);
      return res.status(500).json({ message: 'Unable to create order.' });
    }

    const flattened = {
      ...data,
      customer_name: data.customers?.name || customer.name || '',
      customers: undefined,
    };

    try {
      await logOrder(flattened);
    } catch {}

    res.status(201).json(flattened);
  } catch (err) {
    console.error('[Orders API] POST exception:', err.message);
    res.status(500).json({ message: 'Unable to create order.' });
  }
});

// PATCH /api/orders/:id/status
router.patch('/:id/status', validateIdParam('id'), validateOrderStatus, async (req, res) => {
  const { status } = req.body;

  try {
    const { data: existing } = await supabase.from('orders').select('id').eq('id', req.params.id).single();
    if (!existing) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const { data, error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', req.params.id)
      .select('*, customers(name)')
      .single();

    if (error || !data) {
      return res.status(500).json({ message: 'Unable to update order status.' });
    }

    res.json({
      ...data,
      customer_name: data.customers?.name || data.customer_name || '',
      customers: undefined,
    });
  } catch (err) {
    console.error('[Orders API] PATCH status exception:', err.message);
    res.status(500).json({ message: 'Unable to update order status.' });
  }
});

// DELETE /api/orders/:id — Owner-only destructive action
router.delete('/:id', requireOwner, validateIdParam('id'), async (req, res) => {
  try {
    const { data: existing } = await supabase.from('orders').select('id').eq('id', req.params.id).single();
    if (!existing) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const { error } = await supabase.from('orders').delete().eq('id', req.params.id);
    if (error) {
      console.error('[Orders API] DELETE error:', error.message);
      return res.status(500).json({ message: 'Unable to delete order.' });
    }

    res.json({ message: 'Order deleted successfully' });
  } catch (err) {
    console.error('[Orders API] DELETE exception:', err.message);
    res.status(500).json({ message: 'Unable to delete order.' });
  }
});

module.exports = router;
