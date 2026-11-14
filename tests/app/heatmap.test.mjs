// « Où je plonge le plus »: dives per site, the busiest area (task 2026-11-14-152).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { busiestArea, siteHeat } from '../../app/src/lib/heatmap.js';

const sites = [
  { name: 'Lock 21', hasLocation: true, latUdeg: 44_990_000, lonUdeg: -74_950_000, dives: 144 },
  { name: 'Lock 23', hasLocation: true, latUdeg: 44_950_000, lonUdeg: -75_050_000, dives: 103 },
  { name: 'Cozumel', hasLocation: true, latUdeg: 20_420_000, lonUdeg: -86_920_000, dives: 30 },
  { name: 'Lock 21', hasLocation: true, latUdeg: 10_000_000, lonUdeg: 10_000_000, dives: 1 },
  { name: 'Nowhere', hasLocation: false, latUdeg: 0, lonUdeg: 0, dives: 5 },
];
const dives = [
  ...Array(5).fill({ site: 'Lock 21' }),
  ...Array(3).fill({ site: 'Lock 23' }),
  ...Array(4).fill({ site: 'Cozumel' }),
  { site: 'Nowhere' },
  { site: '' },
];

test('dives counted per site with coordinates, the busiest first; a shared name goes to its busiest site', () => {
  const heat = siteHeat(dives, sites);
  assert.deepEqual(heat.map((h) => [h.name, h.count]), [['Lock 21', 5], ['Cozumel', 4], ['Lock 23', 3]]);
  assert.equal(heat[0].lat, 44.99, 'Lock 21 at the St. Lawrence, not the one-dive namesake');
});

test('the busiest area: the St. Lawrence (8 dives), not the trip to Cozumel (4)', () => {
  const area = busiestArea(siteHeat(dives, sites));
  assert.deepEqual(area.map((s) => s.name).sort(), ['Lock 21', 'Lock 23']);
});
