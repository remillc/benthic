// @ts-check
// The Benthic server's sign-in API (docs/architecture.md, section 11.2): an e-mail code, no password. Pure apart
// from the transport it is given, so that node:test can drive it. The `message` of an error is for logs only; the
// screens show their own translated text for each `code`.

/** The codes the screens know. */
export const SERVER_ERRORS = /** @type {const} */ (['INVALID_ADDRESS', 'WRONG_CODE', 'CODE_EXPIRED', 'TOO_MANY_ATTEMPTS', 'RESEND_TOO_SOON', 'UNREACHABLE']);

/** The codes of the dive validation routes (lib/validation.js); they have no sentence in the dev tools. */
export const VALIDATION_ERRORS = /** @type {const} */ (['TOKEN_UNKNOWN', 'TOKEN_EXPIRED', 'TOKEN_USED', 'OWN_CODE', 'SUBSCRIPTION_REQUIRED', 'TOO_MANY_REQUESTS']);

/** The codes of the photo and video routes (lib/media-sync.js). */
export const MEDIA_ERRORS = /** @type {const} */ (['QUOTA_EXCEEDED']);

/** @typedef {typeof SERVER_ERRORS[number]|typeof VALIDATION_ERRORS[number]|typeof MEDIA_ERRORS[number]|'NOT_FOUND'} ServerErrorCode */

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
  if (typeof code === 'string' && (/** @type {readonly string[]} */ (SERVER_ERRORS).includes(code) || /** @type {readonly string[]} */ (VALIDATION_ERRORS).includes(code) || /** @type {readonly string[]} */ (MEDIA_ERRORS).includes(code)) && code !== 'UNREACHABLE') {
    return new ServerError(/** @type {ServerErrorCode} */ (code), retry);
  }
  const unreachable = new ServerError('UNREACHABLE');
  // What the server said, for the one caller that tells a missing object from a missing route (mediaDownloadUrl).
  /** @type {any} */ (unreachable).serverCode = typeof code === 'string' ? code : '';
  return unreachable;
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
 *   subscription?: { subscribed?: boolean, store?: 'google'|'apple', price?: string, renewsOn?: string },
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
    if (typeof sub.subscribed === 'boolean') out.subscription.subscribed = sub.subscribed;
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
    if (response.status >= 200 && response.status < 300 && (json || method === 'DELETE' || response.status === 204)) return json ?? {};
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
     * Every field is optional and the screen shows a placeholder for what is missing. Expected shape:
     * `{ email, signInMethod: 'google'|'apple'|'email', subscription: { subscribed: boolean, store:
     * 'google'|'apple', price: string, renewsOn: 'YYYY-MM-DD' }, storage: { usedBytes, limitBytes } }`.
     * @param {string} sessionToken
     * @returns {Promise<AccountOverview>}
     */
    async accountOverview(sessionToken) {
      return overviewOf(await call('GET', '/v1/account', undefined, { Authorization: `Bearer ${sessionToken}` }));
    },

    /**
     * Whether the server says the account is subscribed (`GET /v1/account`, `subscription.subscribed`).
     * @param {string} sessionToken
     * @returns {Promise<boolean|null>} null when the answer does not say
     */
    async subscribed(sessionToken) {
      const r = await call('GET', '/v1/account', undefined, { Authorization: `Bearer ${sessionToken}` });
      return typeof r?.subscription?.subscribed === 'boolean' ? r.subscription.subscribed : null;
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

    /**
     * Dive validation by QR code (inbox task 2026-11-19-309): a one-time code for the dives, valid 10 minutes.
     * @param {string} sessionToken @param {import('./validation.js').Summary} summary
     * @returns {Promise<{ token: string, expiresAt: string }>}
     */
    async createValidationCode(sessionToken, summary) {
      const r = await call('POST', '/v1/validations/tokens', { summary }, { Authorization: `Bearer ${sessionToken}` });
      if (typeof r.token !== 'string' || typeof r.expiresAt !== 'string') throw new ServerError('UNREACHABLE');
      return { token: r.token, expiresAt: r.expiresAt };
    },

    /**
     * The signer confirms: his name, role and instructor number; `scannedAt` when the confirmation was queued offline.
     * @param {string} sessionToken
     * @param {{ token: string, signer: { name: string, role: string, instructorNumber: string }, scannedAt?: string }} f
     * @returns {Promise<void>}
     */
    async confirmValidation(sessionToken, { token, signer, scannedAt }) {
      await call('POST', '/v1/validations/confirm', { token, ...signer, ...(scannedAt ? { scannedAt } : {}) }, { Authorization: `Bearer ${sessionToken}` });
    },

    /**
     * What the signer answered, for the diver's pending validation.
     * @param {string} sessionToken @param {string} token
     * @returns {Promise<{ status: 'waiting'|'confirmed'|'expired', signer?: { name: string, role: string, instructorNumber?: string }, confirmedAt?: string }>}
     */
    async validationResult(sessionToken, token) {
      return call('POST', '/v1/validations/result', { token }, { Authorization: `Bearer ${sessionToken}` });
    },

    /**
     * A signed address to upload an object of the account (photos and videos, docs/architecture.md 11.6). `exists`: the
     * server already holds it, nothing to send. QUOTA_EXCEEDED when the account is full; SUBSCRIPTION_REQUIRED without Benthic+.
     * @param {string} sessionToken @param {string} hash @param {number} size
     * @returns {Promise<{ exists: true }|{ exists: false, url: string, headers: Record<string, string> }>}
     */
    async mediaUploadUrl(sessionToken, hash, size) {
      const r = await call('POST', '/v1/media/upload-url', { hash, size }, { Authorization: `Bearer ${sessionToken}` });
      if (r.exists === true) return { exists: true };
      if (typeof r.url !== 'string') throw new ServerError('UNREACHABLE');
      return { exists: false, url: r.url, headers: r.headers && typeof r.headers === 'object' ? r.headers : {} };
    },

    /**
     * A signed address to download an object of the account. NOT_FOUND when the server does not hold it (yet).
     * @param {string} sessionToken @param {string} hash @returns {Promise<{ url: string, size: number|null }>}
     */
    async mediaDownloadUrl(sessionToken, hash) {
      let r;
      try {
        r = await call('POST', '/v1/media/download-url', { hash }, { Authorization: `Bearer ${sessionToken}` });
      } catch (e) {
        // 404 NOT_FOUND from the route itself: the object is not on the server (yet).
        if (/** @type {any} */ (e)?.serverCode === 'NOT_FOUND') throw new ServerError('NOT_FOUND');
        throw e;
      }
      if (typeof r.url !== 'string') throw new ServerError('UNREACHABLE');
      return { url: r.url, size: Number.isFinite(r.size) ? r.size : null };
    },

    /**
     * Registers or refreshes this device's push token (inbox task 2026-11-23-356, part 3): only an access request wakes a
     * closed app. `deviceId` is the id of the device's `keys/devices/<id>.json` record.
     * @param {string} sessionToken @param {{ deviceId: string, platform: 'android'|'ios', token: string }} f
     * @returns {Promise<void>}
     */
    async registerPushToken(sessionToken, { deviceId, platform, token }) {
      await call('POST', '/v1/devices/push-token', { deviceId, platform, token }, { Authorization: `Bearer ${sessionToken}` });
    },

    /**
     * Removes this device's push token (sign-out, device unpaired).
     * @param {string} sessionToken @param {string} deviceId
     * @returns {Promise<void>}
     */
    async removePushToken(sessionToken, deviceId) {
      await call('DELETE', `/v1/devices/push-token?deviceId=${encodeURIComponent(deviceId)}`, undefined, { Authorization: `Bearer ${sessionToken}` });
    },

    /**
     * Ends the session on the server; the tokens registered with it go too.
     * @param {string} sessionToken
     * @returns {Promise<void>}
     */
    async signOut(sessionToken) {
      await call('POST', '/v1/auth/sign-out', undefined, { Authorization: `Bearer ${sessionToken}` });
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
