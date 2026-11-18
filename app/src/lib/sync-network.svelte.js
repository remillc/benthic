// @ts-check
// « Seulement sur Wi-Fi ou câble » of the desktop account sheet (task 2026-11-15-202), kept per
// device (device-store.js). The setting is stored and offered to the sync code through
// syncAllowedOnThisNetwork(); the desktop app has no reliable « metered connection » signal
// (Chromium gives one only on Android and ChromeOS), so a Windows or macOS computer on a tethered
// phone is not detected yet: see the task's report.
import { deviceStore } from './device-store.js';

const KEY = 'od.syncUnmeteredOnly';

function read() {
  try {
    return deviceStore.getItem(KEY) === 'true';
  } catch {
    return false;
  }
}

export const syncNetwork = $state({ unmeteredOnly: read() });

/** @param {boolean} value */
export function setUnmeteredOnly(value) {
  syncNetwork.unmeteredOnly = value;
  try {
    deviceStore.setItem(KEY, String(value));
  } catch {
    // Not fatal: the choice lasts until the app closes.
  }
}

/** Whether the sync may use the connection now: false on a cellular link when the switch asks for Wi-Fi or cable only. */
export function syncAllowedOnThisNetwork() {
  const type = /** @type {any} */ (typeof navigator === 'undefined' ? null : navigator).connection?.type;
  return !(syncNetwork.unmeteredOnly && type === 'cellular');
}
