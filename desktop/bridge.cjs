// SPDX-License-Identifier: GPL-2.0
'use strict';
// The bridge of the desktop app, main-process side. It starts the core's helper
// process (opendives-host, desktop/host/host.cpp), keeps it alive, and gives
// the renderer a small, checked API through the preload (desktop/preload.cjs).
// The renderer side of the plugin is plugins/opendives-core/desktop.js.
//
// ---------------------------------------------------------------------------
// Preload API: window.odDesktop (everything returns a Promise unless noted)
//
//   platform                 'win32' | 'darwin' | 'linux'                   (value)
//   paths                    { userData, temp, resourcesDir, xsltDir, caFile }   (values)
//                            userData: the app data directory (the logbook is <userData>/carnet);
//                            temp: <system temp>/opendives, where imports and shares are staged;
//                            resourcesDir: the bundled files (xslt/, SampleDivesV2.ssrf);
//                            xsltDir: Subsurface's stylesheets; caFile: the PEM bundle written
//                            from Node's root certificates.
//   core(method, args)       calls the core: resolves with the JSON value the host returns (a string
//                            stays a string, even when it holds JSON) or rejects with an Error whose
//                            message is the host's error. The methods are the NativeCore functions
//                            (host.cpp); init, setCaFile and setXsltDir are not callable: the bridge
//                            runs them before the first call and after every restart of the host.
//   onCoreEvent(name, cb)    cb(data) for an event; returns a function that unsubscribes (sync).
//                            Events: 'syncProgress' {message}, 'coreRestarted' {} (the host died and
//                            started again: the log must be loaded again).
//   credentials.get(kind)    the stored secret or null: kind 'cloud' {email, password} or
//                            'git' {url, username, branch, token}
//   credentials.set(kind, value)   stores it (Electron safeStorage, encrypted in <userData>)
//   credentials.clear(kind?) forgets one kind, or both without an argument
//   fs.writeFile({area, name, base64})  stages a file in <temp>/<area> ('import' or 'share'):
//                            resolves { path }; the name is reduced to its base name
//   fs.readFile({path})      the bytes of a file of <temp>, base64 (at most 100 MB)
//   fs.remove({path})        deletes a file of <temp>; resolves true when it existed
//   fs.exists({path})        a path of userData or temp exists
//   fs.removeTree({path})    deletes a folder <userData>/carnet*
//   fs.rename({from, to})    renames a folder <userData>/carnet* to another one
//   fs.readDevEnv({name})    the text of <userData>/cloud-dev.env or cloud-test.env, '' when absent
//   fs.deleteDevEnv({name})  deletes cloud-dev.env
//   htmlToPdf({html, name, letter})   renders a page to a PDF in <temp>/share: resolves { path }
//   saveAs({path, name})     the system's save dialog for a file of <temp>/share: resolves { saved, path }
//   placesSearch({url})      a Nominatim request with the app's User-Agent: resolves { status, body }
//
// The renderer is untrusted: methods are checked against the host's list, and
// every path argument of a core call or an fs call must be inside userData or
// temp (the bundled resources, for reading only), never one of the credential
// files.
//
// ---------------------------------------------------------------------------
// Host protocol: one JSON object per line over stdio (see desktop/host/host.cpp)
//   -> {"id":7,"method":"editDive","args":{"id":12,"changes":"{...}"}}
//   <- {"id":7,"result":<value>} | {"id":7,"error":"message"}
//   <- {"event":"syncProgress","data":{"message":"..."}}
//
// ipc channels: 'od:core', 'od:credentials', 'od:fs', 'od:htmlToPdf', 'od:placesSearch' (invoke,
// answered { ok: true, value } or { ok: false, error }), 'od:paths' (sendSync), and 'od:core-event'
// (main to renderer: name, data).

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

