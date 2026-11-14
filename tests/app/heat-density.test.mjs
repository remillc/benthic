// The heat as a density (task 2026-11-14-154): weighted kernels on a grid, then the ramp.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { densityGrid, haloRadius, heatShare, rampColour, rgb } from '../../app/src/lib/heat-density.js';

test('a single site: densest at its centre, nothing beyond its radius', () => {
  const g = densityGrid([{ x: 50, y: 50, weight: 10 }], 100, 100, 20, 2);
  const at = (/** @type {number} */ x, /** @type {number} */ y) => g.values[Math.floor(y / 2) * g.cols + Math.floor(x / 2)];
  assert.ok(at(50, 50) > at(60, 50), 'falls off from the centre');
  assert.equal(at(80, 50), 0, '30 px away: outside the 20 px radius');
  assert.ok(Math.abs(g.max - at(50, 50)) / g.max < 0.05);
});

test('the busier site is the denser one; two close sites add up without one hiding the other', () => {
  const g = densityGrid([{ x: 20, y: 50, weight: 140 }, { x: 80, y: 50, weight: 5 }], 100, 100, 20, 2);
  const at = (/** @type {number} */ x, /** @type {number} */ y) => g.values[Math.floor(y / 2) * g.cols + Math.floor(x / 2)];
  assert.ok(at(20, 50) > 20 * at(80, 50));
  assert.ok(at(80, 50) > 0, 'the small site still shows');
  const pair = densityGrid([{ x: 45, y: 50, weight: 1 }, { x: 55, y: 50, weight: 1 }], 100, 100, 20, 2);
  assert.ok(pair.values[25 * pair.cols + 25] > densityGrid([{ x: 45, y: 50, weight: 1 }], 100, 100, 20, 2).values[25 * pair.cols + 25]);
});

test('the ramp (task 2026-11-14-161): transparent below 2 %, light blue fading in, blue to red, red at the densest', () => {
  const ramp = /** @type {any} */ (['#1E5BD8', '#3FB5D9', '#5CC06A', '#F2D43A', '#F07C1E', '#D7191C'].map(rgb));
  const fade = /** @type {any} */ (rgb('#6FC3F0'));
  assert.deepEqual(rampColour(0, ramp, fade), [0, 0, 0, 0]);
  assert.deepEqual(rampColour(0.02, ramp, fade).slice(0, 3), rgb('#6FC3F0').map((x, i) => Math.round(x + (rgb('#1E5BD8')[i] - x) * (0.02 / 0.12))), 'the lowest density is light blue');
  assert.deepEqual(rampColour(0.12, ramp, fade).slice(0, 3), rgb('#1E5BD8'), 'then the least colour, blue');
  assert.deepEqual(rampColour(1, ramp, fade).slice(0, 3), rgb('#D7191C'), 'red only at the densest');
  assert.deepEqual(rampColour(0.12 + 0.88 * 3 / 5, ramp, fade).slice(0, 3), rgb('#F2D43A'), 'yellow in between');
  assert.ok(rampColour(0.1, ramp, fade)[3] < rampColour(0.9, ramp, fade)[3]);
  assert.ok(rampColour(1, ramp, fade)[3] < 255, 'never fully covers the map');
});

test('halo radius in dp: 20 far away, 40 from zoom 13, interpolated (task 2026-11-14-155)', () => {
  assert.equal(haloRadius(2), 20);
  assert.equal(haloRadius(5), 20);
  assert.equal(haloRadius(9), 30);
  assert.equal(haloRadius(13), 40);
  assert.equal(haloRadius(17), 40);
});

test('a logarithmic scale, as the mock-ups: one dive blue, the busiest red, the middle green to yellow', () => {
  const ramp = /** @type {any} */ (['#1E5BD8', '#3FB5D9', '#5CC06A', '#F2D43A', '#F07C1E', '#D7191C'].map(rgb));
  const one = heatShare(1, 144);
  assert.ok(one >= 0.12 && one < 0.2, `one dive at ${one}: blue`);
  assert.equal(heatShare(144, 144), 1);
  const twenty = heatShare(20, 144);
  assert.ok(twenty > 0.55 && twenty < 0.7, `20 dives at ${twenty}: green to yellow`);
  assert.equal(heatShare(0, 144), 0);
  assert.ok(rampColour(one, ramp)[3] > 0.7 * 255, 'a lone site with one dive reads clearly');
});
