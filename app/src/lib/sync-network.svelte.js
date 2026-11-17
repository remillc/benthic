// @ts-check
// « Seulement sur Wi-Fi ou câble » of the desktop account sheet (task 2026-11-15-202), kept per device
// (device-store.js) and applied: the automatic sync (edits sent a few seconds after a change, the retry after a
// failure, the exchange at start, the catch-up when the network comes back) does not run on a metered or tethered
// connection. The desktop's main process tells the connection type (desktop/network.cjs, through
// window.odDesktop.network: cached, asked again when the network interfaces change, never blocking); « unknown »
// allows the sync. « Synchroniser maintenant » is manual and always works.
import { deviceStore } from './device-store.js';
import { syncAllowed } from './sync-network.js';

const KEY = 'od.syncUnmeteredOnly';

function read() {
  try {
    return deviceStore.getItem(KEY) === 'true';
  } catch {
    return false;
  }
}

/** @type {{ unmeteredOnly: boolean, cost: import('./sync-network.js').ConnectionCost }} */
export const syncNetwork = $state({ unmeteredOnly: read(), cost: 'unknown' });

const bridge = () => /** @type {any} */ (typeof window === 'undefined' ? null : window).odDesktop?.network ?? null;

/** @type {(() => void)[]} */
const allowedAgain = [];

/** Calls `callback` when the sync becomes allowed again (the metered link went away, the switch was turned off). @param {() => void} callback */
export function onSyncAllowedAgain(callback) {
  allowedAgain.push(callback);
}

/** Whether the sync may use the connection now. */
export function syncAllowedOnThisNetwork() {
  const connectionType = /** @type {any} */ (typeof navigator === 'undefined' ? null : navigator).connection?.type;
  return syncAllowed({ unmeteredOnly: syncNetwork.unmeteredOnly, cost: syncNetwork.cost, connectionType });
}

/** @param {string} cost */
function setCost(cost) {
  const before = syncAllowedOnThisNetwork();
  syncNetwork.cost = cost === 'metered' || cost === 'unmetered' ? cost : 'unknown';
  if (!before && syncAllowedOnThisNetwork()) for (const callback of allowedAgain) callback();
}

/** @type {Promise<void>|null} */
let first = null;

/** Reads the connection type once (and listens for changes) when the switch is on. @returns {Promise<void>} */
function start() {
  if (first) return first;
  const network = bridge();
  if (!network) return (first = Promise.resolve());
  network.onChange(setCost);
  network.watch?.().catch(() => {});
  first = network.status().then(setCost, () => {});
  return first;
}

/**
 * Resolves once the connection type is known (at most `ms` ms), so that a start-up exchange does not slip through
 * on a tethered phone before the system answered. Immediate when the switch is off or there is no desktop bridge.
 * @param {number} [ms]
 * @returns {Promise<void>}
 */
export function networkKnown(ms = 2500) {
  if (!syncNetwork.unmeteredOnly || !bridge()) return Promise.resolve();
  return Promise.race([start(), new Promise((resolve) => setTimeout(resolve, ms))]).then(() => {});
}

/** @param {boolean} value */
export function setUnmeteredOnly(value) {
  const before = syncAllowedOnThisNetwork();
  syncNetwork.unmeteredOnly = value;
  try {
    deviceStore.setItem(KEY, String(value));
  } catch {
    // Not fatal: the choice lasts until the app closes.
  }
  if (value) {
    // A fresh look at the connection: the diver may have just plugged a cable or joined a hotspot.
    start().then(() => bridge()?.refresh?.().then(setCost, () => {}));
  } else if (!before) for (const callback of allowedAgain) callback();
}

if (syncNetwork.unmeteredOnly) start();
