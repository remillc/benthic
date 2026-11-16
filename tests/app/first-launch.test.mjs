// The alpha first launch on Android phones, in the new style (task 2026-11-16-233, with 234, 235 and 236):
// which screens, the step order of each path, the « sans compte » screen, the snackbars and the phone / tablet
// split. The screens need Framework7 and a WebView: they are read from their source and the language files.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { FIRST_LAUNCH_SNACKBARS, FIRST_LAUNCH_SNACKBARS_TABLET, deviceKey, downloadSteps, newFirstLaunch, transferCount } from '../../app/src/lib/first-launch.js';

const root = new URL('../../app/src/', import.meta.url);
const read = (f) => readFileSync(new URL(f, root), 'utf8');
const langs = { fr: JSON.parse(read('i18n/fr.json')), en: JSON.parse(read('i18n/en.json')) };
const get = (o, key) => key.split('.').reduce((a, k) => a?.[k], o);
const welcome = read('pages/WelcomeStart.svelte');
const signIn = read('pages/SignIn.svelte');
const create = read('pages/CreateAccount.svelte');
const confirm = read('pages/ConfirmCode.svelte');
const download = read('pages/FirstDownload.svelte');
const local = read('pages/WithoutAccount.svelte');
const editorial = read('components/EditorialPage.svelte');
const band = read('components/FirstLaunchBand.svelte');
const app = read('App.svelte');
const theme = read('theme.css');

