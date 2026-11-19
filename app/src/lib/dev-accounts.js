// @ts-check
// DEVELOPMENT ONLY. The simulated « Continuer avec Google », the simulated purchase and the deletion of a temporary
// account, for trying the OpenDives+ flow on a phone against the local development server before the real Google
// Sign-In and the store billing are approved. Loaded only through `import()` behind `devAccounts` (lib/dev-switch.js):
// a build without VITE_DEV_ACCOUNTS=1 does not contain this file. It also refuses at run time any server that is not
// this machine's development server.
import { OpenDivesCore } from 'opendives-core';
import { ServerError, errorFromResponse } from './server-api.js';
import { serverTransport } from './server-transport.js';
import { serverUrl } from './server-url.js';

/** The hosts of a development server: this machine's loopback, or the Android emulator's alias of it. */
const LOCAL_HOSTS = ['10.0.2.2', '127.0.0.1', 'localhost', '[::1]'];

/**
 * Whether an address is a local development server (any scheme; the host decides).
 * @param {string} url
 * @returns {boolean}
 */
export function isLocalServerUrl(url) {
  try {
    return LOCAL_HOSTS.includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * A random temporary address: `essai-xxxx@opendives.test`.
 * @param {() => number} [random]
 * @returns {string}
 */
export function randomTempEmail(random = Math.random) {
  const letters = 'abcdefghjkmnpqrstuvwxyz23456789';
  let suffix = '';
  for (let i = 0; i < 4; i++) suffix += letters[Math.floor(random() * letters.length)];
  return `essai-${suffix}@opendives.test`;
}

/** Only the addresses of temporary accounts can be deleted (the server checks it too). @param {string} email */
export function isTempEmail(email) {
  return /@opendives\.test$/i.test(email.trim());
}

/**
 * The calls of the development routes. `baseUrl` is refused (UNREACHABLE) unless it is local.
 * @param {{ baseUrl?: string, transport?: import('./server-api.js').ServerTransport }} [options]
 */
export function createDevApi({ baseUrl = serverUrl(), transport = serverTransport } = {}) {
  /** @param {string} path @param {unknown} body @param {Record<string, string>} [headers] @param {'GET'|'POST'} [method] @returns {Promise<any>} */
  async function post(path, body, headers, method = 'POST') {
    if (!baseUrl || !isLocalServerUrl(baseUrl)) throw new ServerError('UNREACHABLE');
    let response;
    try {
      response = await transport({ method, url: baseUrl + path, ...(method === 'POST' ? { body } : {}), ...(headers ? { headers } : {}) });
    } catch {
      throw new ServerError('UNREACHABLE');
    }
    let json = null;
    try {
      json = response.text ? JSON.parse(response.text) : null;
    } catch {
      json = null;
    }
    if (response.status >= 200 && response.status < 300 && json) return json;
    throw errorFromResponse(response.status, json);
  }
  return {
    /** Like a successful Google sign-in: the account is created when needed. @param {string} email @param {string} name */
    async signIn(email, name) {
      const r = await post('/v1/auth/dev-google', { email: email.trim(), name: name.trim() });
      if (typeof r.sessionToken !== 'string' || !r.repository?.url || !r.git?.token) throw new ServerError('UNREACHABLE');
      return /** @type {import('./server-api.js').ServerSession & { user: { subscribed?: boolean } }} */ (r);
    },
    /** The simulated purchase: the account becomes subscribed. @param {string} sessionToken */
    async subscribe(sessionToken) {
      await post('/v1/account/dev-subscribe', {}, { Authorization: `Bearer ${sessionToken}` });
    },
    /** Marks the account not subscribed again (the development route). @param {string} sessionToken */
    async unsubscribe(sessionToken) {
      await post('/v1/account/dev-unsubscribe', {}, { Authorization: `Bearer ${sessionToken}` });
    },
    /** Who the server says this session is: `subscribed` is the server's answer (GET /v1/account). @param {string} sessionToken @returns {Promise<{ email: string, subscribed: boolean }>} */
    async account(sessionToken) {
      const r = await post('/v1/account', undefined, { Authorization: `Bearer ${sessionToken}` }, 'GET');
      return { email: String(r.email ?? ''), subscribed: r.subscription?.subscribed === true };
    },
    /** Deletes the temporary account with its repository. @param {string} sessionToken */
    async reset(sessionToken) {
      await post('/v1/account/dev-reset', {}, { Authorization: `Bearer ${sessionToken}` });
    },
  };
}

/** The session of a signed-in account that has not subscribed yet; nothing of it is kept on the device until it does. */
/** @type {(import('./server-api.js').ServerSession & { user: { subscribed?: boolean } })|null} */
let pending = null;

/** @param {import('./server-api.js').ServerSession & { user: { subscribed?: boolean } }|null} session */
export function rememberPending(session) {
  pending = session;
}

export function hasPending() {
  return pending !== null;
}

/** The simulated purchase of the pending account. */
export async function subscribePending() {
  if (!pending) throw new ServerError('UNREACHABLE');
  await createDevApi().subscribe(pending.sessionToken);
}

/**
 * Keeps a session on the device, as the e-mail sign-in does.
 * @param {import('./server-api.js').ServerSession} session
 */
export async function saveSession(session) {
  await OpenDivesCore.serverSessionSave({
    email: session.user.email,
    sessionToken: session.sessionToken,
    repositoryUrl: session.repository.url,
    branch: session.repository.branch || 'main',
    gitUsername: session.git.username,
    gitToken: session.git.token,
  });
}

/** Keeps the pending account's session on the device and forgets the pending one; returns its address. */
export async function savePending() {
  if (!pending) throw new ServerError('UNREACHABLE');
  const session = pending;
  await saveSession(session);
  pending = null;
  return session.user.email;
}

/** Deletes the signed-in temporary account on the server (the caller then signs out of the device). */
export async function deleteSignedInAccount() {
  const access = await OpenDivesCore.serverSessionAccess();
  await createDevApi().reset(access.sessionToken);
}
