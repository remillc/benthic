// The desktop Statistiques screen (tasks 2026-11-15-171 and 176): the data of the chart, the
// previews of the list drawn from the logbook and the filter, the dives a click opens.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  STAT_KINDS, barsOf, barsPreview, chartFileName, depthBars, keyFigures, linePoints, niceTicks, previewOf, selectionOfBar, visibleDives, yearBars,
} from '../../app/src/lib/desktop-stats.js';

const dive = (id, date, site, maxDepthMm, durationSeconds) => ({ id, date, site, maxDepthMm, durationSeconds });
const dives = [
  dive(1, '2013-02-02T10:00:00', 'Reef', 20000, 3000),
  dive(2, '2013-02-03T10:00:00', 'Reef', 30000, 3600),
  dive(3, '2013-06-03T10:00:00', 'Wreck', 25000, 2400),
  dive(4, '2013-06-04T10:00:00', '', 10000, 1800),
  dive(5, '2015-01-01T10:00:00', 'Wreck', 40000, 3000),
];
const extras = new Map([[1, { id: 1, sacMlMin: 16000 }], [2, { id: 2, sacMlMin: 14000 }], [5, { id: 5, sacMlMin: 18000 }]]);
const sites = [
  { name: 'Reef', hasLocation: true, latUdeg: 1, lonUdeg: 1, dives: 2 },
  { name: 'Wreck', hasLocation: true, latUdeg: 2, lonUdeg: 2, dives: 2 },
];

test('the six built-in statistics, each with its icon', () => {
  assert.deepEqual(STAT_KINDS.map((k) => [k.key, k.icon]), [
    ['byYear', 'bars'], ['maxDepth', 'depth'], ['time', 'stopwatch'], ['sac', 'cylinder'], ['bySite', 'pin'], ['heat', 'grid'],
  ]);
});

test('dives per year fill the years without a dive and carry their dive ids', () => {
  const bars = yearBars(dives);
  assert.deepEqual(bars.map((b) => [b.label, b.value]), [['2013', 4], ['2014', 0], ['2015', 1]]);
  assert.deepEqual(bars[0].diveIds, [1, 2, 3, 4]);
  assert.deepEqual(bars[1].diveIds, []);
});

test('a click on a bar selects exactly its dives; an empty bar opens nothing', () => {
  const bars = yearBars(dives);
  assert.deepEqual(selectionOfBar(bars[0]), { ids: [1, 2, 3, 4], anchor: 1, focus: 4 });
  assert.equal(selectionOfBar(bars[1]), null);
  const perSite = barsOf('bySite', dives, extras);
  assert.deepEqual(selectionOfBar(perSite.find((b) => b.site === 'Wreck')).ids, [3, 5]);
  assert.deepEqual(selectionOfBar(depthBars(dives)[0]).ids, [1], 'a per-dive bar opens that dive');
});

test('per site: the busiest first, the dives without a site last', () => {
  const bars = barsOf('bySite', dives, extras);
  assert.deepEqual(bars.map((b) => [b.site, b.value]), [['Reef', 2], ['Wreck', 2], ['', 1]]);
});

test('key figures: the mean per year counts every year of the range', () => {
  const f = keyFigures('byYear', yearBars(dives), 5);
  assert.equal(f.total, 5);
  assert.equal(f.best, '2013');
  assert.equal(f.bestValue, 4);
  assert.ok(Math.abs(f.mean - 5 / 3) < 1e-9);
  const d = keyFigures('maxDepth', depthBars(dives), 5);
  assert.deepEqual([d.max, d.min], [40000, 10000]);
});

test('previews come from the logbook: bars, a line, a grid', () => {
  const years = previewOf('byYear', dives, extras, sites);
  assert.equal(years.type, 'bars');
  assert.deepEqual(years.values, [1, 0, 0.25]);
  assert.equal(previewOf('maxDepth', dives, extras, sites).type, 'line');
  assert.equal(previewOf('time', dives, extras, sites).type, 'line');
  assert.equal(previewOf('sac', dives, extras, sites).type, 'line');
  assert.equal(previewOf('bySite', dives, extras, sites).type, 'bars');
  const heat = previewOf('heat', dives, extras, sites);
  assert.equal(heat.type, 'grid');
  assert.equal(heat.levels.length, 8);
});

test('a preview keeps the last 7 values', () => {
  const many = Array.from({ length: 12 }, (_, i) => dive(i + 1, `2020-01-${String(i + 1).padStart(2, '0')}T10:00:00`, 'Reef', (i + 1) * 1000, 3000));
  assert.equal(previewOf('maxDepth', many, extras, sites).values.length, 7);
  assert.equal(previewOf('maxDepth', many, extras, sites).values.at(-1), 1);
});

test('a filter changes the previews', () => {
  const all = previewOf('byYear', dives, extras, sites);
  const filtered = previewOf('byYear', visibleDives(dives, new Set([5])), extras, sites);
  assert.notDeepEqual(all, filtered);
  assert.deepEqual(filtered.values, [1]);
  assert.equal(visibleDives(dives, null).length, 5);
});

test('an empty logbook shows no preview; nor does missing data', () => {
  for (const { key } of STAT_KINDS) assert.equal(previewOf(key, [], extras, sites), null, key);
  assert.equal(previewOf('sac', dives, new Map(), sites), null, 'no consumption recorded');
  assert.equal(previewOf('heat', dives, extras, [sites[0]]), null, 'fewer than 2 sites with a position');
  assert.equal(barsPreview([]), null);
});

test('the depth line is drawn downward, the other measures upward', () => {
  assert.equal(linePoints([0, 1], true), '1.0,2.0 55.0,22.0');
  assert.equal(linePoints([0, 1], false), '1.0,22.0 55.0,2.0');
  assert.equal(linePoints([0.5], true).split(' ').length, 2, 'one value is drawn as a flat line');
});

test('the axis takes round steps up to the top value', () => {
  assert.deepEqual(niceTicks(4), { max: 4, ticks: [0, 1, 2, 3, 4] });
  assert.equal(niceTicks(12).max >= 12, true);
  assert.deepEqual(niceTicks(0).ticks, [0, 1]);
});

test('the exported image is named after the statistic', () => {
  assert.equal(chartFileName('Benthic-statistique', "Temps sous l'eau", '2026-11-15'), 'Benthic-statistique-Temps-sous-l-eau-2026-11-15.png');
});