test('the new style is for an Android phone only: a tablet and iOS keep their screens', () => {
  assert.equal(newFirstLaunch({ phone: true, ios: false }), true);
  // Task 239: a tablet takes the new style too (the blue panel); only iOS keeps its screens.
  assert.equal(newFirstLaunch({ phone: false, ios: false }), true);
  assert.equal(newFirstLaunch({ phone: true, ios: true }), false);
  assert.equal(newFirstLaunch({ phone: false, ios: true }), false);
  // The welcome screen: the band on a phone, the panel of task 237 on a tablet; iOS has its own branch.
  assert.match(welcome, /\{#if band\}\s*<!--[^>]*-->\s*<FirstLaunchBand variant="welcome" \/>\s*\{:else\}\s*<!--[^>]*-->\s*<FirstLaunchPanel \{playKey\} \/>/);
  // The steps: the band and « Retour » only when the page says firstLaunch, on an Android phone.
  assert.match(editorial, /const band = \$derived\(firstLaunch && !ios && phone\)/);
  for (const page of [signIn, create, confirm, download, local]) assert.match(page, /firstLaunch/);
  // « Utiliser mon propre dépôt git » keeps its screens: it does not ask for the band.
  assert.doesNotMatch(read('pages/GitRepository.svelte'), /firstLaunch/);
});

test('the welcome screen sends Android (phone and, since task 239, tablet) to the « sans compte » screen; iOS starts the logbook', () => {
  assert.match(welcome, /if \(!theme\.ios\) f7router\.navigate\('\/welcome\/local'\);\s*else startWithoutAccount\(\);/);
  assert.match(app, /path: '\/welcome\/local', component: WithoutAccount/);
  assert.match(app, /path: '\/welcome\/downloading', component: FirstDownload/);
});

test('sign in: the download screen comes between the sign-in and the logbook', () => {
  assert.match(signIn, /if \(result\.exists && look\) f7router\.navigate\('\/welcome\/downloading'/);
  assert.match(signIn, /else if \(result\.exists\) finishAccount\(/);
  // An account without a logbook still goes to « Reprendre votre carnet ? ».
  assert.match(signIn, /\/import`, \{ props: \{ signedIn: true \} \}/);
  assert.match(create, /if \(signedIn\.exists && look\) f7router\.navigate\('\/welcome\/downloading'/);
  assert.match(download, /downloadAccountLogbook\(\(\) => cancelled\)\.then\(\(ok\) => \{\s*if \(ok\) announceFirstLaunch\('downloaded'\)/);
  assert.match(download, /f7router\.back\('\/welcome\/sign-in', \{ force: true \}\)/);
});

test('create an account: step 1 of 2, then the code as step 2 of 2, then the empty logbook with its snackbar', () => {
  assert.match(create, /step=\{t\('createAccount\.step1'\)\}/);
  assert.match(confirm, /step=\{t\('createAccount\.step2'\)\}/);
  assert.doesNotMatch(confirm, /step1/);
  for (const l of ['fr', 'en']) {
    assert.match(langs[l].createAccount.step1, /1/);
    assert.match(langs[l].createAccount.step2, /2/);
  }
  // On a phone the code leads to the new logbook (no choice of source), and says so.
  assert.match(confirm, /if \(look\) \{[\s\S]*createLog\(\{ source: onDevice \? 'device' : 'empty' \}\)[\s\S]*await accountReady\(\);\s*announceFirstLaunch\('created'\);\s*\} else if \(welcome\) \{\s*f7router\.navigate\('\/welcome\/import'\)/);
});

test('« Commencer sans compte »: three rows, then « Commencer » creates the logbook and says so', () => {
  assert.match(local, /\{ key: 'phoneOnly', text: 'phoneOnlyText', icon: \{ phone: 'device', tablet: 'tablet', desktop: 'desktop' \}\[deviceKind\(\)\] \}/);
  assert.match(local, /\{ key: 'noBackup', text: deviceKey\('noBackupText', deviceKind\(\)\), icon: 'warning', warn: true \}/);
  assert.match(local, /\{ key: 'later', text: 'laterText', icon: 'link' \}/);
  assert.match(local, /await startWithoutAccount\(\);\s*announceFirstLaunch\('local'\);/);
  const fr = langs.fr.firstLaunch.local;
  assert.equal(fr.phoneOnly, 'Sur ce téléphone seulement');
  assert.equal(fr.noBackup, 'Sans sauvegarde');
  assert.equal(fr.later, 'Vous pourrez le relier plus tard');
  assert.equal(fr.start, 'Commencer');
  assert.equal(langs.en.firstLaunch.local.phoneOnly, 'On this phone only');
  // Tablet (task 239): « cette tablette » in the rows, a tablet icon.
  assert.equal(fr.phoneOnlyTablet, 'Sur cette tablette seulement');
  assert.equal(fr.noBackupTextTablet, 'Si vous perdez ou changez de tablette, le carnet est perdu.');
  assert.match(read('components/Icon.svelte'), /\btablet: 'M5 4h14/);
});

test('task 239: the tablet texts say « cette tablette », picked by deviceKey', () => {
  assert.equal(deviceKey('a.b', true), 'a.b');
  assert.equal(deviceKey('a.b', false), 'a.bTablet');
  // Task 242: the desktop app has its own variant, picked by deviceKind().
  assert.equal(deviceKey('a.b', 'phone'), 'a.b');
  assert.equal(deviceKey('a.b', 'tablet'), 'a.bTablet');
  assert.equal(deviceKey('a.b', 'desktop'), 'a.bDesktop');
  const fr = langs.fr.firstLaunch;
  assert.equal(fr.signIn.introTablet, 'Le même compte que dans Subsurface sur ordinateur. Vos plongées sont téléchargées, puis une copie reste sur cette tablette.');
  assert.equal(fr.signIn.passwordTextTablet, 'Gardé seulement dans le stockage sécurisé de cette tablette.');
  assert.equal(fr.download.copyTablet, 'Copie du carnet sur cette tablette');
  for (const k of ['signIn.introTablet', 'signIn.passwordTextTablet', 'download.copyTablet', 'local.phoneOnlyTablet', 'local.noBackupTextTablet']) {
    assert.ok(get(langs.en, `firstLaunch.${k}`), k);
    assert.doesNotMatch(get(langs.fr, `firstLaunch.${k}`), /téléphone/);
    assert.doesNotMatch(get(langs.en, `firstLaunch.${k}`), /phone/);
  }
  assert.match(read('pages/SignIn.svelte'), /deviceKey\('firstLaunch\.signIn\.intro', deviceKind\(\)\)/);
  assert.match(download, /deviceKey\('firstLaunch\.download\.copy', deviceKind\(\)\)/);
});

test('task 239: the tablet logbook opens with the snackbar at the bottom left and the subtitle of the path', () => {
  assert.deepEqual(Object.keys(FIRST_LAUNCH_SNACKBARS_TABLET).sort(), ['created', 'downloaded', 'local']);
  assert.equal(get(langs.fr, FIRST_LAUNCH_SNACKBARS_TABLET.downloaded), 'Carnet téléchargé. Il reste sur cette tablette, même sans réseau.');
  assert.equal(get(langs.fr, FIRST_LAUNCH_SNACKBARS_TABLET.created), 'Compte créé. Votre carnet est prêt.');
  assert.equal(get(langs.fr, FIRST_LAUNCH_SNACKBARS_TABLET.local), 'Carnet créé sur cette tablette.');
  for (const key of Object.values(FIRST_LAUNCH_SNACKBARS_TABLET)) assert.ok(get(langs.en, key), key);
  assert.match(read('lib/account.js'), /desktopApp \? FIRST_LAUNCH_SNACKBARS_DESKTOP : layout\.phone \? FIRST_LAUNCH_SNACKBARS : FIRST_LAUNCH_SNACKBARS_TABLET/);
  assert.match(read('lib/account.js'), /\{ placement: 'start' \}/);
  assert.match(read('lib/snackbar-logic.js'), /placement === 'start' \? 'od-snackbar-start'/);
  assert.match(read('theme.css'), /&\.od-snackbar-start \{\s*left: calc\(var\(--od-nav-width, 96px\) \+ 24px\);\s*right: auto;\s*bottom: calc\(24px \+ var\(--f7-safe-area-bottom\)\);/);
  assert.equal(langs.fr.logbook.emptyLocalTablet, 'Sur cette tablette seulement, aucune plongée');
  assert.ok(langs.en.logbook.emptyLocalTablet);
  assert.equal(langs.fr.logbook.emptyLocalDesktop, 'Sur cet ordinateur seulement, aucune plongée');
});

test('the snackbars of the three paths and the empty logbook line, in French and English', () => {
  assert.deepEqual(Object.keys(FIRST_LAUNCH_SNACKBARS).sort(), ['created', 'downloaded', 'local']);
  const fr = { downloaded: 'Carnet téléchargé. Il reste sur ce téléphone, même sans réseau.', created: 'Compte créé. Votre carnet est prêt.', local: 'Carnet créé sur ce téléphone.' };
  for (const [kind, key] of Object.entries(FIRST_LAUNCH_SNACKBARS)) {
    assert.equal(get(langs.fr, key), fr[kind]);
    assert.ok(get(langs.en, key), `${key} in English`);
  }
  assert.equal(langs.fr.logbook.emptyLocal, 'Sur ce téléphone seulement, aucune plongée');
  assert.match(read('pages/Logbook.svelte'), /else if !theme\.ios\}[\s\S]*deviceKey\('logbook\.emptyLocal', deviceKind\(\)\)/);
  assert.match(read('lib/account.js'), /showSnackbar\(t\(keys\[kind\]\), \{ placement: 'start' \}\)/);
});

test('every new text exists in French and English', () => {
  const keys = [];
  (function walk(o, p) {
    for (const [k, v] of Object.entries(o)) (typeof v === 'object' ? walk(v, `${p}${k}.`) : keys.push(p + k));
  })(langs.fr.firstLaunch, 'firstLaunch.');
  for (const key of keys) {
    assert.ok(get(langs.en, key), `${key} in English`);
    assert.ok(get(langs.fr, key), key);
  }
  // Every key the pages use.
  for (const m of (download + local).matchAll(/t\('(firstLaunch\.[\w.]+)'/g)) assert.ok(get(langs.fr, m[1]), m[1]);
});

test('the download: three steps from the sync progress, the count of what the core received', () => {
  assert.deepEqual(downloadSteps(null), { connect: 'running', dives: 'waiting', copy: 'waiting', value: 0 });
  assert.deepEqual(downloadSteps({ stage: 'connect', fraction: 0.15 }), { connect: 'done', dives: 'running', copy: 'waiting', value: 0 });
  const mid = downloadSteps({ stage: 'receive', fraction: 0.4 });
  assert.equal(mid.connect, 'done');
  assert.equal(mid.dives, 'running');
  assert.ok(Math.abs(mid.value - 0.5) < 1e-9);
  assert.deepEqual(downloadSteps({ stage: 'read', fraction: 0.85 }), { connect: 'done', dives: 'done', copy: 'running', value: 1 });
  assert.deepEqual(transferCount('Transfer from storage (184/312)'), { n: 184, total: 312 });
  assert.equal(transferCount('Transfer to storage (1/2)'), null);
  assert.equal(transferCount('Done syncing'), null);
  assert.equal(langs.fr.firstLaunch.download.count.replace('{n}', '184').replace('{total}', '312'), '184 sur 312');
});

test('the band: 330 dp on the welcome screen, 140 dp plus the status bar on a step, a straight edge, the badge 16 dp tall', () => {
  assert.match(band, /height: calc\(var\(--od-first-band-top\) \+ 140px\);/);
  assert.match(band, /\.od-first-launch-band--welcome \{\s*height: calc\(var\(--od-first-band-top\) \+ 306px\);/);
  // The step band is 140 dp under the status bar (task 236); the welcome band is 330 dp with it (24 + 306).
  assert.match(band, /--od-first-band-top: max\(var\(--f7-safe-area-top\), 24px\)/);
  // A step has no wave and no profile: the profile is drawn on the welcome band only, and no SectionBand is used.
  assert.match(band, /\{#if welcome\}\s*<h1[\s\S]*<svg class="od-first-launch-band--profile"/);
  assert.doesNotMatch(band, /SectionBand|--wave/);
  assert.match(band, /\.od-first-launch-band--alpha \{[^}]*height: 16px;[^}]*padding: 1px 5px;[^}]*font-size: 9px;[^}]*line-height: 12px;[^}]*letter-spacing: 0\.5px;/);
  assert.match(band, /border: 1px solid var\(--od-first-band-badge-line\)/);
  assert.match(theme, /--od-first-band-badge: rgb\(255 255 255 \/ 0\.18\)/);
  assert.match(theme, /--od-first-band-badge-line: rgb\(255 255 255 \/ 0\.55\)/);
  // The welcome band's name keeps the 24 sp size, a step's the 20 sp one.
  assert.match(band, /\.od-first-launch-band--name \{\s*font-size: 20px;/);
  assert.match(band, /--welcome \.od-first-launch-band--name \{\s*font-size: 24px;/);
});

test('the band is the blue panel of the tablet: gradient, sheen and hatching of task 234', () => {
  assert.match(theme, /--od-first-band: linear-gradient\(180deg, #2A6FB0 0%, #1F5C99 22%, #0C3866 70%, #072A4D 100%\)/);
  assert.match(theme, /--od-first-band-sheen: radial-gradient\(ellipse 70% 45% at 22% 0%, rgb\(255 255 255 \/ 0\.22\), rgb\(255 255 255 \/ 0\) 70%\)/);
  assert.match(theme, /--od-first-band-hatch: repeating-linear-gradient\(105deg, rgb\(255 255 255 \/ 0\.035\) 0 60px, rgb\(255 255 255 \/ 0\) 60px 150px\)/);
  assert.match(band, /mask-image: linear-gradient\(180deg, #000 0%, transparent 55%\)/);
});

/** WCAG relative luminance and contrast of two sRGB colours. */
const lum = ([r, g, b]) => {
  const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

test('white text on the band: at least 4.5:1 on every colour of the gradient, and the badge fill that keeps it so', () => {
  for (const stop of [[0x2a, 0x6f, 0xb0], [0x1f, 0x5c, 0x99], [0x0c, 0x38, 0x66], [0x07, 0x2a, 0x4d]]) assert.ok(contrast([255, 255, 255], stop) >= 4.5, stop.join());
  // The line under the headline, white at 78 %, on the gradient where it is drawn (22 % to 70 %, no sheen).
  const over = (bg) => bg.map((v) => Math.round(v * 0.22 + 255 * 0.78));
  assert.ok(contrast(over([0x1f, 0x5c, 0x99]), [0x1f, 0x5c, 0x99]) >= 4.5);
  // Measured in headless Edge on the rendered band (lightest pixel under each text, text hidden): the name 4.76,
  // the welcome badge 4.57 (fill 12 %: at 18 % it was 4.04), the step badge 5.06 (fill 18 %), the headline 7.55,
  // the line under it 6.72.
  assert.match(band, /welcome \.od-first-launch-band--alpha \{\s*background: var\(--od-first-band-badge-welcome\)/);
  assert.match(theme, /--od-first-band-badge-welcome: rgb\(255 255 255 \/ 0\.12\)/);
});

test('« Retour » goes back one step, and the steps are laid out as the mock-ups say', () => {
  assert.match(editorial, /<Link back class="od-editorial-page--retour">[\s\S]*t\('accountStep\.back'\)/);
  assert.match(editorial, /\{#if !noRetour\}/);
  // The download is a step you leave with « Annuler », not « Retour ».
  assert.match(download, /\bnoRetour\b/);
  assert.match(editorial, /\.od-editorial-page--retour\) \{[^}]*min-height: 48px;/);
  assert.match(editorial, /\.od-editorial-page--band-body,\s*\.od-editorial-page--panel-body \{\s*padding: 16px 20px 0;/);
  // Pointer and hover on the link.
  assert.match(editorial, /cursor: pointer;[\s\S]*@media \(hover: hover\)/);
});

test('the outlined field of the steps: 52 dp, 12 dp corners, the label on the border, colours from tokens', () => {
  const field = read('components/AccountField.svelte');
  assert.match(field, /\.od-account-field--outlined \{[\s\S]*height: 52px;[\s\S]*border-radius: 12px;/);
  assert.match(field, /top: -9px;/);
  assert.match(field, /var\(--od-outlined-field-error\)/);
  assert.match(theme, /--od-outlined-field-active: var\(--od-code-active\)/);
  assert.doesNotMatch(field.slice(field.indexOf('.od-account-field--outlined')), /#[0-9a-f]{3,6}\b/i);
  // The mask's #000 is an alpha mask, not a colour.
  assert.doesNotMatch(band.slice(band.indexOf('<style>')).replace('#000', ''), /#[0-9a-f]{3,6}/i);
});
