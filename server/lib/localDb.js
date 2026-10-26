/**
 * Local Database Storage
 * ──────────────────────────────────────────────────────────
 * Stores data on local disk as JSON files for offline/laptop-local capability.
 *
 * Security and Reliability Guarantees:
 * - Allowed tables whitelist prevents path traversal and arbitrary file creation.
 * - ID validation restricts characters to safe alphanumeric/hyphen/underscore.
 * - Atomic writes via temporary files and atomic rename prevent file truncation on crash.
 * - Concurrency control via per-record write locks prevents race conditions.
 * - Corrupted files are safely isolated and skipped during read operations.
 * - Backups are saved in a dedicated local_database_backups directory.
 */

const fs = require('fs').promises;
const path = require('path');

function isTestEnv() {
  if (process.env.NODE_ENV === 'test') return true;
  if (process.env.ROJA_USE_LOCAL_DIR === 'true') return true;
  if (process.argv && process.argv.some(arg => typeof arg === 'string' && arg.includes('test'))) return true;
  return false;
}

// Local database and backup directories (supports Windows per-user AppData for desktop apps)
function getDbDir() {
  if (process.env.ROJA_DATA_DIR) {
    return path.resolve(process.env.ROJA_DATA_DIR);
  }
  if (isTestEnv()) {
    return path.resolve(__dirname, '../local_database');
  }
  if (process.env.APPDATA) {
    return path.resolve(process.env.APPDATA, 'RojaOpticals', 'data');
  }
  return path.resolve(__dirname, '../local_database');
}

function getBackupDir() {
  if (process.env.ROJA_BACKUP_DIR) {
    return path.resolve(process.env.ROJA_BACKUP_DIR);
  }
  if (isTestEnv()) {
    return path.resolve(__dirname, '../local_database_backups');
  }
  if (process.env.APPDATA) {
    return path.resolve(process.env.APPDATA, 'RojaOpticals', 'backups');
  }
  return path.resolve(__dirname, '../local_database_backups');
}

const DB_DIR = getDbDir();
const BACKUP_DIR = getBackupDir();

const ALLOWED_TABLES = new Set([
  'customers',
  'prescriptions',
  'followups',
  'billing',
  'orders',
  'inventory',
  'whatsapp_messages',
  'whatsapp_settings',
  'shop_settings',
  'users',
  'sheets_sync_log',
]);

// Per-record promise lock map to serialize concurrent writes
const writeLocks = new Map();

function withLock(key, fn) {
  const previous = writeLocks.get(key) || Promise.resolve();
  const current = (async () => {
    try {
      await previous;
    } catch {}
    return await fn();
  })();
  writeLocks.set(key, current);
  return current.finally(() => {
    if (writeLocks.get(key) === current) {
      writeLocks.delete(key);
    }
  });
}

function assertValidTable(table) {
  if (typeof table !== 'string' || !ALLOWED_TABLES.has(table)) {
    throw new Error(`Invalid or disallowed table: ${table}`);
  }
}

function assertValidId(id) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(id)) {
    throw new Error(`Invalid record ID format: ${id}`);
  }
}

function getRecordPath(table, id) {
  assertValidTable(table);
  assertValidId(id);
  const tableDir = path.resolve(getDbDir(), table);
  const targetPath = path.resolve(tableDir, `${id}.json`);
  const relative = path.relative(tableDir, targetPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Path traversal detected');
  }
  return targetPath;
}

// Ensure database directory exists
async function ensureDbDir() {
  try {
    await fs.mkdir(getDbDir(), { recursive: true });
    await fs.mkdir(getBackupDir(), { recursive: true });
  } catch (err) {
    console.error('Error creating local database directories:', err.message);
  }
}

// Initialize database directories
async function initLocalDb() {
  await ensureDbDir();

  for (const table of ALLOWED_TABLES) {
    const tableDir = path.resolve(getDbDir(), table);
    await fs.mkdir(tableDir, { recursive: true });
  }

  // Seed default shop settings and whatsapp settings if missing
  await initDefaultSettings();

  // Default shop and notification settings initialized above.
  // Note: Local users are provisioned dynamically via first-run setup in localAuth.js.
  console.log('📁 Local database initialized at:', getDbDir());
}

async function initDefaultSettings() {
  const SETTINGS_ID = '00000000-0000-0000-0000-000000000002';
  const existingShop = await readLocal('shop_settings', SETTINGS_ID);
  if (!existingShop.success) {
    await saveLocal('shop_settings', SETTINGS_ID, {
      id: SETTINGS_ID,
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
      updated_at: new Date().toISOString(),
    });
  }

  const WHATSAPP_SETTINGS_ID = '00000000-0000-0000-0000-000000000001';
  const existingWa = await readLocal('whatsapp_settings', WHATSAPP_SETTINGS_ID);
  if (!existingWa.success) {
    await saveLocal('whatsapp_settings', WHATSAPP_SETTINGS_ID, {
      id: WHATSAPP_SETTINGS_ID,
      enabled: true,
      welcome_message: true,
      review_30day: true,
      checkup_180day: true,
      next_visit_reminder: true,
      glasses_ready: true,
      payment_reminder: false,
      updated_at: new Date().toISOString(),
    });
  }
}

