// The dive detail's tabs on every device (tasks 2026-11-24-382, 386 and 387): the dive type and the tiles it shows, the
// setpoints read from the ppO2 trace, the kit menu's rows, the sheet's search, and the sources of the new pieces.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DIVE_MODES, diveTypeOptions, gasTiles, knownMode, setpointsOf } from '../../app/src/lib/desktop-detail.js';
import { KIT_MANAGE, KIT_PREVIOUS, filterSheetOptions, kitMenuOptions } from '../../app/src/lib/detail-pick.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const metric = { length: 'm', temperature: 'C', pressure: 'bar', volume: 'l', weight: 'kg' };
const cyl = (extra = {}) => ({ description: 'AL80', sizeMl: 11100, workingPressureMbar: 207000, startMbar: 232000, endMbar: 70000, o2Permille: 210, hePermille: 0, gasUsedMl: 0, use: 'OC-gas', used: true, protected: false, ...extra });

test('the dive type selector has the core’s four modes, long and short labels', () => {
  assert.deepEqual(DIVE_MODES, ['OC', 'CCR', 'PSCR', 'Freedive']);
  assert.deepEqual(diveTypeOptions().map((o) => o.value), ['OC', 'CCR', 'PSCR', 'Freedive']);
  assert.equal(diveTypeOptions(true).length, 4);
  assert.equal(knownMode('PSCR'), 'PSCR');
  assert.equal(knownMode('whatever'), 'OC');
});

test('open circuit: one tile per cylinder; freedive: none, the cylinders stay in the dive', () => {
  const cylinders = [cyl(), cyl({ o2Permille: 320 })];
  const oc = gasTiles(cylinders, 'OC', metric);
  assert.deepEqual(oc.map((x) => [x.key, x.kind]), [['c0', 'cylinder'], ['c1', 'cylinder']]);
  assert.deepEqual(gasTiles(cylinders, 'Freedive', metric), []);
  assert.equal(cylinders.length, 2);
  assert.deepEqual(gasTiles(cylinders, 'OC', metric).map((x) => x.key), ['c0', 'c1'], 'back in open circuit the tiles are those of the start');
});

test('CCR: one wide tile with the diluent and the oxygen, the others as bailout tiles', () => {
  const cylinders = [cyl({ use: 'diluent' }), cyl({ use: 'oxygen', o2Permille: 1000 }), cyl({ o2Permille: 320 })];
  const tiles = gasTiles(cylinders, 'CCR', metric);
  assert.deepEqual(tiles.map((x) => [x.key, x.kind]), [['unit', 'ccr'], ['c2', 'cylinder']]);
  assert.deepEqual(tiles[0].parts.map((p) => p.role), ['oxygen', 'diluent'], 'oxygen first (task 2026-11-26-403)');
  assert.deepEqual(tiles[0].indexes, [1, 0], 'the oxygen cylinder (1) comes before the diluent (0)');
  assert.match(tiles[1].lines[0], /EAN32/);
  // 26 November 2026: pure oxygen is « O₂ » under the rebreather, « Oxygène · Faber FX15 (2 L) » ran too long.
  assert.match(tiles[0].parts[0].lines[0], /^O₂( · |$)/);
  assert.doesNotMatch(tiles[0].parts[0].lines[0], /Oxygène|Oxygen/);
});

test('pSCR: one tile with the mix (the diluent, else the first cylinder), the others as bailouts, no oxygen', () => {
  const tiles = gasTiles([cyl({ o2Permille: 400 }), cyl({ use: 'oxygen' }), cyl()], 'PSCR', metric);
  assert.equal(tiles[0].kind, 'pscr');
  assert.deepEqual(tiles[0].parts.map((p) => p.role), ['mix']);
  assert.deepEqual(tiles.slice(1).map((x) => x.key), ['c1', 'c2']);
  assert.equal(gasTiles([], 'PSCR', metric).length, 0);
});

test('the setpoints are the values the ppO2 trace stays at, the lowest and the highest', () => {
  const ppo2Mbar = [210, ...Array(40).fill(700), ...Array(40).fill(1300), 1000, 1100];
  const depthMm = ppo2Mbar.map(() => 10000);
  assert.deepEqual(setpointsOf({ ppo2Mbar, depthMm }), { low: 0.7, high: 1.3 });
  assert.equal(setpointsOf({ ppo2Mbar: [], depthMm: [] }), null);
  assert.equal(setpointsOf(null), null);
  assert.deepEqual(setpointsOf({ ppo2Mbar: Array(30).fill(1200), depthMm: Array(30).fill(9000) }), { low: 1.2, high: 1.2 });
});

test('the kit menu: the previous dive, the kits with their pieces, a divider, « Gérer les kits »', () => {
  const words = { previous: 'Plongée précédente', previousLine: (n) => `même équipement que la plongée n° ${n}`, pieces: (n) => `${n} pièces`, manage: 'Gérer les kits' };
  const kits = [{ id: 'k1', name: 'Recycleur', gearIds: ['a', 'b'] }];
  const rows = kitMenuOptions(kits, { number: 4 }, words);
  assert.deepEqual(rows.map((r) => r.value), [KIT_PREVIOUS, 'k1', KIT_MANAGE]);
  assert.equal(rows[0].example, 'même équipement que la plongée n° 4');
  assert.equal(rows[1].example, '2 pièces');
  assert.equal(rows[2].divider, true);
  assert.deepEqual(kitMenuOptions(kits, null, words).map((r) => r.value), ['k1', KIT_MANAGE]);
});

test('the sheet’s search keeps the rows that contain the text, whatever the case', () => {
  const rows = [{ label: 'Lock 23' }, { label: 'Les Escoumins' }, { label: 'Lac Memphrémagog' }];
  assert.deepEqual(filterSheetOptions(rows, 'LAC').map((r) => r.label), ['Lac Memphrémagog']);
  assert.equal(filterSheetOptions(rows, '  ').length, 3);
});

test('the new components follow the naming and layering rules and the texts exist in both languages', () => {
  for (const file of ['DetailSheet', 'DesktopKitField', 'DesktopPickField', 'DiveSignatures', 'DiveDateTimeDialogs']) {
    const src = read(`app/src/components/${file}.svelte`);
    assert.match(src, /@ts-check/, file);
    if (!/<style>/.test(src)) continue;
    assert.match(src, /@layer bc\.components/, file);
    assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b(?![^{]*\})/, `${file}: no hard-coded colour in a style rule`);
  }
  for (const l of ['fr', 'en']) {
    const d = JSON.parse(read(`app/src/i18n/${l}.json`));
    for (const m of DIVE_MODES) assert.ok(d.desktopDetail.diveType.long[m] && d.desktopDetail.diveType.short[m], `${l} ${m}`);
    assert.ok(d.desktopDetail.noGas.title && d.desktopDetail.noGas.text && d.desktopDetail.rebreatherCard.low && d.desktopDetail.rebreatherCard.high, l);
    assert.ok(d.desktopDetail.kitMenu.previous && d.desktopDetail.kitMenu.previousLine && d.desktopDetail.card.datetime && d.desktopDetail.dateNote && d.desktopDetail.dateNoteDesktop, l);
    assert.equal(d.desktopDetail.changeKit, undefined, `${l}: « Changer de kit » is gone`);
    assert.equal(d.validation.section, 'Signatures', l);
  }
});
