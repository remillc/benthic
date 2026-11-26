// Suits are pieces (task 2026-11-26-406): the logbook's suit texts become pieces, once, and a deleted one stays deleted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { suitNorm, suitPieceId, planSuitPieces, planIsEmpty, dismissedSuitPath, newDismissedSuit, dismissedKeys } from '../../app/src/lib/suit-pieces.js';
import { suitKey, linkedSuits } from '../../app/src/lib/logbook-pairing.js';
import { createInventory } from '../../app/src/lib/inventory.js';
import { createFileStore, memoryBackend } from '../../app/src/lib/file-store.js';

const inventory = () => createInventory(createFileStore(memoryBackend()));
const piece = (extra) => ({ format: 1, id: 'p1', createdAt: '', updatedAt: '', retired: false, name: 'x', type: 'suit', ...extra });
const values = [
  { key: 'Étanche', dives: 40 },
  { key: 'etanche ', dives: 3 },
  { key: 'ÉTANCHE', dives: 1 },
  { key: 'Humide 5mm', dives: 12 },
  { key: '', dives: 4 },
  { key: '   ', dives: 2 },
];

test('texts that differ by case, accents or spaces are one key', () => {
  assert.equal(suitNorm('  Étanche   Trilam '), 'etanche trilam');
  assert.equal(suitNorm('ETANCHE'), suitNorm('étanche'));
  assert.equal(suitKey('Étanche'), suitNorm('Étanche'));
  assert.equal(linkedSuits([piece({ suitNames: ['Étanche'] })]).get(suitKey('etanche')), 'p1');
});

test('one piece per key, named by the most used spelling, holding every spelling', () => {
  const plan = planSuitPieces(values, []);
  assert.equal(plan.create.length, 2);
  const dry = plan.create.find((c) => suitNorm(c.name) === 'etanche');
  assert.equal(dry.name, 'Étanche');
  assert.deepEqual(dry.suitNames, ['Étanche', 'etanche', 'ÉTANCHE']);
  assert.equal(dry.id, suitPieceId('étanche'));
  assert.equal(suitPieceId('Étanche '), suitPieceId('etanche'));
  assert.deepEqual(plan.extend, []);
});

test('empty texts and texts without dives make nothing', () => {
  assert.ok(planIsEmpty(planSuitPieces([{ key: '', dives: 5 }, { key: 'X', dives: 0 }], [])));
});

test('a text a piece already has makes nothing; a new spelling is added to that piece', () => {
  const pieces = [piece({ id: 'a', name: 'Ma étanche', suitNames: ['Étanche'] })];
  const plan = planSuitPieces(values, pieces);
  assert.deepEqual(plan.create.map((c) => c.name), ['Humide 5mm']);
  assert.deepEqual(plan.extend, [{ id: 'a', suitNames: ['etanche', 'ÉTANCHE'] }]);
});

test('a retired piece still holds its texts', () => {
  const plan = planSuitPieces(values, [piece({ id: 'a', retired: true, suitNames: ['Étanche', 'etanche', 'ÉTANCHE'] })]);
  assert.deepEqual(plan.create.map((c) => c.name), ['Humide 5mm']);
});

test('a suit piece of the same name takes the text instead of a double', () => {
  const plan = planSuitPieces([{ key: 'humide 5mm', dives: 3 }], [piece({ id: 'm', name: 'Humide 5MM' })]);
  assert.deepEqual(plan.create, []);
  assert.deepEqual(plan.extend, [{ id: 'm', suitNames: ['humide 5mm'] }]);
});

test('a deleted text is not made again', () => {
  const dismissed = new Set([suitNorm('étanche')]);
  assert.deepEqual(planSuitPieces(values, [], dismissed).create.map((c) => c.name), ['Humide 5mm']);
});

test('applying the plan twice writes nothing the second time', async () => {
  const inv = inventory();
  const first = await inv.applySuitPlan(planSuitPieces(values, []));
  assert.equal(first, 2);
  const pieces = await inv.listGear();
  assert.equal(pieces.length, 2);
  assert.ok(pieces.every((g) => g.type === 'suit' && g.suitNames.length));
  assert.ok(planIsEmpty(planSuitPieces(values, pieces, await inv.dismissedSuits())));
  // Even a stale plan does not make doubles.
  assert.equal(await inv.applySuitPlan(planSuitPieces(values, [])), 0);
  assert.equal((await inv.listGear()).length, 2);
});

