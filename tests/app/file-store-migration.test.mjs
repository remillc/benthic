// The rename to Benthic (22 November 2026): the IndexedDB database "opendives-files" (the equipment, kits, profile
// and certifications) is copied into "benthic-files" once and then deleted (lib/file-store.js).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFileStore, indexedDbBackend, migrateLegacyFilesDatabase } from '../../app/src/lib/file-store.js';

/** Settles a fake request on the next turn, as IndexedDB does. */
function request(produce) {
  const r = { result: undefined, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
  queueMicrotask(() => {
    try {
      r.result = produce(r);
      r.onsuccess?.();
    } catch (e) {
      r.error = e;
      r.onerror?.();
    }
  });
  return r;
}

/** A tiny IDBFactory: databases with one object store each, `get`/`getAll`/`getAllKeys`/`put`/`delete`. */
function fakeFactory(initial = {}) {
  /** @type {Map<string, Map<string, unknown>>} */
  const dbs = new Map(Object.entries(initial).map(([name, files]) => [name, new Map(Object.entries(files))]));
  const open = (name) => ({
    objectStoreNames: { contains: () => true },
    createObjectStore() {},
    close() {},
    transaction() {
      const tx = { oncomplete: null, onerror: null, onabort: null };
      const rows = dbs.get(name);
      const sorted = () => [...rows.keys()].sort();
      tx.objectStore = () => ({
        getAllKeys: () => request(() => sorted()),
        getAll: () => request(() => sorted().map((k) => rows.get(k))),
        get: (k) => request(() => rows.get(k)),
        put: (value, key) => (rows.set(key, value), request(() => key)),
        delete: (key) => request(() => rows.delete(key)),
      });
      queueMicrotask(() => queueMicrotask(() => queueMicrotask(() => tx.oncomplete?.())));
      return tx;
    },
  });
  return {
    dbs,
    databases: async () => [...dbs.keys()].map((name) => ({ name, version: 1 })),
    open(name) {
      return request((r) => {
        const created = !dbs.has(name);
        if (created) dbs.set(name, new Map());
        const db = open(name);
        if (created) {
          const save = r.onupgradeneeded;
          r.result = db;
          save?.();
        }
        return db;
      });
    },
    deleteDatabase: (name) => request(() => dbs.delete(name) && undefined),
  };
}

test('the files of the old database are copied to the new one, then the old one is deleted', async () => {
  const factory = fakeFactory({ 'opendives-files': { 'gear/a.json': '{"id":"a"}', 'kits/k.json': '{"id":"k"}' } });
  assert.equal(await migrateLegacyFilesDatabase(factory), 2);
  assert.deepEqual([...factory.dbs.keys()], ['benthic-files']);
  assert.deepEqual([...factory.dbs.get('benthic-files')].sort(), [['gear/a.json', '{"id":"a"}'], ['kits/k.json', '{"id":"k"}']]);
});

test('a file already in the new database is kept, and a second run finds nothing to do', async () => {
  const factory = fakeFactory({ 'opendives-files': { 'gear/a.json': 'old', 'gear/b.json': 'b' }, 'benthic-files': { 'gear/a.json': 'new' } });
  assert.equal(await migrateLegacyFilesDatabase(factory), 1);
  assert.equal(factory.dbs.get('benthic-files').get('gear/a.json'), 'new');
  assert.equal(factory.dbs.get('benthic-files').get('gear/b.json'), 'b');
  assert.equal(factory.dbs.has('opendives-files'), false);
  assert.equal(await migrateLegacyFilesDatabase(factory), 0);
});

test('without an old database, nothing happens; a system that cannot list databases is left alone', async () => {
  const factory = fakeFactory({ 'benthic-files': { 'gear/a.json': 'x' } });
  assert.equal(await migrateLegacyFilesDatabase(factory), 0);
  assert.equal(await migrateLegacyFilesDatabase({ ...factory, databases: undefined }), 0);
});

test('the IndexedDB backend moves the old database before its first read', async () => {
  const factory = fakeFactory({ 'opendives-files': { 'gear/z.json': '{"id":"z"}\n' } });
  const store = createFileStore(indexedDbBackend(/** @type {any} */ (factory)));
  assert.deepEqual(await store.read('gear/z.json'), { id: 'z' });
  assert.equal(factory.dbs.has('opendives-files'), false);
});