/** The NativeCore functions the renderer may call (host.cpp), without the ones the bridge runs itself. */
const CORE_METHODS = new Set([
  'logExists', 'countDives', 'importFile', 'cloudListDives', 'cloudConfigure', 'cloudListCachedDives',
  'cloudSignOut', 'cloudDeleteAccount', 'cloudCreateAccount', 'cloudVerifyPin', 'cloudCreateLog', 'importCount',
  'divelogsCheck', 'divelogsDownload', 'setCloudTestEmail', 'pendingChanges', 'cloudProbe', 'gitCheck',
  'gitConfigure', 'gitCreateLog', 'editDive', 'getTrip', 'tripAction', 'diveComputers', 'diveComputerAction',
  'siteQuery', 'filterQuery', 'createDive', 'deleteDive', 'renumberDives', 'importDives', 'filterPresets',
  'syncConflicts', 'resolveConflicts', 'cancelConflictResolution', 'siteAction', 'toolQuery', 'exportDives',
  'undo', 'sync', 'listLoadedDives', 'diveColumns', 'saveLocal', 'getDive', 'getPrefs', 'setPrefs', 'cylinderTypes',
  'plannerSetup', 'planDive', 'listPlans', 'savePlan', 'listDives', 'statsQuery', 'dcFromBluetoothName',
  'dcBluetoothModels', 'downloadPartial', 'downloadCancel', 'setSyncListener', 'ping',
]);

/**
 * The path arguments of the core calls: 'data' is a folder of the logbook (userData), 'read' a file the
 * core reads, 'write' a file or folder it writes. A trailing [branch] (Subsurface's address form) is
 * not part of the path.
 */
const PATH_ARGS = {
  logExists: { repo: 'data' },
  countDives: { log: 'data' },
  importFile: { source: 'read', repo: 'data' },
  listDives: { repo: 'data' },
  importCount: { path: 'read' },
  importDives: { file: 'read' },
  cloudCreateLog: { importPath: 'read' },
  cloudDeleteAccount: { keepDivesIn: 'data' },
  divelogsDownload: { outPath: 'write' },
  exportDives: { path: 'write' },
};

/** Files of userData the renderer never reaches by path. */
const SECRET_FILES = new Set(['cloud-account.bin', 'git-remote.bin', 'cloud-account.bin.tmp', 'git-remote.bin.tmp']);
const DEV_FILES = new Set(['cloud-dev.env', 'cloud-test.env']);
const CREDENTIAL_FIELDS = {
  cloud: ['email', 'password'],
  git: ['url', 'username', 'branch', 'token'],
};
const CREDENTIAL_FILES = { cloud: 'cloud-account.bin', git: 'git-remote.bin' };
const MAX_READ = 100 * 1024 * 1024;
const NOMINATIM = 'https://nominatim.openstreetmap.org/';
const REPO_URL = 'https://github.com/remillc/opendives';

