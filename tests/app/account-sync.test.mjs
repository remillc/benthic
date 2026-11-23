// The account data sync engine (app/src/lib/account-sync.js) with two devices on one account, over real git: the fake core
// is tests/app/fake-bgit.mjs (a bare remote and one working-copy folder per device).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFileStore, memoryBackend, sortedJson } from '../../app/src/lib/file-store.js';
import { createSecretBox, toBase64 } from '../../app/src/lib/secret-box.js';
import { createInventory, emptyEquipment } from '../../app/src/lib/inventory.js';
import { createProfile, emptyInfo } from '../../app/src/lib/profile.js';
import { createAccountSync, isSyncedPath, workingCopyName } from '../../app/src/lib/account-sync.js';
import { FakeBgit, FakeRemote } from './git-history-core.mjs';

let tick = Date.UTC(2026, 10, 23, 8, 0, 0);
/** One clock for every device, so that « later » is the order of the calls. */
const now = () => new Date((tick += 1000));

/** @param {number} byte @param {{ hadKey?: boolean }} [o] */
function boxFor(byte, { hadKey = false } = {}) {
  const key = byte ? toBase64(new Uint8Array(32).fill(byte)) : '';
  return createSecretBox({ read: async () => key, write: async () => { throw new Error('unexpected key write'); }, hadKey: async () => hadKey });
}

/** A device: a store, the app's own writers over it, the sync engine, and a fake core on the shared remote. */
function device(remote, name, { keyByte = 7, hadKey = false } = {}) {
  const core = new FakeBgit({ remote, name });
  const store = createFileStore(memoryBackend());
  const box = boxFor(keyByte, { hadKey });
  const inventory = createInventory(store, { now });
  const profile = createProfile(store, box, { now });
  const sync = createAccountSync({ core, store, box, now });
  /** Every synced file of the store, by path. */
  const files = async () => {
    const out = {};
    for (const p of await store.list('')) if (isSyncedPath(p)) out[p] = (await store.readSnapshot(p)).text;
    return out;
  };
  return { core, store, box, inventory, profile, sync, files, dir: workingCopyName(core.url) };
}

/** @param {ReturnType<typeof device>[]} devices @param {FakeRemote} remote */
function cleanup(devices, remote) {
  for (const d of devices) d.core.dispose();
  remote.dispose();
}

/** The synced files on the server: the key files (`keys/`) are the key flows' own. */
const dataCount = (remote) => Object.keys(remote.files()).filter((p) => !p.startsWith('keys/')).length;
const pending = async (d) => (await d.store.read('meta/pending.json'))?.paths ?? [];
const names = async (d) => (await d.inventory.listGear()).map((g) => g.name).sort();

test('the first device sends everything to an empty branch; a second, empty device receives it', async () => {
  const remote = new FakeRemote();
  const a = device(remote, 'a');
  const b = device(remote, 'b');
  try {
    const mask = await a.inventory.saveGear({ name: 'Mask', type: 'mask' });
    await a.inventory.saveKit({ name: 'Warm', gearIds: [mask.id] });
    const first = await a.sync.run();
    assert.equal(first.status, 'synced');
    assert.equal(first.sent, 2);
    assert.deepEqual(Object.keys(remote.files()).sort(), [`gear/${mask.id}.json`, 'keys/account.json', `kits/${(await a.inventory.listKits())[0].id}.json`].sort());
    assert.deepEqual(JSON.parse(remote.files()['keys/account.json']), { format: 1, kid: await a.box.deviceKid() }, 'the device own key is the account key, nothing re-sealed');
    assert.deepEqual(await pending(a), [], 'what was sent is acknowledged');
    assert.equal((await a.store.read('meta/sync.json')).head, remote.head());

    const second = await b.sync.run();
    assert.equal(second.status, 'synced');
    assert.deepEqual(await names(b), ['Mask']);
    assert.deepEqual(await pending(b), [], 'what comes from the server is not pending');
    assert.deepEqual(await b.files(), await a.files());
    assert.equal(workingCopyName(a.core.url), a.dir);
    assert.match(a.dir, /^benthic-[0-9a-f]{16}$/);
  } finally {
    cleanup([a, b], remote);
  }
});

