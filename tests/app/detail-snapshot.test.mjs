// The detail snapshot (lib/detail-snapshot.js): the first dive of the list kept for the next start, and the
// start gate (lib/startup.svelte.js): what waits for the first screen.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const snap = await import('../../app/src/lib/detail-snapshot.js');
const KEY = 'bc.detailSnapshotBeta';
const src = (p) => readFileSync(new URL(`../../app/src/${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

/** A detail with `n` samples; tissues as the core gives them (16 per sample). */
function detail(n, extra = {}) {
  const series = (f) => Array.from({ length: n }, (_, i) => f(i));
  return {
    id: 41,
    number: 1388,
    date: '2026-11-17 11:45:00',
    site: 'Mur de Rockport',
    samples: {
      timeSeconds: series((i) => i * 10),
      depthMm: series((i) => 1000 + i),
      cylinder: series(() => 0),
      ceilingMm: null,
      ceilingSource: 'computer',
      calcCeilingMm: null,
      ppo2Mbar: series(() => 210),
      temperatureMk: series(() => 283000),
      tissues: series(() => 1).flatMap((v) => new Array(16).fill(v)),
    },
    ...extra,
  };
}

test('a snapshot is built without the tissues and survives a round trip', () => {
  const built = snap.buildDetailSnapshot(detail(100), 'list');
  assert.equal(built.detail.samples.tissues, null);
  assert.equal(built.date, '2026-11-17 11:45:00');
  assert.equal(built.number, 1388);
  snap.saveDetailSnapshot(built);
  assert.ok(store.has(KEY));
  assert.deepEqual(snap.readDetailSnapshot(), JSON.parse(JSON.stringify(built)));
});

test('a long profile is thinned, every series alike, the last sample kept; a short one is whole', () => {
  const whole = snap.trimDetail(detail(500));
  assert.equal(whole.samples.timeSeconds.length, 500);
  const long = snap.trimDetail(detail(5000));
  const s = long.samples;
  assert.ok(s.timeSeconds.length <= 2500 && s.timeSeconds.length >= 1000);
  for (const key of ['depthMm', 'cylinder', 'ppo2Mbar', 'temperatureMk']) assert.equal(s[key].length, s.timeSeconds.length, key);
  assert.equal(s.timeSeconds.at(-1), 4999 * 10);
  assert.equal(s.depthMm.at(-1), 1000 + 4999);
  assert.equal(s.ceilingMm, null);
});

test('the stored detail of a 1000-sample dive stays small', () => {
  const text = JSON.stringify(snap.buildDetailSnapshot(detail(1000), 'list'));
  assert.ok(text.length < 100_000, `${text.length} bytes`);
  // The same dive with its tissues would be several times larger.
  assert.ok(JSON.stringify(detail(1000)).length > 1.5 * text.length);
});

test('a snapshot of another version or a broken one is ignored', () => {
  store.set(KEY, JSON.stringify({ ...snap.buildDetailSnapshot(detail(10), 'list'), v: 2 }));
  assert.equal(snap.readDetailSnapshot(), null);
  store.set(KEY, '{not json');
  assert.equal(snap.readDetailSnapshot(), null);
  store.set(KEY, JSON.stringify({ v: 1, date: 'x', number: 1, order: 'list', detail: {} }));
  assert.equal(snap.readDetailSnapshot(), null);
  store.delete(KEY);
  assert.equal(snap.readDetailSnapshot(), null);
});

test('it matches a dive by date and number only', () => {
  const s = snap.buildDetailSnapshot(detail(10), 'list');
  assert.ok(snap.snapshotIsOf(s, { date: '2026-11-17 11:45:00', number: 1388 }));
  assert.ok(!snap.snapshotIsOf(s, { date: '2026-11-17 11:45:00', number: 1389 }));
  assert.ok(!snap.snapshotIsOf(s, { date: '2026-11-18 09:00:00', number: 1388 }));
  assert.ok(!snap.snapshotIsOf(s, null));
  assert.ok(!snap.snapshotIsOf(null, { date: '2026-11-17 11:45:00', number: 1388 }));
});

test('the order tells the tablet list from a table sort', () => {
  assert.equal(snap.orderOf(false, { key: 'date', descending: true }), 'list');
  assert.notEqual(snap.orderOf(true, { key: 'date', descending: true }), snap.orderOf(true, { key: 'date', descending: false }));
  assert.notEqual(snap.orderOf(true, { key: 'date', descending: true }), snap.orderOf(true, { key: 'depth', descending: true }));
});

test('the first dive of the list snapshot is the one the list opens: a trip counts by its first dive', () => {
  const dive = (id, date, number, trip) => ({ id, date, number, trip });
  const trip = { id: 7, location: 'Lock 21' };
  const preview = {
    v: 1,
    total: 3,
    prefs: {},
    entries: [
      { type: 'trip', location: 'Lock 21', dives: [dive(3, '2026-11-11 10:44:00', 1387, trip), dive(2, '2026-11-08 09:35:00', 1386, trip)] },
      { type: 'dive', dive: dive(1, '2026-11-04 11:35:00', 1385) },
    ],
  };
  assert.equal(snap.previewFirst(preview).number, 1387);
  assert.equal(snap.previewFirst(null), null);
  assert.equal(snap.previewFirst({ ...preview, entries: [preview.entries[1]] }).number, 1385);
});

test('seeding hands the detail over once, under the real id and a stamp that forces a new read', async () => {
  const kept = [];
  // A new start: the module is loaded again, with the snapshot of the previous run in the storage.
  snap.saveDetailSnapshot(snap.buildDetailSnapshot(detail(10), 'list'));
  const snap2 = await import('../../app/src/lib/detail-snapshot.js?start');
  const keep = (id, d, stamp) => kept.push({ id, d, stamp });
  // Another dive: nothing handed over.
  assert.equal(snap2.seedStartDetail({ id: 9, date: '2026-11-18 08:00:00', number: 1389 }, keep), false);
  assert.equal(kept.length, 0);
  assert.equal(snap2.seedStartDetail({ id: 9, date: '2026-11-17 11:45:00', number: 1388 }, keep), true);
  assert.equal(kept[0].id, 9);
  assert.equal(kept[0].d.id, 9);
  assert.equal(kept[0].d.site, 'Mur de Rockport');
  assert.equal(kept[0].stamp, snap2.SEEDED_STAMP);
  // One-shot.
  assert.equal(snap2.seedStartDetail({ id: 9, date: '2026-11-17 11:45:00', number: 1388 }, keep), false);
});

test('clearing forgets the stored detail (sign-out, another logbook, data deleted)', () => {
  snap.saveDetailSnapshot(snap.buildDetailSnapshot(detail(10), 'list'));
  assert.ok(store.has(KEY));
  snap.clearDetailSnapshot();
  assert.ok(!store.has(KEY));
});

test('remembering keeps the dive read now, only when it is the first of the list', async () => {
  snap.clearDetailSnapshot();
  const first = { id: 5, date: '2026-11-17 11:45:00', number: 1388 };
  await snap.rememberFirstDetail(first, 'list', async () => detail(10, { id: 5 }));
  assert.equal(snap.readDetailSnapshot()?.number, 1388);
  snap.clearDetailSnapshot();
  await snap.rememberFirstDetail({ ...first, number: 1390 }, 'list', async () => detail(10, { id: 5 }));
  assert.equal(snap.readDetailSnapshot(), null);
});

test('the detail snapshot is a cache outside the device settings, forgotten with the list snapshot', () => {
  assert.match(src('lib/detail-snapshot.js'), /isRelease \? 'bc.detailSnapshotBeta' : 'bc.detailSnapshot'/);
  const line = src('lib/device-store.js').match(/NOT_SETTINGS = new Set\(\[(.*)\]\)/)?.[1] ?? '';
  assert.match(line, /'bc.detailSnapshot'/);
  assert.match(line, /'bc.detailSnapshotBeta'/);
  const lb = src('lib/logbook.svelte.js');
  assert.equal(lb.match(/saveSnapshot\(null\);\s*clearDetailSnapshot\(\);/g)?.length, 2);
});

test('the preview draws and reads nothing: no pane state, no core call, no listener', () => {
  const page = src('pages/DiveDetail.svelte');
  assert.match(page, /if \(preview \|\| f7route\.params\.trip\) return;\n\s+navigation\.dive = id;/);
  assert.match(page, /onMount\(\(\) => \{\n\s+if \(preview\) return;/);
  assert.match(page, /if \(!desk \|\| preview\) return;/);
  assert.match(page, /if \(!preview && edited/);
  assert.match(src('components/DesktopDiveFields.svelte'), /if \(preview\) return;\n\s+const shown = tab;/);
  assert.match(src('App.svelte'), /bc-pane-opening--snapshot[^>]*\binert\b/);
});

// --- The start gate ----------------------------------------------------------------------------------

const { firstScreenUp } = await import('../../app/src/lib/startup-gate.js');
const base = { loading: false, error: null, split: true, paneOpening: true, dive: null, detail: false, section: 'logbook', page: '' };

test('start gate: beside the list, the rest waits for the first dive of the pane', () => {
  assert.equal(firstScreenUp({ ...base, loading: true }), false);
  assert.equal(firstScreenUp(base), false); // list loaded, no dive yet
  assert.equal(firstScreenUp({ ...base, dive: '41' }), false); // page open, dive not read yet
  assert.equal(firstScreenUp({ ...base, dive: '41', detail: true }), true);
});

test('start gate: no dive to open, an error or a phone (no pane) lift it once the list is loaded', () => {
  assert.equal(firstScreenUp({ ...base, paneOpening: false }), true);
  assert.equal(firstScreenUp({ ...base, error: 'load' }), true);
  assert.equal(firstScreenUp({ ...base, split: false }), true);
  assert.equal(firstScreenUp({ ...base, split: false, loading: true }), false);
});

test('start gate: leaving the logbook lifts it at once, loaded or not', () => {
  for (const section of ['sites', 'statistics', 'tools', 'account']) assert.equal(firstScreenUp({ ...base, loading: true, section }), true, section);
  assert.equal(firstScreenUp({ ...base, loading: true, page: 'settings' }), true);
  assert.equal(firstScreenUp({ ...base, loading: true, page: 'about' }), true);
});

test('the screens that read for the first screen wait for the gate, and the sync state does not', () => {
  const waits = {
    'pages/Tools.svelte': /!startup\.ready \|\| navigation\.section !== 'tools'/,
    'pages/DesktopTools.svelte': /!startup\.ready \|\| navigation\.section !== 'tools'/,
    'pages/Statistics.svelte': /logbook\.loading \|\| !startup\.ready\) return;\n\s+void dives;/,
    'pages/DesktopStatistics.svelte': /logbook\.loading \|\| !startup\.ready\) return;\n\s+void dives;/,
    'pages/Sites.svelte': /!logbook\.loading && startup\.ready/,
    'pages/DesktopSites.svelte': /!logbook\.loading && startup\.ready/,
    'pages/Logbook.svelte': /logbook\.error \|\| !startup\.ready\) return;\n\s+untrack\(\(\) => loadOptions\(\)\)/,
  };
  for (const [file, pattern] of Object.entries(waits)) assert.match(src(file), pattern, file);
  // The pending changes drive the visible sync state: not behind the gate.
  assert.doesNotMatch(src('lib/logbook.svelte.js'), /startup\.ready/);
});
