// The release edition's first launch in the desktop app (task 2026-11-16-228; mock-ups
// docs/mockups/bureau-premier-lancement-production*.dc.html): the window without a logbook shows « Pour commencer » in
// the release edition and keeps its start screen in the beta; « cet ordinateur » texts; the drop line and the drop;
// iCloud Drive on macOS only; the dives brought are parked while the window reloads on its new logbook and imported
// after; the cloud sign-in is the main process's. The screens need Framework7 and Electron: their markup and CSS are
// read from the source, the logic runs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deviceKey, deviceKind } from '../../app/src/lib/first-launch-phone.js';
import { cloudServices, CLOUD_SERVICES } from '../../app/src/lib/release-welcome.js';
import { forward, back, nextStep } from '../../app/src/lib/first-launch-steps.js';
import {
  PENDING_IMPORT_KEY,
  DROP_STEPS,
  droppedFiles,
  nameFromGitUrl,
  parkPending,
  pendingFromSource,
  runPending,
  signInFailure,
  signInTo,
  takePending,
} from '../../app/src/lib/desktop-first-launch.js';

const root = new URL('../../app/src/', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const langs = Object.fromEntries(['fr', 'en'].map((l) => [l, JSON.parse(read(`i18n/${l}.json`))]));

/** A storage like sessionStorage. */
function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => void map.set(k, String(v)), removeItem: (k) => void map.delete(k), map };
}

// --- Which screen ----------------------------------------------------------------------------------------

