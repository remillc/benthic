// SPDX-License-Identifier: GPL-2.0
// The desktop Outils section's own logic (app/src/lib/desktop-tools.js): the live lines of the
// tools list, the remaining desaturation, « Préparer ce mélange », the final pressure that follows
// the cylinder and the layers of the cylinder drawing. The calculations themselves are the
// phone's and keep their tests (gas-tools.test.mjs, planner tests).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DESKTOP_TOOLS,
  plansLine,
  desaturationLine,
  desaturationSeconds,
  blenderTarget,
  suggestedFinalPressure,
  followCylinder,
  aboveWorkingPressure,
  cylinderLayers,
} from '../../app/src/lib/desktop-tools.js';
import { gasBlend } from '../../app/src/lib/gas-blend.js';
import { gasCalculator } from '../../app/src/lib/gas-calculator.js';

test('the list has the two groups and the five tools in the specified order', () => {
  assert.deepEqual(DESKTOP_TOOLS.map((tool) => `${tool.group}:${tool.id}`), [
    'dive:planner',
    'dive:desaturation',
    'gas:eadMod',
    'gas:bestMix',
    'gas:blender',
  ]);
});

test('live lines: planned dives and flight wait', () => {
  assert.equal(plansLine(null), null);
  assert.deepEqual(plansLine(0), { key: 'tools.plansNone', params: {} });
  assert.deepEqual(plansLine(2), { key: 'tools.plansCount', params: { n: 2 } });
  assert.equal(desaturationLine(null, ''), null);
  assert.deepEqual(desaturationLine({ kind: 'waiting' }, '17 h 05'), { key: 'tools.flightIn', params: { time: '17 h 05' } });
  assert.equal(desaturationLine({ kind: 'allowed' }, '').key, 'tools.flightAllowed');
  assert.equal(desaturationLine({ kind: 'rest' }, '').key, 'tools.atRest');
  assert.equal(desaturationLine({ kind: 'empty' }, '').key, 'tools.noDives');
});

test('remaining desaturation: half-time times log2 of the load over 1 %', () => {
  assert.equal(desaturationSeconds([]), 0);
  assert.equal(desaturationSeconds([{ surfaceGf: 0, halfTimeMin: 635 }]), 0);
  assert.equal(desaturationSeconds([{ surfaceGf: 1, halfTimeMin: 635 }]), 0);
  // 8 % is three halvings over 1 %: 3 half-times.
  assert.equal(desaturationSeconds([{ surfaceGf: 8, halfTimeMin: 100 }]), 300 * 60);
  // The slowest compartment still loaded decides.
  assert.equal(
    desaturationSeconds([
      { surfaceGf: 80, halfTimeMin: 5 },
      { surfaceGf: 2, halfTimeMin: 240 },
      { surfaceGf: 0, halfTimeMin: 635 },
    ]),
    240 * 60,
  );
});

test('« Préparer ce mélange » gives the blender 25/28 as trimix at 148 ft', () => {
  const prefs = { length: 'ft', o2narcotic: true, bestMixEndMm: 30000 };
  const result = gasCalculator(210, 0, 1400, Math.round(148 * 304.8), prefs, Math.round(30 * 1000), 10300);
  // The phone's own result: 25/28 is what the best mix gives at 148 ft with an END of 30 m.
  const target = blenderTarget(result.bestO2, result.bestHe);
  assert.deepEqual(target, { mode: 'trimix', o2: '25', he: '28' });
});

test('« Préparer ce mélange »: a nitrox keeps the nitrox mode and no helium', () => {
  assert.deepEqual(blenderTarget(320, 0), { mode: 'nitrox', o2: '32', he: '0' });
  assert.deepEqual(blenderTarget(215, 0), { mode: 'nitrox', o2: '21,5', he: '0' });
});

test('the final pressure follows the cylinder: 232 bar is 3 365 psi', () => {
  assert.equal(suggestedFinalPressure(232000, 1000), '232');
  assert.equal(suggestedFinalPressure(232000, 68.947572932), '3365');
  assert.equal(suggestedFinalPressure(0, 1000), '');
});

test('the final pressure typed by the diver survives a change of cylinder', () => {
  // Never touched: the new cylinder's value replaces it.
  assert.equal(followCylinder('232', '232', '200'), '200');
  assert.equal(followCylinder('', '', '200'), '200');
  // Typed: kept.
  assert.equal(followCylinder('250', '232', '200'), '250');
});

test('above the working pressure the warning shows and the calculation still runs', () => {
  assert.equal(aboveWorkingPressure(250, '232'), true);
  assert.equal(aboveWorkingPressure(232, '232'), false);
  assert.equal(aboveWorkingPressure(250, ''), false);
  // 250 bar in a 12 L cylinder: still a set of steps.
  const blend = gasBlend(210, 350, 250000, 12000, 50000, 210, 350, 210);
  assert.equal(blend.error, '');
  assert.ok(blend.steps.length >= 2);
});

