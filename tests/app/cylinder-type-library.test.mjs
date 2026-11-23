// The operations on the cylinder types (app/src/lib/cylinder-type-library.svelte.js, task 2026-11-23-373) over a small
// stand-in for the core's `cylinderTypes` call: the migration of the old device library at start, the one list, the rename and
// the deletion of an added type no dive uses (a file only), and what is given to the core.
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { BenthicCore } from 'benthic-core';
import { deviceStore } from '../../app/src/lib/device-store.js';
import { typeKey } from '../../app/src/lib/cylinder-type-files.js';

const library = await import('../../app/src/lib/cylinder-type-library.svelte.js');
const inventoryState = await import('../../app/src/lib/inventory.svelte.js');

const DEFAULTS = [
  { name: 'AL80', ml: 11100, mbar: 206843, imperial: true },
  { name: 'HP100', ml: 12400, mbar: 237317, imperial: true },
  { name: '12L 232 bar', ml: 12000, mbar: 232000, imperial: false },
];

/**
 * The core's cylinder types as the tests need them: the types of the dives (with counts), the library the diver's files
 * give (`added`), the old library of a device, the default table. The renames and the deletions of dive types are recorded.
 */
function fakeCore({ dives = {}, old = null } = {}) {
  const state = { dives: { ...dives }, added: /** @type {{ name: string, ml: number, mbar: number }[]} */ ([]), oldLibrary: old, calls: /** @type {string[]} */ ([]), renames: /** @type {string[][]} */ ([]), deleted: /** @type {string[]} */ ([]) };
  const view = () => {
    const rows = new Map();
    for (const [name, v] of Object.entries(state.dives)) rows.set(name, { name, ml: v.ml, mbar: v.mbar, dives: v.dives, standard: false, library: false });
    for (const a of state.added) rows.set(a.name, { name: a.name, ml: a.ml, mbar: a.mbar, dives: state.dives[a.name]?.dives ?? 0, standard: false, library: true });
    for (const o of state.oldLibrary ?? []) {
      const [name, ml, , cuft, psi] = o.split('\t');
      void cuft; void psi;
      rows.set(name, { name, ml: Number(ml), mbar: Math.round(Number(o.split('\t')[2]) * 1000), dives: state.dives[name]?.dives ?? 0, standard: false, library: true });
    }
    return { types: [...rows.values()], library: [] };
  };
  BenthicCore.cylinderTypes = async ({ action, name, value }) => {
    state.calls.push(action);
    if (action === 'defaults') return { types: [], library: [], defaults: DEFAULTS };
    if (action === 'library') {
      state.oldLibrary = JSON.parse(value).library;
      return view();
    }
    if (action === 'added') {
      state.oldLibrary = null;
      state.added = JSON.parse(value).added.map((line) => {
        const [n, ml, mbar] = line.split('\t');
        return { name: n, ml: Number(ml), mbar: Number(mbar) };
      });
      return view();
    }
    if (action === 'list') return view();
    if (action === 'rename') {
      state.renames.push([name, value]);
      if (state.dives[name]) {
        state.dives[value] = state.dives[name];
        delete state.dives[name];
      }
      const a = state.added.find((x) => x.name === name);
      if (a) a.name = value;
      return { ...view(), undo: 'Rename cylinder type', redo: '' };
    }
    if (action === 'deletePreview') return { ...view(), deletion: { removed: state.dives[name]?.dives ?? 0, kept: 0 } };
    if (action === 'delete') {
      state.deleted.push(name);
      delete state.dives[name];
      state.added = state.added.filter((x) => x.name !== name);
      return { ...view(), undo: 'Delete', redo: '' };
    }
    throw new Error(`unexpected ${action}`);
  };
  BenthicCore.listLoadedDives = async () => [];
  BenthicCore.saveLocal = async () => ({});
  return state;
}

beforeEach(async () => {
  // One store for the whole file: every test starts without added types.
  for (const f of await inventoryState.readCylinderTypes()) await inventoryState.changeCylinderTypes([], [f.id]);
});

const names = async () => (await library.readTypeRows()).map((r) => r.name);

