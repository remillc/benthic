// SPDX-License-Identifier: GPL-2.0
// @ts-check
// The desktop (Electron) implementation of the BenthicCore plugin. It mirrors
// android/.../BenthicCorePlugin.kt method by method: the same option names, the
// same resolved shapes and the same rejection codes, so that core-api.js and the app
// do not know where they run. It is built on window.benthicDesktop (desktop/preload.cjs,
// contract in desktop/bridge.cjs): the core runs in a helper process, secrets are in
// Electron's safeStorage, files are staged in the app's temp folder.
//
// What a desktop cannot do answers as the Android plugin answers when the thing is
// absent, or rejects with the code UNAVAILABLE (see the end of the class).
import { WebPlugin } from '@capacitor/core';

/** An error shaped like Capacitor's plugin errors: the message, and the code the app reads. */
class PluginError extends Error {
  /** @param {string} message @param {string} [code] */
  constructor(message, code = 'CORE_ERROR') {
    super(message);
    this.code = code;
  }
}

/** @param {string} message @param {string} [code] */
const reject = (message, code = message) => new PluginError(message, code);

const unavailable = (/** @type {string} */ what) => reject(`${what} is not available on the desktop`, 'UNAVAILABLE');

const TEST_ACCOUNT = 'cloud-test.env';
const DEV_CREDENTIALS = 'cloud-dev.env';
const IMPORT_PREFIX = 'import-';
/** The most an export may be to come back as text. */
const MAX_TEXT = 8 * 1024 * 1024;
const SAMPLE = 'SampleDivesV2.ssrf';
const KNOWN_GIT_CODES = new Set(['BAD_ADDRESS', 'BAD_CREDENTIALS', 'BAD_BRANCH', 'DENIED', 'NO_LOG', 'CREATE_FAILED', 'LOG_EXISTS', 'NOT_EMPTY']);

/** The separator a path uses (Windows paths come with backslashes). @param {string} p */
const separator = (p) => (p.includes('\\') && !p.includes('/') ? '\\' : '/');
/** @param {string} dir @param {...string} parts */
export const joinPath = (dir, ...parts) => [dir.replace(/[\\/]+$/, ''), ...parts].join(separator(dir));
/** @param {string} p */
const baseName = (p) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? '';
/** @param {string} p */
const dirName = (p) => p.replace(/[\\/]+$/, '').replace(/[\\/][^\\/]*$/, '');
/** The part of an address before its [branch]. @param {string} url */
const withoutBranch = (url) => (url.lastIndexOf('[') >= 0 ? url.slice(0, url.lastIndexOf('[')) : url);

/**
 * `file://` address of a local path, as Android's Uri.fromFile gives.
 * @param {string} p
 */
export function fileUrl(p) {
  const slashed = p.replace(/\\/g, '/');
  return `file://${slashed.startsWith('/') ? '' : '/'}${encodeURI(slashed).replace(/[?#]/g, encodeURIComponent)}`;
}

/**
 * The text of an env file as {key: value}: lines `KEY=value`, comments (#) and blank lines left out.
 * @param {string} text
 */
export function parseEnv(text) {
  /** @type {Record<string, string>} */
  const values = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.includes('=') || line.startsWith('#')) continue;
    values[line.slice(0, line.indexOf('='))] = line.slice(line.indexOf('=') + 1);
  }
  return values;
}

/**
 * The five strings per rule the core takes (see filterQuery in benthic_jni.cpp).
 * @param {any[]|null|undefined} rules
 * @returns {string[]}
 */
export function flatRules(rules) {
  /** @type {string[]} */
  const out = [];
  for (const rule of rules ?? []) {
    out.push(String(rule?.type ?? ''), String(rule?.stringMode ?? ''), String(rule?.rangeMode ?? ''), rule?.negate ? '1' : '0', String(rule?.data ?? ''));
  }
  return out;
}