test('deleting a piece remembers its texts; typing the text again forgets them', async () => {
  const inv = inventory();
  await inv.applySuitPlan(planSuitPieces(values, []));
  const dry = (await inv.listGear()).find((g) => suitNorm(g.name) === 'etanche');
  await inv.deleteGear(dry.id);
  const dismissed = await inv.dismissedSuits();
  assert.deepEqual([...dismissed], ['etanche']);
  assert.deepEqual(planSuitPieces(values, await inv.listGear(), dismissed).create, []);
  // The diver types the text in a dive: the piece is back, the memory is gone.
  const back = await inv.suitPieceFor('Étanche');
  assert.equal(back.type, 'suit');
  assert.deepEqual([...(await inv.dismissedSuits())], []);
});

test('a text typed in a dive finds its piece, whatever its spelling', async () => {
  const inv = inventory();
  await inv.applySuitPlan(planSuitPieces(values, []));
  const dry = (await inv.listGear()).find((g) => suitNorm(g.name) === 'etanche');
  const found = await inv.suitPieceFor('ETANCHE  ');
  assert.equal(found.id, dry.id);
  assert.equal((await inv.listGear()).length, 2);
  const made = await inv.suitPieceFor('Semi-sec');
  assert.deepEqual(made.suitNames, ['Semi-sec']);
  assert.equal((await inv.listGear()).length, 3);
  assert.equal(await inv.suitPieceFor('   '), null);
});

test('a text moves from one piece to another', async () => {
  const inv = inventory();
  await inv.applySuitPlan(planSuitPieces([{ key: 'Étanche', dives: 5 }, { key: 'Dry', dives: 2 }], []));
  const [a, b] = await inv.listGear();
  await inv.moveSuitNames(a.id, [...b.suitNames]);
  const after = await inv.listGear();
  const moved = after.find((g) => g.id === a.id);
  assert.deepEqual([...moved.suitNames].sort(), [...a.suitNames, ...b.suitNames].sort());
  assert.equal(after.find((g) => g.id === b.id).suitNames, undefined);
});

test('the dismissed files', () => {
  const file = newDismissedSuit(' Étanche ', '2026-11-26T10:00:00Z');
  assert.equal(file.key, 'etanche');
  assert.equal(dismissedSuitPath('étanche'), dismissedSuitPath('ETANCHE'));
  assert.ok(dismissedSuitPath('x').startsWith('dismissed-suits/'));
  assert.deepEqual([...dismissedKeys([file, null, { key: '' }])], ['etanche']);
});

test('the screens: the detail field follows the inventory, the folder is synced, the pair sheet can move a text', () => {
  const root = new URL('../../app/src/', import.meta.url);
  const read = (p) => readFileSync(new URL(p, root), 'utf8');
  const fields = read('components/DesktopDiveFields.svelte');
  assert.match(fields, /name="suit" kind="site"[^>]*known=\{suitKnown\}[^>]*manage=\{\{[^}]*openOver\('\/profile\/gear\/'\)/);
  assert.match(fields, /suitPieceFor\(name\)/);
  assert.match(fields, /name="suit" kind="text"/);
  assert.match(read('lib/account-sync.js'), /'dismissed-suits\/'/);
  assert.match(read('lib/inventory.svelte.js'), /syncSuitPieces\(\)\.catch/);
  assert.match(read('components/PairLogbookDialog.svelte'), /moveSuitNames/);
  for (const lang of ['fr', 'en']) {
    const json = JSON.parse(read(`i18n/${lang}.json`));
    for (const text of [json.desktopDetail.newSuit, json.desktopDetail.manageGear, json.gear.pair.alreadyIn]) assert.ok(text);
  }
});

test('a suit made from the logbook has its text as its model, and the edit form shows it for the older ones', async () => {
  const inv = inventory();
  await inv.applySuitPlan(planSuitPieces(values, []));
  assert.ok((await inv.listGear()).every((g) => g.model === g.name));
  assert.equal((await inv.suitPieceFor('Semi-sec')).model, 'Semi-sec');
  const edit = readFileSync(new URL('../../app/src/pages/ProfilePieceEdit.svelte', import.meta.url), 'utf8');
  assert.match(edit, /model = g\.model \?\? \(!g\.brand && g\.suitNames\?\.length \? g\.name : ''\)/);
});
