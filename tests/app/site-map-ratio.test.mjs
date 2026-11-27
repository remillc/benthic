import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../../app/src/${p}`, import.meta.url), 'utf8');

test('SiteMap sets an aspect ratio instead of a fixed height when given a ratio', () => {
  const s = read('components/SiteMap.svelte');
  assert.match(s, /style:aspect-ratio=\{!full && ratio/);
  assert.match(s, /ratio \? 'auto' : height/);
  assert.match(s, /new ResizeObserver\(\(\) => map\?\.resize/);
});

test('site card, edit screen and desktop maps use 2.1 : 1', () => {
  assert.match(read('pages/SiteSheet.svelte'), /<SiteMap[^>]*ratio=\{2\.1\}/);
  // The form of a new site opened from a dive (task 2026-11-27-412) has a square map on a phone (nouveau-site-plongee-android: 358 x 360) and a 1128 x 400 one on a tablet.
  assert.match(read('pages/SiteEdit.svelte'), /<SiteMap[^>]*ratio=\{mapRatio\}/);
  assert.match(read('pages/SiteEdit.svelte'), /forDive \? \(layout\.phone \? 1 : 2\.8\) : 2\.1/);
  const d = read('components/DesktopSitePosMap.svelte');
  assert.match(d, /aspect-ratio: 2\.1 \/ 1/);
  assert.doesNotMatch(d, /style:height/);
  assert.match(d, /new ResizeObserver\(\(\) => m\.resize/);
});
