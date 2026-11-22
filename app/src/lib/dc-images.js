// @ts-check
// The pictures of dive computers (docs/architecture.md, section 12; tasks 2026-11-19-302 and 303). They are free
// for everyone: fetched from the OpenDives server on demand, without an account, then kept on the device for good
// and shown offline from then on. Nothing is bundled in the app. A model without a picture, or a download that
// fails, gives null and the caller shows the generic computer icon.
//
// One interface, whatever the system: `computerImage(model)` resolves to an address an <img> can show, or null.
//  - Android and iOS: the files live in the app's data directory (@capacitor/filesystem, Directory.Data) and are
//    shown through Capacitor.convertFileSrc;
//  - desktop and browser: the bytes live in IndexedDB (the same store the web view keeps for good) and are shown
//    as data addresses.
// The catalog (which models have a picture) is kept the same way and refreshed at most once a day when online.
// The only setting, the time of the last refresh, goes through device-store.js.
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { deviceStore } from './device-store.js';
import { serverUrl } from './server-url.js';
import { serverTransport } from './server-transport.js';
import { imageEntry } from './dc-model.js';

/** @typedef {import('./dc-model.js').CatalogEntry} CatalogEntry */

const REFRESH_KEY = 'od.dcImagesCatalogAt';
const DAY_MS = 24 * 60 * 60 * 1000;
/** A failed fetch is not tried again before this. */
const RETRY_MS = 5 * 60 * 1000;
const DB_NAME = 'od-dc-images';

/**
 * Where the files are kept.
 * @typedef {{
 *   getText: (name: string) => Promise<string|null>,
 *   putText: (name: string, text: string) => Promise<void>,
 *   imageUrl: (name: string) => Promise<string|null>,
 *   putImage: (name: string, base64: string) => Promise<void>,
 * }} Storage
 */

/** @returns {Storage} files in the app's data directory */
function nativeStorage() {
  const load = async () => {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    return { Filesystem, directory: Directory.Data, Encoding };
  };
  return {
    async getText(name) {
      const { Filesystem, directory, Encoding } = await load();
      try {
        const r = await Filesystem.readFile({ path: `dc-images/${name}`, directory, encoding: Encoding.UTF8 });
        return typeof r.data === 'string' ? r.data : null;
      } catch {
        return null;
      }
    },
    async putText(name, text) {
      const { Filesystem, directory, Encoding } = await load();
      await Filesystem.writeFile({ path: `dc-images/${name}`, directory, data: text, encoding: Encoding.UTF8, recursive: true });
    },
    async imageUrl(name) {
      const { Filesystem, directory } = await load();
      try {
        await Filesystem.stat({ path: `dc-images/${name}`, directory });
        const { uri } = await Filesystem.getUri({ path: `dc-images/${name}`, directory });
        return Capacitor.convertFileSrc(uri);
      } catch {
        return null;
      }
    },
    async putImage(name, base64) {
      const { Filesystem, directory } = await load();
      await Filesystem.writeFile({ path: `dc-images/${name}`, directory, data: base64, recursive: true });
    },
  };
}

/** @returns {Storage} entries in IndexedDB */
function databaseStorage() {
  /** @type {Promise<IDBDatabase>|null} */
  let opened = null;
  const open = () =>
    (opened ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('files');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }));
  /** @param {string} name @returns {Promise<string|null>} */
  const get = async (name) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const request = db.transaction('files').objectStore('files').get(name);
      request.onsuccess = () => resolve(typeof request.result === 'string' ? request.result : null);
      request.onerror = () => reject(request.error);
    });
  };
  /** @param {string} name @param {string} value @returns {Promise<void>} */
  const put = async (name, value) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite');
      tx.objectStore('files').put(value, name);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  };
  return {
    getText: get,
    putText: put,
    imageUrl: async (name) => {
      const base64 = await get(name);
      return base64 ? `data:image/webp;base64,${base64}` : null;
    },
    putImage: put,
  };
}

/** @type {Storage|null} */
let storage = null;
/** @returns {Storage} */
const files = () => (storage ??= Capacitor.isNativePlatform() ? nativeStorage() : databaseStorage());

/** @type {Promise<CatalogEntry[]>|null} */
let catalogPromise = null;
/** The catalog once loaded, so that a tile knows at once whether its model has a picture. @type {CatalogEntry[]|null} */
let catalogNow = null;
/** @type {Map<string, Promise<{ src: string|null, cached: boolean }>>} */
const imagePromises = new Map();
/** @type {Map<string, number>} */
const failures = new Map();

/** For the tests: replaces the storage and forgets what was loaded. @param {Storage|null} replacement */
export function useStorage(replacement) {
  storage = replacement;
  catalogPromise = null;
  catalogNow = null;
  imagePromises.clear();
  failures.clear();
}

/** @param {Blob} blob @returns {Promise<string>} the bytes as base64 */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * A picture from the server as base64, through the way each system reaches it (the server sends no CORS headers).
 * @param {string} url
 * @returns {Promise<string|null>} null when the server does not have it
 */
