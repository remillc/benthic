// SPDX-License-Identifier: GPL-2.0
// The O₂ cells as their own piece of equipment (task 2026-11-24-397, to-do #199): the reminder rule, the card's line, the
// migration of the dates a rebreather kept (idempotent, no date lost, the same on every device), the type menu when editing a
// piece, the bell of the reminder card.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createFileStore, memoryBackend } from '../../app/src/lib/file-store.js';
import { createInventory } from '../../app/src/lib/inventory.js';
import { o2CellsDue, o2CellsRule, hasReminders, evaluate } from '../../app/src/lib/maintenance.js';
import { planO2Cells, cellsPieceId, isMeaningful } from '../../app/src/lib/o2-cells-migration.js';
import { isShortId } from '../../app/src/lib/short-id.js';

const read = (p) => fs.readFileSync(new URL(`../../app/src/${p}`, import.meta.url), 'utf8');
const json = (l) => JSON.parse(read(`i18n/${l}.json`));

// --- The reminder rule --------------------------------------------------------------------------------------------

test('the cells fall due at the earlier of manufacture + 18 months and installation + 12 months (the task\'s example)', () => {
  // Made 2025-12-15 (+18 months: 2027-06-15), installed 2026-03-14 (+12 months: 2027-03-14).
  assert.deepEqual(o2CellsRule({ madeOn: '2025-12-15', installedOn: '2026-03-14' }), { due: '2027-03-14', basis: 'installed' });
  assert.equal(o2CellsDue({ madeOn: '2025-12-15', installedOn: '2026-03-14' }), '2027-03-14');
  // The 18-month case: made 2025-06-01 (+18: 2026-12-01) before installed 2026-03-14 (+12: 2027-03-14).
  assert.deepEqual(o2CellsRule({ madeOn: '2025-06-01', installedOn: '2026-03-14' }), { due: '2026-12-01', basis: 'made' });
  // One date alone: its own rule; none: no rule.
  assert.deepEqual(o2CellsRule({ madeOn: '2025-06-01' }), { due: '2026-12-01', basis: 'made' });
  assert.deepEqual(o2CellsRule({ installedOn: '2026-03-14' }), { due: '2027-03-14', basis: 'installed' });
  assert.equal(o2CellsRule({}), null);
});

test('a tie between the two rules reads as the installation', () => {
  assert.equal(o2CellsRule({ madeOn: '2025-09-14', installedOn: '2026-03-14' }).basis, 'installed');
});

test('the cells are a reminder type with their own suggestion and an evaluation from their own due date', () => {
  assert.equal(hasReminders('o2Cells'), true);
  const item = { format: 1, id: 'm', createdAt: '', updatedAt: '', gearId: 'c', task: 'o2Cells', intervalMonths: 12, intervalDives: null, startOn: '2026-03-14', lastDoneOn: '2026-03-14', dueOn: '2027-03-14', dueFrom: '2026-03-14', notifyDays: null, warnInDive: true, history: [] };
  assert.equal(evaluate(item, [], '2026-11-24').dueDate, '2027-03-14');
});

test('the card reads « Rappel de remplacement » and « Le <date>, 12 mois après l’installation » or 18 mois après la fabrication', () => {
  const fr = json('fr').maintenance.reminderCard;
  assert.equal(fr.titleCells, 'Rappel de remplacement');
  assert.equal(fr.cellsDueInstalled.replace('{date}', '2027-03-14'), 'Le 2027-03-14, 12 mois après l’installation');
  assert.equal(fr.cellsDueMade.replace('{date}', '2026-12-01'), 'Le 2026-12-01, 18 mois après la fabrication');
  const source = read('pages/ProfilePieceEdit.svelte');
  assert.match(source, /cellsRule\.basis === 'made' \? 'maintenance\.reminderCard\.cellsDueMade' : 'maintenance\.reminderCard\.cellsDueInstalled', \{ date: typedDate\(cellsRule\.due\) \}/, 'the date follows Réglages › Format de la date');
  assert.match(source, /type === 'o2Cells' \? 'maintenance\.reminderCard\.titleCells'/);
});

