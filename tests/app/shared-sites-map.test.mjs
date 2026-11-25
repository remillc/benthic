import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(`../../app/src/${file}`, import.meta.url), 'utf8');

test('the shared map hides dive counts without changing the personal map or site sheet', () => {
  const sites = read('pages/Sites.svelte');
  assert.match(sites, /names=\{common \? 'atZoom' : 'atZoomOrFewInFullScreen'\}/);
  assert.match(sites, /hideDiveCounts=\{common\}/);
  assert.match(sites, /<SharedSiteCard site=\{baseSelected\}/);
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
  assert.match(read('lib/map-label.js'), /export const SITE_NAMES_FROM_ZOOM = 11;/);
  assert.match(map, /namesFromZoom = SITE_NAMES_FROM_ZOOM/);
  assert.match(read('components/DesktopSiteMap.svelte'), /m\.getZoom\(\) >= Math\.min\(SITE_NAMES_FROM_ZOOM, m\.getMaxZoom\(\)\)/);
  assert.match(map, /map\.getZoom\(\) >= Math\.min\(namesFromZoom, map\.getMaxZoom\(\)\)/);
  assert.match(map, /names === 'atZoomOrFewInFullScreen'/);
  assert.match(map, /text\.className = 'bc-site-map--base-name'/);
  assert.match(map, /text\.textContent = s\.name/);
  const sites = read('pages/Sites.svelte');
  assert.match(sites, /sites: wholeMap\.map\(/);
  assert.match(map, /groupsIn\(index, /);
  assert.match(map, /Math\.floor\(m\.getZoom\(\)\) !== baseLevel\) drawBase\(\)/);
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
  assert.match(desktop, /readWholeMap\(\)/);
  assert.match(desktop, /api\.nearby\(token/);
  assert.match(desktop, /onclick=\{\(\) => pickBase\(site\)\}/);
  assert.match(desktop, /<SharedSiteCard site=\{baseSelected\} desktop/);
  assert.match(map, /groupsIn\(baseIndex, /);
  assert.match(map, /Math\.floor\(m\.getZoom\(\)\) !== baseLevel\) render\(\)/);
  assert.match(map, /onbaseselect\?\.\(site\.id\)/);
  assert.match(map, /#if common\}\{t\('sharedSites\.mapCredits'\)/);
});

test('on the shared map your sites look like the others (task 2026-11-24-394)', () => {
  const sites = read('pages/Sites.svelte');
  assert.match(sites, /sites=\{common \? \[\] : located\}/);
  assert.doesNotMatch(sites, /inYourSites|common-mine/);
  assert.match(sites, /sharedSites\.mapLabel', \{ n: baseList\.length \}/);
  assert.doesNotMatch(read('lib/shared-sites-format.js'), /inYourSites/);
  assert.doesNotMatch(read('components/SiteMap.svelte'), /s\.mine/);
  assert.doesNotMatch(read('components/DesktopSiteMap.svelte'), /site\.mine/);
  assert.match(read('pages/DesktopSites.svelte'), /sites=\{common \? \[\] :/);
});
