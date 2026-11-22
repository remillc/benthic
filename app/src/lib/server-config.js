// @ts-check
// Where the Benthic server is (release edition, tasks 2026-11-16-259 and 260). The address comes from the build's
// configuration (`VITE_SERVER_URL`); a development server answers on the Android emulator's host alias or on the
// loopback. A release build never carries a development address: without the variable its address is empty and
// the app shows « Le serveur ne répond pas » (docs/architecture.md, section 11.2).

/**
 * An address the app may call: https, or http only for the development server of this machine (the Android
 * emulator's alias of the host, or the loopback). Anything else is refused, so a typo cannot send a code in clear.
 * @param {string} url
 * @returns {boolean}
 */
export function allowedServerUrl(url) {
  try {
    const u = new URL(url);
    if (u.username || u.password) return false;
    if (u.protocol === 'https:') return true;
    return u.protocol === 'http:' && ['10.0.2.2', '127.0.0.1', 'localhost', '[::1]'].includes(u.host.replace(/:\d+$/, ''));
  } catch {
    return false;
  }
}

/**
 * The address to use: the configured one, else the development one while developing, else none.
 * @param {{ configured?: string, developmentUrl?: string }} options
 * @returns {string} an address without a trailing slash, or '' (no server configured)
 */
export function serverBaseUrl({ configured = '', developmentUrl = '' }) {
  const url = (configured.trim() || developmentUrl).replace(/\/+$/, '');
  return url && allowedServerUrl(url) ? url : '';
}
