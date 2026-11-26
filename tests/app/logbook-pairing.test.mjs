// Pairing a piece with the computers and suit texts of the logbook (task 2026-11-26-405): matching, one piece per
// logbook value, the fields written, the rows of the list, and the screens' sources.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFileStore, memoryBackend } from '../../app/src/lib/file-store.js';
import { createInventory } from '../../app/src/lib/inventory.js';
import {
  suitKey,
  linkedSuits,
  computerItems,
  suitItems,
  computerResembles,
  suitResembles,
  candidatesFor,
  totalDives,
  yearsText,
  splitBrandModel,
  linkFields,
  linkProblem,
  pairRows,
  computerKey,
} from '../../app/src/lib/logbook-pairing.js';

const piece = (extra) => ({ format: 1, id: 'p1', createdAt: '', updatedAt: '', retired: false, name: 'x', type: 'computer', ...extra });
const inventory = () => createInventory(createFileStore(memoryBackend()));
const logbookComputers = [
  { model: 'Heinrichs Weikamp OSTC 3', serial: '0B12C4', dives: 48 },
  { model: 'Suunto D5', serial: '2271-0043', dives: 9 },
  { model: 'Shearwater Perdix 2', serial: '4A21F7', dives: 212 },
];

test('a computer already in the equipment is marked as tied to that piece', () => {
  const own = piece({ id: 'a', brand: 'Shearwater', model: 'Perdix 2', computerModel: 'Shearwater Perdix 2', computerSerial: '4A21F7' });
  const items = computerItems(logbookComputers, [own]);
  assert.equal(items.find((i) => i.serial === '4A21F7').linkedTo, 'a');
  assert.equal(items.find((i) => i.serial === '0B12C4').linkedTo, undefined);
  // the piece's own link is not taken when the sheet is opened for it
  assert.equal(computerItems(logbookComputers, [own], 'a').find((i) => i.serial === '4A21F7').linkedTo, undefined);
});

test('a computer with no dive is not offered', () => {
  assert.equal(computerItems([{ model: 'Suunto D4', serial: '1', dives: 0 }], []).length, 0);
});

test('suit texts are tied to one piece, compared without case or blanks', () => {
  const a = piece({ id: 'a', type: 'suit', suitNames: ['Étanche'] });
  const map = linkedSuits([a]);
  assert.equal(map.get(suitKey('  étanche ')), 'a');
  const items = suitItems([{ key: 'Étanche', dives: 140 }, { key: 'dry suit', dives: 12 }, { key: '', dives: 3 }], [a]);
  assert.deepEqual(items.map((i) => [i.name, i.linkedTo]), [['Étanche', 'a'], ['dry suit', undefined]]);
});

test('computers that resemble a piece: the same brand or one name inside the other', () => {
  const perdix = piece({ brand: 'Shearwater', model: 'Perdix 2', name: 'Shearwater Perdix 2' });
  assert.equal(computerResembles(perdix, { model: 'Shearwater Perdix 2' }), true);
  assert.equal(computerResembles(perdix, { model: 'Shearwater Perdix' }), true);
  assert.equal(computerResembles(perdix, { model: 'Shearwater Petrel 3' }), true);
  assert.equal(computerResembles(perdix, { model: 'Suunto D5' }), false);
  assert.equal(computerResembles(piece({ name: 'Suunto D5' }), { model: 'Suunto D5' }), true);
});

test('suit texts that resemble a piece: a shared word or the same family', () => {
  const dry = piece({ type: 'suit', name: 'Waterproof D7 Pro', brand: 'Waterproof', details: { suitType: 'dry' } });
  assert.equal(suitResembles(dry, 'Waterproof'), true);
  assert.equal(suitResembles(dry, 'dry suit'), true);
  assert.equal(suitResembles(dry, 'Étanche'), true);
  assert.equal(suitResembles(dry, 'Bare 5 mm'), false);
});

test('the candidates are the free values that resemble the piece, else every free value', () => {
  const items = [{ n: 'a' }, { n: 'b', linkedTo: 'x' }, { n: 'c' }];
  assert.deepEqual(candidatesFor(items, (i) => i.n === 'a').map((i) => i.n), ['a']);
  assert.deepEqual(candidatesFor(items, (i) => i.n === 'b').map((i) => i.n), ['a', 'c']);
  assert.deepEqual(candidatesFor(items, () => false).map((i) => i.n), ['a', 'c']);
});

test('the total counts the dives of the chosen values', () => {
  assert.equal(totalDives([{ dives: 140 }, { dives: 12 }]), 152);
  assert.equal(totalDives([]), 0);
});

test('years read two years, one year or nothing', () => {
  const range = (a, b) => `${a} à ${b}`;
  assert.equal(yearsText({ first: 2019, last: 2021 }, range), '2019 à 2021');
  assert.equal(yearsText({ first: 2022, last: 2022 }, range), '2022');
  assert.equal(yearsText({}, range), '');
});

test('brand and model are split on the longest known brand', () => {
  const vendors = ['Heinrichs Weikamp', 'Shearwater', 'Suunto'];
  assert.deepEqual(splitBrandModel('Heinrichs Weikamp OSTC 3', vendors), { brand: 'Heinrichs Weikamp', model: 'OSTC 3' });
  assert.deepEqual(splitBrandModel('Suunto D5', vendors), { brand: 'Suunto', model: 'D5' });
  assert.deepEqual(splitBrandModel('Cressi Leonardo', vendors), { brand: 'Cressi', model: 'Leonardo' });
  assert.deepEqual(splitBrandModel('Leonardo', vendors), { brand: '', model: 'Leonardo' });
});

