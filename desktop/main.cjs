// SPDX-License-Identifier: GPL-2.0
// OpenDives desktop (task 2026-11-15-169, Electron per task 170): one window running the
// app's web interface (app/dist, or the Vite server in development), the Subsurface core
// in a helper process (bridge.cjs), a native menu bar on macOS only (menu.cjs).
//
// Development: run the Vite server (`npx vite --port 5180` in app/), then `npm run dev`
// here. OD_HOST points at the helper (build/desktop/<target>/bin/opendives-host).
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, ipcMain, safeStorage, shell, protocol, net, Menu } = require('electron');
const { pathToFileURL } = require('node:url');
const { setupBridge } = require('./bridge.cjs');
const { buildMenu } = require('./menu.cjs');
const windowState = require('./window-state.cjs');

const devUrl = process.env.OD_DEV_URL || '';
const resources = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..', 'build', 'desktop', 'stage');
const webRoot = path.join(resources, 'web');

/** The helper: OD_HOST in development, else the one shipped with the app. */
function hostPath() {
  if (process.env.OD_HOST) return process.env.OD_HOST;
  return path.join(resources, 'bin', process.platform === 'win32' ? 'opendives-host.exe' : 'opendives-host');
}

// The interface is served from app://opendives/, a stable origin (its storage stays
// between versions), never from file://.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

if (!app.requestSingleInstanceLock()) app.quit();

/** @type {BrowserWindow|null} */
let win = null;

function createWindow() {
  const state = windowState.load(app.getPath('userData'));
  win = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 760,
    minHeight: 560,
    show: false,
    title: 'OpenDives',
    // The OpenDives icon (« Trois vagues », docs/brand) in the title bar and the taskbar; the
    // packages get theirs from the same file (electron-builder, resources/icon.png).
    icon: path.join(__dirname, 'resources', 'icon.png'),
    backgroundColor: '#F5F4F0',
    autoHideMenuBar: process.platform !== 'darwin',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });
  if (state.maximized) win.maximize();
  windowState.track(win, app.getPath('userData'));
  win.once('ready-to-show', () => win?.show());

  // Links to the web open in the browser; the window never navigates away from the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://opendives/') && !(devUrl && url.startsWith(devUrl))) {
      e.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });

  win.loadURL(devUrl || 'app://opendives/index.html');
  win.on('closed', () => {
    win = null;
  });
}

/** The menu bar's commands reach the interface as "od:menu" messages. */
function sendMenu(/** @type {string} */ command) {
  win?.webContents.send('od:menu', command);
}

/** Translations of the menu bar: the app's own files, in the system's language. */
function menuTexts() {
  const dir = app.isPackaged ? path.join(resources, 'i18n') : path.join(__dirname, '..', 'app', 'src', 'i18n');
  const lang = app.getLocale().toLowerCase().startsWith('fr') ? 'fr' : 'en';
  return JSON.parse(fs.readFileSync(path.join(dir, `${lang}.json`), 'utf8'));
}

app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.whenReady().then(() => {
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url);
    const file = path.normalize(path.join(webRoot, decodeURIComponent(pathname)));
    if (!file.startsWith(webRoot)) return new Response('', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  setupBridge({ ipcMain, app, safeStorage, hostPath: hostPath(), resourcesDir: resources });
  // macOS has a menu bar; Windows and Linux none (task 2026-11-15-169, section 6).
  Menu.setApplicationMenu(process.platform === 'darwin' ? buildMenu(menuTexts(), sendMenu) : null);
  createWindow();
  app.on('activate', () => {
    if (!BrowserWindow.getAllWindows().length) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
