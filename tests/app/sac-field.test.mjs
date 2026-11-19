import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ML_PER_CUFT } from '../../app/src/lib/planner-rules.js';
import { o2RateText, o2RateValues, parseSac, sacMax, sacPresets, sacPresetText, sacText } from '../../app/src/lib/sac-field.js';

test('presets: 0 to 2 cuft/min by 0.01, 10 to 30 L/min by 5 (typing up to 60 L/min)', () => {
  const cuft = sacPresets(true).map((p) => p.unit);
  assert.equal(cuft.length, 201);
  assert.deepEqual(cuft.slice(34, 39), [0.34, 0.35, 0.36, 0.37, 0.38]);
  assert.equal(cuft[0], 0);
  assert.equal(cuft[200], 2);
  assert.deepEqual(sacPresets(false).map((p) => p.unit), [10, 15, 20, 25, 30]);
  assert.equal(sacPresets(false)[2].ml, 20000);
  assert.equal(sacPresets(true)[50].ml, Math.round(0.5 * ML_PER_CUFT));
  assert.equal(sacMax(true), 2);
  assert.equal(sacMax(false), 60);
});

test('a typed two-decimal SAC is exactly a preset, so the list marks it', () => {
  const ml = parseSac('0,36', true);
  assert.equal(sacPresets(true).findIndex((p) => p.ml === ml), 36);
});

test('presets are shown with two decimals in cuft/min, whole in litres', () => {
  assert.equal(sacPresetText(0.36, true, 'fr'), '0,36');
  assert.equal(sacPresetText(0.5, true, 'fr'), '0,50');
  assert.equal(sacPresetText(0, true, 'fr'), '0,00');
  assert.equal(sacPresetText(2, true, 'en'), '2.00');
  assert.equal(sacPresetText(15, false, 'fr'), '15');
});

test('a typed value: comma or point, two decimals, clamped', () => {
  assert.equal(parseSac('0,36', true), Math.round(0.36 * ML_PER_CUFT));
  assert.equal(parseSac('0.355', true), Math.round(0.36 * ML_PER_CUFT), 'rounded to two decimals');
  assert.equal(parseSac(' 17,25 ', false), 17250);
  assert.equal(parseSac('17.254', false), 17250);
  assert.equal(parseSac('3', true), Math.round(2 * ML_PER_CUFT), 'clamped to 2 cuft/min');
  assert.equal(parseSac('99', false), 60000, 'clamped to 60 L/min');
  assert.equal(parseSac('-4', false), 0, 'not below 0');
  assert.equal(parseSac('0', false), 0, '0 is a value');
});

test('text that is not a number yet gives null', () => {
  for (const text of ['', ' ', '-', ',', '0,,5', 'abc', '1e3', '1 2']) assert.equal(parseSac(text, false), null, JSON.stringify(text));
  assert.equal(parseSac('0,', false), 0, 'a trailing comma still reads');
  assert.equal(parseSac('.5', false), 500);
});

test('the field text: up to two decimals, the language decimal mark', () => {
  assert.equal(sacText(Math.round(0.36 * ML_PER_CUFT), true, 'fr'), '0,36');
  assert.equal(sacText(Math.round(0.5 * ML_PER_CUFT), true, 'en'), '0.5');
  assert.equal(sacText(20000, false, 'fr'), '20');
  assert.equal(sacText(17250, false, 'fr'), '17,25');
  assert.equal(sacText(0, false, 'en'), '0');
});

test('what is shown can be typed back unchanged', () => {
  for (const ml of [0, 10194, 17250, 20000, 56634]) {
    for (const cuft of [true, false]) {
      const kept = parseSac(sacText(ml, cuft, 'fr'), cuft);
      assert.equal(parseSac(sacText(kept, cuft, 'fr'), cuft), kept);
    }
  }
});

// Task 2026-11-19-286: gas consumption per minute follows the Volume unit.
import fr from '../../app/src/i18n/fr.json' with { type: 'json' };
import en from '../../app/src/i18n/en.json' with { type: 'json' };
import { readFileSync } from 'node:fs';

test('metabolic O2: the wheel lists core ml/min in both units, conversions in both ways', () => {
  const l = o2RateValues(false);
  assert.equal(l[0], 100);
  assert.equal(l.at(-1), 3000);
  const c = o2RateValues(true);
  assert.equal(c[0], Math.round(0.004 * ML_PER_CUFT));
  assert.ok(c.at(-1) <= 3000, 'stays inside the core range');
  assert.ok(c.includes(Math.round(0.03 * ML_PER_CUFT)), '0.030 cu ft/min is offered');
  // 1 cu ft = 28.3168 L: 0.03 cu ft/min writes 850 ml/min
  assert.equal(Math.round(0.03 * ML_PER_CUFT), 850);
  assert.equal(o2RateText(850, true, 'en'), '0.030');
  assert.equal(o2RateText(850, false, 'en'), '0.85');
  assert.equal(o2RateText(850, true, 'fr'), '0,030');
  // the same stored value, shown in each unit, goes back to the same core value
  const back = Math.round(Number(o2RateText(850, true, 'en')) * ML_PER_CUFT);
  assert.equal(back, 850);
});

test('labels and the line under Volume, fr and en', () => {
  assert.equal(fr.units.cubicFeetPerMinute, 'pi³/min');
  assert.equal(fr.units.litersPerMinute, 'l/min');
  assert.equal(en.units.cubicFeetPerMinute, 'cu ft/min');
  assert.equal(en.units.litersPerMinute, 'L/min');
  assert.equal(fr.settings.volumeNoteCuft, 'Aussi la consommation de gaz par minute (SAC, RMV) et la consommation métabolique d’O₂, en pi³/min');
  assert.equal(fr.settings.volumeNoteLitres, 'Aussi la consommation de gaz par minute (SAC, RMV) et la consommation métabolique d’O₂, en l/min');
  assert.match(en.settings.volumeNoteCuft, /cu ft\/min$/);
  assert.match(en.settings.volumeNoteLitres, /L\/min$/);
});

test('Settings: the Volume row carries the line and the pSCR field follows the unit', () => {
  const src = readFileSync(new URL('../../app/src/pages/Settings.svelte', import.meta.url), 'utf8');
  assert.match(src, /unitRow\('volume'[^\n]*volumeNoteCuft[^\n]*volumeNoteLitres/);
  assert.match(src, /o2ConsumptionMlMin: o2RateValues\(cuft\)\[i\]/);
  assert.match(src, /o2RateText\(p\.o2ConsumptionMlMin, cuft, locale\)/);
});
