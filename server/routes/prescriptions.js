const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { requireOwner } = require('../middleware/authorization');
const { validateIdParam, validatePrescriptionInput } = require('../middleware/validation');
const { logPrescription } = require('../lib/sheets');

// GET /api/prescriptions
router.get('/', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('prescriptions')
      .select('*, customers(name)')
      .order('date', { ascending: false });

    if (error) {
      console.error('[Prescriptions API] GET error:', error.message);
      return res.status(500).json({ message: 'Unable to retrieve prescriptions.' });
    }

    const prescriptions = (data || []).map(p => ({
      ...p,
      customer_name: p.customers?.name || p.customer_name || '',
      customers: undefined,
    }));

    res.json(prescriptions);
  } catch (err) {
    console.error('[Prescriptions API] GET exception:', err.message);
    res.status(500).json({ message: 'Unable to retrieve prescriptions.' });
  }
});

// POST /api/prescriptions
router.post('/', validatePrescriptionInput, async (req, res) => {
  const {
    customer_id, date, right_sph, right_cyl, right_axis,
    left_sph, left_cyl, left_axis, doctor,
  } = req.body;

  try {
    // Verify customer exists
    const { data: customer } = await supabase.from('customers').select('id, name').eq('id', customer_id).single();
    if (!customer) {
      return res.status(400).json({ message: 'Referenced customer does not exist.' });
    }

    const cleanPrescription = {
      customer_id,
      date: date || new Date().toISOString().slice(0, 10),
      doctor: String(doctor || '').trim().slice(0, 120),
      right_sph: right_sph != null ? String(right_sph).trim().slice(0, 16) : '',
      right_cyl: right_cyl != null ? String(right_cyl).trim().slice(0, 16) : '',
      right_axis: right_axis != null ? String(right_axis).trim().slice(0, 16) : '',
      left_sph: left_sph != null ? String(left_sph).trim().slice(0, 16) : '',
      left_cyl: left_cyl != null ? String(left_cyl).trim().slice(0, 16) : '',
      left_axis: left_axis != null ? String(left_axis).trim().slice(0, 16) : '',
    };

    const { data, error } = await supabase
      .from('prescriptions')
      .insert([cleanPrescription])
      .select('*, customers(name)')
      .single();

    if (error || !data) {
      console.error('[Prescriptions API] Create error:', error?.message);
      return res.status(500).json({ message: 'Unable to save prescription.' });
    }

    const flattened = {
      ...data,
      customer_name: data.customers?.name || customer.name || '',
      customers: undefined,
    };

    try {
      await logPrescription(flattened);
    } catch {}

    res.status(201).json(flattened);
  } catch (err) {
    console.error('[Prescriptions API] POST exception:', err.message);
    res.status(500).json({ message: 'Unable to save prescription.' });
  }
});

// DELETE /api/prescriptions/:id — Owner-only destructive action
router.delete('/:id', requireOwner, validateIdParam('id'), async (req, res) => {
  try {
    const { data: existing } = await supabase.from('prescriptions').select('id').eq('id', req.params.id).single();
    if (!existing) {
      return res.status(404).json({ message: 'Prescription not found' });
    }

    const { error } = await supabase.from('prescriptions').delete().eq('id', req.params.id);
    if (error) {
      console.error('[Prescriptions API] DELETE error:', error.message);
      return res.status(500).json({ message: 'Unable to delete prescription.' });
    }

    res.json({ message: 'Prescription deleted successfully' });
  } catch (err) {
    console.error('[Prescriptions API] DELETE exception:', err.message);
    res.status(500).json({ message: 'Unable to delete prescription.' });
  }
});

module.exports = router;