test('meta files never leave the device', async () => {
  const remote = new FakeRemote();
  const a = device(remote, 'a');
  try {
    await a.inventory.saveGear({ name: 'Fins', type: 'fins' });
    await a.store.write('meta/health-consent.json', { format: 1, consent: true });
    await a.store.trackedBatch({ writes: [['meta/other.json', { format: 1 }]] });
    await a.sync.run();
    assert.ok(Object.keys(remote.files()).every((p) => !p.startsWith('meta/')));
    assert.deepEqual(await pending(a), []);
  } finally {
    cleanup([a], remote);
  }
});

test('two devices changing different files both end up with both changes', async () => {
  const remote = new FakeRemote();
  const a = device(remote, 'a');
  const b = device(remote, 'b');
  try {
    await a.inventory.saveGear({ name: 'Regulator', type: 'regulator' });
    await a.sync.run();
    await b.sync.run();
    await a.inventory.saveGear({ name: 'Wetsuit', type: 'suit' });
    await b.inventory.saveGear({ name: 'Lamp', type: 'light' });
    await a.sync.run();
    const rb = await b.sync.run();
    assert.equal(rb.status, 'synced');
    await a.sync.run();
    assert.deepEqual(await names(a), ['Lamp', 'Regulator', 'Wetsuit']);
    assert.deepEqual(await names(b), ['Lamp', 'Regulator', 'Wetsuit']);
    assert.deepEqual(await a.files(), await b.files());
  } finally {
    cleanup([a, b], remote);
  }
});

test('the same file changed on two devices merges key by key; a field changed on both keeps the later one and is reported', async () => {
  const remote = new FakeRemote();
  const a = device(remote, 'a');
  const b = device(remote, 'b');
  try {
    const piece = await a.inventory.saveGear({ name: 'BCD', type: 'bcd', note: 'old', brand: 'X' });
    await a.sync.run();
    await b.sync.run();
    await a.inventory.saveGear({ id: piece.id, name: 'BCD', type: 'bcd', note: 'A note', brand: 'X' });
    await b.inventory.saveGear({ id: piece.id, name: 'BCD', type: 'bcd', note: 'old', brand: 'Y' });
    await a.sync.run();
    const rb = await b.sync.run();
    assert.deepEqual(rb.conflicts, [], 'different keys: no conflict');
    await a.sync.run();
    for (const d of [a, b]) {
      const g = await d.inventory.getGear(piece.id);
      assert.equal(g.note, 'A note');
      assert.equal(g.brand, 'Y');
    }

    // The same field on both.
    await a.inventory.saveGear({ id: piece.id, name: 'BCD', type: 'bcd', note: 'first', brand: 'Y' });
    await b.inventory.saveGear({ id: piece.id, name: 'BCD', type: 'bcd', note: 'second', brand: 'Y' });
    await a.sync.run();
    const conflicted = await b.sync.run();
    assert.deepEqual(conflicted.conflicts.map((c) => [c.path, c.keys.includes('note')]), [[`gear/${piece.id}.json`, true]]);
    await a.sync.run();
    assert.equal((await a.inventory.getGear(piece.id)).note, 'second', 'the later edit wins');
    assert.equal((await b.inventory.getGear(piece.id)).note, 'second');
    assert.deepEqual(await a.files(), await b.files());
  } finally {
    cleanup([a, b], remote);
  }
});

test('a file modified on one device beats its deletion on the other', async () => {
  const remote = new FakeRemote();
  const a = device(remote, 'a');
  const b = device(remote, 'b');
  try {
    const piece = await a.inventory.saveGear({ name: 'Computer', type: 'other', note: 'x' });
    const doomed = await a.inventory.saveGear({ name: 'Old knife', type: 'knife' });
    await a.sync.run();
    await b.sync.run();
    await a.inventory.deleteGear(piece.id);
    await a.inventory.deleteGear(doomed.id);
    await b.inventory.saveGear({ id: piece.id, name: 'Computer', type: 'other', note: 'edited' });
    await a.sync.run();
    await b.sync.run();
    await a.sync.run();
    assert.equal((await a.inventory.getGear(piece.id))?.note, 'edited', 'the edit survives the deletion');
    assert.equal((await b.inventory.getGear(piece.id))?.note, 'edited');
    assert.equal(await a.inventory.getGear(doomed.id), null, 'an unopposed deletion goes through');
    assert.equal(await b.inventory.getGear(doomed.id), null);
  } finally {
    cleanup([a, b], remote);
  }
});

