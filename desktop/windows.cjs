// SPDX-License-Identifier: GPL-2.0
// The windows of the desktop app (task 2026-11-15-173): one window per logbook. This module opens,
// reuses and closes them, keeps the recent logbooks, and answers the interface's 'od:logbooks'
// messages (new logbook, open, close, save a copy). Electron's objects are passed in, so that
// tests/desktop/windows.test.mjs runs it with a fake Electron.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const logbooks = require('./logbooks.cjs');

/**
 * @param {object} options
 * @param {{ BrowserWindow: any, dialog: any, shell: any }} options.electron
 * @param {ReturnType<import('./bridge.cjs').setupBridge>} options.bridge
 * @param {import('./logbooks.cjs').LogbookStore} options.store
 * @param {any} options.ipcMain
 * @param {() => any} options.texts the app's translations (desktopLogbooks is read), in the system's language
 * @param {string} options.userData
 * @param {string} options.platform
 * @param {string} options.preload
 * @param {string} options.icon
 * @param {string} options.entryUrl the address of the interface
 * @param {(url: string) => boolean} options.isAppUrl
 * @param {{ load: Function, track: Function }} [options.windowState]
 * @param {() => void} [options.onChange] the recent list or the open logbooks changed (the Mac menu is rebuilt)
 * @param {string} [options.home]
 * @param {ReturnType<import('./cloud.cjs').createCloudService>} [options.cloud] the personal clouds (sign-in, cloud logbooks)
 * @param {number} [options.cloudCheckMs] how often a cloud logbook looks for a change made elsewhere
 */
