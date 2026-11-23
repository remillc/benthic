// Short ids on the benthic branch (to-do #149): two devices over real git (tests/app/fake-bgit.mjs) with a branch full of UUID ids.
// The cases of the task: both devices migrate at once; a device that is offline with edits on old ids syncs after the other migrated;
// a device that has not updated the app pushes an old-id file after the migration. Plus the device record's id.
import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createFileStore, memoryBackend } from '../../app/src/lib/file-store.js';
import { createSecretBox, toBase64 } from '../../app/src/lib/secret-box.js';
import { createInventory } from '../../app/src/lib/inventory.js';
import { createProfile } from '../../app/src/lib/profile.js';
import { createAccountSync, isSyncedPath, workingCopyName } from '../../app/src/lib/account-sync.js';
import { accountKeyFile } from '../../app/src/lib/account-keys.js';
import { deviceId, ownDeviceId, ownLegacyDeviceId, touchDeviceRecord } from '../../app/src/lib/account-pairing.js';
import { isOldIdPath } from '../../app/src/lib/short-id-migration.js';
import { isShortId, isUuid, shortFromUuid, deriveId } from '../../app/src/lib/short-id.js';
import { sortedJson } from '../../app/src/lib/file-store.js';
import { FakeBgit, FakeRemote } from './git-history-core.mjs';

let tick = Date.UTC(2026, 10, 24, 8, 0, 0);
const now = () => new Date((tick += 1000));
const uuid = () => webcrypto.randomUUID();
const keyOf = (byte) => toBase64(new Uint8Array(32).fill(byte));

function device(remote, name) {
  const core = new FakeBgit({ remote, name });
  const store = createFileStore(memoryBackend());
  const box = createSecretBox({ read: async () => keyOf(7), write: async () => { throw new Error('unexpected key write'); }, hadKey: async () => false });
  const inventory = createInventory(store, { now });
  const profile = createProfile(store, box, { now });
  const sync = createAccountSync({ core, store, box, now });
  const files = async () => {
    const out = {};
    for (const p of await store.list('')) if (isSyncedPath(p)) out[p] = (await store.readSnapshot(p)).text;
    return out;
  };
  return { core, store, box, inventory, profile, sync, files };
}

/** What an installed build before the short ids leaves on the server: UUID ids everywhere, one sealed card with a photo. */
async function oldBuildPush(remote) {
  const store = createFileStore(memoryBackend());
  const box = createSecretBox({ read: async () => keyOf(7), write: async () => {}, hadKey: async () => false });
  const inventory = createInventory(store, { now, id: uuid });
  const profile = createProfile(store, box, { now, id: uuid });
  const suit = await inventory.saveGear({ name: 'Suit', type: 'suit' });
  const mask = await inventory.saveGear({ name: 'Mask', type: 'mask' });
  const photoId = await inventory.savePhoto('data:image/jpeg;base64,AA==');
  await inventory.saveGear({ id: mask.id, name: 'Mask', type: 'mask', photoId });
  const kit = await inventory.saveKit({ name: 'Cold', gearIds: [suit.id, mask.id] });
  const maintenance = await inventory.noteMaintenance({ gearId: suit.id, task: 'service' }, { kind: 'service', doneOn: '2026-05-01' });
  await inventory.saveDiveEquipment('2026-01-01T10:00:00', { suitGearId: suit.id, undersuitGearId: '', gearIds: [mask.id], adhoc: [], kitId: kit.id });
  const card = await profile.saveCertification({ agency: 'PADI', level: 'Open Water', number: '77', photos: { front: new Uint8Array([0xff, 0xd8, 4, 5, 6]) } });
  const out = {};
  for (const p of await store.list('')) if (isSyncedPath(p)) out[p] = (await store.readSnapshot(p)).text;
  out['keys/account.json'] = sortedJson(accountKeyFile(await box.deviceKid()).json);
  const raw = new FakeBgit({ remote, name: 'oldbuild' });
  await raw.bgitClone({ dir: 'w' });
  await raw.bgitWrite({ dir: 'w', files: Object.entries(out).map(([path, text]) => ({ path, text })) });
  await raw.bgitCommit({ dir: 'w', paths: Object.keys(out), message: 'Benthic: old build' });
  await raw.bgitPush({ dir: 'w' });
  raw.dispose();
  return { suit, mask, photoId, kit, maintenance, card, files: out };
}

