// The equipment inventory (task 2026-11-17-267): the file store, pieces, kits, what a dive used, applying a kit and
// undoing it, a piece outside the inventory, the read-only flag after a subscription ends, the pending list.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFileStore, memoryBackend, sortedJson, indexedDbBackend } from '../../app/src/lib/file-store.js';
import {
  createInventory,
  applyKit,
  copyEquipment,
  addToEquipment,
  removeFromEquipment,
  emptyEquipment,
  sameEquipment,
  diveKeyOf,
  isUuid,
  newId,
  groupGear,
  searchGear,
  pieceFigures,
  kitSummary,
  kitProblems,
  gearProblems,
  readOnlyInfo,
  ReadOnlyError,
} from '../../app/src/lib/inventory.js';

function setup() {
  const backend = memoryBackend();
  const store = createFileStore(backend);
  let tick = 0;
  const inventory = createInventory(store, { now: () => new Date(Date.UTC(2026, 10, 17, 12, 0, tick++)) });
  return { backend, store, inventory };
}

const piece = (type, name, extra = {}) => ({ type, name, ...extra });

test('sortedJson sorts keys at every level, indents by two and ends with a newline', () => {
  assert.equal(sortedJson({ b: 1, a: { d: [{ z: 1, y: 2 }], c: undefined } }), '{\n  "a": {\n    "d": [\n      {\n        "y": 2,\n        "z": 1\n      }\n    ]\n  },\n  "b": 1\n}\n');
});

test('the store reads, lists, writes and removes, and a batch is applied as one', async () => {
  const { store } = setup();
  assert.equal(await store.read('gear/x.json'), null);
  await store.batch({ writes: [['gear/a.json', { id: 'a' }], ['gear/b.json', { id: 'b' }], ['kits/k.json', { id: 'k' }]] });
  assert.deepEqual(await store.list('gear/'), ['gear/a.json', 'gear/b.json']);
  assert.deepEqual((await store.readAll('gear/')).map((g) => g.id), ['a', 'b']);
  await store.batch({ writes: [['gear/c.json', { id: 'c' }]], removes: ['gear/a.json'] });
  assert.deepEqual(await store.list('gear/'), ['gear/b.json', 'gear/c.json']);
  await store.remove('gear/b.json');
  assert.equal(await store.read('gear/b.json'), null);
});

test('a corrupt file reads as missing instead of breaking the list', async () => {
  const { backend, store } = setup();
  await backend.apply([['gear/bad.json', '{nope'], ['gear/ok.json', '{"id":"ok"}\n']], []);
  assert.deepEqual((await store.readAll('gear/')).map((g) => g.id), ['ok']);
});

test('the IndexedDB backend has the same contract when IndexedDB exists', async (t) => {
  if (!globalThis.indexedDB) return t.skip('no IndexedDB in this Node');
  const store = createFileStore(indexedDbBackend());
  await store.write('gear/z.json', { id: 'z' });
  assert.deepEqual(await store.read('gear/z.json'), { id: 'z' });
  await store.remove('gear/z.json');
  await Promise.all([
    store.trackedBatch({ writes: [['gear/a.json', { version: 1 }]] }),
    store.trackedBatch({ removes: ['gear/deleted.json'] }),
  ]);
  const snapshot = await store.snapshotPending();
  await store.trackedBatch({ writes: [['gear/a.json', { version: 2 }]] });
  await store.acknowledgePending(snapshot);
  assert.deepEqual((await store.read('meta/pending.json')).paths, ['gear/a.json']);
});

test('concurrent tracked changes preserve both pending paths and deletions', async () => {
  const { store } = setup();
  await Promise.all([
    store.trackedBatch({ writes: [['gear/a.json', { id: 'a' }]] }),
    store.trackedBatch({ writes: [['profile/diver.json', { format: 1 }]] }),
    store.trackedBatch({ removes: ['kits/deleted.json'] }),
  ]);
  assert.deepEqual((await store.read('meta/pending.json')).paths, ['gear/a.json', 'kits/deleted.json', 'profile/diver.json']);
});

test('a corrupt pending list cannot be replaced by a tracked write', async () => {
  const { backend, store } = setup();
  await backend.apply([['meta/pending.json', '{invalid']], []);
  await assert.rejects(store.trackedBatch({ writes: [['gear/a.json', { id: 'a' }]] }));
  assert.equal(await store.read('gear/a.json'), null);
  assert.equal(await backend.get('meta/pending.json'), '{invalid');
});