/** @param {string} child @param {string} root */
function inside(child, root) {
  const relative = path.relative(root, child);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/** A file name without any directory part, and without characters a file system refuses. */
function safeName(name, fallback) {
  // eslint-disable-next-line no-control-regex
  const base = path.basename(String(name || '').replace(/\\/g, '/')).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_');
  return base && base !== '.' && base !== '..' ? base : fallback;
}

/**
 * The helper process: started on demand, restarted after it dies, every call matched by id.
 * `onStart` runs first on every new process (the setup calls); calls wait for it.
 */
class HostProcess {
  constructor({ hostPath, hostArgs = [], onEvent, onStart, onExit, log }) {
    this.hostPath = hostPath;
    this.hostArgs = hostArgs;
    this.onEvent = onEvent;
    this.onStart = onStart;
    this.onExit = onExit;
    this.log = log;
    this.child = null;
    this.ready = null;
    this.pending = new Map();
    this.nextId = 1;
    this.stopping = false;
    this.failedStarts = 0;
    this.restarts = 0;
  }

  /** Resolves when the process runs and is set up. */
  start() {
    if (this.stopping) return Promise.reject(new Error('The core is stopping'));
    if (this.ready) return this.ready;
    if (this.failedStarts >= 5) return Promise.reject(new Error('The core cannot start'));
    const child = spawn(this.hostPath, this.hostArgs, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    this.child = child;
    const startedAt = Date.now();
    const gone = (reason) => {
      if (this.child !== child) return;
      this.child = null;
      this.ready = null;
      this.failedStarts = Date.now() - startedAt < 2000 ? this.failedStarts + 1 : 0;
      const error = new Error(reason);
      for (const waiting of this.pending.values()) waiting.reject(error);
      this.pending.clear();
      if (!this.stopping) {
        this.restarts += 1;
        this.log(`opendives-host stopped: ${reason}`);
        this.onExit?.(reason);
      }
    };
    child.on('error', (e) => gone(`Cannot run the core: ${e.message}`));
    child.on('exit', (code, signal) => gone(`The core stopped (${signal || code})`));
    child.stdin.on('error', () => {}); // a closed pipe is reported by 'exit'
    child.stderr.on('data', (chunk) => process.stderr.write(`[core] ${chunk}`));
    readline.createInterface({ input: child.stdout, crlfDelay: Infinity }).on('line', (line) => this.line(line));
    this.ready = Promise.resolve()
      .then(() => this.onStart?.((method, args) => this.send(method, args)))
      .then(() => undefined)
      .catch((e) => {
        if (this.child === child) child.kill();
        throw e;
      });
    return this.ready;
  }

  line(text) {
    let message;
    try {
      message = JSON.parse(text);
    } catch {
      this.log(`opendives-host: not a protocol line: ${text.slice(0, 200)}`);
      return;
    }
    if (message.event) {
      this.onEvent?.(message.event, message.data ?? {});
      return;
    }
    const waiting = this.pending.get(message.id);
    if (!waiting) return;
    this.pending.delete(message.id);
    if ('error' in message) waiting.reject(new Error(String(message.error)));
    else waiting.resolve(message.result);
  }

  /** One request, without waiting for the setup. */
  send(method, args) {
    return new Promise((resolve, reject) => {
      const child = this.child;
      if (!child || !child.stdin.writable) {
        reject(new Error('The core is not running'));
        return;
      }
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      child.stdin.write(`${JSON.stringify({ id, method, args: args ?? {} })}\n`);
    });
  }

  async call(method, args) {
    await this.start();
    return this.send(method, args);
  }

  /** Closes stdin: the host finishes the queued requests, then exits. Killed after `timeoutMs`. */
  async stop(timeoutMs = 10000) {
    this.stopping = true;
    const child = this.child;
    if (!child) return;
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        child.kill();
        resolve();
      }, timeoutMs);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      child.stdin.end();
    });
  }
}

/**
 * @param {object} options
 * @param {import('electron').IpcMain} options.ipcMain
 * @param {import('electron').App} options.app
 * @param {import('electron').SafeStorage} options.safeStorage
 * @param {string} options.hostPath path of the opendives-host executable
 * @param {string[]} [options.hostArgs] arguments before the protocol (tests)
 * @param {string} [options.resourcesDir] the bundled files; default: <process.resourcesPath>/resources when
 *   packaged, else desktop/resources
 * @param {(channel: string, ...args: any[]) => void} [options.broadcast] sends to every window; default: all
 *   BrowserWindows
 * @param {() => any} [options.electron] the electron module, for BrowserWindow (tests replace it)
 * @returns {{ call: (method: string, args?: object) => Promise<any>, stop: () => Promise<void>, paths: object }}
 */
