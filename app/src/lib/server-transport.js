// @ts-check
// How a call reaches the OpenDives server, by platform. The server sends no CORS headers (it is not a website), so
// the web view never calls it with `fetch`: on a phone the native HTTP client of Capacitor does, in the desktop
// app the main process does (desktop/bridge.cjs, `server.request`). `fetch` is only the fallback of a plain
// browser, which has no secure storage either and is used for development checks.
import { Capacitor, CapacitorHttp } from '@capacitor/core';

/** @type {import('./server-api.js').ServerTransport} */
export async function serverTransport(request) {
  const desktop = /** @type {any} */ (globalThis).odDesktop;
  if (desktop?.server?.request) return desktop.server.request(request);
  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.request({
      method: request.method,
      url: request.url,
      headers: { Accept: 'application/json', ...(request.headers ?? {}), ...(request.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      data: request.body,
      connectTimeout: 15000,
      readTimeout: 20000,
      responseType: 'text',
    });
    return { status: response.status, text: typeof response.data === 'string' ? response.data : JSON.stringify(response.data ?? '') };
  }
  const response = await fetch(request.url, {
    method: request.method,
    headers: { Accept: 'application/json', ...(request.headers ?? {}), ...(request.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: request.body !== undefined ? JSON.stringify(request.body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  return { status: response.status, text: await response.text() };
}
