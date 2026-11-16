// Which samples the dive profile draws (performance audit, finding F6).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decimate, changesAt } from '../../app/src/lib/profile-decimate.js';

const series = (n, step, f) => ({ times: Array.from({ length: n }, (_, i) => i * step), values: Array.from({ length: n }, (_, i) => f(i)) });

test('a profile with at most two samples per pixel is drawn whole', () => {
  const { times, values } = series(600, 10, (i) => i);
  assert.equal(decimate(times, values, { width: 300, tMax: 5990 }), null);
  assert.equal(decimate(times, values, { width: 400, tMax: 5990 }), null);
});

test('a 3 hour dive at 1 s keeps a few points per pixel column and the exact extremes', () => {
  const n = 10800;
  const { times, values } = series(n, 1, (i) => 20000 + 15000 * Math.sin(i / 700) + (i % 13) * 40);
  values[4321] = 61230; // the deepest point, one sample wide
  values[8000] = 120; // a spike to the surface
  const out = decimate(times, values, { width: 700, tMax: n - 1 });
  assert.ok(out && out.length <= 4 * 700 + 2, `got ${out?.length}`);
  assert.ok(out.length < n / 3);
  assert.equal(out[0], 0);
  assert.equal(out.at(-1), n - 1);
  assert.ok(out.includes(4321), 'max depth kept');
  assert.ok(out.includes(8000), 'the spike kept');
  assert.equal(Math.max(...out.map((i) => values[i])), Math.max(...values));
  assert.equal(Math.min(...out.map((i) => values[i])), Math.min(...values));
  for (let k = 1; k < out.length; k++) assert.ok(out[k] > out[k - 1], 'ascending, no duplicate');
});

test('samples marked as must stay', () => {
  const n = 10000;
  const { times, values } = series(n, 1, () => 5000);
  const out = decimate(times, values, { width: 100, tMax: n - 1, must: (i) => i === 5555 || i === 7001 });
  assert.ok(out.includes(5555) && out.includes(7001));
});

test('a gap in the series stays a gap: the samples on both sides of it are kept', () => {
  const n = 8000;
  const { times, values } = series(n, 1, (i) => 10000 + (i % 50));
  const valid = (i) => !(i >= 3000 && i < 3400);
  const out = decimate(times, values, { width: 100, tMax: n - 1, valid });
  assert.ok(out.includes(2999) && out.includes(3000) && out.includes(3399) && out.includes(3400));
  assert.ok(!out.some((i) => i > 3000 && i < 3399));
});

test('an unusable width or time range draws everything', () => {
  const { times, values } = series(5000, 1, (i) => i);
  assert.equal(decimate(times, values, { width: 100, tMax: 0 }), null);
  assert.equal(decimate([], [], { width: 100, tMax: 10 }), null);
});

test('changesAt marks the first sample on another cylinder', () => {
  const at = changesAt([0, 0, 1, 1, 0]);
  assert.deepEqual([0, 1, 2, 3, 4].filter(at), [2, 4]);
  assert.equal(changesAt(undefined)(3), false);
});
