// Task 2026-11-26-403: the dive detail takes over « Modifier une plongée ». The pure logic of the cylinder dialogs (gas-change
// depth, MOD, pressure used) and the sources of what was built from the mock-ups (oxygen first, chevrons, the camera, the
// confirmation to remove a cylinder).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { consumption, cylinderDraft, depthMmOf, depthText, draftErrors, draftPatch, hasErrors, modMm } from '../../app/src/lib/cylinder-dialog.js';

const metric = { pressure: 'bar', length: 'm' };
const imperial = { pressure: 'psi', length: 'ft' };
const cyl = (extra = {}) => ({ description: 'AL40', sizeMl: 5700, workingPressureMbar: 207000, startMbar: 206843, endMbar: 206843, o2Permille: 320, hePermille: 0, use: 'bailout', used: false, protected: false, depthMm: 0, ...extra });
const source = (path) => readFileSync(new URL(`../../app/src/${path}`, import.meta.url), 'utf8');

test('the gas-change depth: typed in the diver\'s unit, kept in mm', () => {
  assert.equal(depthText(0, metric), '');
  assert.equal(depthText(21000, metric), '21');
  assert.equal(depthText(21500, metric), '21,5');
  assert.equal(depthText(30480, imperial), '100');
  assert.equal(depthMmOf('', metric), 0);
  assert.equal(depthMmOf('21,5', metric), 21500);
  assert.equal(depthMmOf('100', imperial), 30480);
  assert.ok(Number.isNaN(depthMmOf('600', metric)));
  assert.ok(Number.isNaN(depthMmOf('abc', metric)));
});

test('the MOD at a ppO2 of 1.6 bar follows the mix and the water', () => {
  // EAN32: 1.6 / 0.32 = 5 bar absolute, minus 1.013 at the surface, in sea water (1 030 kg/m3): 39.5 m.
  assert.equal(Math.round(modMm(32, 1013, 10300) / 100), 395);
  assert.equal(modMm(0, 1013, 10300), 0, 'no mix, no MOD');
  assert.equal(modMm(100, 1013, 10300) < modMm(32, 1013, 10300), true, 'a richer mix has a shallower MOD');
  assert.ok(modMm(32, 1013, 10000) > modMm(32, 1013, 10300), 'fresh water goes deeper for the same pressure');
});

test('the line under Début and Fin: the pressure used, or « not breathed » when both are equal', () => {
  assert.deepEqual(consumption({ start: '200', end: '50' }, metric), { kind: 'used', mbar: 150000 });
  assert.deepEqual(consumption({ start: '3000', end: '3000' }, imperial), { kind: 'unused' });
  assert.equal(consumption({ start: '200', end: '' }, metric), null);
  assert.equal(consumption({ start: '', end: '' }, metric), null);
  assert.equal(consumption({ start: '50', end: '200' }, metric), null, 'an end above the start says nothing');
});

test('the depth goes into the draft, the check and the patch', () => {
  const c = cyl({ depthMm: 21000 });
  const draft = cylinderDraft(c, metric);
  assert.equal(draft.depth, '21');
  assert.deepEqual(draftPatch(c, draft, [], metric, { manual: true }), {});
  assert.deepEqual(draftPatch(c, { ...draft, depth: '' }, [], metric, { manual: true }), { depthMm: 0 }, 'emptied: no gas change depth');
  assert.deepEqual(draftPatch(c, { ...draft, depth: '30' }, [], metric, { manual: false }), { depthMm: 30000 }, 'the depth is not a computer\'s recording');
  assert.equal(hasErrors(draftErrors({ ...draft, depth: '900' }, metric, { manual: true })), true);
  assert.deepEqual(draftPatch(c, { ...draft, depth: '30' }, [], metric, { manual: true, oxygenOnly: true }), {}, 'a rebreather\'s oxygen has none');
});

