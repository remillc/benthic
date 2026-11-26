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
