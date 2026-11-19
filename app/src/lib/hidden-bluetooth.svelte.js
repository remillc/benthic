// @ts-check
// Bluetooth devices the user marked "Not a dive computer": hidden from the
// nearby list of the download screen by their Bluetooth address, until shown
// again in Settings. Kept on this device (device-store.js, key od.hiddenBluetooth,
// a JSON list of addresses).
import { deviceStore } from './device-store.js';

const KEY = 'od.hiddenBluetooth';

/** @returns {string[]} */
function read() {
  try {
    const list = JSON.parse(deviceStore.getItem(KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((a) => typeof a === 'string') : [];
  } catch {
    return [];
  }
}

export const hiddenBluetooth = $state({ addresses: read() });

/** @param {string[]} list */
function keep(list) {
  hiddenBluetooth.addresses = list;
  deviceStore.setItem(KEY, JSON.stringify(list));
}

/** @param {string} address */
export function hideBluetooth(address) {
  if (address && !hiddenBluetooth.addresses.includes(address)) keep([...hiddenBluetooth.addresses, address]);
}

/** @param {string} address */
export function showBluetooth(address) {
  keep(hiddenBluetooth.addresses.filter((a) => a !== address));
}

export function showAllBluetooth() {
  keep([]);
}
