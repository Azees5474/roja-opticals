/**
 * drive.js
 * ──────────────────────────────────────────────────────────
 * Google Drive Backup & Restore API Routes (Owner-only)
 */

const express = require('express');
const router = express.Router();
const googleDrive = require('../lib/googleDrive');
const { requireOwner } = require('../middleware/authorization');

// GET /api/drive/status — Check Google Drive connectivity & backup metadata
router.get('/status', async (_req, res) => {
  try {
    const status = await googleDrive.getStatus();
    res.json(status);
  } catch (err) {
    console.error('[Drive API] Status error:', err.message);
    res.status(500).json({ message: 'Unable to retrieve Google Drive status' });
  }
});

// POST /api/drive/config — Save OAuth client credentials (Owner-only)
router.post('/config', requireOwner, async (req, res) => {
  const { clientId, clientSecret, redirectUri } = req.body || {};

  if (!clientId || typeof clientId !== 'string' || !clientId.trim()) {
    return res.status(400).json({ message: 'Google OAuth Client ID is required.' });
  }
  if (!clientSecret || typeof clientSecret !== 'string' || !clientSecret.trim()) {
    return res.status(400).json({ message: 'Google OAuth Client Secret is required.' });
  }

  try {
    const saved = await googleDrive.saveConfig({ clientId, clientSecret, redirectUri });
    res.json({
      success: true,
      message: 'Google Drive client credentials configured successfully.',
      clientId: saved.clientId,
      redirectUri: saved.redirectUri,
    });
  } catch (err) {
    console.error('[Drive API] Config save error:', err.message);
    res.status(500).json({ message: 'Failed to save Google OAuth configuration.' });
  }
});

// GET /api/drive/auth-url — Generate OAuth consent URL (Owner-only)
router.get('/auth-url', requireOwner, async (req, res) => {
  try {
    const redirectUri = req.query.redirectUri;
    const authUrl = await googleDrive.getAuthUrl(redirectUri);
    res.json({ authUrl });
  } catch (err) {
    console.error('[Drive API] Auth URL error:', err.message);
    res.status(400).json({ message: err.message || 'Unable to generate Google authorization URL' });
  }
});

// GET /api/drive/callback — Handle OAuth redirect from Google
router.get('/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>Google Drive Authorization Failed</title></head>
        <body style="font-family:sans-serif; text-align:center; padding: 50px;">
          <h2 style="color:#dc2626;">Authorization Denied</h2>
          <p>${escapeHtml(error)}</p>
          <p><a href="/settings">Return to Roja Opticals Settings</a></p>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'GOOGLE_DRIVE_AUTH_ERROR', error: '${escapeHtml(error)}' }, '*');
              window.close();
            }
          </script>
        </body>
      </html>
    `);
  }

  if (!code) {
    return res.status(400).send('Authorization code missing.');
  }

  try {
    await googleDrive.handleOAuthCallback(code);
    return res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>Google Drive Connected Successfully</title></head>
        <body style="font-family:sans-serif; text-align:center; padding: 50px; background:#f8fafc;">
          <div style="max-width:480px; margin:0 auto; background:#fff; padding:30px; border-radius:12px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">
            <div style="font-size:48px; margin-bottom:12px;">✅</div>
            <h2 style="color:#0f172a; margin:0 0 8px;">Google Drive Connected</h2>
            <p style="color:#64748b; font-size:14px; margin-bottom:24px;">Your Google account was successfully connected for optional database backups.</p>
            <p><a href="/settings" style="display:inline-block; background:#0f172a; color:#fff; text-decoration:none; padding:10px 20px; border-radius:6px; font-weight:600;">Return to Settings</a></p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'GOOGLE_DRIVE_AUTH_SUCCESS' }, '*');
              setTimeout(() => window.close(), 1200);
            }
          </script>
        </body>
      </html>
    `);
  } catch (err) {
    console.error('[Drive API] OAuth exchange error:', err.message);
    return res.status(500).send(`
      <div style="font-family:sans-serif; text-align:center; padding: 50px;">
        <h2 style="color:#dc2626;">Connection Failed</h2>
        <p>${escapeHtml(err.message)}</p>
        <p><a href="/settings">Return to Roja Opticals Settings</a></p>
      </div>
    `);
  }
});