test('linking a computer sets its logbook model and serial; suit texts are added without doubles', () => {
  assert.deepEqual(linkFields(undefined, { computer: { model: 'Suunto D5', serial: '2271-0043' } }), { computerModel: 'Suunto D5', computerSerial: '2271-0043', serial: '2271-0043' });
  assert.deepEqual(linkFields(undefined, { computer: { model: 'Suunto D5', serial: '' } }), { computerModel: 'Suunto D5', computerSerial: '' });
  const s = piece({ type: 'suit', suitNames: ['Étanche'] });
  assert.deepEqual(linkFields(s, { suitNames: ['étanche', 'dry suit', ' '] }).suitNames, ['Étanche', 'dry suit']);
});

test('a value tied to another piece cannot be tied again', () => {
  const a = piece({ id: 'a', type: 'suit', suitNames: ['Étanche'] });
  const c = piece({ id: 'c', computerModel: 'Shearwater Perdix 2', computerSerial: '4A21F7', brand: 'Shearwater', model: 'Perdix 2' });
  assert.equal(linkProblem([a, c], 'b', { suitNames: ['étanche'] }), 'suit');
  assert.equal(linkProblem([a, c], 'a', { suitNames: ['étanche'] }), '');
  assert.equal(linkProblem([a, c], 'b', { computer: { model: 'Shearwater Perdix 2', serial: '4A21F7' } }), 'computer');
  assert.equal(linkProblem([a, c], 'b', { computer: { model: 'Suunto D5', serial: '2271-0043' } }), '');
});

test('the store refuses a second piece for a logbook value and keeps the links in the piece file', async () => {
  const inv = inventory();
  const first = await inv.saveGear({ type: 'suit', name: 'Waterproof D7', suitNames: ['Étanche', 'dry suit'] });
  assert.deepEqual((await inv.getGear(first.id)).suitNames, ['Étanche', 'dry suit']);
  await assert.rejects(inv.saveGear({ type: 'suit', name: 'Autre', suitNames: ['DRY SUIT'] }), /LINKED_ELSEWHERE:suit/);
  const second = await inv.saveGear({ type: 'suit', name: 'Bare', suitNames: ['Bare 5 mm'] });
  assert.deepEqual((await inv.getGear(second.id)).suitNames, ['Bare 5 mm']);
  // saving the first piece again with its own texts is not a conflict
  await inv.saveGear({ ...first, note: 'n' });
  const comp = await inv.saveGear({ type: 'computer', name: 'Perdix', computerModel: 'Shearwater Perdix 2', computerSerial: '4A21F7' });
  await assert.rejects(inv.saveGear({ type: 'computer', name: 'Double', computerModel: 'Shearwater Perdix 2', computerSerial: '4A21F7' }), /LINKED_ELSEWHERE:computer/);
  assert.equal((await inv.getGear(comp.id)).computerSerial, '4A21F7');
});

test('the rows of the list: computers with serial, dives and years, suits with dives and years', () => {
  const text = { serial: (s) => `n° ${s}`, dives: (n) => `${n} plongées`, range: (a, b) => `${a} à ${b}` };
  const rows = pairRows('computer', [{ model: 'Suunto D5', serial: '2271-0043', dives: 9, first: 2022, last: 2022 }, { model: 'X', serial: '', dives: 2, linkedTo: 'p' }], text);
  assert.deepEqual(rows[0], { key: computerKey({ model: 'Suunto D5', serial: '2271-0043' }), title: 'Suunto D5', detail: 'n° 2271-0043 · 9 plongées, 2022', linked: false });
  assert.equal(rows[1].detail, '2 plongées');
  assert.equal(rows[1].linked, true);
  const suits = pairRows('suit', [{ name: 'Étanche', dives: 140, first: 2016, last: 2026 }], text);
  assert.equal(suits[0].detail, '140 plongées, 2016 à 2026');
});

test('the screens: the card after the type, the menu entry and the dialog, with translated texts', () => {
  const root = new URL('../../app/src/', import.meta.url);
  const read = (p) => readFileSync(new URL(p, root), 'utf8');
  const edit = read('pages/ProfilePieceEdit.svelte');
  assert.match(edit, /logbookPairing\(\)/);
  assert.match(edit, /gear\.pair\.createComputer/);
  assert.match(edit, /gear\.pair\.otherSuit/);
  assert.match(edit, /linkFields\(undefined, link\)/);
  const page = read('pages/ProfilePiece.svelte');
  assert.match(page, /gear\.pair\.menu/);
  assert.match(page, /PairLogbookDialog/);
  const dialog = read('components/PairLogbookDialog.svelte');
  assert.match(dialog, /gear\.pair\.confirm/);
  assert.match(dialog, /gear\.pair\.serialNote/);
  assert.match(dialog, /profileWide\(\)/);
  for (const lang of ['fr', 'en']) {
    const pair = JSON.parse(read(`i18n/${lang}.json`)).gear.pair;
    for (const key of ['title', 'leadComputer', 'leadSuit', 'createComputer', 'createSuit', 'otherComputer', 'otherSuit', 'menu', 'serialNote', 'confirm', 'linked', 'checked', 'dives']) assert.ok(pair[key], `${lang} gear.pair.${key}`);
  }
});
