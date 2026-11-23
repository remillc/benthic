// The account key in the sync engine (app/src/lib/account-sync.js, docs/account-sync.md, « The data key on a second device »),
// with two devices over real git (tests/app/fake-bgit.mjs): the first push writes keys/account.json with the device's own key,
// a device without that key reports keyMissing and sends nothing sealed under its own key, and expired pairing files go.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFileStore, memoryBackend } from '../../app/src/lib/file-store.js';
import { createSecretBox, toBase64 } from '../../app/src/lib/secret-box.js';
import { createProfile, emptyInfo } from '../../app/src/lib/profile.js';
import { createInventory } from '../../app/src/lib/inventory.js';
import { createAccountSync, isKeyPath, isSyncedPath } from '../../app/src/lib/account-sync.js';
import { createAccessRequest } from '../../app/src/lib/account-keys.js';
import { FakeBgit, FakeRemote } from './git-history-core.mjs';

let tick = Date.UTC(2026, 10, 23, 8, 0, 0);
const now = () => new Date((tick += 1000));

/** @param {string} name @param {number} byte */
function device(remote, name, byte) {
  const key = toBase64(new Uint8Array(32).fill(byte));
  const core = new FakeBgit({ remote, name });
  const store = createFileStore(memoryBackend());
  const box = createSecretBox({ read: async () => key, write: async () => { throw new Error('unexpected key write'); }, hadKey: async () => true });
  return { core, store, box, profile: createProfile(store, box, { now }), inventory: createInventory(store, { now }), sync: createAccountSync({ core, store, box, now }) };
}

test('the first push writes keys/account.json with the device key; a device without it reports the key missing and cannot seal under its own', async () => {
  const remote = new FakeRemote();
  const a = device(remote, 'a', 7);
  const b = device(remote, 'b', 9);
  try {
    await a.profile.saveInfo({ ...emptyInfo(), fullName: 'Ann Diver' });
    const first = await a.sync.run();
    assert.equal(first.status, 'synced');
    assert.equal(first.keyMissing, false);
    const kid = JSON.parse(remote.files()['keys/account.json']).kid;
    assert.equal(kid, await a.box.deviceKid());
    assert.equal(a.box.getAccountKid(), kid);
    assert.equal(isKeyPath('keys/account.json') && isSyncedPath('keys/account.json'), false, 'keys/ never enters the local store');

    // B has its own key and data of its own: the join step comes first, and it already says the key is missing.
    await b.profile.saveInfo({ ...emptyInfo(), fullName: 'Typed on B' });
    const second = await b.sync.run();
    assert.equal(second.status, 'joinNeeded');
    assert.equal(second.keyMissing, true);
    assert.equal(JSON.parse(remote.files()['profile/diver.json']).enc.kid, kid, 'the server still holds the first device profile');

    // A device with nothing of its own syncs, reports the key missing, and cannot seal anything under a key of its own.
    const c = device(remote, 'c', 5);
    try {
      const third = await c.sync.run();
      assert.equal(third.status, 'synced');
      assert.equal(third.keyMissing, true);
      assert.equal(third.hasRecovery, false);
      assert.equal(c.box.getAccountKid(), kid);
      await assert.rejects(c.profile.saveInfo({ ...emptyInfo(), fullName: 'Typed on C' }), /MISSING_DATA_KEY/);
      assert.equal(JSON.parse(remote.files()['profile/diver.json']).enc.kid, kid);
    } finally {
      c.core.dispose();
    }
  } finally {
    a.core.dispose();
    b.core.dispose();
    remote.dispose();
  }
});

test('an expired pairing file is deleted by the next run; a valid one stays', async () => {
  const remote = new FakeRemote();
  const a = device(remote, 'a', 7);
  try {
    await a.inventory.saveGear({ name: 'Mask', type: 'mask' });
    await a.sync.run();
    const account = { key: toBase64(new Uint8Array(32).fill(7)), kid: await a.box.deviceKid() };
    const old = await createAccessRequest({ deviceName: "A" }, { now: () => now().getTime() - 3_600_000 });
    const fresh = await createAccessRequest({ deviceName: "A" }, { now: () => now().getTime() });
    await a.sync.commitKeyFiles({ writes: [old.file, fresh.file], message: 'Benthic: pairing' });
    assert.deepEqual(Object.keys(remote.files()).filter((p) => p.startsWith('keys/requests/')), [`keys/requests/${fresh.id}.json`]);
    await assert.rejects(a.sync.commitKeyFiles({ writes: [{ path: 'gear/x.json', json: {} }] }), /BAD_PATH/, 'only keys/ goes through this door');
  } finally {
    a.core.dispose();
    remote.dispose();
  }
});
