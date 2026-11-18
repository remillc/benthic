// @ts-check
// The `http` object isomorphic-git wants (`request`), built over a transport that moves bytes. The transport is the
// platform's: the native HTTP client of Capacitor on a phone, the main process in the desktop app (no CORS in either),
// `fetch` for a plain browser (transport.js). Tests give a fake one.

/**
 * @typedef {Object} BinaryRequest
 * @property {string} method
 * @property {string} url
 * @property {Record<string, string>} [headers]
 * @property {Uint8Array} [body]
 * @typedef {Object} BinaryResponse
 * @property {number} status
 * @property {Record<string, string>} [headers]
 * @property {Uint8Array} body
 * @typedef {(request: BinaryRequest) => Promise<BinaryResponse>} BinaryTransport
 */

/** The chunks of a request body (isomorphic-git gives an array or an async iterable) as one array. @param {any} body */
async function collect(body) {
  if (body === undefined || body === null) return undefined;
  if (body instanceof Uint8Array) return body;
  /** @type {Uint8Array[]} */
  const chunks = [];
  if (body[Symbol.asyncIterator]) for await (const c of body) chunks.push(c);
  else for (const c of body) chunks.push(c);
  const size = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/**
 * @param {BinaryTransport} transport
 */
export function createGitHttp(transport) {
  return {
    /** @param {{ url: string, method?: string, headers?: Record<string, string>, body?: any, onProgress?: (p: { loaded: number, total?: number }) => void }} options */
    async request({ url, method = 'GET', headers = {}, body, onProgress }) {
      const bytes = await collect(body);
      const response = await transport({ method, url, headers: { 'User-Agent': 'OpenDives', ...headers }, body: bytes });
      /** @type {Record<string, string>} */
      const lower = {};
      for (const [k, v] of Object.entries(response.headers ?? {})) lower[k.toLowerCase()] = String(v);
      const data = response.body;
      onProgress?.({ loaded: data.length, total: data.length });
      return {
        url,
        method,
        statusCode: response.status,
        statusMessage: String(response.status),
        headers: lower,
        body: (async function* () {
          yield data;
        })(),
      };
    },
  };
}
