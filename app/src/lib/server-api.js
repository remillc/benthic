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

/**
 * @param {{ baseUrl: string, transport: ServerTransport }} options an empty `baseUrl`: no server configured
 */
export function createServerApi({ baseUrl, transport }) {
  /**
   * @param {string} method @param {string} path @param {unknown} [body]
   * @returns {Promise<any>}
   */
  async function call(method, path, body) {
    if (!baseUrl) throw new ServerError('UNREACHABLE');
    let response;
    try {
      response = await transport({ method, url: baseUrl + path, body });
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
