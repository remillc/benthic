// « Nettoyer les sites », the status page (task 2026-11-24-395): which problems are listed, and how many points.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CLEANUP_PROBLEMS, cleanupPointCount, cleanupProblems, unplacedSites, unusedSites } from '../../app/src/lib/site-cleanup.js';

test('the status page lists only the problems that exist, in a fixed order, with their counts', () => {
  const rows = cleanupProblems({ duplicates: 2, unused: 0, without: 6, unplaced: 3 });
  assert.deepEqual(
    rows.map((r) => [r.kind, r.count, r.route]),
    [
      ['duplicates', 2, '/sites/cleanup/duplicates/'],
      ['without', 6, '/sites/without/'],
      ['unplaced', 3, '/sites/unplaced/'],
    ],
  );
});

test('« n points à régler » counts the problems, not the items', () => {
  assert.equal(cleanupPointCount({ duplicates: 2, unused: 3, without: 6, unplaced: 1 }), 4);
  assert.equal(cleanupPointCount({ duplicates: 40, unused: 0, without: 0, unplaced: 0 }), 1);
  assert.equal(cleanupPointCount({ duplicates: 0, unused: 0, without: 0, unplaced: 0 }), 0, 'hidden at 0');
});

test('each problem has a screen of its own, a round icon and the keys of its row', () => {
  assert.equal(CLEANUP_PROBLEMS.length, 4);
  for (const p of CLEANUP_PROBLEMS) {
    assert.match(p.route, /^\/sites\/.*\/$/, 'a collection ends with a slash');
    assert.ok(p.icon && p.title && p.hint);
  }
  assert.equal(new Set(CLEANUP_PROBLEMS.map((p) => p.route)).size, 4);
});

test('sites without coordinates are those used by dives and not placed, the latest dive first', () => {
  const sites = [
    { uuid: 1, dives: 2, hasLocation: false, lastDate: '2025-11-12' },
    { uuid: 2, dives: 0, hasLocation: false, lastDate: '' },
    { uuid: 3, dives: 4, hasLocation: false, lastDate: '2019-08-02' },
    { uuid: 4, dives: 1, hasLocation: true, lastDate: '2024-01-01' },
  ];
  assert.deepEqual(unplacedSites(sites).map((s) => s.uuid), [1, 3]);
  assert.deepEqual(unusedSites(sites).map((s) => s.uuid), [2], 'a site without a dive is unused, placed or not');
});
