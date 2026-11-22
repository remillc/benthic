import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(`../../app/src/${file}`, import.meta.url), 'utf8');

test('the shared map hides dive counts without changing the personal map or site sheet', () => {
  const sites = read('pages/Sites.svelte');
  assert.match(sites, /names=\{common \? 'atZoom' : 'atZoomOrFewInFullScreen'\}/);
  assert.match(sites, /hideDiveCounts=\{common\}/);
  assert.match(sites, /baseCardLine\(baseSelected, false\)/);
  assert.match(sites, /baseCardLine\(x, false\)/);
  assert.match(sites, /summary=\{common \? '' :/);
  assert.doesNotMatch(sites, /sharedSites\.areaCount/);
  assert.match(read('pages/SharedSiteSheet.svelte'), /baseCardLine\(site\)/);

  const map = read('components/SiteMap.svelte');
  assert.match(map, /!hideDiveCounts && site\.dives/);
  assert.match(map, /hideDiveCounts\s*\?\s*t\('sites\.mapSiteWithoutDives'/);
  const card = read('components/MapSiteCard.svelte');
  assert.match(card, /hideDiveCounts \? '' : t\('sites\.diveCount'/);
  assert.match(card, /hideDiveCounts \? '' : t\('sites\.rowDives'/);
  const stack = read('components/MapStackSheet.svelte');
  assert.match(stack, /#if !hideDiveCounts.*bc-map-stack-sheet--badge/);
  assert.match(stack, /#if !hideDiveCounts.*bc-map-stack-sheet--dives/);
});

test('shared and personal pin names follow the same zoom threshold, with site clusters', () => {
  const map = read('components/SiteMap.svelte');
  assert.match(map, /namesFromZoom = 13/);
  assert.match(map, /map\.getZoom\(\) >= Math\.min\(namesFromZoom, map\.getMaxZoom\(\)\)/);
  assert.match(map, /names === 'atZoomOrFewInFullScreen'/);
  assert.match(map, /text\.className = 'bc-site-map--base-name'/);
  assert.match(map, /text\.textContent = s\.name/);
  const sites = read('pages/Sites.svelte');
  assert.match(sites, /clusters: baseBox\.clusters/);
  assert.match(sites, /\s+groupSites\s/);
  assert.match(map, /stackPins\(ordered\.map/);
  assert.match(map, /onstack\?\.\(group\.uuids/);
});

test('the tablet page content lets map gestures through while its controls stay usable', () => {
  const sites = read('pages/Sites.svelte');
  assert.match(sites, /\.bc-sites--tablet > \.page-content\)\s*\{\s*pointer-events: none/);
  assert.match(sites, /\.bc-sites--tablet > \.page-content > \*\)\s*\{\s*pointer-events: auto/);
});

test('the Android tablet map clears the bottom system inset', () => {
  const sites = read('pages/Sites.svelte');
  assert.match(sites, /\.bc-sites--split:not\(\.ios\) \.bc-sites--map-pane\s*\{[^}]*margin: 16px 16px calc\(16px \+ var\(--bc-safe-bottom\)\) 0/s);
});

test('the shared map mode control has 48 dp targets and clears the locate button', () => {
  const sites = read('pages/Sites.svelte');
  assert.match(sites, /max-width: calc\(100% - 88px\)/);
  assert.match(sites, /\.bc-sites--mode-button\s*\{[^}]*width: auto/s);
  assert.match(sites, /min-width: 48px/);
  assert.match(sites, /inset: -4px 0/);
  assert.match(sites, /white-space: nowrap/);
});

test('desktop shared mode loads nearby sites and connects map markers to site sheets', () => {
  const desktop = read('pages/DesktopSites.svelte');
  const map = read('components/DesktopSiteMap.svelte');
  assert.match(desktop, /api\.inBox\(token/);
  assert.match(desktop, /api\.nearby\(token/);
  assert.match(desktop, /href="\/sites\/base\/\{encodeURIComponent\(site\.id\)\}"/);
  assert.match(desktop, /clusters=\{common \? baseClusters : \[\]\}/);
  assert.match(map, /onbaseselect\?\.\(site\.id\)/);
});
