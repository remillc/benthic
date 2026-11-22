// @ts-check
// A small file store for the data the app keeps in its own working copy and that follows the Benthic logbook
// format (docs/architecture.md, section 11.3): JSON files under paths such as `gear/<id>.json`. It is the one door
// to that data, so that the same code can later be synchronised with the Benthic server file by file.
//
// Why not device-store.js: that module is for settings (small texts in the system's preferences). Why not a
// file in the app's data directory: it needs a Capacitor file plugin the app does not have yet (to be decided
// by the project owner); until then the files live in IndexedDB, behind this abstraction, and the backend can be
// swapped without touching the callers. The WebView is asked to keep that storage (`navigator.storage.persist()`).
//
// The contract of a backend (paths are text, contents are text):
//  - get(path) -> text|null; list(prefix) -> paths that start with prefix;
//  - apply(writes, removes): all the changes or none (one transaction), so a crash never leaves half a change.
//  - applyTracked(writes, removes): apply changes and add their paths to meta/pending.json in the same transaction.
//  - snapshotPending() / acknowledgePending(snapshot): capture and acknowledge unchanged pending files atomically.

/**
 * @typedef {Object} FileBackend
 * @property {(path: string) => Promise<string|null>} get
 * @property {(prefix: string) => Promise<string[]>} list
 * @property {(writes: [string, string][], removes: string[]) => Promise<void>} apply
 * @property {(writes: [string, string][], removes: string[]) => Promise<void>} applyTracked
 * @property {() => Promise<[string, string|null][]>} snapshotPending
 * @property {(snapshot: [string, string|null][]) => Promise<void>} acknowledgePending
 */

const PENDING = 'meta/pending.json';

/** @param {string|null|undefined} text */
function parsePending(text) {
  const pending = text == null ? { format: 1, paths: [] } : JSON.parse(text);
  if (!pending || typeof pending !== 'object' || Array.isArray(pending) || pending.format !== 1
      || !Array.isArray(pending.paths) || !pending.paths.every((/** @type {unknown} */ p) => typeof p === 'string')) {
    throw new Error('INVALID_PENDING_DATA');
  }
  return pending;
}

/** @param {string|null|undefined} text @param {string[]} changed */
function addPending(text, changed) {
  const pending = parsePending(text);
  return sortedJson({ ...pending, paths: [...new Set([...pending.paths, ...changed])].sort() });
}

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
      const out = Object.create(null);
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
    async applyTracked(writes, removes) {
      const pending = addPending(files.get(PENDING), [...writes.map(([p]) => p), ...removes]);
      for (const [path, text] of writes) files.set(path, text);
      for (const path of removes) files.delete(path);
      files.set(PENDING, pending);
    },
    async snapshotPending() {
      return parsePending(files.get(PENDING)).paths.map((/** @type {string} */ path) => [path, files.get(path) ?? null]);
    },
    async acknowledgePending(snapshot) {
      const pending = parsePending(files.get(PENDING));
      const acknowledged = new Set(snapshot.filter(([path, text]) => (files.get(path) ?? null) === text).map(([path]) => path));
      files.set(PENDING, sortedJson({ ...pending, paths: pending.paths.filter((/** @type {string} */ path) => !acknowledged.has(path)) }));
    },
  };
}

const DB_NAME = 'benthic-files';
const STORE = 'files';
/** The database's name before the rename to Benthic (22 November 2026). */
const LEGACY_DB_NAME = 'opendives-files';

/** @template T @param {IDBRequest<T>} request @returns {Promise<T>} */
const done = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

/**
 * Moves the files of the database kept under the old name to the new one, once: every file the new database does
 * not have yet is copied, then the old database is deleted. Nothing happens when there is no old database (or the
 * system cannot list the databases), so it is safe to run at each opening.
 * @param {IDBFactory} factory
 * @returns {Promise<number>} the files copied
 */
