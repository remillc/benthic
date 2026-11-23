// The join step (app/src/lib/account-join.js): a device that already has data meets an account that has data, over real
// git (tests/app/fake-bgit.mjs). The device that joins has typed its equipment again, with its own data key; the account's
// key is the other device's, so its box is a keyring that opens both and seals with the account key.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createFileStore, memoryBackend } from '../../app/src/lib/file-store.js';
import { createSecretBox, toBase64 } from '../../app/src/lib/secret-box.js';
import { createInventory, emptyEquipment } from '../../app/src/lib/inventory.js';
import { createProfile, emptyInfo } from '../../app/src/lib/profile.js';
import { createAccountSync, isSyncedPath, workingCopyName } from '../../app/src/lib/account-sync.js';
import { createAccountJoin, fillMerge } from '../../app/src/lib/account-join.js';
import { FakeBgit, FakeRemote } from './git-history-core.mjs';

let tick = Date.UTC(2026, 10, 23, 8, 0, 0);
const now = () => new Date((tick += 1000));

const boxOf = (byte) => {
  const key = toBase64(new Uint8Array(32).fill(byte));
  return createSecretBox({ read: async () => key, write: async () => { throw new Error('unexpected key write'); } });
};

/**
 * A real keyring (secret-box.js): the device's own key (`ownByte`, from its keeper) and the account key adopted as the one
 * that seals, as after a pairing. The earlier fake tried one box after the other, which the kid-aware `open` no longer allows.
 */
function keyring(accountByte, ownByte) {
  const box = boxOf(ownByte);
  const ready = box.adoptAccountKey(toBase64(new Uint8Array(32).fill(accountByte)));
  return new Proxy(box, {
    get(target, name) {
      const member = target[name];
      if (typeof member !== 'function' || ['setAccountKid', 'getAccountKid', 'heldKids'].includes(String(name))) return typeof member === 'function' ? member.bind(target) : member;
      return async (...args) => {
        await ready;
        return member.apply(target, args);
      };
    },
  });
}

function device(remote, name, box) {
  const core = new FakeBgit({ remote, name });
  const store = createFileStore(memoryBackend());
  const inventory = createInventory(store, { now });
  const profile = createProfile(store, box, { now });
  return {
    core, store, box, inventory, profile,
    sync: createAccountSync({ core, store, box, now }),
    join: createAccountJoin({ core, store, box, now }),
    files: async () => {
      const out = {};
      for (const p of await store.list('')) if (isSyncedPath(p)) out[p] = (await store.readSnapshot(p)).text;
      return out;
    },
  };
}

const done = (devices, remote) => {
  for (const d of devices) d.core.dispose();
  remote.dispose();
};
const folder = (remote, prefix) => Object.keys(remote.files()).filter((p) => p.startsWith(prefix));
const pending = async (d) => (await d.store.read('meta/pending.json'))?.paths ?? [];
const log = (remote) => execFileSync('git', ['log', '--format=%s', 'benthic'], { cwd: remote.dir, encoding: 'utf8' }).trim().split('\n');
const ID = '00000000-0000-4000-8000-';
const fixedId = (n) => `${ID}${String(n).padStart(12, '0')}`;

/** The account's data, made on a first device and sent. */
async function seedAccount(remote) {
  const a = device(remote, 'seed', boxOf(7));
  const mask = await a.inventory.saveGear({ name: 'Cressi mask', type: 'mask', brand: 'Cressi', model: 'Big Eyes' });
  const reg = await a.inventory.saveGear({ name: 'Reg', type: 'regulator', brand: 'Apeks', model: 'XTX200', serial: 'AP-100' });
  const computer = await a.inventory.saveGear({ name: 'Perdix', type: 'computer', brand: 'Shearwater', model: 'Perdix', computerModel: 'Shearwater Perdix', computerSerial: '1234' });
  const kit = await a.inventory.saveKit({ name: 'Cold water', gearIds: [reg.id, mask.id] });
  const task = await a.inventory.saveMaintenance({ gearId: reg.id, task: 'service', intervalMonths: 12, intervalDives: null });
  await a.inventory.noteMaintenance({ id: task.id, gearId: reg.id, task: 'service' }, { kind: 'service', doneOn: '2026-02-01', doneBy: 'Shop A' });
  await a.inventory.saveDiveEquipment('2026-10-10T10:00:00', { ...emptyEquipment(), gearIds: [mask.id] });
  await a.profile.saveInfo({ ...emptyInfo(), fullName: 'Ann Diver' });
  await a.profile.saveCertification({ agency: 'PADI', level: 'Open Water', number: '12345', photos: { front: new Uint8Array([1, 2, 3]) } });
  const first = await a.sync.run();
  assert.equal(first.status, 'synced');
  return { a, mask, reg, computer, kit, task };
}