test('a rejected push is retried after a new pull; three retries at most', async () => {
  const remote = new FakeRemote();
  const a = device(remote, 'a');
  const b = device(remote, 'b');
  try {
    await a.inventory.saveGear({ name: 'One', type: 'mask' });
    await a.sync.run();
    await b.sync.run();
    await b.inventory.saveGear({ name: 'Two', type: 'mask' });
    // The server moves while b is about to push: a real second device pushes in the hook.
    let moved = false;
    b.core.before.bgitPush = async () => {
      if (moved) return;
      moved = true;
      await a.inventory.saveGear({ name: 'Three', type: 'mask' });
      await a.sync.run();
    };
    const result = await b.sync.run();
    assert.equal(result.status, 'synced');
    assert.deepEqual(dataCount(remote), 3);
    assert.ok(b.core.calls.filter((c) => c === 'bgitPush').length >= 2, 'pushed again after the rejection');
    await a.sync.run();
    assert.deepEqual(await names(a), ['One', 'Three', 'Two']);

    b.core.before.bgitPush = undefined;
    await b.inventory.saveGear({ name: 'Four', type: 'mask' });
    b.core.rejectNextPush = 4;
    const gaveUp = await b.sync.run();
    assert.equal(gaveUp.status, 'error');
    assert.equal(gaveUp.error, 'REJECTED');
    assert.equal(b.core.calls.filter((c) => c === 'bgitPush').length >= 6, true);
    assert.ok((await pending(b)).length > 0, 'still pending');
    b.core.rejectNextPush = 3;
    const done = await b.sync.run();
    assert.equal(done.status, 'synced', 'three rejections are survived');
    assert.deepEqual(await pending(b), []);
    assert.ok(Object.values(remote.files()).some((t) => t.includes('Four')));
  } finally {
    cleanup([a, b], remote);
  }
});

test('an edit made during a sync is kept and goes at the next run', async () => {
  const remote = new FakeRemote();
  const a = device(remote, 'a');
  const b = device(remote, 'b');
  try {
    const mask = await a.inventory.saveGear({ name: 'Mask', type: 'mask' });
    const fins = await a.inventory.saveGear({ name: 'Fins', type: 'fins' });
    await a.sync.run();
    await b.sync.run();
    // b edits Mask meanwhile (a file the server did not change); a changes Fins.
    await a.inventory.saveGear({ id: fins.id, name: 'Fins', type: 'fins', note: 'from a' });
    await a.sync.run();
    b.core.before.bgitDiff = async () => {
      b.core.before.bgitDiff = undefined;
      await b.inventory.saveGear({ id: mask.id, name: 'Mask', type: 'mask', note: 'typed during the sync' });
    };
    const run = await b.sync.run();
    assert.equal(run.status, 'synced');
    assert.equal((await b.inventory.getGear(mask.id)).note, 'typed during the sync');
    assert.equal((await b.inventory.getGear(fins.id)).note, 'from a');
    assert.deepEqual(await pending(b), [`gear/${mask.id}.json`], 'the edit waits for the next run');
    await b.sync.run();
    assert.deepEqual(await pending(b), []);
    assert.match(remote.files()[`gear/${mask.id}.json`], /typed during the sync/);
  } finally {
    cleanup([a, b], remote);
  }
});

test('an edit made during a sync to a file the server also changed is merged, not overwritten', async () => {
  const remote = new FakeRemote();
  const a = device(remote, 'a');
  const b = device(remote, 'b');
  try {
    const piece = await a.inventory.saveGear({ name: 'Regulator', type: 'regulator', note: '', brand: 'Old' });
    await a.sync.run();
    await b.sync.run();
    await a.inventory.saveGear({ id: piece.id, name: 'Regulator', type: 'regulator', note: 'from a', brand: 'Old' });
    await a.sync.run();
    // b has an edit of its own to the same file, and a second one lands while b syncs.
    await b.inventory.saveGear({ id: piece.id, name: 'Regulator', type: 'regulator', note: '', brand: 'Old', serial: 'S1' });
    b.core.before.bgitDiff = async () => {
      b.core.before.bgitDiff = undefined;
      await b.inventory.saveGear({ id: piece.id, name: 'Regulator', type: 'regulator', note: '', brand: 'Mares', serial: 'S1' });
    };
    const run = await b.sync.run();
    assert.equal(run.status, 'synced');
    await a.sync.run();
    for (const d of [a, b]) {
      const g = await d.inventory.getGear(piece.id);
      assert.equal(g.note, 'from a', 'the server\'s change is not lost');
      assert.equal(g.brand, 'Mares', 'the edit made during the sync is not lost');
      assert.equal(g.serial, 'S1');
    }
    assert.deepEqual(await pending(b), []);
  } finally {
    cleanup([a, b], remote);
  }
});

