// The stable dive id: the plan that gives the ids (none, repeated), the routes, the key of the records, and the move of the
// references from the start time to the id on two devices over real git (app/src/lib/dive-id.js, dive-id-migration.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assignMissingIds,
  benthicIdOf,
  coreIdOf,
  coreIdOfParam,
  diveParamOf,
  diveUrl,
  diveUrlOfCore,
  idsLookIncomplete,
  planBenthicIds,
  useDives,
} from '../../app/src/lib/dive-id.js';
import { isShortId } from '../../app/src/lib/short-id.js';
import { createFileStore, memoryBackend, sortedJson } from '../../app/src/lib/file-store.js';
import { createSecretBox, toBase64 } from '../../app/src/lib/secret-box.js';
import { createInventory, diveKeyOf, emptyEquipment, keyField, recordKey } from '../../app/src/lib/inventory.js';
import { createProfile } from '../../app/src/lib/profile.js';
import { createAccountSync, isSyncedPath, workingCopyName } from '../../app/src/lib/account-sync.js';
import { planDiveIds, startToIdMap } from '../../app/src/lib/dive-id-migration.js';
import { itemsFor, signatureRecord } from '../../app/src/lib/validation.js';
import { mediaPathOf } from '../../app/src/lib/dive-media.js';
import { parseLink } from '../../app/src/lib/deep-link.js';
import { FakeBgit, FakeRemote } from './git-history-core.mjs';

/** A generator that gives 'aaaaaaaaa0', 'aaaaaaaaa1'... (valid ids, in order). */
function counter(start = 0) {
  let n = start;
  const alphabet = '0123456789abcdefghjkmnpqrstvwxyz';
  return () => 'a'.repeat(8) + alphabet[Math.floor(n / 32) % 32] + alphabet[n++ % 32];
}

test('a dive with no id gets one; of dives that share an id the later one by start time gets a new one', () => {
  const audit = [
    { id: 1, benthicId: '', when: 100 },
    { id: 2, benthicId: '7k2m9q4x1d', when: 300 },
    { id: 3, benthicId: '7k2m9q4x1d', when: 200 },
    { id: 4, benthicId: '0abcdefghj', when: 50 },
    { id: 5, benthicId: 'not an id', when: 60 },
  ];
  const plan = planBenthicIds(audit, counter());
  assert.deepEqual(Object.keys(plan).sort(), ['1', '2', '5'], 'dive 3 (earlier) keeps the id, dive 2 (later) gets another');
  assert.ok(Object.values(plan).every(isShortId));
  assert.equal(new Set(Object.values(plan)).size, 3);
  assert.deepEqual(planBenthicIds([{ id: 1, benthicId: '7k2m9q4x1d', when: 1 }], counter()), {}, 'nothing to do');
});

test('two dives with the same id and the same start: the table order breaks the tie, the first keeps it', () => {
  const plan = planBenthicIds([{ id: 9, benthicId: '7k2m9q4x1d', when: 5 }, { id: 4, benthicId: '7k2m9q4x1d', when: 5 }], counter());
  assert.deepEqual(Object.keys(plan), ['4']);
});

test('a made id never repeats one of the log, even when the generator draws it', () => {
  const draws = ['7k2m9q4x1d', 'aaaaaaaaa1'];
  const plan = planBenthicIds([{ id: 1, benthicId: '7k2m9q4x1d', when: 1 }, { id: 2, benthicId: '', when: 2 }], () => draws.shift() ?? 'aaaaaaaaa2');
  assert.deepEqual(plan, { 2: 'aaaaaaaaa1' });
});