test('sources: the camera on Début and Fin, the confirmation to remove, the mirrored rebreather tile', () => {
  const dialog = source('components/CylinderEditDialog.svelte');
  assert.match(dialog, /runGaugeCamera/);
  assert.match(dialog, /<GaugeSheet/);
  assert.match(dialog, /aria-label=\{t\(field === 'start' \? 'gauge\.readStart' : 'gauge\.readEnd'\)\}/);
  assert.match(dialog, /data-field="cylinder-mod"/);
  assert.match(dialog, /desktopDetail\.cylinderDialog\.notBreathed/);
  const fields = source('components/DesktopDiveFields.svelte');
  assert.match(fields, /\['oxygen', 'diluent'\]/);
  assert.match(fields, /desktopDetail\.removeCylinderTitle/);
  const cards = source('components/DesktopGasCards.svelte');
  assert.match(cards, /<RebreatherDrawing compact mirrored/);
  assert.ok(cards.indexOf('part-oxy">') < cards.indexOf('part-dil">'), 'Oxygène is drawn before Diluant');
  assert.match(source('components/RebreatherDrawing.svelte'), /translate\(218 0\) scale\(-1 1\)/);
  for (const lang of ['fr', 'en']) {
    const d = JSON.parse(source(`i18n/${lang}.json`)).desktopDetail;
    for (const key of ['removeCylinderTitle', 'removeCylinderConfirm', 'removeCylinderPlain']) assert.ok(d[key], `${lang}: ${key}`);
    assert.ok(d.cylinderDialog.notBreathed, `${lang}: notBreathed`);
    assert.ok(d.ccrTileLabel.indexOf('{oxygen}') < d.ccrTileLabel.indexOf('{diluent}'), `${lang}: the tile label names the oxygen first`);
  }
  assert.equal(JSON.parse(source('i18n/fr.json')).desktopDetail.cylinderDialog.footnote, 'Un recycleur a toujours un oxygène et un diluant.');
});

