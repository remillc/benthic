// The shared map of dive sites (task 2026-11-19-315; docs/architecture.md, section 11.10): the client of the server's
// routes against a fake transport (paths, bodies, error codes, the « Moins de 5 plongées » answers), the list of the
// diver's sites that leaves the device (only the contract's fields, never a note), and the links kept between the
// logbook's sites and the base.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REPORT_REASONS, baseSiteOf, contributionOf, contributionStamp, createSharedSitesApi, diveCountOf, inYourSites, localSiteOf, mergeLinks, redirectLinks,
} from '../../app/src/lib/shared-sites.js';

/** A transport that records the requests and answers from a table. */
function fakeTransport(answers) {
  const calls = [];
  const transport = async (req) => {
    calls.push(req);
    const key = `${req.method} ${req.url.replace('https://api.test', '').split('?')[0]}`;
    const a = answers[key];
    if (!a) return { status: 404, text: JSON.stringify({ error: { code: 'NOT_FOUND' } }) };
    return typeof a === 'function' ? a(req) : a;
  };
  return { calls, transport };
}

const ok = (body) => ({ status: 200, text: JSON.stringify(body) });

test('terms: read, accept, and the version mismatch keeps its code', async () => {
  const { calls, transport } = fakeTransport({
    'GET /v1/sites/terms': ok({ currentVersion: '2026-11-19', accepted: false, acceptedVersion: null, acceptedAt: null }),
    'POST /v1/sites/terms/accept': (req) =>
      req.body.version === '2026-11-19'
        ? ok({ currentVersion: '2026-11-19', accepted: true, acceptedVersion: '2026-11-19', acceptedAt: '2026-11-19T20:00:00Z' })
        : { status: 409, text: JSON.stringify({ error: { code: 'TERMS_VERSION_MISMATCH' } }) },
  });
  const api = createSharedSitesApi({ baseUrl: 'https://api.test', transport });
  const t = await api.terms('tok');
  assert.deepEqual(t, { currentVersion: '2026-11-19', accepted: false, acceptedVersion: null, acceptedAt: null });
  assert.equal(calls[0].headers.Authorization, 'Bearer tok');
  assert.equal((await api.acceptTerms('tok', '2026-11-19')).accepted, true);
  await assert.rejects(api.acceptTerms('tok', '2020-01-01'), (e) => e.code === 'TERMS_VERSION_MISMATCH' && e.status === 409);
});

test('errors: the server code, Retry-After, a 413, and an unreachable server', async () => {
  const { transport } = fakeTransport({
    'PUT /v1/sites/contribution': { status: 429, text: JSON.stringify({ error: { code: 'TOO_MANY_REQUESTS', retryAfterSeconds: 120 } }) },
    'GET /v1/sites/base/9': { status: 404, text: JSON.stringify({ error: { code: 'SITE_GONE' } }) },
    'GET /v1/sites/terms': { status: 413, text: '' },
  });
  const api = createSharedSitesApi({ baseUrl: 'https://api.test', transport });
  await assert.rejects(api.contribute('t', []), (e) => e.code === 'TOO_MANY_REQUESTS' && e.retryAfterSeconds === 120);
  await assert.rejects(api.card('t', '9'), (e) => e.code === 'SITE_GONE');
  await assert.rejects(api.terms('t'), (e) => e.code === 'TOO_LARGE');
  const down = createSharedSitesApi({ baseUrl: 'https://api.test', transport: async () => { throw new Error('offline'); } });
  await assert.rejects(down.terms('t'), (e) => e.code === 'UNREACHABLE' && e.status === 0);
  const none = createSharedSitesApi({ baseUrl: '', transport });
  await assert.rejects(none.terms('t'), (e) => e.code === 'UNREACHABLE');
});

test('reading: box, nearby, card with « Ce que disent les carnets », redirect and few dives', async () => {
  const { calls, transport } = fakeTransport({
    'GET /v1/sites/base': ok({
      mode: 'clusters', total: 214, zoom: 9,
      sites: [{ id: 123, name: 'Poor Knights', lat: -35.46, lon: 174.74, country: 'Nouvelle-Zélande', region: 'Northland', waterType: 'salt', closed: false, dives: 214, fewDives: false }, { id: '7', lat: 'x', lon: 1 }],
      clusters: [{ lat: -35.5, lon: 174.6, count: 12 }, { lat: null, lon: 1, count: 3 }],
    }),
    'GET /v1/sites/base/nearby': ok({ sites: [{ id: '5', name: 'Goat Island', lat: -36.27, lon: 174.8, dives: null, fewDives: true, distanceM: 98000 }] }),
    'GET /v1/sites/base/41': ok({
      id: '123', redirectedFrom: '41', name: 'Poor Knights', lat: -35.46, lon: 174.74, country: 'NZ', region: '', waterType: 'salt', closed: true, dives: 214, fewDives: false,
      carnets: { waterType: 'salt', depthMm: 30000, depthRangeMm: [18000, 30000], divesLast12Months: null, fewDivesLast12Months: true },
    }),
  });
  const api = createSharedSitesApi({ baseUrl: 'https://api.test', transport });
  const box = await api.inBox('t', { bbox: [174.123456789, -36, 175, -35], zoom: 9.4 });
  assert.equal(box.mode, 'clusters');
  assert.equal(box.sites.length, 1, 'a site without a position is dropped');
  assert.equal(box.sites[0].id, '123', 'ids are text');
  assert.equal(box.clusters.length, 1);
  assert.match(calls[0].url, /bbox=174\.12346%2C-36%2C175%2C-35&zoom=9$/);
  const near = await api.nearby('t', { lat: -35.4485, lon: 174.7317, radiusM: 300, q: '  ' });
  assert.deepEqual(diveCountOf(near[0]), { key: 'few' });
  assert.equal(near[0].distanceM, 98000);
  assert.doesNotMatch(calls[1].url, /q=/, 'an empty name filter is not sent');
  const card = await api.card('t', '41');
  assert.equal(card.redirectedFrom, '41');
  assert.equal(card.closed, true);
  assert.deepEqual(card.carnets?.depthRangeMm, [18000, 30000]);
  assert.equal(card.carnets?.fewDivesLast12Months, true);
  assert.deepEqual(diveCountOf(card), { key: 'count', n: 214 });
});