/** The same diver's other device, with everything typed again (other ids). */
async function retype(remote, { serial = 'AP-100', extra = true } = {}) {
  const b = device(remote, 'joiner', keyring(7, 9));
  const mask = await b.inventory.saveGear({ name: 'Mask', type: 'mask', brand: 'Cressi', model: 'Big Eyes', note: 'blue skirt' });
  const reg = await b.inventory.saveGear({ name: 'My regulator', type: 'regulator', brand: 'Apeks', model: 'XTX200', serial, note: 'IP 9.5' });
  const computer = await b.inventory.saveGear({ name: 'Perdix', type: 'computer', computerModel: 'Shearwater Perdix', computerSerial: '1234', brand: 'Shearwater', model: 'Perdix' });
  const fins = extra ? await b.inventory.saveGear({ name: 'Fins', type: 'fins' }) : null;
  const kit = await b.inventory.saveKit({ name: 'cold  water', gearIds: [reg.id, mask.id, ...(fins ? [fins.id] : [])] });
  const task = await b.inventory.saveMaintenance({ gearId: reg.id, task: 'service', intervalMonths: 12, intervalDives: null });
  await b.inventory.noteMaintenance({ id: task.id, gearId: reg.id, task: 'service' }, { kind: 'service', doneOn: '2026-02-01', doneBy: 'Shop A' });
  await b.inventory.noteMaintenance({ id: task.id, gearId: reg.id, task: 'service' }, { kind: 'inspection', doneOn: '2026-08-01' });
  await b.inventory.saveDiveEquipment('2026-10-10T10:00:00', { ...emptyEquipment(), suitGearId: '', gearIds: [mask.id, reg.id], kitId: kit.id });
  await b.profile.saveInfo({ ...emptyInfo(), bloodGroup: 'A+' });
  await b.profile.saveCertification({ agency: 'PADI', level: 'Open Water', number: '12345', photos: { front: new Uint8Array([9, 9, 9, 9]) } });
  return { b, mask, reg, computer, fins, kit, task };
}

