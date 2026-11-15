// « Une question ? À propos et contact » on the first-launch screens (task 2026-11-15-219, beta).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const src = (path) => readFileSync(new URL(`../../app/src/${path}`, import.meta.url), 'utf8');
const lookup = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);

test('the keys exist in French and English', () => {
  for (const lang of ['fr', 'en']) {
    const json = JSON.parse(src(`i18n/${lang}.json`));
    for (const key of ['question', 'link', 'label']) {
      assert.ok(lookup(json, `welcomeHelp.${key}`), `${lang}: welcomeHelp.${key}`);
    }
  }
  assert.equal(JSON.parse(src('i18n/fr.json')).welcomeHelp.question, 'Une question ?');
  assert.equal(JSON.parse(src('i18n/en.json')).welcomeHelp.link, 'About and contact');
});

test('the component links to /about and only the link text is underlined', () => {
  const c = src('components/WelcomeHelpLink.svelte');
  assert.match(c, /href="\/about"/);
  assert.match(c, /navigate\('\/about'\)/);
  assert.match(c, /class="od-welcome-help-link"/);
  assert.match(c, /welcomeHelp\.label/);
  assert.match(c, /od-welcome-help-link--link\s*\{\s*text-decoration: underline/);
  assert.match(c, /cursor: pointer/);
  assert.match(c, /:hover/);
});

test('every first-launch screen includes it', () => {
  assert.match(src('pages/WelcomeStart.svelte'), /<WelcomeHelpLink \/>/);
  assert.equal(src('pages/WelcomeStart.svelte').match(/<WelcomeHelpLink \/>/g).length, 2, 'Android and iOS branches');
  assert.match(src('components/EditorialPage.svelte'), /\{#if helpLink\}<WelcomeHelpLink \/>\{\/if\}/);
  for (const page of ['SignIn', 'CreateAccount', 'ConfirmCode', 'GitRepository']) {
    assert.match(src(`pages/${page}.svelte`), /helpLink=\{welcome\}/, page);
  }
});

test('its colour is the secondary text colour, #4B4A47 in light', () => {
  assert.match(src('theme.css'), /--od-text-2: #4B4A47;/);
  assert.match(src('components/WelcomeHelpLink.svelte'), /color: var\(--od-text-2\)/);
});