function setupBridge({ ipcMain, app, safeStorage, hostPath, hostArgs = [], resourcesDir, broadcast, electron }) {
  const userData = app.getPath('userData');
  const tempDir = path.join(app.getPath('temp'), 'opendives');
  const resources = resourcesDir
    || (app.isPackaged ? path.join(process.resourcesPath, 'resources') : path.join(__dirname, 'resources'));
  const paths = {
    userData,
    temp: tempDir,
    resourcesDir: resources,
    xsltDir: path.join(resources, 'xslt'),
    caFile: path.join(userData, 'cacerts.pem'),
  };
  fs.mkdirSync(userData, { recursive: true });
  // Where imports are staged and shares are written: the core writes there too (divelogs.de, exports).
  for (const area of ['import', 'share']) fs.mkdirSync(path.join(tempDir, area), { recursive: true, mode: 0o700 });

  const send = broadcast || ((channel, ...args) => {
    for (const window of electron_().BrowserWindow.getAllWindows()) window.webContents.send(channel, ...args);
  });
  const electron_ = () => (electron ? electron() : require('electron'));
  const log = (text) => console.error(`[desktop] ${text}`);

  // --- The path policy ---

  /** @param {string} value a path from the renderer, [branch] allowed @param {'data'|'read'|'write'|'temp'} kind */
  function allowed(value, kind) {
    if (typeof value !== 'string' || value === '' || value.includes('\0')) return false;
    const plain = path.resolve(value.replace(/\[[^\]/\\]*\]$/, ''));
    if (SECRET_FILES.has(path.basename(plain)) || DEV_FILES.has(path.basename(plain))) return false;
    if (kind === 'temp') return inside(plain, tempDir);
    if (kind === 'data') return inside(plain, userData) || plain === userData;
    if (kind === 'write') return inside(plain, userData) || inside(plain, tempDir);
    return inside(plain, userData) || inside(plain, tempDir) || inside(plain, resources);
  }

  /** The core call after its path arguments are checked. */
  function checkedArgs(method, args) {
    if (args === undefined || args === null) return {};
    if (typeof args !== 'object' || Array.isArray(args)) throw new Error('BAD_ARGUMENT: the arguments are not an object');
    for (const [name, kind] of Object.entries(PATH_ARGS[method] || {})) {
      const value = args[name];
      // An empty value is "none" (cloudCreateLog, cloudDeleteAccount).
      if (value === undefined || value === '') continue;
      if (!allowed(value, kind)) throw new Error(`BAD_ARGUMENT: ${name} is not an allowed path`);
    }
    return args;
  }

  // --- The core ---

  function writeCaFile() {
    // Node's root certificates, as Android's store is exported for the core (libgit2 needs a file).
    const pem = require('node:tls').rootCertificates.join('\n');
    let current = '';
    try {
      current = fs.readFileSync(paths.caFile, 'utf8');
    } catch {
      // No file yet.
    }
    if (current !== pem) {
      fs.writeFileSync(`${paths.caFile}.tmp`, pem);
      fs.renameSync(`${paths.caFile}.tmp`, paths.caFile);
    }
  }

  const host = new HostProcess({
    hostPath,
    hostArgs,
    log,
    onEvent: (name, data) => send('od:core-event', name, data),
    onExit: () => send('od:core-event', 'coreRestarted', {}),
    // The setup, before any other call: HOME and libgit2, then the certificates and the stylesheets
    // (calls that reach the network must not run before them).
    async onStart(sendRaw) {
      await sendRaw('init', { home: userData });
      try {
        writeCaFile();
        await sendRaw('setCaFile', { path: paths.caFile });
      } catch (e) {
        log(`Cannot set the certificate authorities: ${e.message}`);
      }
      try {
        await sendRaw('setXsltDir', { dir: paths.xsltDir });
      } catch (e) {
        log(`Cannot set the XSLT stylesheets: ${e.message}`);
      }
    },
  });

  /** A call from the renderer. */
  function coreCall(method, args) {
    if (typeof method !== 'string' || !CORE_METHODS.has(method)) throw new Error(`Unknown method ${method}`);
    return host.call(method, checkedArgs(method, args));
  }

  // --- Credentials: safeStorage, one encrypted file per kind (CredentialStore.kt, GitRemoteStore.kt) ---

  function credentialFile(kind) {
    if (!CREDENTIAL_FILES[kind]) throw new Error('BAD_ARGUMENT: unknown credentials kind');
    return path.join(userData, CREDENTIAL_FILES[kind]);
  }

  function encryptionAvailable() {
    if (!safeStorage.isEncryptionAvailable()) return false;
    // Linux without a keyring: Chromium falls back to a hard-coded key, which protects nothing.
    return !(typeof safeStorage.getSelectedStorageBackend === 'function' && safeStorage.getSelectedStorageBackend() === 'basic_text');
  }

  function readCredentials(kind) {
    const file = credentialFile(kind);
    if (!fs.existsSync(file) || !encryptionAvailable()) return null;
    try {
      const value = JSON.parse(safeStorage.decryptString(fs.readFileSync(file)));
      return CREDENTIAL_FIELDS[kind].every((field) => typeof value[field] === 'string' && value[field] !== '') ? value : null;
    } catch {
      return null; // a key lost with a restore: as no account
    }
  }

  function writeCredentials(kind, value) {
    const file = credentialFile(kind);
    const fields = CREDENTIAL_FIELDS[kind];
    if (!value || typeof value !== 'object' || fields.some((field) => typeof value[field] !== 'string' || value[field] === '')) {
      throw new Error('BAD_ARGUMENT: incomplete credentials');
    }
    if (!encryptionAvailable()) throw new Error('CREDENTIALS_NOT_SAVED');
    const text = JSON.stringify(Object.fromEntries(fields.map((field) => [field, value[field]])));
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, safeStorage.encryptString(text), { mode: 0o600 });
    try {
      fs.renameSync(tmp, file);
    } catch {
      fs.rmSync(tmp, { force: true });
      throw new Error('CREDENTIALS_NOT_SAVED');
    }
  }

  function clearCredentials(kind) {
    for (const k of kind ? [kind] : Object.keys(CREDENTIAL_FILES)) {
      const file = credentialFile(k);
      fs.rmSync(file, { force: true });
      fs.rmSync(`${file}.tmp`, { force: true });
    }
  }

  // --- Files ---

  function fsCall(op, options = {}) {
    switch (op) {
      case 'writeFile': {
        if (options.area !== 'import' && options.area !== 'share') throw new Error('BAD_ARGUMENT: unknown area');
        if (typeof options.base64 !== 'string') throw new Error('BAD_ARGUMENT: no data');
        const dir = path.join(tempDir, options.area);
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
        const file = path.join(dir, safeName(options.name, 'file'));
        fs.writeFileSync(file, Buffer.from(options.base64, 'base64'));
        return { path: file };
      }
      case 'readFile': {
        if (!allowed(options.path, 'temp')) throw new Error('BAD_ARGUMENT: not an allowed path');
        if (fs.statSync(options.path).size > MAX_READ) throw new Error('TOO_BIG');
        return fs.readFileSync(options.path).toString('base64');
      }
      case 'remove': {
        if (!allowed(options.path, 'temp')) throw new Error('BAD_ARGUMENT: not an allowed path');
        const existed = fs.existsSync(options.path);
        fs.rmSync(options.path, { force: true });
        return existed;
      }
      case 'exists': {
        if (!allowed(options.path, 'write')) throw new Error('BAD_ARGUMENT: not an allowed path');
        return fs.existsSync(options.path);
      }
      case 'removeTree': {
        const target = logbookFolder(options.path);
        fs.rmSync(target, { recursive: true, force: true });
        return true;
      }
      case 'rename': {
        fs.renameSync(logbookFolder(options.from), logbookFolder(options.to));
        return true;
      }
      case 'readDevEnv': {
        if (!DEV_FILES.has(options.name)) throw new Error('BAD_ARGUMENT: unknown file');
        const file = path.join(userData, options.name);
        return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      }
      case 'deleteDevEnv': {
        if (options.name !== 'cloud-dev.env') throw new Error('BAD_ARGUMENT: unknown file');
        fs.rmSync(path.join(userData, options.name), { force: true });
        return true;
      }
      default:
        throw new Error(`Unknown file operation ${op}`);
    }
  }

  /** A folder of the logbook: <userData>/carnet, carnet.new, carnet.before-…; nothing else. */
  function logbookFolder(value) {
    if (typeof value !== 'string') throw new Error('BAD_ARGUMENT: not an allowed path');
    const target = path.resolve(value);
    if (path.dirname(target) !== userData || !/^carnet(\.[A-Za-z0-9._-]+)?$/.test(path.basename(target))) {
      throw new Error('BAD_ARGUMENT: not a logbook folder');
    }
    return target;
  }

  // --- Network and printing, which the WebView cannot do ---

  async function placesSearch({ url } = {}) {
    if (typeof url !== 'string' || !url.startsWith(NOMINATIM)) throw new Error('BAD_ARGUMENT: bad address');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': `OpenDives/${app.getVersion()} (dive log app; ${REPO_URL})`, Accept: 'application/json' },
      });
      const body = response.ok ? await response.text() : '';
      return { status: response.status, body };
    } catch (e) {
      const error = new Error(e.message || 'Cannot reach the server');
      error.code = 'NETWORK';
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  /** A page of HTML (the dive sheet) printed to a PDF in <temp>/share, in a hidden window without scripts. */
  async function htmlToPdf({ html, name, letter } = {}) {
    if (typeof html !== 'string' || typeof name !== 'string' || !name) throw new Error('BAD_ARGUMENT: missing html or name');
    const dir = path.join(tempDir, 'share');
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const source = path.join(dir, `${safeName(name, 'sheet')}.html`);
    const target = path.join(dir, safeName(name, 'sheet.pdf'));
    fs.writeFileSync(source, html);
    const { BrowserWindow } = electron_();
    const win = new BrowserWindow({
      show: false,
      webPreferences: { javascript: false, sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    try {
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      await win.loadFile(source);
      const pdf = await win.webContents.printToPDF({
        pageSize: letter ? 'Letter' : 'A4',
        printBackground: true,
        margins: { marginType: 'none' },
      });
      fs.writeFileSync(target, pdf);
      return { path: target };
    } finally {
      win.destroy();
      fs.rmSync(source, { force: true });
    }
  }

  // --- ipc ---

  /** Answers { ok, value } or { ok, error }: an Error thrown through ipcMain.handle loses its message's form. */
  const answer = (work) => async (_event, ...args) => {
    try {
      return { ok: true, value: await work(...args) };
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e), code: e && e.code };
    }
  };

  ipcMain.on('od:paths', (event) => {
    event.returnValue = { ...paths, platform: process.platform };
  });
  ipcMain.handle('od:core', answer((method, args) => coreCall(method, args)));
  ipcMain.handle('od:credentials', answer((op, kind, value) => {
    if (op === 'get') return readCredentials(kind);
    if (op === 'set') return writeCredentials(kind, value) ?? null;
    if (op === 'clear') return clearCredentials(kind) ?? null;
    throw new Error(`Unknown credentials operation ${op}`);
  }));
  ipcMain.handle('od:fs', answer((op, options) => fsCall(op, options)));
  ipcMain.handle('od:htmlToPdf', answer((options) => htmlToPdf(options)));
  ipcMain.handle('od:placesSearch', answer((options) => placesSearch(options)));
  // « Afficher dans le dossier » (task 2026-11-15-202): only the logbook's own folder (userData or carnet*).
  ipcMain.handle('od:showInFolder', answer((options) => {
    const target = path.resolve(String(options?.path ?? ''));
    if (target !== userData && !(path.dirname(target) === userData && /^carnet(\.[A-Za-z0-9._-]+)?$/.test(path.basename(target)))) throw new Error('BAD_ARGUMENT: not a logbook folder');
    const { shell } = electron_();
    if (fs.existsSync(target)) shell.openPath(target);
    else shell.showItemInFolder(target);
    return true;
  }));
  // « Exporter… » on desktop (task 2026-11-15-189): the system's save dialog, then the file staged
  // in <temp>/share copied where the diver chose. Resolves { saved, path }.
  ipcMain.handle('od:saveAs', async (event, options) => {
    try {
      const from = String(options?.path ?? '').startsWith('file:') ? require('node:url').fileURLToPath(options.path) : String(options?.path ?? '');
      if (!allowed(from, 'temp')) throw new Error('BAD_ARGUMENT: not an allowed path');
      const { dialog, BrowserWindow } = electron_();
      const win = BrowserWindow.fromWebContents(event.sender);
      const name = path.basename(String(options?.name ?? path.basename(from)));
      const chosen = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('documents'), name) });
      if (chosen.canceled || !chosen.filePath) return { ok: true, value: { saved: false } };
      await fs.promises.copyFile(from, chosen.filePath);
      return { ok: true, value: { saved: true, path: chosen.filePath } };
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  });

  // Quit: the host finishes what it was given (a save in progress), then exits.
  let quitting = false;
  app.on('will-quit', (event) => {
    if (quitting) return;
    quitting = true;
    event.preventDefault();
    host.stop().finally(() => app.quit());
  });

  return { call: coreCall, stop: () => host.stop(), paths };
}

module.exports = { setupBridge, HostProcess, CORE_METHODS, PATH_ARGS };
