// SPDX-License-Identifier: GPL-2.0
// @ts-check
// « Envoyer vers divelogs.de » (task 2026-11-23-337): the upload of Subsurface's desktop, in JavaScript
// (third_party/subsurface/core/uploadDiveLogsDE.cpp). Two requests to divelogs.de:
//   1. POST <base>/api/login, multipart form with the fields `user` and `pass`; the reply is JSON with a `bearer_token`.
//   2. POST <base>/api/dives, `Authorization: Bearer <token>`, `Content-Type: application/json`, the body a JSON array of the
//      dives in divelogs.de's format (lib/divelogs-format.js). Subsurface sends the whole array at once; here it goes in
//      batches, so that the progress is real and a lost connection resumes from the batch that failed.
// The user name and the password are only passed to `login` and are never kept: not in a store, not in a setting. A
// failed attempt that must be repeated ("Réessayer") keeps them in the memory of the dialog only until it closes (the
// owner of the upload object clears them), the same rule as the first launch's import.
import { divelogsDives, divelogsBody } from './divelogs-format.js';

export const DIVELOGS_URL = 'https://divelogs.de';
/** The dives of one request. */
export const BATCH_SIZE = 25;

/**
 * @typedef {{ method: 'POST', url: string, headers: Record<string, string>, body: string, timeoutMs?: number }} DivelogsRequest
 * @typedef {(request: DivelogsRequest) => Promise<{ status: number, text: string }>} DivelogsTransport
 */

/**
 * An error of the upload. `code`: LOGIN_FAILED (divelogs.de refused the user name or the password), NETWORK (divelogs.de could
 * not be reached or the connection was lost), SERVER (divelogs.de answered something else than expected), CANCELLED.
 * @param {string} code @param {string} [message]
 */
function failure(code, message = code) {
  return Object.assign(new Error(`${code}: ${message}`), { code });
}

/** The address of the upload: divelogs.de, or a test server in a development build (the loopback only). @param {string} [configured] */
export function divelogsBase(configured = '') {
  const url = configured.trim().replace(/\/+$/, '');
  if (!url) return DIVELOGS_URL;
  try {
    const u = new URL(url);
    const loopback = u.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]', '10.0.2.2'].includes(u.hostname);
    return loopback && !u.username && !u.password ? url : DIVELOGS_URL;
  } catch {
    return DIVELOGS_URL;
  }
}

/**
 * The body of a multipart form, as a browser or Qt writes it.
 * @param {Record<string, string>} fields @param {string} boundary
 */
export function multipartBody(fields, boundary) {
  return `${Object.entries(fields)
    .map(([name, value]) => `--${boundary}\r\nContent-Disposition: form-data; name="${name.replace(/["\r\n]/g, '')}"\r\n\r\n${value}\r\n`)
    .join('')}--${boundary}--\r\n`;
}

/** @returns {string} a boundary no field value contains */
const newBoundary = () => `----BenthicFormBoundary${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`;

/**
 * One request: a rejected transport is a network error.
 * @param {DivelogsTransport} transport @param {DivelogsRequest} request
 */
async function call(transport, request) {
  try {
    return await transport(request);
  } catch (e) {
    throw failure('NETWORK', String(/** @type {any} */ (e)?.message ?? e));
  }
}

/**
 * Signs in. Resolves the token only: the credentials are not kept.
 * @param {DivelogsTransport} transport @param {string} base
 * @param {{ user: string, password: string }} credentials
 * @returns {Promise<string>} the bearer token
 * @throws {Error} LOGIN_FAILED, NETWORK or SERVER
 */
export async function divelogsLogin(transport, base, credentials) {
  const boundary = newBoundary();
  const response = await call(transport, {
    method: 'POST',
    url: `${base}/api/login`,
    headers: { Accept: '*/*', 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body: multipartBody({ user: credentials.user, pass: credentials.password }, boundary),
    timeoutMs: 30000,
  });
  // Subsurface: a 401 is « invalid username or password »; any other failed status is a network error.
  if (response.status === 401 || response.status === 403) throw failure('LOGIN_FAILED');
  if (response.status < 200 || response.status >= 300) throw failure('SERVER', `login ${response.status}`);
  /** @type {any} */
  let reply;
  try {
    reply = JSON.parse(response.text);
  } catch {
    throw failure('SERVER', 'login reply is not JSON');
  }
  if (!reply || typeof reply !== 'object' || Array.isArray(reply)) throw failure('SERVER', 'login reply is not an object');
  // Subsurface: « Login failed: no token received ».
  if (typeof reply.bearer_token !== 'string' || !reply.bearer_token) throw failure('LOGIN_FAILED', 'no token received');
  return reply.bearer_token;
}

/**
 * Sends dives that are already in divelogs.de's format.
 * @param {DivelogsTransport} transport @param {string} base @param {string} token @param {string[]} dives JSON objects
 * @throws {Error} LOGIN_FAILED (the token was refused), NETWORK or SERVER
 */
export async function divelogsSend(transport, base, token, dives) {
  const response = await call(transport, {
    method: 'POST',
    url: `${base}/api/dives`,
    headers: { Accept: '*/*', 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: divelogsBody(dives),
    timeoutMs: 120000,
  });
  if (response.status === 401) throw failure('LOGIN_FAILED', 'token refused');
  if (response.status < 200 || response.status >= 300) throw failure('SERVER', `dives ${response.status}`);
}

/**
 * The upload of a set of dives: signs in, then sends them batch by batch. The object holds the token and the count of the
 * dives accepted, so that `send` called again after a network error goes on from the batch that failed.
 * @param {{
 *   transport: DivelogsTransport,
 *   base?: string,
 *   ids: number[],
 *   exportBatch: (ids: number[]) => Promise<string>,
 * }} options `exportBatch` gives the .ssrf text of some dives (the core's export)
 */
export function createDivelogsUpload({ transport, base = DIVELOGS_URL, ids, exportBatch }) {
  /** @type {string} */
  let token = '';
  let sent = 0;
  return {
    get total() {
      return ids.length;
    },
    /** The dives divelogs.de has accepted so far. */
    get sent() {
      return sent;
    },
    get signedIn() {
      return !!token;
    },
    /** @param {{ user: string, password: string }} credentials */
    async login(credentials) {
      token = await divelogsLogin(transport, base, { user: credentials.user.trim(), password: credentials.password });
    },
    /**
     * @param {(done: number, total: number) => void} onProgress
     * @param {() => boolean} cancelled true once « Annuler » was pressed: the upload stops before the next batch
     */
    async send(onProgress, cancelled) {
      if (!token) throw failure('LOGIN_FAILED', 'not signed in');
      onProgress(sent, ids.length);
      while (sent < ids.length) {
        if (cancelled()) throw failure('CANCELLED');
        const batch = ids.slice(sent, sent + BATCH_SIZE);
        const dives = divelogsDives(await exportBatch(batch));
        if (cancelled()) throw failure('CANCELLED');
        if (dives.length) await divelogsSend(transport, base, token, dives);
        sent += batch.length;
        onProgress(sent, ids.length);
      }
    },
  };
}
