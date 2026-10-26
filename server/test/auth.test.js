const test = require('node:test');
const assert = require('node:assert/strict');
const { getRole, requireStaff, requireOwner } = require('../middleware/authorization');
const authMiddleware = require('../middleware/auth');
const localAuth = require('../lib/localAuth');

test('Authentication & Authorization Suite', async (t) => {
  await t.test('getRole - extracts authoritative role from app_metadata only', () => {
    // Normal owner
    assert.equal(getRole({ app_metadata: { role: 'owner' }, user_metadata: { role: 'staff' } }), 'owner');

    // Normal staff
    assert.equal(getRole({ app_metadata: { role: 'staff' } }), 'staff');

    // Tampering attempt: user_metadata claims 'owner', but app_metadata is 'staff'
    const tamperedUser = {
      app_metadata: { role: 'staff' },
      user_metadata: { role: 'owner' },
    };
    assert.equal(getRole(tamperedUser), 'staff', 'Must NOT elevate to owner via user_metadata');

    // Missing role returns empty string
    assert.equal(getRole({ user_metadata: { role: 'owner' } }), '');
    assert.equal(getRole(null), '');
    assert.equal(getRole(undefined), '');
  });

  await t.test('requireStaff - permits owner and staff, rejects others', () => {
    let nextCalled = false;
    const reqStaff = { user: { app_metadata: { role: 'staff' } } };
    const res = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        return this;
      },
    };

    requireStaff(reqStaff, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(reqStaff.userRole, 'staff');

    nextCalled = false;
    const reqOwner = { user: { app_metadata: { role: 'owner' } } };
    requireStaff(reqOwner, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(reqOwner.userRole, 'owner');

    // Unauthorized role
    nextCalled = false;
    const reqHacker = { user: { app_metadata: { role: 'guest' } } };
    requireStaff(reqHacker, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
  });

  await t.test('requireOwner - strictly enforces owner role and blocks staff with 403', () => {
    let nextCalled = false;
    const res = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        return this;
      },
    };

    // Staff member attempts owner action
    const reqStaff = { userRole: 'staff', user: { app_metadata: { role: 'staff' } } };
    requireOwner(reqStaff, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
    assert.match(res.body.message, /Owner access is required/i);

    // Owner member attempts owner action
    nextCalled = false;
    const reqOwner = { userRole: 'owner', user: { app_metadata: { role: 'owner' } } };
    requireOwner(reqOwner, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(reqOwner.userRole, 'owner');
  });

  await t.test('authMiddleware - safely rejects missing, malformed, and invalid bearer tokens', async () => {
    const makeRes = () => ({
      status(code) { this.statusCode = code; return this; },
      json(data) { this.body = data; return this; },
    });

    // 1. Missing header
    let res = makeRes();
    let nextCalled = false;
    await authMiddleware({ headers: {} }, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.message, 'No token provided');

    // 2. Malformed token (not Bearer)
    res = makeRes();
    nextCalled = false;
    await authMiddleware({ headers: { authorization: 'Basic 12345' } }, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.message, 'Malformed token');

    // 3. Malformed token (missing token value)
    res = makeRes();
    nextCalled = false;
    await authMiddleware({ headers: { authorization: 'Bearer ' } }, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.message, 'Malformed token');

    // 4. Invalid token
    res = makeRes();
    nextCalled = false;
    await authMiddleware({ headers: { authorization: 'Bearer totally-invalid-token' } }, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.message, 'Invalid or expired token');
  });

  await t.test('localAuth - creates, signs, and verifies tamper-proof session tokens', () => {
    const user = {
      id: 'test-user-123',
      email: 'owner@rojaopticals.com',
      role: 'owner',
      name: 'Test Owner',
    };

    const token = localAuth.createSessionToken(user, 1);
    assert.equal(typeof token, 'string');
    assert.equal(token.split('.').length, 3);

    // Verify valid token
    const verified = localAuth.verifySessionToken(token);
    assert.ok(verified);
    assert.equal(verified.id, user.id);
    assert.equal(verified.email, user.email);
    assert.equal(verified.role, 'owner');
    assert.equal(verified.app_metadata.role, 'owner');

    // Tampered payload fails verification
    const parts = token.split('.');
    const tamperedPayload = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(parts[1], 'base64url')), role: 'superadmin' })).toString('base64url');
    const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
    assert.equal(localAuth.verifySessionToken(tamperedToken), null, 'Tampered token must fail');

    // Expired token fails verification
    const expiredToken = localAuth.createSessionToken(user, -1);
    assert.equal(localAuth.verifySessionToken(expiredToken), null, 'Expired token must fail');
  });

  await t.test('localAuth - validates password strength', () => {
    assert.match(localAuth.validatePasswordStrength('short'), /at least 8 characters/);
    assert.match(localAuth.validatePasswordStrength('nouppercase1!'), /uppercase letter/);
    assert.match(localAuth.validatePasswordStrength('NOLOWERCASE1!'), /lowercase letter/);
    assert.match(localAuth.validatePasswordStrength('NoNumbersHere!'), /number/);
    assert.match(localAuth.validatePasswordStrength('NoSpecialChar1'), /special character/);
    assert.equal(localAuth.validatePasswordStrength('Valid@Pass123'), null);
  });

  await t.test('localAuth - first-run setup flow and setup lock', async () => {
    const mockDb = {
      users: [],
      async readAllLocal(table) {
        if (table === 'users') return { data: this.users };
        return { data: [] };
      },
      savedSettings: null,
      async saveLocal(table, id, record) {
        if (table === 'users') {
          this.users.push(record);
          return { success: true };
        }
        if (table === 'shop_settings') {
          this.savedSettings = record;
          return { success: true };
        }
        return { success: true };
      },
      async readLocal() { return { data: null }; },
    };

    // 1. Initial state: setup is needed
    assert.equal(await localAuth.isSetupNeeded(mockDb), true);

    // 2. Weak password rejected
    await assert.rejects(
      () => localAuth.setupInitialOwner({ email: 'owner@shop.com', password: '123' }, mockDb),
      /at least 8 characters/
    );

    // 3. Successful owner setup with shop details
    const setupResult = await localAuth.setupInitialOwner({
      email: 'owner@shop.com',
      password: 'Strong@Password2026',
      name: 'Dr. Roja',
      shopName: 'Roja Optical Clinic',
      shopPhone: '+91 91234 56789',
      shopAddress: '42 Main Street',
      shopGstin: '33ABCDE1234F1Z5',
    }, mockDb);

    assert.ok(setupResult.token);
    assert.equal(setupResult.user.role, 'owner');
    assert.equal(setupResult.user.email, 'owner@shop.com');
    assert.equal(mockDb.savedSettings?.shop?.name, 'Roja Optical Clinic');
    assert.equal(mockDb.savedSettings?.shop?.phone, '+91 91234 56789');
    assert.equal(mockDb.savedSettings?.shop?.address, '42 Main Street');
    assert.equal(mockDb.savedSettings?.shop?.gstin, '33ABCDE1234F1Z5');

    // 4. Setup is now permanently locked
    assert.equal(await localAuth.isSetupNeeded(mockDb), false);
    await assert.rejects(
      () => localAuth.setupInitialOwner({ email: 'another@shop.com', password: 'Another@Pass2026' }, mockDb),
      /already completed/
    );

    // 5. Authentication works with real password and fails with invalid/default
    const authSuccess = await localAuth.authenticateLocal('owner@shop.com', 'Strong@Password2026', mockDb);
    assert.equal(authSuccess.success, true);
    assert.equal(authSuccess.user.role, 'owner');

    const authFailWrong = await localAuth.authenticateLocal('owner@shop.com', 'WrongPassword123!', mockDb);
    assert.equal(authFailWrong.success, false);

    const authFailDefault = await localAuth.authenticateLocal('owner@shop.com', 'Owner@123', mockDb);
    assert.equal(authFailDefault.success, false, 'Default credentials must be rejected');
  });
});
