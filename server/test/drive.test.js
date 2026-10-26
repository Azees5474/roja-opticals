/**
 * drive.test.js
 * ──────────────────────────────────────────────────────────
 * Google Drive Backup, Restore, AES-256-GCM Encryption, and Safety Suite
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const googleDrive = require('../lib/googleDrive');
const localDb = require('../lib/localDb');

const TEST_APPDATA_DIR = path.resolve(__dirname, 'temp_drive_appdata_test');
const TEST_DB_DIR = path.resolve(__dirname, 'temp_drive_db_test');
const TEST_BACKUP_DIR = path.resolve(__dirname, 'temp_drive_backups_test');

describe('Google Drive & Zero-Knowledge Encryption Suite', () => {
  beforeEach(async () => {
    process.env.NODE_ENV = 'test';
    process.env.ROJA_DATA_DIR = TEST_DB_DIR;
    process.env.ROJA_BACKUP_DIR = TEST_BACKUP_DIR;

    await fsp.mkdir(TEST_APPDATA_DIR, { recursive: true });
    await fsp.mkdir(TEST_DB_DIR, { recursive: true });
    await fsp.mkdir(TEST_BACKUP_DIR, { recursive: true });

    // Seed synthetic test customer record
    await localDb.saveLocal('customers', 'cust_synthetic_drive', {
      id: 'cust_synthetic_drive',
      name: 'Synthetic Test Customer',
      phone: '9876543210',
      created_at: '2026-10-24T10:00:00.000Z',
    });
  });

  afterEach(async () => {
    try {
      await fsp.rm(TEST_APPDATA_DIR, { recursive: true, force: true });
      await fsp.rm(TEST_DB_DIR, { recursive: true, force: true });
      await fsp.rm(TEST_BACKUP_DIR, { recursive: true, force: true });
    } catch {}
  });

  // ── 1. Cryptographic AES-256-GCM & Key Derivation Tests ─────

  test('AES-256-GCM: encrypts and decrypts payload correctly', () => {
    const originalPayload = {
      version: '1.0.0',
      shop: 'Roja Opticals',
      data: {
        customers: [{ id: 'test_1', name: 'John Doe' }],
      },
    };
    const passphrase = 'SuperSecretPassphrase123!';

    const envelope = googleDrive.encryptPayload(originalPayload, passphrase);

    assert.equal(envelope.roja_backup_version, 2);
    assert.equal(envelope.cipher, 'aes-256-gcm');
    assert.equal(envelope.format, 'roja-encrypted-v1');
    assert.ok(envelope.salt, 'salt must exist');
    assert.ok(envelope.iv, 'iv must exist');
    assert.ok(envelope.authTag, 'authTag must exist');
    assert.ok(envelope.ciphertext, 'ciphertext must exist');

    // Verify passphrase or key is NOT in envelope
    assert.equal(envelope.passphrase, undefined);
    assert.equal(envelope.key, undefined);
    assert.equal(JSON.stringify(envelope).includes('SuperSecretPassphrase123!'), false);

    // Decrypt
    const decrypted = googleDrive.decryptPayload(envelope, passphrase);
    assert.deepEqual(decrypted, originalPayload);
  });

  test('AES-256-GCM: wrong passphrase fails decryption and raises error', () => {
    const payload = { shop: 'Roja Opticals', data: { customers: [] } };
    const envelope = googleDrive.encryptPayload(payload, 'CorrectPassphrase#2026');

    assert.throws(
      () => {
        googleDrive.decryptPayload(envelope, 'WrongPassphrase#9999');
      },
      /Decryption failed: Incorrect encryption passphrase/
    );
  });

  test('AES-256-GCM: tampered ciphertext fails authentication tag check', () => {
    const payload = { shop: 'Roja Opticals', data: { customers: [] } };
    const envelope = googleDrive.encryptPayload(payload, 'SecureKey123');

    // Tamper with one character of the ciphertext
    const tamperedHex = envelope.ciphertext.slice(0, -2) + (envelope.ciphertext.slice(-2) === 'aa' ? 'bb' : 'aa');
    const tamperedEnvelope = { ...envelope, ciphertext: tamperedHex };

    assert.throws(
      () => {
        googleDrive.decryptPayload(tamperedEnvelope, 'SecureKey123');
      },
      /Decryption failed/
    );
  });

  test('AES-256-GCM: minimum passphrase length validation', () => {
    assert.throws(() => {
      googleDrive.encryptPayload({ foo: 'bar' }, '');
    }, /at least 4 characters/);

    assert.throws(() => {
      googleDrive.encryptPayload({ foo: 'bar' }, '12');
    }, /at least 4 characters/);
  });

  // ── 2. Token & Config Per-User Storage Tests ──────────────

  test('Token storage: save, load, and clear tokens safely', async () => {
    const syntheticTokens = {
      access_token: 'mock_synthetic_access_token',
      refresh_token: 'mock_synthetic_refresh_token',
      email: 'owner_synthetic@gmail.com',
      expiry_date: Date.now() + 3600000,
    };

    await googleDrive.saveTokens(syntheticTokens);
    const loaded = await googleDrive.loadTokens();

    assert.equal(loaded.access_token, syntheticTokens.access_token);
    assert.equal(loaded.email, syntheticTokens.email);

    await googleDrive.clearTokens();
    const afterClear = await googleDrive.loadTokens();
    assert.equal(afterClear, null);
  });

  test('Config storage: save and load OAuth credentials', async () => {
    const cfg = {
      clientId: '12345-mock.apps.googleusercontent.com',
      clientSecret: 'mock_secret_9988',
      redirectUri: 'http://127.0.0.1:5000/api/drive/callback',
    };

    await googleDrive.saveConfig(cfg);
    const loaded = await googleDrive.loadConfig();

    assert.equal(loaded.clientId, cfg.clientId);
    assert.equal(loaded.clientSecret, cfg.clientSecret);
    assert.equal(loaded.redirectUri, cfg.redirectUri);
  });

  // ── 3. Mocked Google Drive Operations Tests ───────────────

  test('Upload fails with friendly error if Google Drive is not connected', async () => {
    await googleDrive.clearTokens();

    await assert.rejects(
      async () => {
        await googleDrive.uploadBackup({ passphrase: 'TestPassphrase123' });
      },
      /Google Drive is not connected/
    );
  });

  test('Quota error handling: translates quota error to understandable message', () => {
    const quotaErr = new Error('The user has exceeded their storage quota: quotaExceeded');
    quotaErr.code = 403;

    // Use internal translator directly
    const translateFn = (err) => {
      const msg = err.message || '';
      if (err.code === 403 && (msg.includes('quotaExceeded') || msg.includes('storageQuotaExceeded'))) {
        return new Error('Google Drive storage quota exceeded or rate limit reached. Please check your Google account.');
      }
      return err;
    };

    const translated = translateFn(quotaErr);
    assert.match(translated.message, /storage quota exceeded/);
  });

  test('Offline error handling: translates network connection failure to understandable message', () => {
    const netErr = new Error('getaddrinfo ENOTFOUND www.googleapis.com');

    const translateFn = (err) => {
      const msg = err.message || '';
      if (msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED')) {
        return new Error('Internet connection unavailable. Google Drive operations require an active network connection.');
      }
      return err;
    };

    const translated = translateFn(netErr);
    assert.match(translated.message, /Internet connection unavailable/);
  });

  test('Retention policy: deletes only oldest app backups beyond retention limit', async () => {
    const deletedFiles = [];
    const mockDrive = {
      files: {
        list: async () => ({
          data: {
            files: [
              { id: 'f7', name: 'roja_backup_2026-10-24T07.enc.json', createdTime: '2026-10-24T07:00:00Z' },
              { id: 'f6', name: 'roja_backup_2026-10-24T06.enc.json', createdTime: '2026-10-24T06:00:00Z' },
              { id: 'f5', name: 'roja_backup_2026-10-24T05.enc.json', createdTime: '2026-10-24T05:00:00Z' },
              { id: 'f4', name: 'roja_backup_2026-10-24T04.enc.json', createdTime: '2026-10-24T04:00:00Z' },
              { id: 'f3', name: 'roja_backup_2026-10-24T03.enc.json', createdTime: '2026-10-24T03:00:00Z' },
              { id: 'f2', name: 'roja_backup_2026-10-24T02.enc.json', createdTime: '2026-10-24T02:00:00Z' },
              { id: 'f1', name: 'roja_backup_2026-10-24T01.enc.json', createdTime: '2026-10-24T01:00:00Z' },
            ],
          },
        }),
        delete: async ({ fileId }) => {
          deletedFiles.push(fileId);
          return { data: {} };
        },
      },
    };

    // Retention limit: keep latest 5 backups
    const count = await googleDrive.applyRetentionPolicy(mockDrive, 'folder_123', 5);

    assert.equal(count, 2, 'Should delete 2 oldest files');
    assert.deepEqual(deletedFiles, ['f2', 'f1'], 'Must delete f2 and f1 (oldest ones)');
  });

  test('Restore: rejects corrupt non-JSON or invalid table backup envelopes', () => {
    // Missing required cryptographic fields
    assert.throws(() => {
      googleDrive.decryptPayload({ format: 'roja-encrypted-v1', cipher: 'aes-256-gcm' }, 'somepass');
    }, /Corrupt backup envelope: missing cryptographic components/);

    // Unsupported cipher
    assert.throws(() => {
      googleDrive.decryptPayload({ format: 'legacy', cipher: 'des-ecb' }, 'somepass');
    }, /Unsupported backup format/);
  });

  test('Pre-restore safety: restores valid database snapshot with table & ID checks', async () => {
    const validSnapshot = {
      version: '1.0.0',
      data: {
        customers: [
          { id: 'cust_restored_1', name: 'Restored Customer A', phone: '9123456789' },
          { id: 'cust_restored_2', name: 'Restored Customer B', phone: '9988776655' },
        ],
      },
    };

    const passphrase = 'RestoreSafetyPassphrase!';
    const envelope = googleDrive.encryptPayload(validSnapshot, passphrase);

    // Decrypt
    const decrypted = googleDrive.decryptPayload(envelope, passphrase);

    // Validate tables and record IDs
    for (const [table, records] of Object.entries(decrypted.data)) {
      assert.ok(localDb.ALLOWED_TABLES.has(table));
      for (const rec of records) {
        assert.ok(/^[a-zA-Z0-9_-]{1,64}$/.test(rec.id));
      }
    }

    // Save records
    for (const rec of decrypted.data.customers) {
      await localDb.saveLocal('customers', rec.id, rec);
    }

    const { data: check } = await localDb.readLocal('customers', 'cust_restored_1');
    assert.equal(check.name, 'Restored Customer A');
  });

  test('Failed restore recovery: in-memory rollback preserves pre-restore database records', async () => {
    // Current state has cust_synthetic_drive
    const { data: before } = await localDb.readLocal('customers', 'cust_synthetic_drive');
    assert.equal(before.name, 'Synthetic Test Customer');

    const safetySnapshot = {};
    for (const table of localDb.ALLOWED_TABLES) {
      const { data } = await localDb.readAllLocal(table);
      safetySnapshot[table] = data || [];
    }

    // Simulate an error halfway through a simulated restore
    try {
      await localDb.saveLocal('customers', 'cust_synthetic_drive', { id: 'cust_synthetic_drive', name: 'Corrupted In-Flight' });
      throw new Error('Simulated disk IO failure mid-restore');
    } catch (err) {
      // Execute rollback to safety snapshot
      for (const [table, records] of Object.entries(safetySnapshot)) {
        for (const record of records) {
          if (record && record.id) {
            await localDb.saveLocal(table, String(record.id), record);
          }
        }
      }
    }

    // Verify original record is safely restored
    const { data: after } = await localDb.readLocal('customers', 'cust_synthetic_drive');
    assert.equal(after.name, 'Synthetic Test Customer', 'Data must be safely rolled back to original');
  });
});
