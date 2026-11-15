// First launch of the release edition (task 2026-11-15-213): the edition switch, the texts, the beta
// screen left as it is, the cloud rows' « coming » message and the import of a picked file. The screens need
// Framework7 and a WebView: they are read from their source; the logic (lib/release-welcome.js) runs here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { edition, isRelease, editionFrom } from '../../app/src/lib/edition.js';
import { CLOUD_ROWS, cloudComing, createLogbookFromFile, scaledProfile } from '../../app/src/lib/release-welcome.js';

const root = new URL('../../app/src/', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const langs = Object.fromEntries(['fr', 'en'].map((l) => [l, JSON.parse(read(`i18n/${l}.json`))]));
const sources = {
  page: read('pages/WelcomeStartRelease.svelte'),
  dialog: read('components/OpenImportDialog.svelte'),
  profile: read('components/ReleaseProfile.svelte'),
  entry: read('pages/WelcomeEntry.svelte'),
  logic: read('lib/release-welcome.js'),
};

test('the edition is the beta unless VITE_EDITION is release', () => {
  assert.equal(editionFrom(undefined), 'beta');
  assert.equal(editionFrom(''), 'beta');
  assert.equal(editionFrom('beta'), 'beta');
  assert.equal(editionFrom('nonsense'), 'beta');
  assert.equal(editionFrom('release'), 'release');
  assert.equal(editionFrom(' Release '), 'release');
  // Under node there is no Vite environment: the default applies.
  assert.equal(edition, 'beta');
  assert.equal(isRelease, false);
});

test('the edition is read in one place', () => {
  const found = [];
  for (const file of ['App.svelte', 'pages/WelcomeStart.svelte', 'pages/WelcomeEntry.svelte', 'pages/WelcomeStartRelease.svelte', 'lib/release-welcome.js']) {
    if (read(file).includes('VITE_EDITION')) found.push(file);
  }
  assert.deepEqual(found, []);
  assert.match(read('lib/edition.js'), /import\.meta\.env\.VITE_EDITION/);
});

test('the beta source path is unchanged: WelcomeStart knows nothing of the edition, the route picks the page', () => {
  const beta = read('pages/WelcomeStart.svelte');
  assert.doesNotMatch(beta, /edition|release/i);
  assert.match(beta, /od-welcome-start--wide-profile/);
  assert.match(beta, /welcome\.noAccountNoteTablet/);
  assert.match(read('App.svelte'), /component: isRelease \? WelcomeEntry : WelcomeStart/);
  // A phone keeps the beta screen in the release edition for now.
  assert.match(sources.entry, /layout\.phone/);
  assert.match(sources.entry, /<WelcomeStart \{f7router\} \/>/);
});

test('every text of the release screens is in fr and en', () => {
  const keys = new Set();
  for (const src of [sources.page, sources.dialog, sources.profile, sources.logic]) {
    for (const m of src.matchAll(/'(welcomeRelease\.\w+)'/g)) keys.add(m[1]);
  }
  assert.ok(keys.size >= 25, `only ${keys.size} keys found`);
  for (const lang of ['fr', 'en']) {
    for (const key of keys) {
      const value = key.split('.').reduce((o, k) => o?.[k], langs[lang]);
      assert.equal(typeof value, 'string', `${lang}: ${key}`);
      assert.ok(value.length > 0, `${lang}: ${key} is empty`);
    }
  }
  // Nothing in the translations is unused, and the screens write no visible text of their own.
  for (const key of Object.keys(langs.fr.welcomeRelease)) assert.ok(keys.has(`welcomeRelease.${key}`), `unused: ${key}`);
  assert.deepEqual(Object.keys(langs.fr.welcomeRelease).sort(), Object.keys(langs.en.welcomeRelease).sort());
  assert.doesNotMatch(JSON.stringify(langs.fr.welcomeRelease) + JSON.stringify(langs.en.welcomeRelease), /Subsurface/);
});

test('the dialog lists four cloud rows with generic icons, never a brand logo', () => {
  assert.deepEqual(CLOUD_ROWS.map((r) => r.key), ['googleDrive', 'oneDrive', 'dropbox', 'webdav']);
  assert.deepEqual(CLOUD_ROWS.map((r) => r.icon), ['cloud', 'cloud', 'cloud', 'server']);
  assert.doesNotMatch(sources.dialog, /<img|<svg|\.svg|\.png/);
});

test('the cloud row of the page and the four rows of the dialog show the « coming » message', () => {
  const shown = [];
  cloudComing((text) => shown.push(text), (key) => `<${key}>`);
  assert.deepEqual(shown, ['<welcomeRelease.cloudSoon>']);
  for (const lang of ['fr', 'en']) assert.ok(langs[lang].welcomeRelease.cloudSoon.length > 10);
  // « Dans mon nuage » and each row of the dialog call the same function.
  assert.match(sources.page, /function cloud\(\) \{\s*cloudComing\(showSnackbar, t\);/);
  assert.match(sources.page, /od-welcome-release--cloud', 'cloudUpload', t\('welcomeRelease\.cloudTitle'\), t\('welcomeRelease\.cloudHelp'\), cloud\)/);
  assert.match(sources.page, /oncloud=\{cloud\}/);
  assert.match(sources.dialog, /\{#each CLOUD_ROWS as row \(row\.key\)\}\s*<button[^>]*onclick=\{oncloud\}/);
});

test('« Sur cette tablette » starts the device logbook, « Dans un dépôt git » opens the git setup', () => {
  assert.match(sources.page, /function onDevice\(\) \{\s*startWithoutAccount\(\);/);
  assert.match(sources.page, /f7router\.navigate\('\/welcome\/git'\)/);
});

/** A set of fakes for createLogbookFromFile, with the calls recorded in order. */
function fakes({ dives = 3, exists = false, sample = [1, 2], failCount = false } = {}) {
  const calls = [];
  const deps = {
    readBase64: async () => 'QUJD',
    stage: async (o) => (calls.push(['stage', o.name, o.data]), { path: '/cache/import/x' }),
    count: async (o) => {
      calls.push(['count', o.path]);
      if (failCount) throw new Error('IMPORT_FAILED');
      return { dives };
    },
    discard: async (o) => calls.push(['discard', o.path]),
    deviceLogExists: async () => exists,
    start: async () => calls.push(['start']),
    sampleIds: () => sample,
    remove: async (ids) => calls.push(['remove', ids]),
    importFile: async (file) => (calls.push(['import', file.name]), 3),
  };
  return { calls, deps };
}

test('« Choisir un fichier » creates the device logbook from the file with the existing import', async () => {
  const { calls, deps } = fakes();
  const n = await createLogbookFromFile({ name: 'carnet.ssrf' }, deps);
  assert.equal(n, 3);
  assert.deepEqual(calls, [
    ['stage', 'carnet.ssrf', 'QUJD'],
    ['count', '/cache/import/x'],
    ['discard', '/cache/import/x'],
    ['start'],
    ['remove', [1, 2]],
    ['import', 'carnet.ssrf'],
  ]);
  // The page hands the real import to it, and the dialog gives the picked file back.
  assert.match(sources.page, /importFile,\s*\}\);/);
  assert.match(sources.page, /import \{[^}]*importFile[^}]*\} from '\.\.\/lib\/logbook\.svelte\.js'/);
  assert.match(sources.dialog, /onfile\(file\)/);
  assert.match(sources.dialog, /<input type="file"/);
});

test('a device logbook that already exists keeps its dives', async () => {
  const { calls, deps } = fakes({ exists: true });
  await createLogbookFromFile({ name: 'a.xml' }, deps);
  assert.ok(!calls.some((c) => c[0] === 'remove'));
  assert.ok(calls.some((c) => c[0] === 'import'));
});

test('a file with no dive, or one that cannot be read, leaves first launch as it was', async () => {
  const empty = fakes({ dives: 0 });
  await assert.rejects(() => createLogbookFromFile({ name: 'a.xml' }, empty.deps), { message: 'NO_DIVES' });
  assert.ok(!empty.calls.some((c) => c[0] === 'start' || c[0] === 'import'));
  assert.ok(empty.calls.some((c) => c[0] === 'discard'));
  const broken = fakes({ failCount: true });
  await assert.rejects(() => createLogbookFromFile({ name: 'a.xml' }, broken.deps), { message: 'IMPORT_FAILED' });
  assert.ok(!broken.calls.some((c) => c[0] === 'start' || c[0] === 'import'));
  assert.ok(broken.calls.some((c) => c[0] === 'discard'));
});

test('the profile is drawn to the size it is given and keeps its shape', () => {
  const land = scaledProfile(588, 300);
  assert.match(land.line, /^M0\.0 12\.6 C/);
  assert.match(land.line, / 588\.0 12\.6$/);
  assert.deepEqual(land.deepest, { x: 78.2, y: 284.7 });
  const port = scaledProfile(688, 220);
  assert.match(port.line, / 688\.0 9\.2$/);
  assert.equal(port.surfaceY, 9.2);
  assert.ok(Math.abs(port.deepest.x - 91.5) < 0.1 && Math.abs(port.deepest.y - 208.8) < 0.1);
  assert.equal(port.area, `${port.line} Z`);
});

test('the release screens follow the rules of the interface', () => {
  // Hand pointer and hover on every action; motion that respects the system setting.
  for (const src of [sources.page, sources.dialog]) {
    assert.match(src, /cursor: pointer/);
    assert.match(src, /@media \(hover: hover\)/);
    assert.match(src, /prefers-reduced-motion: reduce/);
  }
  assert.match(sources.profile, /prefers-reduced-motion: reduce/);
  assert.match(sources.profile, /1\.6s cubic-bezier\(0\.2, 0, 0, 1\)/);
  // Colours of the panel are variables of the theme, in light and dark.
  const theme = read('theme.css');
  for (const name of ['--od-release-panel-1', '--od-release-panel-4', '--od-release-glow', '--od-release-tile', '--od-release-scrim']) {
    assert.ok(theme.includes(`${name}:`), name);
  }
  assert.ok(theme.slice(theme.indexOf('html.dark {')).includes('--od-release-tile:'));
  // No colour written in a component: every one is a variable of the theme.
  for (const src of [sources.page, sources.dialog, sources.profile]) assert.doesNotMatch(src, /#[0-9A-Fa-f]{3,8}\b|rgb\(/);
});
