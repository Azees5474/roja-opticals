/**
 * localAuth.js
 * ──────────────────────────────────────────────────────────
 * Local authentication and user management for Roja Opticals.
 * Enables 100% offline, laptop-local operation without cloud dependencies.
 *
 * Security properties:
 * - Passwords hashed with crypto.scryptSync with 16-byte random salt.
 * - Session tokens signed with HMAC-SHA256 with tamper protection and expiration.
 * - Authoritative roles (owner / staff) stored securely and returned in app_metadata.
 * - Secure First-Run Setup: No default credentials shipped. Master owner is
 *   provisioned by the shop owner during first-run setup.
 */

const crypto = require('crypto');
const path = require('path');
const fsSync = require('fs');

function isTestEnv() {
  if (process.env.NODE_ENV === 'test') return true;
  if (process.env.ROJA_USE_LOCAL_DIR === 'true') return true;
  if (process.argv && process.argv.some(arg => typeof arg === 'string' && arg.includes('test'))) return true;
  return false;
}

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

function getSecretFile() {
  if (process.env.ROJA_SECRET_FILE) {
    return path.resolve(process.env.ROJA_SECRET_FILE);
  }
  return path.resolve(getDbDir(), '.auth_secret');
}

let authSecret = process.env.LOCAL_AUTH_SECRET || '';

function getAuthSecret() {
  if (authSecret) return authSecret;
  const secretFile = getSecretFile();
  if (fsSync.existsSync(secretFile)) {
    try {
      authSecret = fsSync.readFileSync(secretFile, 'utf8').trim();
      if (authSecret) return authSecret;
    } catch {}
  }
  // Generate a persistent random secret for signing local tokens
  authSecret = crypto.randomBytes(32).toString('hex');
  try {
    const parentDir = path.dirname(secretFile);
    if (!fsSync.existsSync(parentDir)) {
      fsSync.mkdirSync(parentDir, { recursive: true });
    }
    fsSync.writeFileSync(secretFile, authSecret, { encoding: 'utf8', mode: 0o600 });
  } catch {}
  return authSecret;
}

function hashPassword(password, salt) {
  const normalized = String(password || '');
  return crypto.scryptSync(normalized, salt, 64).toString('hex');
}

function validatePasswordStrength(password) {
  if (!password || typeof password !== 'string') return 'Password is required';
  if (password.length < 8) return 'Password must be at least 8 characters long';
  if (!/[A-Z]/.test(password)) return 'Password must include at least one uppercase letter';
  if (!/[a-z]/.test(password)) return 'Password must include at least one lowercase letter';
  if (!/[0-9]/.test(password)) return 'Password must include at least one number';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must include at least one special character';
  return null;
}

function createSessionToken(user, expiresInHours = 24) {
  const secret = getAuthSecret();
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = Math.floor(Date.now() / 1000) + expiresInHours * 3600;
  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    app_metadata: { role: user.role },
    user_metadata: { name: user.name, role: user.role },
    exp,
  };

  const b64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
  const b64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const data = `${b64Header}.${b64Payload}`;
  const signature = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${signature}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [b64Header, b64Payload, signature] = parts;
  const secret = getAuthSecret();
  const data = `${b64Header}.${b64Payload}`;
  const expectedSig = crypto.createHmac('sha256', secret).update(data).digest('base64url');

  try {
    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }
  } catch {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(b64Payload, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null; // Expired
    }
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      app_metadata: { role: payload.role },
      user_metadata: { name: payload.name, role: payload.role },
    };
  } catch {
    return null;
  }
}

/**
 * Check if the first-run owner setup is needed
 */
async function isSetupNeeded(localDb) {
  try {
    const { data: users } = await localDb.readAllLocal('users');
    if (!users || !Array.isArray(users)) return true;
    const owners = users.filter(u => u && u.role === 'owner');
    return owners.length === 0;
  } catch {
    return true;
  }
}

/**
 * Provision the first owner account during first-run setup
 */