async function downloadBase64(url) {
  const desktop = /** @type {any} */ (globalThis).benthicDesktop;
  if (desktop?.server?.request) {
    const r = await desktop.server.request({ method: 'GET', url, binary: true });
    return r.status === 200 && r.base64 ? r.base64 : null;
  }
  if (Capacitor.isNativePlatform()) {
    const r = await CapacitorHttp.request({ method: 'GET', url, headers: { Accept: 'image/webp,*/*' }, connectTimeout: 15000, readTimeout: 20000, responseType: 'blob' });
    return r.status === 200 && typeof r.data === 'string' ? r.data : null;
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  return response.ok ? blobToBase64(await response.blob()) : null;
}

/** @param {string} key */
const recentlyFailed = (key) => Date.now() - (failures.get(key) ?? 0) < RETRY_MS;

/** @returns {Promise<CatalogEntry[]|null>} the catalog from the server, kept on the device; null when unreachable */
async function refreshCatalog() {
  const base = serverUrl();
  if (!base || recentlyFailed('catalog')) return null;
  try {
    const r = await serverTransport({ method: 'GET', url: `${base}/v1/dc-images/catalog.json` });
    const list = r.status === 200 ? JSON.parse(r.text) : null;
    if (!Array.isArray(list)) throw new Error(`catalog ${r.status}`);
    await files().putText('catalog.json', r.text);
    deviceStore.setItem(REFRESH_KEY, String(Date.now()));
    return list;
  } catch (e) {
    failures.set('catalog', Date.now());
    console.info('Dive computer catalog unavailable', e);
    return null;
  }
}

/**
 * The catalog: the copy kept on the device, refreshed at most once a day when the server answers. Offline, the
 * kept copy (or an empty list) is used.
 * @returns {Promise<CatalogEntry[]>}
 */
export function getCatalog() {
  catalogPromise ??= (async () => {
    /** @type {CatalogEntry[]} */
    let kept = [];
    try {
      const text = await files().getText('catalog.json');
      if (text) kept = JSON.parse(text);
    } catch (e) {
      console.info('Kept dive computer catalog unreadable', e);
    }
    const age = Date.now() - Number(deviceStore.getItem(REFRESH_KEY) ?? 0);
    if (kept.length && age < DAY_MS) return kept;
    return (await refreshCatalog()) ?? kept;
  })().then((list) => (catalogNow = list));
  return catalogPromise;
}

/**
 * Whether a model has a picture, without waiting: its entry, null (it has none), or undefined (the catalog is not
 * loaded yet).
 * @param {string|null|undefined} model
 * @param {string} [vendor]
 * @returns {CatalogEntry|null|undefined}
 */
export function knownImageEntry(model, vendor = '') {
  return catalogNow ? imageEntry(catalogNow, model, vendor) : undefined;
}

/** Forgets the pauses after failures, e.g. when the device is back online: the next ask goes to the server. */
export function forgetFailures() {
  failures.clear();
  if (catalogNow && !catalogNow.length) {
    catalogPromise = null;
    catalogNow = null;
  }
}

/**
 * The picture of a catalog entry at 128 or 512 px: the kept file, else fetched once and kept for good.
 * `cached` tells whether the device already had it (so no fade is needed when it is shown).
 * @param {CatalogEntry} entry
 * @param {128|512} size
 * @returns {Promise<{ src: string|null, cached: boolean }>}
 */
export function entryImage(entry, size) {
  const name = `${size}/${entry.slug}.webp`;
  const known = imagePromises.get(name);
  if (known) return known;
  const promise = (async () => {
    const kept = await files().imageUrl(name);
    if (kept) return { src: kept, cached: true };
    const base = serverUrl();
    if (!base || recentlyFailed(name)) return { src: null, cached: false };
    try {
      const base64 = await downloadBase64(`${base}/v1/dc-images/${name}`);
      if (!base64) throw new Error('not on the server');
      await files().putImage(name, base64);
      return { src: await files().imageUrl(name), cached: false };
    } catch (e) {
      failures.set(name, Date.now());
      console.info('Dive computer image unavailable', name, e);
      return { src: null, cached: false };
    }
  })();
  imagePromises.set(name, promise);
  // A failure is not remembered here: the next ask tries again once the pause is over.
  promise.then((r) => r.src || imagePromises.delete(name));
  return promise;
}

/**
 * The picture of a computer model, with whether the device already had it; src is null for no picture, or when
 * offline and never fetched.
 * @param {string|null|undefined} model the text Subsurface keeps, such as "Shearwater Perdix AI"
 * @param {128|512} [size]
 * @param {string} [vendor] when the vendor is known apart from the model
 * @returns {Promise<{ src: string|null, cached: boolean }>}
 */
export async function loadComputerImage(model, size = 128, vendor = '') {
  if (!model) return { src: null, cached: false };
  const entry = imageEntry(await getCatalog(), model, vendor);
  return entry ? entryImage(entry, size) : { src: null, cached: false };
}

/**
 * The picture of a computer model as an address to show, or null.
 * @param {string|null|undefined} model
 * @param {128|512} [size]
 * @param {string} [vendor]
 * @returns {Promise<string|null>}
 */
export async function computerImage(model, size = 128, vendor = '') {
  return (await loadComputerImage(model, size, vendor)).src;
}

/**
 * Which size to fetch for a tile of `css` pixels on this screen: 128 px is enough up to 128 device pixels.
 * @param {number} css
 * @returns {128|512}
 */
export function sizeFor(css) {
  const ratio = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
  return css * ratio <= 128 ? 128 : 512;
}
