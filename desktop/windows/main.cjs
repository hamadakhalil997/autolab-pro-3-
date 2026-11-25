const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');

let mainWindow;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForLocalServer(url, attempts = 40) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The local Express server may still be starting.
    }
    await wait(250);
  }
  throw new Error('AutoLab local service did not start on 127.0.0.1:3000');
}

function registerDesktopApi() {
  ipcMain.handle('desktop:info', () => ({
    platform: process.platform,
    arch: process.arch,
    appVersion: app.getVersion(),
    runtime: process.versions.electron,
    nativeWindowsHost: process.platform === 'win32',
    vciSdkReady: false,
  }));

  // Deliberately report the missing vendor integration instead of pretending
  // that a USB enumeration is a working Autocom/VCI diagnostic connection.
  ipcMain.handle('vci:capabilities', () => ({
    available: false,
    transport: 'native-windows-pending',
    reason: 'The vendor VCI SDK/driver package has not yet been integrated.',
  }));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 980,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: '#020611',
    title: 'AutoLab Pro',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
  void mainWindow.loadURL('http://127.0.0.1:3000');
}

app.whenReady().then(async () => {
  app.setAppUserModelId('com.autolabpro.desktop');

  const appRoot = app.getAppPath();
  process.env.NODE_ENV = 'production';
  process.env.HOST = '127.0.0.1';
  process.env.PORT = '3000';
  process.env.AUTOLAB_APP_ROOT = appRoot;
  process.env.AUTOLAB_DATA_DIR = path.join(app.getPath('userData'), 'workspace');

  registerDesktopApi();
  require(path.join(appRoot, 'dist-server', 'server.cjs'));

  await waitForLocalServer('http://127.0.0.1:3000/api/health');
  createWindow();
}).catch((error) => {
  console.error('[AutoLab Pro] Startup failed:', error);
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