test('the release edition shows « Pour commencer » in the window without a logbook; the beta keeps its start screen', () => {
  const app = read('App.svelte');
  assert.match(app, /\{#if desktopApp && noLogbook\}\{#if isRelease\}<DesktopFirstLaunch \/>\{:else\}<DesktopLogbookStart \/>\{\/if\}\{\/if\}/);
  // The beta's screen is the one it always was: its own file, still the start screen of task 2026-11-15-173.
  const start = read('components/DesktopLogbookStart.svelte');
  assert.match(start, /desktopLogbooks\.start\.empty/);
  assert.doesNotMatch(start, /FirstLaunchSteps|welcomeSteps/);
  assert.doesNotMatch(read('pages/WelcomeEntry.svelte'), /Desktop/);
});

test('« Pour commencer »: the 700 dp blue panel on the left over the window’s height, the steps on the right', () => {
  const screen = read('components/DesktopFirstLaunch.svelte');
  assert.match(screen, /import FirstLaunchSteps from '\.\/FirstLaunchSteps\.svelte'/);
  assert.match(screen, /inset: 0;/);
  assert.match(screen, /max-width: 700px;/);
  assert.match(screen, /width: 48\.6%;/);
  // Above the navigation rail (z-index 6000), which the mock-ups do not show.
  const rail = Number(read('components/NavRail.svelte').match(/z-index: (\d+)/)[1]);
  assert.ok(Number(screen.match(/z-index: (\d+)/)[1]) > rail);
  // Its colours are the tablet’s tokens.
  assert.doesNotMatch(screen, /#[0-9A-Fa-f]{3,8}\b/);
  assert.match(screen, /var\(--bc-release-panel-1\)/);
  // The smallest window (760 x 560): a narrower panel, and a column that scrolls with the help link after it.
  assert.match(screen, /@media \(max-width: 1100px\)/);
  assert.match(screen, /@media \(max-height: 700px\)/);
  assert.match(read('../../desktop/windows.cjs'), /minWidth: 768,\s+minHeight: 560/);
});

test('the help link opens the desktop About where there is no view of its own', () => {
  const link = read('components/WelcomeHelpLink.svelte');
  assert.match(link, /if \(!view\) f7\.views\.get\('#view-logbook'\)\?\.router\.navigate\('\/about'\);/);
  // About is a popup on the desktop (App.svelte): it opens above the screen, which only steps aside for the token help page.
  assert.match(read('App.svelte'), /path: '\/about',[\s\S]*?popup: \{ component: About \}/);
  assert.match(read('components/DesktopFirstLaunch.svelte'), /pushed = path\.startsWith\('\/welcome\/'\)/);
});

// --- Texts -----------------------------------------------------------------------------------------------

test('« cet ordinateur »: the texts that name the device have a desktop variant, chosen in the desktop app', () => {
  assert.equal(deviceKey('welcomeSteps.deviceTitle', deviceKind({ phone: false, desktop: true })), 'welcomeSteps.deviceTitleDesktop');
  assert.equal(deviceKey('welcomeSteps.deviceTitle', deviceKind({ phone: true, desktop: true })), 'welcomeSteps.deviceTitleDesktop', 'a narrow window is still the desktop');
  assert.equal(deviceKey('welcomeSteps.deviceTitle', deviceKind({ phone: true })), 'welcomeSteps.deviceTitlePhone');
  assert.equal(deviceKey('welcomeSteps.deviceTitle', deviceKind({ phone: false })), 'welcomeSteps.deviceTitle');
  const wanted = {
    fr: {
      deviceTitleDesktop: 'Seulement sur cet ordinateur',
      gitTokenHelpDesktop: 'Le jeton reste sur cet ordinateur.',
      deviceHelpDesktop: 'Aucun compte requis. Vous ne pourrez l’ouvrir que sur cet ordinateur.',
      dropLine: 'Vous pouvez aussi déposer un fichier carnet sur cette fenêtre.',
    },
    en: {
      deviceTitleDesktop: 'Only on this computer',
      gitTokenHelpDesktop: 'The token stays on this computer.',
      deviceHelpDesktop: 'No account needed. You will only be able to open it on this computer.',
      dropLine: 'You can also drop a logbook file on this window.',
    },
  };
  for (const lang of ['fr', 'en']) {
    const steps = langs[lang].welcomeSteps;
    for (const [key, text] of Object.entries(wanted[lang])) assert.equal(steps[key], text, `${lang} ${key}`);
    assert.match(steps.webdavHelpDesktop, /computer|ordinateur/);
    for (const key of ['deviceTitleDesktop', 'deviceHelpDesktop', 'gitTokenHelpDesktop', 'webdavHelpDesktop']) assert.doesNotMatch(steps[key], /tablette|tablet|téléphone|phone/i);
    assert.equal(steps.icloud, 'iCloud Drive');
  }
  assert.ok(langs.fr.welcomeSteps.webdavHelpDesktop.endsWith('Il reste sur cet ordinateur.'));
  const steps = read('components/FirstLaunchSteps.svelte');
  // The first step's choice (task 2026-11-17-264); the texts above stay for the « Où le garder ? » step of the server screens.
  assert.match(steps, /deviceKey\('welcomeSteps\.localTitle', kind\)/);
  assert.equal(langs.fr.welcomeSteps.localTitleDesktop, 'Commencer un carnet sur cet ordinateur');
  assert.equal(langs.en.welcomeSteps.localTitleDesktop, 'Start a logbook on this computer');
});

test('the sign-in hint reads on two lines, centred, on the desktop too (task 230)', () => {
  assert.equal(langs.fr.welcomeSteps.connectHint, 'La page de connexion du service s’ouvre.\nVous revenez ici ensuite.');
  const steps = read('components/FirstLaunchSteps.svelte');
  assert.match(steps, /\.bc-first-launch--hint \{\s+align-self: center;[\s\S]*?white-space: pre-line;/);
  assert.match(steps, /\.bc-first-launch--action\.bc-first-launch--action-centre \{\s+align-self: center;/);
  // The desktop keeps the button centred where a narrow window would match the phone rules.
  assert.match(steps, /\.bc-first-launch--desktop \{[\s\S]*?(?:\.bc-first-launch--action\.|&\.)bc-first-launch--action-centre \{\s+align-self: center;/);
});

// --- The drop --------------------------------------------------------------------------------------------

test('the drop line sits under the choices of « Pour commencer » and « Importer un carnet », in the desktop app only', () => {
  const steps = read('components/FirstLaunchSteps.svelte');
  assert.match(steps, /\{#snippet dropLine\(\)\}\s*\{#if desktopApp\}\s*<p class="bc-first-launch--drop">\{t\('welcomeSteps\.dropLine'\)\}<\/p>/);
  // Right after the text buttons of the first step, after the compact choices of the recents screen (task 241) and after
  // the rows of the import step, and nowhere else.
  assert.equal((steps.match(/\{@render dropLine\(\)\}/g) ?? []).length, 3);
  assert.match(steps, /go\('discover'\)\}>\{t\('welcomeSteps\.discoverPlus'\)\}<\/button>\s*<\/div>\s*\{@render dropLine\(\)\}/);
  assert.match(steps, /go\('divelogs'\)\} \/>\s*<\/nav>\s*\{@render dropLine\(\)\}/);
  assert.deepEqual([...DROP_STEPS], ['start', 'import']);
});

test('dropping a file starts the import with it, as « Un fichier » does; from the first screen it goes through « Importer un carnet »', () => {
  const steps = read('components/FirstLaunchSteps.svelte');
  assert.match(steps, /if \(currentStep\(\) === 'start'\) go\('import'\);\s*void bring\(files\);/);
  // « Un fichier » and the drop share the one reading of the files.
  assert.match(steps, /async function fileChosen\(\) \{[\s\S]*?await bring\(files\);/);
  assert.match(steps, /async function bring\(files\) \{[\s\S]*?readImportFile\(file,/);
  // Only on the steps that take it; a drop anywhere is kept from opening the file in the window.
  assert.match(steps, /const takes = \(\) => DROP_STEPS\.includes\(currentStep\(\)\) && !busy;/);
  assert.match(steps, /const drop = \(e\) => \{[\s\S]*?e\.preventDefault\(\);[\s\S]*?if \(!files\.length \|\| !takes\(\)\) return;/);
  assert.match(steps, /\.bc-first-launch--dragging \.bc-first-launch--drop/);
});

test('a drop carries files or it is not ours: text and links are left alone', () => {
  const a = new File(['<divelog/>'], 'a.ssrf');
  assert.deepEqual(droppedFiles({ types: ['Files'], files: [a] }), [a]);
  assert.deepEqual(droppedFiles({ types: ['text/plain'], files: [] }), []);
  assert.deepEqual(droppedFiles({ types: ['Files'], files: [] }), []);
  assert.deepEqual(droppedFiles(null), []);
});

// --- iCloud Drive ----------------------------------------------------------------------------------------

test('iCloud Drive is offered on macOS only, before WebDAV; Windows and Linux do not show it', () => {
  assert.deepEqual(cloudServices().map((s) => s.key), ['googleDrive', 'oneDrive', 'dropbox', 'webdav']);
  assert.deepEqual(cloudServices({ mac: true }).map((s) => s.key), ['googleDrive', 'oneDrive', 'dropbox', 'icloud', 'webdav']);
  assert.equal(cloudServices(), CLOUD_SERVICES);
  assert.deepEqual(CLOUD_SERVICES.map((s) => s.key), ['googleDrive', 'oneDrive', 'dropbox', 'webdav']);
  const steps = read('components/FirstLaunchSteps.svelte');
  assert.match(steps, /const services = \$derived\(cloudServices\(\{ iphone, mac: desktopMac \}\)\);/);
  assert.match(steps, /\{#each services as s \(s\.key\)\}/);
});

test('iCloud Drive has no sign-in screen: the choice goes straight to the connected screen, in both lists', () => {
  assert.equal(nextStep('cloudService', 'icloud'), 'cloudConnected');
  assert.equal(nextStep('openCloudService', 'icloud'), 'openCloudConnected');
  const stack = forward(['start', 'new', 'where', 'cloudService'], 'icloud');
  assert.deepEqual(stack, ['start', 'new', 'where', 'cloudService', 'cloudConnected']);
  assert.deepEqual(back(stack), ['start', 'new', 'where', 'cloudService'], '« Retour » goes to the list, not to a sign-in screen');
  assert.deepEqual(forward(['start', 'open', 'openCloudService'], 'icloud').slice(-1), ['openCloudConnected']);
  const steps = read('components/FirstLaunchSteps.svelte');
  assert.match(steps, /go\(key === 'webdav' \? 'webdav' : key === 'icloud' \? 'icloud' : 'service'\)/);
  // The Mac’s own account: no « Changer de compte »; creating in iCloud Drive says the cloud is coming (stubbed).
  assert.match(steps, /\{#if service\.key !== 'icloud'\}\s*<button[^>]*>\{t\('welcomeSteps\.changeAccount'\)\}/);
  assert.match(steps, /if \(!windowTakes \|\| service\.key === 'icloud'\) return cloud\(\);/);
  assert.match(steps, /flow\.account = t\(iphone \? 'welcomeSteps\.icloudAccountIphone' : 'welcomeSteps\.icloudAccountDesktop'\)/);
});

// --- The window takes the new logbook --------------------------------------------------------------------

test('the dives brought are parked, then imported once the new logbook is open, and the staged files are deleted', async () => {
  const file = new File(['<divelog/>'], 'plongees.ssrf');
  const pending = await pendingFromSource({ kind: 'file', file, name: 'plongees', summary: /** @type {any} */ ({}) }, async (f) => `/tmp/import/${f.name}`);
  assert.deepEqual(pending, { files: [{ path: '/tmp/import/plongees.ssrf', name: 'plongees.ssrf' }] });
  const storage = memoryStorage();
  parkPending(storage, pending);
  assert.ok(storage.map.has(PENDING_IMPORT_KEY));
  const taken = takePending(storage);
  assert.deepEqual(taken, pending);
  assert.equal(takePending(storage), null, 'taken once');

  const log = [];
  const added = await runPending(/** @type {any} */ (taken), {
    read: async (path) => new TextEncoder().encode(`bytes of ${path}`),
    importFile: async (f) => {
      log.push(`import ${f.name} ${await f.text()}`);
      return 29;
    },
    importCsv: async () => assert.fail('not a CSV'),
    remove: async (path) => void log.push(`remove ${path}`),
  });
  assert.equal(added, 29);
  assert.deepEqual(log, ['import plongees.ssrf bytes of /tmp/import/plongees.ssrf', 'remove /tmp/import/plongees.ssrf']);
});

test('a CSV and its companion, and a divelogs.de download, are parked as they are imported', async () => {
  const csv = new File(['a,b'], 'dive.csv');
  const txt = new File(['x'], 'dive.txt');
  const params = { separator: ',', columns: ['time', 'depth'] };
  const pending = await pendingFromSource(
    { kind: 'file', file: csv, name: 'dive', summary: /** @type {any} */ ({}), csv: { params: /** @type {any} */ (params), companion: txt } },
    async (f) => `/i/${f.name}`,
  );
  assert.deepEqual(pending, { files: [{ path: '/i/dive.csv', name: 'dive.csv' }, { path: '/i/dive.txt', name: 'dive.txt' }], csv: { params, companion: true } });
  const seen = [];
  await runPending(pending, {
    read: async () => new Uint8Array(),
    importFile: async () => assert.fail('a CSV goes through the CSV import'),
    importCsv: async (f, p, companion) => (seen.push([f.name, p, companion?.name]), 3),
    remove: async () => {},
  });
  assert.deepEqual(seen, [['dive.csv', params, 'dive.txt']]);

  const divelogs = await pendingFromSource(
    { kind: 'divelogs', path: '/i/a', paths: ['/i/a', '/i/b'], name: 'x', summary: /** @type {any} */ ({}) },
    async () => assert.fail('already staged'),
  );
  assert.deepEqual(divelogs.files.map((f) => f.path), ['/i/a', '/i/b']);
  const imported = [];
  const total = await runPending(divelogs, { read: async () => new Uint8Array(), importFile: async (f) => (imported.push(f.name), 10), importCsv: async () => 0, remove: async () => {} });
  assert.equal(total, 20);
  assert.deepEqual(imported, ['divelogs.dld', 'divelogs.dld']);
});

test('a failed import still deletes the staged files; a parked record that is not one is dropped', async () => {
  const removed = [];
  await assert.rejects(
    runPending(
      { files: [{ path: '/i/a', name: 'a.ssrf' }] },
      { read: async () => new Uint8Array(), importFile: async () => Promise.reject(new Error('IMPORT_FAILED')), importCsv: async () => 0, remove: async (p) => void removed.push(p) },
    ),
    /IMPORT_FAILED/,
  );
  assert.deepEqual(removed, ['/i/a']);
  for (const junk of ['not json', '{}', '{"files":[]}', '{"files":[{"path":1}]}', 'null']) {
    const storage = memoryStorage();
    storage.setItem(PENDING_IMPORT_KEY, junk);
    assert.equal(takePending(storage), null, junk);
    assert.equal(storage.getItem(PENDING_IMPORT_KEY), null, 'and gone');
  }
});

test('the window without a logbook creates through the main process; the rest runs once the new logbook has loaded', () => {
  const steps = read('components/FirstLaunchSteps.svelte');
  assert.match(steps, /const windowTakes = desktopApp && noLogbook;/);
  // « Seulement sur cet ordinateur », the cloud, WebDAV and git all go through one call, with the dives parked first.
  assert.match(steps, /createInWindow\(\{ where: 'computer' \}\)/);
  assert.match(steps, /createInWindow\(\{ where: 'cloud', provider: flow\.service \}\)/);
  assert.match(steps, /createInWindow\(\{ where: 'cloud', provider: 'webdav'/);
  assert.match(steps, /createInWindow\(\{ where: 'git', \.\.\.access \}/);
  assert.match(steps, /parkPending\(sessionStorage, pending\);[\s\S]*?bridge\(\)\.logbooks\.create\(/);
  // Elsewhere (the first start of the logbook of this computer) nothing changes.
  assert.match(steps, /if \(windowTakes\) \{\s*try \{\s*await createInWindow\(\{ where: 'computer' \}\);[\s\S]*?return;\s*\}\s*try \{\s*rememberName\(\);/);
  const app = read('App.svelte');
  assert.match(app, /desktopApp && !noLogbook && !sideWindow && !logbook\.loading && !logbook\.welcome && !logbook\.error\) void resumePendingImport\(\)/);
  assert.match(read('lib/desktop-pending-import.js'), /takePending\(sessionStorage\)/);
});

// --- The cloud -------------------------------------------------------------------------------------------

test('the sign-in is the desktop’s own in the window without a logbook, on the path that creates a logbook', () => {
  const steps = read('components/FirstLaunchSteps.svelte');
  assert.match(steps, /const realCloud = \$derived\(windowTakes && \(step === 'cloudConnect' \|\| step === 'cloudConnected'\)\)/);
  assert.match(steps, /signInTo\(bridge\(\)\.logbooks, provider, another\)/);
  assert.match(steps, /cloudCancelSignIn\(\{ provider: flow\.service \}\)/);
  assert.match(steps, /cloudReopenSignIn\(\{ provider: flow\.service \}\)/);
  // « Retour » and « Annuler » give the sign-in up, and the answer of a sign-in given up is dropped.
  assert.match(steps, /function back\(\) \{\s*abandonSignIn\(\);\s*(if \(leavesFirstLaunch\([^)]*\)\) leave\(\);\s*else )?goBack\(\);/);
  assert.match(steps, /if \(run !== signInRun\) return;/);
  // Opening a logbook of the account is not built: the list of the account’s logbooks keeps its « coming » message.
  assert.match(steps, /function seeLogbooks\(\) \{[\s\S]*?cloud\(\);/);
});

test('the outcomes of a sign-in', () => {
  assert.equal(signInFailure({ code: 'SIGN_IN_CANCELLED' }), 'cancelled');
  assert.equal(signInFailure({ code: 'NOT_AVAILABLE' }), 'unavailable');
  for (const code of ['SIGN_IN_DENIED', 'SIGN_IN_TIMEOUT', 'STATE_MISMATCH', 'PORT_BUSY', 'NETWORK']) assert.equal(signInFailure({ code }), 'refused', code);
});

test('a service already signed in answers without opening a page', async () => {
  const calls = [];
  const logbooks = {
    cloudStatus: async () => [{ provider: 'dropbox', available: true, connected: true, account: 'a@b.c' }],
    cloudSignIn: async (o) => (calls.push(o), { provider: o.provider, connected: true, account: 'new@b.c' }),
  };
  assert.equal((await signInTo(logbooks, 'dropbox')).account, 'a@b.c');
  assert.deepEqual(calls, []);
  assert.equal((await signInTo(logbooks, 'dropbox', true)).account, 'new@b.c');
  assert.deepEqual(calls, [{ provider: 'dropbox', switchAccount: true }]);
});

test('a logbook opened from a git address is named after the repository', () => {
  assert.equal(nameFromGitUrl('https://github.com/vous/plongees.git', 'Mon carnet'), 'plongees');
  assert.equal(nameFromGitUrl('https://git.exemple.org/vous/carnet', 'Mon carnet'), 'carnet');
  assert.equal(nameFromGitUrl('not an address', 'Mon carnet'), 'Mon carnet');
});

test('the git and WebDAV forms hand the creation to the window, and tell what it throws like the tablet does', () => {
  const git = read('components/FirstLaunchGit.svelte');
  assert.match(git, /if \(onconnect\) \{\s*await onconnect\(\{ url: address, username, branch: branch\.trim\(\), token: token\.trim\(\) \}\);/);
  // The tablet’s path is the one it was.
  assert.match(git, /await OpenDivesCore\.gitConnect\(\{ url: address, username, token: token\.trim\(\), branch: branch\.trim\(\), empty: !!found\.empty \}\);\s*token = '';\s*await accountReady\(\);/);
  const webdav = read('components/FirstLaunchWebdav.svelte');
  assert.match(webdav, /if \(onsubmit\) await onsubmit\(\);\s*else await connectWebdav\(/);
  assert.match(webdav, /else if \(onfail\) onfail\(e\);/);
});
