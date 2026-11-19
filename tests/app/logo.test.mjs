// The simple logo with relief (docs/brand/benthic-logo.svg) is the only logo in the app:
// no logo file or logo component still draws the old « Trois vagues » waves or the flat simple logo.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const slash = (p) => p.split(sep).join('/');
const OLD_WAVES = /#(D4E2F2|BCD2EB|8FB0D6|7199C2|D6E4F4|BED3EC|93B6E0|77A0D2|3F6F9F|2D5E90|4F84C2|3A6FAE)/i;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'build' || name === 'dist') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const isLogoFile = (p) =>
  /(^|\/)(favicon\.svg|logo-[^/]*\.svg|ic_launcher[^/]*\.xml|ic_splash_mark[^/]*\.xml)$/.test(slash(p));

const searched = ['app/src', 'app/public', 'app/android/app/src/main/res', 'app/ios', 'docs/brand']
  .flatMap((d) => walk(join(root, d)))
  .filter((p) => !slash(p).includes('docs/brand/previous/'));
const logoFiles = searched.filter(isLogoFile);
const read = (p) => readFileSync(p, 'utf8');

test('the logo files exist', () => {
  const names = logoFiles.map((p) => slash(relative(root, p)));
  for (const n of [
    'app/public/favicon.svg',
    'app/public/logo-light.svg',
    'app/public/logo-dark.svg',
    'app/public/logo-menu.svg',
    'app/android/app/src/main/res/drawable/ic_launcher_foreground.xml',
    'app/android/app/src/main/res/drawable/ic_launcher_monochrome.xml',
    'app/android/app/src/main/res/drawable/ic_splash_mark.xml',
    'app/android/app/src/main/res/drawable-night/ic_splash_mark.xml',
  ]) {
    assert.ok(names.includes(n), n);
  }
});

test('no logo file keeps a colour of the « Trois vagues » waves', () => {
  for (const p of logoFiles) assert.doesNotMatch(read(p), OLD_WAVES, relative(root, p));
});

const MONO = 'app/android/app/src/main/res/drawable/ic_launcher_monochrome.xml';
const RELIEF = /linearGradient[^>]*id="[^"]*disc"[\s\S]*#1F5C99[\s\S]*#0C3866/;

