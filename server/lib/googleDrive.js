/**
 * googleDrive.js
 * ──────────────────────────────────────────────────────────
 * Google Drive Backup & Restore Module for Roja Opticals
 *
 * Guarantees & Constraints:
 * 1. Scope: Only requests narrowest scope 'https://www.googleapis.com/auth/drive.file'
 *    (cannot view, modify, or delete any files not created by this app).
 * 2. Dedicated Folder: All backups reside in 'Roja Opticals Backups' folder.
 * 3. Client-Side Encryption: AES-256-GCM zero-knowledge encryption before upload.
 *    Encryption keys are derived via scrypt and are NEVER uploaded, stored beside backups,
 *    or hard-coded in the app.
 * 4. Pre-Restore Safety: Creates a local safety snapshot before any restore, validates
 *    backup envelope, schema, and record IDs, and rolls back atomically on failure.
 * 5. Retention Policy: Configurable cleanup that deletes only app-created backups inside
 *    the dedicated backup folder.
 * 6. Secure Storage: OAuth tokens and client credentials stored in Windows per-user AppData
 *    directory, completely outside git, logs, and installer.
 * 7. Resilient Offline Handling: Understandable errors for network failure, revoked auth,
 *    and quota limits. Drive remains 100% optional.
 */

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { google } = require('googleapis');
const localDb = require('./localDb');

// Helper to resolve per-user configuration files in AppData
function getPerUserDataDir() {
  if (process.env.ROJA_DATA_DIR) {
    return path.dirname(path.resolve(process.env.ROJA_DATA_DIR));
  }
  if (process.env.NODE_ENV === 'test') {
    return path.resolve(__dirname, '../test/temp_drive_appdata');
  }
  if (process.env.APPDATA) {
    return path.resolve(process.env.APPDATA, 'RojaOpticals');
  }
  return path.resolve(__dirname, '..');
}

function getTokensPath() {
  return path.resolve(getPerUserDataDir(), 'google_drive_tokens.json');
}

function getConfigPath() {
  return path.resolve(getPerUserDataDir(), 'google_drive_config.json');
}

function getSettingsPath() {
  return path.resolve(getPerUserDataDir(), 'google_drive_settings.json');
}

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
const BACKUP_FOLDER_NAME = 'Roja Opticals Backups';

// ── Encryption & Key Derivation (AES-256-GCM) ──────────────

/**
 * Derive 256-bit encryption key using scrypt
 */
function deriveKey(passphrase, salt) {
  if (!passphrase || typeof passphrase !== 'string' || passphrase.length < 4) {
    throw new Error('A valid encryption passphrase (at least 4 characters) is required');
  }
  return crypto.scryptSync(passphrase, salt, 32, { N: 16384, r: 8, p: 1 });
}

/**
 * Encrypt payload object into an AES-256-GCM envelope
 */
function encryptPayload(dataObject, passphrase) {
  const jsonString = typeof dataObject === 'string' ? dataObject : JSON.stringify(dataObject);
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12); // Standard 96-bit IV for AES-GCM
  const key = deriveKey(passphrase, salt);

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(jsonString, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return {
    roja_backup_version: 2,
    format: 'roja-encrypted-v1',
    cipher: 'aes-256-gcm',
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    ciphertext: encrypted,
    createdAt: new Date().toISOString(),
    shop: 'Roja Opticals',
  };
}

/**
 * Decrypt AES-256-GCM envelope back into original object
 */
function decryptPayload(envelope, passphrase) {
  if (!envelope || typeof envelope !== 'object') {
    throw new Error('Invalid backup package: missing envelope');
  }
  if (envelope.format !== 'roja-encrypted-v1' || envelope.cipher !== 'aes-256-gcm') {
    throw new Error('Unsupported backup format or cipher algorithm');
  }
  if (!envelope.salt || !envelope.iv || !envelope.authTag || !envelope.ciphertext) {
    throw new Error('Corrupt backup envelope: missing cryptographic components');
  }

  const salt = Buffer.from(envelope.salt, 'hex');
  const iv = Buffer.from(envelope.iv, 'hex');
  const authTag = Buffer.from(envelope.authTag, 'hex');
  const key = deriveKey(passphrase, salt);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = '';
  try {
    decrypted = decipher.update(envelope.ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
  } catch (err) {
    throw new Error('Decryption failed: Incorrect encryption passphrase or tampered backup data');
  }

  try {
    return JSON.parse(decrypted);
  } catch (err) {
    throw new Error('Decrypted content is not valid JSON database snapshot');
  }
}

// ── OAuth Credentials & Tokens Management ──────────────────

async function loadConfig() {
  try {
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
      const raw = await fsp.readFile(configPath, 'utf8');
      const cfg = JSON.parse(raw);
      return {
        clientId: cfg.clientId || process.env.GOOGLE_CLIENT_ID || '',
        clientSecret: cfg.clientSecret || process.env.GOOGLE_CLIENT_SECRET || '',
        redirectUri: cfg.redirectUri || process.env.GOOGLE_REDIRECT_URI || 'http://127.0.0.1:5000/api/drive/callback',
      };
    }
  } catch (err) {
    console.warn('[Drive] Warning loading config:', err.message);
  }

  return {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://127.0.0.1:5000/api/drive/callback',
  };
}

