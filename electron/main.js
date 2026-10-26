const { app, BrowserWindow, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

// Set Windows App User Model ID for notifications and taskbar
app.setAppUserModelId('com.rojaopticals.app');

// Enforce single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;
let serverInstance = null;
const BACKEND_PORT = Number(process.env.PORT) || 5000;
const BACKEND_HOST = '127.0.0.1';

// Setup Windows per-user application data directories
const userDataDir = app.getPath('userData'); // %APPDATA%\RojaOpticals
const appDataDir = path.join(userDataDir, 'data');
const backupDir = path.join(userDataDir, 'backups');
const logDir = path.join(userDataDir, 'logs');
const secretFile = path.join(userDataDir, '.auth_secret');

fs.mkdirSync(appDataDir, { recursive: true });
fs.mkdirSync(backupDir, { recursive: true });
fs.mkdirSync(logDir, { recursive: true });

// Setup environment variables before backend initialization
process.env.ROJA_DATA_DIR = appDataDir;
process.env.ROJA_BACKUP_DIR = backupDir;
process.env.ROJA_LOG_DIR = logDir;
process.env.ROJA_SECRET_FILE = secretFile;
process.env.LOCAL_MODE = 'true';
process.env.HOST = BACKEND_HOST;
process.env.PORT = String(BACKEND_PORT);
process.env.DISABLE_SCHEDULER = 'true';
process.env.ELECTRON_MANAGED = 'true';

// Determine frontend dist location
const candidateDistPaths = [
  process.resourcesPath ? path.resolve(process.resourcesPath, 'app.asar.unpacked/app/dist') : null,
  process.resourcesPath ? path.resolve(process.resourcesPath, 'app/dist') : null,
  process.resourcesPath ? path.resolve(process.resourcesPath, 'dist') : null,
  path.resolve(__dirname, '../app/dist'),
  path.resolve(__dirname, '../dist'),
].filter(Boolean);

const distPath = candidateDistPaths.find((p) => fs.existsSync(path.join(p, 'index.html')));
if (distPath) {
  process.env.ROJA_DIST_PATH = distPath;
}

// Redirect backend console output to log file in userData/logs/
const logStream = fs.createWriteStream(path.join(logDir, 'server.log'), { flags: 'a' });
const origConsoleLog = console.log;
const origConsoleErr = console.error;
console.log = (...args) => {
  origConsoleLog(...args);
  logStream.write(`[${new Date().toISOString()}] [INFO] ${args.join(' ')}\n`);
};
console.error = (...args) => {
  origConsoleErr(...args);
  logStream.write(`[${new Date().toISOString()}] [ERROR] ${args.join(' ')}\n`);
};

// Health check poller
function waitForBackendHealth(url, timeoutMs = 15000) {
  const startTime = Date.now();
  return new Promise((resolve, reject) => {
    function check() {
      http
        .get(url, (res) => {
          let body = '';
          res.on('data', (chunk) => {
            body += chunk;
          });
          res.on('end', () => {
            if (res.statusCode === 200) {
              try {
                const data = JSON.parse(body);
                if (data.status === 'OK') {
                  return resolve(data);
                }
              } catch {}
            }
            retry();
          });
        })
        .on('error', () => {
          retry();
        });
    }

    function retry() {
      if (Date.now() - startTime > timeoutMs) {
        return reject(new Error(`Backend failed to respond on ${url} within ${timeoutMs / 1000} seconds.`));
      }
      setTimeout(check, 250);
    }

    check();
  });
}

async function startBackend() {
  try {
    const candidateServerPaths = [
      process.resourcesPath ? path.resolve(process.resourcesPath, 'app.asar.unpacked/server/index.js') : null,
      process.resourcesPath ? path.resolve(process.resourcesPath, 'server/index.js') : null,
      path.resolve(__dirname, '../server/index.js'),
      path.resolve(__dirname, 'server/index.js'),
    ].filter(Boolean);

    const serverPath = candidateServerPaths.find((p) => fs.existsSync(p));
    if (!serverPath) {
      throw new Error(`Server entry point not found in: ${candidateServerPaths.join(', ')}`);
    }

    const serverModule = require(serverPath);
    if (typeof serverModule.startServer === 'function') {
      const started = await serverModule.startServer({ port: BACKEND_PORT, host: BACKEND_HOST });
      serverInstance = started.server;
    } else {
      serverInstance = serverModule.server;
    }

    // Wait for health check
    await waitForBackendHealth(`http://${BACKEND_HOST}:${BACKEND_PORT}/api/health`, 15000);
    console.log(`[Electron] Backend server is healthy on http://${BACKEND_HOST}:${BACKEND_PORT}`);
  } catch (err) {
    console.error('[Electron] Failed to start backend:', err.message);
    dialog.showErrorBox(
      'Roja Opticals — Startup Failure',
      `Failed to launch the local application server.\n\n` +
        `Error: ${err.message}\n\n` +
        `Please ensure port ${BACKEND_PORT} is not used by another application.\n` +
        `Diagnostic logs have been written to:\n${path.join(logDir, 'server.log')}`
    );
    app.quit();
  }
}

function createMainWindow() {
  const iconPath = path.resolve(__dirname, '../assets/icon.png');

  mainWindow = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    title: 'Roja Opticals — Shop Management System',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    backgroundColor: '#0a0a0f',
    webPreferences: {
      preload: path.resolve(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.loadURL(`http://${BACKEND_HOST}:${BACKEND_PORT}`);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Open external links (e.g. WhatsApp wa.me) in the user's default browser
    if (
      url.startsWith('https://wa.me') ||
      url.startsWith('http://wa.me') ||
      url.startsWith('https://api.whatsapp.com')
    ) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  setupAppMenu();
}

function setupAppMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Customer Data Folder',
          click: () => {
            shell.openPath(appDataDir);
          },
        },
        {
          label: 'Open Backups Folder',
          click: () => {
            shell.openPath(backupDir);
          },
        },
        {
          label: 'Open Application Logs Folder',
          click: () => {
            shell.openPath(logDir);
          },
        },
        { type: 'separator' },
        { role: 'quit', label: 'Exit Roja Opticals' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload', label: 'Refresh Page' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Roja Opticals',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About Roja Opticals',
              message: 'Roja Opticals — Shop Management System',
              detail:
                'Version 1.0.0 (Windows Desktop Edition)\n\n' +
                'Running 100% locally on this computer.\n' +
                'Customer database and backups are stored in your secure Windows profile:\n' +
                `${userDataDir}\n\n` +
                'Offline-first with zero external dependencies.',
              buttons: ['OK'],
            });
          },
        },
        {
          label: 'Toggle Developer Tools',
          accelerator: 'F12',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.toggleDevTools();
            }
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  await startBackend();
  createMainWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  if (serverInstance) {
    console.log('[Electron] Shutting down backend server cleanly...');
    try {
      if (typeof serverInstance.close === 'function') {
        serverInstance.close();
      }
    } catch {}
    serverInstance = null;
  }
});
