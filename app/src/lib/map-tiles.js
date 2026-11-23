// @ts-check
// Where the vector tiles of the maps come from: OpenFreeMap online, else
// nothing (the simplified world map, drawn by the style, shows through).
//
// MapLibre asks for `bctiles://<channel>/{z}/{x}/{y}`. The channel names the
// map asking (the visible map, or the off-screen drawer of site-image.js), so
// that each can follow its own tiles.
import { readTileSource } from './tilejson.js';

export const TILE_PROTOCOL = 'bctiles';
/** Highest zoom of OpenFreeMap's tiles. */
export const TILE_MAX_ZOOM = 14;
/** OpenFreeMap's terms: at most 4 tile requests at a time. */
export const MAX_PARALLEL_TILE_REQUESTS = 4;

/** @typedef {'online'|'missing'} TileOrigin */
/** @type {Map<string, Set<(origin: TileOrigin) => void>>} */
const listeners = new Map();

/**
 * Hears where each tile of a channel came from.
 * @param {string} channel
 * @param {(origin: TileOrigin) => void} listener
 * @returns {() => void} stops listening
 */
export function onTileOrigin(channel, listener) {
  let set = listeners.get(channel);
  if (!set) listeners.set(channel, (set = new Set()));
  set.add(listener);
  return () => set?.delete(listener);
}

/** @param {string} channel @param {TileOrigin} origin */
const report = (channel, origin) => listeners.get(channel)?.forEach((l) => l(origin));

/** @type {Promise<string>|undefined} OpenFreeMap's current tile address, once per session */
let templatePromise;

function onlineTemplate() {
  templatePromise ??= readTileSource().then((source) => source.template);
  templatePromise.catch(() => (templatePromise = undefined));
  return templatePromise;
}

/** Network tile requests running now, and those waiting for a place (at most 4 at a time). */
let running = 0;
/** @type {(() => void)[]} */
const waiting = [];

/**
 * Waits for one of the 4 places. Rejects if the request is cancelled while it waits.
 * @param {AbortSignal} signal
 */
async function acquire(signal) {
  if (running < MAX_PARALLEL_TILE_REQUESTS) {
    running++;
    return;
  }
  // The place is handed over by release(), which keeps `running` as it is.
  await new Promise((resolve, reject) => {
    const go = () => {
      signal.removeEventListener('abort', cancel);
      resolve(undefined);
    };
    const cancel = () => {
      const i = waiting.indexOf(go);
      if (i >= 0) waiting.splice(i, 1);
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    waiting.push(go);
    signal.addEventListener('abort', cancel, { once: true });
  });
}

function release() {
  const next = waiting.shift();
  if (next) next();
  else running--;
}

/**
 * One tile: the network, else nothing.
 * @param {string} channel
 * @param {number} z @param {number} x @param {number} y
 * @param {AbortSignal} signal
 * @returns {Promise<ArrayBuffer>}
 */
async function fetchTile(channel, z, x, y, signal) {
  if (navigator.onLine) {
    try {
      const url = (await onlineTemplate()).replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
      await acquire(signal);
      let response;
      try {
        response = await fetch(url, { signal });
        if (response.status === 404 || response.status === 204) {
          report(channel, 'online');
          return new ArrayBuffer(0);
        }
        if (!response.ok) throw new Error(`Tile: HTTP ${response.status}`);
        const data = await response.arrayBuffer();
        report(channel, 'online');
        return data;
      } finally {
        release();
      }
    } catch (e) {
      if (signal.aborted) throw e;
      report(channel, 'missing');
      throw e;
    }
  }
  report(channel, 'missing');
  return new ArrayBuffer(0);
}

let registered = false;

/**
 * Teaches MapLibre the `bctiles://` addresses. Once per page.
 * @param {typeof import('maplibre-gl')} maplibregl
 */
export function registerTileProtocol(maplibregl) {
  if (registered) return;
  registered = true;
  maplibregl.addProtocol(TILE_PROTOCOL, async (params, abortController) => {
    const [channel, z, x, y] = params.url.slice(`${TILE_PROTOCOL}://`.length).split('/');
    return { data: await fetchTile(channel, +z, +x, +y, abortController.signal) };
  });
}
