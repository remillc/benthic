// The cylinder types the diver added (task 2026-11-23-373): the files `cylinder-types/<id>.json`, their merge, the one list, the
// migration of the old device library, and the sync of the files between two devices over real git.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFileStore, memoryBackend } from '../../app/src/lib/file-store.js';
import { createSecretBox, toBase64 } from '../../app/src/lib/secret-box.js';
import { createInventory } from '../../app/src/lib/inventory.js';
import { createAccountSync, isSyncedPath, workingCopyName } from '../../app/src/lib/account-sync.js';
import { createAccountJoin } from '../../app/src/lib/account-join.js';
import {
  CYLINDER_TYPES_FOLDER, choiceSizes, commonSizes, coreStrings, mergeSameName, migratedTypes, newTypeFile, pathOfType, typeKey, unionTypes,
} from '../../app/src/lib/cylinder-type-files.js';
import { FakeBgit, FakeRemote } from './git-history-core.mjs';

let tick = Date.UTC(2026, 10, 23, 8, 0, 0);
const now = () => new Date((tick += 1000));
const stamp = () => now().toISOString().replace(/\.\d{3}Z$/, 'Z');

const file = (id, name, ml, mbar, updatedAt = '2026-11-23T08:00:00Z', createdAt = updatedAt) => ({ format: 1, id, name, ml, mbar, createdAt, updatedAt });
const byPath = (...files) => new Map(files.map((f) => [pathOfType(f.id), f]));

// --- The pure parts -----------------------------------------------------------------------------------------------------

test('a new file has the agreed shape, a short folder path and the trimmed name', () => {
  const f = newTypeFile({ id: 'abc', name: '  Steel 12  ', ml: 12000.4, mbar: 232000, stamp: '2026-11-23T08:00:00Z' });
  assert.deepEqual(f, { format: 1, id: 'abc', name: 'Steel 12', ml: 12000, mbar: 232000, createdAt: '2026-11-23T08:00:00Z', updatedAt: '2026-11-23T08:00:00Z' });
  assert.equal(pathOfType('abc'), 'cylinder-types/abc.json');
  assert.equal(CYLINDER_TYPES_FOLDER, 'cylinder-types/');
});

test('names are the same for two devices when only case, accents, spaces and punctuation differ', () => {
  assert.equal(typeKey('AL 80'), typeKey('al80'));
  assert.equal(typeKey('Acier 12 L'), typeKey('acier  12 l'));
  assert.notEqual(typeKey('AL80'), typeKey('AL63'));
});

test('two files for one name: the earliest id stays, the later size wins, the other file is removed', () => {
  const a = file('aaa', 'AL80', 11100, 207000, '2026-11-23T08:00:00Z');
  const b = file('bbb', 'al 80', 11300, 200000, '2026-11-23T09:00:00Z');
  const other = file('ccc', 'HP100', 12000, 237000);
  const changes = mergeSameName(byPath(a, b, other), () => '2026-11-23T10:00:00Z');
  assert.deepEqual([...changes.keys()].sort(), ['cylinder-types/aaa.json', 'cylinder-types/bbb.json']);
  assert.equal(changes.get('cylinder-types/bbb.json'), null);
  const kept = changes.get('cylinder-types/aaa.json');
  assert.equal(kept.id, 'aaa');
  assert.equal(kept.ml, 11300);
  assert.equal(kept.mbar, 200000);
  assert.equal(kept.name, 'al 80', 'the name of the file whose size won goes with it');
  assert.equal(kept.updatedAt, '2026-11-23T10:00:00Z');
  assert.equal(kept.createdAt, '2026-11-23T08:00:00Z');
});

test('two files for one name with the same size: the earliest id stays unchanged and the other goes', () => {
  const a = file('aaa', 'AL80', 11100, 207000, '2026-11-23T09:00:00Z', '2026-11-23T07:00:00Z');
  const b = file('bbb', 'AL80', 11100, 207000, '2026-11-23T08:00:00Z', '2026-11-23T07:00:00Z');
  const changes = mergeSameName(byPath(a, b), () => 'never');
  assert.deepEqual([...changes], [['cylinder-types/bbb.json', null]]);
});

test('no duplicate, nothing to do', () => {
  assert.equal(mergeSameName(byPath(file('a', 'AL80', 1, 1), file('b', 'AL63', 1, 1)), stamp).size, 0);
});

test('one list: the logbook\'s types and the added ones united by name; an added type a dive uses stays one row with its count', () => {
  const core = [
    { name: 'ALU 3L', ml: 3000, mbar: 200000, dives: 12 },
    { name: 'AL80', ml: 11100, mbar: 207000, dives: 3 },
  ];
  const files = [file('f1', 'al 80', 11200, 207000), file('f2', 'Steel 10L', 10000, 232000)];
  const rows = unionTypes(core, files);
  assert.deepEqual(rows.map((r) => [r.name, r.dives, r.fileId]), [['ALU 3L', 12, null], ['AL80', 3, 'f1'], ['Steel 10L', 0, 'f2']]);
  assert.equal(rows[1].ml, 11200, 'the diver\'s size is shown');
  // A type the core already has (given from the files) and no dive uses stays one row.
  const fed = unionTypes([...core, { name: 'Steel 10L', ml: 10000, mbar: 232000, dives: 0 }], files);
  assert.equal(fed.filter((r) => typeKey(r.name) === typeKey('Steel 10L')).length, 1);
  assert.equal(fed.find((r) => r.name === 'Steel 10L').fileId, 'f2');
});

