// @ts-check
// The curve chips under the desktop profile (task 2026-11-15-183): which curves are on, in the order
// they were turned on (the last right-hand scale turned on is the one drawn). The choice is kept
// between dives and sessions in the settings of this computer (device-store.js, key
// `od.profileLayers`), never in the logbook. Without a choice yet, the water temperature is on.
import { writable } from 'svelte/store';

export const LAYER_KEY = 'od.profileLayers';
/** The chips, in their order. */
export const LAYERS = /** @type {const} */ (['temperature', 'gas', 'ppo2', 'ceiling', 'tissues']);
/** @typedef {typeof LAYERS[number]} Layer */
export const DEFAULT_LAYERS = /** @type {Layer[]} */ (['temperature']);

/** Phone and tablet selections live only for the lifetime of the app. */
export const sessionLayers = writable([...DEFAULT_LAYERS]);

/** @typedef {{ getItem: (key: string) => string|null, setItem: (key: string, value: string) => void }} Store */

/**
 * The curves that were on, in the order they were turned on.
 * @param {Store} store
 * @returns {Layer[]}
 */
export function readLayers(store) {
  const raw = store.getItem(LAYER_KEY);
  if (raw === null) return [...DEFAULT_LAYERS];
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [...DEFAULT_LAYERS];
    return list.filter((l, i) => /** @type {readonly string[]} */ (LAYERS).includes(l) && list.indexOf(l) === i);
  } catch {
    return [...DEFAULT_LAYERS];
  }
}

/** @param {Store} store @param {Layer[]} layers */
export function saveLayers(store, layers) {
  store.setItem(LAYER_KEY, JSON.stringify(layers));
}

/**
 * A chip turned on or off.
 * @param {Layer[]} layers
 * @param {Layer} layer
 * @param {boolean} on
 * @returns {Layer[]}
 */
export function setLayer(layers, layer, on) {
  const others = layers.filter((l) => l !== layer);
  return on ? [...others, layer] : others;
}