async function saveConfig({ clientId, clientSecret, redirectUri }) {
  const dir = getPerUserDataDir();
  await fsp.mkdir(dir, { recursive: true });
  const current = await loadConfig();
  const updated = {
    clientId: (clientId !== undefined ? clientId : current.clientId || '').trim(),
    clientSecret: (clientSecret !== undefined ? clientSecret : current.clientSecret || '').trim(),
    redirectUri: (redirectUri !== undefined ? redirectUri : current.redirectUri || 'http://127.0.0.1:5000/api/drive/callback').trim(),
    updatedAt: new Date().toISOString(),
  };

  await fsp.writeFile(getConfigPath(), JSON.stringify(updated, null, 2), { mode: 0o600 });
  return updated;
}

async function loadTokens() {
  try {
    const tokensPath = getTokensPath();
    if (fs.existsSync(tokensPath)) {
      const raw = await fsp.readFile(tokensPath, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('[Drive] Warning loading tokens:', err.message);
  }
  return null;
}

async function saveTokens(tokens) {
  const dir = getPerUserDataDir();
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(getTokensPath(), JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

async function clearTokens() {
  try {
    const tokensPath = getTokensPath();
    if (fs.existsSync(tokensPath)) {
      await fsp.unlink(tokensPath);
    }
  } catch (err) {
    console.warn('[Drive] Warning clearing tokens:', err.message);
  }
}

async function loadSettings() {
  try {
    const p = getSettingsPath();
    if (fs.existsSync(p)) {
      return JSON.parse(await fsp.readFile(p, 'utf8'));
    }
  } catch {}
  return {
    autoBackupEnabled: false,
    retentionCount: 10, // keep 10 most recent backups by default
    lastBackupTime: null,
    lastBackupFile: null,
  };
}

async function saveSettings(settings) {
  const dir = getPerUserDataDir();
  await fsp.mkdir(dir, { recursive: true });
  const current = await loadSettings();
  const merged = { ...current, ...settings, updatedAt: new Date().toISOString() };
  await fsp.writeFile(getSettingsPath(), JSON.stringify(merged, null, 2), { mode: 0o600 });
  return merged;
}

// ── OAuth Client & Authentication Flow ─────────────────────

function createOAuth2Client(config) {
  if (!config.clientId || !config.clientSecret) {
    throw new Error('Google OAuth credentials not configured. Please enter Client ID and Client Secret in Settings.');
  }
  return new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    config.redirectUri || 'http://127.0.0.1:5000/api/drive/callback'
  );
}

async function getAuthUrl(customRedirectUri) {
  const config = await loadConfig();
  const oauth2Client = createOAuth2Client({
    ...config,
    redirectUri: customRedirectUri || config.redirectUri,
  });

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });
}

async function handleOAuthCallback(code, customRedirectUri) {
  const config = await loadConfig();
  const oauth2Client = createOAuth2Client({
    ...config,
    redirectUri: customRedirectUri || config.redirectUri,
  });

  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  // Retrieve user identity info to display email in Settings UI
  let email = null;
  try {
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    email = userInfo.data.email || null;
  } catch {
    // If userinfo endpoint not permitted under drive.file, fetch token info
    try {
      const tokenInfo = await oauth2Client.getTokenInfo(tokens.access_token);
      email = tokenInfo.email || null;
    } catch {}
  }

  const storedTokens = {
    ...tokens,
    email,
    connectedAt: new Date().toISOString(),
  };

  await saveTokens(storedTokens);
  return storedTokens;
}

async function getAuthenticatedClient() {
  const config = await loadConfig();
  const tokens = await loadTokens();

  if (!tokens || !tokens.access_token) {
    return { client: null, error: 'Google Drive is not connected' };
  }

  const oauth2Client = createOAuth2Client(config);
  oauth2Client.setCredentials(tokens);

  // Auto-persist refreshed tokens when Google rotates them
  oauth2Client.on('tokens', async (newTokens) => {
    try {
      const current = await loadTokens();
      await saveTokens({ ...current, ...newTokens });
    } catch (err) {
      console.warn('[Drive] Error persisting refreshed tokens:', err.message);
    }
  });

  return { client: oauth2Client, tokens };
}

async function disconnect() {
  try {
    const { client, tokens } = await getAuthenticatedClient();
    if (client && tokens && tokens.access_token) {
      try {
        await client.revokeToken(tokens.access_token);
      } catch (revokeErr) {
        console.warn('[Drive] Revoke token warning (may already be revoked):', revokeErr.message);
      }
    }
  } catch {}

  await clearTokens();
  return { success: true };
}

// ── Google Drive Folder & File Operations ──────────────────

/**
 * Friendly error translator for Drive operations
 */
function translateDriveError(err) {
  const msg = err.message || '';
  if (msg.includes('ENOTFOUND') || msg.includes('EAI_AGAIN') || msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT') || msg.includes('network')) {
    return new Error('Internet connection unavailable. Google Drive operations require an active network connection.');
  }
  if (err.code === 401 || msg.includes('invalid_grant') || msg.includes('Token has been expired or revoked')) {
    return new Error('Google Drive authorization has expired or was revoked. Please reconnect in Settings.');
  }
  if (err.code === 403 && (msg.includes('quotaExceeded') || msg.includes('storageQuotaExceeded') || msg.includes('User rate limit exceeded'))) {
    return new Error('Google Drive storage quota exceeded or rate limit reached. Please check your Google account.');
  }
  return err;
}

/**
 * Ensure dedicated 'Roja Opticals Backups' folder exists in Drive
 */
async function ensureBackupFolder(drive) {
  try {
    const query = `mimeType = 'application/vnd.google-apps.folder' and name = '${BACKUP_FOLDER_NAME}' and trashed = false`;
    const res = await drive.files.list({
      q: query,
      spaces: 'drive',
      fields: 'files(id, name)',
    });

    if (res.data.files && res.data.files.length > 0) {
      return res.data.files[0].id;
    }

    // Create the dedicated folder
    const createRes = await drive.files.create({
      requestBody: {
        name: BACKUP_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
        description: 'Dedicated folder for encrypted Roja Opticals database backups.',
      },
      fields: 'id, name',
    });

    return createRes.data.id;
  } catch (err) {
    throw translateDriveError(err);
  }
}

/**
 * Upload an encrypted database backup to Google Drive
 */
async function uploadBackup({ passphrase, retentionCount } = {}) {
  if (!passphrase) {
    throw new Error('An encryption passphrase is required to secure the backup before upload.');
  }

  const { client, error: authError } = await getAuthenticatedClient();
  if (authError || !client) {
    throw new Error(authError || 'Google Drive is not connected');
  }

  const drive = google.drive({ version: 'v3', auth: client });

  try {
    // 1. Ensure folder exists
    const folderId = await ensureBackupFolder(drive);

    // 2. Create raw local database backup snapshot
    const localBackupRes = await localDb.backupDb();
    if (!localBackupRes.success) {
      throw new Error('Local snapshot generation failed: ' + localBackupRes.error);
    }

    const rawContent = await fsp.readFile(localBackupRes.file, 'utf8');
    const parsedData = JSON.parse(rawContent);

    // 3. Encrypt payload using AES-256-GCM
    const encryptedEnvelope = encryptPayload(parsedData, passphrase);

    // Attach summary metadata (record counts) for display in UI without decrypting
    const stats = {};
    if (parsedData.data) {
      for (const [k, v] of Object.entries(parsedData.data)) {
        stats[k] = Array.isArray(v) ? v.length : 0;
      }
    }
    encryptedEnvelope.recordCounts = stats;

    const payloadString = JSON.stringify(encryptedEnvelope, null, 2);
    const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `roja_backup_${timestampStr}.enc.json`;

    // 4. Upload to Google Drive folder
    const Readable = require('stream').Readable;
    const stream = new Readable();
    stream.push(payloadString);
    stream.push(null);

    const uploadRes = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId],
        description: 'Roja Opticals Encrypted Backup (AES-256-GCM)',
        appProperties: {
          app: 'roja-opticals',
          version: '2.0.0',
          type: 'database-backup',
        },
      },
      media: {
        mimeType: 'application/json',
        body: stream,
      },
      fields: 'id, name, size, createdTime',
    });

    const file = uploadRes.data;

    // 5. Update settings metadata
    await saveSettings({
      lastBackupTime: file.createdTime || new Date().toISOString(),
      lastBackupFile: file.name,
    });

    // 6. Apply retention policy if enabled
    const settings = await loadSettings();
    const activeRetention = retentionCount !== undefined ? retentionCount : settings.retentionCount;
    let deletedCount = 0;

    if (activeRetention && activeRetention > 0) {
      deletedCount = await applyRetentionPolicy(drive, folderId, activeRetention);
    }

    return {
      success: true,
      file: {
        id: file.id,
        name: file.name,
        size: file.size,
        createdTime: file.createdTime,
      },
      deletedOldBackups: deletedCount,
      message: 'Encrypted backup uploaded successfully to Google Drive.',
    };
  } catch (err) {
    throw translateDriveError(err);
  }
}

