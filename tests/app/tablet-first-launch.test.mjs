// The tablet first launch (task 2026-11-16-237: the blue panel and the dive-profile animation; task
// 2026-11-16-239: the steps beside the same panel). The screens need Framework7 and a WebView: they are read
// from their source, the language files and the pure code (lib/profile-hero.js).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PROFILES, PROFILE_TIMING, scaledProfile } from '../../app/src/lib/profile-hero.js';

const root = new URL('../../app/src/', import.meta.url);
const read = (f) => readFileSync(new URL(f, root), 'utf8');
const hero = read('components/ProfileHero.svelte');
const panel = read('components/FirstLaunchPanel.svelte');
const welcome = read('pages/WelcomeStart.svelte');
const editorial = read('components/EditorialPage.svelte');
const theme = read('theme.css');
const langs = { fr: JSON.parse(read('i18n/fr.json')), en: JSON.parse(read('i18n/en.json')) };
const css = (source) => source.slice(source.indexOf('<style>'));

test('the animation timing is the one of the brief: 2.2 s line, dot at 0.7 s over 0.3 s, labels at 2.1 s over 0.5 s', () => {
  assert.deepEqual(PROFILE_TIMING, {
    draw: 2.2,
    easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
    dotDelay: 0.7,
    dotDuration: 0.3,
    dotFrom: 0.4,
    labelDelay: 2.1,
    labelDuration: 0.5,
    labelRise: 8,
  });
  const style = css(hero);
  // The line and its glow: the stroke length is trimmed (pathLength 1, dash 1, offset 1 -> 0), left to right.
  for (const part of ['glow', 'line']) {
    assert.match(style, new RegExp(`\\.od-profile-hero--${part} \\{[^}]*stroke-dasharray: 1;[^}]*animation: od-profile-hero-draw 2\\.2s cubic-bezier\\(0\\.4, 0, 0\\.2, 1\\) both;`));
  }
  assert.equal((hero.match(/pathLength="1"/g) ?? []).length, 2);
  assert.match(style, /@keyframes od-profile-hero-draw \{\s*from \{\s*stroke-dashoffset: 1;\s*\}\s*to \{\s*stroke-dashoffset: 0;/);
  // The dot: 0.3 s after 0.7 s, from 40 % to 100 % with a fade-in.
  assert.match(style, /\.od-profile-hero--dot \{[^}]*animation: od-profile-hero-pop 0\.3s 0\.7s [^;]*both;/);
  assert.match(style, /@keyframes od-profile-hero-pop \{\s*from \{\s*opacity: 0;\s*transform: scale\(0\.4\);\s*\}\s*to \{\s*opacity: 1;\s*transform: none;/);
  // The labels: 0.5 s after 2.1 s, fade in and rise 8 dp.
  assert.match(style, /\.od-profile-hero--label \{[^}]*animation: od-profile-hero-in 0\.5s 2\.1s [^;]*both;/);
  assert.match(style, /@keyframes od-profile-hero-in \{\s*from \{\s*opacity: 0;\s*transform: translateY\(8px\);/);
});

test('the water column is visible from the start: nothing animates it', () => {
  const style = css(hero);
  assert.doesNotMatch(style, /\.od-profile-hero--water \{[^}]*animation/);
  assert.doesNotMatch(style, /\.od-profile-hero--water-(top|bottom) \{[^}]*animation/);
  assert.match(hero, /<path class="od-profile-hero--water" d=\{shape\.area\} fill="url\(#\{gradient\}\)">/);
  assert.match(style, /\.od-profile-hero--surface \{[^}]*stroke-dasharray: 3 4;/);
  assert.doesNotMatch(style, /\.od-profile-hero--surface \{[^}]*animation/);
});

test('reduced motion shows the final state at once; the steps show it still', () => {
  const style = css(hero);
  assert.match(style, /@media \(prefers-reduced-motion: reduce\) \{\s*\.od-profile-hero--glow,\s*\.od-profile-hero--line,\s*\.od-profile-hero--dot,\s*\.od-profile-hero--label \{\s*animation: none;/);
  assert.match(style, /\.od-profile-hero--still \{\s*\.od-profile-hero--glow,\s*\.od-profile-hero--line,\s*\.od-profile-hero--dot,\s*\.od-profile-hero--label \{\s*animation: none;/);
  assert.match(hero, /class:od-profile-hero--still=\{still\}/);
  assert.match(panel, /<ProfileHero \{still\} \/>/);
  assert.match(editorial, /<FirstLaunchPanel still \/>/);
});

test('the screen plays the animation each time it is shown', () => {
  assert.match(welcome, /onPageBeforeIn=\{\(\) => playKey\+\+\}/);
  assert.match(welcome, /<FirstLaunchPanel \{playKey\} \/>/);
  assert.match(panel, /\{#key playKey\}\s*<ProfileHero \{still\} \/>\s*\{\/key\}/);
});

test('the curves: one per orientation, scaled to the box, the deepest point follows', () => {
  assert.deepEqual([PROFILES.landscape.width, PROFILES.landscape.height], [588, 300]);
  assert.deepEqual([PROFILES.portrait.width, PROFILES.portrait.height], [688, 220]);
  for (const orientation of ['landscape', 'portrait']) {
    const p = PROFILES[orientation];
    const same = scaledProfile(orientation, p.width, p.height);
    assert.equal(same.line, p.path.replace(/\d+\.\d+/g, (n) => Number(n).toFixed(1)));
    assert.deepEqual(same.deepest, p.deepest);
    const half = scaledProfile(orientation, p.width / 2, p.height / 2);
    assert.ok(Math.abs(half.deepest.x - p.deepest.x / 2) < 0.06 && Math.abs(half.deepest.y - p.deepest.y / 2) < 0.06);
    assert.ok(half.area.endsWith(' Z'));
  }
});

test('the labels are decorative texts of the mock-ups, in French and English', () => {
  const fr = langs.fr.firstLaunch;
  assert.deepEqual([fr.profileDepthValue, fr.profileDepthCaption, fr.profileDurationValue, fr.profileDurationCaption], ['32,4 m', 'Profondeur max.', '54 min', 'Durée · Nitrox 32 %']);
  const en = langs.en.firstLaunch;
  for (const key of ['tabletStart', 'profileLabel', 'profileDepthValue', 'profileDepthCaption', 'profileDurationValue', 'profileDurationCaption']) assert.ok(en[key] && fr[key], key);
  assert.equal(fr.tabletStart, 'Pour commencer');
  assert.doesNotMatch(hero.slice(0, hero.indexOf('<style>')), /32[,.]4|54 min/);
});

test('the panel: 700 dp on the left in landscape, 640 dp at the top in portrait, 48 sp name, 40 sp title', () => {
  const style = css(panel);
  assert.match(style, /width: min\(700px, 55%\);\s*height: 100%;/);
  assert.match(style, /@media \(orientation: portrait\) \{\s*width: 100%;\s*height: 640px;/);
  assert.match(style, /\.od-first-launch-panel--name \{\s*font-size: 48px;\s*line-height: 56px;/);
  assert.match(style, /\.od-first-launch-panel--title \{[^}]*font-size: 40px;\s*line-height: 48px;/);
  assert.match(style, /\.od-first-launch-panel--intro \{[^}]*font-size: 16px;[^}]*color: var\(--od-on-first-band-2\);/);
  assert.match(panel, /src="logo-light\.svg" alt="" width="96" height="96"/);
  assert.match(style, /background: var\(--od-first-band\);/);
  assert.match(style, /background: var\(--od-first-band-hatch\);/);
  assert.match(theme, /--od-on-first-band-2: rgb\(255 255 255 \/ 0\.78\);/);
});

test('the Alpha badge: 12 sp, line 16, letter spacing 0.6, padding 2 x 8 dp, outline at 55 %, 4.5:1 for the white text', () => {
  const style = css(panel);
  assert.match(style, /\.od-first-launch-panel--alpha \{[^}]*padding: 2px 8px;[^}]*border: 1px solid var\(--od-first-band-badge-line\);[^}]*font-size: 12px;\s*line-height: 16px;\s*font-weight: 700;\s*letter-spacing: 0\.6px;\s*text-transform: uppercase;/);
  assert.match(theme, /--od-first-band-badge-line: rgb\(255 255 255 \/ 0\.55\);/);
  // The fill is 12 %, not the 18 % of the brief: at 18 % the white text measured 4.2:1 on the panel.
  assert.match(style, /background: var\(--od-first-band-badge-welcome\);/);
  assert.match(theme, /--od-first-band-badge-welcome: rgb\(255 255 255 \/ 0\.12\);/);
  const lum = (rgb) => {
    const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
  };
  // The blue where the badge sits (about 16 % of the height, between #2A6FB0 and #1F5C99), under the fill.
  const base = [0, 1, 2].map((i) => [0x2a, 0x6f, 0xb0][i] + (([0x1f, 0x5c, 0x99][i] - [0x2a, 0x6f, 0xb0][i]) * 0.16) / 0.22);
  const contrast = (fill) => 1.05 / (lum(base.map((v) => v * (1 - fill) + 255 * fill)) + 0.05);
  assert.ok(contrast(0.12) >= 4.5, `12 %: ${contrast(0.12).toFixed(2)}`);
  assert.ok(contrast(0.18) < 4.5, '18 % would fall under 4.5:1');
});

test('the tablet / phone split: the panel on an Android tablet only, the band on a phone, iOS untouched', () => {
  assert.match(welcome, /const panel = \$derived\(!theme\.ios && !layout\.phone\);/);
  assert.match(welcome, /\{#if layout\.phone\}\s*<!--[^>]*-->\s*<FirstLaunchBand variant="welcome" \/>\s*\{:else\}/);
  assert.match(welcome, /\{#if panel\}<h2 class="od-welcome-start--start">\{t\('firstLaunch\.tabletStart'\)\}<\/h2>\{\/if\}/);
  // The three buttons, their hints, the divider and the git link are shared with the phone.
  for (const key of ['existingShort', 'existingNote', 'createShort', 'createNote', 'noAccount']) assert.ok(welcome.includes(`'welcome.${key}'`), key);
  assert.match(welcome, /<div class="od-welcome-start--divider" role="presentation"><\/div>\s*<a href="\/welcome\/git"/);
  assert.match(welcome, /<WelcomeHelpLink \/>/);
  // The panel rules apply only with the panel class: the phone's rules are the ones of task 233 to 236.
  assert.match(welcome, /\.od-welcome-start--with-panel \{/);
  assert.doesNotMatch(welcome.slice(welcome.indexOf('.od-welcome-start--page {'), welcome.indexOf('.od-welcome-start--with-panel {')), /orientation/);
  assert.match(welcome, /\.od-welcome-start--start \{\s*margin: 0 0 20px;\s*font-size: 28px;\s*line-height: 36px;/);
  assert.match(welcome, /\.od-welcome-start--divider \{\s*width: auto;\s*max-width: none;\s*margin: 20px 48px 16px;/);
  assert.match(welcome, /padding: 24px 64px 56px;/);
  assert.match(welcome, /padding: 0 120px 64px;/);
  // Hand pointer and hover.
  assert.match(welcome, /\.od-welcome-start--pill \{\s*cursor: pointer;/);
  assert.match(welcome, /\.od-welcome-start--git-link \{\s*cursor: pointer;[\s\S]*@media \(hover: hover\)/);
});

test('the « Une question ? » link sits in the middle of the content side beside the panel', () => {
  const link = read('components/WelcomeHelpLink.svelte');
  assert.match(link, /left: var\(--od-help-link-left, 50%\);/);
  assert.match(link, /:global\(\.od-first-panelled\) \{\s*--od-help-link-left: calc\(min\(700px, 55%\) \+ \(100% - min\(700px, 55%\)\) \/ 2\);/);
  assert.match(link, /@media \(orientation: portrait\) \{\s*--od-help-link-left: 50%;/);
  assert.match(welcome, /od-welcome-start\{panel \? ' od-first-panelled' : ''\}/);
  assert.match(editorial, /panel \? 'od-editorial-page--panelled od-first-panelled' : ''/);
});

test('task 239: the steps keep the panel, still, with the step in a 452 dp column and the buttons on the right', () => {
  assert.match(editorial, /const panel = \$derived\(firstLaunch && !ios && !layout\.phone\);/);
  assert.match(editorial, /const band = \$derived\(firstLaunch && !ios && layout\.phone\);/);
  assert.match(editorial, /\{:else if panel\}\s*<FirstLaunchPanel still \/>/);
  const style = css(editorial);
  // 580 dp of content side at 1280 dp, 64 dp on each side: 452 dp.
  assert.match(style, /\.od-editorial-page--panel-body \{[\s\S]*?padding: 24px 64px 56px;\s*justify-content: center;/);
  assert.match(style, /@media \(orientation: portrait\) \{\s*padding: 0 120px 64px;/);
  assert.match(style, /flex-direction: row;\s*justify-content: flex-end;/);
  assert.match(style, /\.od-editorial-page--title \{\s*margin-bottom: 8px;\s*font-size: 28px;\s*line-height: 36px;/);
  // The phone's rule is the one of tasks 233 to 236, unchanged.
  assert.match(style, /\.od-editorial-page--band-body,\s*\.od-editorial-page--panel-body \{\s*padding: 16px 16px 0;/);
});

test('task 239: the six code boxes are one centred group of 328 dp, the label, error and resend at its left edge', () => {
  const confirm = read('pages/ConfirmCode.svelte');
  assert.match(confirm, /:global\(\.od-editorial-page--panelled\) & \{\s*\/\*[^*]*\*\/\s*width: 328px;\s*max-width: 100%;\s*margin: 8px auto 0;/);
  const field = read('components/CodeField.svelte');
  assert.match(field, /flex: 0 1 48px;/);
  assert.match(field, /gap: 8px;/);
  assert.equal(6 * 48 + 5 * 8, 328);
});
