// Task 2026-11-18-284: the logbook's search box sits 8 px higher in the blue band, the band keeps its height.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const theme = readFileSync(new URL('../../app/src/theme.css', import.meta.url), 'utf8');
const band = readFileSync(new URL('../../app/src/components/SectionBand.svelte', import.meta.url), 'utf8');

test('the search box is 8 px under the summary', () => {
  const rule = theme.match(/\.searchbar\.bc-band-search \{([^}]*)\}/)?.[1] ?? '';
  assert.match(rule, /margin: 8px 0 0;/);
});

test('the band gives the 8 px back under the search box: 40 px of blue before the wave', () => {
  assert.match(band, /&:has\(:global\(\.bc-band-search, \.bc-folding-search--slot\)\) \{\s*padding-bottom: 40px;/);
  assert.match(band, /padding: 0 16px 32px;/, 'other bands keep 32 px');
});

// Task 2026-11-23-339: on an Android phone the box folds into a magnifier (or a pill) while the list scrolls.
test('the folding search keeps the 40 px under the box too (its slot is as high as the box)', () => {
  const folding = readFileSync(new URL('../../app/src/components/FoldingSearch.svelte', import.meta.url), 'utf8');
  assert.match(folding, /:global\(\.bc-folding-search--slot\) \{\s*height: 56px;\s*margin-top: 8px;/);
  assert.match(folding, /PILL_HEIGHT = 40/);
  assert.match(folding, /ICON_HEIGHT = 48/);
});

test('the Carnet and Sites use the folding box on Android phones only', () => {
  for (const page of ['Logbook', 'Sites']) {
    const src = readFileSync(new URL(`../../app/src/pages/${page}.svelte`, import.meta.url), 'utf8');
    assert.match(src, /!theme\.ios && layout\.phone && !desktopApp/);
    assert.match(src, /<FoldingSearch bind:value=\{query\}/);
  }
});