test('retyped duplicates are recognised: one file each on the server, the server\'s ids kept, references remapped, gaps filled', async () => {
  const remote = new FakeRemote();
  const seed = await seedAccount(remote);
  const { b, fins, kit: localKit } = await retype(remote);
  try {
    const analysis = await b.join.analyse();
    assert.equal(analysis.state, 'ready');
    assert.equal(analysis.byKind.gear.recognised, 3, 'mask, regulator (serial) and computer (model and serial)');
    assert.equal(analysis.byKind.gear.added, 1, 'the fins');
    assert.equal(analysis.byKind.kit.recognised, 1, 'the kit name is compared without case and spacing');
    assert.equal(analysis.byKind.maintenance.recognised, 1);
    assert.equal(analysis.byKind.diveEquipment.recognised, 1);
    assert.equal(analysis.byKind.certification.recognised, 1);
    assert.equal(analysis.byKind.profile.recognised, 1);
    assert.deepEqual(analysis.ambiguous, []);
    assert.equal(analysis.recognised, 8);
    assert.equal(analysis.added, 1);
    assert.equal(remote.files()[`gear/${fins.id}.json`], undefined, 'analysing sends nothing');
    assert.equal((await b.store.read('meta/sync.json')), null);

    const before = Object.keys(remote.files()).length;
    const result = await b.join.apply([]);
    assert.equal(result.state, 'joined');
    assert.equal(log(remote)[0], 'Joindre cet appareil', 'one commit');
    assert.equal(log(remote).filter((m) => m === 'Joindre cet appareil').length, 1);
    // Nothing doubled on the server; the only new files are the fins and the other card photo's file.
    assert.equal(folder(remote, 'gear/').length, 4);
    assert.equal(folder(remote, 'kits/').length, 1);
    assert.equal(folder(remote, 'maintenance/').length, 1);
    assert.equal(folder(remote, 'dive-equipment/').length, 1);
    assert.equal(folder(remote, 'certifications/').length, 1);
    assert.equal(folder(remote, 'profile/').length, 1);
    assert.ok(Object.keys(remote.files()).length >= before + 1);

    // The device holds the server's ids.
    const gear = await b.inventory.listGear();
    assert.deepEqual(gear.map((g) => g.id).sort(), [seed.mask.id, seed.reg.id, seed.computer.id, fins.id].sort());
    const reg = gear.find((g) => g.id === seed.reg.id);
    assert.equal(reg.note, 'IP 9.5', 'the empty field of the server is filled from the device');
    assert.equal(reg.name, 'My regulator', 'a differing value follows the newer file (the device\'s was typed later)');
    const [kit] = await b.inventory.listKits();
    assert.equal(kit.id, seed.kit.id);
    assert.deepEqual([...kit.gearIds].sort(), [seed.reg.id, seed.mask.id, fins.id].sort(), 'the local pieces are remapped and the new one added');
    assert.notEqual(kit.id, localKit.id);
    const [task] = await b.inventory.listMaintenance();
    assert.equal(task.id, seed.task.id);
    assert.equal(task.gearId, seed.reg.id);
    assert.deepEqual(task.history.map((h) => h.doneOn), ['2026-08-01', '2026-02-01'], 'the same service typed twice counts once');
    assert.equal(task.lastDoneOn, '2026-08-01');
    const [record] = await b.inventory.listDiveEquipment();
    assert.deepEqual([...record.gearIds].sort(), [seed.mask.id, seed.reg.id].sort());
    assert.equal(record.kitId, seed.kit.id);
    const info = await b.profile.readInfo();
    assert.equal(info.fullName, 'Ann Diver', 'the server\'s name');
    assert.equal(info.bloodGroup, 'A+', 'the device\'s blood group fills the gap');
    const certs = await b.profile.listCertifications();
    assert.equal(certs.length, 1);
    assert.equal(certs[0].number, '12345');

    // Joined: the device is in step, nothing is pending, and the next run changes nothing.
    assert.deepEqual(await pending(b), []);
    assert.equal((await b.store.read('meta/sync.json')).head, remote.head());
    const head = remote.head();
    const next = await b.sync.run();
    assert.equal(next.status, 'synced');
    assert.equal(remote.head(), head);
    await seed.a.sync.run();
    assert.deepEqual(await seed.a.files(), await b.files());
    done([seed.a, b], remote);
  } catch (e) {
    done([seed.a, b], remote);
    throw e;
  }
});

test('the card photo of a matched certification is sealed again for the server\'s card and still opens', async () => {
  const remote = new FakeRemote();
  const seed = await seedAccount(remote);
  const { b } = await retype(remote);
  try {
    // The server's card has a front photo already; the device's other photo has the same side, so it is not added twice.
    await b.join.apply([]);
    const [cert] = await b.profile.listCertifications();
    assert.equal(cert.documents.length, 1);
    const file = await b.store.read(`documents/${cert.documents[0].hash}.json`);
    assert.ok(file, 'the document file is on the device');
    const bytes = await b.box.openBytes(file.enc, { id: cert.id, format: 1 });
    assert.deepEqual([...bytes], [1, 2, 3], 'the server\'s photo is the one kept');
    assert.deepEqual(folder(remote, 'documents/').length, 1);
  } finally {
    done([seed.a, b], remote);
  }
});

test('a card the account does not have goes up, sealed with the account key, with its photo', async () => {
  const remote = new FakeRemote();
  const seed = await seedAccount(remote);
  const b = device(remote, 'joiner', keyring(7, 9));
  try {
    await b.inventory.saveGear({ name: 'Mask', type: 'mask', brand: 'Cressi', model: 'Big Eyes' });
    const own = createProfile(b.store, boxOf(9), { now });
    await own.saveCertification({ agency: 'SSI', level: 'Advanced', number: '777', photos: { front: new Uint8Array([5, 5]) } });
    const analysis = await b.join.analyse();
    assert.equal(analysis.byKind.certification.added, 1);
    assert.equal((await b.join.apply([])).state, 'joined');
    assert.equal(folder(remote, 'certifications/').length, 2);
    assert.equal(folder(remote, 'documents/').length, 2);
    const account = boxOf(7);
    for (const [path, text] of Object.entries(remote.files())) {
      if (!path.startsWith('certifications/')) continue;
      const file = JSON.parse(text);
      await account.open(file.enc, { id: file.id, format: 1 });
    }
    assert.equal((await b.profile.listCertifications()).length, 2);
    // Every document file on the server opens with the key of the card that names it.
    const owners = new Map();
    for (const path of folder(remote, 'certifications/')) {
      const file = JSON.parse(remote.files()[path]);
      for (const d of (await account.open(file.enc, { id: file.id, format: 1 })).documents ?? []) owners.set(d.hash, file.id);
    }
    assert.equal(owners.size, 2);
    for (const path of folder(remote, 'documents/')) {
      const hash = path.slice('documents/'.length, -'.json'.length);
      await account.openBytes(JSON.parse(remote.files()[path]).enc, { id: owners.get(hash), format: 1 });
    }
  } finally {
    done([seed.a, b], remote);
  }
});

