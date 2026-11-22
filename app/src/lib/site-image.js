// @ts-check
// The map behind the header of a dive (spec, "Dive detail, site map behind the
// header"): the base map of the Sites screen, drawn off screen as a picture and
// kept on the device. The pictures are prepared ahead, on Wi-Fi, so that a site
// shows at once, offline too.
import { BenthicCore } from 'benthic-core';
import { cachedSites } from './core-cache.js';
import { loadMapLibre } from './maplibre.js';
import { buildMapStyle } from './map-style.js';
import { onTileOrigin } from './offline-tiles.js';

const CACHE = 'od-site-maps-v4';
const ZOOM = 12;
/** The picture, centred on the site, CSS pixels: wide enough for any screen, cropped when shown. */
export const DRAW_WIDTH = 1000;
export const HALF_HEIGHT = 300;
/** Longer than this for one site, the map is not coming. */
const TIMEOUT_MS = 20000;
/**
 * OpenFreeMap's terms allow offline downloads of 3,000 tiles or 50 MB at most,
 * with 4 requests at a time (offline-tiles.js holds that limit for every tile
 * asked of the network). A site's picture needs about 6 to 12 tiles of zoom 12,
 * at 100 KB at the very most: counted after each site, a run stops at 300 tiles
 * plus the last site (about 312 tiles, 31 MB), a tenth of the 3,000 tiles; the
 * rest follows at the next load of the logbook.
 */
const MAX_TILES_PER_RUN = 300;
const PAUSE_MS = 200;

/** @param {number} latUdeg @param {number} lonUdeg */
const keyOf = (latUdeg, lonUdeg) => `https://localhost/site-map/${latUdeg}/${lonUdeg}`;

let drawers = 0;

/**
 * An off-screen map that draws one site after the other. The tiles come from a
 * downloaded package, else the network (see map-style.js).
 * @param {() => void} [onTile] called for each tile asked of the network
 * @param {{ width: number, height: number }} [size] CSS pixels of the picture
 */
async function createDrawer(onTile, size = { width: DRAW_WIDTH, height: HALF_HEIGHT * 2 }) {
  const module = await loadMapLibre();
  /** @type {typeof import('maplibre-gl')} */
  const maplibregl = /** @type {any} */ (module).default ?? module;
  const channel = `draw${++drawers}`;
  const { style, degraded } = await buildMapStyle(maplibregl, channel);
  // A picture is kept as the site's map only when nothing was missing.
  let missing = 0;
  const stopListening = onTileOrigin(channel, (origin) => {
    if (origin === 'online') onTile?.();
    else if (origin === 'missing') missing++;
  });
  const container = document.createElement('div');
  container.style.cssText = `position:fixed;left:-${size.width + 100}px;top:0;width:${size.width}px;height:${size.height}px`;
  document.body.append(container);
  const map = new maplibregl.Map({
    container,
    style,
    center: [0, 0],
    zoom: ZOOM,
    pixelRatio: 2,
    interactive: false,
    attributionControl: false,
    fadeDuration: 0,
    canvasContextAttributes: { preserveDrawingBuffer: true },
  });
  const close = () => {
    stopListening();
    map.remove();
    container.remove();
  };
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Site map: timeout')), TIMEOUT_MS);
      map.once('error', (e) => {
        clearTimeout(timer);
        reject(e.error ?? new Error('Site map'));
      });
      map.once('load', () => {
        clearTimeout(timer);
        resolve(undefined);
      });
    });
  } catch (e) {
    close();
    throw e;
  }
  // No place names: they would run under the text of the header.
  for (const layer of map.getStyle().layers) {
    if (layer.type === 'symbol') map.setLayoutProperty(layer.id, 'visibility', 'none');
  }

  /**
   * The picture of a site, and whether it is complete (worth keeping): not
   * when the simplified map was used or a tile could not be had.
   * @param {number} latUdeg
   * @param {number} lonUdeg
   * @returns {Promise<{ blob: Blob, complete: boolean }>}
   */
  function draw(latUdeg, lonUdeg) {
    missing = 0;
    return new Promise((resolve, reject) => {
      /** @param {{ error?: Error }} e */
      const failed = (e) => done(() => reject(e.error ?? new Error('Site map')));
      /** @param {() => void} then */
      const done = (then) => {
        clearTimeout(timer);
        map.off('error', failed);
        then();
      };
      const timer = setTimeout(() => done(() => reject(new Error('Site map: timeout'))), TIMEOUT_MS);
      map.on('error', failed);
      map.once('idle', () =>
        done(() =>
          map
            .getCanvas()
            .toBlob((blob) => (blob ? resolve({ blob, complete: !degraded && missing === 0 }) : reject(new Error('Site map: no picture'))), 'image/webp', 0.8),
        ),
      );
      map.jumpTo({ center: [lonUdeg / 1e6, latUdeg / 1e6] });
      map.triggerRepaint();
    });
  }

  /**
   * A picture framing several points (the map strips of « Nettoyer les sites »),
   * and where each point falls on it, CSS pixels.
   * @param {[number, number][]} points [lon, lat]
   * @param {{ top: number, right: number, bottom: number, left: number }} padding
   * @param {number} [maxZoom]
   * @returns {Promise<{ blob: Blob, xy: [number, number][] }>}
   */
  function drawFraming(points, padding, maxZoom = 18) {
    return new Promise((resolve, reject) => {
      /** @param {{ error?: Error }} e */
      const failed = (e) => done(() => reject(e.error ?? new Error('Map strip')));
      /** @param {() => void} then */
      const done = (then) => {
        clearTimeout(timer);
        map.off('error', failed);
        then();
      };
      const timer = setTimeout(() => done(() => reject(new Error('Map strip: timeout'))), TIMEOUT_MS);
      map.on('error', failed);
      map.once('idle', () =>
        done(() => {
          const xy = points.map((p) => {
            const at = map.project(p);
            return /** @type {[number, number]} */ ([at.x, at.y]);
          });
          map.getCanvas().toBlob((blob) => (blob ? resolve({ blob, xy }) : reject(new Error('Map strip: no picture'))), 'image/webp', 0.8);
        }),
      );
      const bounds = points.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(points[0], points[0]));
      map.fitBounds(bounds, { padding, maxZoom, animate: false });
      map.triggerRepaint();
    });
  }

  return { draw, drawFraming, close };
}

