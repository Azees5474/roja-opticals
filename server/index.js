require('dotenv').config();
const path    = require('path');
const fs      = require('fs');
const express = require('express');
const cors    = require('cors');

const { securityHeaders, createRateLimiter } = require('./middleware/security');
const auth = require('./middleware/auth');
const { requireStaff, requireOwner } = require('./middleware/authorization');

const authRoutes         = require('./routes/auth');
const customerRoutes     = require('./routes/customers');
const orderRoutes        = require('./routes/orders');
const prescriptionRoutes = require('./routes/prescriptions');
const inventoryRoutes    = require('./routes/inventory');
const billingRoutes      = require('./routes/billing');
const followupRoutes     = require('./routes/followups');
const whatsappRoutes     = require('./routes/whatsapp');
const sheetsRoutes       = require('./routes/sheets');
const syncRoutes         = require('./routes/sync');
const settingsRoutes     = require('./routes/settings');
const driveRoutes        = require('./routes/drive');
const exportRoutes       = require('./routes/export');
const { startScheduler } = require('./lib/whatsappScheduler');
const { initLocalDb }    = require('./lib/localDb');

// ── Startup Configuration Validation ──────────────────────
function getIsLocalMode() {
  if (process.env.LOCAL_MODE === 'true') return true;
  if (!process.env.SUPABASE_URL) return true;
  if (process.env.SUPABASE_URL.includes('your-project') || process.env.SUPABASE_URL.includes('xxxxxxxxxxx')) return true;
  return false;
}

const isLocalMode = getIsLocalMode();

if (!isLocalMode) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY.includes('replace-with')) {
    console.warn('\n⚠️  WARNING: SUPABASE_URL is configured but SUPABASE_SERVICE_ROLE_KEY is missing or placeholder.');
    console.warn('   The server will fall back to Standalone Laptop-Local Mode.');
    console.warn('   To run locally without cloud services, set LOCAL_MODE=true in server/.env.\n');
  }
}

const app  = express();
const HOST = process.env.HOST || '127.0.0.1';
const PORT = parseInt(process.env.PORT, 10) || 5000;

// Allowed CORS origins for local web development and production ports
const defaultOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  `http://localhost:${PORT}`,
  `http://127.0.0.1:${PORT}`,
];
const envOrigins = (process.env.CLIENT_URL || '')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);
const allowedOrigins = new Set([...defaultOrigins, ...envOrigins]);

// ── Middleware ────────────────────────────────────────────
app.disable('x-powered-by');
app.use(securityHeaders);
app.use(cors({
  origin(origin, callback) {
    // Permit requests without Origin (curl, local tools, same-origin static assets)
    if (!origin || allowedOrigins.has(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Origin is not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '100kb' }));
app.use(createRateLimiter());
app.use('/api/auth/login', createRateLimiter({ windowMs: 15 * 60 * 1000, max: 20 }));

// ── API Routes ────────────────────────────────────────────
app.use('/api/auth',          authRoutes);
app.use('/api/customers',     auth, requireStaff, customerRoutes);
app.use('/api/orders',        auth, requireStaff, orderRoutes);
app.use('/api/prescriptions', auth, requireStaff, prescriptionRoutes);
app.use('/api/inventory',     auth, requireStaff, inventoryRoutes);
app.use('/api/billing',       auth, requireStaff, billingRoutes);
app.use('/api/followups',     auth, requireStaff, followupRoutes);
app.use('/api/whatsapp',      auth, requireStaff, whatsappRoutes);
app.use('/api/sheets',        auth, requireStaff, sheetsRoutes);
app.use('/api/sync',          auth, requireStaff, syncRoutes);
app.use('/api/settings',      auth, requireStaff, settingsRoutes);
app.use('/api/export',        auth, requireStaff, exportRoutes);
app.use('/api/drive',         (req, res, next) => {
  // Allow browser OAuth callback redirect without auth header
  if (req.method === 'GET' && req.path === '/callback') {
    return next();
  }
  return auth(req, res, () => requireOwner(req, res, next));
}, driveRoutes);

// ── Health check ──────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'OK',
    shop: 'Roja Opticals',
    mode: getIsLocalMode() ? 'local' : 'hybrid',
    host: HOST,
    time: new Date().toISOString(),
  });
});

// ── Serve Built Frontend (Production / Laptop-Local) ──────
const candidateDistPaths = [
  process.env.ROJA_DIST_PATH,
  path.resolve(__dirname, '../app/dist'),
  path.resolve(__dirname, 'dist'),
  process.resourcesPath ? path.resolve(process.resourcesPath, 'app/dist') : null,
  process.resourcesPath ? path.resolve(process.resourcesPath, 'dist') : null,
].filter(Boolean);

let distPath = candidateDistPaths.find(p => fs.existsSync(p)) || path.resolve(__dirname, '../app/dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));

  // SPA Client-side Route Fallback (for non-API paths)
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ message: 'API route not found' });
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ── Error Handling ────────────────────────────────────────
app.use((err, _req, res, _next) => {
  if (err.message === 'Origin is not allowed by CORS') {
    return res.status(403).json({ message: err.message });
  }
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ message: 'Malformed JSON payload' });
  }
  console.error('[Server Error]:', err.message);
  res.status(500).json({ message: 'Internal server error' });
});

let server = null;

function startServer({ port = PORT, host = HOST } = {}) {
  return new Promise((resolve, reject) => {
    try {
      const activePort = port || PORT;
      const activeHost = host || HOST;
      server = app.listen(activePort, activeHost, async () => {
        try {
          console.log(`\n======================================================`);
          console.log(`👓 Roja Opticals System`);
          console.log(`🚀 Server running on http://${activeHost}:${activePort}`);
          console.log(`🔒 Network Interface: Bound to ${activeHost} (local-laptop secure)`);
          console.log(`📦 Mode: ${getIsLocalMode() ? 'Standalone Laptop-Local (Offline Database)' : 'Hybrid (Supabase Cloud + Local Mirror)'}`);

          // Initialize local database
          await initLocalDb();

          // Start WhatsApp automated scheduler only if enabled
          if (process.env.DISABLE_SCHEDULER !== 'true' && !getIsLocalMode()) {
            startScheduler();
          } else {
            console.log('ℹ️  Automated cloud scheduler is disabled.');
          }

          if (fs.existsSync(distPath)) {
            console.log(`🌐 Application UI ready at: http://${activeHost}:${activePort}`);
          } else {
            console.log(`ℹ️  Frontend dist build not found at: ${distPath}`);
          }
          console.log(`======================================================\n`);
          resolve({ app, server, port: activePort, host: activeHost });
        } catch (initErr) {
          console.error('Failed to initialize database on startup:', initErr);
          reject(initErr);
        }
      });

      server.on('error', (err) => {
        console.error('Server listen error:', err.message);
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (server) {
      if (typeof server.closeAllConnections === 'function') {
        try { server.closeAllConnections(); } catch {}
      }
      server.close(() => {
        server = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
}

function isTestEnv() {
  if (process.env.NODE_ENV === 'test') return true;
  if (process.argv && process.argv.some((arg) => typeof arg === 'string' && arg.includes('test'))) return true;
  return false;
}

if (!isTestEnv() && !process.env.ELECTRON_MANAGED) {
  startServer().catch((err) => {
    console.error('Fatal: Server failed to start:', err.message);
  });
}

module.exports = { app, server, startServer, stopServer };
