// Dives of an Apple Watch Ultra from Apple Health (app/src/lib/health-dives.js, to-do #67).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { splitDives, divesToSsrf, SURFACE_GAP_S } from '../../app/src/lib/health-dives.js';

const T0 = Date.UTC(2026, 10, 14, 13, 0, 0);
/** A depth sample every `step` seconds from `from` (s after T0). */
const series = (from, depths, step = 10, prefix = 'd') => depths.map((value, i) => ({ id: `${prefix}${from + i * step}`, at: T0 + (from + i * step) * 1000, value }));

test('two dives separated by a long surface break', () => {
  const a = series(0, [1.2, 5, 12, 18, 12, 5, 1.5]);
  const b = series(60 + SURFACE_GAP_S + 30, [2, 8, 10, 9, 7, 4, 2, 1.1]);
  const dives = splitDives([...b, ...a]);
  assert.equal(dives.length, 2);
  assert.equal(dives[0].startMs, T0);
  assert.equal(dives[0].maxDepthM, 18);
  assert.equal(dives[0].firstId, 'd0');
  assert.deepEqual(dives[0].samples.map((s) => s.t), [0, 10, 20, 30, 40, 50, 60]);
  assert.equal(dives[1].maxDepthM, 10);
});

test('a short break does not end the dive', () => {
  const a = series(0, [3, 6, 6]);
  const b = series(20 + 120, [6, 3, 2]);
  assert.equal(splitDives([...a, ...b]).length, 1);
});

test('splashes and short dips are not dives', () => {
  assert.equal(splitDives(series(0, [0.3, 0.8, 0.5, 0.4, 0.6, 0.7, 0.2])).length, 0, 'never below 1 m');
  assert.equal(splitDives(series(0, [2, 3, 2], 10)).length, 0, 'under a minute');
});

test('each depth sample takes the latest temperature measured before it', () => {
  const depth = series(0, [2, 6, 9, 6, 2, 1.5, 1.2]);
  const temperature = [
    { at: T0 + 5000, value: 21.5 },
    { at: T0 + 35000, value: 19.0 },
  ];
  const [dive] = splitDives(depth, temperature);
  assert.deepEqual(dive.samples.map((s) => s.tempC), [undefined, 21.5, 21.5, 21.5, 19, 19, 19]);
});

test('the Subsurface file: date, duration, computer, mark and samples', () => {
  const [dive] = splitDives(series(0, [1.2, 5.555, 12, 18.25, 12, 5, 1.5]), [{ at: T0, value: 22 }, { at: T0 + 30000, value: 20.04 }]);
  const xml = divesToSsrf([dive]);
  const local = new Date(T0);
  const p = (/** @type {number} */ n) => String(n).padStart(2, '0');
  assert.match(xml, new RegExp(`<dive date='${local.getFullYear()}-${p(local.getMonth() + 1)}-${p(local.getDate())}' time='${p(local.getHours())}:00:00' duration='1:00 min'>`));
  assert.match(xml, /<divecomputer model='Apple Watch Ultra'>/);
  assert.match(xml, /<depth max='18.25 m' \/>/);
  assert.match(xml, /<temperature water='20.0 C' \/>/);
  assert.match(xml, /<extradata key='Apple Health' value='d0' \/>/);
  assert.match(xml, /<sample time='0:00 min' depth='1.2 m' temp='22.0 C' \/>/);
  assert.match(xml, /<sample time='0:10 min' depth='5.555 m' \/>/);
  assert.match(xml, /<sample time='0:30 min' depth='18.25 m' temp='20.0 C' \/>/);
  assert.match(xml, /^<divelog program='subsurface' version='3'>/);
});

test('no dive: an empty logbook file', () => {
  assert.match(divesToSsrf([]), /<dives>\n<\/dives>/);
});