test('sources: the Lest card as rows with the amber suggestion on an Android phone, the chips elsewhere', () => {
  const fields = source('components/DesktopDiveFields.svelte');
  assert.match(fields, /const rowsLayout = \$derived\(layout\.phone && !ios\)/);
  assert.match(fields, /\{#if rowsLayout\}\s*<DiveWeightRows[^>]*suggestion=\{suggestionShown\}[^>]*ondismiss=/);
  assert.match(fields, /\{:else\}\s*<DesktopWeights/);
  assert.match(fields, /isMostRecent\(dive\.id, logbook\.dives\)/, 'the suggestion is only offered on the most recent dive, as the old editor did');
  const rows = source('components/DiveWeightRows.svelte');
  assert.match(rows, /\{#if n === 0\}<span class="bc-dive-weight-rows--label">\{t\('desktopDetail\.weightType'\)\}/, 'labels above the first row only');
  assert.match(rows, /\{#if n === 0\}<span class="bc-dive-weight-rows--label">\{t\('edit\.weight'\)\}/);
  assert.match(rows, /bc-dive-weight-rows--suggestion-close/);
  assert.match(rows, /desktopDetail\.manageWeightTypes/);
  assert.match(rows, /desktopDetail\.weightRowsNote/);
  assert.match(rows, /flex: 0 0 96px/);
  assert.match(rows, /border: 1px solid var\(--bc-outline\)/, 'the add button is outlined');
  assert.doesNotMatch(rows, /#[0-9A-Fa-f]{3,6}\b/, 'colours are --bc-* variables');
  for (const lang of ['fr', 'en']) {
    const d = JSON.parse(source(`i18n/${lang}.json`)).desktopDetail;
    for (const key of ['weightType', 'weightRowsNote', 'weightSuggestionClose', 'addWeight', 'removeWeight']) assert.ok(d[key], `${lang}: ${key}`);
  }
  assert.equal(JSON.parse(source('i18n/fr.json')).desktopDetail.weightRowsNote, 'Un type choisi part du poids de la plongée précédente, sinon de son poids dans Réglages › Types de lest.');
});

test('sources: Voyage in the Site card with its cross, the invalid switch ends the Informations tab', () => {
  const fields = source('components/DesktopDiveFields.svelte');
  const info = fields.slice(fields.indexOf("<div class=\"bc-desktop-dive-fields--equipment bc-desktop-dive-fields--info\">"), fields.indexOf("{:else if tab === 'equipment'}"));
  assert.ok(info.indexOf('name="site"') < info.indexOf('data-field="trip"'), 'Voyage follows the site, in its card');
  assert.ok(info.indexOf('data-field="trip"') < info.indexOf('name="people"'), 'and sits before the next card');
  assert.match(info, /aria-label=\{t\('edit\.tripClear'\)\}/);
  assert.doesNotMatch(info, /readonly label=\{t\('desktopDetail\.label\.trip'\)\}/, 'the read-only trip line of Conditions is gone');
  assert.ok(info.lastIndexOf('name="invalid"') > info.lastIndexOf('name="tags"'), 'the invalid card is the last one');
  assert.match(info, /role="switch"[^>]*checked=\{dive\.invalid\}/);
  assert.match(fields, /write\(\{ invalid: on \? 1 : 0 \}\)/);
  assert.match(fields, /tripChange\(\{ action: 'remove', diveIds: \[dive\.id\] \}\)/);
  for (const lang of ['fr', 'en']) {
    const d = JSON.parse(source(`i18n/${lang}.json`));
    assert.ok(d.desktopDetail.newTrip && d.edit.tripClear && d.edit.invalid && d.edit.invalidText, lang);
  }
  assert.equal(JSON.parse(source('i18n/fr.json')).edit.invalidText, 'Exclue des statistiques et masquée selon le réglage');
});

test('sources: Réglages › Équipement lists the oxygen before the diluent, and the desktop gets the Types de lest card', () => {
  const settings = source('pages/Settings.svelte');
  assert.ok(settings.indexOf("rebreatherRow('defaultOxygen'") < settings.indexOf("rebreatherRow('defaultDiluent'"), 'Oxygène, recycleur comes first');
  assert.match(settings, /case 'weightTypes':[\s\S]*custom: 'weightTypes'/);
  assert.match(settings, /block\.custom === 'weightTypes'\}\s*<DesktopWeightTypes \/>/);
  const categories = source('lib/desktop-settings.js');
  assert.match(categories, /groups: \['equipment', 'cylinderTypes', 'weightTypes'\]/, 'under Types de bouteilles');
  const list = source('components/DesktopWeightTypes.svelte');
  assert.match(list, /settings\.weights\.intro/);
  assert.match(list, /readWeightTypeRows/);
  assert.match(list, /settings\.weights\.add/);
  assert.match(list, /formatWeight\(type\.grams, logbook\.prefs\)/);
  const dialog = source('components/DesktopWeightTypeDialog.svelte');
  for (const key of ['settings.weights.name', 'settings.weights.weight', 'settings.weights.deleteType', 'dialog.cancel', 'edit.save', 'settings.weights.noteDesktop']) assert.ok(dialog.includes(key), key);
  assert.match(dialog, /saveWeightType\(type/);
  assert.match(dialog, /removeWeightType\(type\)/);
  for (const lang of ['fr', 'en']) assert.ok(JSON.parse(source(`i18n/${lang}.json`)).settings.weights.noteDesktop, lang);
});

test('sources: the iPhone sheet of the cylinder dialog follows the iOS mock-ups, without the camera', () => {
  const dialog = source('components/CylinderEditDialog.svelte');
  assert.match(dialog, /\{#if ios\}\s*<div class="bc-cylinder-dialog--surface bc-cylinder-dialog--ios"/);
  assert.match(dialog, /const camera = \$derived\(manual && !ios && gaugeCameraAvailable\(\)\)/);
  for (const key of ['dialog.cancel', 'dialog.ok', 'desktopDetail.cylinderDialog.startShort', 'desktopDetail.cylinderDialog.endShort', 'desktopDetail.cylinderDialog.gas', 'desktopDetail.cylinderDialog.pressure']) assert.ok(dialog.includes(key), key);
  for (const lang of ['fr', 'en']) {
    const d = JSON.parse(source(`i18n/${lang}.json`)).desktopDetail.cylinderDialog;
    for (const key of ['gas', 'pressure', 'startShort', 'endShort']) assert.ok(d[key], `${lang}: ${key}`);
  }
  assert.equal(JSON.parse(source('i18n/fr.json')).desktopDetail.cylinderDialog.startShort, 'Au départ');
});
