// The settings of this device are kept in one place, the same way (lib/device-store.js).
import assert from 'node:assert/strict';
import { test } from 'node:test';

// The values the app kept in the WebView's localStorage before the move.
const old = new Map([
  ['bc.appSettings', '{"language":"fr"}'],
  ['bc.autoSync', 'false'],
  ['bc.logbookSnapshot', '{"entries":[1]}'],
  ['other', 'x'],
]);
globalThis.localStorage = {
  get length() {
    return old.size;
  },
  key: (i) => [...old.keys()][i] ?? null,
  getItem: (k) => old.get(k) ?? null,
  setItem: (k, v) => old.set(k, String(v)),
  removeItem: (k) => old.delete(k),
};

const { deviceStore, loadDeviceStore, NOT_SETTINGS } = await import('../../app/src/lib/device-store.js');

test('the settings kept before are found after loading; the snapshot and foreign keys are not settings', async () => {
  await loadDeviceStore();
  assert.equal(deviceStore.getItem('bc.appSettings'), '{"language":"fr"}');
  assert.equal(deviceStore.getItem('bc.autoSync'), 'false');
  assert.ok(NOT_SETTINGS.has('bc.logbookSnapshot'));
  assert.throws(() => deviceStore.getItem('bc.logbookSnapshot'), /Not a setting/);
  assert.throws(() => deviceStore.getItem('other'), /Not a setting/);
});

test('written and read the same way, as text', () => {
  deviceStore.setItem('bc.sitesSort', 'recent');
  assert.equal(deviceStore.getItem('bc.sitesSort'), 'recent');
  deviceStore.setItem('bc.count', /** @type {any} */ (3));
  assert.equal(deviceStore.getItem('bc.count'), '3');
  deviceStore.removeItem('bc.count');
  assert.equal(deviceStore.getItem('bc.count'), null);
  assert.throws(() => deviceStore.setItem('sort', 'x'), /Not a setting/, 'every key is "bc.<name>"');
});

test('a confirmed setting is persisted before its in-memory value changes', async () => {
  globalThis.window = { localStorage: globalThis.localStorage };
  await loadDeviceStore();
  await deviceStore.setItemConfirmed('bc.logbookName', 'My dives');
  assert.equal(deviceStore.getItem('bc.logbookName'), 'My dives');
  const setItem = globalThis.localStorage.setItem;
  globalThis.localStorage.setItem = () => { throw new Error('storage failed'); };
  try {
    await assert.rejects(deviceStore.setItemConfirmed('bc.logbookName', 'Other'), /storage failed/);
    assert.equal(deviceStore.getItem('bc.logbookName'), 'My dives');
  } finally {
    globalThis.localStorage.setItem = setItem;
    delete globalThis.window;
  }
});