test('the core is given « name TAB ml TAB mbar »', () => {
  assert.deepEqual(coreStrings([{ name: 'Steel 10L', ml: 10000, mbar: 232000 }]), ['Steel 10L\t10000\t232000']);
});

// --- The migration of the old library -----------------------------------------------------------------------------------

const defaults = [
  { name: 'AL80', ml: 11100, mbar: 206843, imperial: true },
  { name: 'HP100', ml: 12400, mbar: 237317, imperial: true },
  { name: '12L 232 bar', ml: 12000, mbar: 232000, imperial: false },
  { name: '10L 232 bar', ml: 10000, mbar: 232000, imperial: false },
];

test('migration: the types the diver added and standard types whose size changed become added types; untouched standard ones do not', () => {
  const library = [
    { name: 'AL80', ml: 11100, mbar: 206843 }, // untouched standard
    { name: 'HP100', ml: 12000, mbar: 237317 }, // standard, size changed by the diver
    { name: '12L 232 bar', ml: 12000, mbar: 232000 }, // untouched standard
    { name: 'Steel 10L', ml: 10000, mbar: 232000 }, // added by the diver
    { name: '10L 232 bar', ml: 10000, mbar: 200000 }, // standard name, other pressure: changed
  ];
  assert.deepEqual(migratedTypes(library, defaults).map((t) => t.name), ['HP100', 'Steel 10L', '10L 232 bar']);
});

test('migration: a library of untouched standard types migrates nothing', () => {
  assert.deepEqual(migratedTypes(defaults.map(({ name, ml, mbar }) => ({ name, ml, mbar })), defaults), []);
});

test('common sizes: the imperial names in cubic feet, litres and bar names otherwise; the choice list has a few of them', () => {
  assert.deepEqual(commonSizes(defaults, true).map((d) => d.name), ['AL80', 'HP100']);
  assert.deepEqual(commonSizes(defaults, false).map((d) => d.name), ['12L 232 bar', '10L 232 bar']);
  assert.deepEqual(choiceSizes(defaults, true).map((d) => d.name), ['AL80', 'HP100']);
  assert.deepEqual(choiceSizes(defaults, false).map((d) => d.name), ['10L 232 bar', '12L 232 bar']);
});

// --- Two devices, real git ----------------------------------------------------------------------------------------------

const boxOf = (byte) => {
  const key = toBase64(new Uint8Array(32).fill(byte));
  return createSecretBox({ read: async () => key, write: async () => { throw new Error('unexpected key write'); }, hadKey: async () => false });
};

function device(remote, name) {
  const core = new FakeBgit({ remote, name });
  const store = createFileStore(memoryBackend());
  const box = boxOf(7);
  const inventory = createInventory(store, { now });
  const sync = createAccountSync({ core, store, box, now });
  const join = createAccountJoin({ core, store, box, now });
  return { core, store, inventory, sync, join, dir: workingCopyName(core.url) };
}

const done = (devices, remote) => {
  for (const d of devices) d.core.dispose();
  remote.dispose();
};
const remoteTypes = (remote) => Object.entries(remote.files()).filter(([p]) => p.startsWith('cylinder-types/')).map(([p, t]) => [p, JSON.parse(t)]);
const types = async (d) => (await d.inventory.listCylinderTypes()).map((f) => `${f.name}:${f.ml}`).sort();

test('the folder is synced: a type added on one device shows on the other before any dive uses it; a rename follows; a deletion follows', async () => {
  assert.equal(isSyncedPath('cylinder-types/abc.json'), true);
  const remote = new FakeRemote();
  const a = device(remote, 'a');
  const b = device(remote, 'b');
  try {
    const made = newTypeFile({ id: 'type-one', name: 'Steel 10L', ml: 10000, mbar: 232000, stamp: stamp() });
    await a.inventory.changeCylinderTypes([made]);
    assert.equal((await a.sync.run()).status, 'synced');
    assert.deepEqual(remoteTypes(remote).map(([p]) => p), ['cylinder-types/type-one.json']);
    assert.equal((await b.sync.run()).status, 'synced');
    assert.deepEqual(await types(b), ['Steel 10L:10000']);

    await a.inventory.changeCylinderTypes([{ ...made, name: 'Steel 10 L', ml: 10100, updatedAt: stamp() }]);
    await a.sync.run();
    await b.sync.run();
    assert.deepEqual(await types(b), ['Steel 10 L:10100']);

    await a.inventory.changeCylinderTypes([], ['type-one']);
    await a.sync.run();
    assert.equal(remoteTypes(remote).length, 0, 'a deletion syncs as a deletion');
    await b.sync.run();
    assert.deepEqual(await types(b), []);
  } finally {
    done([a, b], remote);
  }
});

