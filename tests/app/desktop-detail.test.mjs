// The five tabs of the desktop dive detail (task 2026-11-16-262): the weight chips and their total, the water
// type menu and the stars through the edit path, the gas cards and their colour tokens, the Consommation
// figures, the typed mix and pressures, and the inert « Autre équipement » seam.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  consumption,
  cylinderSpan,
  gasCards,
  gasText,
  parseGas,
  parsePressurePair,
  weightChips,
} from '../../app/src/lib/desktop-detail.js';
import { fieldChanges, weightChanges } from '../../app/src/lib/desktop-edit.js';
import { DETAIL_TABS } from '../../app/src/lib/detail-tab.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const metric = { length: 'm', temperature: 'C', pressure: 'bar', volume: 'l', weight: 'kg' };
const digits = (s) => s.replace(/[^\d.,]/g, '');

const cylinder = (extra = {}) => ({
  description: 'AL80',
  sizeMl: 11100,
  workingPressureMbar: 207000,
  startMbar: 232000,
  endMbar: 70000,
  o2Permille: 210,
  hePermille: 0,
  gasUsedMl: 1798000,
  use: 'OC-gas',
  used: true,
  protected: false,
  ...extra,
});

const dive = (extra = {}) => ({
  id: 5,
  manual: false,
  divemode: 'OC',
  userSalinity: 10000,
  visibility: 0,
  tags: [],
  sacMlMin: 16000,
  weights: [
    { description: 'belt', grams: 5000 },
    { description: 'integrated', grams: 3000 },
  ],
  cylinders: [cylinder()],
  ...extra,
});

test('the tabs are Informations, Équipement, Gaz, Notes and Carte', () => {
  assert.deepEqual([...DETAIL_TABS], ['info', 'equipment', 'gas', 'notes', 'map']);
});

test('weights: one chip each with its place and weight, and the total', () => {
  const two = weightChips(dive().weights, metric);
  assert.equal(two.chips.length, 2);
  assert.equal(two.totalGrams, 8000);
  assert.equal(digits(two.total), '8');
  const three = weightChips([...dive().weights, { description: 'ankle', grams: 1500 }], metric);
  assert.equal(three.chips.length, 3);
  assert.equal(three.totalGrams, 9500);
  assert.equal(digits(three.total), '9.5'.replace('.', digits(three.total).includes(',') ? ',' : '.'));
  assert.deepEqual(three.chips.map((c) => c.index), [0, 1, 2]);
  assert.deepEqual(weightChips([], metric), { chips: [], total: '', totalGrams: 0 });
  // A weight of zero is not a chip but keeps its index in the dive's list.
  const zero = weightChips([{ description: 'belt', grams: 0 }, { description: 'ankle', grams: 2000 }], metric);
  assert.deepEqual(zero.chips.map((c) => c.index), [1]);
});

test('weights: adding a third through the edit path keeps the two others', () => {
  const rows = dive().weights.map((w) => ({ description: w.description, text: String(w.grams / 1000), grams0: w.grams, text0: String(w.grams / 1000) }));
  const result = weightChanges(dive(), [...rows, { description: 'ankle', text: '1.5', grams0: -1, text0: '' }], metric);
  assert.equal(result.ok, true);
  assert.deepEqual(result.changes.weights.map((w) => JSON.parse(w)), [
    { description: 'belt', grams: 5000 },
    { description: 'integrated', grams: 3000 },
    { description: 'ankle', grams: 1500 },
  ]);
});

test('Informations: the water type menu and the stars write through the edit path', () => {
  assert.deepEqual(fieldChanges(dive(), 'waterType', 'salt', metric), { ok: true, changes: { userSalinity: 10300 } });
  assert.deepEqual(fieldChanges(dive(), 'waterType', 'fresh', metric), { ok: true, changes: null });
  assert.deepEqual(fieldChanges(dive(), 'waterType', 'brackish', metric), { ok: true, changes: { userSalinity: 10100 } });
  assert.deepEqual(fieldChanges(dive(), 'waterType', 'en13319', metric), { ok: true, changes: { userSalinity: 10200 } });
  assert.deepEqual(fieldChanges(dive(), 'waterType', '', metric), { ok: true, changes: { userSalinity: 0 } });
  for (const n of [1, 2, 3, 4, 5]) assert.deepEqual(fieldChanges(dive(), 'visibility', n, metric), { ok: true, changes: { visibility: n } });
  assert.deepEqual(fieldChanges(dive({ visibility: 4 }), 'visibility', 0, metric), { ok: true, changes: { visibility: 0 } });
  const fields = read('app/src/components/DesktopDiveFields.svelte');
  assert.match(fields, /WATER_TYPES\.map/);
  assert.match(fields, /<DesktopEditField stacked tall name="waterType" kind="choice" openChoiceOnClick[^>]*options=\{waterOptions\}[^>]*onsave=/);
  // The stars are the Appréciation card's rows (task 2026-11-23-376): the same save path.
  assert.match(fields, /<DesktopStarsRow name="visibility"[^>]*onsave=\{\(v\) => save\('visibility', v\)\}/);
  assert.match(fields, /<DesktopStarsRow name="rating"[^>]*onsave=\{\(v\) => save\('rating', v\)\}/);
  const editor = read('app/src/components/DesktopEditField.svelte');
  assert.match(editor, /onpointerdown=\{pointerDown\}/);
  assert.match(editor, /if \(openChoice && input instanceof HTMLSelectElement\) input\.showPicker\(\)/);
});

