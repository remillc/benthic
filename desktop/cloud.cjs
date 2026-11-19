// SPDX-License-Identifier: GPL-2.0
// The personal clouds of the desktop app (task 2026-11-15-173, Christian's decision of 15 November 2026):
// sign-in to Google Drive, Microsoft OneDrive and Dropbox through their own APIs, and the upload and
// download of a logbook's .ssrf file. Node only, no Electron: the browser, the dialog, the encryption
// and the network are passed in, so tests/desktop/cloud.test.mjs runs it against a fake provider.
//
// Sign-in is OAuth 2 for installed apps with PKCE: the system browser opens the provider's page, the
// provider redirects to a loopback address this module listens on (http://127.0.0.1:<free port> for Google
// and Microsoft, the fixed http://127.0.0.1:53682/ for Dropbox), the code is exchanged for tokens. Refresh
// tokens are kept encrypted (Electron safeStorage) in <userData>/cloud-<provider>.bin; neither they nor the
// client keys ever go to the interface, which only sees { provider, available, connected, account }.
//
// The client ids come from desktop/oauth-clients.local.json (git-ignored):
//   { "google": { "clientId", "clientSecret" }, "microsoft": { "clientId" }, "dropbox": { "appKey" } }
// A provider without its id is "not available": its row is disabled in the interface.
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

/** The services with an OAuth sign-in in the browser (their client ids come from oauth-clients.local.json). */
const OAUTH_PROVIDERS = ['googleDrive', 'oneDrive', 'dropbox'];

/** The services, by the names the interface and the logbook descriptors use; WebDAV (Nextcloud included) has no browser sign-in. */
const PROVIDERS = [...OAUTH_PROVIDERS, 'webdav'];

/** The folder every new cloud logbook goes into: the app's folder root (OneDrive, Dropbox), an « OpenDives » folder (Google Drive, WebDAV). */
const DEFAULT_FOLDER = { googleDrive: 'OpenDives', oneDrive: '', dropbox: '', webdav: 'OpenDives' };

/** The key of each service in oauth-clients.local.json. */
const CLIENT_KEY = { googleDrive: 'google', oneDrive: 'microsoft', dropbox: 'dropbox' };

/**
 * What OpenDives asks each service for: one constant per service, so that the choice between the app's
 * own folder and the whole drive is made here and nowhere else.
 *   scope  the OAuth scopes
 *   root   where the files live (Microsoft Graph: the app folder, or '/me/drive/root' for full access)
 * Google: drive.file, the files OpenDives creates or the diver opens with it. Dropbox: an app-folder app,
 * with the scopes below (the folder is chosen when the app is registered).
 */
const ACCESS = {
  googleDrive: { scope: 'https://www.googleapis.com/auth/drive.file' },
  oneDrive: { scope: 'Files.ReadWrite.AppFolder offline_access User.Read', root: '/me/drive/special/approot' },
  dropbox: { scope: 'files.content.read files.content.write account_info.read' },
};

const ENDPOINTS = {
  googleDrive: {
    auth: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    api: 'https://www.googleapis.com/drive/v3',
    upload: 'https://www.googleapis.com/upload/drive/v3',
  },
  oneDrive: {
    auth: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    api: 'https://graph.microsoft.com/v1.0',
  },
  dropbox: {
    auth: 'https://www.dropbox.com/oauth2/authorize',
    token: 'https://api.dropboxapi.com/oauth2/token',
    api: 'https://api.dropboxapi.com/2',
    content: 'https://content.dropboxapi.com/2',
  },
};

/** Dropbox only accepts this redirect, registered with the app. */
const DROPBOX_PORT = 53682;
const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 60 * 1000;
const TRANSFER_TIMEOUT_MS = 10 * 60 * 1000;
/** Graph upload sessions take chunks that are a multiple of 320 KiB. */
const GRAPH_CHUNK = 32 * 320 * 1024;

/** An Error with a code the interface and the tests read. */
function coded(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

const base64url = (/** @type {Buffer} */ buffer) => buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** PKCE: a random verifier and its S256 challenge (RFC 7636). */
function pkcePair() {
  const verifier = base64url(crypto.randomBytes(64));
  return { verifier, challenge: base64url(crypto.createHash('sha256').update(verifier).digest()) };
}

/**
 * The client keys of the file, for the services that have one. The values are never logged.
 * @param {string} file
 * @returns {Record<string, { clientId: string, clientSecret?: string }>}
 */
function loadClients(file) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
  /** @type {Record<string, { clientId: string, clientSecret?: string }>} */
  const out = {};
  for (const provider of OAUTH_PROVIDERS) {
    const entry = data?.[CLIENT_KEY[provider]];
    const id = provider === 'dropbox' ? entry?.appKey || entry?.clientId : entry?.clientId;
    if (typeof id === 'string' && id.trim()) {
      out[provider] = { clientId: id.trim(), ...(typeof entry.clientSecret === 'string' && entry.clientSecret ? { clientSecret: entry.clientSecret } : {}) };
    }
  }
  return out;
}

/** What to decide when a cloud logbook meets its remote file (pure, tested on its own).
 * @param {{ knownRev?: string, remote: { rev: string } | null, pending: boolean }} state
 * knownRev: the revision this computer last uploaded or downloaded; pending: a local change not sent.
 * @returns {'same'|'upload'|'download'|'conflict'} */
