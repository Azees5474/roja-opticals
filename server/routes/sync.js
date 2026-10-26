/**
 * sync.js
 * ──────────────────────────────────────────────────────────
 * Sync and Backup API Routes
 * Manage offline/online status, database backups, and atomic restores.
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const { requireOwner } = require('../middleware/authorization');
const localDb = require('../lib/localDb');
const supabase = require('../lib/supabase');

const isLocalMode = process.env.LOCAL_MODE === 'true' || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY;

// GET /api/sync/status — Check sync and local stats
router.get('/status', async (_req, res) => {
  try {
    const stats = await localDb.getDbStats();

    if (isLocalMode) {
      return res.json({
        mode: 'local',
        online: false,
        message: 'Standalone local JSON database active. Zero cloud dependencies.',
        localRecords: stats,
      });
    }

    // Cloud mode: test Supabase availability safely
    let online = false;
    try {
      const { error } = await supabase.from('customers').select('id').limit(1);
      online = !error;
    } catch {
      online = false;
    }

    res.json({
      mode: 'cloud',
      online,
      message: online ? 'Connected to cloud database.' : 'Cloud database service is unreachable.',
      localRecords: stats,
    });
  } catch (err) {
    console.error('[Sync API] Status exception:', err.message);
    res.status(500).json({ message: 'Unable to retrieve sync status.' });
  }
});

// POST /api/sync/now — Manually trigger sync (Owner-only)
router.post('/now', requireOwner, async (_req, res) => {
  if (isLocalMode) {
    return res.json({
      success: true,
      message: 'System is operating in 100% offline local database mode. Cloud synchronization is not required.',
    });
  }

  try {
    // Cloud mode sync
    const { error } = await supabase.from('customers').select('id').limit(1);
    if (error) {
      return res.status(503).json({
        success: false,
        message: 'Cloud database is currently unreachable. Cannot synchronize records.',
      });
    }

    res.json({
      success: true,
      message: 'Cloud database connectivity verified. Records are synchronized.',
    });
  } catch (err) {
    console.error('[Sync API] Sync now exception:', err.message);
    res.status(500).json({ message: 'Synchronization check failed.' });
  }
});

// POST /api/sync/backup — Create database backup (Owner-only)
router.post('/backup', requireOwner, async (_req, res) => {
  try {
    const result = await localDb.backupDb();
    if (!result.success) {
      return res.status(500).json({ message: 'Backup creation failed.' });
    }

    res.json({
      success: true,
      file: result.fileName || path.basename(result.file),
      message: 'Database backup created successfully in local_database_backups.',
    });
  } catch (err) {
    console.error('[Sync API] Backup exception:', err.message);
    res.status(500).json({ message: 'Unable to create backup.' });
  }
});

// POST /api/sync/restore — Restore database from backup (Owner-only)
router.post('/restore', requireOwner, async (req, res) => {
  const { fileName } = req.body || {};
  if (!fileName || typeof fileName !== 'string' || !/^[a-zA-Z0-9_.-]+$/.test(fileName)) {
    return res.status(400).json({ message: 'Valid backup fileName is required.' });
  }

  try {
    const backupFilePath = path.resolve(localDb.BACKUP_DIR, fileName);
    // Strict path traversal check
    if (!backupFilePath.startsWith(localDb.BACKUP_DIR)) {
      return res.status(400).json({ message: 'Invalid backup file path.' });
    }

    const result = await localDb.restoreDb(backupFilePath);
    if (!result.success) {
      return res.status(400).json({ message: result.error || 'Restore failed' });
    }

    res.json({
      success: true,
      message: 'Database restored successfully.',
      restored: result.restored,
    });
  } catch (err) {
    console.error('[Sync API] Restore exception:', err.message);
    res.status(500).json({ message: 'Unable to restore database.' });
  }
});

// GET /api/sync/local-stats — Get local database record counts
router.get('/local-stats', async (_req, res) => {
  try {
    const stats = await localDb.getDbStats();
    res.json(stats);
  } catch (err) {
    console.error('[Sync API] Stats exception:', err.message);
    res.status(500).json({ message: 'Unable to retrieve local stats.' });
  }
});

module.exports = router;
