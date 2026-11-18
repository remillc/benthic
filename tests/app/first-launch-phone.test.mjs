// The release edition's first launch on Android phones (task 2026-11-16-227; mock-ups
// docs/mockups/android-premier-lancement-production*.dc.html): the phone layout is chosen by the width, the texts that
// name the device have a phone variant, the release screen shows on a phone, and the formats dialog stacks its cards.
// The screens need Framework7 and a WebView: their CSS and markup are read from the source.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PHONE_QUERY, BAND_HEIGHT, deviceKey, deviceKind } from '../../app/src/lib/first-launch-phone.js';

const root = new URL('../../app/src/', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const html = readFileSync(new URL('../index.html', root), 'utf8');
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

test('the blue band is 330 dp on the first step and 140 dp on the others, the status bar included (task 244: 108 before)', () => {
  assert.deepEqual({ ...BAND_HEIGHT }, { start: 330, compact: 140 });
  const page = read('pages/WelcomeStartRelease.svelte');
  assert.match(page, /min-height: calc\(330px - 24px \+ var\(--od-welcome-band-top\)\)/);
  assert.match(page, /min-height: calc\(140px - 24px \+ var\(--od-welcome-band-top\)\)/);
  assert.match(page, /--od-welcome-band-top: max\(var\(--f7-safe-area-top, 0px\), 24px\)/);
  // First step: logo 40 dp, name 24 sp, headline 26 sp, line 14 sp; other steps: logo 32 dp, name 20 sp.
  for (const piece of [/width: 40px;\s+height: 40px/, /width: 32px;\s+height: 32px/, /font-size: 26px/, /font-size: 14px;\s+line-height: 20px/]) {
    assert.match(page, piece);
  }
});

test('the column has 20 dp of padding, starts at the top, has 24 sp titles and full-width buttons', () => {
  const steps = read('components/FirstLaunchSteps.svelte');
  const phone = steps.slice(steps.lastIndexOf('@media (max-width: 767.98px)'));
  assert.match(phone, /padding: 16px 16px 0/);
  assert.match(phone, /od-first-launch--first \{\s+padding-top: 20px/);
  assert.match(phone, /od-first-launch--step \{\s+align-self: start/);
  assert.match(phone, /od-first-launch--title \{\s+font-size: 24px/);
  assert.match(phone, /od-first-launch--action,\s+\.od-first-launch--action\.od-first-launch--action-centre \{\s+align-self: stretch/);
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

test("the welcome hero is the alpha's hatched dark blue; the steps band takes the section band's look (tasks 244, 251)", () => {
  const page = read('pages/WelcomeStartRelease.svelte');
  assert.doesNotMatch(page, /SectionBand|layout\.phone|release-band-gradient/);
  const theme = read('theme.css');
  assert.doesNotMatch(theme, /--od-release-band-gradient/);
  const token = (name) => theme.match(new RegExp(`${name}: ([^;]*);`))[1];
  assert.equal(token('--od-first-band'), 'linear-gradient(180deg, #2A6FB0 0%, #1F5C99 22%, #0C3866 70%, #072A4D 100%)');
  assert.equal(token('--od-first-band-sheen'), 'radial-gradient(ellipse 70% 45% at 22% 0%, rgb(255 255 255 / 0.22), rgb(255 255 255 / 0) 70%)');
  assert.equal(token('--od-first-band-hatch'), 'repeating-linear-gradient(105deg, rgb(255 255 255 / 0.035) 0 60px, rgb(255 255 255 / 0) 60px 150px)');
  // Task 251: the section band's radial gradient, its light centre at -40 %.
  assert.equal(token('--od-first-step-band'), 'radial-gradient(140% 115% at 38% -40%, #A9C4E2 0%, #7199C2 25%, #5584B5 37%, #2D5E90 59%, #114477 86%)');
  const phone = page.slice(page.lastIndexOf('@media (max-width: 767.98px)'));
  // The hero (330 dp) keeps the hatched blue, its sheen and its hatching.
  assert.match(phone, /background: var\(--od-first-band\);/);
  assert.match(phone, /od-welcome-release--panel-light \{\s+background: var\(--od-first-band-sheen\)/);
  assert.match(phone, /od-welcome-release--panel-bands \{\s+background: var\(--od-first-band-hatch\)/);
  // The steps band: gradient, no sheen, the faint profile (10 % area, 30 % line, 1.5 dp) and the 18 dp wave in the page colour.
  assert.match(phone, /od-welcome-release--compact \{\s+height: auto;\s+min-height: calc\(140px[^;]*;\s+background: var\(--od-first-step-band\)/);
  assert.match(phone, /od-welcome-release--compact \.od-welcome-release--panel-light \{\s+display: none/);
  assert.match(phone, /fill: var\(--od-band-profile-area\)/);
  assert.match(phone, /stroke: var\(--od-band-profile-line\);\s+stroke-width: 1\.5/);
  assert.match(phone, /od-welcome-release--panel-wave \{\s+display: block;[^}]*height: 18px/);
  assert.match(phone, /od-welcome-release--panel-wave path \{\s+fill: var\(--od-background\)/);
  assert.match(page, /M0 11 Q37\.5 2 75 11 T150 11 T225 11 T300 11 V18 H0 Z/);
  assert.equal(token('--od-band-profile-area'), 'rgb(255 255 255 / 0.1)');
  assert.equal(token('--od-band-profile-line'), 'rgb(255 255 255 / 0.3)');
  // Neither the profile nor the wave shows outside a phone step band.
  assert.match(page, /\.od-welcome-release--panel-profile,\s+\.od-welcome-release--panel-wave \{\s+display: none/);
  // The rays fade out at 55 % of the height (the tablet panel's rule, shared).
  assert.match(page, /mask-image: linear-gradient\(180deg, black 0%, transparent 55%\)/);
});

test('the sign-in hint reads on two lines, centred; the sign-in button is centred on a tablet', () => {
  for (const lang of ['fr', 'en']) {
    const hint = langs[lang].welcomeSteps.connectHint;
    assert.equal(hint.split('\n').length, 2, lang);
    assert.doesNotMatch(hint, /navigateur|browser/i, lang);
  }
  assert.equal(langs.fr.welcomeSteps.connectHint, 'La page de connexion du service s’ouvre.\nVous revenez ici ensuite.');
  const steps = read('components/FirstLaunchSteps.svelte');
  assert.match(steps, /od-first-launch--hint \{\s+align-self: center;[^}]*text-align: center;\s+white-space: pre-line/);
  assert.match(steps, /od-first-launch--action\.od-first-launch--action-centre \{\s+align-self: center/);
  // On a phone the button takes the column's width again.
  const phone = steps.slice(steps.lastIndexOf('@media (max-width: 767.98px)'));
  assert.match(phone, /od-first-launch--action\.od-first-launch--action-centre \{\s+align-self: stretch/);
});

test('the progress bar stays inside its card', () => {
  const divelogs = read('components/FirstLaunchDivelogs.svelte');
  assert.match(divelogs, /od-first-launch-divelogs--bar \{\s+min-width: 0;\s+max-width: calc\(100% - 42px\);\s+overflow: hidden/);
});

test('texts that name the device: « ce téléphone » on a phone, « cette tablette » on a tablet', () => {
  assert.equal(deviceKey('welcomeSteps.deviceTitle', deviceKind({ phone: true })), 'welcomeSteps.deviceTitlePhone');
  assert.equal(deviceKey('welcomeSteps.deviceTitle', deviceKind({ phone: false })), 'welcomeSteps.deviceTitle');
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
  // The first step's choice (task 2026-11-17-263); the texts of « Seulement sur ce téléphone » stay for the server screens' « Où le garder ? ».
  assert.match(steps, /deviceKey\('welcomeSteps\.localTitle', kind\)/);
  assert.equal(langs.fr.welcomeSteps.localTitlePhone, 'Commencer un carnet sur ce téléphone');
  assert.equal(langs.fr.welcomeSteps.localTitleIphone, 'Commencer un carnet sur cet iPhone');
  assert.equal(langs.fr.welcomeSteps.localTitle, 'Commencer un carnet sur cette tablette');
  assert.equal(langs.fr.welcomeSteps.localTitleDesktop, 'Commencer un carnet sur cet ordinateur');
  assert.match(read('components/FirstLaunchGit.svelte'), /deviceKey\('welcomeSteps\.gitTokenHelp', deviceKind\(\{ phone: layout\.phone, ios, desktop: desktopApp \}\)\)/);
  assert.match(read('components/FirstLaunchWebdav.svelte'), /deviceKey\('welcomeSteps\.webdavHelp', kind\)/);
  // One kind for every device: the desktop app first, then the iPhone, then the phone, else the tablet.
  assert.match(steps, /const kind = \$derived\(deviceKind\(\{ phone: layout\.phone, ios, desktop: desktopApp \}\)\)/);
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

test('the cascade layer order is declared first in the document, before any built stylesheet (spacing bug of task 263)', () => {
  // The build links the shared chunk's CSS, which only names od.components, before the main CSS: without this line that
  // layer comes first, so lowest, and Framework7's rules (p { margin: 1em 0 } ...) beat every component's.
  const order = html.match(/@layer\s+([^;]+);/);
  assert.ok(order, 'index.html declares the layer order');
  assert.deepEqual(order[1].split(',').map((x) => x.trim()), ['framework7', 'maplibre', 'od.tokens', 'od.base', 'od.components']);
  const theme = read('theme.css').match(/^@layer\s+([^;]+);/m);
  assert.equal(order[1].replace(/\s/g, ''), theme[1].replace(/\s/g, ''));
  assert.ok(html.indexOf('@layer') < (html.indexOf('/src/main.js')));
});

test('first step spacing: the mock-up vertical distances (title, choices, text buttons, help link)', () => {
  const steps = read('components/FirstLaunchSteps.svelte');
  // 20 dp under the band, the title 6 + the choices 14 = 20 dp apart, the choices 12 dp apart.
  assert.match(steps, /\.od-first-launch--first \{\s*padding-top: 20px;/);
  assert.match(steps, /\.od-first-launch--rows \{\s*display: flex;\s*flex-direction: column;\s*gap: 12px;/);
  assert.match(steps, /\.od-first-launch--title \{\s*margin: 0 0 6px;/);
  assert.match(steps, /\.od-first-launch--rows-start \{\s*margin-top: 14px;/);
  // Text buttons: 40 dp high, 12 dp side padding, 8 dp apart, 16 dp above and below the group.
  assert.match(steps, /\.od-first-launch--text-buttons \{[^}]*gap: 8px;\s*margin: 16px 0;/);
  assert.match(steps, /\.od-first-launch--text-button \{[^}]*height: 40px;\s*padding: 0 12px;/);
  // The help link takes the spare height above it (auto margin) and ends 20 dp above the system bar on Android.
  assert.match(steps, /margin: auto auto calc\(var\(--f7-safe-area-bottom\) \+ 28px\);\s*padding-top: 24px;/);
  assert.match(steps, /:global\(\.md\) \.od-first-launch :global\(\.od-welcome-help-link\) \{\s*margin-bottom: calc\(max\(var\(--f7-safe-area-bottom\), 24px\) \+ 20px\);/);
  // The band: 330 dp including the status bar, the intro 8 dp under the headline.
  const page = read('pages/WelcomeStartRelease.svelte');
  assert.match(page, /min-height: calc\(330px - 24px \+ var\(--od-welcome-band-top\)\)/);
  assert.match(page, /\.od-welcome-release--intro \{[^}]*margin: 8px 0 0;/);
});
