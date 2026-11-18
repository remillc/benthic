// @ts-check
// The address of this build's server, read from Vite's environment in one place. `import.meta.env.DEV` is a constant
// the bundler replaces: a build made with `vite build` drops the development branch, so it carries no development
// address (tests/app/server-config.test.mjs checks the bundle's source for it).
import { Capacitor } from '@capacitor/core';
import { serverBaseUrl } from './server-config.js';

/** @returns {string} */
function developmentUrl() {
  // The Android emulator reaches the host's loopback as 10.0.2.2; the desktop app and a browser use the loopback.
  return Capacitor.getPlatform() === 'android' ? 'http://10.0.2.2:8080' : 'http://127.0.0.1:8080';
}

/** The server's address: '' when none is configured (the unreachable screen is then shown). */
export function serverUrl() {
  // Written out in full: Vite replaces `import.meta.env.DEV` and `.VITE_SERVER_URL` as it reads the file.
  // @ts-ignore import.meta.env is added by Vite; absent under node:test.
  const configured = import.meta.env ? import.meta.env.VITE_SERVER_URL : '';
  // @ts-ignore
  const dev = import.meta.env && import.meta.env.DEV ? developmentUrl() : '';
  return serverBaseUrl({ configured: configured ?? '', developmentUrl: dev });
}
