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
  assert.match(band, /&:has\(:global\(\.bc-band-search\)\) \{\s*padding-bottom: 40px;/);
  assert.match(band, /padding: 0 16px 32px;/, 'other bands keep 32 px');
});