test('offline: edits wait in the pending list and in local commits, then go out', async () => {
  const remote = new FakeRemote();
  const a = device(remote, 'a');
  try {
    await a.inventory.saveGear({ name: 'Mask', type: 'mask' });
    await a.sync.run();
    await a.inventory.saveGear({ name: 'Fins', type: 'fins' });
    a.core.before.bgitPull = () => {
      throw Object.assign(new Error('UNREACHABLE'), { code: 'UNREACHABLE' });
    };
    const off = await a.sync.run();
    assert.equal(off.status, 'offline');
    assert.equal((await pending(a)).length, 1, 'the edit is still pending');
    assert.equal(await a.sync.unsent(), 1, 'its commit waits in the working copy');
    assert.equal(dataCount(remote), 1);
    a.core.before.bgitPull = undefined;
    const on = await a.sync.run();
    assert.equal(on.status, 'synced');
    assert.deepEqual(await pending(a), []);
    assert.equal(dataCount(remote), 2);
    assert.equal(await a.sync.unsent(), 0);
  } finally {
    cleanup([a], remote);
  }
});

test('two dive-equipment files for the same dive become one after a merge, with the pieces of both', async () => {
  const remote = new FakeRemote();
  const a = device(remote, 'a');
  const b = device(remote, 'b');
  try {
    const x = await a.inventory.saveGear({ name: 'Reel', type: 'other' });
    const y = await a.inventory.saveGear({ name: 'Light', type: 'light' });
    await a.sync.run();
    await b.sync.run();
    const key = '2026-11-01T10:00:00';
    await a.inventory.saveDiveEquipment(key, { ...emptyEquipment(), gearIds: [x.id] });
    await b.inventory.saveDiveEquipment(key, { ...emptyEquipment(), gearIds: [y.id] });
    await a.sync.run();
    await b.sync.run();
    await a.sync.run();
    for (const d of [a, b]) {
      const records = await d.inventory.listDiveEquipment();
      assert.equal(records.length, 1, 'one file per dive');
      assert.deepEqual([...records[0].gearIds].sort(), [x.id, y.id].sort());
    }
    assert.deepEqual(await a.files(), await b.files());
    assert.equal(Object.keys(remote.files()).filter((p) => p.startsWith('dive-equipment/')).length, 1);
  } finally {
    cleanup([a, b], remote);
  }
});

test('a piece deleted on one device takes the kit link, the dive link and the reminder another device added meanwhile', async () => {
  const remote = new FakeRemote();
  const a = device(remote, 'a');
  const b = device(remote, 'b');
  try {
    const mask = await a.inventory.saveGear({ name: 'Mask', type: 'mask' });
    const fins = await a.inventory.saveGear({ name: 'Fins', type: 'fins' });
    await a.sync.run();
    await b.sync.run();
    await a.inventory.deleteGear(mask.id);
    // b, not knowing, links the mask everywhere.
    const kit = await b.inventory.saveKit({ name: 'Trip', gearIds: [mask.id, fins.id] });
    await b.inventory.saveDiveEquipment('2026-11-02T09:00:00', { ...emptyEquipment(), gearIds: [mask.id, fins.id], kitId: kit.id });
    await b.inventory.saveMaintenance({ gearId: mask.id, task: 'service', intervalMonths: 12, intervalDives: null });
    await a.sync.run();
    await b.sync.run();
    await a.sync.run();
    for (const d of [a, b]) {
      assert.equal(await d.inventory.getGear(mask.id), null);
      assert.deepEqual((await d.inventory.listKits())[0].gearIds, [fins.id]);
      assert.deepEqual((await d.inventory.listDiveEquipment())[0].gearIds, [fins.id]);
      assert.equal((await d.inventory.listMaintenance()).length, 0, 'the orphan reminder is removed');
    }
  } finally {
    cleanup([a, b], remote);
  }
});