function createWindowManager({ electron, bridge, store, ipcMain, texts, userData, platform, preload, icon, entryUrl, isAppUrl, windowState, onChange = () => {}, home = '', cloud, cloudCheckMs = 5 * 60 * 1000 }) {
  const { BrowserWindow, dialog, shell } = electron;
  /** @type {Map<number, any>} webContents id -> window */
  const windows = new Map();
  let firstWindow = true;

  const t = () => texts().desktopLogbooks.main;
  const mainName = () => texts().desktopLogbooks.mainName;
  /** True from the moment the app quits: the logbooks open then are what the next start reopens. */
  let quitting = false;

  /** The logbooks the windows hold now, in window order. */
  function openDescriptors() {
    const out = [];
    for (const [key, win] of windows) {
      const d = bridge.descriptorOf(key);
      if (d && !win.isDestroyed()) out.push(d);
    }
    return out;
  }

  /** « Ouvrir au démarrage » > « Le dernier carnet »: what is open is kept, unless the app is quitting (its windows close one by one). */
  function rememberOpen() {
    if (quitting) return;
    try {
      store.setLastOpen(openDescriptors());
    } catch (e) {
      console.error('[desktop] Keeping the open logbooks', e.message);
    }
  }

  const notify = () => {
    rememberOpen();
    onChange();
  };

  function titleOf(/** @type {any} */ descriptor) {
    return logbooks.windowTitle(descriptor, mainName());
  }

  /** The window that holds the logbook `id`, if any. */
  function windowOf(/** @type {string} */ id) {
    for (const [key, win] of windows) if (!win.isDestroyed() && bridge.descriptorOf(key)?.id === id) return win;
    return null;
  }

  /** The logbooks open now, by id. */
  function openIds() {
    const ids = new Set();
    for (const key of windows.keys()) {
      const d = bridge.descriptorOf(key);
      if (d) ids.add(d.id);
    }
    return ids;
  }

  /** @type {Map<number, number>} webContents id -> time of its last check */
  const checkedAt = new Map();
  const checking = new Set();

  /**
   * A cloud logbook looks at its remote file (cloud.cjs): changed elsewhere and nothing unsent here, the
   * window reads the new version; both changed, the diver is asked which to keep.
   * @param {any} win @param {number} [minGapMs] skips the check when the last one is more recent
   */
  async function checkCloud(win, minGapMs = 0) {
    if (!cloud || !win || win.isDestroyed()) return null;
    const key = win.webContents.id;
    if (bridge.descriptorOf(key)?.kind !== 'cloud' || checking.has(key)) return null;
    if (Date.now() - (checkedAt.get(key) ?? 0) < minGapMs) return null;
    checking.add(key);
    try {
      const result = await bridge.cloudCheck(key);
      checkedAt.set(key, Date.now());
      if (result.reload && !win.isDestroyed()) win.webContents.reload();
      return result;
    } catch (e) {
      console.error('[desktop] Looking at the cloud logbook', e.message);
      return null;
    } finally {
      checking.delete(key);
    }
  }

  /** @type {ReturnType<typeof setInterval>|null} */
  let timer = null;
  function startCloudTimer() {
    if (timer || !cloud || !(cloudCheckMs > 0)) return;
    timer = setInterval(() => {
      for (const win of windows.values()) checkCloud(win);
    }, cloudCheckMs);
    timer.unref?.();
  }

  function focus(/** @type {any} */ win) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }

  function create(/** @type {any} */ descriptor, /** @type {any} */ from) {
    const state = windowState ? windowState.load(userData) : { width: 1440, height: 900, maximized: false };
    const primary = firstWindow;
    firstWindow = false;
    // Later windows open a little lower and to the right of the one that asked for them.
    let place = {};
    if (!primary && from && !from.isDestroyed()) {
      const b = from.getBounds();
      place = { x: b.x + 28, y: b.y + 28, width: b.width, height: b.height };
    } else if (state.x !== undefined) {
      place = { x: state.x, y: state.y };
    }
    const win = new BrowserWindow({
      width: state.width,
      height: state.height,
      minWidth: 760,
      minHeight: 560,
      show: false,
      title: titleOf(descriptor),
      icon,
      backgroundColor: '#F5F4F0',
      autoHideMenuBar: platform !== 'darwin',
      ...place,
      webPreferences: { preload, contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: true },
    });
    const key = win.webContents.id;
    windows.set(key, win);
    bridge.attach(win.webContents, descriptor);
    if (descriptor) store.remember(descriptor);
    if (primary) {
      if (state.maximized) win.maximize();
      if (windowState) windowState.track(win, userData);
    }
    // The title bar names the logbook, whatever the page's own title says.
    win.on('page-title-updated', (e) => e.preventDefault());
    win.once('ready-to-show', () => win.show());
    // Links to the web open in the browser; the window never navigates away from the app.
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (e, url) => {
      if (!isAppUrl(url)) {
        e.preventDefault();
        if (/^https?:/.test(url)) shell.openExternal(url);
      }
    });
    // Closing the last window quits the app on Windows and Linux: what is open now is what the next start reopens.
    win.on('close', () => {
      if (platform !== 'darwin' && windows.size <= 1) beforeQuit();
    });
    win.on('closed', () => {
      windows.delete(key);
      checkedAt.delete(key);
      bridge.detach(key);
      notify();
    });
    win.on('focus', () => {
      notify();
      checkCloud(win, 30 * 1000);
    });
    startCloudTimer();
    win.loadURL(entryUrl);
    notify();
    return win;
  }

  /** The file of a recent or dropped logbook is there to open; else the diver is told. */
  async function checkFile(/** @type {any} */ descriptor, /** @type {any} */ parent) {
    if (descriptor.kind !== 'file' || fs.existsSync(descriptor.location)) return true;
    await dialog.showMessageBox(parent ?? undefined, { type: 'warning', message: t().missingTitle.replace('{name}', descriptor.name), detail: `${descriptor.location}\n${t().missingText}`, buttons: [t().ok] });
    store.forget(descriptor.id);
    notify();
    return false;
  }

  /**
   * Opens a logbook. Always in a window of its own, unless it is already open (that window comes to
   * the front: two windows on one file would overwrite each other) or the asking window is a start
   * screen (it takes the logbook).
   * @param {any} descriptor @param {any} [from] the window that asked
   */
  async function open(descriptor, from) {
    const d = logbooks.cleanDescriptor(descriptor);
    if (!d) throw new Error('BAD_ARGUMENT: not a logbook');
    const already = windowOf(d.id);
    if (already) {
      focus(already);
      return { window: already, reused: true };
    }
    if (!(await checkFile(d, from))) return { window: null, reused: false };
    const fromKey = from && !from.isDestroyed() ? from.webContents.id : null;
    if (fromKey !== null && windows.has(fromKey) && bridge.descriptorOf(fromKey) === null) {
      await bridge.setDescriptor(fromKey, d);
      store.remember(d);
      from.setTitle(titleOf(d));
      from.webContents.reload();
      notify();
      return { window: from, reused: false };
    }
    return { window: create(d, from), reused: false };
  }

  /** The first window of the app: the logbook of this computer, as before there were several. */
  function openMain() {
    return create(logbooks.MAIN);
  }

  /**
   * The windows of the start: « Le dernier carnet » reopens the logbooks that were open at the last quit,
   * each in its window (a file that is gone is skipped, quietly; none open, or the first start: the logbook
   * of this computer); « Choisir à chaque fois » shows the start screen with the recent logbooks.
   * @returns {Promise<any[]>} the windows
   */
  async function openStartup() {
    if (store.startup() === 'ask') return [create(null)];
    const wanted = store.lastOpen().filter((d) => d.kind !== 'file' || fs.existsSync(d.location));
    if (!wanted.length) return [store.lastOpen().length ? create(null) : openMain()];
    const opened = [];
    for (const d of wanted) {
      const result = await open(d, opened[opened.length - 1]);
      if (result.window) opened.push(result.window);
    }
    return opened.length ? opened : [create(null)];
  }

  /** The app is quitting: what is open now is what the next start reopens. */
  function beforeQuit() {
    if (quitting) return;
    rememberOpen();
    quitting = true;
  }

  /** The window shows the start screen: its logbook is closed (nothing is asked; changes are already saved). */
  async function closeLogbook(/** @type {any} */ win) {
    const key = win.webContents.id;
    if (bridge.descriptorOf(key) === null) return;
    await bridge.setDescriptor(key, null);
    win.setTitle(titleOf(null));
    win.webContents.reload();
    notify();
  }

  function fromEvent(/** @type {any} */ event) {
    return event && event.sender ? BrowserWindow.fromWebContents(event.sender) : null;
  }

  /** The folder dialogs start where the diver last was: the documents. */
  const startFolder = () => (home ? path.join(home, 'Documents') : undefined);

  async function pickAndOpen(/** @type {any} */ win) {
    const answer = await dialog.showOpenDialog(win ?? undefined, {
      title: t().openTitle,
      defaultPath: startFolder(),
      properties: ['openFile'],
      filters: [{ name: t().fileFilter, extensions: ['ssrf', 'xml'] }],
    });
    if (answer.canceled || !answer.filePaths.length) return { canceled: true };
    return openPath(answer.filePaths[0], win);
  }

  async function openPath(/** @type {string} */ file, /** @type {any} */ win) {
    if (typeof file !== 'string' || !path.isAbsolute(file) || !logbooks.isLogbookFile(file)) throw new Error('BAD_ARGUMENT: not a logbook file');
    const result = await open(logbooks.fileDescriptor(file, { platform }), win);
    return { canceled: false, opened: !!result.window };
  }

  /** The recent logbooks, each with whether a window holds it. */
  function recent() {
    const ids = openIds();
    return store.list().map((e) => ({ ...e, open: ids.has(e.id) }));
  }

  /** A git username when the diver gave none: the owner in the address, else a fixed word (a token needs any). */
  function gitUserName(/** @type {string} */ url) {
    const parts = url.replace(/^[a-z]+:\/\//i, '').split('/');
    return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(parts[1] || '') ? parts[1] : 'opendives';
  }

  /** A new logbook, from the dialog. @param {any} spec @param {any} win */
  async function createLogbook(spec, win) {
    const name = String(spec?.name ?? '').trim();
    if (!name) throw new Error('BAD_ARGUMENT: no name');
    if (spec.where === 'git') {
      const url = logbooks.normalGitUrl(spec.url);
      const branch = String(spec.branch || '').trim();
      const token = String(spec.token || '').trim();
      if (!url || !branch || !token) throw new Error('BAD_ARGUMENT: incomplete repository');
      // The user name typed in the dialog, else the owner in the address.
      const typed = String(spec.username || '').trim();
      if (typed && !/^[A-Za-z0-9][A-Za-z0-9._@+-]{0,99}$/.test(typed)) throw new Error('BAD_ARGUMENT: user name');
      const username = typed || gitUserName(url);
      const result = await bridge.probeGit({ url, branch, username, token, create: true });
      const descriptor = logbooks.gitDescriptor({ url, branch, name });
      bridge.storeGitAccess(descriptor, { url: `${url}[${branch}]`, username, branch, token });
      const opened = await open(descriptor, win);
      return { canceled: false, created: result.created, descriptor, opened: !!opened.window };
    }
    if (spec.where === 'cloud') return createCloudLogbook(spec, name, win);
    // A file on this computer: the system's save dialog.
    const answer = await dialog.showSaveDialog(win ?? undefined, {
      title: t().newFileTitle,
      defaultPath: path.join(startFolder() ?? '', logbooks.logbookFileName(name)),
      filters: [{ name: t().fileFilter, extensions: ['ssrf'] }],
    });
    if (answer.canceled || !answer.filePath) return { canceled: true };
    const target = /\.ssrf$/i.test(answer.filePath) ? answer.filePath : `${answer.filePath}.ssrf`;
    fs.writeFileSync(target, logbooks.EMPTY_LOGBOOK);
    const descriptor = logbooks.fileDescriptor(target, { name, platform });
    const opened = await open(descriptor, win);
    return { canceled: false, created: true, descriptor, opened: !!opened.window };
  }

  /**
   * A new logbook in a personal cloud: an empty .ssrf in the service's folder (a subfolder of the app's
   * folder; for Google Drive a folder OpenDives creates), and a working copy here. EXISTS when the
   * service already has a file by that name.
   */
  async function createCloudLogbook(/** @type {any} */ spec, /** @type {string} */ name, /** @type {any} */ win) {
    if (!cloud) throw new Error('NOT_AVAILABLE');
    const provider = String(spec.provider || '');
    const state = cloud.status().find((p) => p.provider === provider);
    if (!state || !state.available) throw Object.assign(new Error('NOT_AVAILABLE'), { code: 'NOT_AVAILABLE' });
    if (!state.connected) throw Object.assign(new Error('NOT_SIGNED_IN'), { code: 'NOT_SIGNED_IN' });
    const descriptor = logbooks.cloudDescriptor({ provider, folder: spec.folder, name });
    const local = /** @type {string} */ (logbooks.localFileOf(userData, descriptor));
    // The working copy exists only once the service has the file: a refused name leaves nothing behind.
    const staged = path.join(path.dirname(local), 'new.ssrf');
    fs.mkdirSync(path.dirname(local), { recursive: true });
    fs.writeFileSync(staged, logbooks.EMPTY_LOGBOOK);
    try {
      const remote = await cloud.createRemote(descriptor, staged);
      fs.renameSync(staged, local);
      fs.rmSync(path.join(path.dirname(local), 'repo'), { recursive: true, force: true });
      logbooks.writeMeta(userData, descriptor.id, { rev: remote.rev, modified: remote.modified, remote: remote.ref, pending: false, hash: '' });
    } catch (e) {
      fs.rmSync(staged, { force: true });
      throw e;
    }
    const opened = await open(descriptor, win);
    return { canceled: false, created: true, descriptor, opened: !!opened.window };
  }

  /** « Enregistrer une copie… »: the system's save dialog, then the logbook in memory as a .ssrf file there. */
  async function saveCopy(/** @type {any} */ win) {
    const descriptor = bridge.descriptorOf(win.webContents.id);
    if (!descriptor) throw new Error('NO_LOGBOOK');
    const base = descriptor.kind === 'file' ? path.basename(descriptor.location) : logbooks.logbookFileName(descriptor.name || mainName());
    const answer = await dialog.showSaveDialog(win, {
      title: t().copyTitle,
      defaultPath: path.join(startFolder() ?? '', `${base.replace(/\.ssrf$/i, '')}-${t().copySuffix}.ssrf`),
      filters: [{ name: t().fileFilter, extensions: ['ssrf'] }],
    });
    if (answer.canceled || !answer.filePath) return { canceled: true };
    const target = /\.ssrf$/i.test(answer.filePath) ? answer.filePath : `${answer.filePath}.ssrf`;
    // The copy must not be the open logbook's own file: it would be written over while the logbook runs.
    if (descriptor.kind === 'file' && path.resolve(target).toLowerCase() === path.resolve(descriptor.location).toLowerCase()) throw new Error('SAME_FILE');
    await bridge.saveCopy(win.webContents.id, target);
    return { canceled: false, path: target };
  }

  const answer = (work) => async (event, ...args) => {
    try {
      return { ok: true, value: await work(event, ...args) };
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e), code: e && e.code };
    }
  };

  /** @param {any} event @param {string} op @param {any} [options] */
  async function handle(event, op, options = {}) {
    const win = fromEvent(event);
    switch (op) {
      case 'recent':
        return recent();
      case 'open': {
        const entry = store.find(String(options.id));
        if (!entry) throw new Error('NOT_FOUND');
        const result = await open(entry, win);
        return { opened: !!result.window };
      }
      case 'pickAndOpen':
        return pickAndOpen(win);
      case 'openPath':
        return openPath(options.path, win);
      case 'close':
        if (win) await closeLogbook(win);
        return true;
      case 'clearRecent':
        store.clear();
        notify();
        return [];
      case 'forget':
        store.forget(String(options.id));
        notify();
        return recent();
      case 'cloudStatus':
        return cloud ? cloud.status() : [];
      case 'cloudSignIn':
        if (!cloud) throw new Error('NOT_AVAILABLE');
        return cloud.signIn(String(options.provider));
      case 'cloudCancelSignIn':
        cloud?.cancelSignIn(String(options.provider));
        return true;
      case 'cloudSignOut':
        if (!cloud) throw new Error('NOT_AVAILABLE');
        return cloud.signOut(String(options.provider));
      case 'startup':
        return { mode: store.startup() };
      case 'setStartup':
        return { mode: store.setStartup(String(options.mode)) };
      case 'create':
        return createLogbook(options, win);
      case 'saveCopy':
        if (!win) throw new Error('NO_WINDOW');
        return saveCopy(win);
      case 'openCopy':
        return openPath(options.path, win);
      case 'revealCopy':
        if (typeof options.path === 'string' && path.isAbsolute(options.path)) shell.showItemInFolder(options.path);
        return true;
      default:
        throw new Error(`Unknown logbook operation ${op}`);
    }
  }

  ipcMain.handle('od:logbooks', answer((event, op, options) => handle(event, op, options)));

  return {
    openMain,
    openStartup,
    beforeQuit,
    checkCloud,
    open,
    openPath,
    pickAndOpen,
    closeLogbook,
    saveCopy,
    recent,
    handle,
    /** The focused logbook window, for the menu bar's commands. */
    focused: () => BrowserWindow.getFocusedWindow(),
    all: () => [...windows.values()],
    focus,
    titleOf,
  };
}

module.exports = { createWindowManager };