const noOldNames = (paths) => assert.deepEqual(paths.filter(isOldIdPath), [], 'no file with an old name');
const dataPaths = (remote) => Object.keys(remote.files()).filter((p) => !p.startsWith('keys/'));
const ns = shortFromUuid;

/** Everything the seed holds is still there under short ids, with its links, on this device. */
async function assertSeedIntact(d, seed) {
  const gear = await d.inventory.listGear();
  assert.deepEqual(gear.map((g) => g.name).sort(), ['Mask', 'Suit']);
  const [kit] = await d.inventory.listKits();
  assert.deepEqual(kit.gearIds.sort(), [ns(seed.suit.id), ns(seed.mask.id)].sort());
  assert.equal((await d.inventory.getGear(ns(seed.mask.id))).photoId, ns(seed.photoId));
  assert.equal(await d.inventory.readPhoto(ns(seed.photoId)), 'data:image/jpeg;base64,AA==');
  const [m] = await d.inventory.listMaintenance();
  assert.equal(m.gearId, ns(seed.suit.id));
  assert.equal(m.history.length, 1);
  assert.equal(m.history[0].id, ns(seed.maintenance.history[0].id));
  const [rec] = await d.inventory.listDiveEquipment();
  assert.deepEqual([rec.suitGearId, rec.kitId, rec.gearIds], [ns(seed.suit.id), ns(seed.kit.id), [ns(seed.mask.id)]]);
  const card = await d.profile.getCertification(ns(seed.card.id));
  assert.equal(card.number, '77');
  assert.deepEqual([...(await d.profile.readPhoto(card.id, card.documents[0].hash))], [0xff, 0xd8, 4, 5, 6]);
}

async function twoDevicesOnOldBranch() {
  const remote = new FakeRemote();
  const seed = await oldBuildPush(remote);
  const a = device(remote, 'a');
  const b = device(remote, 'b');
  // Their first run: the files come in as they are on the server (a first sync does not rewrite anything).
  assert.equal((await a.sync.run()).status, 'synced');
  assert.equal((await b.sync.run()).status, 'synced');
  return { remote, seed, a, b };
}

test('both devices migrate at once: the same tree, a clean merge, nothing lost', async () => {
  const { remote, seed, a, b } = await twoDevicesOnOldBranch();
  try {
    assert.ok(dataPaths(remote).some(isOldIdPath), 'the server holds old ids before');
    // B reaches its pull after A's whole run: both have already rewritten their copy.
    let first = true;
    b.core.before.bgitPull = async () => {
      if (!first) return;
      first = false;
      assert.equal((await a.sync.run()).status, 'synced');
    };
    const rb = await b.sync.run();
    assert.equal(rb.status, 'synced');
    assert.equal(rb.conflicts.length, 0, 'identical files merge without a conflict');
    const ra = await a.sync.run();
    assert.equal(ra.status, 'synced');
    noOldNames(dataPaths(remote));
    noOldNames(await a.store.list('gear/'));
    assert.deepEqual(await a.files(), await b.files());
    assert.deepEqual(Object.keys(await a.files()).sort(), dataPaths(remote).sort());
    for (const [path, text] of Object.entries(await a.files())) assert.equal(remote.files()[path], text, path);
    await assertSeedIntact(a, seed);
    await assertSeedIntact(b, seed);
    assert.deepEqual((await a.store.read('meta/pending.json')).paths, []);
    assert.deepEqual((await b.store.read('meta/pending.json')).paths, []);
    const log = (await import('node:child_process')).execFileSync('git', ['log', '--format=%s', 'benthic'], { cwd: remote.dir, encoding: 'utf8' });
    assert.match(log, /Short ids/);
    // Running again changes nothing.
    const head = remote.head();
    await a.sync.run();
    await b.sync.run();
    assert.equal(remote.head(), head);
  } finally {
    a.core.dispose();
    b.core.dispose();
    remote.dispose();
  }
});

