// @ts-check
// A small file store for the data the app keeps in its own working copy and that follows the OpenDives logbook
// format (docs/architecture.md, section 11.3): JSON files under paths such as `gear/<id>.json`. It is the one door
// to that data, so that the same code can later be synchronised with the OpenDives server file by file.
//
// Why not device-store.js: that module is for settings (small texts in the system's preferences). Why not a
// file in the app's data directory: it needs a Capacitor file plugin the app does not have yet (to be decided
// by the project owner); until then the files live in IndexedDB, behind this abstraction, and the backend can be
// swapped without touching the callers. The WebView is asked to keep that storage (`navigator.storage.persist()`).
//
// The contract of a backend (paths are text, contents are text):
//  - get(path) -> text|null; list(prefix) -> paths that start with prefix;
//  - apply(writes, removes): all the changes or none (one transaction), so a crash never leaves half a change.

/**
 * @typedef {Object} FileBackend
 * @property {(path: string) => Promise<string|null>} get
 * @property {(prefix: string) => Promise<string[]>} list
 * @property {(writes: [string, string][], removes: string[]) => Promise<void>} apply
 */

/**
 * JSON as the format asks: keys sorted at every level, two-space indent and a final newline, so that equal data
 * gives equal files.
 * @param {unknown} value
 * @returns {string}
 */
export function sortedJson(value) {
  /** @param {unknown} v @returns {unknown} */
  const sort = (v) => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') {
      /** @type {Record<string, unknown>} */
      const out = {};
      for (const key of Object.keys(v).sort()) {
        const item = /** @type {Record<string, unknown>} */ (v)[key];
        if (item !== undefined) out[key] = sort(item);
      }
      return out;
    }
    return v;
  };
  return `${JSON.stringify(sort(value), null, 2)}\n`;
}

/** A backend in memory: the tests, and the fallback where IndexedDB does not exist. @returns {FileBackend} */
export function memoryBackend() {
  /** @type {Map<string, string>} */
  const files = new Map();
  return {
    async get(path) {
      return files.get(path) ?? null;
    },
    async list(prefix) {
      return [...files.keys()].filter((p) => p.startsWith(prefix)).sort();
    },
    async apply(writes, removes) {
      for (const [path, text] of writes) files.set(path, text);
      for (const path of removes) files.delete(path);
    },
  };
}

const DB_NAME = 'opendives-files';
const STORE = 'files';

/**
 * A backend in IndexedDB: one object store, the path as the key. `apply` is one read-write transaction.
 * @param {IDBFactory} [factory]
 * @returns {FileBackend}
 */
export function indexedDbBackend(factory = globalThis.indexedDB) {
  /** @type {Promise<IDBDatabase>|null} */
  let opened = null;
  const open = () =>
    (opened ??= new Promise((resolve, reject) => {
      const request = factory.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }));
  /** @template T @param {IDBTransactionMode} mode @param {(s: IDBObjectStore) => IDBRequest<T>} work @returns {Promise<T>} */
  const run = async (mode, work) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const request = work(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  };
  return {
    async get(path) {
      const value = await run('readonly', (s) => s.get(path));
      return typeof value === 'string' ? value : null;
    },
    async list(prefix) {
      const keys = await run('readonly', (s) => s.getAllKeys(IDBKeyRange.bound(prefix, `${prefix}￿`)));
      return keys.map(String).sort();
    },
    async apply(writes, removes) {
      const db = await open();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        for (const [path, text] of writes) store.put(text, path);
        for (const path of removes) store.delete(path);
        tx.oncomplete = () => resolve(undefined);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    },
  };
}

/**
 * The store: JSON objects by path, over a backend.
 * @param {FileBackend} backend
 */
export function createFileStore(backend) {
  return {
    /** @param {string} path @returns {Promise<any|null>} */
    async read(path) {
      const text = await backend.get(path);
      if (text == null) return null;
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    },
    /** Every object under a folder, in path order. @param {string} folder e.g. `gear/` @returns {Promise<any[]>} */
    async readAll(folder) {
      const out = [];
      for (const path of await backend.list(folder)) {
        const value = await this.read(path);
        if (value) out.push(value);
      }
      return out;
    },
    /** @param {string} prefix */
    list: (prefix) => backend.list(prefix),
    /** @param {string} path @param {unknown} value */
    write: (path, value) => backend.apply([[path, sortedJson(value)]], []),
    /** @param {string} path */
    remove: (path) => backend.apply([], [path]),
    /** Several changes at once, all or none. @param {{ writes?: [string, unknown][], removes?: string[] }} changes */
    batch: ({ writes = [], removes = [] }) => backend.apply(writes.map(([p, v]) => [p, sortedJson(v)]), removes),
  };
}

/** @typedef {ReturnType<typeof createFileStore>} FileStore */

/** Asks the WebView to keep its storage when the system is short of space; true when it will. */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    // Not available: the storage stays best effort.
  }
  return false;
}