test('maintenance history entries are combined by id; the last service follows', async () => {
  const remote = new FakeRemote();
  const a = device(remote, 'a');
  const b = device(remote, 'b');
  try {
    const reg = await a.inventory.saveGear({ name: 'Reg', type: 'regulator' });
    const item = await a.inventory.saveMaintenance({ gearId: reg.id, task: 'service', intervalMonths: 12, intervalDives: null });
    await a.inventory.noteMaintenance({ id: item.id, gearId: reg.id, task: 'service' }, { kind: 'service', doneOn: '2026-01-10' });
    await a.sync.run();
    await b.sync.run();
    await a.inventory.noteMaintenance({ id: item.id, gearId: reg.id, task: 'service' }, { kind: 'inspection', doneOn: '2026-05-01' });
    await b.inventory.noteMaintenance({ id: item.id, gearId: reg.id, task: 'service' }, { kind: 'service', doneOn: '2026-09-01', doneBy: 'Shop' });
    await a.sync.run();
    await b.sync.run();
    await a.sync.run();
    for (const d of [a, b]) {
      const m = (await d.inventory.listMaintenance())[0];
      assert.deepEqual(m.history.map((h) => h.doneOn), ['2026-09-01', '2026-05-01', '2026-01-10']);
      assert.equal(m.lastDoneOn, '2026-09-01');
    }
    assert.deepEqual(await a.files(), await b.files());
  } finally {
    cleanup([a, b], remote);
  }
});

test('sealed profile and certification merge through the box; both devices read the result', async () => {
  const remote = new FakeRemote();
  const a = device(remote, 'a');
  const b = device(remote, 'b');
  try {
    await a.profile.saveInfo({ ...emptyInfo(), fullName: 'Ann Diver', bloodGroup: 'A+' });
    await a.sync.run();
    await b.sync.run();
    assert.equal((await b.profile.readInfo()).fullName, 'Ann Diver');
    await a.profile.saveInfo({ ...(await a.profile.readInfo()), fullName: 'Ann Q. Diver' });
    await b.profile.saveInfo({ ...(await b.profile.readInfo()), bloodGroup: 'O+' });
    await a.sync.run();
    await b.sync.run();
    await a.sync.run();
    for (const d of [a, b]) {
      const info = await d.profile.readInfo();
      assert.equal(info.fullName, 'Ann Q. Diver');
      assert.equal(info.bloodGroup, 'O+');
    }
    assert.ok(!Object.values(remote.files()).join('').includes('Ann'), 'nothing sensitive is in clear on the server');
  } finally {
    cleanup([a, b], remote);
  }
});

test('sealed items whose data key is missing are neither sent nor overwritten, and are reported as locked', async () => {
  const remote = new FakeRemote();
  const a = device(remote, 'a');
  // b has lost its key: reading it gives nothing, and the keeper knows it had one.
  const b = device(remote, 'b', { keyByte: 0, hadKey: true });
  try {
    await a.profile.saveInfo({ ...emptyInfo(), fullName: 'Ann Diver' });
    await a.sync.run();
    const sealedOnServer = remote.files()['profile/diver.json'];
    const arrived = await b.sync.run();
    assert.equal(arrived.status, 'synced');
    assert.equal((await b.store.readSnapshot('profile/diver.json')).text, sealedOnServer, 'a sealed file is carried as it is');

    // A local sealed edit b cannot open (made with a key it no longer has) stays local.
    const other = JSON.parse(sealedOnServer);
    const local = { ...other, updatedAt: '2030-01-01T00:00:00Z' };
    await b.store.trackedBatch({ writes: [['profile/diver.json', local]] });
    await a.profile.saveInfo({ ...(await a.profile.readInfo()), fullName: 'Ann Again' });
    await a.sync.run();
    const serverNow = remote.files()['profile/diver.json'];
    const run = await b.sync.run();
    assert.deepEqual(run.locked, ['profile/diver.json']);
    assert.equal(remote.files()['profile/diver.json'], serverNow, 'nothing of b was sent');
    assert.equal((await b.store.readSnapshot('profile/diver.json')).value.updatedAt, '2030-01-01T00:00:00Z', 'nothing was overwritten');
    assert.deepEqual(await pending(b), ['profile/diver.json'], 'it stays pending');
    // The rest still syncs.
    await b.inventory.saveGear({ name: 'Mask', type: 'mask' });
    const again = await b.sync.run();
    assert.equal(again.status, 'synced');
    assert.ok(Object.keys(remote.files()).some((p) => p.startsWith('gear/')));
  } finally {
    cleanup([a, b], remote);
  }
});

