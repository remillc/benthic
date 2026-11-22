// SPDX-License-Identifier: GPL-2.0
// Benthic desktop (task 2026-11-15-169, Electron per task 170): one window per logbook
// (task 173, windows.cjs) running the app's web interface (app/dist, or the Vite server in
// development), the Subsurface core in one helper process per window (bridge.cjs), a native menu
// bar on macOS only (menu.cjs).
//
// Development: run the Vite server (`npx vite --port 5180` in app/), then `npm run dev`
// here. BC_HOST points at the helper (build/desktop/<target>/bin/benthic-host).
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, ipcMain, safeStorage, shell, protocol, net, Menu, dialog, Notification } = require('electron');
const { pathToFileURL } = require('node:url');
const { setupBridge } = require('./bridge.cjs');
const { buildMenu } = require('./menu.cjs');
const windowState = require('./window-state.cjs');
const { LogbookStore, isLogbookFile } = require('./logbooks.cjs');
const { createWindowManager } = require('./windows.cjs');
const { createCloudService, loadClients } = require('./cloud.cjs');
const { createNetworkMonitor } = require('./network.cjs');
const { createNotifier } = require('./notifications.cjs');
const { createCrashStore } = require('./crash-reports.cjs');
const { isBrokenPipe, guardProcessPipes, safeWrite } = require('./process-errors.cjs');

guardProcessPipes(process);

const devUrl = process.env.BC_DEV_URL || '';
const resources = app.isPackaged
  ? process.resourcesPath
  : process.env.BC_STAGE || path.join(__dirname, '..', 'build', 'desktop', 'stage');
const webRoot = path.join(resources, 'web');

/** The helper: BC_HOST in development, else the one shipped with the app. */
function hostPath() {
  if (process.env.BC_HOST) return process.env.BC_HOST;
  return path.join(resources, 'bin', process.platform === 'win32' ? 'benthic-host.exe' : 'benthic-host');
}

// The interface is served from app://benthic/, a stable origin (its storage stays
// between versions), never from file://.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

// Checks and tests: a data folder of their own, beside the diver's (BC_USER_DATA).
if (process.env.BC_USER_DATA) app.setPath('userData', process.env.BC_USER_DATA);

// The rename to Benthic (22 November 2026): the data folder was `opendives-desktop` and the working copies of the
// server's logbooks were in `odgit`; both move once, before anything opens them (legacy-migration.cjs).
// BC_LEGACY_USER_DATA names the old folder in checks (with BC_USER_DATA, the old sibling is never touched).
const legacy = require('./legacy-migration.cjs');
if (!process.env.BC_USER_DATA || process.env.BC_LEGACY_USER_DATA) {
  const moved = legacy.migrateUserDataFolder({ userData: app.getPath('userData'), legacyUserData: process.env.BC_LEGACY_USER_DATA });
  if (moved === 'failed') console.error('[desktop] The data folder of the previous name could not be moved');
}
legacy.migrateGitFolder(app.getPath('userData'));

if (!app.requestSingleInstanceLock()) app.quit();

// Error reports (task #102): exceptions of this process and renderer or helper processes that died are saved to a file;
// the interface offers the report at the next launch (crash-reports.cjs). Nothing is sent from here.
const crashes = createCrashStore({
  dir: app.getPath('userData'),
  osVersion: `${process.platform} ${process.getSystemVersion?.() ?? ''}`.trim(),
  device: `Electron ${process.versions.electron} ${process.arch}`,
});
const oldCrash = crashes.pending();
if (oldCrash && isBrokenPipe(oldCrash)) crashes.clear();
process.on('uncaughtException', (error) => {
  if (isBrokenPipe(error)) return;
  crashes.write('Main process', error);
  try { safeWrite(process.stderr, `[desktop] Uncaught exception ${error?.stack || error}\n`); } catch {}
});
process.on('unhandledRejection', (reason) => {
  if (isBrokenPipe(reason)) return;
  crashes.write('Main process rejection', reason);
  try { safeWrite(process.stderr, `[desktop] Unhandled rejection ${reason?.stack || reason}\n`); } catch {}
});
app.on('render-process-gone', (_event, _contents, details) => {
  if (details.reason !== 'clean-exit' && details.reason !== 'killed') crashes.write('Window process gone', `${details.reason} (${details.exitCode})`);
});
app.on('child-process-gone', (_event, details) => {
  if (details.reason !== 'clean-exit' && details.reason !== 'killed') crashes.write(`${details.type} process gone`, `${details.reason} (${details.exitCode})`);
});

