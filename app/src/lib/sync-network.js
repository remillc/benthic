// @ts-check
// « Seulement sur Wi-Fi ou câble » (task 2026-11-15-202): the decision, apart from any state so that it can be tested.

/** @typedef {'metered'|'unmetered'|'unknown'} ConnectionCost */

/**
 * Whether an automatic sync may use the connection. The switch stops it only where something says the link is
 * metered: the desktop's main process (desktop/network.cjs: Windows connection cost, NetworkManager, macOS hotspot
 * signs) or, where the web view has it, navigator.connection.type 'cellular'. Unknown allows the sync. A manual
 * « Synchroniser maintenant » never asks this.
 * @param {{ unmeteredOnly: boolean, cost?: ConnectionCost, connectionType?: string }} state
 * @returns {boolean}
 */
export function syncAllowed({ unmeteredOnly, cost = 'unknown', connectionType = '' }) {
  if (!unmeteredOnly) return true;
  return !(cost === 'metered' || connectionType === 'cellular');
}
