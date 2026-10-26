const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const http = require('http');

process.env.LOCAL_MODE = 'true';
process.env.DISABLE_SCHEDULER = 'true';

const serverModule = require('../index');
const localDb = require('../lib/localDb');
const localAuth = require('../lib/localAuth');

test('Desktop Packaging & Electron Integration Suite', async (t) => {
  const TEST_PORT = 5099;
  const TEST_HOST = '127.0.0.1';

  await t.test('Lifecycle: startServer and stopServer on loopback', async () => {
    process.env.LOCAL_MODE = 'true';
    // 1. Start server programmatically on test port
    const started = await serverModule.startServer({ port: TEST_PORT, host: TEST_HOST });
    assert.equal(started.port, TEST_PORT);
    assert.equal(started.host, TEST_HOST);

    // 2. Query /api/health
    const healthData = await new Promise((resolve, reject) => {
      http.get(`http://${TEST_HOST}:${TEST_PORT}/api/health`, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          assert.equal(res.statusCode, 200);
          resolve(JSON.parse(body));
        });
      }).on('error', reject);
    });

    assert.equal(healthData.status, 'OK');
    assert.equal(healthData.shop, 'Roja Opticals');
    assert.equal(healthData.mode, 'local');

    // 3. Query /api/auth/setup-status
    const setupData = await new Promise((resolve, reject) => {
      http.get(`http://${TEST_HOST}:${TEST_PORT}/api/auth/setup-status`, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          assert.equal(res.statusCode, 200);
          resolve(JSON.parse(body));
        });
      }).on('error', reject);
    });

    assert.equal(typeof setupData.setupNeeded, 'boolean');

    // 4. Clean shutdown
    await serverModule.stopServer();

    // Verify port is freed
    const portClosed = await new Promise((resolve) => {
      const req = http.get(`http://${TEST_HOST}:${TEST_PORT}/api/health`, () => {
        resolve(false);
      });
      req.on('error', () => {
        resolve(true); // Connection refused, port is freed
      });
    });

    assert.equal(portClosed, true, 'Port should be closed after stopServer');
  });

  await t.test('AppData Isolation: dynamic ROJA_DATA_DIR and ROJA_BACKUP_DIR', async () => {
    const tempDir = path.resolve(__dirname, 'temp_appdata_test');
    const customDataDir = path.resolve(tempDir, 'data');
    const customBackupDir = path.resolve(tempDir, 'backups');

    process.env.ROJA_DATA_DIR = customDataDir;
    process.env.ROJA_BACKUP_DIR = customBackupDir;

    try {
      assert.equal(path.resolve(localDb.DB_DIR), customDataDir);
      assert.equal(path.resolve(localDb.BACKUP_DIR), customBackupDir);

      // Save record in custom data dir
      const testRecord = { id: 'cust_desktop_1', name: 'Desktop Test Customer' };
      const saveRes = await localDb.saveLocal('customers', 'cust_desktop_1', testRecord);
      assert.equal(saveRes.success, true);

      // Verify file was created inside customDataDir
      const expectedFilePath = path.resolve(customDataDir, 'customers', 'cust_desktop_1.json');
      assert.ok(fsSync.existsSync(expectedFilePath), 'Record file must exist in customDataDir');

      // Create backup in customBackupDir
      const backupRes = await localDb.backupDb();
      assert.equal(backupRes.success, true);
      assert.ok(backupRes.file.startsWith(customBackupDir), 'Backup must be saved inside customBackupDir');
      assert.ok(fsSync.existsSync(backupRes.file), 'Backup file must exist on disk');
    } finally {
      // Clean up temp directory
      delete process.env.ROJA_DATA_DIR;
      delete process.env.ROJA_BACKUP_DIR;
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  await t.test('Windows Installer & Package Verification', async () => {
    const installerPath = path.resolve(__dirname, '../../dist-electron/Roja Opticals Setup 1.0.0.exe');
    assert.ok(fsSync.existsSync(installerPath), `Installer executable must exist at: ${installerPath}`);

    const stat = await fs.stat(installerPath);
    assert.ok(stat.size > 50 * 1024 * 1024, `Installer size should be > 50MB, got: ${stat.size} bytes`);

    // Verify Windows executable MZ header
    const fileHandle = await fs.open(installerPath, 'r');
    const headerBuf = Buffer.alloc(2);
    await fileHandle.read(headerBuf, 0, 2, 0);
    await fileHandle.close();
    assert.equal(headerBuf.toString('ascii'), 'MZ', 'Installer must be a valid Windows PE/MZ binary');

    // Verify unpacked resources
    const unpackedServerDir = path.resolve(__dirname, '../../dist-electron/win-unpacked/resources/app.asar.unpacked/server');
    const unpackedDistDir = path.resolve(__dirname, '../../dist-electron/win-unpacked/resources/app.asar.unpacked/app/dist');
    assert.ok(fsSync.existsSync(unpackedServerDir), 'Server directory must exist in unpacked resources');
    assert.ok(fsSync.existsSync(unpackedDistDir), 'Frontend dist directory must exist in unpacked resources');

    // CRITICAL: Verify electron-builder.json packaging rules strictly exclude sensitive data
    const builderConfigPath = path.resolve(__dirname, '../../electron-builder.json');
    assert.ok(fsSync.existsSync(builderConfigPath), 'electron-builder.json must exist');
    const builderConfig = JSON.parse(await fs.readFile(builderConfigPath, 'utf8'));
    const files = builderConfig.files || [];
    assert.ok(files.some(f => f.includes('!server/.env*')), 'Packaging must exclude .env files');
    assert.ok(files.some(f => f.includes('!server/**/.auth_secret*') || f.includes('!server/.auth_secret*')), 'Packaging must exclude .auth_secret');
    assert.ok(files.some(f => f.includes('!server/local_database*/**')), 'Packaging must exclude local_database');
    assert.ok(files.some(f => f.includes('!server/local_database_backups*')), 'Packaging must exclude backups');
    assert.ok(files.some(f => f.includes('!server/test/**')), 'Packaging must exclude test directory');

    // CRITICAL: Ensure no customer records, secrets, backups, or test artifacts exist in unpacked resources
    const unpackedLocalDb = path.resolve(unpackedServerDir, 'local_database');
    const unpackedEnv = path.resolve(unpackedServerDir, '.env');
    const unpackedSecret = path.resolve(unpackedServerDir, '.auth_secret');
    const unpackedBackups = path.resolve(unpackedServerDir, 'local_database_backups');
    const unpackedTest = path.resolve(unpackedServerDir, 'test');
    assert.equal(fsSync.existsSync(unpackedLocalDb), false, 'Customer database must NEVER be packaged into installer');
    assert.equal(fsSync.existsSync(unpackedEnv), false, 'Environment secrets must NEVER be packaged into installer');
    assert.equal(fsSync.existsSync(unpackedSecret), false, 'Auth secret must NEVER be packaged into installer');
    assert.equal(fsSync.existsSync(unpackedBackups), false, 'Database backups must NEVER be packaged into installer');
    assert.equal(fsSync.existsSync(unpackedTest), false, 'Test directory must NEVER be packaged into installer');
  });
});