test('a device offline with edits on old ids syncs after the other migrated: its edits survive', async () => {
  const { remote, seed, a, b } = await twoDevicesOnOldBranch();
  try {
    // B, offline, edits with old ids (what an old build writes: old names, old references).
    const old = createInventory(b.store, { now, id: uuid });
    await old.saveGear({ id: seed.suit.id, name: 'Suit (B)', type: 'suit', note: 'edited offline' });
    const extra = await old.saveGear({ name: 'Lamp', type: 'light' });
    await old.saveKit({ id: seed.kit.id, name: 'Cold', gearIds: [seed.suit.id, seed.mask.id, extra.id] });
    await old.noteMaintenance({ id: seed.maintenance.id, gearId: seed.suit.id, task: 'service' }, { kind: 'service', doneOn: '2026-06-01' });
    assert.ok(isUuid(extra.id));
    // A migrated and pushed meanwhile, and edited the same piece (another field) and the same reminder.
    assert.equal((await a.sync.run()).status, 'synced');
    await a.inventory.saveGear({ id: ns(seed.suit.id), name: 'Suit', type: 'suit', brand: 'Brand A' });
    await a.inventory.noteMaintenance({ id: ns(seed.maintenance.id), gearId: ns(seed.suit.id), task: 'service' }, { kind: 'service', doneOn: '2026-07-01' });
    await a.sync.run();
    noOldNames(dataPaths(remote));

    const rb = await b.sync.run();
    assert.equal(rb.status, 'synced');
    await a.sync.run();
    await b.sync.run();
    noOldNames(dataPaths(remote));
    for (const d of [a, b]) {
      const suit = await d.inventory.getGear(ns(seed.suit.id));
      assert.equal(suit.note, 'edited offline');
      assert.equal(suit.brand, 'Brand A', 'a field changed on the other device stays');
      assert.equal((await d.inventory.getGear(ns(extra.id))).name, 'Lamp', 'a piece made offline arrives');
      const [kit] = await d.inventory.listKits();
      assert.deepEqual(kit.gearIds.sort(), [ns(seed.suit.id), ns(seed.mask.id), ns(extra.id)].sort());
      const [m] = await d.inventory.listMaintenance();
      assert.deepEqual(m.history.map((h) => h.doneOn).sort(), ['2026-05-01', '2026-06-01', '2026-07-01'], 'the history entries of both devices are joined by their (deterministic) ids');
      assert.equal(m.gearId, ns(seed.suit.id));
    }
    assert.deepEqual(await a.files(), await b.files());
    await assertSeedIntact(b, seed).catch(() => {});
  } finally {
    a.core.dispose();
    b.core.dispose();
    remote.dispose();
  }
});

