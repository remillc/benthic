// @ts-check
// The maps of the desktop Sites section (task 2026-11-15-177): MapLibre with the app's map
// style (downloaded region, else OpenFreeMap, else the simplified world map: map-style.js).
// One place creates the map, so that the big map and the sheet's small map behave the same.
import { loadMapLibre } from './maplibre.js';
import { buildMapStyle, showLabelsInLanguage } from './map-style.js';
import { applyZoomCap } from './offline-tiles.js';

/**
 * @param {HTMLElement} container
 * @returns {Promise<{ maplibregl: typeof import('maplibre-gl'), map: import('maplibre-gl').Map }|null>} null when the container left the page meanwhile
 */
export async function createSiteMap(container) {
  const module = await loadMapLibre();
  const maplibregl = /** @type {any} */ (module).default ?? module;
  const { style } = await buildMapStyle(maplibregl);
  if (!container.isConnected) return null;
  const map = new maplibregl.Map({
    container,
    style,
    center: [0, 20],
    zoom: 1,
    attributionControl: false,
    dragRotate: false,
    pitchWithRotate: false,
  });
  map.touchZoomRotate.disableRotation();
  map.on('load', () => showLabelsInLanguage(map));
  map.on('moveend', () => applyZoomCap(map));
  return { maplibregl, map };
}

/** @param {{latUdeg: number, lonUdeg: number}} p */
export const lngLatOf = (p) => /** @type {[number, number]} */ ([p.lonUdeg / 1e6, p.latUdeg / 1e6]);

/** @param {{ lat: number, lng: number }} c @returns {{latUdeg: number, lonUdeg: number}} */
export const positionOf = (c) => ({ latUdeg: Math.round(c.lat * 1e6), lonUdeg: Math.round(c.lng * 1e6) });
