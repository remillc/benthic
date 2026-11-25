// The shared map grouped on the device (app/src/lib/shared-clusters.js) and its whole-map read (lib/shared-sites.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { groupsIn, indexSites, LAST_GROUPED_ZOOM, openingZoom, sitesInView, widenedBox } from '../../app/src/lib/shared-clusters.js';
import { compactSiteOf, createSharedSitesApi } from '../../app/src/lib/shared-sites.js';

/** Bonaire's west coast: ten sites a few hundred metres apart, and two far away (Curaçao, Poor Knights). */
const bonaire = Array.from({ length: 10 }, (_, i) => ({ id: `b${i}`, lat: 12.15 + i * 0.004, lon: -68.28 - i * 0.001 }));
const sites = [...bonaire, { id: 'cur', lat: 12.12, lon: -68.97 }, { id: 'pk', lat: -35.47, lon: 174.73 }];
const world = /** @type {[number, number, number, number]} */ ([-180, -85, 180, 85]);
const near = /** @type {[number, number, number, number]} */ ([-68.4, 12.1, -68.2, 12.25]);

test('zoomed out (6.7), the close sites make one group placed among them; the far ones stay alone', () => {
  const g = groupsIn(indexSites(sites), world, 6.7);
  assert.equal(g.clusters.length, 1);
  assert.equal(g.clusters[0].count, 10);
  const c = g.clusters[0];
  assert.ok(c.lat > 12.15 && c.lat < 12.19 && c.lon < -68.28 && c.lon > -68.29, 'the group sits among its sites');
  assert.deepEqual(g.sites.map((s) => s.id).sort(), ['cur', 'pk']);
});

test('groups are made again for each whole zoom level: closer in, the group splits, and from zoom 13 every site is alone', () => {
  const index = indexSites(sites);
  const counts = [8, 11, 12, 13].map((z) => groupsIn(index, near, z + 0.5));
  const shown = (g) => g.sites.length + g.clusters.reduce((n, c) => n + c.count, 0);
  for (const g of counts) assert.equal(shown(g), 10, 'every Bonaire site is in the view, alone or in a group');
  assert.ok(counts[0].clusters.length >= 1 && counts[0].sites.length < 10);
  assert.ok(counts[1].sites.length + counts[1].clusters.length > counts[0].sites.length + counts[0].clusters.length, 'closer in, more marks');
  assert.equal(counts[3].clusters.length, 0);
  assert.equal(counts[3].sites.length, 10);
  assert.equal(LAST_GROUPED_ZOOM, 12);
});

test('a tap on a group zooms to where it opens, never past the last grouped level + 1', () => {
  const index = indexSites(sites);
  const [c] = groupsIn(index, world, 6).clusters;
  assert.equal(c.count, 10);
  const z = openingZoom(index, c.id);
  assert.ok(z > 6 && z <= LAST_GROUPED_ZOOM + 1);
  const after = groupsIn(index, near, z);
  assert.ok(after.sites.length + after.clusters.length > 1, 'it opened');
});

test('the view is widened for panning, and across the antimeridian the box wraps', () => {
  assert.deepEqual(widenedBox([0, 0, 40, 20]), [-10, -5, 50, 25]);
  const across = widenedBox([170, -40, 190, -30]);
  assert.ok(across[0] > across[2], 'west > east: the box crosses the antimeridian');
  assert.deepEqual(widenedBox([-200, -80, 200, 80]), [-180, -90, 180, 90]);
  const g = groupsIn(indexSites(sites), [170, -40, 190, -30], 9);
  assert.deepEqual(g.sites.map((s) => s.id), ['pk']);
});

test('the list takes the sites in the view, across the antimeridian too', () => {
  assert.equal(sitesInView(sites, near).length, 10);
  assert.deepEqual(sitesInView(sites, [170, -40, -170, -30]).map((s) => s.id), ['pk']);
  assert.deepEqual(sitesInView(sites, [170, -40, 190, -30]).map((s) => s.id), ['pk']);
  assert.equal(sitesInView(sites, [-180, -90, 180, 90]).length, 12);
});

test('whole map: compact rows become base sites; a bad row is dropped', () => {
  assert.deepEqual(compactSiteOf(['7', 12.1, -68.2, 'Salt Pier', 'BQ', 31, 0]), {
    id: '7', name: 'Salt Pier', lat: 12.1, lon: -68.2, country: 'BQ', region: '', waterType: '', closed: false, dives: 31, fewDives: false,
  });
  const few = compactSiteOf(['8', 1, 2, 'X', '', null, 1]);
  assert.equal(few?.fewDives, true);
  assert.equal(few?.closed, true);
  assert.equal(compactSiteOf(['9', 'a', 2, 'X']), null);
  assert.equal(compactSiteOf({ id: '9' }), null);
});

test('whole map: the version is sent back, and « unchanged » gives no rows', async () => {
  /** @type {string[]} */
  const urls = [];
  const transport = async (/** @type {any} */ req) => {
    urls.push(req.url);
    const since = new URL(req.url).searchParams.get('since');
    const body = since === 'v1' ? { version: 'v1', unchanged: true } : { version: 'v1', unchanged: false, sites: [['1', 1, 2, 'A', 'NZ', null, 0], ['bad']] };
    return { status: 200, text: JSON.stringify(body) };
  };
  const api = createSharedSitesApi({ baseUrl: 'https://api.test', transport });
  const first = await api.wholeMap('tok');
  assert.equal(first.version, 'v1');
  assert.deepEqual(first.sites?.map((s) => s.id), ['1']);
  const again = await api.wholeMap('tok', 'v1');
  assert.equal(again.sites, null);
  assert.deepEqual(urls, ['https://api.test/v1/sites/base/all', 'https://api.test/v1/sites/base/all?since=v1']);
  const broken = createSharedSitesApi({ baseUrl: 'https://api.test', transport: async () => ({ status: 200, text: '{}' }) });
  await assert.rejects(broken.wholeMap('tok'), (e) => /** @type {any} */ (e).code === 'UNREACHABLE');
});