/** @param {string} base64 */
function base64ToText(base64) {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

export class BenthicCoreDesktop extends WebPlugin {
  constructor() {
    super();
    /**
     * An account being created or signed in to whose logbook does not exist yet: kept in memory
     * only, and stored once its logbook is created.
     * @type {{email: string, password: string}|null}
     */
    this.pendingAccount = null;
    this.eventsBound = false;
  }

  // --- The bridge ---

  /** window.benthicDesktop, or UNAVAILABLE in a plain browser. @returns {any} */
  get bridge() {
    const bridge = /** @type {any} */ (globalThis).benthicDesktop;
    if (!bridge) throw reject('The desktop core is not available', 'UNAVAILABLE');
    if (!this.eventsBound) {
      this.eventsBound = true;
      // The messages of the cloud log's git work, as the Android plugin's "syncProgress" ({message}).
      bridge.onCoreEvent('syncProgress', (/** @type {any} */ data) => this.notifyListeners('syncProgress', data));
      bridge.onCoreEvent('gitProgress', (/** @type {any} */ data) => this.notifyListeners('gitProgress', data));
      // The push channel's stream (bridge.cjs).
      bridge.onCoreEvent('pushStream', (/** @type {any} */ data) => this.notifyListeners('pushStream', data));
      // The core's process died and started again: what was loaded is gone.
      bridge.onCoreEvent('coreRestarted', () => this.notifyListeners('coreRestarted', {}));
    }
    return bridge;
  }

  /**
   * One call of the core. A failure rejects with the core's message and the code CORE_ERROR, as
   * the Android plugin's onCoreThread does.
   * @param {string} method @param {Record<string, any>} [args]
   */
  async core(method, args) {
    const bridge = this.bridge;
    try {
      return await bridge.core(method, args ?? {});
    } catch (/** @type {any} */ e) {
      throw reject(e?.message ?? String(e), 'CORE_ERROR');
    }
  }

  /** @returns {string} the repository of the logbook: <userData>/carnet[main] */
  get repo() {
    return `${this.repoDir}[main]`;
  }
  /**
   * Where the core keeps this window's logbook (task 2026-11-15-173): <userData>/carnet for the logbook
   * of this computer (the only one before there were several), <userData>/logbooks/<id>/repo for a file
   * logbook (a git copy the bridge writes back to the .ssrf file).
   */
  get repoDir() {
    const logbook = this.bridge.logbook;
    if (logbook && logbook.kind !== 'main') return joinPath(this.bridge.paths.userData, 'logbooks', logbook.id, 'repo');
    return joinPath(this.bridge.paths.userData, 'carnet');
  }
  /** The logbook this window holds; null on the start screen (no logbook open), undefined outside the desktop app. */
  get windowLogbook() {
    return /** @type {any} */ (globalThis).benthicDesktop?.logbook;
  }
  get importDir() {
    return joinPath(this.bridge.paths.temp, 'import');
  }

  /** A file staged for the import steps (importCount, createLog): only ours, in the import folder. @param {string} path */
  isImportFile(path) {
    return typeof path === 'string' && dirName(path) === this.importDir && baseName(path).startsWith(IMPORT_PREFIX);
  }

  /** @param {string} name */
  async readEnv(name) {
    return parseEnv(await this.bridge.fs.readDevEnv({ name }));
  }

  async readTestEmail() {
    return (await this.readEnv(TEST_ACCOUNT)).BENTHIC_CLOUD_TEST_EMAIL ?? '';
  }

  /** The stored account, else the development credentials. @returns {Promise<{email: string, password: string}|null>} */
  async accountCredentials() {
    const stored = await this.bridge.credentials.get('cloud');
    if (stored) return { email: stored.email, password: stored.password };
    const values = await this.readEnv(DEV_CREDENTIALS);
    const email = values.BENTHIC_CLOUD_EMAIL ?? '';
    const password = values.BENTHIC_CLOUD_PASSWORD ?? '';
    return email && password ? { email, password } : null;
  }

  /** After a failed sign-in: the account of this device again, if any. */
  async configureStoredAccount() {
    const credentials = await this.accountCredentials();
    try {
      await this.core('cloudConfigure', { email: credentials?.email ?? '', password: credentials?.password ?? '' });
    } catch {
      // No account: none is set.
    }
  }

  // --- The logbook ---

  /** @param {any} [_options] */
  async importSample(_options) {
    const count = await this.core('importFile', { source: joinPath(this.bridge.paths.resourcesDir, SAMPLE), repo: this.repo });
    return { count };
  }

  /** The JSON of the core is passed on as a string (`json`) and parsed once, in core-api.js. */
  async listDives() {
    // The start screen: no logbook is open in this window.
    if (this.windowLogbook === null) return { exists: false, json: '[]' };
    const exists = await this.core('logExists', { repo: this.repo });
    const json = exists ? await this.core('listDives', { repo: this.repo }) : '[]';
    return { exists, json };
  }

  /** @param {{id?: number}} options */
  async getDive(options) {
    if (options?.id == null) throw reject('Missing dive id', 'BAD_ARGUMENT');
    return JSON.parse(await this.core('getDive', { id: options.id }));
  }

  async plannerSetup() {
    return { json: await this.core('plannerSetup') };
  }

  /** @param {{request?: any}} options */
  async planDive(options) {
    if (options?.request == null) throw reject('Missing plan request', 'BAD_ARGUMENT');
    return { json: await this.core('planDive', { request: JSON.stringify(options.request) }) };
  }

  async getPrefs() {
    return { json: await this.core('getPrefs') };
  }

  /** @param {{changes?: any}} options */
  async setPrefs(options) {
    if (options?.changes == null) throw reject('Missing changes', 'BAD_ARGUMENT');
    await this.core('setPrefs', { changes: JSON.stringify(options.changes) });
  }

  /** @param {{action?: string, name?: string, value?: string, ml?: number, mbar?: number}} options */
  async cylinderTypes(options) {
    const json = await this.core('cylinderTypes', {
      action: options?.action ?? '',
      name: options?.name ?? '',
      value: options?.value ?? '',
      ml: options?.ml ?? 0,
      mbar: options?.mbar ?? 0,
    });
    return { json };
  }

  // --- Cloud account and own git repository ---

  /**
   * Sets the account (or the user's own repository) of this device, without network. `email` is the
   * user name for a repository.
   */
  async configureCloud() {
    // The start screen has no logbook, so no account.
    if (this.windowLogbook === null) return { available: false, email: '' };
    const remote = await this.bridge.credentials.get('git');
    if (remote) {
      try {
        await this.core('gitConfigure', { url: withoutBranch(remote.url), username: remote.username, token: remote.token, branch: remote.branch });
        return {
          available: true,
          email: remote.username,
          mode: 'git',
          repository: withoutBranch(remote.url).slice(withoutBranch(remote.url).indexOf('://') + 3),
        };
      } catch (/** @type {any} */ e) {
        console.warn('The stored repository cannot be used:', e?.message);
      }
    }
    const credentials = await this.accountCredentials();
    if (credentials) await this.core('cloudConfigure', { email: credentials.email, password: credentials.password });
    // Write lock: writing to the cloud is allowed only for the test account named in cloud-test.env.
    await this.core('setCloudTestEmail', { email: await this.readTestEmail() });
    return { available: credentials != null, email: credentials?.email ?? '' };
  }

  async probeCloud() {
    return { json: await this.core('cloudProbe') };
  }

  /** @param {{cached?: boolean}} [options] */
  async listCloudDives(options) {
    if (this.windowLogbook === null) return { available: false };
    const cached = options?.cached === true;
    let json;
    if (cached) {
      json = await this.core('cloudListCachedDives');
    } else if ((await this.bridge.credentials.get('git')) != null) {
      // Own git repository, set by configureCloud: the arguments are ignored.
      json = await this.core('cloudListDives', { email: '', password: '' });
    } else {
      const credentials = await this.accountCredentials();
      if (!credentials) return { available: false };
      json = await this.core('cloudListDives', { email: credentials.email, password: credentials.password });
    }
    return { available: true, json };
  }

  /** The previous version's cloud cache: never present on the desktop, but the contract is the same. */
  async alphaCache(options) {
    if (options?.action === 'open') return { json: await this.core('alphaCacheOpen', { id: options.id ?? '' }) };
    return { json: await this.core('alphaCacheList') };
  }

  async pendingChanges() {
    return { json: await this.core('pendingChanges') };
  }

  /** The versions of the configured logbook (benthic.h, history_call). @param {{action: string, args?: string[]}} options */
  async history(options) {
    return { json: await this.core('history', { action: options?.action ?? '', args: options?.args ?? [] }) };
  }

  /**
   * Signs out: the core closes the log and forgets the account (and deletes the device copy when
   * asked, never with changes not sent), then the stored credentials are forgotten.
   * @param {{deleteCopy?: boolean}} [options]
   */
  async signOut(options) {
    await this.core('cloudSignOut', { deleteCopy: options?.deleteCopy === true });
    await this.bridge.credentials.clear();
    this.pendingAccount = null;
    await this.bridge.fs.deleteDevEnv({ name: DEV_CREDENTIALS });
  }

  /**
   * DEVELOPMENT ONLY: the first-install reset (see core-api.js). The core closes its log, the credentials go, the device
   * logbook (`carnet`) is removed; the desktop has no alpha cache, so `keepAlpha` changes nothing. Only the
   * development menu calls it (dev builds contain it, behind VITE_DEV_ACCOUNTS); `fs.removeTree` only reaches `carnet*`.
   * @param {{keepAlpha?: boolean}} [_options]
   */
  async devResetApp(_options) {
    await this.core('cloudSignOut', { deleteCopy: false });
    await this.bridge.credentials.clear();
    this.pendingAccount = null;
    await this.bridge.fs.deleteDevEnv({ name: DEV_CREDENTIALS });
    const fs = this.bridge.fs;
    if (await fs.exists({ path: this.repoDir })) await fs.removeTree({ path: this.repoDir });
  }

  /** @param {{password?: string, keepDives?: boolean}} options */
  async deleteAccount(options) {
    const password = options?.password ?? '';
    const keepDives = options?.keepDives !== false;
    const kept = joinPath(this.bridge.paths.userData, 'carnet.new');
    const fs = this.bridge.fs;
    if (await fs.exists({ path: kept })) await fs.removeTree({ path: kept }); // left by an earlier attempt
    const json = await this.core('cloudDeleteAccount', { password, keepDivesIn: keepDives ? `${kept}[main]` : '' });
    const deleted = JSON.parse(json).deleted === true;
    if (deleted) {
      await this.bridge.credentials.clear('cloud');
      await fs.deleteDevEnv({ name: DEV_CREDENTIALS });
      if (keepDives) {
        if (await fs.exists({ path: this.repoDir })) await fs.rename({ from: this.repoDir, to: joinPath(this.bridge.paths.userData, `carnet.before-${Date.now()}`) });
        await fs.rename({ from: kept, to: this.repoDir });
      }
    } else if (await fs.exists({ path: kept })) {
      await fs.removeTree({ path: kept });
    }
    return { json };
  }

  /**
   * Signs in with typed credentials: the account is set, then the server is asked for its log
   * branch, which checks the password. Rejects with INCORRECT or NETWORK; the previous account is
   * then set again. With a logbook on the server, the credentials are stored; without one, they
   * wait in memory for createLog.
   * @param {{email?: string, password?: string}} options
   */
  async signIn(options) {
    // "email address MUST be lower case" (Subsurface-mobile).
    const email = (options?.email ?? '').trim().toLowerCase();
    const password = options?.password ?? '';
    await this.core('setCloudTestEmail', { email: await this.readTestEmail() });
    await this.core('cloudConfigure', { email, password });
    let json;
    try {
      json = await this.core('cloudProbe');
    } catch (/** @type {any} */ e) {
      await this.configureStoredAccount();
      const code = String(e?.message ?? '').includes('Credentials rejected') ? 'INCORRECT' : 'NETWORK';
      throw reject(code);
    }
    const exists = JSON.parse(json).exists === true;
    if (exists) {
      await this.bridge.credentials.set('cloud', { email, password });
      this.pendingAccount = null;
    } else {
      this.pendingAccount = { email, password };
    }
    return { exists, email };
  }

  /**
   * New account, step 1. "need_pin": the server mailed a code, the credentials wait in memory for
   * verifyPin. "verified": the account already exists with this password. "incorrect": refused.
   * @param {{email?: string, password?: string}} options
   */
  async createAccount(options) {
    const email = (options?.email ?? '').trim().toLowerCase();
    const password = options?.password ?? '';
    await this.core('setCloudTestEmail', { email: await this.readTestEmail() });
    const result = JSON.parse(await this.core('cloudCreateAccount', { email, password }));
    if (result.status === 'need_pin') this.pendingAccount = { email, password };
    return { status: result.status, email };
  }

  /** "Renvoyer le code": the same request as createAccount, for the account waiting for its code. */
  async resendCode() {
    const account = this.pendingAccount;
    if (!account) throw reject('NO_ACCOUNT');
    await this.core('setCloudTestEmail', { email: await this.readTestEmail() });
    const result = JSON.parse(await this.core('cloudCreateAccount', { email: account.email, password: account.password }));
    return { status: result.status };
  }

  /** @param {{pin?: string}} options */
  async verifyPin(options) {
    const account = this.pendingAccount;
    if (!account) throw reject('NO_ACCOUNT');
    await this.core('setCloudTestEmail', { email: await this.readTestEmail() });
    const pin = (options?.pin ?? '').trim();
    const result = JSON.parse(await this.core('cloudVerifyPin', { email: account.email, password: account.password, pin }));
    if (result.status === 'verified') await this.core('cloudConfigure', { email: account.email, password: account.password });
    return { status: result.status };
  }

  /** @param {{url?: string, username?: string, token?: string, useStored?: boolean}} options */
  async gitCheck(options) {
    const url = options?.url ?? '';
    let username = (options?.username ?? '').trim();
    let token = (options?.token ?? '').trim();
    if (options?.useStored === true && token === '') {
      const stored = await this.bridge.credentials.get('git');
      if (stored) {
        username = stored.username;
        token = stored.token;
      }
    }
    try {
      return { json: await this.core('gitCheck', { url, username, token }) };
    } catch (/** @type {any} */ e) {
      // BAD_ADDRESS or BAD_CREDENTIALS, from the core.
      const message = String(e?.message ?? '');
      throw reject(message, message.split(':')[0] || 'CORE_ERROR');
    }
  }

  // --- Git on the device (bgit.h): the bridge maps `dir` onto <userData>/bgit/<dir> ---

  /** @param {string} method @param {Record<string, any>} options */
  async bgit(method, options) {
    try {
      return { json: await this.bridge.core(method, options ?? {}) };
    } catch (/** @type {any} */ e) {
      // The core's error: a code, then ": details" (UNREACHABLE: ..., REFUSED, REJECTED, CANCELLED...).
      const message = String(e?.message ?? '');
      throw reject(message, message.split(':')[0] || 'CORE_ERROR');
    }
  }
  bgitClone(/** @type {any} */ o) { return this.bgit('bgitClone', o); }
  bgitPull(/** @type {any} */ o) { return this.bgit('bgitPull', o); }
  bgitCommit(/** @type {any} */ o) { return this.bgit('bgitCommit', o); }
  bgitPush(/** @type {any} */ o) { return this.bgit('bgitPush', o); }
  bgitStatus(/** @type {any} */ o) { return this.bgit('bgitStatus', o); }
  bgitUnpushed(/** @type {any} */ o) { return this.bgit('bgitUnpushed', o); }
  bgitHead(/** @type {any} */ o) { return this.bgit('bgitHead', o); }
  bgitListFiles(/** @type {any} */ o) { return this.bgit('bgitListFiles', o); }
  bgitWrite(/** @type {any} */ o) { return this.bgit('bgitWrite', o); }
  bgitRead(/** @type {any} */ o) { return this.bgit('bgitRead', o); }
  bgitDiff(/** @type {any} */ o) { return this.bgit('bgitDiff', o); }
  bgitFiles(/** @type {any} */ o) { return this.bgit('bgitFiles', o); }
  async bgitRemove(/** @type {any} */ o) { await this.bgit('bgitRemove', o); }
  async bgitCancel() { await this.bridge.core('bgitCancel', {}); }

  /** Release edition: the Benthic server's session, in safeStorage (bridge.cjs, kind 'server'). */
  async serverSessionSave(options) {
    await this.bridge.credentials.set('server', {
      email: options?.email ?? '',
      sessionToken: options?.sessionToken ?? '',
      repositoryUrl: options?.repositoryUrl ?? '',
      branch: options?.branch ?? '',
      gitUsername: options?.gitUsername ?? '',
      gitToken: options?.gitToken ?? '',
    });
  }

  /** Who is signed in to the Benthic server, without any token. */
  async serverSessionInfo() {
    const stored = await this.bridge.credentials.get('server');
    return { signedIn: stored != null, email: stored?.email ?? '', repositoryUrl: stored?.repositoryUrl ?? '', branch: stored?.branch ?? '' };
  }

  /** The access to the repository, for the download only. */
  async serverSessionAccess() {
    const stored = await this.bridge.credentials.get('server');
    if (!stored) throw Object.assign(new Error('NOT_SIGNED_IN'), { code: 'NOT_SIGNED_IN' });
    return { repositoryUrl: stored.repositoryUrl, branch: stored.branch, username: stored.gitUsername, token: stored.gitToken, sessionToken: stored.sessionToken };
  }

  /** The device's data key for the sensitive items (safeStorage, bridge.cjs, kind 'datakey'); '' when there is none. */
  async dataKeyRead() {
    const stored = await this.bridge.credentials.get('datakey');
    return { key: stored?.key ?? '' };
  }

  async dataKeyWrite(options) {
    await this.bridge.credentials.set('datakey', { key: options?.key ?? '' });
  }

  /** The push channel (lib/push-events.js): the stream is read in the main process; see bridge.cjs. */
  async pushStreamOpen(options) {
    await this.bridge.push.open({ id: options?.id, url: options?.url, token: options?.token });
  }

  async pushStreamClose(options) {
    await this.bridge.push.close({ id: options?.id });
  }

  /** Signs out of the Benthic server. */
  async serverSessionClear() {
    await this.bridge.push?.close({}).catch(() => {});
    await this.bridge.credentials.clear('server');
  }

  /** The stored repository without its token, for the form that edits it. */
  async gitConfig() {
    const stored = await this.bridge.credentials.get('git');
    return { url: stored ? withoutBranch(stored.url) : '', username: stored?.username ?? '', branch: stored?.branch ?? '' };
  }

  /**
   * Uses the repository for the logbook (see the Android plugin): sets it, asks the server for the
   * log branch, creates the branch of an empty repository (`empty`), then stores the access.
   * @param {{url?: string, username?: string, branch?: string, token?: string, empty?: boolean}} options
   */
  async gitConnect(options) {
    const url = options?.url ?? '';
    const username = (options?.username ?? '').trim();
    const branch = (options?.branch ?? '').trim();
    const previous = await this.bridge.credentials.get('git');
    // The form that edits the repository leaves the token empty to keep it.
    const token = (options?.token ?? '').trim() || (previous?.token ?? '');
    try {
      await this.core('gitConfigure', { url, username, token, branch });
      let created = false;
      const exists = JSON.parse(await this.core('cloudProbe')).exists === true;
      if (!exists) {
        if (options?.empty !== true) throw new Error('NO_LOG');
        await this.core('gitCreateLog');
        created = true;
      }
      const address = url.trim().replace(/\/+$/, '');
      await this.bridge.credentials.set('git', { url: `${address}[${branch}]`, username, branch, token });
      return { created };
    } catch (/** @type {any} */ e) {
      await this.restoreAfterFailedGitConnect(previous);
      const message = String(e?.message ?? '');
      const code = message.includes('Credentials rejected') ? 'DENIED' : message.split(':')[0] || 'CORE_ERROR';
      const final = KNOWN_GIT_CODES.has(code) ? code : 'NETWORK';
      throw reject(final);
    }
  }

  /** After a refused connection: the repository (or cloud account) the device had is set again. @param {any} previous */
  async restoreAfterFailedGitConnect(previous) {
    try {
      if (previous) {
        await this.core('gitConfigure', { url: withoutBranch(previous.url), username: previous.username, token: previous.token, branch: previous.branch });
      } else {
        await this.configureStoredAccount();
      }
    } catch {
      // Nothing to set again.
    }
  }

  // --- Import: divelogs.de and files ---

  /**
   * Downloads the divelogs.de logbook once into the temp folder. `user` and `password` are only
   * passed to the core. Resolves {dives, path}; with no dive, no file (path empty).
   * @param {{user?: string, password?: string}} options
   */
  async divelogsDownload(options) {
    const target = joinPath(this.importDir, `${IMPORT_PREFIX}${Date.now()}.dld`);
    try {
      const result = JSON.parse(await this.core('divelogsDownload', { user: options?.user ?? '', password: options?.password ?? '', outPath: target }));
      const dives = Number(result.dives) || 0;
      return { dives, path: dives > 0 ? target : '' };
    } catch (e) {
      await this.bridge.fs.remove({ path: target });
      throw e;
    }
  }

  /** @param {{user?: string, password?: string}} options */
  async divelogsCheck(options) {
    return JSON.parse(await this.core('divelogsCheck', { user: options?.user ?? '', password: options?.password ?? '' }));
  }

  /**
   * The file picked in the web layer (`name`, base64 `data`) is staged for the import steps; {path}.
   * @param {{name?: string, data?: string}} options
   */
  async stageImport(options) {
    if (options?.data == null) throw reject('BAD_REQUEST');
    if (options.append === true) {
      // The next piece of a big file (lib/staged-file.js): added to the file the first call made.
      if (!this.isImportFile(options.path ?? '')) throw reject('BAD_REQUEST');
      await this.bridge.fs.appendFile({ path: options.path, base64: options.data });
      return { path: options.path };
    }
    const name = baseName(options?.name ?? '').replace(/[^A-Za-z0-9._-]/g, '_') || 'import.xml';
    const { path } = await this.bridge.fs.writeFile({ area: 'import', name: `${IMPORT_PREFIX}${Date.now()}-${name}`, base64: options.data });
    return { path };
  }

  /** A shared file is a mobile intent: the desktop receives none. */
  async stageSharedFile() {
    throw unavailable('Reading a shared file');
  }

  /** Nothing is copied from a shared file on the desktop: nothing to cancel. */
  async cancelStage() {}

  /**
   * Up to 4 MB of a staged file, base64, with its size.
   * @param {{path?: string, offset?: number, length?: number}} options
   */
  async readFileChunk(options) {
    if (!this.isImportFile(options?.path ?? '')) throw reject('BAD_REQUEST');
    return this.bridge.fs.readChunk({ path: options.path, offset: options.offset ?? 0, length: options.length ?? 65536 });
  }

  // --- Dive photos and videos (the objects of docs/architecture.md, 11.6): files in <userData>/media, by hash ---

  /** @param {{path?: string}} options */
  async mediaAdopt(options) {
    if (!this.isImportFile(options?.path ?? '')) throw reject('BAD_REQUEST');
    return this.bridge.media.call('adopt', { path: options.path });
  }

  /** @param {{data?: string}} options */
  async mediaPutBytes(options) {
    if (typeof options?.data !== 'string') throw reject('BAD_REQUEST');
    return this.bridge.media.call('putBytes', { base64: options.data });
  }

  /** @param {{hash?: string}} options */
  async mediaStat(options) {
    return this.bridge.media.call('stat', { hash: options?.hash });
  }

  /** @param {{hash?: string, url?: string, headers?: Record<string, string>}} options */
  async mediaUpload(options) {
    return this.bridge.media.call('upload', { hash: options?.hash, url: options?.url, headers: options?.headers ?? {} });
  }

  /** @param {{hash?: string, url?: string}} options */
  async mediaDownload(options) {
    return this.bridge.media.call('download', { hash: options?.hash, url: options?.url });
  }

  /** @param {{hash?: string}} options */
  async mediaDelete(options) {
    await this.bridge.media.call('delete', { hash: options?.hash });
  }

  /**
   * A new staged file made of ranges of staged files and literal text.
   * @param {{name?: string, parts?: ({path: string, start: number, end: number}|{text: string})[]}} options
   */
  async assembleFile(options) {
    const parts = options?.parts ?? [];
    if (!parts.length || parts.some((p) => !('text' in p) && !this.isImportFile(p.path))) throw reject('BAD_REQUEST');
    const name = baseName(options?.name ?? '').replace(/[^A-Za-z0-9._-]/g, '_') || 'import.xml';
    return this.bridge.fs.assemble({ name: `${IMPORT_PREFIX}${Date.now()}-${name}`, parts });
  }

  /** @param {{path?: string}} options */
  async importCount(options) {
    if (!this.isImportFile(options?.path ?? '')) throw reject('BAD_REQUEST');
    return JSON.parse(await this.core('importCount', { path: options.path }));
  }

  /** @param {{path?: string}} options */
  async discardImport(options) {
    if (this.isImportFile(options?.path ?? '')) await this.bridge.fs.remove({ path: options.path });
  }

  /**
   * First logbook of the account just created or signed in to: "empty"; "import", the file downloaded
   * by divelogsDownload (`path`, deleted afterwards); or "device", the logbook of this device.
   * @param {{source?: string, path?: string}} options
   */
  async createLog(options) {
    const account = this.pendingAccount;
    if (!account) throw reject('NO_ACCOUNT');
    await this.core('setCloudTestEmail', { email: await this.readTestEmail() });
    await this.core('cloudConfigure', { email: account.email, password: account.password });
    const source = options?.source ?? '';
    let download = '';
    let importPath;
    if (source === 'import') {
      if (!this.isImportFile(options?.path ?? '')) throw reject('BAD_REQUEST');
      download = /** @type {string} */ (options.path);
      importPath = download;
    } else if (source === 'device') {
      importPath = (await this.core('logExists', { repo: this.repo })) ? this.repo : '';
    } else if (source === 'empty') {
      importPath = '';
    } else {
      throw reject('BAD_REQUEST');
    }
    try {
      const json = await this.core('cloudCreateLog', { importPath });
      await this.bridge.credentials.set('cloud', account);
      this.pendingAccount = null;
      return { json };
    } finally {
      if (download) await this.bridge.fs.remove({ path: download });
    }
  }

  /**
   * Imports a file chosen in the web layer (its bytes in base64, written with the original name: the
   * core reads the format from it), then the copy is deleted.
   * @param {{name?: string, data?: string}} options
   */
  async importDives(options) {
    const name = baseName(options?.name ?? '') || 'import.xml';
    if (options?.path != null) {
      // A staged file (a logbook): the core reads it where it is, and it is deleted afterwards.
      if (!this.isImportFile(options.path)) throw reject('BAD_REQUEST');
      try {
        return { json: await this.core('importDives', { file: options.path, source: name }) };
      } finally {
        await this.bridge.fs.remove({ path: options.path }).catch(() => {});
      }
    }
    if (options?.data == null) throw reject('Missing data', 'BAD_ARGUMENT');
    // A name of its own: on Windows the helper may still hold the previous file of that name open
    // (EBUSY), and removing the staged file must never hide what the import answered.
    const unique = `${Date.now().toString(36)}-${name}`;
    const { path } = await this.bridge.fs.writeFile({ area: 'import', name: unique, base64: options.data });
    try {
      return { json: await this.core('importDives', { file: path, source: name }) };
    } finally {
      await this.bridge.fs.remove({ path }).catch(() => {});
    }
  }

  /**
   * The dives logged on this device without an account, once an account is used: "count" reads them
   * apart; "import" adds them to the account's log in memory as one undoable step.
   * @param {{action?: string}} options
   */
  async deviceLog(options) {
    const exists = await this.core('logExists', { repo: this.repo });
    if (options?.action === 'exists') return { exists };
    if (options?.action === 'count') return { count: exists ? await this.core('countDives', { log: this.repo }) : 0 };
    if (options?.action === 'import') {
      if (!exists) throw reject('NO_DIVES');
      return { json: await this.core('importDives', { file: this.repo, source: 'this device' }) };
    }
    throw reject('BAD_REQUEST');
  }

  // --- Editing ---

  /** @param {{id?: number, changes?: any}} options */
  async editDive(options) {
    if (options?.id == null || options?.changes == null) throw reject('Missing id or changes', 'BAD_ARGUMENT');
    return { json: await this.core('editDive', { id: options.id, changes: JSON.stringify(options.changes) }) };
  }

  /** @param {{tripId?: number}} options */
  async getTrip(options) {
    return { json: await this.core('getTrip', { id: options?.tripId ?? 0 }) };
  }

  /** @param {{action?: string, tripId?: number, diveId?: number, otherId?: number, diveIds?: number[], value?: string}} options */
  async tripAction(options) {
    return {
      json: await this.core('tripAction', {
        action: options?.action ?? '',
        tripId: options?.tripId ?? 0,
        diveId: options?.diveId ?? 0,
        otherId: options?.otherId ?? 0,
        diveIds: options?.diveIds ?? null,
        value: options?.value ?? '',
      }),
    };
  }

  /** @param {{redo?: boolean}} [options] */
  async undo(options) {
    return { json: await this.core('undo', { redo: options?.redo === true }) };
  }

  /** Local save, then for a cloud log the sync of Subsurface-mobile (fetch, merge, push). */
  async syncChanges() {
    return { json: await this.core('sync') };
  }

  /** The dives of the log in memory, without loading anything. */
  async listLoadedDives(options) {
    return { json: await this.core('listLoadedDives', options ?? {}) };
  }

  /** Desktop only: the logbook table's extra columns (dive_columns, benthic.h). */
  async diveColumns() {
    return { json: await this.core('diveColumns') };
  }

  /** Local save only, without network (manual synchronisation). */
  async saveLocal() {
    await this.core('saveLocal');
  }

  /** @param {{kind?: string}} options */
  async toolQuery(options) {
    return { json: await this.core('toolQuery', { kind: options?.kind ?? '' }) };
  }

  /** @param {{kind?: string, uuid?: number, lat?: number, lon?: number, a?: number, b?: number, text?: string}} options */
  async siteQuery(options) {
    return {
      json: await this.core('siteQuery', {
        kind: options?.kind ?? '',
        uuid: Number(options?.uuid) || 0,
        lat: options?.lat ?? 0,
        lon: options?.lon ?? 0,
        a: options?.a ?? 0,
        b: options?.b ?? 0,
        text: options?.text ?? '',
      }),
    };
  }

  /** @param {{kind?: string, fulltext?: string, mode?: string, rules?: any[]}} options */
  async filterQuery(options) {
    return {
      json: await this.core('filterQuery', {
        kind: options?.kind ?? '',
        fulltext: options?.fulltext ?? '',
        mode: options?.mode ?? '',
        rules: flatRules(options?.rules),
      }),
    };
  }

  /** @param {{fields?: any}} options */
  async createDive(options) {
    if (options?.fields == null) throw reject('Missing fields', 'BAD_ARGUMENT');
    return { json: await this.core('createDive', { fields: JSON.stringify(options.fields) }) };
  }

  /** One dive ("id") or several ("ids"), one undoable step. @param {{id?: number, ids?: number[]}} options */
  async deleteDive(options) {
    const ids = options?.ids ?? (options?.id != null ? [options.id] : null);
    if (!ids || ids.length === 0) throw reject('Missing id', 'BAD_ARGUMENT');
    return { json: await this.core('deleteDive', { ids }) };
  }

  /** Merges dives into one (task 2026-11-15-178). @param {{ids?: number[]}} options */
  async mergeDives(options) {
    if (!options?.ids || options.ids.length < 2) throw reject('Missing ids', 'BAD_ARGUMENT');
    return { json: await this.core('mergeDives', { ids: options.ids }) };
  }

  /** The same changes on several dives (task 2026-11-15-178). @param {{ids?: number[], changes?: object}} options */
  async editDives(options) {
    if (!options?.ids?.length || options.changes == null) throw reject('Missing ids or changes', 'BAD_ARGUMENT');
    return { json: await this.core('editDives', { ids: options.ids, changes: JSON.stringify(options.changes) }) };
  }

  /** « Décaler la date et l'heure »: the start of several dives, in seconds (negative: earlier). @param {{ids?: number[], seconds?: number}} options */
  async shiftTime(options) {
    if (!options?.ids?.length || !Number.isInteger(options.seconds)) throw reject('Missing ids or seconds', 'BAD_ARGUMENT');
    return { json: await this.core('shiftTime', { ids: options.ids, seconds: options.seconds }) };
  }

  /** The stable dive ids. @param {{action?: 'audit'|'assign', assignments?: string}} options */
  async benthicIds(options) {
    if (options?.action !== 'audit' && options?.action !== 'assign') throw reject('Missing action', 'BAD_ARGUMENT');
    return { json: await this.core('benthicIds', { action: options.action, assignments: options.assignments ?? '{}' }) };
  }

  /** @param {{start?: number, ids?: number[], numbers?: number[]}} options */
  async renumberDives(options) {
    if (options?.start == null) throw reject('Missing start', 'BAD_ARGUMENT');
    return { json: await this.core('renumberDives', { ids: options.ids ?? [], start: options.start, numbers: options.numbers ?? [] }) };
  }

  /** @param {{action?: string, name?: string, fulltext?: string, mode?: string, rules?: any[], index?: number}} options */
  async filterPresets(options) {
    return {
      json: await this.core('filterPresets', {
        action: options?.action ?? '',
        name: options?.name ?? '',
        fulltext: options?.fulltext ?? '',
        mode: options?.mode ?? '',
        rules: flatRules(options?.rules),
        index: options?.index ?? -1,
      }),
    };
  }

  /** Sync conflict after an automatic merge (read-only). */
  async syncConflicts() {
    return { json: await this.core('syncConflicts') };
  }

  /** @param {{choices?: any}} options */
  async resolveConflicts(options) {
    if (options?.choices == null) throw reject('Missing choices', 'BAD_ARGUMENT');
    await this.core('resolveConflicts', { choices: JSON.stringify(options.choices) });
  }

  /** Takes back the last conflict choice while it is not sent. */
  async cancelConflictResolution() {
    await this.core('cancelConflictResolution');
  }

  /** @param {{kind?: string, field?: string, criteria?: any}} options */
  async statsQuery(options) {
    const kind = options?.kind ?? '';
    const text = kind === 'values' ? (options?.field ?? '') : JSON.stringify(options?.criteria ?? {});
    return { json: await this.core('statsQuery', { kind, text }) };
  }

  /** @param {Record<string, any>} options */
  async siteAction(options) {
    return {
      json: await this.core('siteAction', {
        action: options?.action ?? '',
        uuid: Number(options?.uuid) || 0,
        other: Number(options?.other) || 0,
        uuids: Array.isArray(options?.uuids) ? options.uuids.map(Number) : null,
        field: options?.field ?? '',
        value: options?.value ?? '',
        lat: options?.lat ?? 0,
        lon: options?.lon ?? 0,
        country: options?.country ?? '',
        region: options?.region ?? '',
        county: options?.county ?? '',
        city: options?.city ?? '',
      }),
    };
  }

  async diveComputers() {
    return { json: await this.core('diveComputers') };
  }

  /** @param {{action?: string, model?: string, serial?: string, value?: string, intoModel?: string, intoSerial?: string}} options */
  async diveComputerAction(options) {
    return {
      json: await this.core('diveComputerAction', {
        action: options?.action ?? '',
        model: options?.model ?? '',
        serial: options?.serial ?? '',
        value: options?.value ?? '',
        intoModel: options?.intoModel ?? '',
        intoSerial: options?.intoSerial ?? '',
      }),
    };
  }

  async listPlans() {
    return { json: await this.core('listPlans') };
  }

  /** @param {{request?: any, replaceId?: number, title?: string}} options */
  async savePlan(options) {
    if (options?.request == null) throw reject('Missing request', 'BAD_ARGUMENT');
    return { json: await this.core('savePlan', { request: JSON.stringify(options.request), replaceId: options.replaceId ?? 0, title: options.title ?? '' }) };
  }

  // --- Files to share and to export ---

  /** A file to share (the profile image), staged in the temp folder. @param {{name?: string, base64?: string}} options */
  async writeShareFile(options) {
    if (!options?.name || options.base64 == null) throw reject('Missing name or data', 'BAD_ARGUMENT');
    const { path } = await this.bridge.fs.writeFile({ area: 'share', name: options.name, base64: options.base64 });
    return { uri: fileUrl(path) };
  }

  /** There is no share sheet to grant access to on the desktop. @param {{uri?: string}} options */
  async grantShareFile(options) {
    if (!options?.uri) throw reject('Missing uri', 'BAD_ARGUMENT');
    return { apps: 0 };
  }

  /** @param {{html?: string, name?: string, letter?: boolean}} options */
  async htmlToPdf(options) {
    if (options?.html == null || !options?.name) throw reject('Missing html or name', 'BAD_ARGUMENT');
    try {
      const { path } = await this.bridge.htmlToPdf({ html: options.html, name: options.name, letter: options.letter === true });
      return { uri: fileUrl(path) };
    } catch (/** @type {any} */ e) {
      throw reject(e?.code === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'Cannot render the PDF', 'FAILED');
    }
  }

  /**
   * "Exporter au format…": the dives exported by the core into the temp folder, shared from there;
   * read only for the logbook. With `text`, the contents come back instead (the QR share).
   * @param {{ids?: number[], format?: string, name?: string, anonymize?: boolean, text?: boolean}} options
   */
  async exportDives(options) {
    const ids = options?.ids ?? [];
    const format = options?.format ?? '';
    const name = baseName(options?.name ?? '');
    if (ids.length === 0 || !format || !name) throw reject('Missing ids, format or name', 'BAD_ARGUMENT');
    if (options.stage === true) {
      // A staged file: only its path comes back (read it with readFileChunk, import it, discard it).
      const staged = joinPath(this.importDir, `${IMPORT_PREFIX}${Date.now()}-${name.replace(/[^A-Za-z0-9._-]/g, '_')}`);
      await this.core('exportDives', { ids, format, anonymize: options.anonymize === true, path: staged });
      const { size } = await this.bridge.fs.readChunk({ path: staged, offset: 0, length: 0 });
      return { uri: '', path: staged, size };
    }
    const file = joinPath(this.bridge.paths.temp, 'share', name);
    await this.core('exportDives', { ids, format, anonymize: options.anonymize === true, path: file });
    if (options.text === true) {
      // A few dives (the QR share, the clipboard); a big export is never returned as one string.
      const { size } = await this.bridge.fs.readChunk({ path: file, offset: 0, length: 0 });
      if (size > MAX_TEXT) {
        await this.bridge.fs.remove({ path: file });
        throw reject('The export is too big to be returned as text', 'TOO_BIG');
      }
      const text = base64ToText(await this.bridge.fs.readFile({ path: file }));
      await this.bridge.fs.remove({ path: file });
      return { uri: '', text };
    }
    return { uri: fileUrl(file) };
  }

  // --- Network ---

  /** A Nominatim request, sent with the app's identification (its usage policy). @param {{url?: string}} options */
  async placesSearch(options) {
    const url = options?.url;
    if (typeof url !== 'string' || !url.startsWith('https://nominatim.openstreetmap.org/')) throw reject('Bad address', 'BAD_ARGUMENT');
    try {
      return await this.bridge.placesSearch({ url });
    } catch (/** @type {any} */ e) {
      throw reject(e?.message || 'Cannot reach the server', 'NETWORK');
    }
  }

  /** Error reports (task #102): the crash the main process saved (desktop/crash-reports.cjs); nothing is sent from here. */
  async pendingCrashReport() {
    return { json: (await this.bridge.crash?.pending?.()) ?? '' };
  }

  async clearCrashReport() {
    await this.bridge.crash?.clear?.();
  }

  /** No mobile data on a desktop: online means connected. */
  async networkStatus() {
    return { wifi: globalThis.navigator?.onLine !== false };
  }

  /** The system contrast level is an Android setting: 0, as an older Android answers. */
  async contrastLevel() {
    return { level: 0 };
  }

  // --- Dive computers: Bluetooth comes later, through the web layer ---

  /** No Bluetooth adapter for the app on the desktop (yet): the screen shows "no Bluetooth". */
  async bluetoothStatus() {
    return { bluetooth: 'none', permission: 'granted' };
  }

  async requestBluetoothPermission() {
    return this.bluetoothStatus();
  }

  async enableBluetooth() {
    return this.bluetoothStatus();
  }

  async startBluetoothScan() {
    throw reject('NO_BLUETOOTH');
  }

  async stopBluetoothScan() {}

  /** Models that download over Bluetooth, for a device whose name says nothing. */
  async bluetoothModels() {
    return { json: await this.core('dcBluetoothModels') };
  }

  async downloadDives() {
    throw reject('NO_BLUETOOTH');
  }

  /** @param {{action?: string}} options */
  async downloadPartial(options) {
    return { json: await this.core('downloadPartial', { action: options?.action ?? '' }) };
  }

  async cancelDownload() {
    await this.core('downloadCancel');
  }

  /** The desktop has no push notification: nothing to open. */
  async openNotificationSettings() {}

  // --- What belongs to a phone ---

  /** The launch screen is an Android thing. */
  async contentShown() {}

  /** The screen stays on by itself: nothing to hold. */
  async keepScreenAwake() {}

  /** Not from a store. */
  async installSource() {
    return { store: false, installer: '' };
  }

  async requestReview() {
    return { requested: false };
  }

  async openStorePage() {
    throw unavailable('The store page');
  }

  async openAppSettings() {
    throw unavailable('The app settings');
  }

  /** "Open with Benthic": a mobile intent. */
  async readSharedFile() {
    throw unavailable('Reading a shared file');
  }

  async gaugeCamera() {
    throw unavailable('The gauge camera');
  }

  async qrScan() {
    throw unavailable('The QR scanner');
  }

  async scanDocument() {
    throw unavailable('The document scanner');
  }

  async healthDives() {
    throw unavailable('Health data');
  }
}
