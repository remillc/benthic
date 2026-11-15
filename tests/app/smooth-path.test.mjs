// The decorative dive profile is a smooth curve through every point (task 2026-11-15-214).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { smoothPath, decorativeProfilePath, DECORATIVE_DIVE } from '../../app/src/lib/smooth-path.js';

const numbers = (d) => d.match(/-?\d+(\.\d+)?/g).map(Number);

test('the curve passes through every point, with cubic segments only', () => {
  const pts = [[0, 0], [10, 20], [30, 5], [50, 40], [60, 0]];
  const d = smoothPath(pts);
  assert.match(d, /^M0\.0 0\.0( C[^MLZ]+){4}$/);
  assert.doesNotMatch(d, /L/);
  const n = numbers(d);
  // Every segment ends on the next point.
  const ends = [n.slice(0, 2)];
  for (let i = 2; i < n.length; i += 6) ends.push(n.slice(i + 4, i + 6));
  assert.deepEqual(ends, pts);
});

test('control points follow Catmull-Rom with tension 1/6; the ends use the end point as neighbour', () => {
  const n = numbers(smoothPath([[0, 0], [6, 12], [12, 0]]));
  // First segment: C1 = P0 + (P1 − P0)/6, C2 = P1 − (P2 − P0)/6.
  assert.deepEqual(n.slice(2, 6), [1, 2, 4, 12]);
  // Last segment: C1 = P1 + (P2 − P0)/6, C2 = P2 − (P2 − P1)/6.
  assert.deepEqual(n.slice(8, 12), [8, 12, 11, 2]);
});

test('no corner: at each inner point the two tangents are collinear', () => {
  // A large scale, so that the 0.1 rounding of the path stays small even where two points are close.
  const pts = DECORATIVE_DIVE.map(([s, d]) => [s * 2, d * 100]);
  const n = numbers(smoothPath(pts)).slice(2);
  for (let i = 0; i + 6 < n.length; i += 6) {
    const [c2x, c2y, px, py] = n.slice(i + 2, i + 6);
    const [c1x, c1y] = n.slice(i + 6, i + 8);
    const cross = (px - c2x) * (c1y - py) - (py - c2y) * (c1x - px);
    const len = Math.hypot(px - c2x, py - c2y) * Math.hypot(c1x - px, c1y - py);
    // The sine of the turn (paths are rounded to 0.1, so a small tolerance).
    assert.ok(len === 0 || Math.abs(cross) / len < 0.02, `corner at point ${i / 6 + 1}`);
  }
});

test('the decorative profiles use the curve; the real dive profile does not', () => {
  const read = (p) => readFileSync(new URL(`../../app/src/${p}`, import.meta.url), 'utf8');
  assert.match(read('components/DecorativeProfile.svelte'), /decorativeProfilePath\(WIDTH, 8, 174\)/);
  assert.match(read('pages/WelcomeStart.svelte'), /decorativeProfilePath\(WIDTH, 40, 160\)/);
  assert.doesNotMatch(read('components/DiveProfile.svelte'), /smooth-path/);
  assert.equal(decorativeProfilePath(390, 8, 174).split(' C').length, DECORATIVE_DIVE.length);
});