test('acknowledging a snapshot keeps files changed during synchronization pending', async () => {
  const { store } = setup();
  await store.trackedBatch({ writes: [['gear/a.json', { version: 1 }], ['gear/b.json', { version: 1 }]], removes: ['kits/deleted.json'] });
  const snapshot = await store.snapshotPending();
  await store.trackedBatch({ writes: [['gear/a.json', { version: 2 }], ['kits/deleted.json', { restored: true }], ['profile/diver.json', { format: 1 }]] });
  await store.acknowledgePending(snapshot);
  assert.deepEqual((await store.read('meta/pending.json')).paths, ['gear/a.json', 'kits/deleted.json', 'profile/diver.json']);
});

test('a piece gets a UUID v4, is written under gear/<id>.json and keeps unknown fields', async () => {
  const { inventory, store } = setup();
  const g = await inventory.saveGear(piece('regulator', '  Apeks XTX50 ', { brand: 'Apeks', note: '' }));
  assert.ok(isUuid(g.id));
  assert.equal(g.name, 'Apeks XTX50');
  assert.equal('note' in g, false, 'an empty text is not stored');
  const file = await store.read(`gear/${g.id}.json`);
  assert.equal(file.format, 1);
  assert.equal(file.retired, false);
  await store.write(`gear/${g.id}.json`, { ...file, future: { x: 1 } });
  const changed = await inventory.saveGear({ id: g.id, type: 'regulator', name: 'Apeks XTX50 S', note: 'Deux étages' });
  assert.deepEqual(changed.future, { x: 1 });
  assert.equal(changed.brand, 'Apeks');
  assert.equal(changed.createdAt, g.createdAt);
  assert.equal((await inventory.listGear()).length, 1);
});

test('a piece needs a name and a real purchase date', async () => {
  const { inventory } = setup();
  assert.deepEqual(gearProblems({ name: ' ' }), { name: 'empty' });
  assert.deepEqual(gearProblems({ name: 'a', purchasedOn: '2026-02-30' }), { purchasedOn: 'date' });
  assert.deepEqual(gearProblems({ name: 'a', purchasedOn: '2021-05-12' }), {});
  await assert.rejects(inventory.saveGear(piece('other', '')), /INVALID_GEAR/);
});

test('archiving hides a piece from the list the screens use and keeps its file', async () => {
  const { inventory } = setup();
  const g = await inventory.saveGear(piece('suit', 'Bare Velocity'));
  await inventory.archiveGear(g.id, true);
  assert.equal((await inventory.getGear(g.id)).retired, true);
  await inventory.archiveGear(g.id, false);
  assert.equal((await inventory.getGear(g.id)).retired, false);
});

test('kits: one file each, names unique, at least one piece', async () => {
  const { inventory, store } = setup();
  const a = await inventory.saveGear(piece('regulator', 'Apeks'));
  const lamp = await inventory.saveGear(piece('light', 'Big Blue'));
  const kit = await inventory.saveKit({ name: 'Eau froide', gearIds: [a.id, lamp.id, a.id] });
  assert.deepEqual(kit.gearIds, [a.id, lamp.id]);
  assert.ok(await store.read(`kits/${kit.id}.json`));
  await assert.rejects(inventory.saveKit({ name: ' eau FROIDE ', gearIds: [a.id] }), /INVALID_KIT:name/);
  await assert.rejects(inventory.saveKit({ name: 'Vide', gearIds: [] }), /INVALID_KIT:gearIds/);
  assert.deepEqual(kitProblems({ name: 'x', gearIds: ['1'] }, [{ id: 'k', name: 'x' }]), { name: 'taken' });
  const renamed = await inventory.saveKit({ id: kit.id, name: 'Eau froide', gearIds: [a.id] });
  assert.equal(renamed.id, kit.id, 'saving a kit under its own name is not a duplicate');
  assert.equal((await inventory.listKits()).length, 1);
});