test('assignMissingIds audits, assigns what is planned, and tells how many; a log that cannot be written gives 0', async () => {
  const calls = [];
  const core = {
    async benthicIds(o) {
      calls.push(o.action);
      if (o.action === 'audit') return [{ id: 1, benthicId: '', when: 1 }, { id: 2, benthicId: '7k2m9q4x1d', when: 2 }];
      return { assigned: Object.keys(JSON.parse(o.assignments)).length };
    },
  };
  assert.equal(await assignMissingIds(core, counter()), 1);
  assert.deepEqual(calls, ['audit', 'assign']);
  const full = { benthicIds: async () => [{ id: 1, benthicId: '7k2m9q4x1d', when: 1 }] };
  assert.equal(await assignMissingIds(full, counter()), 0);
  const locked = { benthicIds: async (o) => { if (o.action === 'audit') return [{ id: 1, benthicId: '', when: 1 }]; throw new Error('WRITE_LOCKED'); } };
  const quiet = console.error;
  console.error = () => {};
  try {
    assert.equal(await assignMissingIds(locked, counter()), 0);
  } finally {
    console.error = quiet;
  }
});

test('the list looks incomplete with a dive that has no id or two that share one', () => {
  assert.equal(idsLookIncomplete([{ benthicId: '7k2m9q4x1d' }, { benthicId: '0abcdefghj' }]), false);
  assert.equal(idsLookIncomplete([{ benthicId: '7k2m9q4x1d' }, { benthicId: '' }]), true);
  assert.equal(idsLookIncomplete([{ benthicId: '7k2m9q4x1d' }, { benthicId: '7k2m9q4x1d' }]), true);
});

test('routes hold the Benthic id; an old numeric address is read as a core id; both ids convert in one place', () => {
  const dives = [{ id: 12, benthicId: '7k2m9q4x1d', date: '2026-11-23T09:30:00' }, { id: 13, benthicId: '', date: '2026-11-23T14:00:00' }];
  useDives(() => dives);
  assert.equal(diveUrl(dives[0]), '/dives/7k2m9q4x1d');
  assert.equal(diveUrl(dives[1]), '/dives/13', 'a dive with no id yet keeps the core id for its address');
  assert.equal(diveUrlOfCore(12), '/dives/7k2m9q4x1d');
  assert.equal(diveParamOf(12), '7k2m9q4x1d');
  assert.equal(coreIdOf('7k2m9q4x1d'), 12);
  assert.equal(benthicIdOf(12), '7k2m9q4x1d');
  assert.equal(coreIdOfParam('7k2m9q4x1d'), 12);
  assert.equal(coreIdOfParam('13'), 13, 'a link in flight');
  assert.equal(coreIdOfParam('zzzzzzzzzz'), 0, 'no such dive');
  assert.equal(coreIdOfParam('new'), 0);
  assert.equal(coreIdOfParam(undefined), 0);
  // The core ids are renumbered at the next read: the same address finds the same dive.
  const reread = [{ id: 40, benthicId: '7k2m9q4x1d', date: '2026-11-23T09:30:00' }];
  assert.equal(coreIdOfParam('7k2m9q4x1d', reread), 40);
});

test('a link holds the Benthic id, and the links shared with the start time still open the dive', () => {
  assert.deepEqual(parseLink('https://benthicdivelog.app/dives/7k2m9q4x1d'), { kind: 'dive', stamp: '', date: '', benthicId: '7k2m9q4x1d' });
  assert.equal(parseLink('https://benthicdivelog.app/dives/at/20121105T101500').kind, 'dive');
  assert.equal(parseLink('https://benthicdivelog.app/dives/42').kind, 'unknown');
});

test('a dive is keyed by its id, by its start time until it has one; a record reads either', () => {
  assert.equal(diveKeyOf({ date: '2026-11-23T09:30:00', benthicId: '7k2m9q4x1d' }), '7k2m9q4x1d');
  assert.equal(diveKeyOf({ date: '2026-11-23T09:30:00' }), '2026-11-23T09:30:00');
  assert.deepEqual(keyField('7k2m9q4x1d'), { benthicId: '7k2m9q4x1d' });
  assert.deepEqual(keyField('2026-11-23T09:30:00'), { start: '2026-11-23T09:30:00' });
  assert.equal(recordKey({ benthicId: '7k2m9q4x1d', start: 'x' }), '7k2m9q4x1d');
  assert.equal(recordKey({ start: '2026-11-23T09:30:00' }), '2026-11-23T09:30:00');
  assert.equal(recordKey(undefined), '');
  // The start time changing does not move a dive's key.
  assert.equal(diveKeyOf({ date: '2026-11-24T10:00:00', benthicId: '7k2m9q4x1d' }), diveKeyOf({ date: '2026-11-23T09:30:00', benthicId: '7k2m9q4x1d' }));
});

