// Profile curves, thin on every platform (task 2026-11-15-190): 1.25 dp, 2 dp in high contrast,
// the average-depth line 1 dp, the dark halo twice the line.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const theme = readFileSync(new URL('../../app/src/theme.css', import.meta.url), 'utf8');
const profile = readFileSync(new URL('../../app/src/components/DiveProfile.svelte', import.meta.url), 'utf8');

/** @param {string} selector */
const rule = (selector) => profile.match(new RegExp(selector.replaceAll('.', '\\.') + String.raw` \{([^}]*)\}`))?.[1] ?? '';

test('the line widths of the theme', () => {
  const widths = [...theme.matchAll(/--bc-profile-line-width: ([\d.]+);/g)].map((m) => m[1]);
  assert.deepEqual(widths, ['1.25', '2', '2'], 'base, then the two high-contrast themes');
  const halos = [...theme.matchAll(/--bc-profile-halo-width: ([\d.]+);/g)].map((m) => m[1]);
  assert.deepEqual(halos, ['2.5', '4.5', '4.5']);
});

test('every curve of the profile uses the line width', () => {
  for (const cls of ['.bc-dive-profile--ppo2', '.bc-dive-profile--ceiling-line']) {
    assert.match(rule(cls), /stroke-width: var\(--bc-profile-line-width\);/, cls);
  }
  // Task 2026-11-16-238: the depth line and the temperature curve take a tablet width when there is one.
  for (const cls of ['.bc-dive-profile--trace', '.bc-dive-profile--temperature']) {
    assert.match(rule(cls), /stroke-width: var\(--bc-profile-main-width, var\(--bc-profile-line-width\)\);/, cls);
  }
  const css = readFileSync(new URL('../../app/src/theme.css', import.meta.url), 'utf8');
  assert.match(css, /@media \(min-width: 768px\) \{\s*:root:not\(\.bc-high-contrast\) \{\s*--bc-profile-main-width: 1;/);
  assert.match(rule('.bc-dive-profile--trace-outline'), /stroke-width: var\(--bc-profile-halo-width\);/);
  assert.match(rule('.bc-dive-profile--mean'), /stroke-width: 1;/);
});