test('a piece with a serial on one side only is ambiguous: « same » merges it, « two » keeps both', async () => {
  for (const choice of ['same', 'two']) {
    const remote = new FakeRemote();
    const seed = await seedAccount(remote);
    const { b, reg } = await retype(remote, { serial: '' });
    try {
      const analysis = await b.join.analyse();
      assert.equal(analysis.state, 'ready');
      assert.equal(analysis.ambiguous.length, 1);
      const [one] = analysis.ambiguous;
      assert.equal(one.kind, 'gear');
      assert.equal(one.local.id, reg.id);
      assert.equal(one.remote.id, seed.reg.id);
      assert.equal(analysis.byKind.gear.ambiguous, 1);

      // Unanswered counts as two pieces.
      const result = await b.join.apply([{ key: one.key, choice }]);
      assert.equal(result.state, 'joined');
      const gear = await b.inventory.listGear();
      assert.equal(gear.length, choice === 'same' ? 4 : 5);
      assert.equal(folder(remote, 'gear/').length, gear.length);
      const kit = (await b.inventory.listKits())[0];
      assert.ok(kit.gearIds.includes(choice === 'same' ? seed.reg.id : reg.id));
      assert.ok(gear.every((g) => g.id !== reg.id) === (choice === 'same'));
    } finally {
      done([seed.a, b], remote);
    }
  }
});

test('two identical pieces without serial on each side are ambiguous, never merged by themselves', async () => {
  const remote = new FakeRemote();
  const a = device(remote, 'seed', boxOf(7));
  const b = device(remote, 'joiner', boxOf(7));
  try {
    await a.inventory.saveGear({ name: 'Tank', type: 'cylinder', brand: 'Faber', model: '12L' });
    await a.inventory.saveGear({ name: 'Tank 2', type: 'cylinder', brand: 'Faber', model: '12L' });
    await a.sync.run();
    await b.inventory.saveGear({ name: 'Tank', type: 'cylinder', brand: 'Faber', model: '12L' });
    const analysis = await b.join.analyse();
    assert.equal(analysis.ambiguous.length, 2, 'both server tanks are candidates');
    assert.equal(analysis.recognised, 0);
    const joined = await b.join.apply([{ key: analysis.ambiguous[0].key, choice: 'same' }, { key: analysis.ambiguous[1].key, choice: 'same' }]);
    assert.equal(joined.state, 'joined');
    assert.equal((await b.inventory.listGear()).length, 2, 'the first answer is taken; a piece is matched once');
  } finally {
    done([a, b], remote);
  }
});

test('where both have a value and they differ, the newer file wins', async () => {
  const remote = new FakeRemote();
  const a = device(remote, 'seed', boxOf(7));
  const b = device(remote, 'joiner', boxOf(7));
  try {
    await a.inventory.saveGear({ name: 'Lamp', type: 'light', brand: 'Big Blue', model: 'VL4000', serial: 'L1', note: 'old note' });
    await a.sync.run();
    await b.inventory.saveGear({ name: 'Lamp', type: 'light', brand: 'Big Blue', model: 'VL4000', serial: 'L1', note: 'newer note' });
    await b.join.apply([]);
    assert.equal((await b.inventory.listGear())[0].note, 'newer note', 'the device\'s edit is later');
    assert.deepEqual(fillMerge({ a: 'x', t: ['1'] }, { a: 'y', t: ['2'] }, false), { a: 'x', t: ['1', '2'] });
    assert.deepEqual(fillMerge({ a: 'x', e: '' }, { a: 'y', e: 'z' }, true), { a: 'y', e: 'z' });
  } finally {
    done([a, b], remote);
  }
});

