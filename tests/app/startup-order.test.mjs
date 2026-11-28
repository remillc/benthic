// Start-up order (27 November 2026): what the core's one thread does first at start, measured on a tablet with 1,358 dives.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('the start does not wait for the cylinder types: their call queued behind the logbook read', () => {
  const settings = read('app/src/lib/settings.svelte.js');
  assert.doesNotMatch(settings, /send\('Restoring the cylinder types of this device'/);
  assert.match(settings, /import\('\.\/cylinder-type-library\.svelte\.js'\)\s*\.then\(\(m\) => m\.startCylinderTypes\(\)\)/);
});

test('the neighbour dives are read once the logbook list is painted (or after 5 s)', () => {
  const preload = read('app/src/lib/dive-preload.js');
  assert.match(preload, /export async function preloadDives\(ids\) \{\s*await settled;/);
  assert.match(preload, /setTimeout\(\(\) => settle\(\), 5000\)/);
  assert.match(read('app/src/pages/DiveDetail.svelte'), /ghostTimer = setTimeout\(async \(\) => \{\s*await afterStart\(\);/);
  assert.match(read('app/src/pages/Logbook.svelte'), /mark\('rowsPainted'\);\s*startSettled\(\);/);
});

test('a dive detail comes as the core\'s text and is parsed in JavaScript, on Android and iOS; an object is still taken', () => {
  const api = read('plugins/benthic-core/core-api.js');
  assert.match(api, /const dive = typeof answer\?\.json === 'string' \? JSON\.parse\(answer\.json\) : answer;/);
  assert.match(read('plugins/benthic-core/android/src/main/java/app/benthicdivelog/core/BenthicCorePlugin.kt'), /val result = JSObject\(\)\.put\("json", NativeCore\.getDive\(id\)\)\s*resolveThread\.execute \{ call\.resolve\(result\) \}/);
  assert.match(read('plugins/benthic-core/ios/Plugin/BenthicCorePlugin.swift'), /call\.resolve\(\["json": try BenthicNative\.getDive\(id\)\]\)/);
});