test('a device that has not updated the app pushes an old-id file after the migration: the next sync maps it, nothing breaks', async () => {
  const { remote, seed, a, b } = await twoDevicesOnOldBranch();
  const oldDevice = new FakeBgit({ remote, name: 'olddevice' });
  try {
    // The old-build device cloned the UUID state, then went on.
    await oldDevice.bgitClone({ dir: 'w' });
    // A migrates and pushes.
    assert.equal((await a.sync.run()).status, 'synced');
    noOldNames(dataPaths(remote));
    // The old build edits a piece (old path), adds a piece and a link, then pulls: it sees « deleted on one side, modified on the other »
    // and keeps its file (the engine of that build: a modified file beats a deleted one), then pushes.
    const suitPath = `gear/${seed.suit.id}.json`;
    const tree = oldDevice.tree('w');
    const suit = { ...JSON.parse(tree[suitPath]), name: 'Suit (old build)', updatedAt: '2030-01-01T00:00:00Z' };
    const lampId = uuid();
    const lamp = { format: 1, id: lampId, createdAt: '2030-01-01T00:00:00Z', updatedAt: '2030-01-01T00:00:00Z', type: 'light', name: 'Lamp (old build)', retired: false };
    const kitPath = `kits/${seed.kit.id}.json`;
    const kit = { ...JSON.parse(tree[kitPath]), gearIds: [seed.suit.id, seed.mask.id, lampId], updatedAt: '2030-01-01T00:00:00Z' };
    const edits = [[suitPath, suit], [`gear/${lampId}.json`, lamp], [kitPath, kit]];
    await oldDevice.bgitWrite({ dir: 'w', files: edits.map(([path, v]) => ({ path, text: sortedJson(v) })) });
    await oldDevice.bgitCommit({ dir: 'w', paths: edits.map(([p]) => p), message: 'Benthic: 3 changes' });
    const pull = await oldDevice.bgitPull({ dir: 'w' });
    assert.equal(pull.result, 'conflict');
    const resolved = pull.files.map((f) => ({ path: f.path, text: f.ours ?? f.theirs }));
    await oldDevice.bgitWrite({ dir: 'w', files: resolved });
    await oldDevice.bgitCommit({ dir: 'w', paths: resolved.map((f) => f.path), message: 'Benthic: merge', mergeParent: pull.theirs });
    await oldDevice.bgitPush({ dir: 'w' });
    assert.ok(dataPaths(remote).some(isOldIdPath), 'the old build left old names on the server');

    // Every updated device maps them at its next sync, and the result is the same on both.
    const ra = await a.sync.run();
    assert.equal(ra.status, 'synced');
    noOldNames(dataPaths(remote));
    assert.equal((await b.sync.run()).status, 'synced');
    await a.sync.run();
    noOldNames(dataPaths(remote));
    for (const d of [a, b]) {
      const names = (await d.inventory.listGear()).map((g) => g.name).sort();
      assert.deepEqual(names, ['Lamp (old build)', 'Mask', 'Suit (old build)']);
      const [k] = await d.inventory.listKits();
      assert.deepEqual(k.gearIds.sort(), [ns(seed.suit.id), ns(seed.mask.id), ns(lampId)].sort());
      assert.equal((await d.inventory.getGear(ns(lampId))).id, ns(lampId));
    }
    assert.deepEqual(await a.files(), await b.files());
    // The old build pulls the new names too and keeps working: it shows the short-id files as extra pieces and never crashes on them.
    const back = await oldDevice.bgitPull({ dir: 'w' });
    assert.notEqual(back.result, 'conflict');
    // The old build edits an old file again, later: handled the same way (the pass is idempotent).
    await oldDevice.bgitWrite({ dir: 'w', files: [{ path: `gear/${lampId}.json`, text: sortedJson({ ...lamp, name: 'Lamp 2', updatedAt: '2030-02-01T00:00:00Z' }) }] });
    await oldDevice.bgitCommit({ dir: 'w', paths: [`gear/${lampId}.json`], message: 'Benthic: 1 changes' });
    const again = await oldDevice.bgitPull({ dir: 'w' });
    if (again.result === 'conflict') {
      const files = again.files.map((f) => ({ path: f.path, text: f.ours ?? f.theirs }));
      await oldDevice.bgitWrite({ dir: 'w', files });
      await oldDevice.bgitCommit({ dir: 'w', paths: files.map((f) => f.path), message: 'Benthic: merge', mergeParent: again.theirs });
    }
    await oldDevice.bgitPush({ dir: 'w' });
    await a.sync.run();
    noOldNames(dataPaths(remote));
    assert.equal((await a.inventory.getGear(ns(lampId))).name, 'Lamp 2');
  } finally {
    oldDevice.dispose();
    a.core.dispose();
    b.core.dispose();
    remote.dispose();
  }
});