// --- Map strips (task 2026-11-14-148) ---
//
// Pictures framing a few points, drawn one after the other by one off-screen
// map per size: a page of duplicates never holds a live map per group.

/** @type {Map<string, Promise<Awaited<ReturnType<typeof createDrawer>>>>} */
const stripDrawers = new Map();
let stripQueue = Promise.resolve();
/** @type {ReturnType<typeof setTimeout>|undefined} */
let stripIdle;

/**
 * A map picture framing the points, with where each falls on it. Not kept: the
 * caller frees the address (URL.revokeObjectURL).
 * @param {[number, number][]} points [lon, lat]
 * @param {{ width: number, height: number }} size CSS pixels
 * @param {{ top: number, right: number, bottom: number, left: number }} padding
 * @param {number} [maxZoom] the closest the picture may be (18 by default)
 * @returns {Promise<{ url: string, xy: [number, number][] }>}
 */
export function mapStrip(points, size, padding, maxZoom = 18) {
  const key = `${Math.round(size.width)}x${Math.round(size.height)}`;
  const run = stripQueue.then(async () => {
    clearTimeout(stripIdle);
    let drawer = stripDrawers.get(key);
    if (!drawer) {
      drawer = createDrawer(undefined, size);
      stripDrawers.set(key, drawer);
    }
    const { blob, xy } = await (await drawer).drawFraming(points, padding, maxZoom);
    return { url: URL.createObjectURL(blob), xy };
  });
  // The next one waits for this one, failed or not; the maps go after a pause.
  stripQueue = run.then(
    () => {},
    () => {},
  ).then(() => {
    clearTimeout(stripIdle);
    stripIdle = setTimeout(closeStripDrawers, 5000);
  });
  return run;
}

function closeStripDrawers() {
  for (const drawer of stripDrawers.values()) drawer.then((d) => d.close(), () => {});
  stripDrawers.clear();
}

/** @param {Cache|null} cache @param {string} key @param {Blob} blob */
async function keep(cache, key, blob) {
  await cache?.put(key, new Response(blob, { headers: { 'Content-Type': blob.type } }));
}

const openCache = async () => (typeof caches === 'undefined' ? null : caches.open(CACHE));

