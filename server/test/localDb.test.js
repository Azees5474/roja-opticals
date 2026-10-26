const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs').promises;
const localDb = require('../lib/localDb');

test('Local Database Safety Suite', async (t) => {
  await localDb.initLocalDb();

  await t.test('Table and ID validation - rejects path traversal', async () => {
    // Non-whitelisted table name
    const badTableRes = await localDb.saveLocal('../outside_table', 'valid_id', { test: true });
    assert.equal(badTableRes.success, false);
    assert.match(badTableRes.error, /Invalid or disallowed table/i);

    // Path traversal in ID
    const badIdRes = await localDb.saveLocal('customers', '../../malicious', { test: true });
    assert.equal(badIdRes.success, false);
    assert.match(badIdRes.error, /Invalid record ID/i);

    // Reading with path traversal
    const readBadId = await localDb.readLocal('customers', '../../secrets');
    assert.equal(readBadId.success, false);

    // Deleting with path traversal
    const delBadId = await localDb.deleteLocal('customers', '../other');
    assert.equal(delBadId.success, false);
  });

  await t.test('Atomic write and persistence - saves, reads, and deletes valid records', async () => {
    const testId = `test_${Date.now()}`;
    const payload = { id: testId, name: 'Atomic Test Item', value: 42 };

    // 1. Save
    const saveRes = await localDb.saveLocal('inventory', testId, payload);
    assert.equal(saveRes.success, true);

    // 2. Read
    const readRes = await localDb.readLocal('inventory', testId);
    assert.equal(readRes.success, true);
    assert.equal(readRes.data.name, 'Atomic Test Item');
    assert.equal(readRes.data.value, 42);

    // 3. Update
    const updateRes = await localDb.updateLocal('inventory', testId, { value: 100 });
    assert.equal(updateRes.success, true);
    assert.equal(updateRes.data.value, 100);

    // 4. Verify no stray temp files left behind
    const inventoryDir = path.resolve(localDb.DB_DIR, 'inventory');
    const files = await fs.readdir(inventoryDir);
    const tempFiles = files.filter(f => f.startsWith(`.${testId}`));
    assert.equal(tempFiles.length, 0, 'Temporary files must be renamed or removed');

    // 5. Cleanup
    const delRes = await localDb.deleteLocal('inventory', testId);
    assert.equal(delRes.success, true);

    const readDeleted = await localDb.readLocal('inventory', testId);
    assert.equal(readDeleted.success, false);
  });

  await t.test('Concurrent writes - serialized write mutex prevents race conditions', async () => {
    const testId = `concurrent_${Date.now()}`;
    await localDb.saveLocal('inventory', testId, { id: testId, count: 0 });

    // Execute 10 concurrent updates
    const updates = Array.from({ length: 10 }, (_, i) =>
      localDb.updateLocal('inventory', testId, { count: i + 1 })
    );

    const results = await Promise.all(updates);
    assert.equal(results.every(r => r.success), true);

    // Final read must be valid JSON and have a valid count
    const finalRead = await localDb.readLocal('inventory', testId);
    assert.equal(finalRead.success, true);
    assert.ok(typeof finalRead.data.count === 'number');

    await localDb.deleteLocal('inventory', testId);
  });

  await t.test('Malformed file resilience - skips corrupt files without crashing readAllLocal', async () => {
    const corruptId = `corrupt_${Date.now()}`;
    const corruptPath = path.resolve(localDb.DB_DIR, 'inventory', `${corruptId}.json`);

    // Write a corrupt, unparseable JSON file
    await fs.writeFile(corruptPath, '{ this is invalid json !!!', 'utf8');

    // readAllLocal must not throw, and should return all valid records
    const all = await localDb.readAllLocal('inventory');
    assert.equal(all.success, true);
    assert.ok(Array.isArray(all.data));

    // Clean up corrupt test file
    await fs.unlink(corruptPath);
  });

  await t.test('Backup and restore - creates backup in local_database_backups and restores safely', async () => {
    const backupRes = await localDb.backupDb();
    assert.equal(backupRes.success, true);
    assert.ok(backupRes.file.includes('local_database_backups'));

    // Verify backup file exists and contains valid structure
    const content = await fs.readFile(backupRes.file, 'utf8');
    const parsed = JSON.parse(content);
    assert.equal(parsed.shop, 'Roja Opticals');
    assert.ok(parsed.data.customers);

    // Restore test
    const restoreRes = await localDb.restoreDb(backupRes.file);
    assert.equal(restoreRes.success, true);
    assert.ok(typeof restoreRes.restored === 'object');

    // Clean up test backup file and pre-restore copy
    await fs.unlink(backupRes.file).catch(() => {});
    if (restoreRes.preRestoreFile) {
      await fs.unlink(restoreRes.preRestoreFile).catch(() => {});
    }

    // 1. Path traversal in restoreDb
    const pathTraversalRestore = await localDb.restoreDb(path.resolve(__dirname, '../../outside.json'));
    assert.equal(pathTraversalRestore.success, false);
    assert.match(pathTraversalRestore.error, /Path traversal denied/i);

    // 2. Corrupt JSON in restoreDb
    const corruptBackupPath = path.resolve(localDb.BACKUP_DIR, `corrupt_${Date.now()}.json`);
    await fs.writeFile(corruptBackupPath, '{ broken json ...', 'utf8');
    const corruptRestore = await localDb.restoreDb(corruptBackupPath);
    assert.equal(corruptRestore.success, false);
    assert.match(corruptRestore.error, /Corrupted backup file/i);
    await fs.unlink(corruptBackupPath);

    // 3. Disallowed table in backup structure
    const maliciousBackupPath = path.resolve(localDb.BACKUP_DIR, `malicious_${Date.now()}.json`);
    await fs.writeFile(maliciousBackupPath, JSON.stringify({
      shop: 'Fake',
      data: {
        '../malicious_table': [{ id: '123' }],
      },
    }), 'utf8');
    const disallowedTableRestore = await localDb.restoreDb(maliciousBackupPath);
    assert.equal(disallowedTableRestore.success, false);
    assert.match(disallowedTableRestore.error, /Disallowed table/i);
    await fs.unlink(maliciousBackupPath);
  });

  await t.test('Restore dependable purge - deletes records absent from backup and preserves pre-restore copy', async () => {
    const keepId = `keep_${Date.now()}`;
    const absentId = `absent_${Date.now()}`;

    // 1. Save keepId and take backup
    await localDb.saveLocal('inventory', keepId, { id: keepId, name: 'Keep Item', stock: 5 });
    const backupRes = await localDb.backupDb();
    assert.equal(backupRes.success, true);

    // 2. Add absentId after backup is taken
    await localDb.saveLocal('inventory', absentId, { id: absentId, name: 'To Be Purged', stock: 1 });
    const beforeRestore = await localDb.readLocal('inventory', absentId);
    assert.equal(beforeRestore.success, true);

    // 3. Restore backup
    const restoreRes = await localDb.restoreDb(backupRes.file);
    assert.equal(restoreRes.success, true);
    assert.ok(restoreRes.preRestoreBackup);

    // 4. Verify absentId was purged upon restore
    const afterRestoreAbsent = await localDb.readLocal('inventory', absentId);
    assert.equal(afterRestoreAbsent.success, false, 'Record absent from backup must be deleted upon restore');

    // 5. Verify keepId is preserved
    const afterRestoreKeep = await localDb.readLocal('inventory', keepId);
    assert.equal(afterRestoreKeep.success, true);

    // 6. Verify pre-restore disk recovery copy was created
    const preRestorePath = path.resolve(localDb.BACKUP_DIR, restoreRes.preRestoreBackup);
    const exists = await fs.access(preRestorePath).then(() => true).catch(() => false);
    assert.equal(exists, true, 'Pre-restore backup file must exist on disk');

    // Cleanup
    await localDb.deleteLocal('inventory', keepId);
    await fs.unlink(backupRes.file).catch(() => {});
    await fs.unlink(preRestorePath).catch(() => {});
    if (restoreRes.preRestoreFile) {
      await fs.unlink(restoreRes.preRestoreFile).catch(() => {});
    }
  });
});
