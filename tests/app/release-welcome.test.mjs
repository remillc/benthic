// First launch of the release edition (tasks 2026-11-15-213 and 218): the edition switch, the steps and their order,
// the logbook name → file name rule, the import summary, the texts, the beta left as it is, the paths that end in an
// open logbook. The screens need Framework7 and a WebView: they are read from their source; the logic runs here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { edition, isRelease, editionFrom } from '../../app/src/lib/edition.js';
import { CLOUD_SERVICES, cloudComing, createDeviceLogbook, downloadedFile, readImportFile, scaledProfile } from '../../app/src/lib/release-welcome.js';
import { back, backToName, chooseOutcome, forward, hasBack, hasLogbookTitle, importRead, nextStep } from '../../app/src/lib/first-launch-steps.js';
import { logbookFileName, nameFromFile, sanitiseLogbookName } from '../../app/src/lib/logbook-name.js';
import { summariseImport, summaryText } from '../../app/src/lib/import-summary.js';
import { checkDivelogs, downloadDivelogs } from '../../app/src/lib/first-launch-import.js';
import { gitUserName } from '../../app/src/lib/first-launch-git.js';

const root = new URL('../../app/src/', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const langs = Object.fromEntries(['fr', 'en'].map((l) => [l, JSON.parse(read(`i18n/${l}.json`))]));
const sources = {
  page: read('pages/WelcomeStartRelease.svelte'),
  steps: read('components/FirstLaunchSteps.svelte'),
  git: read('components/FirstLaunchGit.svelte'),
  divelogs: read('components/FirstLaunchDivelogs.svelte'),
  webdav: read('components/FirstLaunchWebdav.svelte'),
  row: read('components/ReleaseChoiceRow.svelte'),
  field: read('components/ReleaseField.svelte'),
  empty: read('components/ReleaseEmptyLogbook.svelte'),
  profile: read('components/ReleaseProfile.svelte'),
  entry: read('pages/WelcomeEntry.svelte'),
  logbook: read('pages/Logbook.svelte'),
  logic: read('lib/release-welcome.js'),
  summary: read('lib/import-summary.js'),
  state: read('lib/first-launch.svelte.js'),
};

test('the edition is the release unless VITE_EDITION is alpha', () => {
  assert.equal(editionFrom(undefined), 'release');
  assert.equal(editionFrom(''), 'release');
  assert.equal(editionFrom('nonsense'), 'release');
  assert.equal(editionFrom('release'), 'release');
  assert.equal(editionFrom(' Alpha '), 'alpha');
  assert.equal(edition, 'release');
  assert.equal(isRelease, true);
});

test('the edition is read in one place', () => {
  const found = [];
  for (const file of ['App.svelte', 'pages/WelcomeStart.svelte', 'pages/WelcomeEntry.svelte', 'pages/WelcomeStartRelease.svelte', 'lib/release-welcome.js']) {
    if (read(file).includes('VITE_EDITION')) found.push(file);
  }
  assert.deepEqual(found, []);
  assert.match(read('lib/edition.js'), /import\.meta\.env\.VITE_EDITION/);
});

test('the beta path is unchanged: WelcomeStart knows nothing of the edition, the route picks the page', () => {
  const beta = read('pages/WelcomeStart.svelte');
  // The alpha's own phone band and tablet panel (FirstLaunchBand, FirstLaunchPanel, tasks 233 and 237, on main) is not the release edition.
  assert.doesNotMatch(beta, /edition|release|FirstLaunch(?!Band|Panel|.tabletStart)/i);
  assert.match(beta, /od-first-panelled/);
  assert.match(beta, /welcome\.noAccountNote\$\{deviceSuffix\(deviceKind\(\)\)\}/);
  assert.match(read('App.svelte'), /component: isRelease \? WelcomeEntry : WelcomeStart/);
  // The release edition shows its own screen on phones too (task 2026-11-16-227): never the beta one.
  assert.doesNotMatch(sources.entry, /<WelcomeStart /);
  assert.match(sources.entry, /<WelcomeStartRelease \{f7router\} \/>/);
  // The empty-logbook layout of the release edition is behind the edition switch too.
  assert.match(sources.logbook, /isRelease && layout\.split/);
});

// --- The steps -------------------------------------------------------------------------------------------

/** Plays a list of choices from the first screen; returns the stack after each. */
function play(choices) {
  let stack = ['start'];
  const seen = [stack];
  for (const c of choices) {
    stack = c === 'back' ? back(stack) : c === 'read' ? importRead(stack) : forward(stack, c);
    seen.push(stack);
  }
  return seen;
}

test('step machine: forward order of every path', () => {
  const last = (choices) => play(choices).at(-1);
  assert.deepEqual(last(['create', 'cloud', 'service', 'connected']), ['start', 'new', 'cloudService', 'cloudConnect', 'cloudConnected']);
  assert.deepEqual(last(['create', 'git']), ['start', 'new', 'git']);
  assert.deepEqual(last(['import', 'divelogs', 'submit']), ['start', 'import', 'importDivelogs', 'importProgress']);
  assert.deepEqual(last(['import', 'file']), ['start', 'import', 'importNew']);
  assert.deepEqual(last(['import', 'file', 'git']), ['start', 'import', 'importNew', 'git']);
  assert.deepEqual(last(['open', 'cloud', 'service', 'connected', 'list']), ['start', 'open', 'openCloudService', 'openCloudConnect', 'openCloudConnected', 'openChoose']);
  assert.deepEqual(last(['open', 'git']), ['start', 'open', 'openGit']);
  // « Ouvrir mon carnet OpenDives » in the git note goes to step 5 and « Retour » comes back to the git step.
  assert.deepEqual(last(['create', 'git', 'openLink']), ['start', 'new', 'git', 'open']);
  assert.deepEqual(last(['create', 'git', 'openLink', 'back']), ['start', 'new', 'git']);
});

test('step machine: « Retour » goes back one step along every path, never below the first screen', () => {
  for (const path of [
    ['create', 'cloud', 'service', 'connected'],
    ['create', 'git'],
    ['import', 'divelogs'],
    ['open', 'cloud', 'service', 'connected', 'list'],
    ['open', 'git'],
  ]) {
    const forwards = play(path);
    const backwards = [forwards.at(-1)];
    for (let i = 0; i < path.length; i++) backwards.push(back(backwards.at(-1)));
    assert.deepEqual(backwards.reverse(), forwards, path.join('>'));
  }
  assert.deepEqual(back(['start']), ['start']);
});

test('step machine: a choice that leads nowhere changes nothing; the device path has no extra screen', () => {
  assert.deepEqual(forward(['start', 'new'], 'device'), ['start', 'new']);
  assert.equal(nextStep('new', 'device'), undefined);
  assert.equal(nextStep('start', 'nonsense'), undefined);
});

test('step machine: the pencil returns to the name; the read divelogs.de import skips the form', () => {
  assert.deepEqual(backToName(['start', 'new', 'cloudService', 'cloudConnect']), ['start', 'new']);
  assert.deepEqual(backToName(['start', 'import', 'importNew', 'git']), ['start', 'import', 'importNew']);
  assert.deepEqual(importRead(['start', 'import', 'importDivelogs', 'importProgress']), ['start', 'import', 'importNew']);
  assert.deepEqual(importRead(['start', 'import']), ['start', 'import', 'importNew']);
  // « Retour » from « Nouveau carnet » of a divelogs.de import lands on « Importer un carnet ».
  assert.deepEqual(back(importRead(['start', 'import', 'importDivelogs', 'importProgress'])), ['start', 'import']);
});

test('the page title is the logbook name on the steps after the name, and « Retour » is missing where it must be', () => {
  for (const s of ['cloudService', 'cloudConnect', 'cloudConnected', 'git']) assert.ok(hasLogbookTitle(s), s);
  for (const s of ['start', 'new', 'import', 'open', 'openGit']) assert.ok(!hasLogbookTitle(s), s);
  assert.ok(!hasBack('start'));
  assert.ok(!hasBack('importProgress'));
  assert.ok(hasBack('new'));
});

test('with exactly one logbook found the app opens it without the list', () => {
  assert.equal(chooseOutcome([]), 'none');
  assert.equal(chooseOutcome([{}]), 'open');
  assert.equal(chooseOutcome([{}, {}]), 'list');
});

// --- The name becomes the file name --------------------------------------------------------------------

test('logbook name → file name: the extension, the characters a file name cannot hold, the « (2) » rule', () => {
  assert.equal(logbookFileName('Mon carnet'), 'Mon carnet.ssrf');
  assert.equal(logbookFileName('  Mon   carnet  '), 'Mon carnet.ssrf');
  assert.equal(logbookFileName('Plongées 2024: été / hiver?'), 'Plongées 2024 été hiver.ssrf');
  assert.equal(logbookFileName('a<b>c"d\\e|f*g'), 'abcdefg.ssrf');
  assert.equal(logbookFileName('..Mon carnet..'), 'Mon carnet.ssrf');
  assert.equal(logbookFileName('Tab\there\u0000'), 'Tab here.ssrf');
  assert.equal(logbookFileName('CON'), 'CON_.ssrf');
  assert.equal(logbookFileName(''), '');
  assert.equal(logbookFileName('???'), '');
  assert.equal(logbookFileName('. .'), '');
  assert.equal(sanitiseLogbookName('x'.repeat(300)).length, 100);
  // A file of that name already exists in the OpenDives folder: « (2) », then « (3) »; case is ignored.
  assert.equal(logbookFileName('Mon carnet', ['Mon carnet.ssrf']), 'Mon carnet (2).ssrf');
  assert.equal(logbookFileName('Mon carnet', ['Mon carnet.ssrf', 'Mon carnet (2).ssrf']), 'Mon carnet (3).ssrf');
  assert.equal(logbookFileName('mon CARNET', ['Mon carnet.ssrf']), 'mon CARNET (2).ssrf');
  assert.equal(logbookFileName('Mon carnet', ['Autre.ssrf']), 'Mon carnet.ssrf');
  // The name offered for an imported file.
  assert.equal(nameFromFile('plongees.ssrf', 'Mon carnet'), 'plongees');
  assert.equal(nameFromFile('C:\\x\\mes.plongees.xml', 'Mon carnet'), 'mes.plongees');
  assert.equal(nameFromFile('.ssrf', 'Mon carnet'), 'Mon carnet');
});

test('the git step has no user name field: the token goes with the first segment of the address', () => {
  const valid = (n) => /^[A-Za-z0-9._-]+$/.test(n);
  assert.equal(gitUserName('https://github.com/vous/plongees.git', valid), 'vous');
  assert.equal(gitUserName('https://example.org/', valid), 'git');
  assert.equal(gitUserName('not a url', valid), 'git');
  assert.equal(gitUserName('https://example.org/bad name/x', valid), 'git');
});

// --- The summary of an import ------------------------------------------------------------------------

test('the import summary reads sites and years from Subsurface XML, only the count otherwise', () => {
  const xml = "<divelog><divesites><site uuid='a'/><site uuid='b'/></divesites><dives><dive date='2009-01-02'/><dive date='2026-05-06'/></dives></divelog>";
  assert.deepEqual(summariseImport(312, xml), { dives: 312, sites: 2, firstYear: 2009, lastYear: 2026 });
  assert.deepEqual(summariseImport(5, 'FIT binary'), { dives: 5, sites: null, firstYear: null, lastYear: null });
  assert.deepEqual(summariseImport(5), { dives: 5, sites: null, firstYear: null, lastYear: null });
  const t = (key, p = {}) => `${key}:${JSON.stringify(p)}`;
  assert.match(summaryText({ dives: 3, sites: null, firstYear: null, lastYear: null }, t), /^welcomeSteps\.summaryDives/);
  assert.match(summaryText({ dives: 3, sites: 2, firstYear: 2009, lastYear: 2026 }, t), /summaryYears.*"from":"2009","to":"2026"/);
  assert.match(summaryText({ dives: 3, sites: 2, firstYear: 2020, lastYear: 2020 }, t), /summaryYear:.*"year":"2020"/);
});

// --- Texts -------------------------------------------------------------------------------------------------

const KEPT_FOR_WHERE = ['createHelp', 'openHelp', 'importHelp', 'deviceTitleDesktop', 'deviceHelpDesktop', 'whereTitle', 'whereHelp', 'cloudHelp', 'cloudHelpIphone', 'gitHelp', 'deviceTitle', 'deviceTitlePhone', 'deviceTitleIphone', 'deviceHelp', 'deviceHelpPhone', 'deviceHelpIphone'];

test('every text of the release screens is in fr and en, none is unused', () => {
  const keys = new Set();
  for (const src of [sources.page, sources.steps, sources.git, sources.divelogs, sources.webdav, sources.profile, sources.logic, sources.summary, sources.logbook, sources.state, read('components/OdPlusChip.svelte')]) {
    for (const m of src.matchAll(/'(welcome(?:Release|Steps)\.\w+)'/g)) keys.add(m[1]);
    // A text that names the device has a phone variant, chosen by layout.phone (lib/first-launch-phone.js).
    // The desktop app's variant (« cet ordinateur », task 2026-11-16-228) and the iPhone's (task 2026-11-16-261);
    // `iphoneKey` is a text that differs only on an iPhone.
    for (const m of src.matchAll(/deviceKey\('(welcomeSteps\.\w+)'/g)) {
      for (const suffix of ['Phone', 'Iphone', 'Desktop']) keys.add(`${m[1]}${suffix}`);
    }
    for (const m of src.matchAll(/iphoneKey\('(welcomeSteps\.\w+)'/g)) keys.add(`${m[1]}Iphone`);
  }
  assert.ok(keys.size >= 80, `only ${keys.size} keys found`);
  for (const lang of ['fr', 'en']) {
    for (const key of keys) {
      const value = key.split('.').reduce((o, k) => o?.[k], langs[lang]);
      assert.ok(typeof value === 'string' || (value && typeof value === 'object'), `${lang}: ${key}`);
    }
  }
  for (const group of ['welcomeRelease', 'welcomeSteps']) {
    for (const key of Object.keys(langs.fr[group])) {
      // The texts of « Où le garder ? » (name step before task 2026-11-17-263) stay for the server screens' own step; the old first-step texts stay for the desktop's recent-logbooks screen.
      if (group === 'welcomeSteps' && KEPT_FOR_WHERE.includes(key)) continue;
      assert.ok(keys.has(`${group}.${key}`), `unused: ${group}.${key}`);
    }
    assert.deepEqual(Object.keys(langs.fr[group]).sort(), Object.keys(langs.en[group]).sort());
    assert.doesNotMatch(JSON.stringify(langs.fr[group]) + JSON.stringify(langs.en[group]), /Subsurface/);
  }
  // fr-CA only holds what differs from fr.
  assert.equal(read('i18n/fr-CA.json').includes('welcomeSteps'), false);
});

test('the removed line « Aucune plongée n’est envoyée à OpenDives. » is nowhere', () => {
  const all = [JSON.stringify(langs.fr), JSON.stringify(langs.en), ...Object.values(sources)].join('\n');
  assert.doesNotMatch(all, /envoyée à OpenDives|sent to OpenDives|welcomeRelease\.privacy|od-welcome-release--privacy/);
  assert.equal(langs.fr.welcomeRelease.privacy, undefined);
  assert.equal(langs.en.welcomeRelease.privacy, undefined);
});

test('the old dialog and its rows are gone', () => {
  assert.throws(() => read('components/OpenImportDialog.svelte'));
  assert.doesNotMatch(sources.page, /OpenImportDialog|dialogOpen|haveOne/);
  for (const key of ['choicesTitle', 'openTitle', 'chooseFile', 'importTitle']) assert.equal(langs.fr.welcomeRelease[key], undefined, key);
});

test('the texts of the mock-ups, in French', () => {
  const s = langs.fr.welcomeSteps;
  assert.equal(s.startTitle, 'Pour commencer');
  assert.equal(s.createTitle, 'Créer un carnet');
  assert.equal(s.importTitle, 'Importer un carnet');
  assert.equal(s.openTitle, 'Ouvrir mon carnet Benthic');
  assert.equal(s.nameLabel, 'Nom du carnet');
  assert.equal(s.nameHelp, 'Il s’affiche en haut du carnet et nomme son fichier.');
  assert.equal(s.whereTitle, 'Où le garder ?');
  assert.equal(s.deviceTitle, 'Seulement sur cette tablette');
  assert.equal(s.connect, 'Se connecter à {service}');
  assert.equal(s.connectedCreate, '« {file} » sera créé dans le dossier Benthic de ce compte.');
  assert.equal(s.credentialsNote, 'Benthic ne garde pas ces identifiants.');
  assert.equal(s.progressDownload, 'Téléchargement des plongées');
  assert.equal(s.seeLogbooks, 'Voir mes carnets');
  assert.equal(s.openLogbook, 'Ouvrir le carnet');
  // « Essayer avec un carnet d’exemple » stays hidden until to-do #69.
  assert.doesNotMatch(JSON.stringify(langs.fr.welcomeSteps), /exemple/);
});

// --- Cloud ------------------------------------------------------------------------------------------------

test('four cloud services with generic icons, never a brand logo; « coming » until idea #74', () => {
  assert.deepEqual(CLOUD_SERVICES.map((r) => r.key), ['googleDrive', 'oneDrive', 'dropbox', 'webdav']);
  assert.deepEqual(CLOUD_SERVICES.map((r) => r.icon), ['cloud', 'cloud', 'cloud', 'server']);
  assert.doesNotMatch(sources.steps, /<img[^>]*(drive|dropbox|onedrive)/i);
  const shown = [];
  cloudComing((text) => shown.push(text), (key) => `<${key}>`);
  assert.deepEqual(shown, ['<welcomeSteps.cloudSoon>']);
  // « Se connecter à {service} », « Changer de compte » and « Créer le carnet » (connected) say so
  // (task 224: « Se connecter » starts the connection once the cloud exists, see first-launch-complete.test.mjs).
  assert.match(sources.steps, /function signIn\(\) \{\s*(?:if \(realCloud\) return void desktopSignIn\(step === 'cloudConnected'\);\s*)?if \(!CLOUD_CONNECTION_AVAILABLE\) return cloud\(\);/);
  assert.match(sources.steps, /function cloud\(\) \{\s*cloudComing\(showSnackbar, t\);/);
});

// --- The working paths ----------------------------------------------------------------------------------

function deviceFakes({ exists = false, sample = [1, 2] } = {}) {
  const calls = [];
  return {
    calls,
    deps: {
      deviceLogExists: async () => exists,
      start: async () => calls.push(['start']),
      sampleIds: () => sample,
      remove: async (ids) => calls.push(['remove', ids]),
    },
  };
}

test('« Seulement sur cette tablette »: the device logbook is started and emptied of the sample, no extra screen', async () => {
  const { calls, deps } = deviceFakes();
  assert.equal(await createDeviceLogbook(deps), 0);
  assert.deepEqual(calls, [['start'], ['remove', [1, 2]]]);
  assert.match(sources.steps, /start: startWithoutAccount/);
  assert.match(sources.steps, /disabled=\{busy \|\| nameInvalid\} onclick=\{createOnDevice\}/);
});

test('a file or a divelogs.de download goes into the new device logbook with the app’s import', async () => {
  const { calls, deps } = deviceFakes();
  const n = await createDeviceLogbook(deps, async () => (calls.push(['import']), 3));
  assert.equal(n, 3);
  assert.deepEqual(calls, [['start'], ['remove', [1, 2]], ['import']]);
  const again = deviceFakes({ exists: true });
  await createDeviceLogbook(again.deps, async () => 1);
  assert.ok(!again.calls.some((c) => c[0] === 'remove'), 'an existing device logbook keeps its dives');
  assert.match(sources.steps, /importFile\(source\.file\)/);
  // A resumable divelogs.de download is several files (task 224): each is read back, imported and discarded.
  assert.match(sources.steps, /for \(const path of source\.paths \?\? \[source\.path\]\)[\s\S]*downloadedFile\(path/);
});

test('the picked file is read first without touching anything; no dive, or unreadable, leaves first launch as it was', async () => {
  const calls = [];
  const deps = (dives, fail = false) => ({
    readBase64: async () => 'QUJD',
    stage: async (o) => (calls.push(['stage', o.name]), { path: '/cache/x' }),
    count: async () => {
      if (fail) throw new Error('IMPORT_FAILED');
      return { dives };
    },
    discard: async (o) => calls.push(['discard', o.path]),
  });
  assert.equal(await readImportFile({ name: 'a.ssrf' }, deps(7)), 7);
  assert.deepEqual(calls.splice(0), [['stage', 'a.ssrf'], ['discard', '/cache/x']]);
  await assert.rejects(() => readImportFile({ name: 'a.xml' }, deps(0)), { message: 'NO_DIVES' });
  await assert.rejects(() => readImportFile({ name: 'a.xml' }, deps(1, true)), { message: 'IMPORT_FAILED' });
  assert.ok(calls.some((c) => c[0] === 'discard'));
});

test('the downloaded divelogs.de archive is read back through the WebView’s file URL', async () => {
  const file = await downloadedFile('/cache/x.dld', (p) => `https://localhost/_capacitor_file_${p}`, async (url) => ({ ok: true, blob: async () => new Blob([url]) }));
  assert.equal(file.name, 'divelogs.dld');
  await assert.rejects(() => downloadedFile('/x', (p) => p, async () => ({ ok: false, blob: async () => new Blob([]) })), { message: 'IMPORT_FAILED' });
});

function divelogsCalls(over = {}) {
  const log = [];
  return {
    log,
    calls: {
      check: async (o) => (log.push(['check', o.user]), { dives: 312 }),
      download: async (o) => (log.push(['download', o.user]), { dives: 312, path: '/cache/dl' }),
      count: async () => (log.push(['count']), { dives: 312 }),
      discard: async (o) => log.push(['discard', o.path]),
      ...over,
    },
  };
}

test('divelogs.de: credentials checked, then downloaded and counted, nothing added, credentials never stored', async () => {
  const { log, calls } = divelogsCalls();
  assert.equal(await checkDivelogs(calls, { user: ' christian ', password: 'x' }), 312);
  const seen = [];
  const readResult = await downloadDivelogs(calls, { user: 'christian', password: 'x' }, 312, (s) => seen.push(s), () => false);
  assert.deepEqual(readResult, { path: '/cache/dl', dives: 312 });
  assert.deepEqual(seen.map((s) => s.phase), ['download', 'read']);
  assert.deepEqual(log.map((c) => c[0]), ['check', 'download', 'count']);
  assert.equal(log[0][1], 'christian');
  // Nothing in the screens writes the credentials anywhere.
  for (const src of [sources.divelogs, read('lib/first-launch-import.js'), sources.state]) assert.doesNotMatch(src, /deviceStore|localStorage|setItem/);
});

test('divelogs.de: « Annuler » keeps nothing; an empty or unreadable download is discarded', async () => {
  const { log, calls } = divelogsCalls();
  assert.equal(await downloadDivelogs(calls, { user: 'u', password: 'p' }, 1, () => {}, () => true), null);
  assert.deepEqual(log.at(-1), ['discard', '/cache/dl']);
  const none = divelogsCalls({ count: async () => ({ dives: 0 }) });
  await assert.rejects(() => downloadDivelogs(none.calls, { user: 'u', password: 'p' }, 1, () => {}, () => false), { message: 'NO_DIVES' });
  assert.ok(none.log.some((c) => c[0] === 'discard'));
  const bad = divelogsCalls({ count: async () => { throw new Error('IMPORT_FAILED'); } });
  await assert.rejects(() => downloadDivelogs(bad.calls, { user: 'u', password: 'p' }, 1, () => {}, () => false), { message: 'IMPORT_FAILED' });
  assert.ok(bad.log.some((c) => c[0] === 'discard'));
});

test('git: create needs an empty repository, open a repository with a logbook; both then open the logbook', () => {
  assert.match(sources.git, /create && !found\.empty/);
  assert.match(sources.git, /!create && found\.empty/);
  assert.match(sources.git, /OpenDivesCore\.gitConnect\(/);
  assert.match(sources.git, /await accountReady\(\)/);
  assert.match(sources.steps, /<FirstLaunchGit create router=\{f7router\} afterConnect=\{afterGit\}/);
  assert.match(sources.steps, /<FirstLaunchGit create=\{false\}/);
});

test('the name is kept as the logbook’s label on the device through the device store', () => {
  assert.match(sources.steps, /deviceStore\.setItem\('od\.logbookName'/);
  assert.doesNotMatch(sources.steps, /localStorage/);
});

// --- Look and rules --------------------------------------------------------------------------------------

test('the profile is drawn to the size it is given and keeps its shape', () => {
  const land = scaledProfile(588, 300);
  assert.match(land.line, /^M0\.0 12\.6 C/);
  assert.match(land.line, / 588\.0 12\.6$/);
  assert.deepEqual(land.deepest, { x: 78.2, y: 284.7 });
  const port = scaledProfile(688, 220);
  assert.match(port.line, / 688\.0 9\.2$/);
  assert.equal(port.area, `${port.line} Z`);
});

test('the left panel is kept and plays its line only when the page opens, not on each step', () => {
  assert.match(sources.page, /<ReleaseProfile \/>/);
  assert.match(sources.page, /<FirstLaunchSteps \{f7router\} \/>/);
  // The panel is outside the stepped column: its content does not change with the step. Only its height does, in
  // portrait (540 dp from the second step on, task 224).
  assert.doesNotMatch(sources.page, /\{#key|\{#if[^}]*flow\./);
  assert.match(sources.page, /flow\.stack\.length > 1/);
  assert.match(sources.profile, /1\.6s cubic-bezier\(0\.2, 0, 0, 1\)/);
});

test('shared-axis X: 30 dp, the leaving step fades in the first 30 %, « Retour » plays it backwards, reduced motion cuts it', () => {
  const s = sources.steps;
  assert.match(s, /translate: 30px 0/);
  assert.match(s, /translate: -30px 0/);
  assert.match(s, /od-first-launch--in-forward/);
  assert.match(s, /od-first-launch--out-back/);
  assert.match(s, /\* 0\.3/);
  assert.match(s, /--od-motion-spatial-default/);
  assert.match(s, /--od-motion-effects-default/);
  assert.match(s, /prefers-reduced-motion: reduce/);
  assert.match(s, /reducedMotion\(\) \? 0/);
  assert.match(sources.state, /flow\.direction = 'back'/);
});

test('every action has the hand pointer and a hover state; no colour is written in a component', () => {
  for (const key of ['steps', 'git', 'divelogs', 'row', 'empty']) {
    assert.match(sources[key], /cursor: pointer/, key);
    assert.match(sources[key], /@media \(hover: hover\)/, key);
    assert.doesNotMatch(sources[key], /#[0-9A-Fa-f]{3,8}\b|rgb\(/, key);
  }
  assert.match(sources.field, /@media \(hover: hover\)/);
  assert.doesNotMatch(sources.field, /#[0-9A-Fa-f]{3,8}\b|rgb\(/);
  const theme = read('theme.css');
  for (const name of ['--od-release-panel-1', '--od-release-glow', '--od-release-tile', '--od-release-note', '--od-release-ok', '--od-release-field-border']) {
    assert.ok(theme.includes(`${name}:`), name);
  }
  assert.ok(theme.slice(theme.indexOf('html.dark {')).includes('--od-release-ok:'));
  for (const gone of ['--od-release-scrim', '--od-release-dialog-shadow', '--od-release-label']) assert.ok(!theme.includes(gone), gone);
  assert.match(sources.steps, /class="od-first-launch"/);
});

test('every step shows the help link « Une question ? À propos et contact » (task 219)', () => {
  assert.match(sources.steps, /<WelcomeHelpLink \/>/);
  assert.doesNotMatch(sources.steps, /\{#if[^}]*\}\s*<WelcomeHelpLink/);
});

test('the tablet empty logbook: the dive computer button and the three ways, over the empty detail pane (task 220)', () => {
  assert.match(sources.empty, /name="diveComputer"/);
  assert.match(sources.empty, /logbook\.emptyDownload/);
  assert.doesNotMatch(sources.empty, /class="[^"]*bubble/);
  assert.match(sources.empty, /width: min\(520px, 100%\)/);
  assert.match(sources.logbook, /<ReleaseEmptyLogbook/);
  for (const lang of ['fr', 'en']) assert.ok(langs[lang].logbook.emptyDownload);
});
