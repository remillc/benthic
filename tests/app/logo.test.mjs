// The simple logo (docs/brand/opendives-logo.svg) is the only logo in the app:
// no logo file or logo component still draws the old « Trois vagues » waves.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
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

test('no logo file draws bubbles, a ring or a gradient', () => {
  for (const p of logoFiles) {
    const s = read(p);
    assert.doesNotMatch(s, /linearGradient|<gradient|aapt:attr/, relative(root, p));
    assert.doesNotMatch(s, /C9C7C1|clip-?path/i, relative(root, p));
  }
});

test('the web logos are the simple drawing', () => {
  for (const f of ['favicon.svg', 'logo-light.svg', 'logo-dark.svg', 'logo-menu.svg']) {
    const s = read(join(root, 'app/public', f));
    assert.match(s, /fill="#114477"/, f);
    assert.match(s, /M5 13q3\.5-3 7 0t7 0/, f);
    assert.match(s, /stroke="#FFFFFF"/, f);
    assert.match(s, /stroke-width="2"/, f);
  }
  const fav = read(join(root, 'app/public/favicon.svg'));
  assert.match(fav, /viewBox="0 0 24 24"/);
  assert.match(fav, /<circle cx="12" cy="12" r="11"/);
});

test('the Android foreground and splash marks are the disc of radius 30 and one wave', () => {
  const res = join(root, 'app/android/app/src/main/res');
  const files = ['drawable/ic_launcher_foreground.xml', 'drawable/ic_splash_mark.xml', 'drawable-night/ic_splash_mark.xml'];
  for (const f of files) {
    const s = read(join(res, f));
    assert.match(s, /#FF114477/, f);
    assert.match(s, /a30,30 0,1 0,60 0/, f);
    assert.equal((s.match(/<path/g) || []).length, 2, f);
  }
  assert.equal(read(join(res, files[1])).replace(/<!--.*?-->/gs, ''), read(join(res, files[2])).replace(/<!--.*?-->/gs, ''));
});

test('the old « Trois vagues » name is gone from the app files', () => {
  for (const p of searched.filter((f) => /\.(svelte|js|xml|svg|storyboard)$/.test(f)))
    assert.doesNotMatch(read(p), /Trois vagues/i, relative(root, p));
});
