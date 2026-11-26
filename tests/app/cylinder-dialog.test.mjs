// The cylinder dialogs of the dive detail's Gaz tab (task 2026-11-26-401): the drafts, the mix name, the validation and the
// patch a Save sends, then the sources (chevron, dialog on Android phones only, one save for a rebreather's two cylinders).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { blankCylinder, newPartDraft, cylinderDraft, draftErrors, draftPatch, hasErrors, mixHelper, percentText, pressureText } from '../../app/src/lib/cylinder-dialog.js';
import { cylinderChanges } from '../../app/src/lib/desktop-edit.js';

const metric = { pressure: 'bar' };
const imperial = { pressure: 'psi' };
const cyl = (extra = {}) => ({ description: 'AL80', sizeMl: 11100, workingPressureMbar: 207000, startMbar: 200000, endMbar: 50000, o2Permille: 320, hePermille: 0, gasUsedMl: 0, use: 'OC-gas', used: true, protected: false, ...extra });
const types = [{ name: 'AL80', ml: 11100, workingPressureMbar: 207000 }, { name: 'HP100', ml: 12000, workingPressureMbar: 232000 }];
const words = { air: 'Air', oxygen: 'Oxygen', nitrox: 'EAN{o2}', trimix: 'Trimix {o2}/{he}' };
const dive = (cylinders, manual = true) => ({ manual, cylinders });
const source = (path) => readFileSync(new URL(`../../app/src/${path}`, import.meta.url), 'utf8');

test('the draft holds the texts in the diver\'s unit', () => {
  assert.deepEqual(cylinderDraft(cyl(), metric), { description: 'AL80', o2: '32', he: '0', start: '200', end: '50', use: 'OC-gas', depth: '' });
  assert.equal(pressureText(206843, imperial), '3000');
  assert.equal(pressureText(0, metric), '');
  assert.equal(percentText(215), '21,5');
  assert.equal(cylinderDraft(cyl({ o2Permille: 0 }), metric).o2, '21', 'a cylinder without a mix is air');
});

test('the mix name under O2 and He follows the typing', () => {
  assert.equal(mixHelper({ o2: '32', he: '0' }, words), 'EAN32');
  assert.equal(mixHelper({ o2: '21', he: '0' }, words), 'Air');
  assert.equal(mixHelper({ o2: '18', he: '45' }, words), 'Trimix 18/45');
  assert.equal(mixHelper({ o2: '100', he: '' }, words, true), 'Oxygen');
  assert.equal(mixHelper({ o2: '60', he: '50' }, words), '', 'more than 100 %');
  assert.equal(mixHelper({ o2: 'x', he: '0' }, words), '');
});

test('invalid entries are found, and a computer\'s pressures are not entered', () => {
  const draft = cylinderDraft(cyl(), metric);
  assert.equal(hasErrors(draftErrors(draft, metric, { manual: true })), false);
  assert.equal(draftErrors({ ...draft, o2: '0' }, metric, { manual: true }).o2, true);
  assert.equal(draftErrors({ ...draft, o2: '60', he: '50' }, metric, { manual: true }).he, true);
  assert.equal(draftErrors({ ...draft, start: '9999' }, metric, { manual: true }).start, true);
  assert.equal(draftErrors({ ...draft, start: '9999' }, metric, { manual: false }).start, false);
  assert.equal(draftErrors({ ...draft, he: '' }, metric, { manual: true, oxygenOnly: true }).he, false, 'the oxygen cylinder has no He field');
});

test('the patch holds only what changed', () => {
  const c = cyl();
  const draft = cylinderDraft(c, metric);
  assert.deepEqual(draftPatch(c, draft, types, metric, { manual: true }), {});
  assert.deepEqual(draftPatch(c, { ...draft, description: 'HP100' }, types, metric, { manual: true }), { description: 'HP100', sizeMl: 12000, workingPressureMbar: 232000 });
  assert.deepEqual(draftPatch(c, { ...draft, o2: '36' }, types, metric, { manual: true }), { o2Permille: 360, hePermille: 0 });
  assert.deepEqual(draftPatch(c, { ...draft, o2: '18', he: '45' }, types, metric, { manual: true }), { o2Permille: 180, hePermille: 450 });
  assert.deepEqual(draftPatch(c, { ...draft, start: '210', end: '' }, types, metric, { manual: true }), { startMbar: 210000, endMbar: 0 });
  assert.deepEqual(draftPatch(c, { ...draft, start: '210' }, types, metric, { manual: false }), {}, 'a computer\'s pressures stay');
  assert.deepEqual(draftPatch(c, { ...draft, use: 'not used' }, types, metric, { manual: true }), { use: 'not used' });
  const he = cyl({ hePermille: 100 });
  assert.deepEqual(draftPatch(he, { ...cylinderDraft(he, metric), o2: '100' }, types, metric, { manual: true, oxygenOnly: true }), { o2Permille: 1000, hePermille: 100 }, 'the oxygen cylinder keeps its He');
});

