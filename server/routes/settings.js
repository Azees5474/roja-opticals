const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { requireOwner } = require('../middleware/authorization');

const SETTINGS_ID = '00000000-0000-0000-0000-000000000002';
const PHONE_REGEX = /^\+?[0-9][0-9\s()-]{6,19}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GET /api/settings
router.get('/', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('shop_settings')
      .select('shop, notifications')
      .eq('id', SETTINGS_ID)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[Settings API] GET error:', error.message);
      return res.status(500).json({ message: 'Unable to load shop settings.' });
    }

    res.json(data || {
      shop: {
        name: 'Roja Opticals',
        phone: '',
        email: '',
        address: '',
        gstin: '',
        currency: 'INR',
        timezone: 'Asia/Kolkata',
      },
      notifications: {
        orderReady: true,
        followupDue: true,
        lowStock: true,
        billing: false,
      },
    });
  } catch (err) {
    console.error('[Settings API] GET exception:', err.message);
    res.status(500).json({ message: 'Unable to load shop settings.' });
  }
});

// PUT /api/settings — Owner-only configuration
router.put('/', requireOwner, async (req, res) => {
  const { shop, notifications } = req.body || {};

  if (!shop || typeof shop !== 'object' || !notifications || typeof notifications !== 'object') {
    return res.status(400).json({ message: 'Valid shop and notification settings are required.' });
  }

  const cleanShop = {
    name: String(shop.name || '').trim().slice(0, 120),
    phone: String(shop.phone || '').trim().slice(0, 30),
    email: String(shop.email || '').trim().slice(0, 254),
    address: String(shop.address || '').trim().slice(0, 500),
    gstin: String(shop.gstin || '').trim().slice(0, 32),
    currency: shop.currency === 'USD' ? 'USD' : 'INR',
    timezone: shop.timezone === 'UTC' ? 'UTC' : 'Asia/Kolkata',
  };

  if (!cleanShop.name) {
    return res.status(400).json({ message: 'Shop name is required.' });
  }

  if (!PHONE_REGEX.test(cleanShop.phone)) {
    return res.status(400).json({ message: 'Enter a valid shop phone number (7 to 20 digits).' });
  }

  if (!EMAIL_REGEX.test(cleanShop.email)) {
    return res.status(400).json({ message: 'Enter a valid shop email address.' });
  }

  const cleanNotifications = ['orderReady', 'followupDue', 'lowStock', 'billing'].reduce(
    (acc, key) => ({ ...acc, [key]: Boolean(notifications[key]) }),
    {}
  );

  try {
    const { data, error } = await supabase
      .from('shop_settings')
      .upsert({
        id: SETTINGS_ID,
        shop: cleanShop,
        notifications: cleanNotifications,
        updated_at: new Date().toISOString(),
      })
      .select('shop, notifications')
      .single();

    if (error || !data) {
      console.error('[Settings API] PUT error:', error?.message);
      return res.status(500).json({ message: 'Unable to save shop settings.' });
    }

    res.json(data);
  } catch (err) {
    console.error('[Settings API] PUT exception:', err.message);
    res.status(500).json({ message: 'Unable to save shop settings.' });
  }
});

module.exports = router;