test('the rebreather card suggests a yearly service and its cells fields are gone (strings, fields, reminder)', () => {
  const fr = json('fr');
  const en = json('en');
  assert.equal(fr.maintenance.reminderCard.suggestRebreather, 'Suggéré pour un recycleur : révision chaque année');
  assert.equal(en.maintenance.reminderCard.suggestRebreather, 'Suggested for a rebreather: service every year');
  for (const c of [fr, en]) assert.ok(!('o2CellsMadeOn' in c.gear.field) && !('o2CellsOn' in c.gear.field));
  const code = read('lib/gear-fields.js') + read('lib/maintenance.js');
  assert.ok(!/o2CellsMadeOn: |key: 'o2CellsMadeOn'|key: 'o2CellsOn'/.test(code.replace(/\/\/.*$/gm, '')), 'no field of the rebreather');
});

// --- The type menu and the bell -----------------------------------------------------------------------------------

test('editing a piece shows the type as a menu on every device; the tiles stay in step 1 of « Nouvelle pièce »', () => {
  const source = read('pages/ProfilePieceEdit.svelte');
  const body = source.slice(source.indexOf('{#snippet body()}'), source.indexOf('{#snippet typeFields()}'));
  const editing = body.slice(body.indexOf('{#if id}'), body.indexOf('{:else}\n    <div class="bc-piece-edit--stage"'));
  assert.ok(!editing.includes('typeGrid'), 'no grid of tiles when editing');
  assert.match(editing, /<SelectField label=\{t\('gear\.pieceNew\.typeTitle'\)\} value=\{type\} onchange=\{chooseType\} options=\{typeOptions\}[^>]* icon=\{typeIcon\}/, 'Android, tablet, desktop: the filled menu field with the type icon');
  assert.match(editing, /\{#if ios\}[\s\S]*bc-piece-edit--type-row-label[\s\S]*gear\.pieceEdit\.type[\s\S]*GearIcon[\s\S]*bc-piece-edit--type-row-chevrons/, 'iPhone: a « Type » row with the icon and the up/down chevrons');
  assert.ok(editing.indexOf('type-field') < editing.indexOf('{@render form()}'), 'first field');
  assert.match(body, /\{#if choosingType\}\{@render typeGrid\(\)\}/, 'the new piece still starts with the tiles');
  assert.equal(json('fr').gear.pieceEdit.type, 'Type');
});

test('the type list holds « Cellules O₂ » after « Recycleur », with its three cells on a line', () => {
  const icons = read('components/GearIcon.svelte');
  const keys = [...icons.slice(icons.indexOf('const paths = {')).matchAll(/^\s*([a-zA-Z0-9]+): '/gm)].map((m) => m[1]);
  assert.equal(keys[keys.indexOf('rebreather') + 1], 'o2Cells');
  assert.match(icons, /o2Cells: 'M2\.8 12a3\.2 3\.2 0 1 0 6\.4 0/, 'three circles of radius 3.2 and the line at y = 18');
  for (const l of ['fr', 'en']) assert.ok(json(l).gear.pieceNew.tile.o2Cells);
  assert.equal(json('fr').gear.pieceNew.tile.o2Cells, 'Cellules O₂');
});

test('the reminder card of « Nouvelle pièce » has the bell with a plus, not a wrench', () => {
  const source = read('pages/ProfilePieceEdit.svelte');
  const card = source.slice(source.indexOf('bc-piece-edit--reminder"'), source.indexOf('bc-piece-edit--reminder-texts'));
  assert.match(card, /notification_add/);
  assert.match(card, /M15 6h6M18 3v6/);
  assert.ok(!/name="(wrench|clock)"/.test(card));
  // The maintenance screens keep the wrench.
  assert.match(read('components/ProfileNav.svelte'), /id: 'maintenance', icon: 'wrench'/);
});

// --- The migration ------------------------------------------------------------------------------------------------

const rebreather = (extra = {}) => ({ format: 1, id: 'rebr000001', createdAt: '2026-01-01T10:00:00Z', updatedAt: '2026-02-02T10:00:00Z', type: 'rebreather', name: 'rEvo III', brand: 'Inspiration', retired: false, details: { o2CellsMadeOn: '2025-12-15', o2CellsOn: '2026-03-14', lastService: '2025-11-08' }, ...extra });
const item = (extra = {}) => ({ format: 1, id: 'mnt0000001', createdAt: '2026-01-01T10:00:00Z', updatedAt: '2026-03-14T10:00:00Z', gearId: 'rebr000001', task: 'o2Cells', intervalMonths: 12, intervalDives: null, startOn: '2026-01-01', lastDoneOn: '2026-03-14', dueOn: '2027-03-14', dueFrom: '2026-03-14', notifyDays: null, warnInDive: true, history: [{ id: 'h1', kind: 'other', doneOn: '2026-03-14' }], ...extra });

/** A device: a store with the given files, and its inventory. */
async function device(files) {
  const inventory = createInventory(createFileStore(memoryBackend()), { now: () => new Date(Date.UTC(2026, 10, 24, 12, 0, 0)) });
  for (const [path, value] of Object.entries(files)) await inventory.store.write(path, value);
  const snapshot = async () => ({ gear: await inventory.listGear(), maintenance: await inventory.listMaintenance() });
  return { inventory, snapshot };
}

test('the dates of a rebreather move into a « Cellules O₂ » piece with no brand; the reminder follows, nothing is lost', async () => {
  const { inventory, snapshot } = await device({ 'gear/rebr000001.json': rebreather(), 'maintenance/mnt0000001.json': item() });
  assert.equal(await inventory.migrateO2Cells(), true);
  const { gear, maintenance } = await snapshot();
  const cells = gear.find((g) => g.type === 'o2Cells');
  assert.ok(cells && isShortId(cells.id));
  assert.equal(cells.id, cellsPieceId('rebr000001'));
  assert.deepEqual(cells.details, { cellsMadeOn: '2025-12-15', cellsInstalledOn: '2026-03-14' });
  assert.equal(cells.brand, undefined, 'the brand is left empty');
  assert.equal(cells.retired, false);
  const reb = gear.find((g) => g.type === 'rebreather');
  assert.deepEqual(reb.details, { lastService: '2025-11-08' }, 'the cells dates left; the service date stays');
  assert.equal(reb.updatedAt, '2026-02-02T10:00:00Z', 'the rebreather\'s own stamp is not touched');
  assert.equal(reb.brand, 'Inspiration');
  assert.equal(maintenance.length, 1);
  assert.equal(maintenance[0].gearId, cells.id, 'the reminder follows the cells');
  assert.equal(maintenance[0].dueOn, '2027-03-14');
  assert.deepEqual(maintenance[0].history, item().history, 'the history is kept');
});

test('running the migration again changes nothing (idempotent), also after a sync brought the files back', async () => {
  const { inventory, snapshot } = await device({ 'gear/rebr000001.json': rebreather(), 'maintenance/mnt0000001.json': item() });
  await inventory.migrateO2Cells();
  const once = JSON.stringify(await snapshot());
  assert.equal(await inventory.migrateO2Cells(), false);
  assert.equal(JSON.stringify(await snapshot()), once);
  // The pending list holds the three files written once, not more.
  assert.deepEqual((await inventory.pendingPaths()).sort(), [`gear/${cellsPieceId('rebr000001')}.json`, 'gear/rebr000001.json', 'maintenance/mnt0000001.json'].sort());
});

test('two devices that migrate before they sync write the same files: no second piece, nothing to merge', async () => {
  const files = () => ({ 'gear/rebr000001.json': rebreather(), 'maintenance/mnt0000001.json': item() });
  const a = await device(files());
  const b = await device(files());
  await a.inventory.migrateO2Cells();
  await b.inventory.migrateO2Cells();
  assert.equal(JSON.stringify(await a.snapshot()), JSON.stringify(await b.snapshot()));
  assert.equal((await a.snapshot()).gear.filter((g) => g.type === 'o2Cells').length, 1);
  // The plan does not depend on the clock, the language or any random value.
  const input = { gear: [rebreather()], maintenance: [item()] };
  assert.equal(JSON.stringify(planO2Cells(input)), JSON.stringify(planO2Cells(input)));
});

test('an older device that writes the old dates back after the migration: they are absorbed again, none lost', async () => {
  const { inventory, snapshot } = await device({ 'gear/rebr000001.json': rebreather(), 'maintenance/mnt0000001.json': item() });
  await inventory.migrateO2Cells();
  // The older app (no cells piece) edits the rebreather and writes its two dates again.
  const reb = (await snapshot()).gear.find((g) => g.type === 'rebreather');
  await inventory.store.write('gear/rebr000001.json', { ...reb, details: { ...reb.details, o2CellsMadeOn: '2025-12-15', o2CellsOn: '2026-03-14' } });
  assert.equal(await inventory.migrateO2Cells(), true);
  const { gear } = await snapshot();
  assert.deepEqual(gear.find((g) => g.type === 'rebreather').details, { lastService: '2025-11-08' });
  assert.equal(gear.filter((g) => g.type === 'o2Cells').length, 1);
  // A different date typed on the older device while the cells piece holds one: both stay.
  const reb2 = gear.find((g) => g.type === 'rebreather');
  await inventory.store.write('gear/rebr000001.json', { ...reb2, details: { ...reb2.details, o2CellsOn: '2026-05-01' } });
  await inventory.migrateO2Cells();
  const after = await snapshot();
  assert.equal(after.gear.find((g) => g.type === 'o2Cells').details.cellsInstalledOn, '2026-03-14');
  assert.equal(after.gear.find((g) => g.type === 'rebreather').details.o2CellsOn, '2026-05-01', 'kept in the file, not lost');
  assert.equal(await inventory.migrateO2Cells(), false, 'and the conflict does not make it write on and on');
});

test('a deleted cells piece does not come back; a rebreather with no cell date and no meaningful reminder gets no piece', async () => {
  const { inventory, snapshot } = await device({ 'gear/rebr000001.json': rebreather(), 'maintenance/mnt0000001.json': item() });
  await inventory.migrateO2Cells();
  const cells = (await snapshot()).gear.find((g) => g.type === 'o2Cells');
  await inventory.deleteGear(cells.id);
  assert.equal(await inventory.migrateO2Cells(), false);
  assert.equal((await snapshot()).gear.filter((g) => g.type === 'o2Cells').length, 0);

  const plain = await device({
    'gear/rebr000002.json': rebreather({ id: 'rebr000002', details: { lastService: '2025-11-08' } }),
    'maintenance/mnt0000002.json': item({ id: 'mnt0000002', gearId: 'rebr000002', lastDoneOn: undefined, dueOn: undefined, dueFrom: undefined, history: [] }),
  });
  await plain.inventory.migrateO2Cells();
  const s = await plain.snapshot();
  assert.equal(s.gear.length, 1, 'no piece for nothing');
  assert.equal(s.maintenance.length, 0, 'the default reminder of the rebreather goes: the rule is the cells\'');
  assert.equal(isMeaningful(item({ history: [] , lastDoneOn: undefined, dueOn: undefined })), false);
});

test('one date alone moves; a retired rebreather\'s cells are retired with it; an invalid text is kept as it is', async () => {
  const { inventory, snapshot } = await device({
    'gear/rebr000001.json': rebreather({ retired: true, retiredOn: '2026-10-01', retiredReason: 'sold', details: { o2CellsOn: '14/03/26' } }),
  });
  await inventory.migrateO2Cells();
  const { gear } = await snapshot();
  const cells = gear.find((g) => g.type === 'o2Cells');
  assert.deepEqual(cells.details, { cellsInstalledOn: '14/03/26' });
  assert.deepEqual([cells.retired, cells.retiredOn, cells.retiredReason], [true, '2026-10-01', 'sold']);
  assert.equal(gear.find((g) => g.type === 'rebreather').details, undefined);
});

test('read only: nothing is written', async () => {
  const { inventory, snapshot } = await device({ 'gear/rebr000001.json': rebreather(), 'maintenance/mnt0000001.json': item() });
  await inventory.setReadOnly(true);
  const before = JSON.stringify(await snapshot());
  assert.equal(await inventory.migrateO2Cells(), false);
  assert.equal(JSON.stringify(await snapshot()), before);
});

test('the migration runs when the inventory loads, and an older app keeps the piece it does not know', () => {
  assert.match(read('lib/inventory.svelte.js'), /await inv\.migrateO2Cells\(\)\) signalAccountData\('edit'\)/);
  // An unknown type falls back to « Autres »: listed, never dropped, its unknown keys of `details` kept when saved.
  const inv = read('lib/inventory.js');
  assert.match(inv, /groupOfType = \(type\) => \(type === 'undersuit' \? 'suit' : GROUPS\.includes\(\/\*\* @type \{any\} \*\/ \(type\)\) \? type : 'other'\)/);
});
