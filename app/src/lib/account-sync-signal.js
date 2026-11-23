// @ts-check
// The door between the places that change the diver's account data and the sync that sends it (lib/account-sync.svelte.js).
// The inventory and the profile call `signalAccountData('edit')` after each change, the dives sync calls it with 'dives'
// when it is done; whoever listens decides whether and when to sync. A plain module, so that neither side imports the other.

/** @typedef {'edit'|'dives'} AccountDataSignal */

/** @type {Set<(kind: AccountDataSignal) => void>} */
const listeners = new Set();

/**
 * @param {(kind: AccountDataSignal) => void} listener
 * @returns {() => void} stops listening
 */
export function onAccountData(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** @param {AccountDataSignal} kind */
export function signalAccountData(kind) {
  for (const listener of [...listeners]) {
    try {
      listener(kind);
    } catch (e) {
      console.error('Account data listener', e);
    }
  }
}
