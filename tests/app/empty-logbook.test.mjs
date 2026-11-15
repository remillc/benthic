// The empty logbook (task 2026-11-15-204): the profile, the title, the large
// pair button and the three option cards, read from the page's source and the
// translation files (the page itself needs Framework7 and a WebView).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../app/src/', import.meta.url);
const page = readFileSync(new URL('pages/Logbook.svelte', root), 'utf8');
const langs = Object.fromEntries(['fr', 'en'].map((l) => [l, JSON.parse(readFileSync(new URL(`i18n/${l}.json`, root), 'utf8'))]));
const empty = page.slice(page.indexOf('<div class="od-logbook--empty">'), page.indexOf('{:else if results && results.length === 0}'));

test('the empty logbook shows the profile, the title, the pair button and the options', () => {
  assert.match(empty, /<DecorativeProfile trace/);
  assert.match(empty, /logbook\.emptyTitle/);
  assert.match(empty, /od-logbook--empty-pair/);
  assert.match(empty, /logbook\.emptyPair/);
  assert.match(empty, /<nav class="od-logbook--empty-options" aria-label=\{t\('logbook\.emptyOthers'\)\}/);
});

test('the three cards are import, divelogs.de and manual entry, opening the old flows', () => {
  const keys = [...page.matchAll(/\{ key: '(\w+)', icon: '(\w+)', text: t\('logbook\.empty\w+'\), note/g)].map((m) => m[1]);
  assert.deepEqual(keys, ['import', 'divelogs', 'manual']);
  assert.match(page, /divelogs: '\/welcome\/import'/);
  assert.match(page, /manual: '\/dives\/new'/);
  assert.match(page, /if \(key === 'import'\) fileInput\?\.click\(\)/);
});

test('the illustration is ignored by TalkBack and the old note is gone', () => {
  assert.match(empty, /od-logbook--empty-illustration" aria-hidden="true"/);
  assert.doesNotMatch(page, /emptyNote/);
  for (const l of Object.values(langs)) assert.equal(l.logbook.emptyNote, undefined);
});

test('every text of the screen exists in French and English', () => {
  const used = [...empty.matchAll(/logbook\.(empty\w+)/g)].map((m) => m[1]);
  const choices = [...page.matchAll(/t\('logbook\.(empty\w+)'\)/g)].map((m) => m[1]);
  for (const k of new Set([...used, ...choices])) {
    for (const l of Object.values(langs)) assert.ok(l.logbook[k], k);
  }
  assert.equal(langs.fr.logbook.emptyTitle, "Aucune plongée pour l'instant");
  assert.equal(langs.en.logbook.emptyOthers, 'Other ways to add dives');
});
