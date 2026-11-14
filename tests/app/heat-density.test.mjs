// The heat as a density (task 2026-11-14-154): weighted kernels on a grid, then the ramp.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHeatScale, densityGrid, haloRadius, heatShare, rampColour, rgb } from '../../app/src/lib/heat-density.js';

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

test('halo radius in dp: 20 far away, 40 from zoom 13, interpolated (task 2026-11-14-155)', () => {
  assert.equal(haloRadius(2), 20);
  assert.equal(haloRadius(5), 20);
  assert.equal(haloRadius(9), 30);
  assert.equal(haloRadius(13), 40);
  assert.equal(haloRadius(17), 40);
});

// The colour scale (task 2026-11-14-162): t = √(d / D), the ramp on t, the scale fixed while exploring.
const RAMP = /** @type {any} */ (['#1E5BD8', '#3FB5D9', '#5CC06A', '#F2D43A', '#F07C1E', '#D7191C'].map(rgb));
const FADE = /** @type {any} */ (rgb('#6FC3F0'));
const colourOf = (/** @type {number} */ d, /** @type {number} */ D) => rampColour(heatShare(d, D), RAMP, FADE);

test('t = √(d / D), clamped to 1', () => {
  assert.equal(heatShare(100, 100), 1);
  assert.equal(heatShare(25, 100), 0.5);
  assert.equal(heatShare(400, 100), 1);
  assert.equal(heatShare(0, 100), 0);
});

test('d = D is red; d = D/4 is the colour at t = 0.5, between green and yellow; under 0.0025·D nothing', () => {
  assert.deepEqual(colourOf(144, 144).slice(0, 3), rgb('#D7191C'));
  const half = colourOf(36, 144);
  const green = rgb('#5CC06A'), yellow = rgb('#F2D43A');
  const f = (0.5 - 0.48) / (0.66 - 0.48);
  assert.deepEqual(half.slice(0, 3), green.map((x, i) => Math.round(x + (yellow[i] - x) * f)));
  assert.equal(half[3], Math.round(255 * 0.85));
  assert.deepEqual(colourOf(0.0024 * 144, 144), [0, 0, 0, 0]);
});

test('the stops and the alpha sit where the table says', () => {
  for (const [t, hex] of [[0.12, '#1E5BD8'], [0.3, '#3FB5D9'], [0.48, '#5CC06A'], [0.66, '#F2D43A'], [0.83, '#F07C1E'], [1, '#D7191C']]) {
    assert.deepEqual(rampColour(/** @type {number} */ (t), RAMP, FADE).slice(0, 3), rgb(/** @type {string} */ (hex)), String(t));
  }
  assert.deepEqual(rampColour(0.05, RAMP, FADE), [...rgb('#6FC3F0'), 0], 'the fade-in starts transparent');
  assert.equal(rampColour(0.3, RAMP, FADE)[3], Math.round(255 * 0.6));
  assert.equal(rampColour(0.6, RAMP, FADE)[3], Math.round(255 * 0.85));
});

test('the scale: unchanged after a zoom, measured again after a filter change', () => {
  const scale = createHeatScale();
  assert.equal(scale.measure(144), 144, 'measured at the opening framing');
  assert.equal(scale.measure(12), 144, 'zoomed in: the densest value in view is lower, the scale stays');
  scale.reset();
  assert.equal(scale.measure(30), 30, 'another filter: measured again');
});