test('a kit of five pieces applied to a dive fills its equipment, and undo restores the previous one', async () => {
  const { inventory } = setup();
  const suit = await inventory.saveGear(piece('suit', 'Waterproof D7'));
  const under = await inventory.saveGear(piece('undersuit', 'Arctic'));
  const reg = await inventory.saveGear(piece('regulator', 'Apeks XTX50'));
  const lamp = await inventory.saveGear(piece('light', 'Big Blue'));
  const computer = await inventory.saveGear(piece('computer', 'Perdix 2'));
  const kit = await inventory.saveKit({ name: 'Eau froide', gearIds: [suit.id, under.id, reg.id, lamp.id, computer.id] });
  assert.equal(kit.gearIds.length, 5);
  const gearById = new Map((await inventory.listGear()).map((g) => [g.id, g]));

  const before = { ...emptyEquipment(), gearIds: [lamp.id], adhoc: [{ id: newId(), name: 'Bouée' }] };
  const after = applyKit(before, kit, gearById);
  assert.equal(after.suitGearId, suit.id);
  assert.equal(after.undersuitGearId, under.id);
  assert.deepEqual(after.gearIds.sort(), [lamp.id, reg.id].sort(), 'the lamp already there is not doubled; the computer is left to the dive');
  assert.deepEqual(after.adhoc, before.adhoc, 'a piece outside the inventory stays');
  assert.equal(after.kitId, kit.id);
  assert.deepEqual(before, { ...emptyEquipment(), gearIds: [lamp.id], adhoc: before.adhoc }, 'the value it started from is untouched, so « Annuler » only puts it back');
  assert.equal(sameEquipment(before, after), false);
  assert.equal(sameEquipment(before, structuredClone(before)), true);

  await inventory.saveDiveEquipment('2026-11-01T09:30:00', after);
  const saved = (await inventory.listDiveEquipment())[0];
  assert.equal(saved.diveKey.start, '2026-11-01T09:30:00');
  assert.equal(saved.kitId, kit.id);
  assert.equal(saved.suitGearId, suit.id);
  // « Annuler » after saving puts the record back.
  await inventory.saveDiveEquipment('2026-11-01T09:30:00', before);
  const undone = (await inventory.listDiveEquipment())[0];
  assert.equal(undone.suitGearId, '');
  assert.deepEqual(undone.gearIds, [lamp.id]);
  assert.equal(undone.kitId, '');
  assert.equal((await inventory.listDiveEquipment()).length, 1, 'the same record, not a second one');
});

test('a retired piece of a kit is not applied', () => {
  const g = { id: 'g', type: 'regulator', name: 'Old', retired: true };
  const out = applyKit(emptyEquipment(), { id: 'k', gearIds: ['g'] }, new Map([['g', g]]));
  assert.deepEqual(out.gearIds, []);
});

test('a piece outside the inventory lives on its dive only', async () => {
  const { inventory } = setup();
  const e = addToEquipment(emptyEquipment(), { adhocName: ' Saucisse ' });
  assert.deepEqual(e.adhoc.map((p) => p.name), ['Saucisse']);
  assert.ok(isUuid(e.adhoc[0].id));
  assert.equal(addToEquipment(e, { adhocName: 'saucisse' }).adhoc.length, 1, 'the same name twice is one piece');
  assert.equal(addToEquipment(e, { adhocName: '   ' }).adhoc.length, 1);
  await inventory.saveDiveEquipment('2014-04-02T10:00:00', e);
  assert.deepEqual(await inventory.listGear(), [], 'nothing enters the inventory');
  const rec = (await inventory.listDiveEquipment())[0];
  assert.equal(rec.adhoc[0].name, 'Saucisse');
  assert.equal(removeFromEquipment(e, { adhocId: e.adhoc[0].id }).adhoc.length, 0);
});

test('« Comme la précédente » copies the previous dive, with new ids for its loose pieces', () => {
  const prev = { ...emptyEquipment(), suitGearId: 's', gearIds: ['a'], adhoc: [{ id: 'old', name: 'Bouée' }], kitId: 'k' };
  const copy = copyEquipment(prev);
  assert.equal(copy.suitGearId, 's');
  assert.deepEqual(copy.gearIds, ['a']);
  assert.equal(copy.kitId, 'k');
  assert.notEqual(copy.adhoc[0].id, 'old');
  assert.equal(copy.adhoc[0].name, 'Bouée');
  assert.deepEqual(copyEquipment(null), emptyEquipment());
});

test('an equipment emptied removes the dive file; deleting a piece clears every link to it', async () => {
  const { inventory } = setup();
  const reg = await inventory.saveGear(piece('regulator', 'Apeks'));
  const suit = await inventory.saveGear(piece('suit', 'D7'));
  const kit = await inventory.saveKit({ name: 'K', gearIds: [reg.id, suit.id] });
  await inventory.saveDiveEquipment('d1', { ...emptyEquipment(), gearIds: [reg.id], suitGearId: suit.id, kitId: kit.id });
  await inventory.deleteGear(reg.id);
  assert.equal(await inventory.getGear(reg.id), null);
  assert.deepEqual((await inventory.listKits())[0].gearIds, [suit.id]);
  const rec = (await inventory.listDiveEquipment())[0];
  assert.deepEqual(rec.gearIds, []);
  assert.equal(rec.suitGearId, suit.id);
  await inventory.deleteKit(kit.id);
  assert.equal((await inventory.listDiveEquipment())[0].kitId, '');
  await inventory.saveDiveEquipment('d1', emptyEquipment());
  assert.deepEqual(await inventory.listDiveEquipment(), []);
});

