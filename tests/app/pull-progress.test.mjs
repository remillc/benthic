// Todo 88: a progress bar while the app exchanges with the server after showing the device's copy.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (p) => readFileSync(new URL(`../../app/src/${p}`, import.meta.url), 'utf8');
const logbook = read('lib/logbook.svelte.js');
const page = read('pages/Logbook.svelte');
const bar = read('components/PullProgress.svelte');

test('the device copy is shown first, then the pull runs: the flag covers exactly that window', () => {
  // Set when the cached copy is drawn (loading false), before the server's answer is awaited.
  assert.match(logbook, /logbook\.sync = 'syncing';\s*logbook\.pulling = true;\s*logbook\.loading = false;[\s\S]*const server = await probe;/);
  // Cleared when the load ends, whatever happened.
  assert.match(logbook, /\} finally \{\s*logbook\.loading = false;\s*logbook\.pulling = false;/);
  // Not set by the syncs that follow an edit.
  assert.equal([...logbook.matchAll(/logbook\.pulling = true/g)].length, 1);
});

test('the Carnet shows the bar only while pulling, with the list on screen', () => {
  assert.match(page, /\{#if logbook\.pulling && !logbook\.loading && !logbook\.error\}<PullProgress \/>\{\/if\}/);
});

test('Android: the wavy indicator; iPhone: the 8 pt bar; no height taken; the stages feed it', () => {
  assert.match(bar, /<LinearWavyProgress value=\{fraction\} indeterminate=\{fraction <= 0\} \{label\} \/>/);
  assert.match(bar, /:global\(\.ios\) & \{\s*height: 8px;/);
  assert.match(bar, /\.bc-pull-progress \{[^}]*height: 0;/);
  assert.match(bar, /logbook\.syncProgress\?\.fraction/);
  assert.doesNotMatch(bar, /#[0-9a-fA-F]{3,6}\b/, 'colours are --bc-* variables');
});
