// The heat as a density (task 2026-11-14-154): weighted kernels on a grid, then the ramp.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { densityGrid, rampColour, rgb } from '../../app/src/lib/heat-density.js';

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

test('the ramp: transparent below 2 %, the edge colour fading in, the centre colour at the densest', () => {
  const ramp = /** @type {any} */ ([rgb('#FBE3B2'), rgb('#F0A66B'), rgb('#B4530F')]);
  assert.deepEqual(rampColour(0, ramp), [0, 0, 0, 0]);
  assert.deepEqual(rampColour(1, ramp).slice(0, 3), [0xb4, 0x53, 0x0f]);
  assert.deepEqual(rampColour(0.5, ramp).slice(0, 3), [0xf0, 0xa6, 0x6b]);
  assert.ok(rampColour(0.1, ramp)[3] < rampColour(0.9, ramp)[3]);
  assert.ok(rampColour(1, ramp)[3] < 255, 'never fully covers the map');
});
