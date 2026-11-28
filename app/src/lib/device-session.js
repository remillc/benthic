// @ts-check
// The device's report to the Benthic server (lib/device-report.js) wired to the platform: read at sign-in and sent with the session at
// each sync and each desktop access check. Local mode has no session: nothing is read, nothing is sent.
import { BenthicCore } from 'benthic-core';
import { createServerApi } from './server-api.js';
import { serverTransport } from './server-transport.js';
import { serverUrl } from './server-url.js';
import { edition } from './edition.js';
import { createDeviceReporter, deviceReport } from './device-report.js';

/**
 * What this device is, for the report (null when the system is unknown).
 * @returns {Promise<import('./device-report.js').DeviceReport|null>}
 */
export async function currentDevice() {
  const g = /** @type {any} */ (globalThis);
  const nav = g.navigator ?? {};
  let model = '';
  let platformVersion = '';
  try {
    // User-Agent Client Hints, where the web view has them (Chromium): the real model and the real Windows version.
    const hints = await nav.userAgentData?.getHighEntropyValues?.(['model', 'platformVersion']);
    model = typeof hints?.model === 'string' ? hints.model : '';
    platformVersion = typeof hints?.platformVersion === 'string' ? hints.platformVersion : '';
  } catch {
    // no hints: the user agent is used
  }
  return deviceReport({
    ua: nav.userAgent ?? '',
    desktopPlatform: g.benthicDesktop?.platform ?? '',
    shortSide: g.screen ? Math.min(g.screen.width, g.screen.height) : 0,
    touchPoints: nav.maxTouchPoints ?? 0,
    navigatorPlatform: nav.platform ?? '',
    model,
    platformVersion,
    appVersion: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '',
    edition,
  });
}

/** @type {Array<() => void>} */
const endedListeners = [];

/** @param {() => void} listener called when the server says this device's session was ended (« Déconnecter cet appareil » in the console) */
export function onSessionEnded(listener) {
  endedListeners.push(listener);
}

const reporter = createDeviceReporter({
  device: currentDevice,
  sessionToken: async () => {
    if (!serverUrl()) return '';
    const info = await BenthicCore.serverSessionInfo();
    if (!info?.signedIn) return '';
    return (await BenthicCore.serverSessionAccess()).sessionToken || '';
  },
  send: (token, device) => createServerApi({ baseUrl: serverUrl(), transport: serverTransport }).reportDevice(token, device),
  onEnded: () => endedListeners.forEach((f) => f()),
});

/**
 * Sends the device's report with its session (at each sync and each desktop access check; once a minute at most unless forced).
 * Never throws, never waits for the diver.
 * @param {{ force?: boolean }} [options]
 */
export function reportDevice(options) {
  return reporter.report(options);
}