/**
 * The map's picture as a local address, from the device or drawn and kept. The
 * caller frees it (URL.revokeObjectURL).
 * @param {number} latUdeg
 * @param {number} lonUdeg
 */
export async function loadSiteMap(latUdeg, lonUdeg) {
  const cache = await openCache();
  const key = keyOf(latUdeg, lonUdeg);
  const kept = await cache?.match(key);
  if (kept) return URL.createObjectURL(await kept.blob());
  const drawer = await createDrawer();
  try {
    const { blob, complete } = await drawer.draw(latUdeg, lonUdeg);
    if (complete) await keep(cache, key, blob);
    return URL.createObjectURL(blob);
  } finally {
    drawer.close();
  }
}

// --- The pictures of the dives around the one shown, ready in memory ---
//
// A swipe to the next or previous dive must find its picture at once: read
// from the device (or drawn), then decoded, before the swipe. The last few are
// kept as local addresses shared by every header; one that falls out is freed
// (an image already on screen stays drawn).

const SHARED_MAX = 6;
/** @type {Map<string, string>} key → local address, the most recent last */
const shared = new Map();
/** @type {Map<string, Promise<string>>} */
const loading = new Map();

/**
 * The picture of a site if it is ready in memory, at once; else null.
 * @param {number} latUdeg @param {number} lonUdeg
 */
export function readySiteMap(latUdeg, lonUdeg) {
  return shared.get(keyOf(latUdeg, lonUdeg)) ?? null;
}

/**
 * The picture of a site, kept in memory and decoded. Not to be freed by the caller.
 * @param {number} latUdeg @param {number} lonUdeg
 * @returns {Promise<string>}
 */
export function sharedSiteMap(latUdeg, lonUdeg) {
  const key = keyOf(latUdeg, lonUdeg);
  const ready = shared.get(key);
  if (ready) {
    shared.delete(key);
    shared.set(key, ready);
    return Promise.resolve(ready);
  }
  let promise = loading.get(key);
  if (!promise) {
    promise = loadSiteMap(latUdeg, lonUdeg)
      .then(async (url) => {
        const image = new Image();
        image.src = url;
        // Decoded now, not during the swipe.
        await image.decode().catch(() => {});
        shared.set(key, url);
        while (shared.size > SHARED_MAX) {
          const [oldest, address] = shared.entries().next().value;
          shared.delete(oldest);
          URL.revokeObjectURL(address);
        }
        return url;
      })
      .finally(() => loading.delete(key));
    loading.set(key, promise);
  }
  return promise;
}

/** Never on mobile data, nor with the app in the background. */
async function canPrepare() {
  if (document.hidden || !navigator.onLine) return false;
  return BenthicCore.networkStatus().then(
    (status) => status.wifi,
    () => false,
  );
}

let running = false;

/** Prepares the pictures still missing, the sites of the latest dives first. */
async function prepareSiteMaps() {
  if (running) return;
  running = true;
  /** @type {Awaited<ReturnType<typeof createDrawer>>|undefined} */
  let drawer;
  let tiles = 0;
  try {
    const cache = await openCache();
    if (!cache || !(await canPrepare())) return;
    /** @type {{ hasLocation: boolean, latUdeg: number, lonUdeg: number, dives: number, lastDate: string }[]} */
    const sites = await cachedSites();
    const wanted = sites.filter((s) => s.hasLocation && s.dives > 0).sort((a, b) => (b.lastDate ?? '').localeCompare(a.lastDate ?? ''));
    for (const site of wanted) {
      const key = keyOf(site.latUdeg, site.lonUdeg);
      if (await cache.match(key)) continue;
      if (tiles >= MAX_TILES_PER_RUN || !(await canPrepare())) break;
      drawer ??= await createDrawer(() => tiles++);
      const { blob, complete } = await drawer.draw(site.latUdeg, site.lonUdeg);
      if (!complete) break; // the map server does not answer: the next load tries again
      await keep(cache, key, blob);
      await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
    }
  } catch (e) {
    // The map server is unavailable: the next load tries again.
    console.warn('Preparing the site maps', e);
  } finally {
    drawer?.close();
    running = false;
  }
}

/** @type {ReturnType<typeof setTimeout>|undefined} */
let timer;

/** After the logbook is loaded, once the start-up is over. */
export function schedulePreparingSiteMaps() {
  clearTimeout(timer);
  timer = setTimeout(prepareSiteMaps, 8000);
}
