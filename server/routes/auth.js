const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const localDb = require('../lib/localDb');
const localAuth = require('../lib/localAuth');
const auth = require('../middleware/auth');
const { getRole, requireOwner } = require('../middleware/authorization');

// GET /api/auth/setup-status — Check whether first-run owner creation is required
router.get('/setup-status', async (_req, res) => {
  try {
    const setupNeeded = await localAuth.isSetupNeeded(localDb);
    res.json({ setupNeeded });
  } catch (err) {
    console.error('[Auth API] Setup status error:', err.message);
    res.status(500).json({ message: 'Unable to check setup status.' });
  }
});

// POST /api/auth/setup-owner — Provision the master owner account (first run only)
router.post('/setup-owner', async (req, res) => {
  const { email, password, name, shopName, shopPhone, shopAddress, shopGstin } = req.body || {};

  try {
    const result = await localAuth.setupInitialOwner(
      { email, password, name, shopName, shopPhone, shopAddress, shopGstin },
      localDb
    );
    res.status(201).json({
      message: 'Owner account created successfully.',
      access_token: result.token,
      user: result.user,
    });
  } catch (err) {
    console.warn('[Auth API] Setup owner rejected:', err.message);
    if (err.message.includes('already completed')) {
      return res.status(403).json({ message: err.message });
    }
    return res.status(400).json({ message: err.message });
  }
});

// POST /api/auth/staff — Owner provisions a new staff account
router.post('/staff', auth, requireOwner, async (req, res) => {
  const { email, password, name } = req.body || {};

  try {
    const staff = await localAuth.createStaffUser({ email, password, name }, localDb);
    res.status(201).json({
      message: 'Staff account created successfully.',
      staff,
    });
  } catch (err) {
    console.warn('[Auth API] Create staff rejected:', err.message);
    return res.status(400).json({ message: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error || !data || !data.user || !data.session) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Authoritative role: ONLY trust app_metadata or server role, never user_metadata
    const authoritativeRole = getRole(data.user) || 'staff';
    const displayName = data.user.user_metadata?.name || data.user.name || (authoritativeRole === 'owner' ? 'Shop Owner' : 'Staff Member');

    res.json({
      message: 'Login successful',
      access_token: data.session.access_token,
      user: {
        id: data.user.id,
        email: data.user.email,
        role: authoritativeRole,
        name: displayName,
        app_metadata: { role: authoritativeRole },
      },
    });
  } catch (err) {
    console.error('[Auth API] Login exception:', err.message);
    return res.status(401).json({ message: 'Invalid email or password' });
  }
});

// POST /api/auth/logout
router.post('/logout', async (_req, res) => {
  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.error('[Auth API] Logout exception:', err.message);
  }
  res.json({ message: 'Logged out' });
});

// GET /api/auth/me
router.get('/me', auth, (req, res) => {
  const authoritativeRole = getRole(req.user) || 'staff';
  res.json({
    id: req.user.id,
    email: req.user.email,
    role: authoritativeRole,
    name: req.user.user_metadata?.name || (authoritativeRole === 'owner' ? 'Shop Owner' : 'Staff Member'),
  });
});

module.exports = router;