/** @type {ReturnType<typeof createWindowManager>|null} */
let windows = null;

/** @type {import('electron').BrowserWindow|null} */
let settingsWin = null;
/** @type {import('electron').BrowserWindow|null} */
let profileWin = null;
/** « Mon profil de plongeur » is a Benthic+ feature: the menu item is on while the interface says the diver has it. */
let profileAvailable = false;

/**
 * The Mac's Réglages window (task 2026-11-15-202, bureau-reglages-macos): the same app loaded at
 * `?settings-window=1` (the interface shows Réglages only and does not load the logbook), 980 x 680,
 * one at a time. ⌘W closes it (the Window menu's Close). Changes made there reach the main window
 * through the shared storage (see lib/desktop-shell.js). Not tested on a Mac.
 */
function openSettingsWindow() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    if (settingsWin.isMinimized()) settingsWin.restore();
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 980,
    height: 680,
    minWidth: 768,
    minHeight: 520,
    show: false,
    title: 'Benthic Log',
    backgroundColor: '#F5F4F0',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  settingsWin.once('ready-to-show', () => settingsWin?.show());
  settingsWin.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  const url = new URL(devUrl || 'app://benthic/index.html');
  url.searchParams.set('settings-window', '1');
  settingsWin.loadURL(url.toString());
  settingsWin.on('closed', () => {
    settingsWin = null;
  });
}

/**
 * The Mac's « Mon profil de plongeur » window (task 2026-11-18-277, bureau-profil-macos): the same app loaded at
 * `?profile-window=1` (the profile's panes only, the logbook stays with the main window), one at a time.
 */
function openProfileWindow() {
  if (profileWin && !profileWin.isDestroyed()) {
    if (profileWin.isMinimized()) profileWin.restore();
    profileWin.focus();
    return;
  }
  profileWin = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 900,
    minHeight: 560,
    show: false,
    title: 'Benthic Log',
    backgroundColor: '#F5F4F0',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  profileWin.once('ready-to-show', () => profileWin?.show());
  profileWin.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  const url = new URL(devUrl || 'app://benthic/index.html');
  url.searchParams.set('profile-window', '1');
  profileWin.loadURL(url.toString());
  profileWin.on('closed', () => {
    profileWin = null;
  });
}