// POST /api/drive/callback — Programmatic exchange (Owner-only)
router.post('/callback', requireOwner, async (req, res) => {
  const { code, redirectUri } = req.body || {};
  if (!code) return res.status(400).json({ message: 'Authorization code is required' });

  try {
    const result = await googleDrive.handleOAuthCallback(code, redirectUri);
    res.json({ success: true, email: result.email });
  } catch (err) {
    console.error('[Drive API] Post callback error:', err.message);
    res.status(500).json({ message: err.message || 'Failed to exchange authorization code' });
  }
});

// POST /api/drive/backup — Trigger Encrypted Google Drive Backup (Owner-only)
router.post('/backup', requireOwner, async (req, res) => {
  const { passphrase, retentionCount } = req.body || {};

  if (!passphrase || typeof passphrase !== 'string' || passphrase.length < 4) {
    return res.status(400).json({
      message: 'A strong encryption passphrase (at least 4 characters) is required to secure the backup.',
    });
  }

  try {
    const result = await googleDrive.uploadBackup({ passphrase, retentionCount });
    res.json(result);
  } catch (err) {
    console.error('[Drive API] Backup upload error:', err.message);
    res.status(err.code === 403 ? 403 : 500).json({ message: err.message || 'Backup upload failed' });
  }
});

// GET /api/drive/backups — List backups in Google Drive (Owner-only)
router.get('/backups', requireOwner, async (_req, res) => {
  try {
    const result = await googleDrive.listBackups();
    if (!result.success) {
      return res.status(400).json({ message: result.error, files: [] });
    }
    res.json(result);
  } catch (err) {
    console.error('[Drive API] List backups error:', err.message);
    res.status(500).json({ message: err.message || 'Failed to list Google Drive backups' });
  }
});

// POST /api/drive/restore — Decrypt and restore backup from Drive (Owner-only)
router.post('/restore', requireOwner, async (req, res) => {
  const { fileId, passphrase, confirm } = req.body || {};

  if (!confirm) {
    return res.status(400).json({
      message: 'Restore requires explicit confirmation. Please confirm you wish to restore from backup.',
    });
  }

  if (!fileId || typeof fileId !== 'string') {
    return res.status(400).json({ message: 'Valid Google Drive file ID is required.' });
  }

  if (!passphrase || typeof passphrase !== 'string') {
    return res.status(400).json({ message: 'The encryption passphrase is required to decrypt this backup.' });
  }

  try {
    const result = await googleDrive.downloadAndRestoreBackup({ fileId, passphrase });
    res.json(result);
  } catch (err) {
    console.error('[Drive API] Restore error:', err.message);
    res.status(400).json({ message: err.message || 'Database restore failed' });
  }
});

// POST /api/drive/disconnect — Revoke and clear stored Google tokens (Owner-only)
router.post('/disconnect', requireOwner, async (_req, res) => {
  try {
    await googleDrive.disconnect();
    res.json({ success: true, message: 'Google Drive disconnected and tokens deleted safely.' });
  } catch (err) {
    console.error('[Drive API] Disconnect error:', err.message);
    res.status(500).json({ message: 'Failed to disconnect Google Drive' });
  }
});

// PUT /api/drive/settings — Update retention and auto-backup settings (Owner-only)
router.put('/settings', requireOwner, async (req, res) => {
  const { autoBackupEnabled, retentionCount } = req.body || {};

  try {
    const updated = await googleDrive.saveSettings({
      autoBackupEnabled: Boolean(autoBackupEnabled),
      retentionCount: retentionCount !== undefined ? Math.max(1, parseInt(retentionCount, 10)) : 10,
    });
    res.json({ success: true, settings: updated });
  } catch (err) {
    console.error('[Drive API] Save settings error:', err.message);
    res.status(500).json({ message: 'Failed to update Drive settings' });
  }
});

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

module.exports = router;
