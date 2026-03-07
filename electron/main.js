const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

let mainWindow;
let pythonProcess;

const DEV_SERVER_URL = 'http://localhost:3000';
const BACKEND_URL = 'http://localhost:8000';

function waitForUrl(url, maxRetries = 60, interval = 500) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      const req = http.get(url, (res) => {
        resolve();
      });
      req.on('error', () => {
        attempts++;
        if (attempts >= maxRetries) {
          reject(new Error(`${url} not ready after ${maxRetries} attempts`));
        } else {
          setTimeout(check, interval);
        }
      });
      req.end();
    };
    check();
  });
}

function startPythonBackend() {
  const backendDir = path.join(__dirname, '..', 'backend');
  // Use the project's venv Python so dependencies are available
  const venvPython = path.join(__dirname, '..', 'venv', 'bin', 'python');
  const backendPath = path.join(backendDir, 'main.py');

  pythonProcess = spawn(venvPython, [backendPath], {
    cwd: backendDir,
    env: { ...process.env },
  });

  pythonProcess.stdout.on('data', (data) => {
    console.log(`[Backend] ${data}`);
  });

  pythonProcess.stderr.on('data', (data) => {
    console.error(`[Backend] ${data}`);
  });

  pythonProcess.on('close', (code) => {
    console.log(`[Backend] Process exited with code ${code}`);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    frame: false,
    transparent: false,
    backgroundColor: '#060a13',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hidden',
    icon: path.join(__dirname, '..', 'src', 'assets', 'icon.png'),
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    console.log('[Electron] Waiting for dev server...');
    waitForUrl(DEV_SERVER_URL)
      .then(() => {
        console.log('[Electron] Dev server ready, loading app');
        mainWindow.loadURL(DEV_SERVER_URL);
      })
      .catch((err) => {
        console.error('[Electron]', err.message);
        mainWindow.loadURL(DEV_SERVER_URL);
      });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  startPythonBackend();
  createWindow();
});

app.on('window-all-closed', () => {
  if (pythonProcess) pythonProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.on('minimize-window', () => mainWindow?.minimize());
ipcMain.on('maximize-window', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('close-window', () => mainWindow?.close());
