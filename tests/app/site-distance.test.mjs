// Sites by distance, and the distance as « Choisir un site » writes it (task 2026-11-14-151).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { distanceParts, sitesInChoiceOrder } from '../../app/src/lib/site-distance.js';

test('imperial: feet, then miles (one decimal under 10)', () => {
  assert.deepEqual(distanceParts(120, 'ft'), { value: 394, decimals: 0, unit: 'ft' });
  assert.deepEqual(distanceParts(1770, 'ft'), { value: 1.1, decimals: 1, unit: 'mi' });
  assert.deepEqual(distanceParts(98170, 'ft'), { value: 61, decimals: 0, unit: 'mi' });
  assert.deepEqual(distanceParts(17_541_850, 'ft'), { value: 10900, decimals: 0, unit: 'mi' });
  assert.equal(distanceParts(304, 'ft').unit, 'ft', '997 ft stays in feet');
  assert.equal(distanceParts(305, 'ft').unit, 'mi', '1 001 ft is in miles');
});

test('metric: metres, then kilometres (one decimal under 10)', () => {
  assert.deepEqual(distanceParts(210, 'm'), { value: 210, decimals: 0, unit: 'm' });
  assert.deepEqual(distanceParts(1770, 'm'), { value: 1.8, decimals: 1, unit: 'km' });
  assert.deepEqual(distanceParts(98170, 'm'), { value: 98, decimals: 0, unit: 'km' });
});

const here = { latUdeg: -35_000_000, lonUdeg: 174_000_000 };
const sites = [
  { name: 'Far', hasLocation: true, latUdeg: -36_000_000, lonUdeg: 174_000_000, lastDate: '2020-01-01' },
  { name: 'Near', hasLocation: true, latUdeg: -35_001_000, lonUdeg: 174_000_000, lastDate: '2019-01-01' },
  { name: 'Nowhere', hasLocation: false, latUdeg: 0, lonUdeg: 0, lastDate: '2024-05-01' },
  { name: 'Never', hasLocation: false, latUdeg: 0, lonUdeg: 0, lastDate: '' },
];

test('with a position: nearest first, sites without coordinates last', () => {
  const rows = sitesInChoiceOrder(sites, here);
  assert.deepEqual(rows.map((r) => r.site.name), ['Near', 'Far', 'Nowhere', 'Never']);
  assert.ok(Math.abs(/** @type {number} */ (rows[0].metres) - 111) < 1);
  assert.equal(rows[2].metres, null);
});

test('without a position: the most recently dived first', () => {
  assert.deepEqual(sitesInChoiceOrder(sites, null).map((r) => r.site.name), ['Nowhere', 'Far', 'Near', 'Never']);
});
