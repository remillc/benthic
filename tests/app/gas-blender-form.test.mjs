// SPDX-License-Identifier: GPL-2.0
// The form of the Gas blender and "Prepare this mix" (tasks 2026-11-15-197 and 198, phone and
// tablet): the final pressure from the cylinder, a typed value kept, the working pressure
// warning with the steps still computed, and Best mix handing 25/28 at 148 ft to the blender.
import test from 'node:test';
import assert from 'node:assert/strict';
import { followCylinder, aboveWorkingPressure } from '../../app/src/lib/gas-blender-form.js';
import { requestBlend, takeBlend } from '../../app/src/lib/gas-handoff.js';
import { gasCalculator } from '../../app/src/lib/gas-calculator.js';
import { gasBlend } from '../../app/src/lib/gas-blend.js';

const PSI = 68.947572932;
const D12 = 232000; // 12 L, 232 bar

test('the final pressure starts at the working pressure of the cylinder (232 bar, 3 365 psi)', () => {
  const bar = followCylinder({ current: '', lastAuto: '', workingMbar: D12, mbarPerUnit: 1000, fallback: '200' });
  assert.equal(bar.value, '232');
  const psi = followCylinder({ current: '', lastAuto: '', workingMbar: D12, mbarPerUnit: PSI, fallback: '3000' });
  assert.equal(psi.value, '3365');
});

test('choosing another cylinder replaces a value the cylinder put there', () => {
  const first = followCylinder({ current: '', lastAuto: '', workingMbar: D12, mbarPerUnit: 1000, fallback: '200' });
  const second = followCylinder({ current: first.value, lastAuto: first.auto, workingMbar: 182000, mbarPerUnit: 1000, fallback: '200' });
  assert.equal(second.value, '182');
});

test('choosing another cylinder keeps a value the diver typed', () => {
  const first = followCylinder({ current: '', lastAuto: '', workingMbar: D12, mbarPerUnit: 1000, fallback: '200' });
  const second = followCylinder({ current: '250', lastAuto: first.auto, workingMbar: 182000, mbarPerUnit: 1000, fallback: '200' });
  assert.equal(second.value, '250');
  assert.equal(second.auto, '182');
});

test('a cylinder without a working pressure gives the fallback', () => {
  assert.equal(followCylinder({ current: '', lastAuto: '', workingMbar: 0, mbarPerUnit: 1000, fallback: '200' }).value, '200');
});

test('250 bar in a 232 bar cylinder is above the working pressure and still gives the steps', () => {
  assert.equal(aboveWorkingPressure(250000, D12), true);
  assert.equal(aboveWorkingPressure(232000, D12), false);
  assert.equal(aboveWorkingPressure(250000, 0), false);
  const blend = gasBlend(320, 0, 250000, 12000, 0, 210, 0, 210);
  assert.ok(!blend.error);
  assert.equal(blend.steps.at(-1).toMbar, 250000);
});

test('Best mix at 148 ft, Trimix: 25/28, handed to the blender once', () => {
  const FT = 304.8;
  const result = gasCalculator(210, 0, 1400, Math.round(148 * FT), { o2narcotic: true, bestMixEndMm: 30000 }, Math.round(98 * FT), 10300);
  assert.equal(Math.round(result.bestO2 / 10), 25);
  assert.equal(Math.round(result.bestHe / 10), 28);
  requestBlend('trimix', Math.round(result.bestO2 / 10) * 10, Math.round(result.bestHe / 10) * 10);
  assert.deepEqual(takeBlend(), { mode: 'trimix', o2: 250, he: 280 });
  assert.equal(takeBlend(), null);
});