test('a dive is keyed by its start time, and an edited start time re-keys its record', async () => {
  const { inventory } = setup();
  assert.equal(diveKeyOf({ date: '2014-04-02T10:00:00' }), '2014-04-02T10:00:00');
  assert.equal(diveKeyOf({ date: '2014-04-02T10:00:00.000Z' }), '2014-04-02T10:00:00');
  await inventory.saveDiveEquipment('2014-04-02T10:00:00', { ...emptyEquipment(), gearIds: ['a'] });
  await inventory.rekeyDive('2014-04-02T10:00:00', '2014-04-02T10:05:00');
  const list = await inventory.listDiveEquipment();
  assert.equal(list.length, 1);
  assert.equal(list[0].diveKey.start, '2014-04-02T10:05:00');
  await inventory.forgetDive('2014-04-02T10:05:00');
  assert.deepEqual(await inventory.listDiveEquipment(), []);
});

test('read only: every write is refused, reads keep working, and the flag can be lifted', async () => {
  const { inventory, store } = setup();
  const g = await inventory.saveGear(piece('regulator', 'Apeks'));
  await inventory.setReadOnly(true);
  const state = await inventory.readState();
  assert.ok(state.readOnlyFrom);
  await assert.rejects(inventory.saveGear(piece('other', 'x')), ReadOnlyError);
  await assert.rejects(inventory.archiveGear(g.id, true), ReadOnlyError);
  await assert.rejects(inventory.deleteGear(g.id), ReadOnlyError);
  await assert.rejects(inventory.saveKit({ name: 'K', gearIds: [g.id] }), ReadOnlyError);
  await assert.rejects(inventory.saveDiveEquipment('d', { ...emptyEquipment(), gearIds: [g.id] }), ReadOnlyError);
  assert.deepEqual((await inventory.recordDownloadedComputer({ model: 'X', serial: '1', firmware: '' })), { added: false, gear: null });
  assert.equal((await inventory.listGear()).length, 1, 'reads still work');
  assert.ok(await store.read(`gear/${g.id}.json`));
  // Turning it on twice keeps the first date.
  await inventory.setReadOnly(true);
  assert.equal((await inventory.readState()).readOnlyFrom, state.readOnlyFrom);
  await inventory.setReadOnly(false);
  assert.equal((await inventory.readState()).readOnlyFrom, null);
  await inventory.saveGear(piece('other', 'x'));
});

test('read-only notice: 30 days from the end, never below 0', () => {
  assert.deepEqual(readOnlyInfo({ readOnlyFrom: null }), { readOnly: false, daysLeft: 30, until: '' });
  const from = '2026-11-17T12:00:00Z';
  assert.deepEqual(readOnlyInfo({ readOnlyFrom: from }, new Date('2026-11-17T12:00:00Z')), { readOnly: true, daysLeft: 30, until: '2026-12-17' });
  assert.equal(readOnlyInfo({ readOnlyFrom: from }, new Date('2026-12-10T00:00:00Z')).daysLeft, 8);
  assert.equal(readOnlyInfo({ readOnlyFrom: from }, new Date('2027-03-01T00:00:00Z')).daysLeft, 0);
});

test('what changed here and is not sent yet is listed, offline or not, until the server takes it', async () => {
  const { inventory } = setup();
  assert.deepEqual(await inventory.pendingPaths(), []);
  const g = await inventory.saveGear(piece('regulator', 'Apeks'));
  await inventory.saveKit({ name: 'K', gearIds: [g.id] });
  const paths = await inventory.pendingPaths();
  assert.equal(paths.length, 2);
  assert.ok(paths.includes(`gear/${g.id}.json`));
  await inventory.clearPending();
  assert.deepEqual(await inventory.pendingPaths(), []);
  await inventory.deleteGear(g.id);
  assert.ok((await inventory.pendingPaths()).includes(`gear/${g.id}.json`), 'a deletion is sent too');
});

