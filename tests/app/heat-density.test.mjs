// « Où je plonge le plus »: the halos' zoom, the colour scale, and the spots as the mock-up
// draws them (android-stats.dc.html, whose card uses Christian's real sites: its numbers are
// read back here).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHeatScale, haloRadius, SPOT_GRADIENTS, spotKind, spotRadius } from '../../app/src/lib/heat-density.js';

test('halo scale with the zoom: 20 far away, 40 from zoom 13, interpolated (task 2026-11-14-155)', () => {
  assert.equal(haloRadius(2), 20);
  assert.equal(haloRadius(9), 30);
  assert.equal(haloRadius(13), 40);
  assert.equal(haloRadius(17), 40);
});

test('the scale: unchanged after a zoom, measured again after a filter change (task 162)', () => {
  const scale = createHeatScale();
  assert.equal(scale.measure(144), 144);
  assert.equal(scale.measure(12), 144, 'zoomed in: the scale stays');
  scale.reset();
  assert.equal(scale.measure(30), 30, 'another filter: measured again');
});

test('the radii of the mock-up at the card zoom: 8 px for one dive, 24.5 for Lock 23, 27.5 for Lock 21', () => {
  const near = (/** @type {number} */ a, /** @type {number} */ b) => Math.abs(a - b) < 0.3;
  assert.ok(near(spotRadius(1, 144, 5), 8));
  assert.ok(near(spotRadius(103, 144, 5), 24.5), String(spotRadius(103, 144, 5)));
  assert.ok(near(spotRadius(144, 144, 5), 27.5));
  assert.ok(near(spotRadius(13, 144, 5), 13.6), String(spotRadius(13, 144, 5)));
  assert.ok(near(spotRadius(144, 144, 13), 55), 'twice as large from zoom 13');
});

test('the gradient of a site: one dive blue, a few yellow, from about 5 % of the busiest red', () => {
  assert.equal(spotKind(1, 144), 'one');
  assert.equal(spotKind(2, 144), 'few');
  assert.equal(spotKind(7, 144), 'few');
  assert.equal(spotKind(8, 144), 'many');
  assert.equal(spotKind(144, 144), 'many');
  assert.equal(SPOT_GRADIENTS.many[0].colour, '--bc-heat-6', 'red at the centre');
  assert.equal(SPOT_GRADIENTS.few[0].colour, '--bc-heat-4', 'yellow at the centre');
  assert.equal(SPOT_GRADIENTS.one[0].colour, '--bc-heat-1', 'blue at the centre');
  for (const g of Object.values(SPOT_GRADIENTS)) assert.equal(g[g.length - 1].alpha, 0, 'transparent at the edge');
});
