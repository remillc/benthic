// Language menu on the desktop first-launch screen (task 2026-11-16-246).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { languageOptions, currentLanguageName } from '../../app/src/lib/language-menu.js';
import { placeRowMenu } from '../../app/src/lib/row-menu.js';

const src = (path) => readFileSync(new URL(`../../app/src/${path}`, import.meta.url), 'utf8');
const lookup = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);

test('options: the system language first with its help line, then Français and English', () => {
  assert.deepEqual(languageOptions('en', 'fr', 'Comme le système'), [
    { value: 'system', label: 'Comme le système', example: 'Français' },
    { value: 'fr', label: 'Français' },
    { value: 'en', label: 'English' },
  ]);
  assert.equal(languageOptions('system', 'en', 'x')[0].example, 'English');
});

test('options: Français (Canada), which Settings offers, is listed only while it is chosen', () => {
  assert.ok(!languageOptions('fr', 'fr', 'x').some((o) => o.value === 'fr-CA'));
  assert.ok(languageOptions('fr-CA', 'fr', 'x').some((o) => o.value === 'fr-CA'));
});

test('the button names the chosen language, or the system one', () => {
  assert.equal(currentLanguageName('system', 'fr'), 'Français');
  assert.equal(currentLanguageName('en', 'fr'), 'English');
  assert.equal(currentLanguageName('fr-CA', 'fr'), 'Français (Canada)');
});

test('the menu opens above the button, right-aligned, 260 dp wide', () => {
  const button = { top: 860, bottom: 892, right: 1000 };
  const place = placeRowMenu(button, { width: 1440, height: 900 }, 160, { width: 260, above: true });
  assert.equal(place.width, 260);
  assert.equal(place.left, 740);
  assert.equal(place.up, true);
  assert.equal(place.bottom, 900 - 860 + 4);
});

test('the menu is the Settings one and sets the same setting', () => {
  const menu = src('components/DesktopLanguageMenu.svelte');
  assert.match(menu, /import RowMenu from '\.\/RowMenu\.svelte'/);
  assert.match(menu, /setAppSetting\('language'/);
  assert.match(menu, /aria-haspopup="listbox"/);
  assert.match(menu, /aria-expanded=\{open\}/);
  assert.match(menu, /width=\{260\}/);
  const settings = src('pages/Settings.svelte');
  assert.match(settings, /setAppSetting\('language'/);
  const row = src('components/RowMenu.svelte');
  assert.match(row, /role="listbox"/);
  assert.match(row, /role="option"/);
  assert.match(row, /aria-selected=/);
});

test('the menu shows only on the desktop first launch', () => {
  const start = src('pages/WelcomeStart.svelte');
  assert.match(start, /\{#if desktopApp\}\s*<!--[^>]*-->\s*<div class="bc-welcome-start--footer"><WelcomeHelpLink inline \/><DesktopLanguageMenu \/>/);
  for (const other of ['pages/WelcomeStep.svelte', 'components/DesktopLogbookStart.svelte']) {
    try {
      assert.doesNotMatch(src(other), /DesktopLanguageMenu/);
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  }
});

test('colour token with a dark value, and the keys in both languages', () => {
  const theme = src('theme.css');
  assert.equal(theme.match(/--bc-language-divider:/g).length, 2);
  for (const lang of ['fr', 'en']) {
    const json = JSON.parse(src(`i18n/${lang}.json`));
    for (const key of ['system', 'button']) assert.ok(lookup(json, `desktopLanguage.${key}`), `${lang}: ${key}`);
  }
});
