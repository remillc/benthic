// The cylinder dialogs of the dive detail's Gaz tab (task 2026-11-26-401): the drafts, the mix name, the validation and the
// patch a Save sends, then the sources (chevron, dialog on Android phones only, one save for a rebreather's two cylinders).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { blankCylinder, chooseType, newPartDraft, cylinderDraft, sizeMlOf, sizeText, draftErrors, draftPatch, hasErrors, mixHelper, percentText, pressureText } from '../../app/src/lib/cylinder-dialog.js';
import { cylinderChanges } from '../../app/src/lib/desktop-edit.js';

const metric = { pressure: 'bar' };
const imperial = { pressure: 'psi' };
const cyl = (extra = {}) => ({ description: 'AL80', sizeMl: 11100, workingPressureMbar: 207000, startMbar: 200000, endMbar: 50000, o2Permille: 320, hePermille: 0, gasUsedMl: 0, use: 'OC-gas', used: true, protected: false, ...extra });
const types = [{ name: 'AL80', ml: 11100, workingPressureMbar: 207000 }, { name: 'HP100', ml: 12000, workingPressureMbar: 232000 }];
const words = { air: 'Air', oxygen: 'Oxygen', nitrox: 'EAN{o2}', trimix: 'Trimix {o2}/{he}' };
const dive = (cylinders, manual = true) => ({ manual, cylinders });
const source = (path) => readFileSync(new URL(`../../app/src/${path}`, import.meta.url), 'utf8');

test('the draft holds the texts in the diver\'s unit', () => {
  assert.deepEqual(cylinderDraft(cyl(), metric), { description: 'AL80', o2: '32', he: '0', start: '200', end: '50', use: 'OC-gas', depth: '', custom: false, size: '11,1', workingPressure: '207' });
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
  assert.equal(draftErrors({ ...draft, start: '9999' }, metric, {}).start, true, 'the pressures are checked on every dive');
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
  assert.deepEqual(draftPatch(c, { ...draft, start: '210' }, types, metric, {}), { startMbar: 210000 }, "a computer's pressures are edited too");
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
  assert.deepEqual(draft, { description: '', o2: '100', he: '0', start: '', end: '', use: 'oxygen', depth: '', custom: false, size: '', workingPressure: '' });
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

test('sources: the chevron, the dialogs on phones, the dashed tile without chevron', () => {
  const cards = source('components/DesktopGasCards.svelte');
  assert.match(cards, /\{#if chevron \|\| editable\}<span class="bc-desktop-gas-cards--chevron"[^>]*><Icon name="chevron" size=\{24\}/);
  assert.match(cards, /inset-inline-end: 8px;/);
  assert.match(cards, /top: 50%;/);
  assert.ok(cards.indexOf('class="bc-desktop-gas-cards--add"') > cards.lastIndexOf('{/each}'), 'the add tile is outside the tiles loop, so it has no chevron');
  const fields = source('components/DesktopDiveFields.svelte');
  // Tasks 2026-11-26-410 and 2026-11-27-411: every device opens the dialogs (the desktop's layout on a tablet), every tile has
  // the chevron and a name that starts with « Modifier », and no cylinder fields are left under the tiles.
  assert.match(fields, /const dialogs = true;/);
  assert.doesNotMatch(fields, /cylinderFields/);
  assert.match(fields, /editable=\{dialogs\} chevron onedit=\{editTile\}/);
  assert.match(fields, /desktop=\{!layout\.phone\}/);
  assert.match(fields, /onmove=\{editing\.single && layout\.phone \? moveEditing : undefined\}/, 'no move buttons on the tablet and desktop dialog');
  assert.match(cards, /aria-label=\{editable \? t\('desktopDetail\.editTileLabel', \{ label: tile\.label \}\) : tile\.label\}/);
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

test('« Autre… »: a cylinder outside the table of types has its own size and working pressure', () => {
  const other = cylinderDraft(cyl({ description: '' }), metric);
  assert.equal(other.custom, true, 'no type name and a size: Autre…');
  assert.equal(cylinderDraft(cyl({ description: '', sizeMl: 0 }), metric).custom, false);
  // Choosing « Autre… » drops the name and keeps the size; choosing a type fills size and pressure.
  const draft = cylinderDraft(cyl(), metric);
  chooseType(draft, '__other__', types, metric);
  assert.deepEqual([draft.custom, draft.description, draft.size, draft.workingPressure], [true, '', '11,1', '207']);
  chooseType(draft, 'HP100', types, metric);
  assert.deepEqual([draft.custom, draft.description, draft.size, draft.workingPressure], [false, 'HP100', '12', '232']);
  // The patch sends the size and the working pressure together.
  const c = cyl({ description: '' });
  assert.deepEqual(draftPatch(c, { ...other, size: '15', workingPressure: '300' }, types, metric, {}), { sizeMl: 15000, workingPressureMbar: 300000 });
  assert.deepEqual(draftPatch(c, other, types, metric, {}), {});
  assert.deepEqual(draftPatch(cyl(), { ...cylinderDraft(cyl(), metric), custom: true, description: '' }, types, metric, {}), { description: '' }, 'AL80 to Autre…: the size stays');
  // Validation, only while Autre… is chosen.
  assert.equal(draftErrors({ ...other, size: '150' }, metric, {}).size, true);
  assert.equal(draftErrors({ ...other, workingPressure: '9999' }, metric, {}).workingPressure, true);
  assert.equal(draftErrors({ ...cylinderDraft(cyl(), metric), size: '150' }, metric, {}).size, false);
  assert.equal(hasErrors(draftErrors({ ...other, size: 'x' }, metric, {})), true);
});

test('sizes in cubic feet follow the working pressure, as in the phone editor', () => {
  const cuft = { pressure: 'psi', volume: 'cuft' };
  assert.equal(sizeText(11100, 207000, cuft), '80,1');
  assert.equal(sizeMlOf('80,1', 207000, cuft), 11103);
  assert.equal(sizeMlOf('11,1', 207000, { pressure: 'bar' }), 11100);
  assert.ok(Number.isNaN(sizeMlOf('500', 0, cuft)));
});

test('the desktop dialog: centred over a scrim, 560 px or 760 px with the parts side by side, Retirer at the left, Annuler and Enregistrer at the right', () => {
  const dialog = source('components/CylinderEditDialog.svelte');
  assert.match(dialog, /\{#if desktop\}<div class="bc-cylinder-dialog--scrim"/);
  assert.match(dialog, /class:bc-cylinder-dialog--wide=\{desktop && parts\.length > 1\}/);
  assert.match(dialog, /\.bc-cylinder-dialog--surface\.bc-cylinder-dialog--desktop \{[^}]*width: min\(560px/);
  assert.match(dialog, /\.bc-cylinder-dialog--surface\.bc-cylinder-dialog--wide \{[^}]*width: min\(760px/);
  assert.match(dialog, /\.bc-cylinder-dialog--wide \.bc-cylinder-dialog--cards \{[^}]*flex-direction: row/);
  const actions = dialog.slice(dialog.indexOf('bc-cylinder-dialog--desktop-actions">'));
  assert.ok(actions.indexOf('removeCylinder') < actions.indexOf("t('dialog.cancel')") && actions.indexOf("t('dialog.cancel')") < actions.indexOf('cylinderDialog.save'), 'Retirer, then Annuler, then Enregistrer');
});
