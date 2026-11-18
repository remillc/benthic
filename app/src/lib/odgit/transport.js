// @ts-check
// How a git call reaches the OpenDives server, by platform (the same choice as lib/server-transport.js, with bytes in
// both directions). The server sends no CORS headers: the web view never calls it with `fetch` on a device.
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { base64ToBytes, bytesToBase64 } from './fs-adapter.js';

/** @type {import('./http-adapter.js').BinaryTransport} */
export async function binaryTransport(request) {
  const desktop = /** @type {any} */ (globalThis).odDesktop;
  if (desktop?.server?.requestBinary) return desktop.server.requestBinary(request);
  if (Capacitor.isNativePlatform()) {
    const hasBody = request.body !== undefined;
    const response = await CapacitorHttp.request({
      method: request.method,
      url: request.url,
      headers: request.headers ?? {},
      // `dataType: 'file'` sends the bytes of a base64 text as they are (a git request is not JSON or a form).
      data: hasBody ? bytesToBase64(/** @type {Uint8Array} */ (request.body)) : undefined,
      dataType: hasBody ? 'file' : undefined,
      connectTimeout: 15000,
      readTimeout: 120000,
      responseType: 'arraybuffer',
    });
    const data = response.data;
    return {
      status: response.status,
      headers: response.headers ?? {},
      body: typeof data === 'string' ? base64ToBytes(data) : new Uint8Array(0),
    };
  }
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: /** @type {any} */ (request.body),
    signal: AbortSignal.timeout(600000),
  });
  /** @type {Record<string, string>} */
  const headers = {};
  response.headers.forEach((v, k) => (headers[k] = v));
  return { status: response.status, headers, body: new Uint8Array(await response.arrayBuffer()) };
}