test('two devices that added different types keep both; the same file changed on both merges by field, the later updatedAt wins', async () => {
  const remote = new FakeRemote();
  const a = device(remote, 'a');
  const b = device(remote, 'b');
  try {
    await a.sync.run();
    await b.sync.run();
    const base = newTypeFile({ id: 'base-type', name: 'D7 232 bar', ml: 14000, mbar: 232000, stamp: stamp() });
    await a.inventory.changeCylinderTypes([base]);
    await a.sync.run();
    await b.sync.run();
    await a.inventory.changeCylinderTypes([{ ...base, ml: 14500, updatedAt: stamp() }, newTypeFile({ id: 'only-a', name: 'Alu 7', ml: 7000, mbar: 200000, stamp: stamp() })]);
    await b.inventory.changeCylinderTypes([{ ...base, mbar: 300000, updatedAt: stamp() }, newTypeFile({ id: 'only-b', name: 'Alu 11', ml: 11000, mbar: 200000, stamp: stamp() })]);
    await a.sync.run();
    await b.sync.run();
    await a.sync.run();
    for (const d of [a, b]) {
      const got = await d.inventory.listCylinderTypes();
      assert.deepEqual(got.map((f) => f.id).sort(), ['base-type', 'only-a', 'only-b']);
      const merged = got.find((f) => f.id === 'base-type');
      assert.equal(merged.ml, 14500, 'a changed the volume');
      assert.equal(merged.mbar, 300000, 'b changed the pressure');
    }
  } finally {
    done([a, b], remote);
  }
});

test('two devices that added the same name: the clean-up pass keeps the earliest id with the later size and removes the other file', async () => {
  const remote = new FakeRemote();
  const a = device(remote, 'a');
  const b = device(remote, 'b');
  try {
    await a.sync.run();
    await b.sync.run(); // both devices are on the account before they add the same type
    await a.inventory.changeCylinderTypes([newTypeFile({ id: '0000-a', name: 'AL80', ml: 11100, mbar: 207000, stamp: stamp() })]);
    await b.inventory.changeCylinderTypes([newTypeFile({ id: '0001-b', name: 'al 80', ml: 11300, mbar: 200000, stamp: stamp() })]);
    await a.sync.run();
    await b.sync.run();
    await a.sync.run();
    const onServer = remoteTypes(remote);
    assert.deepEqual(onServer.map(([p]) => p), ['cylinder-types/0000-a.json']);
    assert.equal(onServer[0][1].ml, 11300, 'b\'s size is the later one');
    assert.equal(onServer[0][1].mbar, 200000);
    assert.deepEqual(await types(a), await types(b));
    assert.equal((await b.inventory.listCylinderTypes()).length, 1);
  } finally {
    done([a, b], remote);
  }
});

test('joining: the device\'s own types are matched by normalised name with the account\'s; the others go up', async () => {
  const remote = new FakeRemote();
  const seed = device(remote, 'seed');
  const joiner = device(remote, 'joiner');
  try {
    await seed.inventory.changeCylinderTypes([newTypeFile({ id: 'srv-1', name: 'AL80', ml: 11100, mbar: 207000, stamp: stamp() })]);
    await seed.inventory.saveGear({ name: 'Mask', type: 'mask' });
    await seed.sync.run();
    await joiner.inventory.changeCylinderTypes([
      newTypeFile({ id: 'loc-1', name: 'al-80', ml: 11100, mbar: 207000, stamp: stamp() }),
      newTypeFile({ id: 'loc-2', name: 'Steel 10L', ml: 10000, mbar: 232000, stamp: stamp() }),
    ]);
    await joiner.inventory.saveGear({ name: 'Fins', type: 'fins' });
    const analysis = await joiner.join.analyse();
    assert.equal(analysis.state, 'ready');
    assert.equal((await joiner.join.apply([])).state, 'joined');
    assert.deepEqual(remoteTypes(remote).map(([p]) => p).sort(), ['cylinder-types/loc-2.json', 'cylinder-types/srv-1.json']);
    assert.deepEqual(await types(joiner), ['Steel 10L:10000', 'al-80:11100'], 'the server file keeps its id, the later name and size go with it, the duplicate of the device is gone');
  } finally {
    done([seed, joiner], remote);
  }
});

test('free and local mode: the files stay in the store and are tracked, not sent', async () => {
  const store = createFileStore(memoryBackend());
  const inventory = createInventory(store, { now });
  await inventory.changeCylinderTypes([newTypeFile({ id: 'local-1', name: 'Steel 10L', ml: 10000, mbar: 232000, stamp: stamp() })]);
  assert.deepEqual((await inventory.listCylinderTypes()).map((f) => f.name), ['Steel 10L']);
  assert.deepEqual((await store.read('meta/pending.json')).paths, ['cylinder-types/local-1.json']);
});
