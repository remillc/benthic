// SPDX-License-Identifier: GPL-2.0
// OpenDives desktop (task 2026-11-15-169, Electron per task 170): one window per logbook
// (task 173, windows.cjs) running the app's web interface (app/dist, or the Vite server in
// development), the Subsurface core in one helper process per window (bridge.cjs), a native menu
// bar on macOS only (menu.cjs).
//
// Development: run the Vite server (`npx vite --port 5180` in app/), then `npm run dev`
// here. OD_HOST points at the helper (build/desktop/<target>/bin/opendives-host).
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, ipcMain, safeStorage, shell, protocol, net, Menu, dialog } = require('electron');
const { pathToFileURL } = require('node:url');
const { setupBridge } = require('./bridge.cjs');
const { buildMenu } = require('./menu.cjs');
const windowState = require('./window-state.cjs');
const { LogbookStore, isLogbookFile } = require('./logbooks.cjs');
const { createWindowManager } = require('./windows.cjs');

const devUrl = process.env.OD_DEV_URL || '';
const resources = app.isPackaged
  ? process.resourcesPath
  : process.env.OD_STAGE || path.join(__dirname, '..', 'build', 'desktop', 'stage');
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

// Checks and tests: a data folder of their own, beside the diver's (OD_USER_DATA).
if (process.env.OD_USER_DATA) app.setPath('userData', process.env.OD_USER_DATA);

if (!app.requestSingleInstanceLock()) app.quit();

/** @type {ReturnType<typeof createWindowManager>|null} */
let windows = null;

/** The menu bar's commands reach the interface of the focused window as "od:menu" messages. */
function sendMenu(/** @type {string} */ command) {
  BrowserWindow.getFocusedWindow()?.webContents.send('od:menu', command);
}

/** Translations of the menu bar: the app's own files, in the system's language. */
function menuTexts() {
  const dir = app.isPackaged ? path.join(resources, 'i18n') : path.join(__dirname, '..', 'app', 'src', 'i18n');
  const lang = app.getLocale().toLowerCase().startsWith('fr') ? 'fr' : 'en';
  return JSON.parse(fs.readFileSync(path.join(dir, `${lang}.json`), 'utf8'));
}

/** The files the system asked to open (a double click on a .ssrf, "open with"), before and after the window exists. */
const pendingFiles = [];

function openRequestedFile(/** @type {string} */ file) {
  if (!isLogbookFile(file)) return;
  if (windows) windows.openPath(path.resolve(file), BrowserWindow.getFocusedWindow()).catch((e) => console.error('[desktop]', e.message));
  else pendingFiles.push(path.resolve(file));
}

app.on('second-instance', (_event, argv) => {
  const wins = windows?.all() ?? [];
  if (wins.length) windows.focus(wins[0]);
  for (const arg of argv.slice(1)) if (isLogbookFile(arg)) openRequestedFile(arg);
});
app.on('open-file', (event, file) => {
  event.preventDefault();
  openRequestedFile(file);
});

function rebuildMenu() {
  if (process.platform !== 'darwin' || !windows) return;
  Menu.setApplicationMenu(
    buildMenu(menuTexts(), sendMenu, {
      recent: windows.recent(),
      actions: {
        pickAndOpen: () => windows.pickAndOpen(BrowserWindow.getFocusedWindow()),
        openRecent: (id) => windows.handle({ sender: BrowserWindow.getFocusedWindow()?.webContents }, 'open', { id }).catch((e) => console.error('[desktop]', e.message)),
        clearRecent: () => windows.handle({}, 'clearRecent'),
        // A window without a logbook closes (the start screen has nothing left to close).
        closeLogbook: () => {
          const win = BrowserWindow.getFocusedWindow();
          if (win) windows.closeLogbook(win).then(() => {});
        },
      },
    }),
  );
}

app.whenReady().then(() => {
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url);
    const file = path.normalize(path.join(webRoot, decodeURIComponent(pathname)));
    if (!file.startsWith(webRoot)) return new Response('', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  const bridge = setupBridge({ ipcMain, app, safeStorage, hostPath: hostPath(), resourcesDir: resources });
  windows = createWindowManager({
    electron: { BrowserWindow, dialog, shell },
    bridge,
    store: new LogbookStore(app.getPath('userData')),
    ipcMain,
    texts: menuTexts,
    userData: app.getPath('userData'),
    platform: process.platform,
    preload: path.join(__dirname, 'preload.cjs'),
    icon: path.join(__dirname, 'resources', 'icon-round.png'),
    entryUrl: devUrl || 'app://opendives/index.html',
    isAppUrl: (url) => url.startsWith('app://opendives/') || !!(devUrl && url.startsWith(devUrl)),
    windowState,
    onChange: rebuildMenu,
    home: app.getPath('home'),
    env: process.env,
  });
  // macOS has a menu bar; Windows and Linux none (task 2026-11-15-169, section 6).
  if (process.platform === 'darwin') rebuildMenu();
  else Menu.setApplicationMenu(null);
  // Checks without a screen (desktop/scripts/screenshots.mjs): the menu bar's items, as a file.
  if (process.env.OD_DUMP_MENU) {
    const items = (menu) => menu?.items.map((i) => ({ label: i.label, accelerator: i.accelerator ?? '', role: i.role ?? '', type: i.type, submenu: items(i.submenu) }));
    fs.writeFileSync(process.env.OD_DUMP_MENU, JSON.stringify(items(Menu.getApplicationMenu()) ?? null, null, 2));
  }
  // The first window holds the logbook of this computer, as the app always did; a file given on the
  // command line (or by the system) opens in a window of its own.
  windows.openMain();
  for (const arg of process.argv.slice(1)) if (isLogbookFile(arg)) pendingFiles.push(path.resolve(arg));
  for (const file of pendingFiles.splice(0)) openRequestedFile(file);
  app.on('activate', () => {
    if (!BrowserWindow.getAllWindows().length) windows.openMain();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