test('the first download of a computer adds it with serial and firmware; the next one only refreshes the firmware', async () => {
  const { inventory } = setup();
  const first = await inventory.recordDownloadedComputer({ vendor: 'Shearwater', model: 'Perdix 2', serial: '4A21F7', firmware: '91' });
  assert.equal(first.added, true);
  assert.equal(first.gear.type, 'computer');
  assert.equal(first.gear.serial, '4A21F7');
  assert.equal(first.gear.firmware, '91');
  assert.equal(first.gear.firmwareReadAt, '2026-11-17');
  const again = await inventory.recordDownloadedComputer({ vendor: 'Shearwater', model: 'Perdix 2', serial: '4A21F7', firmware: '92' });
  assert.equal(again.added, false);
  assert.equal((await inventory.listGear()).length, 1);
  assert.equal((await inventory.listGear())[0].firmware, '92');
  const other = await inventory.recordDownloadedComputer({ vendor: 'Garmin', model: 'Descent G1', serial: '3390071', firmware: '' });
  assert.equal(other.added, true);
  assert.equal('firmware' in other.gear, false, 'no firmware read: nothing shown');
  assert.equal((await inventory.listGear()).length, 2);
});

test('groups: inventory page groups and picker groups, sorted by name, empty ones left out', () => {
  const g = (type, name) => ({ id: name, type, name, retired: false });
  const all = [g('light', 'Lampe'), g('undersuit', 'Arctic'), g('suit', 'D7'), g('computer', 'Perdix'), g('regulator', 'Apeks'), g('other', 'Ceinture'), g('cylinder', 'AL80')];
  assert.deepEqual(groupGear(all).map((x) => [x.group, x.items.map((i) => i.name)]), [
    ['computer', ['Perdix']],
    ['regulator', ['Apeks']],
    ['suit', ['Arctic', 'D7']],
    ['cylinder', ['AL80']],
    ['other', ['Ceinture', 'Lampe']],
  ]);
  assert.deepEqual(groupGear(all, { picker: true }).map((x) => x.group), ['regulator', 'suit', 'undersuit', 'cylinder', 'light', 'other']);
  assert.deepEqual(groupGear([g('computer', 'P')], { picker: true }), [], 'no computers in the picker');
});

test('search ignores case and accents and needs every word', () => {
  const all = [{ name: 'Détendeur Apeks', brand: 'Apeks', serial: '' }, { name: 'Lampe', brand: 'Big Blue', note: 'principale' }];
  assert.equal(searchGear(all, 'detendeur').length, 1);
  assert.equal(searchGear(all, 'big principale').length, 1);
  assert.equal(searchGear(all, 'apeks lampe').length, 0);
  assert.equal(searchGear(all, '  ').length, 2);
});

test('the figures of a piece come from the dives that used it', () => {
  const dives = [
    { date: '2026-11-01T09:30:00', maxDepthMm: 28000, durationSeconds: 3600 },
    { date: '2026-11-03T10:00:00', maxDepthMm: 62000, durationSeconds: 2400 },
    { date: '2026-10-01T10:00:00', maxDepthMm: 90000, durationSeconds: 100 },
  ];
  assert.deepEqual(pieceFigures(['2026-11-01T09:30:00', '2026-11-03T10:00:00'], dives), { dives: 2, seconds: 6000, deepestMm: 62000, last: '2026-11-03T10:00:00' });
  assert.deepEqual(pieceFigures([], dives), { dives: 0, seconds: 0, deepestMm: 0, last: '' });
});

test('a kit summary names its first pieces and leaves the computers out', () => {
  const m = new Map([['1', { id: '1', type: 'computer', name: 'Perdix' }], ['2', { id: '2', type: 'regulator', name: 'Apeks' }], ['3', { id: '3', type: 'light', name: 'Lampe' }]]);
  assert.equal(kitSummary({ gearIds: ['1', '2', '3', 'gone'] }, m), 'Apeks, Lampe');
  assert.equal(kitSummary({ gearIds: ['2', '3'] }, m, 1), 'Apeks');
});

test('ids are UUID v4', () => {
  assert.ok(isUuid(newId()));
  assert.notEqual(newId(), newId());
  assert.equal(isUuid('123'), false);
});

test('isBuoyName recognises the surface marker buoy by its names', async () => {
  const { isBuoyName } = await import('../../app/src/lib/inventory.js');
  for (const n of ['Saucisse', 'saucisse orange', 'Parachute de palier', 'Surface marker buoy', 'DSMB', 'Bouée']) assert.ok(isBuoyName(n), n);
  for (const n of ['Détendeur', 'Gilet', '', undefined]) assert.ok(!isBuoyName(n), String(n));
});