const DIVES = [
  { id: 1, benthicId: '0abcdefghj', date: '2026-11-01T10:00:00' },
  { id: 2, benthicId: '7k2m9q4x1d', date: '2026-11-02T09:00:00' },
  { id: 3, benthicId: '1bbbbbbbbb', date: '2026-11-03T09:00:00' },
  { id: 4, benthicId: '', date: '2026-11-04T09:00:00' },
];

test('start -> id: only dives with an id, and the smallest id when two dives start together', () => {
  const map = startToIdMap([...DIVES, { id: 5, benthicId: '0aaaaaaaaa', date: '2026-11-02T09:00:00.000' }]);
  assert.equal(map.get('2026-11-01T10:00:00'), '0abcdefghj');
  assert.equal(map.get('2026-11-02T09:00:00'), '0aaaaaaaaa');
  assert.equal(map.has('2026-11-04T09:00:00'), false);
});

test('the plan moves equipment, validations and media to the id, keeps what is unmatched, and does not touch dates', () => {
  const startToId = startToIdMap(DIVES);
  const files = new Map([
    ['dive-equipment/e1.json', { format: 1, id: 'e1', diveKey: { start: '2026-11-01T10:00:00' }, gearIds: ['g'], updatedAt: '2026-11-05T00:00:00Z' }],
    ['dive-equipment/e2.json', { format: 1, id: 'e2', diveKey: { start: '2026-11-04T09:00:00' }, gearIds: [], updatedAt: '2026-11-05T00:00:00Z' }],
    ['dive-equipment/e3.json', { format: 1, id: 'e3', diveKey: { benthicId: '7k2m9q4x1d' }, gearIds: [], updatedAt: '2026-11-05T00:00:00Z' }],
    ['dive-validations/v1.json', { format: 1, id: 'v1', dives: [{ start: '2026-11-02T09:00:00', hash: 'h1' }, { start: '2026-11-04T09:00:00', hash: 'h4' }] }],
    ['media/2026-11-03T09-00-00.json', { format: 1, diveId: '2026-11-03T09:00:00', items: [{ hash: 'a'.repeat(64), mime: 'image/jpeg' }] }],
    ['gear/g.json', { id: 'g' }],
  ]);
  const { writes, removes } = planDiveIds({ files, startToId });
  assert.deepEqual(writes.get('dive-equipment/e1.json'), { format: 1, id: 'e1', diveKey: { benthicId: '0abcdefghj' }, gearIds: ['g'], updatedAt: '2026-11-05T00:00:00Z' });
  assert.equal(writes.has('dive-equipment/e2.json'), false, 'a start with no id yet is kept');
  assert.equal(writes.has('dive-equipment/e3.json'), false, 'a migrated file is left alone');
  assert.deepEqual(writes.get('dive-validations/v1.json').dives, [{ benthicId: '7k2m9q4x1d', hash: 'h1' }, { start: '2026-11-04T09:00:00', hash: 'h4' }]);
  assert.deepEqual(writes.get('media/1bbbbbbbbb.json'), { format: 1, diveId: '1bbbbbbbbb', items: [{ hash: 'a'.repeat(64), mime: 'image/jpeg' }] });
  assert.deepEqual(removes, ['media/2026-11-03T09-00-00.json']);
  assert.equal(writes.has('gear/g.json'), false);
  // Run on its own output, it has nothing to do.
  const next = new Map([...files, ...writes]);
  for (const p of removes) next.delete(p);
  const again = planDiveIds({ files: next, startToId });
  assert.equal(again.writes.size, 0);
  assert.equal(again.removes.length, 0);
  assert.equal(planDiveIds({ files, startToId: new Map() }).writes.size, 0, 'with no ids in the logbook nothing moves');
});