test('a gear photo follows its piece: the device\'s fills a gap, the server\'s wins otherwise', async () => {
  const remote = new FakeRemote();
  const a = device(remote, 'seed', boxOf(7));
  const b = device(remote, 'joiner', boxOf(7));
  try {
    const withBoth = await a.inventory.saveGear({ name: 'Cam', type: 'camera', brand: 'Sony', model: 'RX', serial: 'C1' });
    const remoteOnly = await a.inventory.saveGear({ name: 'Knife', type: 'knife', brand: 'Aqua', model: 'K', serial: 'K1' });
    const serverPhoto = await a.inventory.savePhoto('data:image/jpeg;base64,AAAA');
    await a.inventory.saveGear({ id: withBoth.id, name: 'Cam', type: 'camera', brand: 'Sony', model: 'RX', serial: 'C1', photoId: serverPhoto });
    await a.sync.run();
    const localPhoto = await b.inventory.savePhoto('data:image/jpeg;base64,BBBB');
    const knifePhoto = await b.inventory.savePhoto('data:image/jpeg;base64,CCCC');
    await b.inventory.saveGear({ name: 'Cam', type: 'camera', brand: 'Sony', model: 'RX', serial: 'C1', photoId: localPhoto });
    await b.inventory.saveGear({ name: 'Knife', type: 'knife', brand: 'Aqua', model: 'K', serial: 'K1', photoId: knifePhoto });
    assert.equal((await b.join.apply([])).state, 'joined');
    const cam = await b.inventory.getGear(withBoth.id);
    assert.equal(cam.photoId, serverPhoto);
    assert.equal(await b.inventory.readPhoto(localPhoto), '', 'the device\'s photo of a piece that has one is dropped');
    const knife = await b.inventory.getGear(remoteOnly.id);
    assert.equal(knife.photoId, knifePhoto, 'the server\'s piece had none: the device\'s photo is kept');
    assert.match(remote.files()[`gear-photos/${knifePhoto}.json`], /CCCC/);
    assert.equal(remote.files()[`gear-photos/${localPhoto}.json`], undefined);
  } finally {
    done([a, b], remote);
  }
});

test('a device signed in to a different account is told so and nothing happens', async () => {
  const remote = new FakeRemote();
  const seed = await seedAccount(remote);
  const { b } = await retype(remote);
  try {
    await b.store.write('meta/sync.json', { format: 1, accountKey: 'another/account', head: 'abc' });
    const analysis = await b.join.analyse();
    assert.equal(analysis.state, 'DIFFERENT_ACCOUNT');
    const applied = await b.join.apply([]);
    assert.equal(applied.state, 'DIFFERENT_ACCOUNT');
    assert.equal((await b.sync.run()).status, 'differentAccount');
    assert.equal(folder(remote, 'gear/').length, 3, 'nothing was uploaded');
  } finally {
    done([seed.a, b], remote);
  }
});

test('nothing to join when either side is empty; a joined device is not asked again', async () => {
  const remote = new FakeRemote();
  const b = device(remote, 'joiner', boxOf(7));
  try {
    assert.equal((await b.join.analyse()).state, 'nothing', 'both empty');
    await b.inventory.saveGear({ name: 'Mask', type: 'mask' });
    assert.equal((await b.join.analyse()).state, 'nothing', 'the server is empty: the engine sends everything');
    await b.sync.run();
    assert.equal((await b.join.analyse()).state, 'nothing', 'already in step with this account');
  } finally {
    done([b], remote);
  }
});

test('a push the server refused is planned again from its new state', async () => {
  const remote = new FakeRemote();
  const seed = await seedAccount(remote);
  const { b } = await retype(remote);
  try {
    let moved = false;
    b.core.before.bgitPush = async () => {
      if (moved) return;
      moved = true;
      await seed.a.inventory.saveGear({ name: 'Lamp', type: 'light' });
      await seed.a.sync.run();
    };
    const result = await b.join.apply([]);
    assert.equal(result.state, 'joined');
    assert.equal(b.core.calls.filter((c) => c === 'bgitPush').length, 2);
    assert.ok((await b.inventory.listGear()).some((g) => g.name === 'Lamp'), 'the server\'s new piece came too');
    assert.equal(workingCopyName(b.core.url).length > 8, true);
  } finally {
    done([seed.a, b], remote);
  }
});
