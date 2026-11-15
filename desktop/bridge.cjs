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
// One window, one logbook, one helper (task 2026-11-15-173): `od:paths` also returns `logbook`, the
// descriptor of the sender's window (desktop/logbooks.cjs; null on the start screen), and od:core,
// od:credentials and od:fs run in the sender's context. The git token of a logbook other than the main
// one is its own file; a .ssrf file logbook is written back after saveLocal and sync.
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
const logbooks = require('./logbooks.cjs');

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
/** The token of a git logbook other than the main one: git-remote-<id>.bin (task 2026-11-15-173). */
const SECRET_PATTERN = /^git-remote-[fg]-[0-9a-f]{12}\.bin(\.tmp)?$/;
const DEV_FILES = new Set(['cloud-dev.env', 'cloud-test.env']);
const CREDENTIAL_FIELDS = {
  cloud: ['email', 'password'],
  git: ['url', 'username', 'branch', 'token'],
};
const CREDENTIAL_FILES = { cloud: 'cloud-account.bin', git: 'git-remote.bin' };
const KNOWN_GIT_CODES = new Set(['BAD_ADDRESS', 'BAD_CREDENTIALS', 'BAD_BRANCH', 'DENIED', 'NO_LOG', 'CREATE_FAILED', 'LOG_EXISTS', 'NOT_EMPTY']);
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

  const electron_ = () => (electron ? electron() : require('electron'));
  const sendAll = broadcast || ((channel, ...args) => {
    for (const window of electron_().BrowserWindow.getAllWindows()) window.webContents.send(channel, ...args);
  });
  const log = (text) => console.error(`[desktop] ${text}`);

  // --- Windows: one context, and one core helper, per logbook window (task 2026-11-15-173) ---
  // The core holds one logbook at a time, so each window has its own helper, started when the window
  // first calls the core. The window is known by its webContents id; calls that come without a
  // sender (tests, the single-window case before main.cjs attaches the window) use the default one.

  /** @typedef {{ key: number, descriptor: any, webContents: any, host: HostProcess, mirror: Promise<void>, failure: string }} WindowContext */
  /** @type {Map<number, WindowContext>} */
  const contexts = new Map();
  const DEFAULT_KEY = 0;

  /** To the window of the context; to every window when it has none. */
  function emit(/** @type {WindowContext} */ ctx, /** @type {string} */ channel, /** @type {any[]} */ ...args) {
    const target = ctx.webContents;
    if (!target) sendAll(channel, ...args);
    else if (!(typeof target.isDestroyed === 'function' && target.isDestroyed())) target.send(channel, ...args);
  }

  /** The calls every helper gets first: HOME and libgit2, then the certificates and the stylesheets
   *  (calls that reach the network must not run before them). */
  async function coreSetup(sendRaw) {
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
  }

  /** @param {number} key @param {any} descriptor @param {any} webContents @returns {WindowContext} */
  function newContext(key, descriptor, webContents) {
    /** @type {WindowContext} */
    const ctx = { key, descriptor: descriptor === undefined ? logbooks.MAIN : descriptor, webContents: webContents || null, host: /** @type {any} */ (null), mirror: Promise.resolve(), failure: '' };
    ctx.host = new HostProcess({
      hostPath,
      hostArgs,
      log,
      onEvent: (name, data) => emit(ctx, 'od:core-event', name, data),
      onExit: () => emit(ctx, 'od:core-event', 'coreRestarted', {}),
      async onStart(sendRaw) {
        await coreSetup(sendRaw);
        if (ctx.descriptor?.kind === 'file') await prepareFileLogbook(ctx, sendRaw);
      },
    });
    contexts.set(key, ctx);
    return ctx;
  }

  /** The context of the window an ipc message comes from. @param {any} [event] */
  function contextFor(event) {
    const key = event && event.sender && Number.isInteger(event.sender.id) ? event.sender.id : DEFAULT_KEY;
    return contexts.get(key) || contexts.get(DEFAULT_KEY) || newContext(DEFAULT_KEY, logbooks.MAIN, null);
  }

  /**
   * A window opens (main.cjs): it holds `descriptor`, or no logbook (null: the start screen). Its helper
   * starts when it first calls the core.
   * @param {any} webContents @param {any} descriptor
   */
  function attach(webContents, descriptor) {
    if (contexts.has(webContents.id)) return setDescriptor(webContents.id, descriptor);
    return newContext(webContents.id, descriptor, webContents);
  }

  /** The window holds another logbook, or none: its helper stops (it finishes its saves first) and a new one serves the next. */
  async function setDescriptor(/** @type {number} */ key, /** @type {any} */ descriptor) {
    const ctx = contexts.get(key);
    if (!ctx) return null;
    await ctx.mirror.catch(() => {});
    contexts.delete(key);
    await ctx.host.stop();
    return newContext(key, descriptor, ctx.webContents);
  }

  /** The window closed: its helper finishes what it was given, then exits. */
  async function detach(/** @type {number} */ key) {
    const ctx = contexts.get(key);
    if (!ctx) return;
    contexts.delete(key);
    await ctx.mirror.catch(() => {});
    await ctx.host.stop();
  }

  /** The logbook of a window (null: none open). */
  function descriptorOf(/** @type {number} */ key) {
    const ctx = contexts.get(key);
    return ctx ? ctx.descriptor : null;
  }

  // --- A file logbook: the core works on a git copy, the .ssrf file is kept up to date ---

  const repoDirOf = (ctx) => path.join(logbooks.cacheDir(userData, ctx.descriptor.id), 'repo');
  const metaFileOf = (ctx) => path.join(logbooks.cacheDir(userData, ctx.descriptor.id), 'meta.json');

  function writeMeta(ctx, file) {
    fs.mkdirSync(path.dirname(metaFileOf(ctx)), { recursive: true });
    fs.writeFileSync(metaFileOf(ctx), JSON.stringify({ hash: logbooks.fileHash(file) }));
  }

  /**
   * At the start of the helper: the git copy is made again from the file when the file is not the one
   * this app last wrote (Subsurface or another program changed it, or this is the first time).
   */
  async function prepareFileLogbook(ctx, sendRaw) {
    const file = ctx.descriptor.location;
    const repo = repoDirOf(ctx);
    if (!fs.existsSync(file)) {
      ctx.failure = 'FILE_MISSING';
      log(`The logbook file is missing: ${file}`);
      return;
    }
    ctx.failure = '';
    let meta = {};
    try {
      meta = JSON.parse(fs.readFileSync(metaFileOf(ctx), 'utf8'));
    } catch {
      // No bookkeeping yet.
    }
    if (fs.existsSync(repo) && meta.hash === logbooks.fileHash(file)) return;
    fs.rmSync(repo, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(repo), { recursive: true });
    try {
      await sendRaw('importFile', { source: file, repo: `${repo}[main]` });
    } catch (e) {
      ctx.failure = 'FILE_UNREADABLE';
      fs.rmSync(repo, { recursive: true, force: true });
      throw e;
    }
    writeMeta(ctx, file);
  }

  /** Every dive of the logbook in memory, as a .ssrf file at `target` (never the logbook's own file while it is open elsewhere). */
  async function exportAll(ctx, target) {
    const staged = path.join(tempDir, 'share', `copy-${ctx.key}-${Date.now()}.ssrf`);
    fs.mkdirSync(path.dirname(staged), { recursive: true, mode: 0o700 });
    try {
      const ids = JSON.parse(await ctx.host.call('listLoadedDives', {})).map((d) => d.id);
      if (ids.length) await ctx.host.call('exportDives', { ids, format: 'ssrf', anonymize: false, path: staged });
      else fs.writeFileSync(staged, logbooks.EMPTY_LOGBOOK);
      const tmp = `${target}.od-tmp`;
      fs.copyFileSync(staged, tmp);
      try {
        fs.renameSync(tmp, target);
      } catch (e) {
        // Windows refuses to rename over a file another program holds open (an antivirus, a sync client):
        // write into the file itself, then.
        if (!['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e;
        fs.copyFileSync(tmp, target);
        fs.rmSync(tmp, { force: true });
      }
    } finally {
      fs.rmSync(staged, { force: true });
    }
  }

  /** The file follows the git copy after a save; one write at a time per window. */
  function mirrorToFile(ctx) {
    const work = ctx.mirror.catch(() => {}).then(async () => {
      const file = ctx.descriptor.location;
      await exportAll(ctx, file);
      writeMeta(ctx, file);
    });
    ctx.mirror = work;
    return work;
  }

  /** Saves the logbook in memory as a copy at `target`: a .ssrf file. @param {WindowContext} ctx @param {string} target */
  async function saveCopy(ctx, target) {
    if (typeof target !== 'string' || !path.isAbsolute(target)) throw new Error('BAD_ARGUMENT: not a path');
    await ctx.host.start();
    await ctx.mirror.catch(() => {});
    await exportAll(ctx, target);
    return { path: target };
  }

  /**
   * Checks a git repository, with a helper of its own (the windows' helpers keep their logbooks), and
   * creates the logbook branch of an empty repository when `create`. Same answers as the plugin's gitConnect.
   * @param {{url: string, branch: string, username: string, token: string, create?: boolean}} options
   */
  async function probeGit({ url, branch, username, token, create }) {
    const probe = new HostProcess({ hostPath, hostArgs, log, onStart: (sendRaw) => coreSetup(sendRaw) });
    try {
      await probe.call('gitConfigure', { url, username, token, branch });
      const exists = JSON.parse(await probe.call('cloudProbe')).exists === true;
      if (!exists) {
        if (!create) throw new Error('NO_LOG');
        await probe.call('gitCreateLog');
        return { created: true };
      }
      return { created: false };
    } catch (e) {
      const message = String((e && e.message) || '');
      const code = message.includes('Credentials rejected') ? 'DENIED' : message.split(':')[0] || 'CORE_ERROR';
      const error = new Error(KNOWN_GIT_CODES.has(code) ? code : 'NETWORK');
      error.code = error.message;
      throw error;
    } finally {
      await probe.stop(3000);
    }
  }

  // --- The path policy ---

  /** @param {string} value a path from the renderer, [branch] allowed @param {'data'|'read'|'write'|'temp'} kind */
  function allowed(value, kind) {
    if (typeof value !== 'string' || value === '' || value.includes('\0')) return false;
    const plain = path.resolve(value.replace(/\[[^\]/\\]*\]$/, ''));
    if (SECRET_FILES.has(path.basename(plain)) || SECRET_PATTERN.test(path.basename(plain)) || DEV_FILES.has(path.basename(plain))) return false;
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

  /** A call from the renderer. */
  async function coreCall(method, args, ctx = contextFor()) {
    if (typeof method !== 'string' || !CORE_METHODS.has(method)) throw new Error(`Unknown method ${method}`);
    const checked = checkedArgs(method, args);
    if (ctx.descriptor && ctx.descriptor.kind === 'file') {
      // Before the first call: a file the app cannot read is told, not shown as an empty logbook.
      await ctx.host.start();
      if (ctx.failure) throw new Error(ctx.failure);
    }
    const result = await ctx.host.call(method, checked);
    // The file logbook's file follows every save of its git copy.
    if (ctx.descriptor && ctx.descriptor.kind === 'file' && (method === 'saveLocal' || method === 'sync')) await mirrorToFile(ctx);
    return result;
  }

  // --- Credentials: safeStorage, one encrypted file per kind (CredentialStore.kt, GitRemoteStore.kt) ---

  /**
   * The file of a kind of credentials. The main logbook has the two files it always had; another
   * logbook has its own git token (git-remote-<id>.bin) and no Subsurface cloud account.
   * @param {string} kind @param {WindowContext} ctx
   */
  function credentialFile(kind, ctx) {
    if (!CREDENTIAL_FILES[kind]) throw new Error('BAD_ARGUMENT: unknown credentials kind');
    // A window with no logbook (the start screen) has no credentials.
    if (!ctx.descriptor) return null;
    const own = ctx.descriptor.kind !== 'main' ? ctx.descriptor : null;
    if (!own) return path.join(userData, CREDENTIAL_FILES[kind]);
    if (kind !== 'git' || own.kind !== 'git') return null;
    return path.join(userData, `git-remote-${own.id}.bin`);
  }

  function encryptionAvailable() {
    if (!safeStorage.isEncryptionAvailable()) return false;
    // Linux without a keyring: Chromium falls back to a hard-coded key, which protects nothing.
    return !(typeof safeStorage.getSelectedStorageBackend === 'function' && safeStorage.getSelectedStorageBackend() === 'basic_text');
  }

  function readCredentials(kind, ctx) {
    const file = credentialFile(kind, ctx);
    if (!file || !fs.existsSync(file) || !encryptionAvailable()) return null;
    try {
      const value = JSON.parse(safeStorage.decryptString(fs.readFileSync(file)));
      return CREDENTIAL_FIELDS[kind].every((field) => typeof value[field] === 'string' && value[field] !== '') ? value : null;
    } catch {
      return null; // a key lost with a restore: as no account
    }
  }

  function writeCredentials(kind, value, ctx) {
    const file = credentialFile(kind, ctx);
    if (!file) throw new Error('BAD_ARGUMENT: this logbook has no such credentials');
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

  function clearCredentials(kind, ctx) {
    for (const k of kind ? [kind] : Object.keys(CREDENTIAL_FILES)) {
      const file = credentialFile(k, ctx);
      if (!file) continue;
      fs.rmSync(file, { force: true });
      fs.rmSync(`${file}.tmp`, { force: true });
    }
  }

  // --- Files ---

  /** @param {string} op @param {any} [options] @param {WindowContext} [ctx] */
  function fsCall(op, options = {}, ctx = contextFor()) {
    const isMain = !!ctx.descriptor && ctx.descriptor.kind === 'main';
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
        if (!isMain) throw new Error('BAD_ARGUMENT: not a logbook folder');
        const target = logbookFolder(options.path);
        fs.rmSync(target, { recursive: true, force: true });
        return true;
      }
      case 'rename': {
        if (!isMain) throw new Error('BAD_ARGUMENT: not a logbook folder');
        fs.renameSync(logbookFolder(options.from), logbookFolder(options.to));
        return true;
      }
      case 'readDevEnv': {
        if (!DEV_FILES.has(options.name)) throw new Error('BAD_ARGUMENT: unknown file');
        // The development accounts belong to the main logbook.
        if (!isMain) return '';
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

  /** Answers { ok, value } or { ok, error }: an Error thrown through ipcMain.handle loses its message's form. The first argument of `work` is the ipc event. */
  const answer = (work) => async (event, ...args) => {
    try {
      return { ok: true, value: await work(event, ...args) };
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e), code: e && e.code };
    }
  };

  ipcMain.on('od:paths', (event) => {
    event.returnValue = { ...paths, platform: process.platform, logbook: contextFor(event).descriptor };
  });
  ipcMain.handle('od:core', answer((event, method, args) => coreCall(method, args, contextFor(event))));
  ipcMain.handle('od:credentials', answer((event, op, kind, value) => {
    const ctx = contextFor(event);
    if (op === 'get') return readCredentials(kind, ctx);
    if (op === 'set') return writeCredentials(kind, value, ctx) ?? null;
    if (op === 'clear') return clearCredentials(kind, ctx) ?? null;
    throw new Error(`Unknown credentials operation ${op}`);
  }));
  ipcMain.handle('od:fs', answer((event, op, options) => fsCall(op, options, contextFor(event))));
  ipcMain.handle('od:htmlToPdf', answer((_event, options) => htmlToPdf(options)));
  ipcMain.handle('od:placesSearch', answer((_event, options) => placesSearch(options)));
  // « Afficher dans le dossier » (task 2026-11-15-202): only a folder of the app's data (the logbooks).
  ipcMain.handle('od:showInFolder', answer((_event, options) => {
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

  /** Every helper finishes what it was given (a save in progress), then exits. */
  async function stopAll() {
    await Promise.all([...contexts.values()].map((ctx) => ctx.mirror.catch(() => {}).then(() => ctx.host.stop())));
  }

  // Quit: the helpers finish what they were given, then the app goes.
  let quitting = false;
  app.on('will-quit', (event) => {
    if (quitting) return;
    quitting = true;
    event.preventDefault();
    stopAll().finally(() => app.quit());
  });

  return {
    call: (method, args) => coreCall(method, args),
    stop: stopAll,
    paths,
    // Windows and logbooks (windows.cjs)
    attach,
    detach,
    setDescriptor,
    descriptorOf,
    /** The core call of a window, as the renderer's, without the path checks (the main process asks). */
    callFor: (key, method, args) => coreCall(method, args ?? {}, contexts.get(key) || contextFor()),
    saveCopy: (key, target) => saveCopy(contexts.get(key) || contextFor(), target),
    probeGit,
    /** The access of a git logbook, from the dialog (the token never goes back to a renderer). */
    storeGitAccess: (descriptor, access) => writeCredentials('git', access, { descriptor }),
    forgetGitAccess: (descriptor) => clearCredentials('git', { descriptor }),
  };
}

module.exports = { setupBridge, HostProcess, CORE_METHODS, PATH_ARGS };
