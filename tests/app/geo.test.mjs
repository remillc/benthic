// Boxes, longitudes and distances (app/src/lib/geo.js).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inBbox, distanceKm, normalizeLongitude, normalizeBbox } from '../../app/src/lib/geo.js';

test('inBbox: inside, outside, across the antimeridian', () => {
  assert.equal(inBbox(5, 5, [0, 0, 10, 10]), true);
  assert.equal(inBbox(11, 5, [0, 0, 10, 10]), false);
  assert.equal(inBbox(175, 0, [170, -10, -170, 10]), true);
  assert.equal(inBbox(-175, 0, [170, -10, -170, 10]), true);
  assert.equal(inBbox(0, 0, [170, -10, -170, 10]), false);
});

test('normalizeLongitude and normalizeBbox bring longitudes into -180..180', () => {
  assert.equal(normalizeLongitude(190), -170);
  assert.equal(normalizeLongitude(-190), 170);
  assert.deepEqual(normalizeBbox([190, 0, 200, 10]), [-170, 0, -160, 10]);
  assert.deepEqual(normalizeBbox([-200, 0, 200, 10]), [-180, 0, 180, 10]);
  assert.deepEqual(normalizeBbox([0, 0, 180, 10]), [0, 0, 180, 10]);
});

test('distanceKm: one degree of latitude is about 111 km', () => {
  assert.ok(Math.abs(distanceKm(0, 0, 0, 1) - 111.19) < 0.1);
  assert.equal(distanceKm(3, 4, 3, 4), 0);
});
