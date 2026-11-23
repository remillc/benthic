// @ts-check
// What the download screen says about a remembered dive computer: when it last downloaded, and the date of the
// last dive it gave (« Shearwater · dernier téléchargement le … », « Dernière plongée reçue : … »). The core does not
// keep these, so each successful download writes them here, on this device only (device-store.js, key
// bc.downloadHistory, a JSON object by Bluetooth address). Nothing else reads or changes the download itself.
import { deviceStore } from './device-store.js';

const KEY = 'bc.downloadHistory';

/** The MAC address of a stored address (same rule as macOf in download.js, which needs the app's modules). @param {string} address */
const macOf = (address) => address.replace(/^(LE|BT):/i, '').toUpperCase();

/** @typedef {{ at: string, lastDive?: string }} DownloadRecord `at`: when the download ended (ISO instant); `lastDive`: the newest dive it received (the dive's own date text) */

/** @param {{ getItem: (key: string) => string|null }} [store] @returns {Record<string, DownloadRecord>} */
export function readHistory(store = deviceStore) {
  try {
    const value = JSON.parse(store.getItem(KEY) ?? '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

/**
 * The record of a computer, by its stored address (« LE:AA:BB… » or « AA:BB… »).
 * @param {string} address
 * @param {{ getItem: (key: string) => string|null }} [store]
 * @returns {DownloadRecord|null}
 */
export function recordOf(address, store = deviceStore) {
  return readHistory(store)[macOf(address)] ?? null;
}

/**
 * Writes the end of a download. `lastDive` is kept from the earlier record when this download brought no dive.
 * @param {string} address
 * @param {string[]} diveDates the dates of the dives this download received
 * @param {Date} [now]
 * @param {{ getItem: (key: string) => string|null, setItem: (key: string, value: string) => void }} [store]
 */
export function recordDownload(address, diveDates, now = new Date(), store = deviceStore) {
  const history = readHistory(store);
  const key = macOf(address);
  const newest = [...diveDates].sort().pop();
  history[key] = { at: now.toISOString(), ...(newest || history[key]?.lastDive ? { lastDive: newest || history[key]?.lastDive } : {}) };
  store.setItem(KEY, JSON.stringify(history));
}