/** Example of task 199: 50 bar of 21/35 left, 21/35 wanted at 220 bar, air top-up. */
function example(oxygenFirst = false) {
  const blend = gasBlend(210, 350, 220000, 12000, 50000, 210, 350, 210, oxygenFirst);
  return { blend, layers: cylinderLayers(blend, { finalMbar: 220000, residualO2: 0.21, residualHe: 0.35, trimix: true, oxygenFirst }) };
}

test('the cylinder drawing has no grey layer and its layers add up to the final pressure', () => {
  const { layers } = example();
  assert.deepEqual(layers.map((l) => l.gas), ['he', 'o2', 'topup']);
  assert.ok(Math.abs(layers.reduce((s, l) => s + l.mbar, 0) - 220000) < 1);
  // The mock-up's figures: helium 77 bar, oxygen 26 bar, air 117 bar.
  const bar = (/** @type {string} */ gas) => layers.find((l) => l.gas === gas).mbar / 1000;
  assert.ok(Math.abs(bar('he') - 77) < 2, `he ${bar('he')}`);
  assert.ok(Math.abs(bar('o2') - 26) < 2, `o2 ${bar('o2')}`);
  assert.ok(Math.abs(bar('topup') - 117) < 3, `air ${bar('topup')}`);
  assert.deepEqual(layers.map((l) => l.step), [1, 2, 3]);
});

test('oxygen first puts the oxygen layer under the helium', () => {
  assert.deepEqual(example(true).layers.map((l) => l.gas), ['o2', 'he', 'topup']);
});

test('nitrox: oxygen and the top-up gas only, and an empty cylinder has no residual', () => {
  const blend = gasBlend(320, 0, 200000, 12000, 0, 210, 0, 210);
  const layers = cylinderLayers(blend, { finalMbar: 200000, residualO2: 0.21, residualHe: 0, trimix: false, oxygenFirst: false });
  assert.deepEqual(layers.map((l) => l.gas), ['o2', 'topup']);
  assert.ok(Math.abs(layers.reduce((s, l) => s + l.mbar, 0) - 200000) < 1);
});

test('an empty Pression gives the steps of an empty cylinder', () => {
  const blend = gasBlend(210, 350, 220000, 12000, 0, 210, 0, 210);
  assert.equal(blend.startMbar, 0);
  assert.ok(blend.steps.every((s) => s.addedMbar >= 0));
  assert.ok(Math.abs(blend.steps[blend.steps.length - 1].toMbar - 220000) < 1500);
});

import { parseGradientFactors, gasChoiceValue, gasRuns, po2AtDepth } from '../../app/src/lib/desktop-tools.js';

test('the gradient factors field reads « 30 / 75 » and refuses what the planner refuses', () => {
  assert.deepEqual(parseGradientFactors('30 / 75'), { low: 30, high: 75 });
  assert.deepEqual(parseGradientFactors('30/75'), { low: 30, high: 75 });
  assert.equal(parseGradientFactors('5 / 75'), null);
  assert.equal(parseGradientFactors('30 / 20'), null);
  assert.equal(parseGradientFactors('30'), null);
  assert.equal(parseGradientFactors('30 / '), null);
});

test('a gas is a preset of the dropdown or custom', () => {
  assert.equal(gasChoiceValue(210, 350), '210/350');
  assert.equal(gasChoiceValue(500, 0), '500/0');
  assert.equal(gasChoiceValue(231, 0), 'custom');
});

test('the gas band merges consecutive rows of the same gas', () => {
  const gases = [
    { o2Permille: 210, hePermille: 350 },
    { o2Permille: 500, hePermille: 0 },
    { o2Permille: 1000, hePermille: 0 },
  ];
  const bottom = { o2Permille: 210, hePermille: 350 };
  const ean50 = { o2Permille: 500, hePermille: 0 };
  const rows = [
    { startMinutes: 0, endMinutes: 3, breathed: bottom },
    { startMinutes: 3, endMinutes: 28, breathed: bottom },
    { startMinutes: 28, endMinutes: 40, breathed: ean50 },
    { startMinutes: 40, endMinutes: 41, breathed: null },
  ];
  assert.deepEqual(gasRuns(rows, gases), [
    { gas: 0, start: 0, end: 28 },
    { gas: 1, start: 28, end: 40 },
  ]);
});

test('the ppO2 of 25 % at 45 m in sea water is about 1,39 bar', () => {
  assert.equal(po2AtDepth(250, 45000, 10300), 1390);
  assert.equal(po2AtDepth(210, 0, 10300), 213);
});
