// @ts-check
// The base map shared by the Sites map and the map behind a dive's header.
//
// Tiles come from OpenFreeMap online (map-tiles.js); with no network, the
// simplified world map shipped with the app (land and coasts only) is drawn.
import { language } from './i18n.js';
import { TILE_PROTOCOL, TILE_MAX_ZOOM, registerTileProtocol } from './map-tiles.js';

// Coloured base map (Christian's choice): water, land use and relief read at
// a glance, which helps place a dive site. OpenFreeMap's vector tiles, from
// OpenStreetMap data.
export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const STYLE_TIMEOUT_MS = 8000;

/** @param {string} name */
const colour = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/**
 * The style simplified for use without the network: sea and land from the
 * world map. No place names: their fonts are online.
 * @returns {Promise<import('maplibre-gl').StyleSpecification>}
 */
async function offlineStyle() {
  const world = (await import('../assets/world-land.json')).default;
  const sea = colour('--bc-map-sea') || '#D3E0EC';
  const landLow = colour('--bc-map-land-low') || '#EDECE7';
  return {
    version: 8,
    sources: {
      world: { type: 'geojson', data: /** @type {any} */ (world) },
    },
    layers: [
      { id: 'sea', type: 'background', paint: { 'background-color': sea } },
      { id: 'world-land', type: 'fill', source: 'world', paint: { 'fill-color': landLow, 'fill-antialias': true } },
    ],
  };
}

/**
 * The online style (OpenFreeMap's Liberty) with its tiles read through the
 * network.
 * @param {string} channel
 * @returns {Promise<import('maplibre-gl').StyleSpecification>}
 */
async function onlineStyle(channel) {
  const response = await fetch(MAP_STYLE, { signal: AbortSignal.timeout(STYLE_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Map style: HTTP ${response.status}`);
  const style = await response.json();
  for (const source of Object.values(style.sources)) {
    const s = /** @type {any} */ (source);
    if (s.type === 'vector' && typeof s.url === 'string' && s.url.startsWith('https://tiles.openfreemap.org/planet')) {
      delete s.url;
      s.tiles = [`${TILE_PROTOCOL}://${channel}/{z}/{x}/{y}`];
      s.minzoom = 0;
      s.maxzoom = TILE_MAX_ZOOM;
    }
  }
  return style;
}

/**
 * The style to give MapLibre. `degraded` when it is the simplified one (no
 * network for the style): a picture drawn with it is not kept as the site's map.
 * @param {typeof import('maplibre-gl')} maplibregl
 * @param {string} [channel] names the map asking, see map-tiles.js
 * @returns {Promise<{ style: import('maplibre-gl').StyleSpecification, degraded: boolean }>}
 */
export async function buildMapStyle(maplibregl, channel = 'map') {
  registerTileProtocol(maplibregl);
  if (navigator.onLine) {
    try {
      return { style: await onlineStyle(channel), degraded: false };
    } catch (e) {
      console.warn('Map style', e);
    }
  }
  return { style: await offlineStyle(), degraded: true };
}

/**
 * Place names in the app's language, else in Latin script, else local.
 * @param {import('maplibre-gl').Map} map
 */
export function showLabelsInLanguage(map) {
  for (const layer of map.getStyle().layers) {
    if (layer.type === 'symbol' && map.getLayoutProperty(layer.id, 'text-field')) {
      map.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', `name:${language}`], ['get', 'name:latin'], ['get', 'name']]);
    }
  }
}
