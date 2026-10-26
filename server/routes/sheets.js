const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { requireOwner } = require('../middleware/authorization');
const { fullSync, getLastSyncTime } = require('../lib/sheetsSync');

// GET /api/sheets/status
router.get('/status', async (_req, res) => {
  try {
    const sheetId = process.env.GOOGLE_SHEET_ID;
    const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;

    let lastSync = null;
    let pendingCount = 0;

    try {
      lastSync = await getLastSyncTime();
      const pendingResult = await supabase
        .from('sheets_sync_log')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
      pendingCount = pendingResult?.count || 0;
    } catch {}

    res.json({
      connected: Boolean(sheetId && keyPath),
      lastSync: lastSync || null,
      pendingCount,
    });
  } catch (err) {
    console.error('[Sheets API] Status exception:', err.message);
    res.status(500).json({ message: 'Unable to retrieve Google Sheets status.' });
  }
});

// POST /api/sheets/full-sync — Owner-only administrative action
router.post('/full-sync', requireOwner, async (_req, res) => {
  try {
    const sheetId = process.env.GOOGLE_SHEET_ID;
    const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
    if (!sheetId || !keyPath) {
      return res.status(400).json({
        success: false,
        message: 'Google Sheets integration is not configured in server environment.',
      });
    }

    const results = await fullSync();
    res.json({ success: true, results });
  } catch (err) {
    console.error('[Sheets API] Full sync exception:', err.message);
    res.status(500).json({ success: false, message: 'Google Sheets synchronization failed.' });
  }
});

// POST /api/sheets/test — Owner-only diagnostic action
router.post('/test', requireOwner, async (_req, res) => {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;

  if (!sheetId || !keyPath) {
    return res.json({
      success: false,
      message: 'GOOGLE_SHEET_ID or GOOGLE_SERVICE_ACCOUNT_KEY_PATH not configured in .env',
    });
  }

  try {
    const { getSheetsClient } = require('../lib/sheets');
    const client = await getSheetsClient();
    if (!client) {
      return res.json({ success: false, message: 'Google Sheets authentication failed.' });
    }

    const info = await client.spreadsheets.get({ spreadsheetId: sheetId });
    res.json({
      success: true,
      message: `Connected — "${info.data.properties?.title || 'Google Sheet'}"`,
    });
  } catch (err) {
    console.error('[Sheets API] Test exception:', err.message);
    res.json({ success: false, message: 'Failed to connect to Google Sheets.' });
  }
});

module.exports = router;