async function setupInitialOwner({ email, password, name, shopName, shopPhone, shopAddress, shopGstin }, localDb) {
  const needed = await isSetupNeeded(localDb);
  if (!needed) {
    throw new Error('Owner setup already completed. Setup is permanently locked.');
  }

  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error('A valid email address is required.');
  }

  const passError = validatePasswordStrength(password);
  if (passError) {
    throw new Error(passError);
  }

  const ownerSalt = crypto.randomBytes(16).toString('hex');
  const ownerHash = hashPassword(password, ownerSalt);
  const ownerId = crypto.randomUUID();

  const ownerUser = {
    id: ownerId,
    email: cleanEmail,
    name: String(name || 'Shop Owner').trim(),
    role: 'owner',
    salt: ownerSalt,
    password_hash: ownerHash,
    created_at: new Date().toISOString(),
  };

  const saveRes = await localDb.saveLocal('users', ownerId, ownerUser);
  if (!saveRes.success) {
    throw new Error(saveRes.error || 'Failed to save owner account.');
  }

  // Update or set default shop settings under the canonical SETTINGS_ID
  const SETTINGS_ID = '00000000-0000-0000-0000-000000000002';
  try {
    const { data: existingSettings } = await localDb.readLocal('shop_settings', SETTINGS_ID);
    const existingShop = existingSettings?.shop || {};
    const updatedShop = {
      name: String(shopName || existingShop.name || 'Roja Opticals').trim().slice(0, 120),
      phone: String(shopPhone || existingShop.phone || '').trim().slice(0, 30),
      email: cleanEmail,
      address: String(shopAddress || existingShop.address || '').trim().slice(0, 500),
      gstin: String(shopGstin || existingShop.gstin || '').trim().slice(0, 32),
      currency: existingShop.currency || 'INR',
      timezone: existingShop.timezone || 'Asia/Kolkata',
    };
    await localDb.saveLocal('shop_settings', SETTINGS_ID, {
      id: SETTINGS_ID,
      shop: updatedShop,
      notifications: existingSettings?.notifications || {
        orderReady: true,
        followupDue: true,
        lowStock: true,
        billing: false,
      },
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[LocalAuth] Note: Shop details update skipped:', err.message);
  }

  const token = createSessionToken(ownerUser);
  return {
    success: true,
    token,
    user: {
      id: ownerUser.id,
      email: ownerUser.email,
      name: ownerUser.name,
      role: 'owner',
      app_metadata: { role: 'owner' },
      user_metadata: { name: ownerUser.name, role: 'owner' },
    },
  };
}

/**
 * Owner-authorized creation of staff accounts
 */
async function createStaffUser({ email, password, name }, localDb) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error('A valid email address is required.');
  }

  const passError = validatePasswordStrength(password);
  if (passError) {
    throw new Error(passError);
  }

  const { data: existingUsers } = await localDb.readAllLocal('users');
  if (existingUsers && existingUsers.some(u => u.email && u.email.toLowerCase() === cleanEmail)) {
    throw new Error('A user with this email address already exists.');
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = hashPassword(password, salt);
  const staffId = crypto.randomUUID();

  const staffUser = {
    id: staffId,
    email: cleanEmail,
    name: String(name || 'Staff Member').trim(),
    role: 'staff',
    salt,
    password_hash: passwordHash,
    created_at: new Date().toISOString(),
  };

  const saveRes = await localDb.saveLocal('users', staffId, staffUser);
  if (!saveRes.success) {
    throw new Error(saveRes.error || 'Failed to create staff account.');
  }

  return {
    id: staffUser.id,
    email: staffUser.email,
    name: staffUser.name,
    role: 'staff',
  };
}

async function authenticateLocal(email, password, localDb) {
  if (!email || !password) return { success: false, message: 'Invalid email or password' };

  const { data: users } = await localDb.readAllLocal('users');
  if (!users || !Array.isArray(users)) return { success: false, message: 'Invalid email or password' };

  const targetEmail = String(email).trim().toLowerCase();
  const user = users.find(u => u.email && u.email.toLowerCase() === targetEmail);

  if (!user || !user.salt || !user.password_hash) {
    return { success: false, message: 'Invalid email or password' };
  }

  const computedHash = hashPassword(password, user.salt);
  try {
    const userHashBuf = Buffer.from(user.password_hash, 'hex');
    const compHashBuf = Buffer.from(computedHash, 'hex');
    if (userHashBuf.length !== compHashBuf.length || !crypto.timingSafeEqual(userHashBuf, compHashBuf)) {
      return { success: false, message: 'Invalid email or password' };
    }
  } catch {
    return { success: false, message: 'Invalid email or password' };
  }

  const token = createSessionToken(user);
  return {
    success: true,
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name || 'User',
      role: user.role || 'staff',
      app_metadata: { role: user.role || 'staff' },
      user_metadata: { name: user.name, role: user.role || 'staff' },
    },
  };
}

module.exports = {
  getAuthSecret,
  hashPassword,
  validatePasswordStrength,
  createSessionToken,
  verifySessionToken,
  isSetupNeeded,
  setupInitialOwner,
  createStaffUser,
  authenticateLocal,
};