export async function migrateLegacyFilesDatabase(factory) {
  if (typeof factory.databases !== 'function') return 0;
  const names = (await factory.databases()).map((d) => d.name);
  if (!names.includes(LEGACY_DB_NAME)) return 0;
  const old = await done(factory.open(LEGACY_DB_NAME));
  /** @type {[string, unknown][]} */
  let files = [];
  try {
    if (old.objectStoreNames.contains(STORE)) {
      const store = old.transaction(STORE, 'readonly').objectStore(STORE);
      const [keys, values] = await Promise.all([done(store.getAllKeys()), done(store.getAll())]);
      files = keys.map((key, i) => [String(key), values[i]]);
    }
  } finally {
    old.close();
  }
  const request = factory.open(DB_NAME, 1);
  request.onupgradeneeded = () => request.result.createObjectStore(STORE);
  const db = await done(request);
  let copied = 0;
  try {
    const present = new Set((await done(db.transaction(STORE, 'readonly').objectStore(STORE).getAllKeys())).map(String));
    const missing = files.filter(([path]) => !present.has(path));
    if (missing.length) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        for (const [path, value] of missing) store.put(value, path);
        tx.oncomplete = () => resolve(undefined);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    }
    copied = missing.length;
  } finally {
    db.close();
  }
  await done(factory.deleteDatabase(LEGACY_DB_NAME));
  return copied;
}

/**
 * A backend in IndexedDB: one object store, the path as the key. `apply` is one read-write transaction.
 * @param {IDBFactory} [factory]
 * @returns {FileBackend}
 */
export function indexedDbBackend(factory = globalThis.indexedDB) {
  /** @type {Promise<IDBDatabase>|null} */
  let opened = null;
  const open = () =>
    (opened ??= migrateLegacyFilesDatabase(factory)
      .catch((e) => console.error('Moving the files of the previous database', e))
      .then(
        () =>
          new Promise((resolve, reject) => {
            const request = factory.open(DB_NAME, 1);
            request.onupgradeneeded = () => request.result.createObjectStore(STORE);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          }),
      ));
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
    async applyTracked(writes, removes) {
      const db = await open();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        /** @type {unknown} */
        let failure;
        const request = store.get(PENDING);
        request.onsuccess = () => {
          try {
            const pending = addPending(request.result, [...writes.map(([p]) => p), ...removes]);
            for (const [path, text] of writes) store.put(text, path);
            for (const path of removes) store.delete(path);
            store.put(pending, PENDING);
          } catch (error) {
            failure = error;
            tx.abort();
          }
        };
        tx.oncomplete = () => resolve(undefined);
        tx.onerror = () => reject(failure ?? tx.error);
        tx.onabort = () => reject(failure ?? tx.error);
      });
    },
    async snapshotPending() {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const store = tx.objectStore(STORE);
        /** @type {[string, string|null][]} */
        const snapshot = [];
        /** @type {unknown} */
        let failure;
        const request = store.get(PENDING);
        request.onsuccess = () => {
          try {
            for (const path of parsePending(request.result).paths) {
              const entry = store.get(path);
              entry.onsuccess = () => snapshot.push([path, entry.result ?? null]);
            }
          } catch (error) {
            failure = error;
            tx.abort();
          }
        };
        tx.oncomplete = () => resolve(snapshot);
        tx.onerror = () => reject(failure ?? tx.error);
        tx.onabort = () => reject(failure ?? tx.error);
      });
    },
    async acknowledgePending(snapshot) {
      const db = await open();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        /** @type {unknown} */
        let failure;
        const request = store.get(PENDING);
        request.onsuccess = () => {
          try {
            const pending = parsePending(request.result);
            const remaining = new Set(/** @type {string[]} */ (pending.paths));
            for (const [path, text] of snapshot) {
              const entry = store.get(path);
              entry.onsuccess = () => {
                if ((entry.result ?? null) === text) remaining.delete(path);
              };
            }
            // This request runs after the reads and writes the list in the same transaction.
            const marker = store.get(PENDING);
            marker.onsuccess = () => store.put(sortedJson({ ...pending, paths: [...remaining].sort() }), PENDING);
          } catch (error) {
            failure = error;
            tx.abort();
          }
        };
        tx.oncomplete = () => resolve(undefined);
        tx.onerror = () => reject(failure ?? tx.error);
        tx.onabort = () => reject(failure ?? tx.error);
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
    async readStrict(path) {
      const text = await backend.get(path);
      return text == null ? null : JSON.parse(text);
    },
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
    /** Changes and their pending paths in one transaction. @param {{ writes?: [string, unknown][], removes?: string[] }} changes */
    trackedBatch: ({ writes = [], removes = [] }) => backend.applyTracked(writes.map(([p, v]) => [p, sortedJson(v)]), removes),
    snapshotPending: () => backend.snapshotPending(),
    /** @param {[string, string|null][]} snapshot */
    acknowledgePending: (snapshot) => backend.acknowledgePending(snapshot),
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