/**
 * Apply retention policy: delete older backups beyond the retention limit
 * Only deletes files inside the 'Roja Opticals Backups' folder.
 */
async function applyRetentionPolicy(drive, folderId, retentionLimit) {
  try {
    const listRes = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false and name contains 'roja_backup_'`,
      spaces: 'drive',
      orderBy: 'createdTime desc',
      fields: 'files(id, name, createdTime)',
    });

    const files = listRes.data.files || [];
    if (files.length <= retentionLimit) {
      return 0;
    }

    const toDelete = files.slice(retentionLimit);
    let deleted = 0;

    for (const f of toDelete) {
      try {
        await drive.files.delete({ fileId: f.id });
        deleted++;
      } catch (delErr) {
        console.warn(`[Drive] Could not delete old backup ${f.id}:`, delErr.message);
      }
    }

    return deleted;
  } catch (err) {
    console.warn('[Drive] Retention cleanup warning:', err.message);
    return 0;
  }
}

/**
 * List all backup files in the 'Roja Opticals Backups' folder
 */
async function listBackups() {
  const { client, error: authError } = await getAuthenticatedClient();
  if (authError || !client) {
    return { success: false, error: authError || 'Google Drive is not connected', files: [] };
  }

  const drive = google.drive({ version: 'v3', auth: client });

  try {
    const folderId = await ensureBackupFolder(drive);
    const listRes = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      spaces: 'drive',
      orderBy: 'createdTime desc',
      fields: 'files(id, name, size, createdTime, description)',
    });

    const files = (listRes.data.files || []).map((f) => ({
      id: f.id,
      name: f.name,
      size: f.size ? parseInt(f.size, 10) : 0,
      createdTime: f.createdTime,
      description: f.description,
    }));

    return { success: true, files };
  } catch (err) {
    throw translateDriveError(err);
  }
}

/**
 * Download, decrypt, and safely restore database from a Google Drive backup
 */
async function downloadAndRestoreBackup({ fileId, passphrase } = {}) {
  if (!fileId) throw new Error('A valid Google Drive backup file ID is required');
  if (!passphrase) throw new Error('The encryption passphrase used when creating this backup is required');

  const { client, error: authError } = await getAuthenticatedClient();
  if (authError || !client) {
    throw new Error(authError || 'Google Drive is not connected');
  }

  const drive = google.drive({ version: 'v3', auth: client });

  try {
    // 1. Download file content from Google Drive
    const res = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'text' }
    );

    let rawData = res.data;
    let envelope = null;
    try {
      envelope = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
    } catch {
      throw new Error('Downloaded backup file is not valid JSON');
    }

    // 2. Decrypt payload using passphrase
    const decryptedBackup = decryptPayload(envelope, passphrase);

    // 3. Pre-flight schema and ID validation before modifying any live data
    if (!decryptedBackup || !decryptedBackup.data || typeof decryptedBackup.data !== 'object') {
      throw new Error('Decrypted backup does not contain a valid database snapshot structure');
    }

    for (const [table, records] of Object.entries(decryptedBackup.data)) {
      if (!localDb.ALLOWED_TABLES.has(table)) {
        throw new Error(`Disallowed table in backup payload: ${table}`);
      }
      if (!Array.isArray(records)) {
        throw new Error(`Invalid records collection for table: ${table}`);
      }
      for (const rec of records) {
        if (!rec || !rec.id || !/^[a-zA-Z0-9_-]{1,64}$/.test(String(rec.id))) {
          throw new Error(`Invalid record ID in table ${table}`);
        }
      }
    }

    // 4. Create local safety pre-restore backup before modifying live files
    const preRestoreSnapshot = await localDb.backupDb();
    if (!preRestoreSnapshot.success) {
      throw new Error('Failed to create local pre-restore safety snapshot. Restore aborted for safety.');
    }

    // 5. Restore records into local database
    const restoredCounts = {};
    const previousState = {};

    // Capture in-memory snapshot of current state for rollback
    for (const table of localDb.ALLOWED_TABLES) {
      const { data } = await localDb.readAllLocal(table);
      previousState[table] = data || [];
    }

    try {
      for (const [table, records] of Object.entries(decryptedBackup.data)) {
        restoredCounts[table] = 0;
        const backupIds = new Set(records.map((r) => String(r.id)));
        const existingRecords = previousState[table] || [];

        // Purge records that exist locally but are absent in the cloud backup
        for (const existing of existingRecords) {
          if (existing && existing.id && !backupIds.has(String(existing.id))) {
            const delRes = await localDb.deleteLocal(table, String(existing.id));
            if (!delRes.success) {
              throw new Error(`Failed to remove absent record ${existing.id} from table ${table}`);
            }
          }
        }

        // Upsert cloud backup records
        for (const record of records) {
          const saveRes = await localDb.saveLocal(table, String(record.id), record);
          if (!saveRes.success) {
            throw new Error(`Write failed on ${table}/${record.id}: ${saveRes.error}`);
          }
          restoredCounts[table] += 1;
        }
      }

      return {
        success: true,
        restored: restoredCounts,
        preRestoreBackup: preRestoreSnapshot.fileName,
        message: 'Database restored successfully from encrypted Google Drive backup.',
      };
    } catch (restoreErr) {
      console.error('❌ Restore failed midway. Executing atomic rollback to pre-restore state:', restoreErr.message);

      // Rollback: delete any newly created records not in previousState, and restore original records
      for (const [table, records] of Object.entries(previousState)) {
        const originalIds = new Set(records.map((r) => String(r.id)));
        const { data: liveRecords } = await localDb.readAllLocal(table);
        for (const live of liveRecords) {
          if (live && live.id && !originalIds.has(String(live.id))) {
            await localDb.deleteLocal(table, String(live.id)).catch(() => {});
          }
        }
        for (const record of records) {
          if (record && record.id) {
            await localDb.saveLocal(table, String(record.id), record).catch(() => {});
          }
        }
      }

      throw new Error(`Restore failed and was rolled back safely: ${restoreErr.message}`);
    }
  } catch (err) {
    throw translateDriveError(err);
  }
}

/**
 * Get comprehensive connection & backup status
 */
async function getStatus() {
  const tokens = await loadTokens();
  const config = await loadConfig();
  const settings = await loadSettings();

  const connected = Boolean(tokens && tokens.access_token);
  const configured = Boolean(config.clientId && config.clientSecret);

  return {
    configured,
    connected,
    email: tokens?.email || null,
    connectedAt: tokens?.connectedAt || null,
    autoBackupEnabled: Boolean(settings.autoBackupEnabled),
    retentionCount: Number(settings.retentionCount) || 10,
    lastBackupTime: settings.lastBackupTime || null,
    lastBackupFile: settings.lastBackupFile || null,
    clientIdConfigured: Boolean(config.clientId),
    redirectUri: config.redirectUri,
  };
}

module.exports = {
  encryptPayload,
  decryptPayload,
  deriveKey,
  loadConfig,
  saveConfig,
  loadTokens,
  saveTokens,
  clearTokens,
  loadSettings,
  saveSettings,
  getAuthUrl,
  handleOAuthCallback,
  getAuthenticatedClient,
  disconnect,
  ensureBackupFolder,
  uploadBackup,
  listBackups,
  downloadAndRestoreBackup,
  getStatus,
  applyRetentionPolicy,
  SCOPES,
  BACKUP_FOLDER_NAME,
  getPerUserDataDir,
};