test('media of the start time and media already at the id are merged, by hash', () => {
  const startToId = startToIdMap(DIVES);
  const item = (c, extra = {}) => ({ hash: c.repeat(64), mime: 'image/jpeg', size: 1, takenAt: '', caption: '', thumb: '', ...extra });
  const files = new Map([
    ['media/2026-11-03T09-00-00.json', { format: 1, diveId: '2026-11-03T09:00:00', items: [item('a'), item('b')] }],
    ['media/1bbbbbbbbb.json', { format: 1, diveId: '1bbbbbbbbb', items: [item('b'), item('c')] }],
  ]);
  const { writes, removes } = planDiveIds({ files, startToId });
  assert.deepEqual(writes.get('media/1bbbbbbbbb.json').items.map((i) => i.hash[0]).sort(), ['a', 'b', 'c']);
  assert.deepEqual(removes, ['media/2026-11-03T09-00-00.json']);
});

test('validations follow the dive by its id; a validation made with the start time is still found while it is unmigrated', () => {
  const dive = { benthicId: '7k2m9q4x1d', date: '2026-11-02T09:00:00', durationSeconds: 60 };
  const record = signatureRecord({ id: 'v', signer: { name: 'Ana', role: 'buddy' }, signature: 'x', dives: [dive], now: new Date(Date.UTC(2026, 10, 23)) });
  assert.deepEqual(record.dives[0].benthicId, '7k2m9q4x1d');
  assert.equal(itemsFor([record], dive).length, 1);
  assert.equal(itemsFor([record], { ...dive, date: '2027-01-01T00:00:00' }).length, 1, 'the start time changing does not lose it');
  const legacy = { ...record, dives: [{ start: '2026-11-02T09:00:00', hash: record.dives[0].hash }] };
  assert.equal(itemsFor([legacy], { ...dive, benthicId: '' }).length, 1);
});

// --- Two devices over real git ---------------------------------------------------------------------------------------------

let tick = Date.UTC(2026, 10, 23, 8, 0, 0);
const now = () => new Date((tick += 1000));
const boxFor = (byte) => createSecretBox({ read: async () => toBase64(new Uint8Array(32).fill(byte)), write: async () => { throw new Error('unexpected key write'); }, hadKey: async () => false });

/** A device with its own logbook (the dives it holds, with or without ids). */
function device(remote, name, getDives) {
  const core = new FakeBgit({ remote, name });
  const store = createFileStore(memoryBackend());
  const box = boxFor(7);
  const inventory = createInventory(store, { now });
  const profile = createProfile(store, box, { now });
  const sync = createAccountSync({ core, store, box, now, diveIds: () => startToIdMap(getDives()) });
  const files = async () => {
    const out = {};
    for (const p of await store.list('')) if (isSyncedPath(p)) out[p] = (await store.readSnapshot(p)).text;
    return out;
  };
  return { core, store, inventory, profile, sync, files, dir: workingCopyName(core.url) };
}