/**
 * Internal atomic save without acquiring lock (used internally by locked functions)
 */
async function saveLocalInternal(table, id, data) {
  assertValidTable(table);
  assertValidId(String(id));

  const idStr = String(id);
  const tableDir = path.resolve(getDbDir(), table);
  await fs.mkdir(tableDir, { recursive: true });

  const targetPath = getRecordPath(table, idStr);
  const tempFile = path.resolve(
    tableDir,
    `.${idStr}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`
  );

  try {
    await fs.writeFile(tempFile, JSON.stringify(data, null, 2), 'utf8');
    await fs.rename(tempFile, targetPath);
    return { success: true };
  } catch (err) {
    try { await fs.unlink(tempFile); } catch {}
    console.error(`❌ Local save failed (${table}/${idStr}):`, err.message);
    return { success: false, error: 'Write failed' };
  }
}

/**
 * Save data to local storage using atomic write with per-record locking
 */
async function saveLocal(table, id, data) {
  try {
    assertValidTable(table);
    assertValidId(String(id));

    const idStr = String(id);
    return await withLock(`${table}:${idStr}`, async () => {
      return await saveLocalInternal(table, idStr, data);
    });
  } catch (err) {
    console.error(`❌ Local save rejected (${table}/${id}):`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Read data from local storage
 */
async function readLocal(table, id) {
  try {
    assertValidTable(table);
    assertValidId(String(id));

    const filePath = getRecordPath(table, String(id));
    const data = await fs.readFile(filePath, 'utf8');
    return { success: true, data: JSON.parse(data) };
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { success: false, error: 'Not found' };
    }
    console.error(`❌ Local read failed (${table}/${id}):`, err.message);
    return { success: false, error: 'Failed to read record' };
  }
}

/**
 * Read all records from a table with safe error recovery
 */
async function readAllLocal(table) {
  try {
    assertValidTable(table);
    const tableDir = path.resolve(getDbDir(), table);
    await fs.mkdir(tableDir, { recursive: true });

    const files = await fs.readdir(tableDir);
    const records = [];

    for (const file of files) {
      // Ignore hidden/temporary files
      if (!file.endsWith('.json') || file.startsWith('.')) continue;

      const filePath = path.resolve(tableDir, file);
      try {
        const data = await fs.readFile(filePath, 'utf8');
        const parsed = JSON.parse(data);
        if (parsed && typeof parsed === 'object') {
          records.push(parsed);
        }
      } catch (parseErr) {
        console.warn(`⚠️ Corrupt file skipped (${table}/${file}):`, parseErr.message);
      }
    }

    return { success: true, data: records };
  } catch (err) {
    console.error(`❌ Local read all failed (${table}):`, err.message);
    return { success: false, error: 'Failed to read table records', data: [] };
  }
}

/**
 * Delete data from local storage
 */
async function deleteLocal(table, id) {
  try {
    assertValidTable(table);
    assertValidId(String(id));

    const filePath = getRecordPath(table, String(id));
    return await withLock(`${table}:${id}`, async () => {
      try {
        await fs.unlink(filePath);
        return { success: true };
      } catch (err) {
        if (err.code === 'ENOENT') {
          return { success: true }; // Already deleted
        }
        throw err;
      }
    });
  } catch (err) {
    console.error(`❌ Local delete failed (${table}/${id}):`, err.message);
    return { success: false, error: 'Failed to delete record' };
  }
}

/**
 * Update data in local storage
 */
async function updateLocal(table, id, updates) {
  try {
    assertValidTable(table);
    assertValidId(String(id));

    const idStr = String(id);
    return await withLock(`${table}:${idStr}`, async () => {
      const { success, data: existing } = await readLocal(table, idStr);
      if (!success || !existing) {
        return { success: false, error: 'Record not found' };
      }

      const updated = {
        ...existing,
        ...updates,
        updated_at: new Date().toISOString(),
      };

      const saveRes = await saveLocalInternal(table, idStr, updated);
      if (!saveRes.success) return saveRes;

      return { success: true, data: updated };
    });
  } catch (err) {
    console.error(`❌ Local update failed (${table}/${id}):`, err.message);
    return { success: false, error: 'Update failed' };
  }
}

/**
 * Get database statistics
 */
async function getDbStats() {
  const stats = {};
  for (const table of ALLOWED_TABLES) {
    const { data } = await readAllLocal(table);
    stats[table] = data.length;
  }
  return stats;
}

/**
 * Backup entire database to a single atomic file in BACKUP_DIR
 */
async function backupDb() {
  try {
    await fs.mkdir(getBackupDir(), { recursive: true });

    const backup = {
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      shop: 'Roja Opticals',
      data: {},
    };

    for (const table of ALLOWED_TABLES) {
      const { data } = await readAllLocal(table);
      backup.data[table] = data;
    }

    const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `backup_${timestampStr}.json`;
    const backupFile = path.resolve(getBackupDir(), fileName);
    const tempBackupFile = path.resolve(getBackupDir(), `.${fileName}.tmp`);

    await fs.writeFile(tempBackupFile, JSON.stringify(backup, null, 2), 'utf8');
    await fs.rename(tempBackupFile, backupFile);

    console.log('💾 Database backup created:', backupFile);
    return { success: true, file: backupFile, fileName };
  } catch (err) {
    console.error('❌ Backup failed:', err.message);
    return { success: false, error: 'Backup creation failed' };
  }
}

/**
 * Restore database from a backup JSON file with pre-flight validation and atomic rollback
 */
async function restoreDb(backupFilePath) {
  const resolvedPath = path.resolve(backupFilePath);
  // Strict path traversal check
  if (!resolvedPath.startsWith(getBackupDir())) {
    return { success: false, error: 'Path traversal denied: backup file must be inside local_database_backups' };
  }

  let content = null;
  try {
    content = await fs.readFile(resolvedPath, 'utf8');
  } catch (err) {
    return { success: false, error: 'Unable to read backup file: ' + err.message };
  }

  let backup = null;
  try {
    backup = JSON.parse(content);
  } catch (err) {
    return { success: false, error: 'Corrupted backup file: Invalid JSON syntax' };
  }

  if (!backup || !backup.data || typeof backup.data !== 'object') {
    return { success: false, error: 'Invalid backup structure: missing data payload' };
  }

  // Pre-flight validation: check all tables and record IDs before modifying disk
  for (const [table, records] of Object.entries(backup.data)) {
    if (!ALLOWED_TABLES.has(table)) {
      return { success: false, error: `Disallowed table in backup: ${table}` };
    }
    if (!Array.isArray(records)) {
      return { success: false, error: `Invalid records array for table: ${table}` };
    }
    for (const record of records) {
      if (!record || !record.id || !/^[a-zA-Z0-9_-]{1,64}$/.test(String(record.id))) {
        return { success: false, error: `Invalid record ID in backup for table ${table}` };
      }
    }
  }

  // Pre-restore safety copy: Write full backup to disk before making any changes
  const preRestoreRes = await backupDb();
  if (!preRestoreRes.success) {
    return { success: false, error: 'Failed to create pre-restore safety backup file. Restore aborted.' };
  }

  // Take safety snapshot of current database state for automatic rollback if needed
  const safetySnapshot = {};
  for (const table of ALLOWED_TABLES) {
    const { data: currentRecords } = await readAllLocal(table);
    safetySnapshot[table] = currentRecords || [];
  }

  const restoredCounts = {};
  try {
    for (const [table, records] of Object.entries(backup.data)) {
      restoredCounts[table] = 0;
      const backupIds = new Set(records.map(r => String(r.id)));
      const existingRecords = safetySnapshot[table] || [];

      // Purge records that exist locally but are absent from the backup
      for (const existing of existingRecords) {
        if (existing && existing.id && !backupIds.has(String(existing.id))) {
          const delRes = await deleteLocal(table, String(existing.id));
          if (!delRes.success) {
            throw new Error(`Failed to remove absent record ${existing.id} from table ${table}`);
          }
        }
      }

      // Upsert backup records
      for (const record of records) {
        const saveRes = await saveLocal(table, String(record.id), record);
        if (!saveRes.success) {
          throw new Error(`Write failed on table ${table}: ${saveRes.error}`);
        }
        restoredCounts[table] += 1;
      }
    }

    console.log('🔄 Database restored successfully from:', resolvedPath);
    return {
      success: true,
      restored: restoredCounts,
      preRestoreBackup: preRestoreRes.fileName,
      preRestoreFile: preRestoreRes.file,
    };
  } catch (err) {
    console.error('❌ Database restore error encountered. Rolling back to pre-restore snapshot:', err.message);
    // Automatic Rollback: delete any newly created records not in safetySnapshot, and restore original records
    for (const [table, currentRecords] of Object.entries(safetySnapshot)) {
      const originalIds = new Set(currentRecords.map(r => String(r.id)));
      const { data: liveRecords } = await readAllLocal(table);
      for (const live of liveRecords) {
        if (live && live.id && !originalIds.has(String(live.id))) {
          await deleteLocal(table, String(live.id)).catch(() => {});
        }
      }
      for (const record of currentRecords) {
        if (record && record.id) {
          await saveLocal(table, String(record.id), record).catch(() => {});
        }
      }
    }
    return {
      success: false,
      error: 'Restore failed and was rolled back: ' + err.message,
      preRestoreBackup: preRestoreRes.fileName,
    };
  }
}

module.exports = {
  initLocalDb,
  saveLocal,
  saveLocalInternal,
  readLocal,
  readAllLocal,
  deleteLocal,
  updateLocal,
  getDbStats,
  backupDb,
  restoreDb,
  assertValidTable,
  assertValidId,
  ALLOWED_TABLES,
  get DB_DIR() { return getDbDir(); },
  get BACKUP_DIR() { return getBackupDir(); },
  getDbDir,
  getBackupDir,
};