test('link and report send what the contract says', async () => {
  const { calls, transport } = fakeTransport({
    'POST /v1/sites/base/123/link': ok({ baseSiteId: '124', site: { name: 'Poor Knights', lat: -35.46, lon: 174.74, country: 'NZ', region: 'Northland', waterType: 'salt' } }),
    'POST /v1/sites/base/123/report': ok({ ok: true, id: '1' }),
  });
  const api = createSharedSitesApi({ baseUrl: 'https://api.test', transport });
  const l = await api.link('t', '123');
  assert.equal(l.baseSiteId, '124');
  assert.deepEqual(calls[0].body, {});
  await api.report('t', '123', { reason: 'wrong_position', details: '  ' + 'x'.repeat(600), position: { lat: 1, lon: 2 } });
  assert.equal(calls[1].body.reason, 'wrong_position');
  assert.equal(calls[1].body.details.length, 500);
  assert.deepEqual(calls[1].body.position, { lat: 1, lon: 2 });
  await api.report('t', '123', { reason: 'other', details: '' });
  assert.deepEqual(calls[2].body, { reason: 'other' });
  assert.deepEqual([...REPORT_REASONS], ['wrong_position', 'duplicate', 'wrong_name_or_country', 'closed_or_forbidden', 'other']);
});

const NOW = Date.UTC(2026, 10, 19, 12);
const site = (o) => ({
  uuid: 11, name: 'Poor Knights', hasLocation: true, latUdeg: -35460000, lonUdeg: 174740000, country: '', dives: 3, lastDate: '', maxDepthMm: 0,
  description: 'private description', notes: 'private notes', countryTaxonomy: { value: 'Nouvelle-Zélande', manual: false }, region: { value: 'Northland', manual: false },
  city: { value: 'Tutukaka', manual: false },
  diveList: [
    { id: 1, number: 1, date: '2026-10-01 10:00:00', durationSeconds: 3000, maxDepthMm: 18000 },
    { id: 2, number: 2, date: '2025-01-01 10:00:00', durationSeconds: 3000, maxDepthMm: 30000 },
    { id: 3, number: 3, date: '2026-11-18 10:00:00', durationSeconds: 3000, maxDepthMm: 24000 },
  ],
  ...o,
});

test('contribution: only the contract fields, never notes, description, city or dates', () => {
  const [s] = contributionOf([site({})], { 11: '123' }, NOW);
  assert.deepEqual(s, { id: '11', name: 'Poor Knights', lat: -35.46, lon: 174.74, diveCount: 3, country: 'Nouvelle-Zélande', region: 'Northland', depthMm: 24000, recentDives: 2, baseSiteId: '123' });
  const sent = JSON.stringify(s);
  for (const secret of ['private', 'Tutukaka', '2026-10-01', '2025']) assert.ok(!sent.includes(secret), secret);
});

test('contribution: sites without a name, a position, 0/0 or a dive are left out', () => {
  const out = contributionOf(
    [
      site({ uuid: 1, name: '  ' }),
      site({ uuid: 2, hasLocation: false }),
      site({ uuid: 3, latUdeg: 0, lonUdeg: 0 }),
      site({ uuid: 4, diveList: [], dives: 0 }),
      site({ uuid: 5, waterType: 'fresh', countryTaxonomy: { value: '', manual: false }, country: 'Finlande', region: { value: '', manual: false } }),
    ],
    {},
    NOW,
  );
  assert.deepEqual(out.map((s) => s.id), ['5']);
  assert.equal(out[0].country, 'Finlande');
  assert.equal(out[0].waterType, 'fresh');
  assert.equal(out[0].region, undefined);
  assert.equal(out[0].baseSiteId, undefined);
});

test('the fingerprint changes with the list, not with its order', () => {
  const a = contributionOf([site({ uuid: 1 }), site({ uuid: 2 })], {}, NOW);
  assert.equal(contributionStamp(a), contributionStamp([a[1], a[0]]));
  assert.notEqual(contributionStamp(a), contributionStamp(contributionOf([site({ uuid: 1 }), site({ uuid: 2, name: 'Other' })], {}, NOW)));
});

test('links: merge after a send, follow a merged site, find a site', () => {
  const before = { 1: '10', 2: '20', 9: '90' };
  const after = mergeLinks(before, { 1: '11', 3: '30' }, new Set(['1', '2', '3']));
  assert.deepEqual(after, { 1: '11', 2: '20', 3: '30' }, 'the server wins, a removed site loses its link, a skipped one keeps it');
  assert.deepEqual(redirectLinks(after, '20', '11'), { 1: '11', 2: '11', 3: '30' });
  assert.ok(inYourSites('30', after));
  assert.ok(!inYourSites('99', after));
  assert.equal(localSiteOf('30', after), 3);
  assert.equal(localSiteOf('99', after), null);
});

test('baseSiteOf rejects what is not a site', () => {
  assert.equal(baseSiteOf(null), null);
  assert.equal(baseSiteOf({ id: '1', lat: 1 }), null);
  const s = baseSiteOf({ id: 1, lat: 1, lon: 2, dives: 7, waterType: 'lava' });
  assert.equal(s?.waterType, '');
  assert.equal(s?.fewDives, false);
});