/** The menu bar's commands reach the interface of the focused window as "bc:menu" messages. */
function sendMenu(/** @type {string} */ command) {
  BrowserWindow.getFocusedWindow()?.webContents.send('bc:menu', command);
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
      profileAvailable,
      actions: {
        openProfile: () => openProfileWindow(),
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

app.whenReady().then(async () => {
  protocol.handle('app', (request) => {
    const { host, pathname } = new URL(request.url);
    // The page of the one-time hand-over of the web storage, from the old origin (app://opendives) to this one.
    if (pathname === legacy.HANDOVER_PAGE && (host === legacy.NEW_HOST || host === legacy.OLD_HOST)) {
      return new Response(legacy.HANDOVER_HTML, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }
    if (host !== legacy.NEW_HOST) return new Response('', { status: 404 });
    const file = path.normalize(path.join(webRoot, decodeURIComponent(pathname)));
    if (!file.startsWith(webRoot)) return new Response('', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  // The web storage of the previous origin (settings, equipment, profile) moves to this origin, once, before the
  // first window reads it.
  if (!devUrl && legacy.hasLegacyOriginData(app.getPath('userData'))) {
    const handOver = await legacy.handOverLegacyOrigin({
      BrowserWindow,
      ipcMain,
      preload: path.join(__dirname, 'legacy-origin-preload.cjs'),
      userData: app.getPath('userData'),
    });
    if (handOver.status === 'failed') console.error('[desktop] Handing over the previous web storage', handOver.error);
  }
  // The personal clouds (task 173): the client keys are read when asked, so a file put there while the app
  // runs is found at the next sign-in. Never logged.
  const clientsFiles = [path.join(__dirname, 'oauth-clients.local.json'), path.join(resources, 'oauth-clients.local.json'), path.join(app.getPath('userData'), 'oauth-clients.local.json')];
  const cloud = createCloudService({
    userData: app.getPath('userData'),
    safeStorage,
    openExternal: (url) => shell.openExternal(url),
    clients: () => loadClients(clientsFiles.find((file) => fs.existsSync(file)) || clientsFiles[0]),
    texts: menuTexts,
    dialog,
    parentOf: (webContents) => BrowserWindow.fromWebContents(webContents),
    locale: app.getLocale(),
    log: (text) => console.error('[desktop]', text),
  });
  const bridge = setupBridge({ ipcMain, app, safeStorage, hostPath: hostPath(), resourcesDir: resources, cloud, onHostCrash: (reason) => crashes.write('Core helper', reason) });
  // « Seulement sur Wi-Fi ou câble » (task 2026-11-15-202): the connection type, asked of the system here (network.cjs).
  const network = createNetworkMonitor({
    onChange: (cost) => {
      for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send('bc:network', cost);
    },
  });
  ipcMain.handle('bc:network', async (_event, op) => {
    try {
      if (op === 'watch') network.watch();
      return { ok: true, value: op === 'refresh' ? await network.refresh() : await network.status() };
    } catch (e) {
      return { ok: true, value: 'unknown' };
    }
  });
  // The maintenance notifications (task 2026-11-19-308): shown at their time while the app runs (notifications.cjs).
  const notifier = createNotifier({
    Notification,
    onClick: (windowId, extra) => {
      const win = BrowserWindow.fromId(windowId);
      if (!win || win.isDestroyed()) return;
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
      win.webContents.send('bc:notification-click', extra);
    },
  });
  ipcMain.handle('bc:notifications', (event, notifications) => {
    try {
      const id = event.sender.id;
      notifier.schedule(id, notifications?.notifications);
      if (!event.sender.__bcNotifyWatch) {
        event.sender.__bcNotifyWatch = true;
        event.sender.once('destroyed', () => notifier.forget(id));
      }
      return { ok: true, value: true };
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  });
  ipcMain.handle('bc:crash', (_event, op) => {
    if (op === 'clear') crashes.clear();
    return { ok: true, value: op === 'pending' ? crashes.pending() : true };
  });
  ipcMain.handle('bc:profileAvailable', (_event, on) => {
    const next = !!on;
    if (next !== profileAvailable) {
      profileAvailable = next;
      rebuildMenu();
    }
    return { ok: true, value: true };
  });
  ipcMain.handle('bc:profileWindow', () => {
    openProfileWindow();
    return { ok: true, value: true };
  });
  ipcMain.handle('bc:settingsWindow', () => {
    openSettingsWindow();
    return { ok: true, value: true };
  });
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
    entryUrl: devUrl || 'app://benthic/index.html',
    isAppUrl: (url) => url.startsWith('app://benthic/') || !!(devUrl && url.startsWith(devUrl)),
    windowState,
    onChange: rebuildMenu,
    home: app.getPath('home'),
    cloud,
  });
  // The logbooks open now are what « Le dernier carnet » reopens at the next start.
  app.on('before-quit', () => windows?.beforeQuit());
  // macOS has a menu bar; Windows and Linux none (task 2026-11-15-169, section 6).
  if (process.platform === 'darwin') rebuildMenu();
  else Menu.setApplicationMenu(null);
  // Checks without a screen (desktop/scripts/screenshots.mjs): the menu bar's items, as a file.
  if (process.env.BC_DUMP_MENU) {
    const items = (menu) => menu?.items.map((i) => ({ label: i.label, accelerator: i.accelerator ?? '', role: i.role ?? '', type: i.type, submenu: items(i.submenu) }));
    fs.writeFileSync(process.env.BC_DUMP_MENU, JSON.stringify(items(Menu.getApplicationMenu()) ?? null, null, 2));
  }
  // « Ouvrir au démarrage » (Réglages): the logbooks open at the last quit, or the start screen; a file given
  // on the command line (or by the system) opens in a window of its own.
  for (const arg of process.argv.slice(1)) if (isLogbookFile(arg)) pendingFiles.push(path.resolve(arg));
  windows.openStartup().then(
    () => {
      for (const file of pendingFiles.splice(0)) openRequestedFile(file);
    },
    (e) => {
      console.error('[desktop] Opening the logbooks', e.message);
      windows.openMain();
    },
  );
  app.on('activate', () => {
    if (!BrowserWindow.getAllWindows().length) windows.openMain();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
