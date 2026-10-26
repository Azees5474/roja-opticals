process.env.NODE_ENV = 'test';
process.env.LOCAL_MODE = 'true';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const crypto = require('crypto');
const localDb = require('../lib/localDb');
const localAuth = require('../lib/localAuth');
const { app } = require('../index');

function makeRequest(app, method, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const options = {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
      };

      const req = http.request(options, (res) => {
        let rawData = '';
        res.on('data', chunk => { rawData += chunk; });
        res.on('end', () => {
          server.close();
          let json = null;
          try { json = JSON.parse(rawData); } catch {}
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: json || rawData,
          });
        });
      });

      req.on('error', err => {
        server.close();
        reject(err);
      });

      if (body) {
        req.write(typeof body === 'string' ? body : JSON.stringify(body));
      }
      req.end();
    });
  });
}

test('HTTP Routes & Role Enforcement Integration Suite', async (t) => {
  // Provision isolated synthetic test accounts
  const testOwnerEmail = 'test_owner_suite@rojaopticals.com';
  const testOwnerPass = 'TestOwner@Suite2026';
  const ownerSalt = crypto.randomBytes(16).toString('hex');
  const ownerId = '10000000-0000-0000-0000-000000000001';
  await localDb.saveLocal('users', ownerId, {
    id: ownerId,
    email: testOwnerEmail,
    name: 'Test Owner',
    role: 'owner',
    salt: ownerSalt,
    password_hash: localAuth.hashPassword(testOwnerPass, ownerSalt),
    created_at: new Date().toISOString(),
  });

  const testStaffEmail = 'test_staff_suite@rojaopticals.com';
  const testStaffPass = 'TestStaff@Suite2026';
  const staffSalt = crypto.randomBytes(16).toString('hex');
  const staffId = '10000000-0000-0000-0000-000000000002';
  await localDb.saveLocal('users', staffId, {
    id: staffId,
    email: testStaffEmail,
    name: 'Test Staff',
    role: 'staff',
    salt: staffSalt,
    password_hash: localAuth.hashPassword(testStaffPass, staffSalt),
    created_at: new Date().toISOString(),
  });

  let ownerToken = '';
  let staffToken = '';

  await t.test('Health check - returns OK status and local/hybrid mode', async () => {
    const res = await makeRequest(app, 'GET', '/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'OK');
    assert.equal(res.body.shop, 'Roja Opticals');
    assert.ok(res.body.mode);
  });

  await t.test('GET /api/auth/setup-status - returns setup status', async () => {
    const res = await makeRequest(app, 'GET', '/api/auth/setup-status');
    assert.equal(res.status, 200);
    assert.equal(typeof res.body.setupNeeded, 'boolean');
  });

  await t.test('POST /api/auth/login - authenticates owner and returns authoritative role claim', async () => {
    const res = await makeRequest(app, 'POST', '/api/auth/login', {}, {
      email: testOwnerEmail,
      password: testOwnerPass,
    });

    assert.equal(res.status, 200);
    assert.ok(res.body.access_token);
    assert.equal(res.body.user.role, 'owner');
    assert.equal(res.body.user.app_metadata.role, 'owner');
    ownerToken = res.body.access_token;
  });

  await t.test('POST /api/auth/login - authenticates staff and returns authoritative role claim', async () => {
    const res = await makeRequest(app, 'POST', '/api/auth/login', {}, {
      email: testStaffEmail,
      password: testStaffPass,
    });

    assert.equal(res.status, 200);
    assert.ok(res.body.access_token);
    assert.equal(res.body.user.role, 'staff');
    assert.equal(res.body.user.app_metadata.role, 'staff');
    staffToken = res.body.access_token;
  });

  await t.test('POST /api/auth/login - rejects invalid credentials with 401', async () => {
    const res = await makeRequest(app, 'POST', '/api/auth/login', {}, {
      email: testOwnerEmail,
      password: 'WrongPassword123!',
    });

    assert.equal(res.status, 401);
    assert.equal(res.body.message, 'Invalid email or password');
  });

  await t.test('Unauthenticated access blocked - rejects requests without bearer token with 401', async () => {
    const custRes = await makeRequest(app, 'GET', '/api/customers');
    assert.equal(custRes.status, 401);

    const billRes = await makeRequest(app, 'GET', '/api/billing');
    assert.equal(billRes.status, 401);

    const setRes = await makeRequest(app, 'GET', '/api/settings');
    assert.equal(setRes.status, 401);
  });

  await t.test('Owner-only protection - staff token cannot delete customer (403 Forbidden)', async () => {
    const res = await makeRequest(app, 'DELETE', '/api/customers/any-id-123', {
      Authorization: `Bearer ${staffToken}`,
    });

    assert.equal(res.status, 403);
    assert.match(res.body.message, /Owner access is required/i);
  });

  await t.test('Owner-only protection - staff token cannot modify shop settings (403 Forbidden)', async () => {
    const res = await makeRequest(app, 'PUT', '/api/settings', {
      Authorization: `Bearer ${staffToken}`,
    }, {
      shop: { name: 'Hacked Shop', phone: '9876543210', email: 'test@shop.com' },
      notifications: {},
    });

    assert.equal(res.status, 403);
    assert.match(res.body.message, /Owner access is required/i);
  });

  await t.test('Owner-only protection - staff token cannot delete orders or inventory (403 Forbidden)', async () => {
    const orderRes = await makeRequest(app, 'DELETE', '/api/orders/order-1', {
      Authorization: `Bearer ${staffToken}`,
    });
    assert.equal(orderRes.status, 403);

    const invRes = await makeRequest(app, 'DELETE', '/api/inventory/inv-1', {
      Authorization: `Bearer ${staffToken}`,
    });
    assert.equal(invRes.status, 403);
  });

  await t.test('Owner-only protection - staff token cannot backup, restore, sync sheets, or run whatsapp scheduler', async () => {
    const backupRes = await makeRequest(app, 'POST', '/api/sync/backup', {
      Authorization: `Bearer ${staffToken}`,
    });
    assert.equal(backupRes.status, 403);

    const restoreRes = await makeRequest(app, 'POST', '/api/sync/restore', {
      Authorization: `Bearer ${staffToken}`,
    }, { fileName: 'backup.json' });
    assert.equal(restoreRes.status, 403);

    const sheetsRes = await makeRequest(app, 'POST', '/api/sheets/full-sync', {
      Authorization: `Bearer ${staffToken}`,
    });
    assert.equal(sheetsRes.status, 403);

    const waRes = await makeRequest(app, 'POST', '/api/whatsapp/run-now', {
      Authorization: `Bearer ${staffToken}`,
    });
    assert.equal(waRes.status, 403);
  });

  await t.test('Owner permissions - owner token CAN update shop settings', async () => {
    const res = await makeRequest(app, 'PUT', '/api/settings', {
      Authorization: `Bearer ${ownerToken}`,
    }, {
      shop: {
        name: 'Roja Opticals',
        phone: '9876543210',
        email: 'info@rojaopticals.com',
        address: '12, Gandhi Street, Salem',
        gstin: '33AAAXXX1234X1Z5',
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

    assert.equal(res.status, 200);
    assert.equal(res.body.shop.name, 'Roja Opticals');
  });

  await t.test('Customer workflow - staff can create and view customers', async () => {
    // 1. Validation failure: missing/invalid phone
    const failRes = await makeRequest(app, 'POST', '/api/customers', {
      Authorization: `Bearer ${staffToken}`,
    }, {
      name: 'Test Customer',
      phone: 'invalid',
    });
    assert.equal(failRes.status, 400);

    // 2. Success creation
    const createRes = await makeRequest(app, 'POST', '/api/customers', {
      Authorization: `Bearer ${staffToken}`,
    }, {
      name: 'Integration Test Customer',
      phone: '+91 9876543210',
      email: 'integration@test.com',
      age: 40,
    });
    assert.equal(createRes.status, 201);
    assert.ok(createRes.body.id);
    const createdId = createRes.body.id;

    // 3. Retrieve customer
    const getRes = await makeRequest(app, 'GET', `/api/customers/${createdId}`, {
      Authorization: `Bearer ${staffToken}`,
    });
    assert.equal(getRes.status, 200);
    assert.equal(getRes.body.name, 'Integration Test Customer');

    // 4. Owner deletes customer
    const delRes = await makeRequest(app, 'DELETE', `/api/customers/${createdId}`, {
      Authorization: `Bearer ${ownerToken}`,
    });
    assert.equal(delRes.status, 200);
  });

  await t.test('Static file serving - does not expose server files, local_database, or secrets', async () => {
    // Requesting /.env must NOT expose environment variables
    const envRes = await makeRequest(app, 'GET', '/.env');
    // It should either return 404 or the SPA index.html, never raw text containing secrets
    const bodyStr = typeof envRes.body === 'string' ? envRes.body : JSON.stringify(envRes.body);
    assert.ok(!bodyStr.includes('SUPABASE_SERVICE_ROLE_KEY'), 'Must NOT leak service role keys');
    assert.ok(!bodyStr.includes('LOCAL_AUTH_SECRET'), 'Must NOT leak local auth secret');

    // Non-existent API route must return 404 JSON, NOT HTML
    const apiRes = await makeRequest(app, 'GET', '/api/nonexistent-endpoint', {
      Authorization: `Bearer ${staffToken}`,
    });
    assert.equal(apiRes.status, 404);
    assert.equal(typeof apiRes.body, 'object');
    assert.equal(apiRes.body.message, 'API route not found');
  });

  await t.test('Google Drive Routes - Owner-only RBAC and validation', async () => {
    // 1. Unauthenticated request to /api/drive/status rejected with 401
    const unauthRes = await makeRequest(app, 'GET', '/api/drive/status');
    assert.equal(unauthRes.status, 401);

    // 2. Staff token accessing /api/drive/status rejected with 403 Forbidden
    const staffRes = await makeRequest(app, 'GET', '/api/drive/status', {
      Authorization: `Bearer ${staffToken}`,
    });
    assert.equal(staffRes.status, 403);

    // 3. Owner token can access /api/drive/status
    const ownerRes = await makeRequest(app, 'GET', '/api/drive/status', {
      Authorization: `Bearer ${ownerToken}`,
    });
    assert.equal(ownerRes.status, 200);
    assert.equal(typeof ownerRes.body, 'object');
    assert.equal(typeof ownerRes.body.connected, 'boolean');

    // 4. Backup endpoint rejects request without passphrase (400)
    const badBackupRes = await makeRequest(app, 'POST', '/api/drive/backup', {
      Authorization: `Bearer ${ownerToken}`,
    }, {});
    assert.equal(badBackupRes.status, 400);
    assert.match(badBackupRes.body.message, /passphrase/i);

    // 5. Restore endpoint rejects request without confirmation (400)
    const badRestoreRes = await makeRequest(app, 'POST', '/api/drive/restore', {
      Authorization: `Bearer ${ownerToken}`,
    }, { fileId: 'fake_drive_id', passphrase: 'somepass' });
    assert.equal(badRestoreRes.status, 400);
    assert.match(badRestoreRes.body.message, /confirmation/i);
  });

  await t.test('Excel Export Routes - Staff access and file streaming', async () => {
    // 1. Unauthenticated request rejected with 401
    const unauthRes = await makeRequest(app, 'POST', '/api/export/customers');
    assert.equal(unauthRes.status, 401);

    // 2. Staff can export customers
    const custExportRes = await makeRequest(app, 'POST', '/api/export/customers', {
      Authorization: `Bearer ${staffToken}`,
    }, { includePhone: true, includePrescriptions: true });

    assert.equal(custExportRes.status, 200);
    assert.match(
      custExportRes.headers['content-type'],
      /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/
    );
    assert.match(custExportRes.headers['content-disposition'], /roja_customers_export_/);

    // 3. Staff can export reports
    const reportExportRes = await makeRequest(app, 'POST', '/api/export/reports', {
      Authorization: `Bearer ${staffToken}`,
    }, {});

    assert.equal(reportExportRes.status, 200);
    assert.match(
      reportExportRes.headers['content-type'],
      /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/
    );
    assert.match(reportExportRes.headers['content-disposition'], /roja_financial_reports_/);
  });

  // Cleanup synthetic test accounts
  await localDb.deleteLocal('users', ownerId);
  await localDb.deleteLocal('users', staffId);
});