test('a profile that still holds its date of birth in clear is not sent', async () => {
  const remote = new FakeRemote();
  const a = device(remote, 'a');
  try {
    await a.store.trackedBatch({ writes: [['profile/diver.json', { format: 1, updatedAt: '2026-01-01T00:00:00Z', dateOfBirth: '1980-01-01' }]] });
    await a.inventory.saveGear({ name: 'Mask', type: 'mask' });
    const run = await a.sync.run();
    assert.deepEqual(run.unsealed, ['profile/diver.json']);
    assert.ok(!('profile/diver.json' in remote.files()));
    assert.ok('gear/' + (await a.inventory.listGear())[0].id + '.json' in remote.files());
  } finally {
    cleanup([a], remote);
  }
});

test('after the subscription ended the device only pulls: nothing is sent, the server\'s changes come in', async () => {
  const remote = new FakeRemote();
  const a = device(remote, 'a');
  const b = device(remote, 'b');
  try {
    await a.inventory.saveGear({ name: 'Mask', type: 'mask' });
    await a.sync.run();
    await b.sync.run();
    await b.inventory.saveGear({ name: 'Unsent', type: 'mask' });
    await b.inventory.setReadOnly(true);
    await a.inventory.saveGear({ name: 'Fins', type: 'fins' });
    await a.sync.run();
    const run = await b.sync.run();
    assert.equal(run.status, 'synced');
    assert.equal(run.pullOnly, true);
    assert.deepEqual(await names(b), ['Fins', 'Mask', 'Unsent']);
    assert.equal(dataCount(remote), 2, 'the unsent piece did not go');
    assert.equal((await pending(b)).length, 1);
  } finally {
    cleanup([a, b], remote);
  }
});

test('a device signed in to a different account is not synced; a device with data meeting an account with data asks to join', async () => {
  const remote = new FakeRemote();
  const a = device(remote, 'a');
  const b = device(remote, 'b');
  try {
    await a.inventory.saveGear({ name: 'Mask', type: 'mask' });
    await a.sync.run();
    await b.inventory.saveGear({ name: 'My own mask', type: 'mask' });
    const join = await b.sync.run();
    assert.equal(join.status, 'joinNeeded');
    assert.equal(dataCount(remote), 1, 'nothing was uploaded');
    assert.deepEqual(await names(b), ['My own mask'], 'nothing was changed here');

    await a.store.write('meta/sync.json', { format: 1, accountKey: 'someone-else/repo', head: '' });
    const other = await a.sync.run();
    assert.equal(other.status, 'differentAccount');
  } finally {
    cleanup([a, b], remote);
  }
});

test('with no session the engine does nothing', async () => {
  const remote = new FakeRemote();
  const a = device(remote, 'a');
  try {
    a.core.serverSessionAccess = async () => ({ repositoryUrl: '', username: '', token: '' });
    assert.equal((await a.sync.run()).status, 'noSession');
    assert.equal(remote.head(), null);
  } finally {
    cleanup([a], remote);
  }
});

test('the result of a clean run is stable: a second run changes nothing', async () => {
  const remote = new FakeRemote();
  const a = device(remote, 'a');
  try {
    await a.inventory.saveGear({ name: 'Mask', type: 'mask' });
    await a.sync.run();
    const head = remote.head();
    const again = await a.sync.run();
    assert.equal(again.status, 'synced');
    assert.equal(again.sent, 0);
    assert.equal(again.received, 0);
    assert.equal(remote.head(), head);
    assert.equal(sortedJson({ a: 1 }), '{\n  "a": 1\n}\n');
  } finally {
    cleanup([a], remote);
  }
});
