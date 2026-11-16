// The release edition's first launch on Android phones (task 2026-11-16-227; mock-ups
// docs/mockups/android-premier-lancement-production*.dc.html): the phone layout is chosen by the width, the texts that
// name the device have a phone variant, the release screen shows on a phone, and the formats dialog stacks its cards.
// The screens need Framework7 and a WebView: their CSS and markup are read from the source.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PHONE_QUERY, BAND_HEIGHT, deviceKey } from '../../app/src/lib/first-launch-phone.js';

const root = new URL('../../app/src/', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const langs = Object.fromEntries(['fr', 'en'].map((l) => [l, JSON.parse(read(`i18n/${l}.json`))]));
const components = [
  'pages/WelcomeStartRelease.svelte',
  'components/FirstLaunchSteps.svelte',
  'components/FirstLaunchGit.svelte',
  'components/FirstLaunchWebdav.svelte',
  'components/FirstLaunchDivelogs.svelte',
  'components/ReleaseProfile.svelte',
];

test('the phone layout is chosen by the width, the same one as layout.phone', () => {
  assert.match(read('lib/layout.svelte.js'), /matchMedia\('\(max-width: 767\.98px\)'\)/);
  assert.equal(PHONE_QUERY, '(max-width: 767.98px)');
  for (const file of components) {
    const queries = [...read(file).matchAll(/@media \(max-width: ([\d.]+)px\)/g)].map((m) => m[1]);
    assert.ok(queries.length, `${file} has a phone block`);
    for (const width of queries) assert.equal(width, '767.98', file);
  }
});

test('the blue band is 330 dp on the first step and 96 dp on the others, the status bar included', () => {
  assert.deepEqual({ ...BAND_HEIGHT }, { start: 330, compact: 96 });
  const page = read('pages/WelcomeStartRelease.svelte');
  assert.match(page, /min-height: calc\(330px - 24px \+ max\(var\(--f7-safe-area-top, 0px\), 24px\)\)/);
  assert.match(page, /min-height: calc\(96px - 24px \+ max\(var\(--f7-safe-area-top, 0px\), 24px\)\)/);
  // First step: logo 40 dp, name 24 sp, headline 26 sp, line 14 sp; other steps: logo 32 dp, name 20 sp.
  for (const piece of [/width: 40px;\s+height: 40px/, /width: 32px;\s+height: 32px/, /font-size: 26px/, /font-size: 14px;\s+line-height: 20px/]) {
    assert.match(page, piece);
  }
});

test('the column has 20 dp of padding, starts at the top, has 24 sp titles and full-width buttons', () => {
  const steps = read('components/FirstLaunchSteps.svelte');
  const phone = steps.slice(steps.lastIndexOf('@media (max-width: 767.98px)'));
  assert.match(phone, /padding: 16px 20px 0/);
  assert.match(phone, /od-first-launch--first \{\s+padding-top: 20px/);
  assert.match(phone, /od-first-launch--step \{\s+align-self: start/);
  assert.match(phone, /od-first-launch--title \{\s+font-size: 24px/);
  assert.match(phone, /od-first-launch--action \{\s+align-self: stretch/);
  // The link band: 64 dp tiles, a 56 dp line.
  assert.match(phone, /od-first-launch--hero-tile \{\s+width: 64px;\s+height: 64px/);
  assert.match(phone, /od-first-launch--hero-link \{\s+flex: none;\s+width: 56px/);
  // The help link follows the content (and sits at the bottom of the screen when there is room).
  assert.match(phone, /od-welcome-help-link\) \{\s+margin: auto auto/);
  for (const file of ['components/FirstLaunchGit.svelte', 'components/FirstLaunchWebdav.svelte', 'components/FirstLaunchDivelogs.svelte']) {
    assert.match(read(file), /@media \(max-width: 767\.98px\)[^]*align-self: stretch/, file);
  }
});

test('the profile of the band has no dot and no chips on a phone', () => {
  assert.match(
    read('components/ReleaseProfile.svelte'),
    /@media \(max-width: 767\.98px\) \{\s+\.od-release-profile--dot,\s+\.od-release-profile--chip \{\s+display: none/,
  );
});

test('texts that name the device: « ce téléphone » on a phone, « cette tablette » on a tablet', () => {
  assert.equal(deviceKey('welcomeSteps.deviceTitle', true), 'welcomeSteps.deviceTitlePhone');
  assert.equal(deviceKey('welcomeSteps.deviceTitle', false), 'welcomeSteps.deviceTitle');
  const wanted = {
    fr: { deviceTitle: 'Seulement sur ce téléphone', gitTokenHelp: 'Le jeton reste sur ce téléphone.' },
    en: { deviceTitle: 'Only on this phone', gitTokenHelp: 'The token stays on this phone.' },
  };
  for (const lang of ['fr', 'en']) {
    const steps = langs[lang].welcomeSteps;
    for (const key of ['deviceTitle', 'deviceHelp', 'gitTokenHelp', 'webdavHelp']) {
      assert.ok(steps[`${key}Phone`], `${lang} ${key}Phone`);
      assert.match(steps[`${key}Phone`], /téléphone|phone/);
      assert.doesNotMatch(steps[`${key}Phone`], /tablette|tablet/i);
      assert.match(steps[key], /tablette|tablet/);
    }
    assert.equal(steps.deviceTitlePhone, wanted[lang].deviceTitle);
    assert.equal(steps.gitTokenHelpPhone, wanted[lang].gitTokenHelp);
  }
  assert.ok(langs.fr.welcomeSteps.webdavHelpPhone.endsWith('Il reste sur ce téléphone.'));
  // The components choose the key by layout.phone.
  const steps = read('components/FirstLaunchSteps.svelte');
  assert.match(steps, /deviceKey\('welcomeSteps\.deviceTitle', layout\.phone\)/);
  assert.match(steps, /deviceKey\('welcomeSteps\.deviceHelp', layout\.phone\)/);
  assert.match(read('components/FirstLaunchGit.svelte'), /deviceKey\('welcomeSteps\.gitTokenHelp', layout\.phone\)/);
  assert.match(read('components/FirstLaunchWebdav.svelte'), /deviceKey\('welcomeSteps\.webdavHelp', layout\.phone\)/);
});

test('the release edition shows its own screen on a phone, not the beta screen', () => {
  const entry = read('pages/WelcomeEntry.svelte');
  assert.match(entry, /<WelcomeStartRelease \{f7router\} \/>/);
  assert.doesNotMatch(entry, /layout\.phone|<WelcomeStart /);
  assert.match(read('App.svelte'), /component: isRelease \? WelcomeEntry : WelcomeStart/);
});

test('the formats dialog is 358 dp wide on a phone, the cards stacked and scrolling inside, « Fermer » kept', () => {
  const formats = read('components/ImportFormats.svelte');
  assert.match(formats, /@media \(max-width: 767px\) \{[^]*width: min\(358px, calc\(100% - 32px\)\)[^]*max-height: min\(780px, calc\(100% - 64px\)\)/);
  assert.match(formats, /flex-direction: column;\s+align-items: stretch/);
  // The content scrolls, the actions row does not: « Fermer » stays visible.
  assert.match(read('components/Md3Dialog.svelte'), /od-md3-dialog--content \{\s+flex: 1;\s+min-height: 0;\s+overflow-y: auto/);
  assert.match(formats, /dialog\.close/);
});

test('the formats link is a 48 dp target under « Un fichier »', () => {
  assert.match(read('components/ImportFormats.svelte'), /od-import-formats--link \{[^}]*min-height: 48px/);
  const steps = read('components/FirstLaunchSteps.svelte');
  assert.ok(steps.indexOf('welcomeSteps.fileTitle') < steps.indexOf('<ImportFormats />'));
  assert.ok(steps.indexOf('welcomeSteps.divelogsTitle', steps.indexOf('<ImportFormats />')) > 0);
});

test('the tablet layout is untouched: the phone sizes are only inside the max-width media blocks', () => {
  for (const file of components) {
    const src = read(file);
    const at = src.indexOf('@media (max-width: 767.98px)');
    assert.ok(at > 0, file);
    assert.doesNotMatch(src.slice(0, at), /ce téléphone|330px|96px - 24px/, file);
  }
});
