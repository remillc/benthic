// @ts-check
// The diver's own photos of their pieces, read once from the inventory (account data) and kept while the app runs. A
// photo the diver took wins over the catalog photo of a dive computer's model wherever the piece is shown
// (tasks 2026-11-19-302 and 306). Reactive: a component that reads `ownPhoto(photoId)` updates when the file arrives.
import { gear, readPhoto } from './inventory.svelte.js';

/** @type {Record<string, string>} */
const urls = $state({});
/** @type {Set<string>} */
const asked = new Set();

/**
 * The data URL of a piece's own photo; '' while it loads, or when the piece has none.
 * @param {string|undefined|null} photoId
 * @returns {string}
 */
export function ownPhoto(photoId) {
  if (!photoId) return '';
  if (!asked.has(photoId)) {
    asked.add(photoId);
    readPhoto(photoId).then(
      (u) => (urls[photoId] = u),
      () => asked.delete(photoId),
    );
  }
  return urls[photoId] ?? '';
}

/** A photo was added, replaced or removed: it is read again the next time. @param {string|undefined|null} photoId */
export function forgetPhoto(photoId) {
  if (!photoId) return;
  asked.delete(photoId);
  delete urls[photoId];
}

/**
 * The diver's own photo of the equipment piece that is this logbook computer (same model and serial number), or ''.
 * The piece is found in the inventory once it is loaded (Benthic+); without one the catalog photo shows.
 * @param {string|undefined|null} model the computer's text as the logbook keeps it
 * @param {string|undefined|null} serial
 * @returns {string}
 */
export function ownComputerPhoto(model, serial) {
  if (!model) return '';
  const piece = gear.pieces.find((g) => g.type === 'computer' && g.photoId && g.computerModel === model && (g.computerSerial ?? '') === (serial ?? ''));
  return ownPhoto(piece?.photoId);
}
