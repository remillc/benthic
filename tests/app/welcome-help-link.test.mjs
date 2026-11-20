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
  assert.match(c, /class="bc-welcome-help-link"/);
  assert.match(c, /welcomeHelp\.label/);
  assert.match(c, /bc-welcome-help-link--link\s*\{\s*text-decoration: underline/);
  assert.match(c, /cursor: pointer/);
  assert.match(c, /:hover/);
});

test('every first-launch screen includes it', () => {
  assert.match(src('pages/WelcomeStart.svelte'), /<WelcomeHelpLink \/>/);
  assert.equal(src('pages/WelcomeStart.svelte').match(/<WelcomeHelpLink \/>/g).length, 2, 'Android and iOS branches');
  // Under the page (phone), or the last item of the scrolling column beside the blue panel (task 2026-11-16-257).
  assert.match(src('components/EditorialPage.svelte'), /\{#if helpLink && !panel\}<WelcomeHelpLink \/>\{\/if\}/);
  assert.match(src('components/EditorialPage.svelte'), /\{#if helpLink\}<WelcomeHelpLink inColumn \/>\{\/if\}/);
  for (const page of ['SignIn', 'CreateAccount', 'ConfirmCode', 'GitRepository']) {
    assert.match(src(`pages/${page}.svelte`), /helpLink=\{welcome\}/, page);
  }
});

test('its colour is the secondary text colour, #4B4A47 in light', () => {
  assert.match(src('theme.css'), /--bc-text-2: #4B4A47;/);
  assert.match(src('components/WelcomeHelpLink.svelte'), /color: var\(--bc-text-2\)/);
});

test('Android phone: the link ends the page, 12 dp under the git link and 20 dp above the bottom edge (task 2026-11-16-243)', () => {
  const welcome = src('pages/WelcomeStart.svelte');
  const link = src('components/WelcomeHelpLink.svelte');
  // The link is inside the Android page, after the actions (the git link), so it follows it.
  assert.match(welcome, /<\/div>\s*<!--[^>]*-->\s*\{#if desktopApp\}[\s\S]*?\{:else\}\s*<WelcomeHelpLink \/>\s*\{\/if\}\s*<\/div>\s*\{:else\}/);
  // 20 dp above the edge on the phone; the page content has no bottom padding of its own there.
  assert.match(welcome, /:global\(\.bc-welcome-start--phone\) \{\s*--bc-help-link-bottom: 20px;[\s\S]*?padding-bottom: 0;/);
  assert.match(link, /margin: 0 auto calc\(var\(--f7-safe-area-bottom\) \+ var\(--bc-help-link-bottom, 28px\)\)/);
  // 12 dp between the git link's text and the help link: 6 dp of padding + 6 dp of margin under an 18 dp line.
  assert.match(welcome, /:global\(\.bc-welcome-start--phone\) \.bc-welcome-start--git-link \{\s*min-height: 0;\s*padding: 6px 12px;\s*margin-bottom: 6px;/);
});

test('tablet: the link stays pinned 28 dp above the bottom edge, iOS keeps its placement', () => {
  const link = src('components/WelcomeHelpLink.svelte');
  assert.match(link, /@media \(min-width: 768px\) \{\s*position: absolute;[\s\S]*?bottom: calc\(var\(--f7-safe-area-bottom\) \+ 28px\);/);
  const welcome = src('pages/WelcomeStart.svelte');
  const ios = welcome.slice(welcome.indexOf('{:else}'));
  assert.match(ios, /<\/a>\s*<WelcomeHelpLink \/>\s*\{\/if\}/);
});