test('Informations: buddy and guide editors hide the editing hint, without hiding errors', () => {
  const fields = read('app/src/components/DesktopDiveFields.svelte');
  // Since task 2026-11-23-376 the people are chips (DesktopChipsField), which have no hint line at all.
  for (const name of ['buddies', 'guides']) {
    assert.match(fields, new RegExp(`<DesktopChipsField name="${name}"`));
  }
  assert.ok(!/hint/i.test(read('app/src/components/DesktopChipsField.svelte').replace(/\/\/.*$/gm, '')));
  const editor = read('app/src/components/DesktopEditField.svelte');
  assert.match(editor, /showHint = true/);
  assert.match(editor, /\{#if invalid \|\| \(showHint && kind !== 'choice' && kind !== 'stars'\)\}/);
});

test('Gaz: one card per cylinder, with the levels of its pressures', () => {
  const cards = gasCards([cylinder(), cylinder({ o2Permille: 320, startMbar: 200000, endMbar: 0 })], metric);
  assert.equal(cards.length, 2);
  assert.deepEqual(cards.map((c) => c.index), [0, 1]);
  assert.equal(cards[0].hatched, false);
  assert.ok(Math.abs(cards[0].ratio - 70 / 207) < 1e-9);
  assert.ok(cards[0].range.includes('232') && cards[0].range.includes('70'));
  assert.equal(cards[1].hatched, true);
  assert.equal(gasCards([], metric).length, 0);
});

test('Gaz: the card colours are the mobile ones, declared as tokens in light and dark', () => {
  const css = read('app/src/theme.css');
  const light = css.slice(0, css.indexOf('html.dark {'));
  const dark = css.slice(css.indexOf('html.dark {'));
  for (const [token, hex] of [
    ['--bc-cylinder-breathed', '#CFDEF0'],
    ['--bc-cylinder-water-top', '#A9C4E2'],
    ['--bc-cylinder-water-bottom', '#5584B5'],
    ['--bc-cylinder-level', '#C62828'],
    ['--bc-gas-card-selected', '#F5F4F0'],
    ['--bc-gas-card-selected-outline', '#1F2124'],
  ]) {
    assert.ok(light.includes(`${token}: ${hex};`), `${token} ${hex} in light`);
  }
  for (const token of ['--bc-gas-card-selected', '--bc-gas-card-selected-outline', '--bc-gas-card-add-outline', '--bc-gas-reserve', '--bc-gas-track', '--bc-cylinder-breathed', '--bc-cylinder-level']) {
    assert.ok(dark.includes(`${token}:`), `${token} in dark`);
  }
  // The selected card: neutral background and a dark 2 dp outline, not blue; no hard-coded colour in the components.
  const cards = read('app/src/components/DesktopGasCards.svelte');
  assert.match(cards, /\.bc-desktop-gas-cards--card\.bc-desktop-gas-cards--selected \{\s*border-color: var\(--bc-gas-card-selected-outline\);\s*background: var\(--bc-gas-card-selected\);/);
  assert.match(cards, /border: 2px solid transparent/);
  for (const file of ['DesktopGasCards', 'DesktopConsumption', 'DesktopWeights', 'DesktopOtherGear']) {
    assert.doesNotMatch(read(`app/src/components/${file}.svelte`), /#[0-9A-Fa-f]{3,8}\b(?!;?\s*\/\/)/, `${file} has no hard-coded colour`);
  }
});

test('Consommation: SAC, litres breathed, bar used, the bar and the reserve mark', () => {
  const c = consumption(dive(), 0, metric, 50000);
  assert.ok(c.sac.includes('16'));
  assert.equal(digits(c.breathed).replace(/\D/g, ''), '1798');
  assert.equal(digits(c.used).replace(/\D/g, ''), '162');
  assert.equal(c.barKnown, true);
  assert.ok(Math.abs(c.usedFrom - 70 / 232) < 1e-9);
  assert.ok(Math.abs(c.reserveAt - 50 / 232) < 1e-9);
  assert.equal(c.marginMbar, 20000);
  assert.equal(consumption(dive(), 0, metric, 80000).marginMbar, -10000);
  assert.equal(consumption(dive(), 0, metric, 0).reserveAt, null);
  const none = consumption(dive({ sacMlMin: 0, cylinders: [cylinder({ startMbar: 0, endMbar: 0, gasUsedMl: 0 })] }), 0, metric, 40000);
  assert.equal(none.any, false);
  assert.equal(none.barKnown, false);
});

test('the typed mix and pressures', () => {
  assert.deepEqual(parseGas('32'), { o2Permille: 320, hePermille: 0 });
  assert.deepEqual(parseGas('18/45'), { o2Permille: 180, hePermille: 450 });
  assert.deepEqual(parseGas('EAN32'), { o2Permille: 320, hePermille: 0 });
  assert.deepEqual(parseGas('air'), { o2Permille: 210, hePermille: 0 });
  assert.equal(parseGas('60/50'), null);
  assert.equal(parseGas('abc'), null);
  assert.equal(gasText(210, 0), '21');
  assert.equal(gasText(180, 450), '18/45');
  assert.deepEqual(parsePressurePair('232 → 70'), { start: 232, end: 70 });
  assert.deepEqual(parsePressurePair('232-70'), { start: 232, end: 70 });
  assert.deepEqual(parsePressurePair('200'), { start: 200, end: 0 });
  assert.equal(parsePressurePair('70 → 232'), null);
  assert.equal(parsePressurePair('x'), null);
});

test('the span a cylinder was breathed', () => {
  const samples = { timeSeconds: [0, 60, 120, 180], cylinder: [0, 0, 1, 1] };
  assert.deepEqual(cylinderSpan(samples, 0), { fromMin: 0, toMin: 1 });
  assert.deepEqual(cylinderSpan(samples, 1), { fromMin: 2, toMin: 3 });
  assert.equal(cylinderSpan(samples, 2), null);
});

test('Autre équipement: a seam of two props, no storage of its own, absent without Benthic+', () => {
  const gear = read('app/src/components/DesktopOtherGear.svelte');
  assert.match(gear, /let \{ items = \[\], onremove \} = \$props\(\)/);
  assert.doesNotMatch(gear, /bc-desktop-other-gear--add/, 'adding is the button of the card header (task 366)');
  assert.doesNotMatch(gear, /deviceStore|BenthicCore|localStorage|saveDiveChanges/);
  const fields = read('app/src/components/DesktopDiveFields.svelte');
  // Without Benthic+ (and in the alpha) the section is not drawn at all (task 2026-11-22-333).
  assert.doesNotMatch(fields, /<DesktopOtherGear \/>/);
  assert.match(fields, /<DesktopOtherGear items=\{otherItems\} onremove=\{removeGear\} \/>/); // the release edition
});

test('the Carte tab keeps its height and the tab content replaces the old map block', () => {
  const fields = read('app/src/components/DesktopDiveFields.svelte');
  assert.match(fields, /\.bc-desktop-dive-fields--map \{\s*flex: none;\s*height: 300px;/);
  assert.doesNotMatch(read('app/src/pages/DiveDetail.svelte'), /desk-map/);
});

test('the texts of the five tabs exist in French and English', () => {
  for (const lang of ['fr', 'en']) {
    const d = JSON.parse(read(`app/src/i18n/${lang}.json`)).desktopDetail;
    for (const key of ['notRated', 'weightTotal', 'consumption', 'legendStart', 'legendEnd', 'otherGearAdd', 'openSiteLink', 'addCylinder']) assert.ok(d[key], `${lang} ${key}`);
    for (const key of ['weights', 'mix', 'pressure', 'coordinates']) assert.ok(d.label[key], `${lang} label.${key}`);
  }
  assert.equal(JSON.parse(read('app/src/i18n/fr.json')).desktopDetail.notRated, 'Non notée');
});

test('the weight types of the detail are the logbook ones (Subsurface ws_info, with the earlier dives), as the dive editor offered', () => {
  const weights = fs.readFileSync(new URL('../../app/src/components/DesktopWeights.svelte', import.meta.url), 'utf8');
  assert.match(weights, /readWeightTypeRows\(\)/);
  assert.match(read('app/src/lib/weight-types.svelte.js'), /BenthicCore\.toolQuery\(\{ kind: 'weights' \}\)/);
  assert.match(weights, /const names = \$derived\(types\.length \? types\.map\(\(w\) => w\.name\) : PLACES\)/);
  assert.match(weights, /names\.map\(\(value\) => \{/);
  assert.match(weights, /return \{ value, label: weightPlaceName\(value\), example:/);
});

test('Benthic+: the undersuit field shows even with no undersuit in the inventory, and its menu can add one', () => {
  const fields = read('app/src/components/DesktopDiveFields.svelte');
  assert.doesNotMatch(fields, /undersuits\.length \|\| equipment\.undersuitGearId/);
  assert.match(fields, /\{ value: ADD_UNDERSUIT, label: t\('desktopDetail\.addUndersuit'\) \}/);
  assert.match(fields, /if \(String\(id\) === ADD_UNDERSUIT\) \{\s*openOver\('\/profile\/gear\/new'\)/);
});