test('migration at start: added types and resized standard ones become files; untouched standard ones are not copied; the key is dropped', async () => {
  // « name TAB ml TAB bar TAB cuft TAB psi », as the old library stored them.
  const old = ['AL80\t11100\t206.843\t80\t3000', 'HP100\t12000\t237\t100\t3442', 'Steel 10L\t10000\t232\t0\t0', '12L 232 bar\t12000\t232\t0\t0'];
  const core = fakeCore({ old: null });
  // The fake reads the old library through the 'library' action, then lists it with its sizes.
  deviceStore.setItem('bc.cylinderLibrary', JSON.stringify(old));
  await library.startCylinderTypes();
  const rows = await library.readTypeRows();
  const files = rows.filter((r) => r.fileId);
  assert.ok(!files.some((f) => f.name === '12L 232 bar' || f.name === 'AL80'), 'an untouched standard type is not migrated');
  assert.ok(files.some((f) => f.name === 'Steel 10L'), 'a type the diver added is migrated');
  assert.ok(files.some((f) => f.name === 'HP100'), 'a standard type whose size changed is migrated');
  assert.equal(deviceStore.getItem('bc.cylinderLibrary'), null, 'the old key is gone');
  assert.equal(core.added.some((a) => a.name === '12L 232 bar'), false, 'the standard table is never given as the diver\'s types');
  assert.ok(core.added.some((a) => a.name === 'Steel 10L'), 'the core is given the added types');
  // A second start migrates nothing more and keeps one file each.
  await library.startCylinderTypes();
  assert.equal((await inventoryState.readCylinderTypes()).filter((f) => f.name === 'Steel 10L').length, 1);
  for (const f of await inventoryState.readCylinderTypes()) await inventoryState.changeCylinderTypes([], [f.id]);
});

test('add: a new type is a file given to the core; its name cannot be one already in the list', async () => {
  const core = fakeCore({ dives: { 'ALU 3L': { ml: 3000, mbar: 200000, dives: 12 } } });
  await library.addCylinderType({ name: ' Steel 10L ', ml: 10000, mbar: 232000 });
  assert.deepEqual(await names(), ['ALU 3L', 'Steel 10L']);
  assert.deepEqual(core.added, [{ name: 'Steel 10L', ml: 10000, mbar: 232000 }]);
  await assert.rejects(library.addCylinderType({ name: 'steel 10 l', ml: 1, mbar: 1 }), /NAME_IN_USE/);
  await assert.rejects(library.addCylinderType({ name: 'alu3l', ml: 1, mbar: 1 }), /NAME_IN_USE/, 'a logbook type counts too');
  const rows = await library.readTypeRows();
  assert.equal(rows.find((r) => r.name === 'Steel 10L').dives, 0);
  assert.ok(rows.find((r) => r.name === 'Steel 10L').fileId);
  assert.equal(rows.find((r) => r.name === 'ALU 3L').fileId, null);
});

test('rename of an added type no dive uses rewrites its file only, with the same id; the core renames no dive', async () => {
  const core = fakeCore();
  await library.addCylinderType({ name: 'Steel 10L', ml: 10000, mbar: 232000 });
  const [before] = await inventoryState.readCylinderTypes();
  const row = (await library.readTypeRows()).find((r) => r.name === 'Steel 10L');
  await library.saveCylinderType(row, { name: 'Steel 10 L', ml: 10000, mbar: 232000 });
  assert.deepEqual(core.renames, [], 'no dive is renamed');
  const [after] = await inventoryState.readCylinderTypes();
  assert.equal(after.id, before.id);
  assert.equal(after.name, 'Steel 10 L');
  assert.ok(after.updatedAt >= before.updatedAt);
  assert.deepEqual(core.added.map((a) => a.name), ['Steel 10 L']);
});

test('rename of a type some dive uses goes through the core (the dives\' cylinders), and the file follows if there is one', async () => {
  const core = fakeCore({ dives: { 'ALU 3L': { ml: 3000, mbar: 200000, dives: 12 } } });
  await library.addCylinderType({ name: 'Steel 10L', ml: 10000, mbar: 232000 });
  // The dives use Steel 10L too.
  core.dives['Steel 10L'] = { ml: 10000, mbar: 232000, dives: 2 };
  const rows = await library.readTypeRows();
  await library.saveCylinderType(rows.find((r) => r.name === 'Steel 10L'), { name: 'Steel 10', ml: 10000, mbar: 232000 });
  assert.deepEqual(core.renames, [['Steel 10L', 'Steel 10']]);
  assert.deepEqual((await inventoryState.readCylinderTypes()).map((f) => f.name), ['Steel 10']);
  // A type only the dives have is renamed by the core and gets no file.
  await library.saveCylinderType((await library.readTypeRows()).find((r) => r.name === 'ALU 3L'), { name: 'Alu 3', ml: 3000, mbar: 200000 });
  assert.deepEqual(core.renames.at(-1), ['ALU 3L', 'Alu 3']);
  assert.equal((await inventoryState.readCylinderTypes()).length, 1);
});

