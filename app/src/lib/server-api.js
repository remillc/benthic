// @ts-check
// The OpenDives server's sign-in API (docs/architecture.md, section 11.2): an e-mail code, no password. Pure apart
// from the transport it is given, so that node:test can drive it. The `message` of an error is for logs only; the
// screens show their own translated text for each `code`.

/** The codes the screens know. */
export const SERVER_ERRORS = /** @type {const} */ (['INVALID_ADDRESS', 'WRONG_CODE', 'CODE_EXPIRED', 'TOO_MANY_ATTEMPTS', 'RESEND_TOO_SOON', 'UNREACHABLE']);

/** @typedef {typeof SERVER_ERRORS[number]} ServerErrorCode */

export class ServerError extends Error {
  /**
   * @param {ServerErrorCode} code
   * @param {number} [retryAfterSeconds] only for TOO_MANY_ATTEMPTS and RESEND_TOO_SOON
   */
  constructor(code, retryAfterSeconds) {
    super(code);
    this.name = 'ServerError';
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * The error of a response: its own code when the body carries a known one; anything else (a 5xx, an unknown route,
 * a body that is not JSON) is the server being unreachable.
 * @param {number} status
 * @param {any} body the parsed JSON, or null
 * @returns {ServerError}
 */
export function errorFromResponse(status, body) {
  const code = body?.error?.code;
  const retry = Number.isFinite(body?.error?.retryAfterSeconds) ? Number(body.error.retryAfterSeconds) : undefined;
  if (typeof code === 'string' && /** @type {readonly string[]} */ (SERVER_ERRORS).includes(code) && code !== 'UNREACHABLE') {
    return new ServerError(/** @type {ServerErrorCode} */ (code), retry);
  }
  return new ServerError('UNREACHABLE');
}

/**
 * @typedef {{ method: string, url: string, headers?: Record<string, string>, body?: unknown }} ServerRequest
 * @typedef {{ status: number, text: string }} ServerResponse
 * @typedef {(request: ServerRequest) => Promise<ServerResponse>} ServerTransport
 */

/**
 * @typedef {Object} ServerSession
 * @property {string} sessionToken
 * @property {{ id: string, email: string, isNew: boolean }} user
 * @property {{ url: string, branch: string }} repository
 * @property {{ username: string, token: string }} git
 */

/** @param {any} r the answer of the consent calls @returns {{ consent: boolean, consentedAt: string }} */
function consentOf(r) {
  if (typeof r?.consent !== 'boolean') throw new ServerError('UNREACHABLE');
  return { consent: r.consent, consentedAt: r.consent && typeof r.consentedAt === 'string' ? r.consentedAt : '' };
}

/**
 * @typedef {{
 *   email?: string,
 *   signInMethod?: 'google'|'apple'|'email',
 *   subscription?: { store?: 'google'|'apple', price?: string, renewsOn?: string },
 *   storage?: { usedBytes?: number, limitBytes?: number },
 * }} AccountOverview
 */

/**
 * The parts of the account overview that are well formed; anything else is dropped (the screen has a placeholder).
 * @param {any} r
 * @returns {AccountOverview}
 */
export function overviewOf(r) {
  /** @type {AccountOverview} */
  const out = {};
  if (typeof r?.email === 'string') out.email = r.email;
  if (['google', 'apple', 'email'].includes(r?.signInMethod)) out.signInMethod = r.signInMethod;
  const sub = r?.subscription;
  if (sub && typeof sub === 'object') {
    out.subscription = {};
    if (sub.store === 'google' || sub.store === 'apple') out.subscription.store = sub.store;
    if (typeof sub.price === 'string' && sub.price) out.subscription.price = sub.price;
    if (typeof sub.renewsOn === 'string' && /^\d{4}-\d{2}-\d{2}/.test(sub.renewsOn)) out.subscription.renewsOn = sub.renewsOn.slice(0, 10);
  }
  const st = r?.storage;
  if (st && typeof st === 'object' && typeof st.usedBytes === 'number' && st.usedBytes >= 0) {
    out.storage = { usedBytes: st.usedBytes };
    if (typeof st.limitBytes === 'number' && st.limitBytes > 0) out.storage.limitBytes = st.limitBytes;
  }
  return out;
}

/**
 * @param {{ baseUrl: string, transport: ServerTransport }} options an empty `baseUrl`: no server configured
 */
export function createServerApi({ baseUrl, transport }) {
  /**
   * @param {string} method @param {string} path @param {unknown} [body] @param {Record<string, string>} [headers]
   * @returns {Promise<any>}
   */
  async function call(method, path, body, headers) {
    if (!baseUrl) throw new ServerError('UNREACHABLE');
    let response;
    try {
      response = await transport({ method, url: baseUrl + path, body, ...(headers ? { headers } : {}) });
    } catch {
      throw new ServerError('UNREACHABLE');
    }
    let json = null;
    try {
      json = response.text ? JSON.parse(response.text) : null;
    } catch {
      json = null;
    }
    // A deletion answers with an empty body (204) as well as with a JSON one.
    if (response.status >= 200 && response.status < 300 && (json || method === 'DELETE')) return json ?? {};
    throw errorFromResponse(response.status, json);
  }

  return {
    /**
     * Sends a code to the address.
     * @param {string} email
     * @returns {Promise<{ expiresInSeconds: number, resendAfterSeconds: number }>}
     */
    async requestCode(email) {
      const r = await call('POST', '/v1/auth/code', { email: email.trim() });
      return { expiresInSeconds: Number(r.expiresInSeconds) || 600, resendAfterSeconds: Number(r.resendAfterSeconds) || 30 };
    },

    /**
     * Checks the code; the account is created when the address is new.
     * @param {string} email @param {string} code
     * @returns {Promise<ServerSession>}
     */
    async verifyCode(email, code) {
      const r = await call('POST', '/v1/auth/verify', { email: email.trim(), code });
      if (typeof r.sessionToken !== 'string' || !r.repository?.url || !r.git?.token) throw new ServerError('UNREACHABLE');
      return r;
    },

    /**
     * The optional consent to keep health data (the blood group), with its date.
     * @param {string} sessionToken
     * @returns {Promise<{ consent: boolean, consentedAt: string }>} `consentedAt`: '' when not given
     */
    async healthConsent(sessionToken) {
      return consentOf(await call('GET', '/v1/account/health-consent', undefined, { Authorization: `Bearer ${sessionToken}` }));
    },

    /**
     * Gives or withdraws the consent.
     * @param {string} sessionToken @param {boolean} consent
     * @returns {Promise<{ consent: boolean, consentedAt: string }>}
     */
    async setHealthConsent(sessionToken, consent) {
      return consentOf(await call('PUT', '/v1/account/health-consent', { consent }, { Authorization: `Bearer ${sessionToken}` }));
    },

    /**
     * What the account screen shows (task 2026-11-18-281): how the diver signs in, the subscription and the photo space.
     * The server does not answer this route yet (UNREACHABLE): every field is optional and the screen shows a placeholder
     * for what is missing. Expected shape: `{ email, signInMethod: 'google'|'apple'|'email', subscription: { store:
     * 'google'|'apple', price: string, renewsOn: 'YYYY-MM-DD' }, storage: { usedBytes, limitBytes } }`.
     * @param {string} sessionToken
     * @returns {Promise<AccountOverview>}
     */
    async accountOverview(sessionToken) {
      return overviewOf(await call('GET', '/v1/account', undefined, { Authorization: `Bearer ${sessionToken}` }));
    },

    /**
     * Deletes the account and what the server keeps for it (the logbook's repository, the photos). The server does not
     * answer this route yet. The logbook on the device is not touched.
     * @param {string} sessionToken
     * @returns {Promise<void>}
     */
    async deleteAccount(sessionToken) {
      await call('DELETE', '/v1/account', undefined, { Authorization: `Bearer ${sessionToken}` });
    },

    /** @returns {Promise<boolean>} whether the server answers */
    async reachable() {
      try {
        const r = await call('GET', '/v1/health');
        return r.status === 'ok' || r.status === 'degraded';
      } catch {
        return false;
      }
    },
  };
}

/**
 * A plain address check before asking for a code: something before the @, a dot in the domain. The server has the
 * last word (INVALID_ADDRESS).
 * @param {string} email
 */
export function plausibleEmail(email) {
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email.trim());
}
