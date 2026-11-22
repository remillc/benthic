// The settings of this device are kept in one place, the same way (lib/device-store.js).
import assert from 'node:assert/strict';
import { test } from 'node:test';

// The values the app kept in the WebView's localStorage before the move.
const old = new Map([
  ['od.appSettings', '{"language":"fr"}'],
  ['od.autoSync', 'false'],
  ['od.logbookSnapshot', '{"entries":[1]}'],
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
  assert.equal(deviceStore.getItem('od.appSettings'), '{"language":"fr"}');
  assert.equal(deviceStore.getItem('od.autoSync'), 'false');
  assert.ok(NOT_SETTINGS.has('od.logbookSnapshot'));
  assert.throws(() => deviceStore.getItem('od.logbookSnapshot'), /Not a setting/);
  assert.throws(() => deviceStore.getItem('other'), /Not a setting/);
});

test('written and read the same way, as text', () => {
  deviceStore.setItem('od.sitesSort', 'recent');
  assert.equal(deviceStore.getItem('od.sitesSort'), 'recent');
  deviceStore.setItem('od.count', /** @type {any} */ (3));
  assert.equal(deviceStore.getItem('od.count'), '3');
  deviceStore.removeItem('od.count');
  assert.equal(deviceStore.getItem('od.count'), null);
  assert.throws(() => deviceStore.setItem('sort', 'x'), /Not a setting/, 'every key is "od.<name>"');
});

test('a confirmed setting is persisted before its in-memory value changes', async () => {
  globalThis.window = { localStorage: globalThis.localStorage };
  await loadDeviceStore();
  await deviceStore.setItemConfirmed('od.logbookName', 'My dives');
  assert.equal(deviceStore.getItem('od.logbookName'), 'My dives');
  const setItem = globalThis.localStorage.setItem;
  globalThis.localStorage.setItem = () => { throw new Error('storage failed'); };
  try {
    await assert.rejects(deviceStore.setItemConfirmed('od.logbookName', 'Other'), /storage failed/);
    assert.equal(deviceStore.getItem('od.logbookName'), 'My dives');
  } finally {
    globalThis.localStorage.setItem = setItem;
    delete globalThis.window;
  }
});