test('no logo file draws bubbles or a ring around the disc, and none keeps the flat disc colour', () => {
  for (const p of logoFiles) {
    const s = read(p);
    assert.doesNotMatch(s, /C9C7C1/i, relative(root, p));
    if (!slash(p).endsWith('ic_launcher_monochrome.xml')) assert.doesNotMatch(s, /#114477|#FF114477/i, relative(root, p));
  }
});

test('the Android monochrome icon stays flat: no gradient', () => {
  const s = read(join(root, MONO));
  assert.doesNotMatch(s, /<gradient|aapt:attr/);
  assert.match(s, /fillType="evenOdd"/);
});

test('the web logos are the relief drawing', () => {
  for (const f of ['logo-light.svg', 'logo-dark.svg', 'logo-menu.svg']) {
    const s = read(join(root, 'app/public', f));
    assert.match(s, RELIEF, f);
    assert.match(s, /stroke="url\(#od-rim\)"/, f);
    assert.match(s, /M5 14\.1q3\.5-3 7 0t7 0/, f);
    assert.match(s, /stroke="#072A4D" stroke-opacity="0\.35" stroke-width="2\.2"/, f);
    assert.match(s, /M5 13q3\.5-3 7 0t7 0" fill="none" stroke="#FFFFFF" stroke-width="2\.2"/, f);
  }
});

test('the favicon keeps the disc gradient and one thick white wave, simplified for 16 px', () => {
  const fav = read(join(root, 'app/public/favicon.svg'));
  assert.match(fav, RELIEF);
  assert.match(fav, /viewBox="0 0 24 24"/);
  assert.match(fav, /<circle cx="12" cy="12" r="11"/);
  assert.match(fav, /M5 13q3\.5-3 7 0t7 0/);
  assert.doesNotMatch(fav, /od-rim|#072A4D/);
  assert.ok(Number(fav.match(/stroke-width="([\d.]+)"/)[1]) >= 2.4, 'the wave is thick enough at 16 px');
});

test('the brand files are the relief drawing; the flat ones are in previous/', () => {
  for (const f of ['benthic-logo.svg', 'benthic-logo-light.svg', 'benthic-logo-dark.svg']) {
    assert.match(read(join(root, 'docs/brand', f)), RELIEF, f);
  }
  // App icons are blue to their edge (no white ring once masked): the gradient over the whole icon, the wave on top.
  for (const f of ['benthic-icon-light-round.svg', 'benthic-icon-dark-squircle.svg', 'benthic-icon-light-fullbleed.svg']) {
    const icon = read(join(root, 'docs/brand', f));
    assert.ok(icon.includes('<rect width="108" height="108" fill="url(#od-icon)"/>'), f);
    assert.doesNotMatch(icon, /#F4F4F2|#121314/i, f);
  }
  assert.ok(!existsSync(join(root, 'docs/brand/benthic-logo-relief.svg')));
  assert.match(read(join(root, 'docs/brand/previous/benthic-logo-simple.svg')), /#114477/);
});

test('the Android launcher icon is blue to its edge: gradient background, the wave and its shadow on top (no white ring)', () => {
  const res = join(root, 'app/android/app/src/main/res');
  const bg = read(join(res, 'drawable/ic_launcher_background.xml'));
  assert.match(bg, /M0,0h108v108h-108Z/);
  assert.match(bg, /#FF1F5C99/);
  assert.match(bg, /#FF0C3866/);
  const fg = read(join(res, 'drawable/ic_launcher_foreground.xml'));
  assert.doesNotMatch(fg, /a30,30|<gradient|#33FFFFFF/);
  assert.match(fg, /#59072A4D/);
  assert.match(fg, /#FFFFFFFF/);
  for (const f of ['ic_launcher', 'ic_launcher_round']) {
    const a = read(join(res, `mipmap-anydpi-v26/${f}.xml`));
    assert.ok(a.includes('<background android:drawable="@drawable/ic_launcher_background"/>'), f);
  }
});

test('the Android splash marks are the relief: gradient disc of radius 30, rim, shadow and wave', () => {
  const res = join(root, 'app/android/app/src/main/res');
  const files = ['drawable/ic_splash_mark.xml', 'drawable-night/ic_splash_mark.xml'];
  for (const f of files) {
    const s = read(join(res, f));
    assert.match(s, /#FF1F5C99/, f);
    assert.match(s, /#FF0C3866/, f);
    assert.match(s, /a30,30 0,1 0,60 0/, f);
    assert.match(s, /#33FFFFFF/, f);
    assert.match(s, /#59072A4D/, f);
    assert.equal((s.match(/<path/g) || []).length, 4, f);
    assert.equal((s.match(/<gradient/g) || []).length, 2, f);
  }
  assert.equal(read(join(res, files[0])).replace(/<!--.*?-->/gs, ''), read(join(res, files[1])).replace(/<!--.*?-->/gs, ''));
});

test('the minSdk supports gradients in vector drawables (API 24)', () => {
  const v = read(join(root, 'app/android/variables.gradle'));
  assert.ok(Number(v.match(/minSdkVersion\s*=\s*(\d+)/)[1]) >= 24);
});

test('the logo files and the inline logos share no gradient id', () => {
  // The app draws its logos with <img>, so every file has its own ids; an inline <svg> logo would need unique ones.
  for (const p of searched.filter((f) => f.endsWith('.svelte'))) {
    const s = read(p);
    if (/<svg[^>]*>[\s\S]*?linearGradient[^>]*id="od-(disc|rim)"/.test(s)) assert.match(s, /\$props\.id\(\)|\$\{[^}]*id[^}]*\}-disc/, relative(root, p));
  }
});

test('the old « Trois vagues » name is gone from the app files', () => {
  for (const p of searched.filter((f) => /\.(svelte|js|xml|svg|storyboard)$/.test(f)))
    assert.doesNotMatch(read(p), /Trois vagues/i, relative(root, p));
});