test('two devices: the references made with start times end up on the ids, the same on both, and nothing is lost', async () => {
  const remote = new FakeRemote();
  let logbookA = DIVES.map((d) => ({ ...d, benthicId: '' }));
  const a = device(remote, 'a', () => logbookA);
  const b = device(remote, 'b', () => DIVES);
  try {
    // Device A works before the ids: equipment, a validation and a photo reference, all by start time.
    const mask = await a.inventory.saveGear({ name: 'Mask', type: 'mask' });
    await a.inventory.saveDiveEquipment('2026-11-01T10:00:00', { ...emptyEquipment(), gearIds: [mask.id] });
    await a.inventory.saveDiveEquipment('2026-11-04T09:00:00', { ...emptyEquipment(), gearIds: [mask.id] });
    const validation = signatureRecord({ id: 'val1', signer: { name: 'Ana', role: 'buddy' }, signature: 'x', dives: [{ date: '2026-11-02T09:00:00', durationSeconds: 1 }], now: new Date(Date.UTC(2026, 10, 23)) });
    await a.inventory.commitFiles([[`dive-validations/${validation.id}.json`, validation]]);
    await a.inventory.commitFiles([[mediaPathOf('2026-11-03T09:00:00'), { format: 1, diveId: '2026-11-03T09:00:00', items: [{ hash: 'a'.repeat(64), mime: 'image/jpeg', size: 1, takenAt: '', caption: '', thumb: '' }] }]]);
    assert.equal((await a.sync.run()).status, 'synced');

    // Device B has the ids already (the logbook it holds has them); it pulls, and the clean-up pass moves the server's files.
    assert.equal((await b.sync.run()).status, 'synced');
    const serverAfterB = remote.files();
    assert.ok(Object.keys(serverAfterB).includes('media/1bbbbbbbbb.json'), 'the media file is under the id');
    assert.ok(!Object.keys(serverAfterB).includes('media/2026-11-03T09-00-00.json'));
    const equipmentOnServer = Object.entries(serverAfterB).filter(([p]) => p.startsWith('dive-equipment/')).map(([, t]) => JSON.parse(t).diveKey);
    assert.deepEqual(equipmentOnServer.map((k) => k.benthicId ?? k.start).sort(), ['0abcdefghj', '2026-11-04T09:00:00'], 'the dive with no id yet keeps its start time');
    const validationOnServer = JSON.parse(serverAfterB['dive-validations/val1.json']);
    assert.deepEqual(validationOnServer.dives[0].benthicId, '7k2m9q4x1d');

    // A's logbook gets its ids later (the same ones: they travel in the logbook); its next run converges, and so does the last dive's.
    logbookA = DIVES.map((d) => ({ ...d }));
    logbookA[3] = { ...logbookA[3], benthicId: '2ccccccccc' };
    const shared = logbookA;
    const bLater = () => shared;
    b.sync = createAccountSync({ core: b.core, store: b.store, box: boxFor(7), now, diveIds: () => startToIdMap(bLater()) });
    await a.sync.run();
    await b.sync.run();
    await a.sync.run();
    const keysAfter = Object.entries(remote.files()).filter(([p]) => p.startsWith('dive-equipment/')).map(([, t]) => JSON.parse(t).diveKey.benthicId).sort();
    assert.deepEqual(keysAfter, ['0abcdefghj', '2ccccccccc'], 'every dive of the logbook is keyed by its id once it has one');
    // Both devices end with the same files, and the equipment is still attached to its dives.
    assert.deepEqual(await a.files(), await b.files());
    for (const d of [a, b]) {
      const records = await d.inventory.listDiveEquipment();
      assert.equal(records.length, 2);
      for (const r of records) assert.equal(r.gearIds.length, 1);
      assert.ok(records.every((r) => isShortId(recordKey(r.diveKey))));
    }
    assert.equal(Object.keys(remote.files()).filter((p) => p.startsWith('media/')).length, 1);
  } finally {
    a.core.dispose();
    b.core.dispose();
    remote.dispose();
  }
});

test('the device store moves its own references with the inventory, as tracked changes sent at the next run', async () => {
  const remote = new FakeRemote();
  const a = device(remote, 'a', () => DIVES);
  try {
    await a.inventory.saveDiveEquipment('2026-11-01T10:00:00', { ...emptyEquipment(), gearIds: ['g1'] });
    await a.inventory.clearPending();
    const moved = await a.inventory.migrateDiveIds(startToIdMap(DIVES));
    assert.equal(moved, 1);
    const [record] = await a.inventory.listDiveEquipment();
    assert.deepEqual(record.diveKey, { benthicId: '0abcdefghj' });
    assert.equal((await a.inventory.pendingPaths()).length, 1, 'the rewritten file goes to the server like an edit');
    assert.equal(await a.inventory.migrateDiveIds(startToIdMap(DIVES)), 0, 'a second run has nothing to do');
    // sortedJson is what the sync compares: a migrated record is the same bytes on every device.
    assert.equal(sortedJson(record), sortedJson({ ...record }));
  } finally {
    a.core.dispose();
    remote.dispose();
  }
});
