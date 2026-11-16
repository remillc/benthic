// The alpha first launch and the window without a logbook in the desktop app (task 2026-11-16-242; mock-ups
// docs/mockups/bureau-premier-lancement-alpha-*.dc.html, bureau-demarrage-actuel.dc.html and
// bureau-demarrage-introuvable.dc.html): the « cet ordinateur » texts, the recent list's rows and cap, the missing
// state, the dialog's two actions, what a drop does on the first launch, and the screens' structure. The screens need
// Framework7 and Electron: their markup is read from the source, the logic runs. The main process side (exists,
// relocate, forget) is tested in tests/desktop/windows.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RECENT_SHOWN, recentRows, fileNameOf } from '../../app/src/lib/desktop-recents.js';
import { droppedFiles, startWithDrop } from '../../app/src/lib/desktop-first-launch.js';
import { FIRST_LAUNCH_SNACKBARS_DESKTOP, deviceKey, deviceSuffix } from '../../app/src/lib/first-launch.js';

const root = new URL('../../app/src/', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const langs = Object.fromEntries(['fr', 'en'].map((l) => [l, JSON.parse(read(`i18n/${l}.json`))]));
const get = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);

const texts = {
  'desktopLogbooks.mainName': 'Carnet de cet ordinateur',
  'desktopLogbooks.source.device': 'Cet ordinateur',
  'desktopLogbooks.source.git': 'Dépôt git',
  'desktopLogbooks.source.file': 'Fichier',
  'desktopLogbooks.source.googleDrive': 'Google Drive',
  'desktopLogbooks.when.openNow': 'ouvert maintenant',
  'desktopLogbooks.when.closedNow': 'fermé à l’instant',
  'desktopLogbooks.when.closedMinutes': 'fermé il y a {n} min',
  'desktopLogbooks.when.closedHours': 'fermé il y a {n} h',
  'desktopLogbooks.when.openedOn': 'ouvert le {date}',
  'desktopLogbooks.recents.missingIn': 'Introuvable dans {place}',
};
const t = (key, params = {}) => (texts[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => params[k]);
const date = () => '2 nov.';
const NOW = 1_800_000_000_000;
const file = (name, folder, openedAt) => ({ id: `f-${name}`, kind: 'file', name, location: `C:\\Users\\a\\${folder}\\${name}`, openedAt });

test('the list is newest first and shows at most five: the oldest are dropped', () => {
  const recent = Array.from({ length: 8 }, (_, i) => file(`l${i}.ssrf`, 'Documents', NOW - i * 3_600_000)).reverse();
  const rows = recentRows(recent, {}, NOW, t, date);
  assert.equal(RECENT_SHOWN, 5);
  assert.deepEqual(rows.map((r) => r.name), ['l0.ssrf', 'l1.ssrf', 'l2.ssrf', 'l3.ssrf', 'l4.ssrf']);
});

test('a row says where the logbook is kept and when it was last closed or opened', () => {
  const rows = recentRows(
    [
      { id: 'c-1', kind: 'cloud', name: 'plongees.ssrf', location: 'OpenDives/plongees.ssrf', provider: 'googleDrive', openedAt: NOW - 2 * 60_000 },
      { id: 'g-1', kind: 'git', name: 'Club 2024', location: 'https://github.com/club/carnet.git', branch: 'main', openedAt: NOW - 3 * 3_600_000 },
      file('essai.ssrf', 'Documents', NOW - 10 * 24 * 3_600_000),
      { id: 'main', kind: 'main', name: '', location: '', openedAt: NOW - 20 * 24 * 3_600_000 },
    ],
    {},
    NOW,
    t,
    date,
  );
  assert.deepEqual(rows.map((r) => [r.kind, r.name, r.detail]), [
    ['cloud', 'plongees.ssrf', 'Google Drive · fermé il y a 2 min'],
    ['git', 'Club 2024', 'Dépôt git · github.com/club/carnet · fermé il y a 3 h'],
    ['file', 'essai.ssrf', 'Documents · ouvert le 2 nov.'],
    ['device', 'Carnet de cet ordinateur', 'Cet ordinateur · ouvert le 2 nov.'],
  ]);
});

test('a missing file keeps its place and says « Introuvable dans {place} »; an id absent from the answer counts as found', () => {
  const recent = [file('a.ssrf', 'Documents', NOW - 1000), file('essai.ssrf', 'Documents', NOW - 2000), file('b.ssrf', 'Bureau', NOW - 3000)];
  const rows = recentRows(recent, { 'f-essai.ssrf': false, 'f-a.ssrf': true }, NOW, t, date);
  assert.deepEqual(rows.map((r) => r.missing), [false, true, false]);
  assert.equal(rows[1].detail, 'Introuvable dans Documents');
  assert.equal(rows[1].fileName, 'essai.ssrf');
  assert.equal(fileNameOf({ id: 'f-x', kind: 'file', name: 'x', location: '/home/a/Documents/x.ssrf' }), 'x.ssrf');
});

test('the texts of the screen and of the dialog, in French and English', () => {
  for (const lang of ['fr', 'en']) {
    const d = langs[lang].desktopLogbooks;
    for (const key of ['title', 'orElse', 'missingIn', 'missingTitle', 'missingText', 'remove', 'search', 'otherChoices']) assert.ok(d.recents[key], `${lang} recents.${key}`);
    for (const key of ['open', 'newLogbook', 'openHint', 'newHint', 'drop', 'dropHere']) assert.ok(d.start[key], `${lang} start.${key}`);
    assert.match(d.recents.missingText, /\{file\}.*\{place\}/);
  }
  const fr = langs.fr.desktopLogbooks;
  assert.equal(fr.recents.title, 'Carnets récents');
  assert.equal(fr.recents.orElse, 'Ou bien');
  assert.equal(fr.recents.missingTitle, 'Carnet introuvable');
  assert.equal(fr.recents.remove, 'Retirer de la liste');
  assert.equal(fr.recents.search, 'Chercher le fichier…');
  assert.equal(fr.start.open, 'Ouvrir un carnet…');
  assert.equal(fr.start.openHint, 'Un fichier .ssrf ou .xml, ou un dossier de dépôt git.');
  assert.equal(fr.start.newLogbook, 'Nouveau carnet…');
  assert.equal(fr.start.newHint, 'Vous choisirez ensuite où le garder.');
  assert.equal(fr.start.drop, 'Vous pouvez aussi déposer un fichier carnet sur cette fenêtre.');
});

test('the window without a logbook: the blue panel with a still profile, the recent logbooks, « Ou bien », two rows, the drop hint, the help link', () => {
  const start = read('components/DesktopLogbookStart.svelte');
  assert.match(start, /<FirstLaunchPanel still \/>/);
  assert.match(start, /\{#if logbooks\.recent\.length\}\s*<RecentLogbooks \/>\s*<h2 class="od-logbook-start--or">\{t\('desktopLogbooks\.recents\.orElse'\)\}<\/h2>/);
  assert.match(start, /onclick=\{openLogbookDialog\}/, '« Ouvrir un carnet… » opens the system picker');
  assert.match(start, /onclick=\{\(\) => \(logbooks\.dialog = true\)\}/, '« Nouveau carnet… » opens the new-logbook flow');
  assert.equal((start.match(/class="od-logbook-start--choice"/g) ?? []).length, 2, 'two neutral rows, no filled one');
  assert.match(start, /<WelcomeHelpLink onopen=\{openAbout\} \/>/);
  assert.match(start, /desktopLogbooks\.start\.drop/);
  assert.match(start, /refreshRecent\(\)\.then\(checkRecent\)/);
  assert.match(start, /cursor: pointer/);
  assert.match(start, /prefers-reduced-motion/);
});

test('the rail is out of sight on that window, back (dimmed) when Réglages steps in front of it', () => {
  const start = read('components/DesktopLogbookStart.svelte');
  assert.match(start, /classList\.toggle\('od-start-screen', visible\)/);
  assert.match(start, /const visible = \$derived\(navigation\.section !== 'account'\)/);
  assert.match(start, /html\.od-start-screen \.od-nav-rail--rail\) \{\s*visibility: hidden;/);
  // Task 240 still applies where the rail shows: the sections dimmed, Réglages and the account active.
  assert.match(start, /html\.od-no-logbook \.od-nav-rail--item:not\(\.od-nav-rail--settings\)\) \{\s*opacity: 0\.38;\s*pointer-events: none;/);
  assert.match(start, /z-index: 6100;/, 'above the rail (6000)');
});

test('a row opens its logbook; a missing one opens the dialog with « Retirer de la liste » and « Chercher le fichier… »', () => {
  const list = read('components/RecentLogbooks.svelte');
  assert.match(list, /if \(row\.missing\) asking = row\.id;\s*else void openRecent\(row\.id\)/);
  assert.match(list, /await forgetRecent\(asking\)/);
  assert.match(list, /await relocateRecent\(asking\)/);
  assert.ok(!/onclose=/.test(list), 'a basic dialog: no close button');
  assert.match(list, /cursor: pointer/);
  assert.match(list, /prefers-reduced-motion/);
  assert.ok(!/--od-release-/.test(list), 'the alpha has no release tokens');
  const state = read('lib/desktop-logbooks.svelte.js');
  assert.match(state, /bridge\(\)\.logbooks\.exists\(\)/);
  assert.match(state, /bridge\(\)\.logbooks\.forget\(\{ id \}\)/);
  assert.match(state, /bridge\(\)\.logbooks\.relocate\(\{ id \}\)/);
  const preload = readFileSync(new URL('../../desktop/preload.cjs', import.meta.url), 'utf8');
  assert.match(preload, /exists: \(\) => invoke\('od:logbooks', 'exists'\)/);
  assert.match(preload, /relocate: \(options\) => invoke\('od:logbooks', 'relocate', options\)/);
});

test('the colours of the new screens are tokens, in light and dark', () => {
  const theme = read('theme.css');
  for (const name of ['--od-start-fill', '--od-on-start-fill', '--od-start-hover']) assert.equal((theme.match(new RegExp(`${name}:`, 'g')) ?? []).length, 2, name);
  for (const file of ['components/DesktopLogbookStart.svelte', 'components/RecentLogbooks.svelte']) assert.doesNotMatch(read(file), /#[0-9a-fA-F]{3,8}\b/, `${file} hard-codes a colour`);
});

test('the desktop says « cet ordinateur »: a Desktop twin of every Tablet text of the first launch and of the account', () => {
  assert.equal(deviceKey('a.b', 'desktop'), 'a.bDesktop');
  assert.equal(deviceSuffix('desktop'), 'Desktop');
  const pairs = [
    'welcome.noAccountNote',
    'logbook.emptyLocal',
    'firstLaunch.signIn.intro',
    'firstLaunch.signIn.passwordText',
    'firstLaunch.download.copy',
    'firstLaunch.local.phoneOnly',
    'firstLaunch.local.noBackupText',
    'firstLaunch.snackbar.downloaded',
    'firstLaunch.snackbar.local',
    'account.signOutKeeps',
    'account.deleteKeeps',
    'deleteAccount.keepText',
    'deleteAccount.kept',
    'deleteAccount.keptNothing',
    'deleteAccount.next',
    'deleteAccount.question',
  ];
  for (const base of pairs) {
    for (const lang of ['fr', 'en']) {
      const desktop = get(langs[lang], `${base}Desktop`);
      assert.ok(desktop, `${lang} ${base}Desktop`);
      assert.doesNotMatch(desktop, /tablet|tablette|phone|téléphone/i, `${lang} ${base}Desktop names the wrong device`);
    }
  }
  const fr = langs.fr;
  assert.equal(fr.firstLaunch.local.phoneOnlyDesktop, 'Sur cet ordinateur seulement');
  assert.equal(fr.firstLaunch.local.noBackupTextDesktop, 'Si vous perdez ou changez d’ordinateur, le carnet est perdu.');
  assert.equal(fr.welcome.noAccountNoteDesktop, 'Le carnet reste sur cet ordinateur. Vous pourrez le sauvegarder plus tard');
  assert.equal(fr.firstLaunch.snackbar.downloadedDesktop, 'Carnet téléchargé. Il reste sur cet ordinateur, même sans réseau.');
  assert.equal(fr.firstLaunch.snackbar.localDesktop, 'Carnet créé sur cet ordinateur.');
  assert.deepEqual(Object.keys(FIRST_LAUNCH_SNACKBARS_DESKTOP).sort(), ['created', 'downloaded', 'gitDownloaded', 'local']);
  for (const key of Object.values(FIRST_LAUNCH_SNACKBARS_DESKTOP)) assert.ok(get(fr, key) && get(langs.en, key), key);
  assert.equal(get(fr, FIRST_LAUNCH_SNACKBARS_DESKTOP.created), 'Compte créé. Votre carnet est prêt.');
  // The snackbar sits bottom-left after the rail, as on a tablet; the icon of « Sur cet ordinateur seulement » is a computer screen.
  const account = read('lib/account.js');
  assert.match(account, /desktopApp \? FIRST_LAUNCH_SNACKBARS_DESKTOP : layout\.phone \? FIRST_LAUNCH_SNACKBARS : FIRST_LAUNCH_SNACKBARS_TABLET/);
  assert.match(account, /\{ placement: 'start' \}/);
  assert.match(read('pages/WithoutAccount.svelte'), /desktop: 'desktop'/);
  assert.match(read('components/Icon.svelte'), /desktop: 'M4 5h16v10H4zM2 19h20'/);
});

test('the first launch in the desktop app: the tablet screen, a row in any window shape, the drop hint', () => {
  const welcome = read('pages/WelcomeStart.svelte');
  assert.match(welcome, /<p class="od-welcome-start--drop"[^>]*>\{dragging \? t\('desktopLogbooks\.start\.dropHere'\) : t\('desktopLogbooks\.start\.drop'\)\}<\/p>/);
  assert.match(welcome, /\{#if desktopApp\}\s*<p class="od-welcome-start--drop"/);
  assert.match(welcome, /html\.od-desktop-app\) \.od-welcome-start--with-panel \{\s*flex-direction: row;/);
  assert.match(read('components/FirstLaunchPanel.svelte'), /html\.od-desktop-app\) \.od-first-launch-panel \{\s*width: min\(700px, 48\.6%\);/);
  assert.match(read('components/EditorialPage.svelte'), /html\.od-desktop-app \.od-editorial-page--panelled \.page-content\) \{\s*flex-direction: row;/);
  assert.match(read('lib/layout.svelte.js'), /if \(desktopApp\) document\.documentElement\.classList\.add\('od-desktop-app'\)/);
});

test('a drop on the first launch takes files only, starts the logbook of this computer and imports them', async () => {
  const a = { name: 'a.ssrf' };
  const b = { name: 'b.xml' };
  assert.deepEqual(droppedFiles({ types: ['Files'], files: [a, b] }), [a, b]);
  assert.deepEqual(droppedFiles({ types: ['text/plain'], files: [] }), []);
  assert.deepEqual(droppedFiles(null), []);
  const order = [];
  const result = await startWithDrop([a, b], {
    start: async () => order.push('start'),
    importFile: async (f) => {
      order.push(f.name);
      return f === a ? 3 : 2;
    },
  });
  assert.deepEqual(order, ['start', 'a.ssrf', 'b.xml']);
  assert.deepEqual(result, { added: 5, error: '' });
  // A file that fails is reported, the others still go in.
  const failed = await startWithDrop([a, b], {
    start: async () => {},
    importFile: async (f) => {
      if (f === a) throw new Error('NO_DIVES');
      return 2;
    },
  });
  assert.deepEqual(failed, { added: 2, error: 'NO_DIVES' });
  // The page takes the drop first (capture phase) and keeps the logbook's own drop handler from taking it too.
  const welcome = read('pages/WelcomeStart.svelte');
  assert.match(welcome, /addEventListener\('drop', drop, true\)/);
  assert.match(welcome, /e\.stopImmediatePropagation\(\)/);
  assert.match(welcome, /if \(!shown \|\| !logbook\.welcome\) return;/);
});
