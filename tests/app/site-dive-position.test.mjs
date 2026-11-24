// « Utiliser cette position » (task 2026-11-24-395): the position recorded with a dive of a site without coordinates.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { positionOfSiteDives, recordedPosition } from '../../app/src/lib/site-dive-position.js';

test('the latest dive with a recorded position gives it; none gives null', () => {
  const detail = { diveList: [
    { date: '2025-07-01T10:00', recordedLatUdeg: 48100000, recordedLonUdeg: -69200000 },
    { date: '2026-08-02T09:30', recordedLatUdeg: 48110000, recordedLonUdeg: -69210000 },
    { date: '2026-09-01T09:30' },
  ] };
  assert.deepEqual(recordedPosition(detail), { latUdeg: 48110000, lonUdeg: -69210000 });
  assert.equal(recordedPosition({ diveList: [{ date: '2026-01-01T00:00' }] }), null);
  assert.equal(recordedPosition({ diveList: [{ date: '2026-01-01T00:00', recordedLatUdeg: 0, recordedLonUdeg: 0 }] }), null);
  assert.equal(recordedPosition({}), null);
});

test('the site detail is asked for that site; a failure is « no position »', async () => {
  /** @type {any[]} */
  const asked = [];
  const found = await positionOfSiteDives({ uuid: 7 }, async (o) => (asked.push(o), { diveList: [{ date: '2026-01-01T00:00', recordedLatUdeg: 1, recordedLonUdeg: 2 }] }));
  assert.deepEqual(asked, [{ kind: 'site', uuid: 7 }]);
  assert.deepEqual(found, { latUdeg: 1, lonUdeg: 2 });
  assert.equal(await positionOfSiteDives({ uuid: 7 }, async () => { throw new Error('closed'); }), null);
});

test('the façade gives the recorded position only for a site without coordinates', () => {
  const cpp = readFileSync(new URL('../../core/libbenthic/edit.cpp', import.meta.url), 'utf8');
  const fn = cpp.slice(cpp.indexOf('int site_json('), cpp.indexOf('int site_nearby('));
  assert.match(fn, /const bool site_unplaced = !has_location\(&ds->location\);/);
  assert.match(fn, /if \(site_unplaced\) \{\s*location_t gps = d->get_gps_location\(\);/);
});
