// @ts-check
// How the divelogs.de upload reaches the network, by platform (the same three paths as server-transport.js). divelogs.de
// sends no CORS headers, so the web view never calls it with `fetch`: on a phone the native HTTP client of Capacitor does,
// in the desktop app the main process does (desktop/bridge.cjs, `server.request` with a `raw` body). `fetch` is the fallback
// of a plain browser, used by the development checks with a test server.
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { divelogsBase } from './divelogs-upload.js';

/** @type {import('./divelogs-upload.js').DivelogsTransport} */
export async function divelogsTransport(request) {
  const desktop = /** @type {any} */ (globalThis).benthicDesktop;
  if (desktop?.server?.request) {
    return desktop.server.request({ method: request.method, url: request.url, headers: request.headers, raw: request.body, timeoutMs: request.timeoutMs });
  }
  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.request({
      method: request.method,
      url: request.url,
      headers: request.headers,
      data: request.body,
      connectTimeout: 20000,
      readTimeout: request.timeoutMs ?? 30000,
      responseType: 'text',
    });
    return { status: response.status, text: typeof response.data === 'string' ? response.data : JSON.stringify(response.data ?? '') };
  }
  const response = await fetch(request.url, { method: request.method, headers: request.headers, body: request.body, signal: AbortSignal.timeout(request.timeoutMs ?? 30000) });
  return { status: response.status, text: await response.text() };
}

/**
 * The address of divelogs.de. A development build (never a release one) may point it at a test server on this machine with
 * `VITE_DIVELOGS_URL`; anything but the loopback is refused (`divelogsBase`).
 */
export function divelogsUrl() {
  // Written out in full: Vite replaces `import.meta.env.DEV` and `.VITE_DIVELOGS_URL` as it reads the file.
  // @ts-ignore import.meta.env is added by Vite; absent under node:test.
  const configured = import.meta.env && import.meta.env.DEV ? import.meta.env.VITE_DIVELOGS_URL : '';
  return divelogsBase(configured ?? '');
}
