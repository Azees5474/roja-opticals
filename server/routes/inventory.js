const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { requireOwner } = require('../middleware/authorization');
const { validateIdParam, validateInventoryInput, validateInventoryStock } = require('../middleware/validation');
const { logInventory } = require('../lib/sheets');

// GET /api/inventory
router.get('/', async (req, res) => {
  try {
    const { category } = req.query;
    let query = supabase
      .from('inventory')
      .select('*')
      .order('name', { ascending: true });

    if (category && category !== 'All') {
      if (typeof category === 'string' && category.trim().length <= 100) {
        query = query.eq('category', category.trim());
      }
    }

    const { data, error } = await query;
    if (error) {
      console.error('[Inventory API] GET error:', error.message);
      return res.status(500).json({ message: 'Unable to retrieve inventory.' });
    }

    res.json(data || []);
  } catch (err) {
    console.error('[Inventory API] GET exception:', err.message);
    res.status(500).json({ message: 'Unable to retrieve inventory.' });
  }
});

// POST /api/inventory
router.post('/', validateInventoryInput, async (req, res) => {
  const { name, brand, category, sku, stock, price, reorder } = req.body;

  try {
    const cleanItem = {
      name: name.trim(),
      brand: String(brand || '').trim(),
      category: String(category || '').trim(),
      sku: sku.trim(),
      stock: parseInt(stock, 10),
      price: Number(price),
      reorder: parseInt(reorder, 10),
    };

    const { data, error } = await supabase
      .from('inventory')
      .insert([cleanItem])
      .select()
      .single();

    if (error || !data) {
      console.error('[Inventory API] Create error:', error?.message);
      return res.status(500).json({ message: 'Unable to create inventory item.' });
    }

    try {
      await logInventory(data);
    } catch {}

    res.status(201).json(data);
  } catch (err) {
    console.error('[Inventory API] POST exception:', err.message);
    res.status(500).json({ message: 'Unable to create inventory item.' });
  }
});

// PATCH /api/inventory/:id/stock
router.patch('/:id/stock', validateIdParam('id'), validateInventoryStock, async (req, res) => {
  const { stock } = req.body;

  try {
    const { data: existing } = await supabase.from('inventory').select('id').eq('id', req.params.id).single();
    if (!existing) {
      return res.status(404).json({ message: 'Inventory item not found' });
    }

    const { data, error } = await supabase
      .from('inventory')
      .update({ stock: parseInt(stock, 10) })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error || !data) {
      return res.status(500).json({ message: 'Unable to update inventory stock.' });
    }

    res.json(data);
  } catch (err) {
    console.error('[Inventory API] PATCH stock exception:', err.message);
    res.status(500).json({ message: 'Unable to update inventory stock.' });
  }
});

// DELETE /api/inventory/:id — Owner-only destructive action
router.delete('/:id', requireOwner, validateIdParam('id'), async (req, res) => {
  try {
    const { data: existing } = await supabase.from('inventory').select('id').eq('id', req.params.id).single();
    if (!existing) {
      return res.status(404).json({ message: 'Inventory item not found' });
    }

    const { error } = await supabase.from('inventory').delete().eq('id', req.params.id);
    if (error) {
      console.error('[Inventory API] DELETE error:', error.message);
      return res.status(500).json({ message: 'Unable to delete inventory item.' });
    }

    res.json({ message: 'Inventory item deleted successfully' });
  } catch (err) {
    console.error('[Inventory API] DELETE exception:', err.message);
    res.status(500).json({ message: 'Unable to delete inventory item.' });
  }
});

module.exports = router;
