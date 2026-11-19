// The rename (task 2026-11-19-316): no « OpenDives » in the texts the diver reads, in French and in English,
// and the names under the icon are « Benthic Log ».
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

// Internal identifiers that may still carry the old name inside a user-facing string (none today).
const ALLOWED = [];

/** @param {unknown} node @param {string} path @param {string[]} out */
function strings(node, path, out) {
  if (typeof node === 'string') out.push([path, node]);
  else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) strings(v, `${path}.${k}`, out);
  return out;
}

for (const lang of ['fr', 'en']) {
  test(`no « OpenDives » in the ${lang} texts`, () => {
    const found = strings(JSON.parse(read(`app/src/i18n/${lang}.json`)), lang, [])
      .filter(([path, text]) => /open\s?dives/i.test(text.replace(/opendives(:\/\/|\.app)/g, '')) && !ALLOWED.includes(path));
    assert.deepEqual(found, []);
  });
}

test('no French elision of the old kind (« d’Benthic »)', () => {
  assert.doesNotMatch(read('app/src/i18n/fr.json'), /\b[dDqQ]u?[’']Benthic/);
});

test('the pages of the privacy policy and the built site texts carry the new name', () => {
  for (const f of ['app/public/privacy/fr.html', 'app/public/privacy/en.html', 'site/build.mjs']) {
    assert.doesNotMatch(read(f).replace(/org\.opendives|opendives:\/\/|remillc\/opendives/g, ''), /OpenDives|opendives\.app/, f);
  }
});

test('under the icon: « Benthic Log » on Android, iOS, desktop and in the Capacitor config', () => {
  assert.match(read('app/android/app/src/main/res/values/strings.xml'), /<string name="app_name">Benthic Log</);
  assert.match(read('app/ios/App/App/Info.plist'), /CFBundleDisplayName<\/key>\s*<string>Benthic Log</);
  assert.equal(JSON.parse(read('app/capacitor.config.json')).appName, 'Benthic Log');
  assert.equal(JSON.parse(read('desktop/package.json')).build.productName, 'Benthic Log');
});

test('both hosts open the app: Android intent filters and iOS associated domains', () => {
  const manifest = read('app/android/app/src/main/AndroidManifest.xml');
  assert.match(manifest, /android:host="benthicdivelog\.app"/);
  assert.match(manifest, /android:host="opendives\.app"/);
  const ent = read('app/ios/App/App/App.entitlements');
  assert.match(ent, /applinks:benthicdivelog\.app/);
  assert.match(ent, /applinks:opendives\.app/);
});
