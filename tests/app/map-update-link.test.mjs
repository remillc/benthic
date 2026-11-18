// Todo 89: in the account sheet, the message about a map update opens the offline maps part of
// Réglages, not Réglages' first screen.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (p) => readFileSync(new URL(`../../app/src/${p}`, import.meta.url), 'utf8');
const sheet = read('components/AccountSheet.svelte');
const nav = read('lib/navigation.svelte.js');

test('both variants of the sheet have a row of their own for the update, opening the maps', () => {
  assert.equal([...sheet.matchAll(/go\(openMapSettings\)/g)].length, 2, 'Android and iPhone');
  assert.equal([...sheet.matchAll(/\{t\('nav\.mapUpdateWaiting'\)\}/g)].length, 2);
  // The message is no longer a line of the Réglages row.
  assert.doesNotMatch(sheet, /\{t\('settings\.title'\)\}\s*\{#if mapUpdates/);
});

test('openMapSettings opens Réglages first (no animation), then /settings/maps/', () => {
  const body = nav.slice(nav.indexOf('export async function openMapSettings'));
  assert.match(body, /openOver\('\/settings\/', \{ animate: false \}\)/);
  assert.match(body, /openOver\('\/settings\/maps\/'\)/);
  assert.ok(body.indexOf("'/settings/'") < body.indexOf("'/settings/maps/'"));
});

test('the maps screen is an over path, so leaving it closes it with Réglages', () => {
  assert.match(nav, /isOverPath = \(path\) => path\.startsWith\('\/settings\/'\)/);
});
