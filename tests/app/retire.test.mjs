// SPDX-License-Identifier: GPL-2.0
// Retiring a piece instead of deleting it (task 2026-11-19-308, point 1) and the maintenance history PDF (point 5).
// Run: node --import ./tests/app/register.mjs --test tests/app/retire.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFileStore, memoryBackend } from '../../app/src/lib/file-store.js';
import { createInventory, RETIRE_REASONS, kitSummary } from '../../app/src/lib/inventory.js';
import { retireSheetButtons } from '../../app/src/lib/action-sheet.js';
import { historyRows, historyHtml, historyFileName } from '../../app/src/lib/maintenance-export.js';

function setup() {
  let tick = 0;
  const inventory = createInventory(createFileStore(memoryBackend()), { now: () => new Date(Date.UTC(2026, 10, 19, 12, 0, tick++)) });
  return { inventory };
}

test('retiring keeps the piece, its history, its kits and its dives, and records the day and the reason', async () => {
  const { inventory } = setup();
  const reg = await inventory.saveGear({ type: 'regulator', name: 'Apeks XTX50' });
  const item = await inventory.saveMaintenance({ gearId: reg.id, task: 'service', intervalMonths: 12, intervalDives: null });
  await inventory.noteMaintenance({ id: item.id, gearId: reg.id, task: 'service' }, { kind: 'service', doneOn: '2026-05-01', cost: 185 });
  const kit = await inventory.saveKit({ name: 'Eau froide', gearIds: [reg.id] });
  await inventory.saveDiveEquipment('2026-06-01T10:00:00', { suitGearId: '', undersuitGearId: '', gearIds: [reg.id], adhoc: [], kitId: '' });

  await inventory.retireGear(reg.id, 'sold');
  const retired = await inventory.getGear(reg.id);
  assert.equal(retired.retired, true);
  assert.equal(retired.retiredOn, '2026-11-19');
  assert.equal(retired.retiredReason, 'sold');
  assert.equal((await inventory.listMaintenance())[0].history.length, 1, 'the history stays');
  assert.deepEqual((await inventory.listKits())[0].gearIds, [reg.id], 'the kit file keeps it for « Remettre en service »');
  assert.equal((await inventory.listDiveEquipment()).length, 1, 'the dive keeps its equipment');
  assert.equal(kitSummary(kit, new Map([[reg.id, retired]])), '', 'a retired piece does not show in a kit');

  await inventory.restoreGear(reg.id);
  const back = await inventory.getGear(reg.id);
  assert.equal(back.retired, false);
  assert.equal(back.retiredOn, undefined);
  assert.equal(back.retiredReason, undefined);
});

test('a reason is optional and must be one of the three; a form that does not send a retired piece keeps it in the kit', async () => {
  assert.deepEqual([...RETIRE_REASONS], ['sold', 'lost', 'worn']);
  const { inventory } = setup();
  const a = await inventory.saveGear({ type: 'regulator', name: 'A' });
  const b = await inventory.saveGear({ type: 'regulator', name: 'B' });
  await inventory.retireGear(a.id, /** @type {any} */ ('stolen'));
  assert.equal((await inventory.getGear(a.id)).retiredReason, undefined);
  const kit = await inventory.saveKit({ name: 'Kit', gearIds: [a.id, b.id] });
  await inventory.saveKit({ id: kit.id, name: 'Kit', gearIds: [b.id] }); // the screen only knows B
  assert.deepEqual((await inventory.listKits())[0].gearIds.sort(), [a.id, b.id].sort());
});

test('deleting for good erases the piece, its reminders and their invoices, and leaves the dives\' records of other pieces', async () => {
  const { inventory } = setup();
  const reg = await inventory.saveGear({ type: 'regulator', name: 'Suunto' });
  const other = await inventory.saveGear({ type: 'regulator', name: 'Other' });
  const photo = await inventory.savePhoto('data:image/jpeg;base64,AAAA');
  const item = await inventory.saveMaintenance({ gearId: reg.id, task: 'service', intervalMonths: 12, intervalDives: null });
  await inventory.noteMaintenance({ id: item.id, gearId: reg.id, task: 'service' }, { kind: 'service', doneOn: '2026-05-01', invoicePhotoId: photo });
  await inventory.saveDiveEquipment('2026-06-01T10:00:00', { suitGearId: '', undersuitGearId: '', gearIds: [reg.id, other.id], adhoc: [], kitId: '' });
  await inventory.retireGear(reg.id);
  await inventory.deleteGear(reg.id);
  assert.equal(await inventory.getGear(reg.id), null);
  assert.deepEqual(await inventory.listMaintenance(), []);
  assert.equal(await inventory.readPhoto(photo), '');
  assert.deepEqual((await inventory.listDiveEquipment())[0].gearIds, [other.id]);
});

