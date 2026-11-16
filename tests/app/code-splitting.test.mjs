// What keeps the first screen light (docs/performance-audit.md, F2 and F8): pages in their own chunks, one catalog per
// language, Framework7 reduced to what the app uses, MapLibre's CSS with the map code. These tests read the source:
// a page imported statically again, or the full bundle imported back, makes them fail.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { test } from 'node:test';
import path from 'node:path';

const src = path.resolve(import.meta.dirname, '../../app/src');
const read = (file) => readFileSync(path.join(src, file), 'utf8');
const walk = (dir) => readdirSync(dir).flatMap((n) => (statSync(path.join(dir, n)).isDirectory() ? walk(path.join(dir, n)) : [path.join(dir, n)]));
const sources = walk(src).filter((f) => /\.(js|svelte|css)$/.test(f));

test('App.svelte imports statically only the pages of the first screen and of the master-detail views', () => {
  const app = read('App.svelte');
  const statics = [...app.matchAll(/^\s*import \w+ from '\.\/pages\/(\w+)\.svelte';/gm)].map((m) => m[1]).sort();
  assert.deepEqual(statics, [
    'Account', 'DesktopLogbook', 'DesktopSelection', 'DesktopSites', 'DesktopStatistics', 'DesktopTools', 'DiveDetail', 'Logbook',
    'PaneEmpty', 'Placeholder', 'Settings', 'Sites', 'Statistics', 'StatisticsDives', 'StatisticsResult', 'Tools', 'WelcomeStart',
  ]);
  // The others are reached through lazy() or a dynamic import.
  const lazyPages = [...app.matchAll(/import\('\.\/pages\/(\w+)\.svelte'\)/g)].map((m) => m[1]);
  assert.ok(lazyPages.length >= 40, `${lazyPages.length} lazy pages`);
});

test('no page is lazy and static at once, and every lazy route resolves its page', () => {
  const app = read('App.svelte');
  const statics = new Set([...app.matchAll(/^\s*import (\w+) from '\.\/pages\//gm)].map((m) => m[1]));
  for (const m of app.matchAll(/import\('\.\/pages\/(\w+)\.svelte'\)/g)) {
    assert.ok(!statics.has(m[1]), `${m[1]} is imported both ways`);
    assert.ok(readFileSync(path.join(src, 'pages', `${m[1]}.svelte`), 'utf8').length > 0);
  }
  assert.match(app, /const lazy = \(load, props\) =>/);
});

test('the language catalogs are loaded one by one, only the ones the language needs', () => {
  const i18n = read('lib/language.js');
  assert.doesNotMatch(i18n, /^import .*\.json/m, 'a catalog is imported statically');
  assert.equal([...i18n.matchAll(/import\('\.\.\/i18n\/([\w-]+)\.json'\)/g)].map((m) => m[1]).sort().join(), 'en,fr,fr-CA');
  assert.match(i18n, /catalogChain\(language\)\.map/);
});

test('Framework7: the core and the used components, not the full bundles', () => {
  for (const file of sources) {
    const text = readFileSync(file, 'utf8');
    assert.doesNotMatch(text, /framework7\/lite-bundle|framework7\/css\/bundle|framework7\/bundle/, `${path.relative(src, file)} imports a full bundle`);
  }
  const js = read('framework7.js');
  const css = read('theme.css');
  const pkg = JSON.parse(readFileSync(path.resolve(src, '../node_modules/framework7/package.json'), 'utf8'));
  for (const m of js.matchAll(/from 'framework7\/components\/([\w-]+)'/g)) {
    // form and virtual-list ship an empty style sheet: not imported.
    const hasCss = `./components/${m[1]}/css` in pkg.exports && !['form', 'virtual-list'].includes(m[1]);
    assert.equal(css.includes(`framework7/components/${m[1]}/css`), hasCss, `${m[1]}: its CSS and its code go together`);
  }
  assert.match(css, /@import 'framework7\/css' layer\(framework7\);/);
});

test('MapLibre: its CSS is loaded with the map code, in its layer', () => {
  assert.doesNotMatch(read('theme.css'), /@import 'maplibre-gl/);
  assert.match(read('maplibre.css'), /@import 'maplibre-gl\/dist\/maplibre-gl\.css' layer\(maplibre\);/);
  const loader = read('lib/maplibre.js');
  assert.match(loader, /import\('maplibre-gl'\)/);
  assert.match(loader, /import\('\.\.\/maplibre\.css'\)/);
  for (const file of sources) {
    if (file.endsWith(path.join('lib', 'maplibre.js'))) continue;
    assert.doesNotMatch(readFileSync(file, 'utf8'), /await import\('maplibre-gl'\)/, `${path.relative(src, file)} loads the map code without its CSS`);
  }
});
