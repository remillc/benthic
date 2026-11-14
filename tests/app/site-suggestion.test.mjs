// The site suggested for a dive without a site, by the position recorded with it (task 2026-11-14-148).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SITE_SUGGESTION_LIMIT_M, distanceInDepthUnit, nearestSite, suggestByDistance } from '../../app/src/lib/site-suggestion.js';

// One micro-degree of latitude is about 0.111 m: 1 800 µdeg is about 200 m.
const dive = { latUdeg: -43_300_000, lonUdeg: 171_500_000 };
const sites = [
  { uuid: 1, name: 'Far', hasLocation: true, latUdeg: -43_400_000, lonUdeg: 171_500_000 },
  { uuid: 2, name: 'Near', hasLocation: true, latUdeg: -43_301_800, lonUdeg: 171_500_000 },
  { uuid: 3, name: 'No GPS', hasLocation: false, latUdeg: 0, lonUdeg: 0 },
];

test('the limit is 500 m', () => {
  assert.equal(SITE_SUGGESTION_LIMIT_M, 500);
});

test('the nearest site with coordinates, and its distance', () => {
  const near = nearestSite(dive, sites);
  assert.equal(near?.site.uuid, 2);
  assert.ok(Math.abs((near?.distanceM ?? 0) - 200) < 1, String(near?.distanceM));
  assert.equal(nearestSite(dive, [sites[2]]), null, 'a site without coordinates is never the nearest');
});

test('suggested within the limit only', () => {
  assert.equal(suggestByDistance(dive, sites)?.site.uuid, 2);
  assert.equal(suggestByDistance(dive, [sites[0]]), null, 'about 11 km away: no suggestion');
  assert.equal(suggestByDistance(dive, sites, 100), null, 'with a smaller limit, 200 m is too far');
});

test('the distance in the depth unit, whole', () => {
  assert.equal(distanceInDepthUnit(210, 'm'), 210);
  assert.equal(distanceInDepthUnit(210, 'ft'), 689);
  assert.equal(distanceInDepthUnit(500, 'ft'), 1640);
});