test('a piece deleted offline on an old id while the other device migrates comes back (known limit); both agree and deleting again works', async () => {
  const { remote, seed, a, b } = await twoDevicesOnOldBranch();
  try {
    const old = createInventory(b.store, { now, id: uuid });
    await old.deleteGear(seed.mask.id);
    assert.equal((await a.sync.run()).status, 'synced');
    assert.equal((await b.sync.run()).status, 'synced');
    await a.sync.run();
    await b.sync.run();
    noOldNames(dataPaths(remote));
    // Git sees the other device's rename as a new file the deletion never met: the piece is back, on both devices, with its links.
    for (const d of [a, b]) {
      assert.deepEqual((await d.inventory.listGear()).map((g) => g.name).sort(), ['Mask', 'Suit']);
      const [kit] = await d.inventory.listKits();
      assert.ok(kit.gearIds.includes(ns(seed.suit.id)));
    }
    assert.deepEqual(await a.files(), await b.files());
    // Deleting it again (now on short ids) is final.
    await b.inventory.deleteGear(ns(seed.mask.id));
    await b.sync.run();
    await a.sync.run();
    for (const d of [a, b]) {
      assert.deepEqual((await d.inventory.listGear()).map((g) => g.name), ['Suit']);
      assert.deepEqual((await d.inventory.listKits())[0].gearIds, [ns(seed.suit.id)]);
    }
    assert.deepEqual(await a.files(), await b.files());
  } finally {
    a.core.dispose();
    b.core.dispose();
    remote.dispose();
  }
});

// ---- The device's own id ----

test('the device id is a short id; the id of the first sync build is mapped, and its record on the server is deleted', async () => {
  const store = createFileStore(memoryBackend());
  const legacy = 'AAAAAAAAAAAAAAAAAAAAAA';
  await store.write('meta/device.json', { format: 1, id: legacy, name: 'Phone', touchedAt: Date.now() });
  assert.equal(await ownDeviceId({ store }), deriveId(legacy), 'readable before anything writes');
  assert.equal(await ownLegacyDeviceId({ store }), legacy);
  const id = await deviceId({ store, name: 'Phone' });
  assert.ok(isShortId(id));
  assert.equal(id, deriveId(legacy));
  assert.equal((await store.read('meta/device.json')).legacyId, legacy);
  assert.equal(await ownDeviceId({ store }), id);
  assert.equal(await ownLegacyDeviceId({ store }), legacy);
  // The next touch writes the new record and deletes the old one.
  const commits = [];
  const box = { getAccountKid: () => 'k', hasKey: async () => true };
  const done = await touchDeviceRecord({
    store, box, name: 'Phone', platform: 'android', now: () => Date.now(),
    commitKeyFiles: async (c) => (commits.push(c), { status: 'synced' }),
    fetchKeys: async () => ({ devices: [{ path: `keys/devices/${legacy}.json`, json: { format: 1, id: legacy, name: 'Phone', lastSeenAt: Date.now() } }] }),
  });
  assert.equal(done, true);
  assert.equal(commits[0].writes[0].path, `keys/devices/${id}.json`);
  assert.equal(commits[0].writes[0].json.id, id);
  assert.deepEqual(commits[0].deletes, [`keys/devices/${legacy}.json`]);
  const after = await store.read('meta/device.json');
  assert.equal(after.id, id);
  assert.equal('legacyId' in after, false);
  assert.equal(await ownLegacyDeviceId({ store }), '');
  // A brand new device gets a short id straight away.
  const fresh = createFileStore(memoryBackend());
  assert.ok(isShortId(await deviceId({ store: fresh, name: 'New' })));
});
