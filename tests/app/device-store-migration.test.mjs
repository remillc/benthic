// The rename to Benthic (22 November 2026): the device-store keys "od.<name>" become "bc.<name>" once, the key named
// after the old paid offer becomes "bc.benthicPlusSubscribed", the two caches kept in localStorage move too, and a
// second start finds nothing left to move (lib/device-store.js).
import assert from 'node:assert/strict';
import { test } from 'node:test';

/**
 * The WebView's localStorage; @capacitor/preferences keeps its values there on the web, under "CapacitorStorage.", and
 * lists them with Object.keys, so the stored entries are the object's own properties and the methods are hidden.
 */
const seed = {
  'CapacitorStorage.od.theme': 'dark',
  'CapacitorStorage.od.autoSync': 'true',
  'CapacitorStorage.bc.autoSync': 'false',
  'CapacitorStorage.od.odplusSubscribed': '1',
  'CapacitorStorage.od.storeVersion': '1',
  'od.logbookSnapshot': '{"entries":[1]}',
  'od.detailSnapshotBeta': '{"id":7}',
  'od.detailSnapshotBeta.g-21a6451e8dae': '{"id":8}',
  unrelated: 'x',
};
const localStorage = {};
const methods = {
  key: (i) => Object.keys(localStorage)[i] ?? null,
  getItem: (k) => (Object.hasOwn(localStorage, k) ? localStorage[k] : null),
  setItem: (k, v) => void (localStorage[k] = String(v)),
  removeItem: (k) => void delete localStorage[k],
  clear: () => Object.keys(localStorage).forEach((k) => delete localStorage[k]),
};
for (const [name, fn] of Object.entries(methods)) Object.defineProperty(localStorage, name, { value: fn, enumerable: false });
Object.defineProperty(localStorage, 'length', { get: () => Object.keys(localStorage).length, enumerable: false });
Object.assign(localStorage, seed);
const stored = { get: (k) => localStorage.getItem(k), has: (k) => localStorage.getItem(k) !== null, keys: () => Object.keys(localStorage), entries: () => Object.entries(localStorage) };
globalThis.localStorage = localStorage;
globalThis.window = { localStorage };

const { deviceStore, loadDeviceStore, renamedKey } = await import('../../app/src/lib/device-store.js');

test('the new name of an old key', () => {
  assert.equal(renamedKey('od.theme'), 'bc.theme');
  assert.equal(renamedKey('od.odplusSubscribed'), 'bc.benthicPlusSubscribed');
  assert.equal(renamedKey('bc.theme'), null);
  assert.equal(renamedKey('other'), null);
});

test('the old keys are copied to the new names, then deleted; a value already under the new name wins', async () => {
  await loadDeviceStore();
  assert.equal(deviceStore.getItem('bc.theme'), 'dark');
  assert.equal(deviceStore.getItem('bc.autoSync'), 'false');
  assert.equal(deviceStore.getItem('bc.benthicPlusSubscribed'), '1');
  assert.equal(deviceStore.getItem('bc.storeVersion'), '1');
  assert.throws(() => deviceStore.getItem('od.theme'), /Not a setting/);
  const left = stored.keys().filter((k) => k.startsWith('CapacitorStorage.od.'));
  assert.deepEqual(left, [], 'no old key is left in the system storage');
  assert.equal(stored.get('CapacitorStorage.bc.theme'), 'dark');
  assert.equal(stored.get('CapacitorStorage.bc.benthicPlusSubscribed'), '1');
});

test('the caches kept in localStorage move to the new names', () => {
  assert.equal(stored.get('bc.logbookSnapshot'), '{"entries":[1]}');
  assert.equal(stored.get('bc.detailSnapshotBeta'), '{"id":7}');
  assert.equal(stored.get('bc.detailSnapshotBeta.g-21a6451e8dae'), '{"id":8}', 'the cache of a named logbook too');
  assert.equal(stored.has('od.logbookSnapshot'), false);
  assert.equal(stored.has('od.detailSnapshotBeta'), false);
  assert.equal(stored.get('unrelated'), 'x', 'what is not ours is left alone');
});

test('a second start changes nothing', async () => {
  const before = JSON.stringify(stored.entries());
  await loadDeviceStore();
  assert.equal(JSON.stringify(stored.entries()), before);
  assert.equal(deviceStore.getItem('bc.theme'), 'dark');
});
