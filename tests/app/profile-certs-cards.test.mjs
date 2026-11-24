// Task 2026-11-24-381: certifications drawn as cards; no back arrow at the top of « Mon profil de plongeur ».
// Task 2026-11-24-380: no screen asks for a health-data consent.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = new URL('../../app/src/', import.meta.url);
const read = (f) => readFileSync(new URL(f, app), 'utf8');

test('each certification is a card in the 85.6 x 54 ratio, the whole card is the link, the list is a list', () => {
  const page = read('pages/ProfileCerts.svelte');
  assert.match(page, /aspect-ratio: 85\.6 \/ 54/);
  assert.match(page, /border-radius: 14px/);
  assert.match(page, /role="list"/);
  assert.match(page, /role="listitem"/);
  assert.match(page, /minmax\(300px, 1fr\)/);
  assert.match(page, /aria-label=\{cardLabel\(doc\)\}/);
  const theme = read('theme.css');
  for (const [from, to] of [['blue', ['#1A5A99', '#0B2A4A']], ['green', ['#2A8A5C', '#123F2A']]]) {
    assert.ok(theme.includes(`--bc-cert-${from}-from: ${to[0]}`) && theme.includes(`--bc-cert-${from}-to: ${to[1]}`), from);
  }
  for (const lang of ['fr', 'en']) {
    const card = JSON.parse(read(`i18n/${lang}.json`)).docs.card;
    for (const k of ['list', 'type', 'number', 'numberAria', 'note']) assert.ok(card[k], `${lang}.docs.card.${k}`);
  }
});

test('the profile home has no back arrow', () => {
  assert.doesNotMatch(read('pages/ProfileDiver.svelte'), /BackLink|navbar-back|backLink/);
  assert.doesNotMatch(read('components/ProfileNav.svelte'), /BackLink|icon-back/);
});

test('no screen or API asks for or mentions a health-data consent', () => {
  assert.doesNotMatch(read('lib/server-api.js'), /health-consent|healthConsent|consentOf/);
  for (const lang of ['fr', 'en']) assert.doesNotMatch(read(`i18n/${lang}.json`), /health-consent|Retirer l’accord|Withdraw (my )?consent/i);
});