test('a new size for a type only the dives have makes it an added type with the diver\'s size; the dives keep their own', async () => {
  const core = fakeCore({ dives: { 'ALU 3L': { ml: 3000, mbar: 200000, dives: 12 } } });
  const row = (await library.readTypeRows()).find((r) => r.name === 'ALU 3L');
  await library.saveCylinderType(row, { name: 'ALU 3L', ml: 3100, mbar: 200000 });
  assert.deepEqual(core.renames, []);
  const files = await inventoryState.readCylinderTypes();
  assert.deepEqual(files.map((f) => [f.name, f.ml]), [['ALU 3L', 3100]]);
  const rows = await library.readTypeRows();
  assert.equal(rows.length, 1, 'one row, with its dive count');
  assert.equal(rows[0].dives, 12);
  assert.equal(rows[0].ml, 3100);
});

test('delete of an added type no dive uses removes its file only; the core\'s delete path is for types the dives use', async () => {
  const core = fakeCore({ dives: { 'ALU 3L': { ml: 3000, mbar: 200000, dives: 12 } } });
  await library.addCylinderType({ name: 'Steel 10L', ml: 10000, mbar: 232000 });
  await library.deleteType((await library.readTypeRows()).find((r) => r.name === 'Steel 10L'));
  assert.deepEqual(core.deleted, []);
  assert.deepEqual(await names(), ['ALU 3L']);
  assert.deepEqual(core.added, [], 'the core no longer has it');
  await library.deleteType((await library.readTypeRows()).find((r) => r.name === 'ALU 3L'));
  assert.deepEqual(core.deleted, ['ALU 3L']);
});

test('an added type named like a standard one can be deleted', async () => {
  const core = fakeCore();
  await library.addCylinderType({ name: 'AL80', ml: 11100, mbar: 206843 });
  await library.deleteType((await library.readTypeRows()).find((r) => r.name === 'AL80'));
  assert.deepEqual(await names(), []);
  assert.deepEqual(core.deleted, []);
  assert.ok(typeKey('AL80'));
});

test('the default cylinder choices: Aucune, the types, then the common sizes not already types; a chosen size becomes a type', async () => {
  fakeCore({ dives: { 'ALU 3L': { ml: 3000, mbar: 200000, dives: 12 } } });
  await library.addCylinderType({ name: 'HP100', ml: 12400, mbar: 237317 });
  const { cylinderChoices, ensureCylinderType } = await import('../../app/src/lib/cylinder-choices.js');
  const prefs = { volume: 'cuft', pressure: 'psi', length: 'ft' };
  const options = await cylinderChoices(prefs);
  assert.deepEqual(options.map((o) => o.value), ['', 'ALU 3L', 'HP100', 'AL80']);
  assert.equal(options.filter((o) => o.heading).length, 1);
  assert.equal(options.find((o) => o.heading).value, 'AL80', 'the divider is above the first common size');
  assert.ok(!options.slice(0, 3).some((o) => o.heading));
  await ensureCylinderType('AL80');
  assert.ok((await names()).includes('AL80'));
  assert.equal((await inventoryState.readCylinderTypes()).filter((f) => f.name === 'AL80').length, 1);
  const metric = await cylinderChoices({ volume: 'l', pressure: 'bar', length: 'm' });
  assert.ok(!metric.some((o) => o.value === 'HP100' && o.heading), 'no imperial size in metric');
});

test('an undone rename of a type: the file takes the name the core has again; when it is not clear which, nothing is renamed', async () => {
  fakeCore();
  await library.addCylinderType({ name: 'Steel 10 L', ml: 10000, mbar: 232000 });
  const [before] = await inventoryState.readCylinderTypes();
  await library.followCoreTypes([{ name: 'Steel 10L', library: true }]);
  const [after] = await inventoryState.readCylinderTypes();
  assert.equal(after.id, before.id);
  assert.equal(after.name, 'Steel 10L');
  await library.followCoreTypes([{ name: 'A', library: true }, { name: 'B', library: true }]);
  assert.equal((await inventoryState.readCylinderTypes())[0].name, 'Steel 10L', 'two unknown names: left alone');
});