function decideSync({ knownRev, remote, pending }) {
  // The remote file is gone (deleted elsewhere): this computer's copy is the logbook, it goes up again.
  if (!remote) return 'upload';
  if (knownRev && remote.rev === knownRev) return pending ? 'upload' : 'same';
  return pending ? 'conflict' : 'download';
}

/** A Dropbox-API-Arg header: JSON with every non-ASCII character escaped. @param {object} value */
function dropboxArg(value) {
  return JSON.stringify(value).replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

/**
 * @param {object} options
 * @param {string} options.userData
 * @param {{ isEncryptionAvailable: () => boolean, encryptString: (t: string) => Buffer, decryptString: (b: Buffer) => string, getSelectedStorageBackend?: () => string }} options.safeStorage
 * @param {(url: string) => any} options.openExternal opens the sign-in page in the system browser
 * @param {Record<string, { clientId: string, clientSecret?: string }> | (() => Record<string, { clientId: string, clientSecret?: string }>)} options.clients
 * @param {typeof fetch} [options.fetchImpl]
 * @param {Record<string, Record<string, string>>} [options.endpoints] replaces the services' addresses (tests)
 * @param {Record<string, number>} [options.ports] replaces the loopback port of a service (tests; 0 = any free port)
 * @param {() => any} [options.texts] the app's translations (desktopCloud and desktopLogbooks are read)
 * @param {any} [options.dialog] Electron's dialog
 * @param {(webContents: any) => any} [options.parentOf] the window of a webContents
 * @param {string} [options.locale]
 * @param {() => number} [options.now]
 * @param {number} [options.signInTimeoutMs]
 * @param {(text: string) => void} [options.log]
 */
function createCloudService({ userData, safeStorage, openExternal, clients, fetchImpl = fetch, endpoints = {}, ports = {}, texts = () => ({}), dialog, parentOf = () => undefined, locale = 'en', now = Date.now, signInTimeoutMs = SIGN_IN_TIMEOUT_MS, log = () => {} }) {
  const endpoint = (/** @type {string} */ provider) => ({ ...ENDPOINTS[provider], ...(endpoints[provider] || {}) });
  const clientsNow = () => (typeof clients === 'function' ? clients() : clients);
  const clientOf = (/** @type {string} */ provider) => clientsNow()[provider] || null;
  /** @type {Map<string, { token: string, expires: number }>} */
  const accessTokens = new Map();
  /** @type {Map<string, { cancel: () => void, page?: string }>} */
  const signingIn = new Map();

  const tokenFile = (/** @type {string} */ provider) => {
    if (!PROVIDERS.includes(provider)) throw coded('BAD_ARGUMENT', 'BAD_ARGUMENT: unknown service');
    return path.join(userData, `cloud-${provider}.bin`);
  };

  // --- Tokens at rest: safeStorage, one encrypted file per service ---

  function encryptionAvailable() {
    if (!safeStorage.isEncryptionAvailable()) return false;
    return !(typeof safeStorage.getSelectedStorageBackend === 'function' && safeStorage.getSelectedStorageBackend() === 'basic_text');
  }

  /** @returns {{ refreshToken: string, account: string } | null} */
  function readTokens(/** @type {string} */ provider) {
    const file = tokenFile(provider);
    if (!fs.existsSync(file) || !encryptionAvailable()) return null;
    try {
      const value = JSON.parse(safeStorage.decryptString(fs.readFileSync(file)));
      return typeof value.refreshToken === 'string' && value.refreshToken ? { refreshToken: value.refreshToken, account: String(value.account ?? '') } : null;
    } catch {
      return null;
    }
  }

  function writeTokens(/** @type {string} */ provider, /** @type {{ refreshToken: string, account: string }} */ value) {
    if (!encryptionAvailable()) throw coded('CREDENTIALS_NOT_SAVED');
    const file = tokenFile(provider);
    const tmp = `${file}.tmp`;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(tmp, safeStorage.encryptString(JSON.stringify({ refreshToken: value.refreshToken, account: value.account })), { mode: 0o600 });
    fs.renameSync(tmp, file);
  }

  function forgetTokens(/** @type {string} */ provider) {
    const file = tokenFile(provider);
    fs.rmSync(file, { force: true });
    fs.rmSync(`${file}.tmp`, { force: true });
    accessTokens.delete(provider);
  }

  // --- HTTP ---

  /** fetch with a timeout; a network failure becomes the code NETWORK. */
  async function send(/** @type {string} */ url, /** @type {RequestInit} */ init, timeoutMs = REQUEST_TIMEOUT_MS) {
    try {
      return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      throw coded('NETWORK', `NETWORK: ${(e && /** @type {any} */ (e).message) || 'no answer'}`);
    }
  }

  /** The token endpoint. Resolves the parsed JSON, or throws: invalid_grant is SIGN_IN_EXPIRED, else NETWORK or SERVER. */
  async function tokenRequest(/** @type {string} */ provider, /** @type {Record<string, string>} */ fields) {
    const client = clientOf(provider);
    if (!client) throw coded('NOT_AVAILABLE');
    const body = new URLSearchParams({ ...fields, client_id: client.clientId });
    if (provider === 'googleDrive' && client.clientSecret) body.set('client_secret', client.clientSecret);
    const response = await send(endpoint(provider).token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body });
    let json = {};
    try {
      json = await response.json();
    } catch {
      // Not JSON.
    }
    if (!response.ok) {
      if (/** @type {any} */ (json).error === 'invalid_grant' || response.status === 400 || response.status === 401) throw coded('SIGN_IN_EXPIRED', `SIGN_IN_EXPIRED: ${/** @type {any} */ (json).error || response.status}`);
      throw coded('SERVER', `SERVER: token ${response.status}`);
    }
    return json;
  }

  /** A valid access token: the cached one, or a new one from the refresh token. */
  async function accessToken(/** @type {string} */ provider, force = false) {
    const cached = accessTokens.get(provider);
    if (!force && cached && cached.expires > now() + 60_000) return cached.token;
    const stored = readTokens(provider);
    if (!stored) throw coded('NOT_SIGNED_IN');
    let json;
    try {
      json = /** @type {any} */ (await tokenRequest(provider, { grant_type: 'refresh_token', refresh_token: stored.refreshToken }));
    } catch (e) {
      // The service refused the refresh token (revoked, expired): the diver signs in again.
      if (/** @type {any} */ (e).code === 'SIGN_IN_EXPIRED') forgetTokens(provider);
      throw e;
    }
    if (typeof json.access_token !== 'string') throw coded('SERVER', 'SERVER: no access token');
    // Microsoft hands out a new refresh token each time; Google and Dropbox keep theirs.
    if (typeof json.refresh_token === 'string' && json.refresh_token && json.refresh_token !== stored.refreshToken) writeTokens(provider, { refreshToken: json.refresh_token, account: stored.account });
    accessTokens.set(provider, { token: json.access_token, expires: now() + (Number(json.expires_in) || 3600) * 1000 });
    return json.access_token;
  }

  /**
   * An API request with the access token; a 401 refreshes the token once and tries again.
   * @param {string} provider @param {string} url @param {RequestInit & { headers?: Record<string, string> }} init
   */
  async function api(provider, url, init = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
    for (let attempt = 0; ; attempt++) {
      const token = await accessToken(provider, attempt > 0);
      const response = await send(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } }, timeoutMs);
      if (response.status === 401 && attempt === 0) continue;
      return response;
    }
  }

  async function expectOk(/** @type {Response} */ response, /** @type {string} */ what) {
    if (response.ok) return response;
    const text = await response.text().catch(() => '');
    if (response.status === 401 || response.status === 403) throw coded('DENIED', `DENIED: ${what} ${response.status}`);
    if (response.status === 429 || response.status >= 500) throw coded('SERVER', `SERVER: ${what} ${response.status} ${text.slice(0, 100)}`);
    throw coded('SERVER', `SERVER: ${what} ${response.status} ${text.slice(0, 100)}`);
  }

  // --- Sign-in: the system browser and the loopback redirect ---

  /** Page the browser shows when the redirect arrives. @param {boolean} ok */
  function redirectPage(ok) {
    const page = texts()?.desktopCloud?.browserPage || {};
    const title = ok ? page.done || 'Connected' : page.failed || 'Sign-in failed';
    const text = ok ? page.doneText || 'You can close this tab and go back to Benthic.' : page.failedText || 'Go back to Benthic and try again.';
    const esc = (/** @type {string} */ s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] || c);
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title></head><body style="font-family:sans-serif;max-width:32em;margin:4em auto;padding:0 1em"><h1>${esc(title)}</h1><p>${esc(text)}</p></body></html>`;
  }

  /**
   * Listens on the loopback address for the provider's redirect. `redirectUri` is known as soon as it listens.
   * @param {{ port: number, state: string, timeoutMs: number, slash: boolean }} options
   * @returns {Promise<{ redirectUri: string, result: Promise<string>, close: () => void, cancel: () => void }>}
   */
  function listenForRedirect({ port, state, timeoutMs, slash }) {
    return new Promise((resolveListening, rejectListening) => {
      /** @type {(code: string) => void} */
      let resolveCode = () => {};
      /** @type {(e: Error) => void} */
      let rejectCode = () => {};
      const result = new Promise((resolve, reject) => {
        resolveCode = resolve;
        rejectCode = reject;
      });
      result.catch(() => {});
      const server = http.createServer((request, response) => {
        const url = new URL(request.url || '/', 'http://127.0.0.1');
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');
        if (url.pathname !== '/' || (!code && !error)) {
          response.writeHead(404).end();
          return;
        }
        const fail = (/** @type {string} */ c) => {
          response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' }).end(redirectPage(false));
          rejectCode(coded(c));
        };
        if (url.searchParams.get('state') !== state) return fail('STATE_MISMATCH');
        if (error || !code) return fail('SIGN_IN_DENIED');
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(redirectPage(true));
        resolveCode(code);
      });
      const timer = setTimeout(() => rejectCode(coded('SIGN_IN_TIMEOUT')), timeoutMs);
      const close = () => {
        clearTimeout(timer);
        server.close();
        server.closeAllConnections?.();
      };
      server.once('error', (e) => rejectListening(/** @type {any} */ (e).code === 'EADDRINUSE' ? coded('PORT_BUSY') : e));
      server.listen(port, '127.0.0.1', () => {
        const actual = /** @type {import('node:net').AddressInfo} */ (server.address()).port;
        // « Annuler la connexion », or another service chosen: the wait ends at once (SIGN_IN_CANCELLED).
        const cancel = () => {
          close();
          rejectCode(coded('SIGN_IN_CANCELLED'));
        };
        resolveListening({ redirectUri: `http://127.0.0.1:${actual}${slash ? '/' : ''}`, result: /** @type {Promise<string>} */ (result), close, cancel });
      });
    });
  }

  /** The address of the provider's sign-in page. @param {string} provider @param {{ redirectUri: string, state: string, challenge: string }} p */
  function authorizeUrl(provider, { redirectUri, state, challenge, switchAccount = false }) {
    const client = /** @type {{ clientId: string }} */ (clientOf(provider));
    const query = new URLSearchParams({
      client_id: client.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: ACCESS[provider].scope,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    if (provider === 'googleDrive') {
      query.set('access_type', 'offline');
      // « Changer de compte »: the service asks which account again, instead of reusing the browser's session.
      query.set('prompt', switchAccount ? 'select_account consent' : 'consent');
    } else if (provider === 'dropbox') {
      query.set('token_access_type', 'offline');
      if (switchAccount) query.set('force_reauthentication', 'true');
    } else if (switchAccount) {
      query.set('prompt', 'select_account');
    }
    return `${endpoint(provider).auth}?${query}`;
  }

  /**
   * « Se connecter »: the browser, the code, the tokens, the account. Resolves the service's status.
   * With `switchAccount` (« Changer de compte ») the service asks which account to use; the stored tokens of the
   * current account are replaced only once the new sign-in has succeeded, and come back if it fails.
   * @param {string} provider @param {{ switchAccount?: boolean }} [options]
   */
  async function signIn(provider, { switchAccount = false } = {}) {
    tokenFile(provider);
    if (!OAUTH_PROVIDERS.includes(provider)) throw coded('BAD_ARGUMENT', 'BAD_ARGUMENT: no browser sign-in for this service');
    if (!clientOf(provider)) throw coded('NOT_AVAILABLE');
    if (!encryptionAvailable()) throw coded('CREDENTIALS_NOT_SAVED');
    signingIn.get(provider)?.cancel();
    const { verifier, challenge } = pkcePair();
    const state = base64url(crypto.randomBytes(24));
    const port = provider === 'dropbox' ? (ports.dropbox ?? DROPBOX_PORT) : (ports[provider] ?? 0);
    const listener = await listenForRedirect({ port, state, timeoutMs: signInTimeoutMs, slash: provider === 'dropbox' });
    const page = authorizeUrl(provider, { redirectUri: listener.redirectUri, state, challenge, switchAccount });
    signingIn.set(provider, { cancel: listener.cancel, page });
    const previous = fs.existsSync(tokenFile(provider)) ? fs.readFileSync(tokenFile(provider)) : null;
    const previousAccess = accessTokens.get(provider);
    let wrote = false;
    try {
      log(`Opening the sign-in page of ${provider}`);
      await openExternal(page);
      const code = await listener.result;
      const json = /** @type {any} */ (await tokenRequest(provider, { grant_type: 'authorization_code', code, redirect_uri: listener.redirectUri, code_verifier: verifier }));
      if (typeof json.access_token !== 'string' || typeof json.refresh_token !== 'string' || !json.refresh_token) throw coded('SERVER', 'SERVER: no refresh token');
      accessTokens.set(provider, { token: json.access_token, expires: now() + (Number(json.expires_in) || 3600) * 1000 });
      writeTokens(provider, { refreshToken: json.refresh_token, account: '' });
      wrote = true;
      let account = '';
      try {
        account = await accountOf(provider);
      } catch (e) {
        log(`The account of ${provider} was not read: ${/** @type {any} */ (e).code || 'error'}`);
      }
      writeTokens(provider, { refreshToken: json.refresh_token, account });
      return statusOf(provider);
    } catch (e) {
      // A sign-in that failed after its tokens were kept leaves no half-signed account; an earlier one comes back.
      if (wrote) {
        forgetTokens(provider);
        if (previous) {
          fs.writeFileSync(tokenFile(provider), previous, { mode: 0o600 });
          if (previousAccess) accessTokens.set(provider, previousAccess);
        }
      }
      throw e;
    } finally {
      listener.close();
      signingIn.delete(provider);
    }
  }

  function signOut(/** @type {string} */ provider) {
    signingIn.get(provider)?.cancel();
    forgetTokens(provider);
    return statusOf(provider);
  }

  /** The name of the signed-in account, from the service: an address when it gives one. */
  async function accountOf(/** @type {string} */ provider) {
    const e = endpoint(provider);
    if (provider === 'googleDrive') {
      const r = await expectOk(await api(provider, `${e.api}/about?fields=user(displayName,emailAddress)`), 'account');
      const user = /** @type {any} */ (await r.json()).user || {};
      return String(user.emailAddress || user.displayName || '');
    }
    if (provider === 'oneDrive') {
      const r = await expectOk(await api(provider, `${e.api}/me?$select=displayName,mail,userPrincipalName`), 'account');
      const me = /** @type {any} */ (await r.json());
      return String(me.mail || me.userPrincipalName || me.displayName || '');
    }
    const r = await expectOk(await api(provider, `${e.api}/users/get_current_account`, { method: 'POST' }), 'account');
    const me = /** @type {any} */ (await r.json());
    return String(me.email || me.name?.display_name || '');
  }

  /** @param {string} provider @returns {{ provider: string, available: boolean, connected: boolean, account: string }} */
  function statusOf(provider) {
    if (provider === 'webdav') {
      const saved = readWebdav();
      return { provider, available: encryptionAvailable(), connected: !!saved, account: saved ? `${saved.username}@${new URL(saved.baseUrl).host}` : '' };
    }
    const stored = readTokens(provider);
    return { provider, available: !!clientOf(provider), connected: !!stored, account: stored?.account ?? '' };
  }

  /** What the interface may know: no token, no key. */
  const status = () => PROVIDERS.map(statusOf);

  // --- WebDAV and Nextcloud: a server address, a user name and a password (no browser sign-in) ---

  /** @returns {{ baseUrl: string, username: string, password: string } | null} */
  function readWebdav() {
    const file = tokenFile('webdav');
    if (!fs.existsSync(file) || !encryptionAvailable()) return null;
    try {
      const v = JSON.parse(safeStorage.decryptString(fs.readFileSync(file)));
      return typeof v.baseUrl === 'string' && typeof v.username === 'string' && typeof v.password === 'string' && v.baseUrl && v.username ? { baseUrl: v.baseUrl, username: v.username, password: v.password } : null;
    } catch {
      return null;
    }
  }

  function writeWebdav(/** @type {{ baseUrl: string, username: string, password: string }} */ value) {
    if (!encryptionAvailable()) throw coded('CREDENTIALS_NOT_SAVED');
    const file = tokenFile('webdav');
    const tmp = `${file}.tmp`;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(tmp, safeStorage.encryptString(JSON.stringify({ baseUrl: value.baseUrl, username: value.username, password: value.password })), { mode: 0o600 });
    fs.renameSync(tmp, file);
  }

  const webdavHeaders = (/** @type {{ username: string, password: string }} */ c, /** @type {Record<string, string>} */ extra = {}) => ({ Authorization: `Basic ${Buffer.from(`${c.username}:${c.password}`, 'utf8').toString('base64')}`, ...extra });

  /** The server address as typed: https, or http for this computer only; a trailing slash; nothing after the path. */
  function parseServerAddress(/** @type {string} */ input) {
    let text = String(input ?? '').trim();
    if (!text) throw coded('BAD_ADDRESS');
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = `https://${text}`;
    let url;
    try {
      url = new URL(text);
    } catch {
      throw coded('BAD_ADDRESS');
    }
    if (url.username || url.password || !url.hostname) throw coded('BAD_ADDRESS');
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.protocol === 'http:' ? !local : url.protocol !== 'https:') throw coded(url.protocol === 'http:' ? 'INSECURE_ADDRESS' : 'BAD_ADDRESS');
    url.search = '';
    url.hash = '';
    if (!url.pathname.endsWith('/')) url.pathname += '/';
    return url;
  }

  /**
   * Checks the connection and finds the WebDAV root. A Nextcloud address (…/remote.php/dav/…) is used as it is;
   * for a bare server address the Nextcloud path https://host/remote.php/dav/files/<user>/ is tried first, then the
   * address itself (any other WebDAV server). 401 is BAD_CREDENTIALS, a server that does not answer NETWORK,
   * nothing WebDAV at the address BAD_ADDRESS. Nothing is stored. @returns {Promise<string>} the root, with a trailing slash
   */
  async function checkWebdav(/** @type {{ server: string, username: string, password: string }} */ { server, username, password }) {
    const user = String(username ?? '').trim();
    const url = parseServerAddress(server);
    if (!user || user.includes(':') || !password) throw coded('BAD_CREDENTIALS');
    const nextcloud = /\/remote\.php\/(dav|webdav)(\/|$)/.test(url.pathname);
    const candidates = nextcloud ? [url.href] : [new URL(`remote.php/dav/files/${encodeURIComponent(user)}/`, url).href, url.href];
    for (const candidate of candidates) {
      const response = await send(candidate, { method: 'PROPFIND', headers: webdavHeaders({ username: user, password }, { Depth: '0', 'Content-Type': 'application/xml' }), body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>' });
      await response.arrayBuffer().catch(() => {});
      if (response.status === 207) return candidate;
      if (response.status === 401) throw coded('BAD_CREDENTIALS');
      if (response.status === 403) throw coded('DENIED', 'DENIED: the server refuses this account');
      if (response.status >= 500) throw coded('SERVER', `SERVER: ${response.status}`);
      // 404, 405, 200 (a web page): not WebDAV here; the next candidate, if any.
    }
    throw coded('BAD_ADDRESS');
  }

  /** The address of a file or folder under the root. */
  const webdavUrl = (/** @type {string} */ base, /** @type {string} */ remote, /** @type {boolean} */ folder = false) => `${base}${encodePath(remote)}${folder && remote ? '/' : ''}`;

  /** @param {string} method @param {string} url @param {Record<string, string>} [headers] @param {any} [body] */
  async function webdavSend(method, url, headers = {}, body, timeoutMs = REQUEST_TIMEOUT_MS) {
    const saved = readWebdav();
    if (!saved) throw coded('NOT_SIGNED_IN');
    const response = await send(url, { method, headers: webdavHeaders(saved, headers), body }, timeoutMs);
    if (response.status === 401) throw coded('BAD_CREDENTIALS');
    return response;
  }

  /** « "abc" » and « W/"abc" » are the same revision here. */
  const normalEtag = (/** @type {string} */ tag) => String(tag ?? '').trim().replace(/^W\//, '').replace(/^"|"$/g, '');

  const xmlText = (/** @type {string} */ xml, /** @type {string} */ name) => {
    const m = new RegExp(`<(?:[\\w-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`, 'i').exec(xml);
    return m ? m[1].replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim() : '';
  };

  /** @returns {Promise<Remote | null>} */
  async function webdavStat(/** @type {any} */ d) {
    const saved = readWebdav();
    if (!saved) throw coded('NOT_SIGNED_IN');
    const response = await webdavSend('PROPFIND', webdavUrl(saved.baseUrl, remotePath(d)), { Depth: '0', 'Content-Type': 'application/xml' }, '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getetag/><d:getlastmodified/><d:getcontentlength/></d:prop></d:propfind>');
    if (response.status === 404) return null;
    if (response.status !== 207) {
      await expectOk(response, 'file');
      throw coded('SERVER', `SERVER: file ${response.status}`);
    }
    const xml = await response.text();
    const modified = xmlText(xml, 'getlastmodified');
    const etag = normalEtag(xmlText(xml, 'getetag'));
    const parsed = Date.parse(modified);
    return { rev: etag || `${modified}|${xmlText(xml, 'getcontentlength')}`, modified: Number.isFinite(parsed) ? new Date(parsed).toISOString() : modified, ref: {} };
  }

  /** Creates the folders of `folder` one by one (MKCOL); one that exists answers 405 and is fine. */
  async function webdavEnsureFolder(/** @type {string} */ folder) {
    const saved = readWebdav();
    if (!saved) throw coded('NOT_SIGNED_IN');
    const parts = folder.split('/').filter(Boolean);
    for (let i = 1; i <= parts.length; i++) {
      const response = await webdavSend('MKCOL', webdavUrl(saved.baseUrl, parts.slice(0, i).join('/'), true));
      await response.arrayBuffer().catch(() => {});
      if (response.ok || response.status === 405) continue;
      if (response.status === 403) throw coded('DENIED', 'DENIED: the server refuses to create the folder');
      throw coded('SERVER', `SERVER: folder ${response.status}`);
    }
  }

  async function webdavDownload(/** @type {any} */ d, /** @type {string} */ target) {
    const saved = readWebdav();
    if (!saved) throw coded('NOT_SIGNED_IN');
    const remote = await webdavStat(d);
    if (!remote) throw coded('REMOTE_MISSING');
    const response = await expectOk(await webdavSend('GET', webdavUrl(saved.baseUrl, remotePath(d)), {}, undefined, TRANSFER_TIMEOUT_MS), 'download');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()));
    return remote;
  }

  /** PUT; with `expectedRev` it carries If-Match, and a file changed meanwhile is REMOTE_CHANGED (412). */
  async function webdavUpload(/** @type {any} */ d, /** @type {string} */ source, /** @type {{ expectedRev?: string }} */ { expectedRev } = {}) {
    const saved = readWebdav();
    if (!saved) throw coded('NOT_SIGNED_IN');
    const bytes = fs.readFileSync(source);
    const url = webdavUrl(saved.baseUrl, remotePath(d));
    const put = () => webdavSend('PUT', url, { 'Content-Type': 'application/octet-stream', ...(expectedRev ? { 'If-Match': `"${expectedRev}"` } : {}) }, bytes, TRANSFER_TIMEOUT_MS);
    let response = await put();
    if (response.status === 409 && !expectedRev) {
      // The folder is gone (deleted elsewhere): made again, then once more.
      await response.arrayBuffer().catch(() => {});
      await webdavEnsureFolder(d.folder || '');
      response = await put();
    }
    if (response.status === 412) throw coded('REMOTE_CHANGED');
    await response.arrayBuffer().catch(() => {});
    await expectOk(response, 'upload');
    // The revision is read back with the same request every later check uses, so both always agree on its form.
    const remote = await webdavStat(d);
    if (!remote) throw coded('SERVER', 'SERVER: file not found after upload');
    return remote;
  }

  /**
   * A new WebDAV logbook: checks the connection, keeps the credentials, makes the OpenDives folder and uploads the
   * file. The credentials are kept for the creation and put back (or removed) when it fails.
   * @param {{ server: string, username: string, password: string }} fields @param {any} d the descriptor @param {string} source
   */
  async function createWebdavRemote(fields, d, source) {
    const baseUrl = await checkWebdav(fields);
    const file = tokenFile('webdav');
    const previous = fs.existsSync(file) ? fs.readFileSync(file) : null;
    writeWebdav({ baseUrl, username: String(fields.username).trim(), password: fields.password });
    try {
      return await createRemote(d, source);
    } catch (e) {
      if (previous) fs.writeFileSync(file, previous, { mode: 0o600 });
      else forgetTokens('webdav');
      throw e;
    }
  }

  // --- The files ---

  /** @typedef {{ rev: string, modified: string, ref: Record<string, string> }} Remote */

  const encodePath = (/** @type {string} */ p) => p.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  const remotePath = (/** @type {{ folder?: string, fileName: string }} */ d) => [d.folder, d.fileName].filter(Boolean).join('/');
  const escapeQuery = (/** @type {string} */ s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  /** Google: the id of the folder at `folder` under the drive's root, created when `create`. */
  async function googleFolder(/** @type {string} */ folder, /** @type {boolean} */ create) {
    const e = endpoint('googleDrive');
    let parent = 'root';
    for (const name of folder.split('/').filter(Boolean)) {
      const q = `name='${escapeQuery(name)}' and mimeType='application/vnd.google-apps.folder' and '${parent}' in parents and trashed=false`;
      const found = /** @type {any} */ (await (await expectOk(await api('googleDrive', `${e.api}/files?${new URLSearchParams({ q, fields: 'files(id)', spaces: 'drive', pageSize: '1' })}`), 'folder')).json());
      if (found.files?.length) {
        parent = found.files[0].id;
        continue;
      }
      if (!create) return null;
      const made = await expectOk(await api('googleDrive', `${e.api}/files?fields=id`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parent] }) }), 'folder');
      parent = /** @type {any} */ (await made.json()).id;
    }
    return parent;
  }

  const googleFields = 'id,headRevisionId,md5Checksum,modifiedTime,trashed';
  const googleRemote = (/** @type {any} */ f) => ({ rev: String(f.headRevisionId || f.md5Checksum || f.modifiedTime), modified: String(f.modifiedTime || ''), ref: { fileId: String(f.id) } });

  /** @returns {Promise<Remote | null>} */
  async function statRemote(/** @type {any} */ d, /** @type {Record<string, string> | undefined} */ ref) {
    const provider = d.provider;
    if (provider === 'webdav') return webdavStat(d);
    const e = endpoint(provider);
    if (provider === 'googleDrive') {
      if (ref?.fileId) {
        const r = await api(provider, `${e.api}/files/${encodeURIComponent(ref.fileId)}?fields=${googleFields}`);
        if (r.status !== 404) {
          const f = /** @type {any} */ (await (await expectOk(r, 'file')).json());
          if (!f.trashed) return googleRemote(f);
        }
      }
      const folderId = await googleFolder(d.folder || '', false);
      if (!folderId) return null;
      const q = `name='${escapeQuery(d.fileName)}' and '${folderId}' in parents and trashed=false`;
      const list = /** @type {any} */ (await (await expectOk(await api(provider, `${e.api}/files?${new URLSearchParams({ q, fields: `files(${googleFields})`, spaces: 'drive', pageSize: '1' })}`), 'file')).json());
      return list.files?.length ? googleRemote(list.files[0]) : null;
    }
    if (provider === 'oneDrive') {
      const r = await api(provider, `${e.api}${ACCESS.oneDrive.root}:/${encodePath(remotePath(d))}?$select=id,eTag,cTag,lastModifiedDateTime`);
      if (r.status === 404) return null;
      const f = /** @type {any} */ (await (await expectOk(r, 'file')).json());
      return { rev: String(f.cTag || f.eTag), modified: String(f.lastModifiedDateTime || ''), ref: {} };
    }
    const r = await api(provider, `${e.api}/files/get_metadata`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: `/${remotePath(d)}` }) });
    if (r.status === 409) return null;
    const f = /** @type {any} */ (await (await expectOk(r, 'file')).json());
    return { rev: String(f.rev), modified: String(f.server_modified || ''), ref: {} };
  }

  /** Downloads the remote file to `target` (a temporary file of the caller's). @returns {Promise<Remote>} */
  async function downloadRemote(/** @type {any} */ d, /** @type {Record<string, string> | undefined} */ ref, /** @type {string} */ target) {
    const provider = d.provider;
    if (provider === 'webdav') return webdavDownload(d, target);
    const e = endpoint(provider);
    // The revision is read first: a file changed between the two calls is noticed by the next check.
    const remote = await statRemote(d, ref);
    if (!remote) throw coded('REMOTE_MISSING');
    let response;
    if (provider === 'googleDrive') response = await api(provider, `${e.api}/files/${encodeURIComponent(remote.ref.fileId)}?alt=media`, {}, TRANSFER_TIMEOUT_MS);
    else if (provider === 'oneDrive') response = await api(provider, `${e.api}${ACCESS.oneDrive.root}:/${encodePath(remotePath(d))}:/content`, {}, TRANSFER_TIMEOUT_MS);
    else response = await api(provider, `${endpoint('dropbox').content}/files/download`, { method: 'POST', headers: { 'Dropbox-API-Arg': dropboxArg({ path: `/${remotePath(d)}` }) } }, TRANSFER_TIMEOUT_MS);
    await expectOk(response, 'download');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()));
    return remote;
  }

  /**
   * Uploads `source` as the remote file. With `expectedRev`, the file must still be at that revision
   * (REMOTE_CHANGED otherwise); without, it is created or replaced. @returns {Promise<Remote>}
   */
  async function uploadRemote(/** @type {any} */ d, /** @type {Record<string, string> | undefined} */ ref, /** @type {string} */ source, /** @type {{ expectedRev?: string }} */ { expectedRev } = {}) {
    const provider = d.provider;
    if (provider === 'webdav') return webdavUpload(d, source, { expectedRev });
    const e = endpoint(provider);
    const bytes = fs.readFileSync(source);
    if (provider !== 'dropbox' && expectedRev) {
      const current = await statRemote(d, ref);
      if (current && current.rev !== expectedRev) throw coded('REMOTE_CHANGED');
    }
    if (provider === 'googleDrive') {
      const existing = ref?.fileId ? ref.fileId : null;
      let url;
      let init;
      if (existing) {
        url = `${endpoint('googleDrive').upload}/files/${encodeURIComponent(existing)}?uploadType=resumable&fields=${googleFields}`;
        init = { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Upload-Content-Type': 'application/octet-stream' }, body: '{}' };
      } else {
        const folderId = await googleFolder(d.folder || '', true);
        url = `${endpoint('googleDrive').upload}/files?uploadType=resumable&fields=${googleFields}`;
        init = { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Upload-Content-Type': 'application/octet-stream' }, body: JSON.stringify({ name: d.fileName, parents: [folderId] }) };
      }
      const start = await expectOk(await api(provider, url, init), 'upload');
      const location = start.headers.get('location');
      if (!location) throw coded('SERVER', 'SERVER: no upload address');
      const done = await expectOk(await api(provider, location, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes }, TRANSFER_TIMEOUT_MS), 'upload');
      return googleRemote(await done.json());
    }
    if (provider === 'oneDrive') {
      const sessionUrl = `${e.api}${ACCESS.oneDrive.root}:/${encodePath(remotePath(d))}:/createUploadSession`;
      const session = await expectOk(await api(provider, sessionUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'replace' } }) }), 'upload');
      const uploadUrl = /** @type {any} */ (await session.json()).uploadUrl;
      if (typeof uploadUrl !== 'string') throw coded('SERVER', 'SERVER: no upload address');
      let item = null;
      for (let from = 0; from < bytes.length || from === 0; from += GRAPH_CHUNK) {
        const chunk = bytes.subarray(from, Math.min(from + GRAPH_CHUNK, bytes.length));
        // The upload address carries its own authorisation: no bearer token on it.
        const r = await send(uploadUrl, { method: 'PUT', headers: { 'Content-Range': `bytes ${from}-${from + Math.max(chunk.length, 1) - 1}/${bytes.length}` }, body: chunk }, TRANSFER_TIMEOUT_MS);
        await expectOk(r, 'upload');
        if (r.status !== 202) item = await r.json();
        if (bytes.length === 0) break;
      }
      if (!item) throw coded('SERVER', 'SERVER: upload not finished');
      return { rev: String(item.cTag || item.eTag), modified: String(item.lastModifiedDateTime || ''), ref: {} };
    }
    const mode = expectedRev ? { '.tag': 'update', update: expectedRev } : { '.tag': 'overwrite' };
    const r = await api(provider, `${endpoint('dropbox').content}/files/upload`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'Dropbox-API-Arg': dropboxArg({ path: `/${remotePath(d)}`, mode, autorename: false, mute: true }) }, body: bytes }, TRANSFER_TIMEOUT_MS);
    if (r.status === 409) throw coded('REMOTE_CHANGED');
    const f = /** @type {any} */ (await (await expectOk(r, 'upload')).json());
    return { rev: String(f.rev), modified: String(f.server_modified || ''), ref: {} };
  }

  /** A new cloud logbook's remote file: EXISTS when the service already has one by that name. */
  async function createRemote(/** @type {any} */ d, /** @type {string} */ source) {
    if (d.provider === 'webdav') await webdavEnsureFolder(d.folder || '');
    if (await statRemote(d, undefined)) throw coded('EXISTS');
    return uploadRemote(d, undefined, source);
  }

  // --- The version to keep ---

  /**
   * Both copies changed: a dialog with the two dates. 'local', 'remote', or 'later' (the diver decides at the next check).
   * @param {any} webContents the window of the logbook
   * @param {{ provider: string, name: string, localModified: number, remoteModified: string }} info
   * @returns {Promise<'local'|'remote'|'later'>}
   */
  async function askConflict(webContents, { provider, name, localModified, remoteModified }) {
    const all = texts() || {};
    const t = all.desktopCloud?.conflict || {};
    const service = all.desktopLogbooks?.source?.[provider] || provider;
    const date = (/** @type {number|string} */ value) => {
      const time = typeof value === 'number' ? value : Date.parse(value);
      return Number.isFinite(time) ? new Date(time).toLocaleString(locale, { dateStyle: 'long', timeStyle: 'short' }) : '?';
    };
    const fill = (/** @type {string} */ text, /** @type {Record<string, string>} */ values) => String(text || '').replace(/\{(\w+)\}/g, (_m, k) => values[k] ?? '');
    const buttons = [fill(t.local || 'This computer\'s copy', {}), fill(t.remote || '{service}\'s copy', { service }), t.later || 'Decide later'];
    const detail = [
      `${fill(t.local || '', {})} : ${fill(t.modified || 'modified {date}', { date: date(localModified) })}`,
      `${fill(t.remote || '', { service })} : ${fill(t.modified || 'modified {date}', { date: date(remoteModified) })}`,
      t.warning || '',
    ].join('\n');
    const answer = await dialog.showMessageBox(parentOf(webContents) ?? undefined, {
      type: 'question',
      message: fill(t.title || '"{name}" changed in two places', { name }),
      detail,
      buttons,
      defaultId: 2,
      cancelId: 2,
    });
    return answer.response === 0 ? 'local' : answer.response === 1 ? 'remote' : 'later';
  }

  /** Ends a sign-in still waiting for the browser (the diver closed the page, or chose another service). @param {string} provider */
  /** « Rouvrir la page »: the sign-in page again, for a tab closed or left behind another window. @param {string} provider */
  function reopenSignIn(provider) {
    const page = signingIn.get(provider)?.page;
    if (!page) return false;
    Promise.resolve(openExternal(page)).catch((e) => log(`The sign-in page of ${provider} did not open: ${e.message}`));
    return true;
  }

  function cancelSignIn(provider) {
    signingIn.get(provider)?.cancel();
    signingIn.delete(provider);
  }

  return { status, statusOf, signIn, reopenSignIn, cancelSignIn, signOut, available: (/** @type {string} */ p) => !!clientOf(p), stat: statRemote, download: downloadRemote, upload: uploadRemote, createRemote, askConflict, decide: decideSync, createWebdavRemote, checkWebdav, defaultFolder: (/** @type {string} */ p) => DEFAULT_FOLDER[p] ?? '' };
}

module.exports = {
  PROVIDERS,
  OAUTH_PROVIDERS,
  DEFAULT_FOLDER,
  CLIENT_KEY,
  ACCESS,
  ENDPOINTS,
  DROPBOX_PORT,
  pkcePair,
  loadClients,
  decideSync,
  createCloudService,
};