test('the iPhone action sheet offers each reason, then no reason, then Annuler', () => {
  const picked = [];
  const sheet = retireSheetButtons({
    title: 'Retirer le Shearwater <Perdix> 2 ?',
    text: 'Il quitte vos listes.',
    reasons: [
      { reason: 'sold', label: 'Retirer · vendue' },
      { reason: 'lost', label: 'Retirer · perdue' },
      { reason: 'worn', label: 'Retirer · hors d’usage' },
    ],
    none: 'Retirer sans raison',
    onPick: (r) => picked.push(r),
    cancel: 'Annuler',
  });
  assert.equal(sheet.length, 2);
  assert.equal(sheet[0][0].label, true);
  assert.ok(sheet[0][0].text.includes('&lt;Perdix&gt;'), 'the name is escaped');
  assert.deepEqual(sheet[0].slice(1).map((b) => b.text), ['Retirer · vendue', 'Retirer · perdue', 'Retirer · hors d’usage', 'Retirer sans raison']);
  for (const b of sheet[0].slice(1)) b.onClick();
  assert.deepEqual(picked, ['sold', 'lost', 'worn', undefined]);
  assert.equal(sheet[1][0].text, 'Annuler');
});

test('the history PDF: the piece, a table from the latest entry, the invoices after, the paper of the settings', () => {
  const item = {
    id: 'i1',
    gearId: 'g',
    task: 'service',
    history: [
      { id: 'h1', kind: 'service', doneOn: '2024-12-12', doneBy: 'Plongée Nordique, Montréal', cost: 185, notes: 'Membranes et joints changés', invoicePhotoId: 'p1' },
      { id: 'h2', kind: 'inspection', doneOn: '2024-02-03', notes: 'Aucune fuite' },
    ],
  };
  const rows = historyRows([item]);
  assert.deepEqual(rows.map((r) => r.id), ['h1', 'h2']);
  const html = historyHtml({ name: 'Apeks <XTX50>', typeLabel: 'Détendeur', serial: 'AX50-118 322', dives: 180, next: '12 décembre 2026', rows, invoices: [{ label: 'Facture', dataUrl: 'data:image/jpeg;base64,AAAA' }], exportedOn: '19 novembre 2026', letter: true });
  assert.match(html, /size: letter/);
  assert.match(html, /Apeks &lt;XTX50&gt;/);
  assert.ok(html.indexOf('12 déc. 2024') < html.indexOf('3 févr. 2024'));
  assert.match(html, /<img src="data:image\/jpeg;base64,AAAA"/);
  assert.match(historyHtml({ name: 'x', typeLabel: 'y', dives: 0, next: '', rows: [], invoices: [], exportedOn: 'z', letter: false }), /size: A4/);
  assert.equal(historyFileName('Apeks XTX50 é', '2026-11-19').endsWith('apeks-xtx50-e-2026-11-19.pdf'), true);
});

const root = new URL('../../app/src/', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

test('the screens: retire everywhere, delete for good only on a retired piece, no pencil on it', () => {
  const piece = read('pages/ProfilePiece.svelte');
  assert.match(piece, /\{#if piece && !piece\.retired\}\s*<a\s+href=\{editPath\}/, 'no pencil on a retired piece');
  assert.match(piece, /\{#if piece\.retired\}\s*<button type="button" class="bc-piece-page--forever"/, '« Supprimer pour de bon » only when retired');
  assert.ok(!piece.includes("t('gear.piece.delete')"), 'the active menu has no Supprimer');
  assert.match(piece, /removeForGood[\s\S]*?if \(!piece\?\.retired\) return/, 'the deletion refuses a piece that is not retired');
  assert.match(read('pages/ProfileComputerEdit.svelte'), /RetirePieceDialog/);
  assert.match(read('pages/ProfilePieceEdit.svelte'), /RetirePieceDialog/);
  const app = read('App.svelte');
  assert.ok(app.indexOf("'/profile/gear/retired/'") < app.indexOf("'/profile/gear/:id'"), 'retired before :id');
});