test('the patches of a rebreather\'s two cylinders go through one cylinderChanges', () => {
  const dil = cyl({ use: 'diluent', o2Permille: 210 });
  const oxy = cyl({ use: 'oxygen', o2Permille: 1000 });
  const rows = [
    { index: 0, patch: draftPatch(dil, { ...cylinderDraft(dil, metric), o2: '18', he: '45' }, types, metric, { manual: true }) },
    { index: 1, patch: draftPatch(oxy, { ...cylinderDraft(oxy, metric), end: '120' }, types, metric, { manual: true, oxygenOnly: true }) },
  ];
  const result = cylinderChanges(dive([dil, oxy]), rows);
  assert.equal(result.ok, true);
  const sent = result.changes.cylinders.map((x) => JSON.parse(x));
  assert.equal(sent.length, 2);
  assert.equal(sent[0].o2Permille, 180);
  assert.equal(sent[1].endMbar, 120000);
});

test('a rebreather dive without an oxygen cylinder gets an empty oxygen card that Save adds', () => {
  const dil = cyl({ use: 'diluent', o2Permille: 210 });
  const draft = newPartDraft('oxygen', metric);
  assert.deepEqual(draft, { description: '', o2: '100', he: '0', start: '', end: '', use: 'oxygen', depth: '' });
  assert.equal(newPartDraft('diluent', metric).o2, '21');
  const patch = draftPatch(blankCylinder(), { ...draft, start: '200', end: '150' }, types, metric, { manual: true, oxygenOnly: true });
  assert.deepEqual(patch, { o2Permille: 1000, hePermille: 0, startMbar: 200000, endMbar: 150000, use: 'oxygen' });
  const result = cylinderChanges(dive([dil]), [{ index: 0, patch: {} }, { index: -1, patch }]);
  assert.equal(result.ok, true);
  const sent = result.changes.cylinders.map((x) => JSON.parse(x));
  assert.equal(sent.length, 2);
  assert.equal(sent[1].use, 'oxygen');
  assert.equal(sent[1].o2Permille, 1000);
  const empty = draftPatch(blankCylinder(), { ...draft }, types, metric, { manual: true, oxygenOnly: true });
  assert.deepEqual(empty, { o2Permille: 1000, hePermille: 0, use: 'oxygen' }, 'untouched, the card still adds an oxygen cylinder');
});

test('sources: the chevron, the dialogs on Android phones, the dashed tile without chevron', () => {
  const cards = source('components/DesktopGasCards.svelte');
  assert.match(cards, /\{#if chevron \|\| editable\}<span class="bc-desktop-gas-cards--chevron"[^>]*><Icon name="chevron" size=\{24\}/);
  assert.match(cards, /inset-inline-end: 8px;/);
  assert.match(cards, /top: 50%;/);
  assert.ok(cards.indexOf('class="bc-desktop-gas-cards--add"') > cards.lastIndexOf('{/each}'), 'the add tile is outside the tiles loop, so it has no chevron');
  const fields = source('components/DesktopDiveFields.svelte');
  assert.match(fields, /const dialogs = \$derived\(layout\.phone && !ios\)/);
  assert.match(fields, /editable=\{dialogs\} chevron=\{!layout\.desktop\} onedit=\{editTile\}/);
  assert.match(fields, /roles=\{editing\.single \? useOptions : undefined\}/);
  assert.match(fields, /onremove=\{editing\.single \? askRemove : undefined\}/);
  const dialog = source('components/CylinderEditDialog.svelte');
  assert.match(dialog, /bc-cylinder-dialog--remove-button/);
  assert.match(fields, /desktopDetail\.cylinderDialog\.footnote/);
});

test('the dialog texts exist in both languages', () => {
  for (const lang of ['fr', 'en']) {
    const d = JSON.parse(source(`i18n/${lang}.json`)).desktopDetail.cylinderDialog;
    for (const key of ['single', 'rebreather', 'closeWithoutSaving', 'save', 'role', 'o2', 'he', 'start', 'end', 'footnote']) assert.ok(d[key], `${lang}: ${key}`);
  }
  const fr = JSON.parse(source('i18n/fr.json')).desktopDetail.cylinderDialog;
  assert.equal(fr.single, 'Modifier la bouteille');
  assert.equal(fr.rebreather, 'Bouteilles du recycleur');
});
