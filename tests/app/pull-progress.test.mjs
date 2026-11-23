// Todo 88 and task 2026-11-23-340: a progress line on the header's profile while the app exchanges with the server after
// showing the device's copy.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (p) => readFileSync(new URL(`../../app/src/${p}`, import.meta.url), 'utf8');
const logbook = read('lib/logbook.svelte.js');
const page = read('pages/Logbook.svelte');
const line = read('components/SyncProfileLine.svelte');
const backdrop = read('components/BandBackdrop.svelte');
const band = read('components/SectionBand.svelte');

test('the device copy is shown first, then the pull runs: the flag covers exactly that window', () => {
  // Set when the cached copy is drawn (loading false), before the server's answer is awaited.
  assert.match(logbook, /logbook\.sync = 'syncing';\s*logbook\.pulling = true;\s*logbook\.loading = false;[\s\S]*const server = await probe;/);
  // Cleared when the load ends, whatever happened.
  assert.match(logbook, /\} finally \{\s*logbook\.loading = false;\s*logbook\.pulling = false;/);
  // Not set by the syncs that follow an edit.
  assert.equal([...logbook.matchAll(/logbook\.pulling = true/g)].length, 1);
});

test('the Carnet draws the line on its band (Material look) or under its header (iPhone, iPad), not as a bar in the list', () => {
  // Changed with task 2026-11-23-340: PullProgress (a bar lying over the list) is replaced by the line on the profile.
  assert.doesNotMatch(page, /PullProgress/);
  assert.match(page, /<BandBackdrop [^>]*syncLine \/>/);
  assert.match(page, /<SectionBand [^>]*syncLine=\{theme\.ios\}/);
  assert.match(backdrop, /\{#if syncLine\}<SyncProfileLine \/>\{\/if\}/);
  assert.match(band, /\{#if syncLine\}<SyncProfileLine edge \/>\{\/if\}/);
  // The list shows only while pulling with the list on screen; the line follows that condition.
  assert.match(line, /logbook\.pulling && !logbook\.loading && !logbook\.error/);
});

test('the line is the progressbar, takes no height, runs on the band profile in pixels, and the stages feed it', () => {
  assert.match(line, /role="progressbar"/);
  assert.match(line, /aria-valuenow=\{view\.value\}/);
  assert.match(line, /pathLength="100"/);
  assert.match(line, /bandProfileInPixels\(width, HEIGHT\)/);
  assert.match(line, /stroke-width: 2\.5;/);
  assert.match(line, /stroke-linecap: round;/);
  assert.match(line, /drop-shadow\(0 0 3px rgb\(255 255 255 \/ 0\.85\)\) drop-shadow\(0 0 6px rgb\(255 255 255 \/ 0\.45\)\)/);
  assert.match(line, /animation: bc-sync-line-slide 1\.6s linear infinite/);
  assert.match(line, /prefers-reduced-motion: reduce/);
  assert.match(line, /logbook\.syncProgress\?\.fraction/);
  assert.doesNotMatch(line, /LinearWavyProgress/);
  assert.doesNotMatch(line, /#[0-9a-fA-F]{3,6}/, 'colours are --bc-* variables');
});
