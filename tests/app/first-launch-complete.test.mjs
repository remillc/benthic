// First launch of the release edition, the rest (task 2026-11-16-224, parts 1 to 6): the steps added (WebDAV,
// « Créer un carnet ici », the link of the git error), the connection to a cloud service (idle, in progress,
// refused), the errors of the git step, the WebDAV form and divelogs.de, and the download that resumes. The screens
// are read from their source; the logic runs here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { back, backToStep, forward, hasBack, hasLogbookTitle, menuEntry, nextStep } from '../../app/src/lib/first-launch-steps.js';
import { CLOUD_CONNECTION_AVAILABLE, connectWebdav, connectionNext, webdavProblem } from '../../app/src/lib/cloud-connection.js';
import { gitProblem, gitProblemFromCode } from '../../app/src/lib/first-launch-git.js';
import {
  DOWNLOAD_BATCH,
  canResume,
  discardParts,
  downloadDivelogsResumable,
  failureKind,
  newDownloadProgress,
} from '../../app/src/lib/first-launch-import.js';

const root = new URL('../../app/src/', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const langs = Object.fromEntries(['fr', 'en'].map((l) => [l, JSON.parse(read(`i18n/${l}.json`))]));

function play(choices, from = ['start']) {
  let stack = from;
  for (const c of choices) stack = c === 'back' ? back(stack) : forward(stack, c);
  return stack;
}

test('step machine: WebDAV has its own step on both paths', () => {
  assert.deepEqual(play(['create', 'next', 'cloud', 'webdav']), ['start', 'new', 'where', 'cloudService', 'webdav']);
  assert.deepEqual(play(['open', 'cloud', 'webdav']), ['start', 'open', 'openCloudService', 'openWebdav']);
  assert.deepEqual(play(['create', 'next', 'cloud', 'webdav', 'back']), ['start', 'new', 'where', 'cloudService']);
  assert.ok(hasLogbookTitle('webdav'));
  assert.ok(!hasLogbookTitle('openWebdav'));
  assert.ok(hasBack('webdav') && hasBack('openWebdav'));
});

test('step machine: the links of the git error go to the other path, « Retour » comes back', () => {
  assert.deepEqual(play(['open', 'git', 'createLink']), ['start', 'open', 'openGit', 'new']);
  assert.deepEqual(play(['open', 'git', 'createLink', 'back']), ['start', 'open', 'openGit']);
  assert.deepEqual(play(['create', 'next', 'git', 'openLink']), ['start', 'new', 'where', 'git', 'open']);
});

test('step machine: « Aucun carnet dans ce compte » offers « Créer un carnet ici » and « Changer de compte »', () => {
  const none = ['start', 'open', 'openCloudService', 'openCloudConnect', 'openCloudConnected', 'openChoose'];
  assert.equal(nextStep('openChoose', 'createHere'), 'cloudConnected');
  assert.equal(forward(none, 'createHere').at(-1), 'cloudConnected');
  assert.deepEqual(backToStep(none, 'openCloudService'), ['start', 'open', 'openCloudService']);
  // A step that is not in the stack changes nothing.
  assert.deepEqual(backToStep(['start', 'open'], 'openCloudService'), ['start', 'open']);
});

test('the connection to a service: start, wait, cancel, refuse, retry, connect', () => {
  assert.equal(connectionNext('idle', 'start'), 'waiting');
  assert.equal(connectionNext('waiting', 'start'), 'waiting');
  assert.equal(connectionNext('waiting', 'cancel'), 'idle');
  assert.equal(connectionNext('waiting', 'refused'), 'refused');
  assert.equal(connectionNext('refused', 'start'), 'waiting');
  assert.equal(connectionNext('waiting', 'connected'), 'idle');
  // An answer that arrives when nothing is awaited changes nothing.
  assert.equal(connectionNext('idle', 'refused'), 'idle');
  assert.equal(connectionNext('refused', 'cancel'), 'refused');
});

test('until idea #74 nothing opens the browser: the buttons say « coming », the state is cleared when the step changes', async () => {
  assert.equal(CLOUD_CONNECTION_AVAILABLE, false);
  const steps = read('components/FirstLaunchSteps.svelte');
  assert.match(steps, /function signIn\(\) \{\s*(?:if \(realCloud\) return void desktopSignIn\(step === 'cloudConnected'\);\s*)?if \(!CLOUD_CONNECTION_AVAILABLE\) return cloud\(\);/);
  assert.match(steps, /function reopenPage\(\) \{\s*(?:if \(realCloud\) return void [^\n]*;\s*)?if \(!CLOUD_CONNECTION_AVAILABLE\) return cloud\(\);/);
  await assert.rejects(connectWebdav({ url: '', user: '', password: '' }), /COMING/);
  const state = read('lib/first-launch.svelte.js');
  for (const fn of ['go', 'goBack', 'goBackTo', 'editName']) {
    assert.match(state, new RegExp(`export function ${fn}\\([^)]*\\) \\{[^}]*flow\\.connection = 'idle'`), fn);
  }
});

test('the connect screens: the hint under the button, in progress with « Annuler » and « Rouvrir la page », refused with « Réessayer »', () => {
  const steps = read('components/FirstLaunchSteps.svelte');
  assert.match(steps, /welcomeSteps\.connectHint/);
  assert.doesNotMatch(steps, /notConnectedHelp/);
  for (const key of ['connecting', 'connectingHelp', 'reopenPage', 'refusedTitle', 'refusedHelp', 'retry']) {
    assert.match(steps, new RegExp(`welcomeSteps\\.${key}`), key);
  }
  // The same screen in the create and the open paths.
  assert.equal(steps.match(/\{@render connecting\(\)\}/g).length, 2);
  const fr = langs.fr.welcomeSteps;
  assert.equal(fr.connecting, 'Connexion en cours…');
  assert.equal(fr.connectingHelp, 'Terminez la connexion dans la page qui s’est ouverte. Vous reviendrez ici ensuite.');
  assert.equal(fr.reopenPage, 'Rouvrir la page');
  assert.equal(fr.refusedTitle, 'Connexion non établie');
  assert.equal(fr.refusedHelp, 'La connexion a été annulée ou refusée dans le navigateur.');
  assert.equal(fr.retry, 'Réessayer');
  // Task 2026-11-16-230: two lines, no mention of a browser.
  assert.equal(fr.connectHint, 'La page de connexion du service s’ouvre.\nVous revenez ici ensuite.');
});

test('the spinner stops under reduced motion', () => {
  const steps = read('components/FirstLaunchSteps.svelte');
  assert.match(steps, /@media \(prefers-reduced-motion: reduce\) \{\s*\.od-first-launch--spinner \{\s*animation: none;/);
});

test('WebDAV: the codes tell the address or the password; the texts are the mock-ups’', () => {
  assert.equal(webdavProblem('UNREACHABLE'), 'unreachable');
  assert.equal(webdavProblem('BAD_ADDRESS'), 'unreachable');
  assert.equal(webdavProblem('NETWORK'), 'unreachable');
  assert.equal(webdavProblem('LOGIN_FAILED'), 'denied');
  assert.equal(webdavProblem('DENIED'), 'denied');
  assert.equal(webdavProblem('COMING'), '');
  const fr = langs.fr.welcomeSteps;
  assert.equal(fr.webdavUnreachable, 'Impossible de joindre ce serveur. Vérifiez l’adresse.');
  assert.equal(fr.webdavHelp, 'Dans Nextcloud, créez un mot de passe d’application dans Réglages › Sécurité. Il reste sur cette tablette.');
  assert.equal(fr.webdavTitle, 'Connexion à votre serveur WebDAV ou Nextcloud');
  const form = read('components/FirstLaunchWebdav.svelte');
  assert.match(form, /welcomeSteps\.createLogbook/);
  assert.match(form, /welcomeSteps\.seeLogbooks/);
  const steps = read('components/FirstLaunchSteps.svelte');
  assert.match(steps, /<FirstLaunchWebdav create oncoming=\{cloud\} onsubmit=\{windowTakes \? createWebdav : undefined\} .*\/>/);
  assert.match(steps, /<FirstLaunchWebdav create=\{false\} oncoming=\{cloud\} \/>/);
  assert.match(steps, /go\(key === 'webdav' \? 'webdav' : key === 'icloud' \? 'icloud' : 'service'\)/);
});

test('git: a repository that does not fit the path is told under the address, with the link to the other path', () => {
  assert.equal(gitProblem(true, { empty: false }), 'notEmpty');
  assert.equal(gitProblem(true, { empty: true }), '');
  assert.equal(gitProblem(false, { empty: true }), 'noLogbook');
  assert.equal(gitProblem(false, { empty: false }), '');
  assert.equal(gitProblemFromCode(true, 'NOT_EMPTY'), 'notEmpty');
  assert.equal(gitProblemFromCode(true, 'LOG_EXISTS'), 'notEmpty');
  assert.equal(gitProblemFromCode(false, 'NO_LOG'), 'noLogbook');
  assert.equal(gitProblemFromCode(false, 'NETWORK'), '');
  const fr = langs.fr.welcomeSteps;
  assert.equal(fr.gitNotEmpty, 'Ce dépôt contient déjà un carnet.');
  assert.equal(fr.gitNotEmptyHint, 'Pour l’utiliser, passez par {link}.');
  assert.equal(fr.gitEmptyOpen, 'Ce dépôt ne contient pas de carnet OpenDives.');
  assert.equal(fr.gitEmptyOpenHint, 'Pour commencer un carnet dans ce dépôt, passez par {link}.');
  const git = read('components/FirstLaunchGit.svelte');
  assert.match(git, /error=\{addressLive\.error \|\| problemText\}/);
  assert.match(git, /onswitch\?\.\(\)/);
});

test('« Aucun carnet dans ce compte »: the card and its two buttons', () => {
  const steps = read('components/FirstLaunchSteps.svelte');
  assert.match(steps, /chooseOutcome\(flow\.found\) === 'none'/);
  assert.match(steps, /go\('createHere'\)/);
  assert.match(steps, /goBackTo\('openCloudService'\)/);
  const fr = langs.fr.welcomeSteps;
  assert.equal(fr.noLogbookTitle, 'Aucun carnet dans ce compte');
  assert.equal(fr.noLogbookText, 'Le dossier OpenDives de ce compte est vide, ou il n’existe pas encore.');
  assert.equal(fr.createHere, 'Créer un carnet ici');
});

test('divelogs.de: wrong credentials are told under the password, with the note kept below', () => {
  const divelogs = read('components/FirstLaunchDivelogs.svelte');
  assert.match(divelogs, /code === 'LOGIN_FAILED' \? t\('welcomeSteps\.divelogsDenied'\)/);
  assert.equal(langs.fr.welcomeSteps.divelogsDenied, 'Nom d’utilisateur ou mot de passe incorrect.');
  // The field shows the error and the help together.
  const field = read('components/ReleaseField.svelte');
  assert.match(field, /\{#if error\}[\s\S]*\{\/if\}\s*\{#if help\}/);
});

// --- The download that resumes -----------------------------------------------------------------------------

function fakeDivelogs({ ids, failAt = -1 }) {
  const log = { lists: 0, batches: [], discarded: [] };
  let call = 0;
  return {
    log,
    calls: {
      list: async () => {
        log.lists += 1;
        return { ids };
      },
      downloadIds: async ({ ids: batch }) => {
        if (call++ === failAt) throw new Error('NETWORK');
        log.batches.push(batch);
        return { path: `part${log.batches.length}.dld`, dives: batch.length };
      },
      count: async ({ path }) => ({ dives: path === 'part1.dld' ? DOWNLOAD_BATCH : 1 }),
      discard: async ({ path }) => log.discarded.push(path),
    },
  };
}

test('« Reprendre » downloads only the dives still missing', async () => {
  const ids = Array.from({ length: DOWNLOAD_BATCH * 3 }, (_, i) => `id${i}`);
  const { calls, log } = fakeDivelogs({ ids, failAt: 2 });
  const progress = newDownloadProgress();
  const seen = [];
  const report = (s) => seen.push(`${s.phase}:${s.done}/${s.total}`);
  const credentials = { user: 'u', password: 'p' };
  await assert.rejects(downloadDivelogsResumable(calls, credentials, progress, report, () => false), /NETWORK/);
  // Two batches came in and are kept; the third is still to do.
  assert.equal(progress.done, DOWNLOAD_BATCH * 2);
  assert.equal(progress.total, DOWNLOAD_BATCH * 3);
  assert.equal(progress.parts.length, 2);
  assert.equal(progress.pending.length, DOWNLOAD_BATCH);
  assert.equal(failureKind('NETWORK', progress.done), 'interrupted');
  // « Reprendre »: the same progress, no new list, only the missing ids.
  const read = await downloadDivelogsResumable(calls, credentials, progress, report, () => false);
  assert.equal(log.lists, 1);
  assert.deepEqual([...log.batches.flat()].sort(), [...ids].sort());
  assert.equal(new Set(log.batches.flat()).size, ids.length, 'no dive downloaded twice');
  assert.equal(read.paths.length, 3);
  assert.equal(read.path, 'part1.dld');
  assert.equal(read.dives, DOWNLOAD_BATCH + 2);
  assert.ok(seen.includes(`download:${DOWNLOAD_BATCH * 2}/${DOWNLOAD_BATCH * 3}`));
  assert.equal(seen.at(-1), `read:${DOWNLOAD_BATCH * 3}/${DOWNLOAD_BATCH * 3}`);
  assert.deepEqual(log.discarded, []);
});

test('« Annuler » during or after an interruption deletes what was received', async () => {
  const ids = Array.from({ length: DOWNLOAD_BATCH * 2 }, (_, i) => `id${i}`);
  const { calls, log } = fakeDivelogs({ ids, failAt: 1 });
  const progress = newDownloadProgress();
  await assert.rejects(downloadDivelogsResumable(calls, { user: 'u', password: 'p' }, progress, () => {}, () => false));
  assert.equal(progress.parts.length, 1);
  assert.equal(await discardParts(calls, progress), null);
  assert.deepEqual(log.discarded, ['part1.dld']);
  assert.deepEqual(progress, newDownloadProgress());
  // Cancelled between two batches: nothing more is asked.
  const again = fakeDivelogs({ ids });
  const p2 = newDownloadProgress();
  let cancelled = false;
  const out = await downloadDivelogsResumable(again.calls, { user: 'u', password: 'p' }, p2, (s) => (cancelled = s.done > 0), () => cancelled);
  assert.equal(out, null);
  assert.equal(again.log.batches.length, 1);
  assert.deepEqual(again.log.discarded, ['part1.dld']);
});

test('an interruption needs dives already received; a loss before the first one goes back to the form', () => {
  assert.equal(failureKind('NETWORK', 184), 'interrupted');
  assert.equal(failureKind('NETWORK_LOST', 1), 'interrupted');
  assert.equal(failureKind('NETWORK', 0), 'form');
  assert.equal(failureKind('LOGIN_FAILED', 184), 'form');
  assert.equal(failureKind('INVALID_ARCHIVE', 184), 'form');
});

test('the plugin cannot resume yet: the capability is read, not assumed', () => {
  assert.equal(canResume({}), false);
  assert.equal(canResume({ list() {}, downloadIds() {} }), true);
  const divelogs = read('components/FirstLaunchDivelogs.svelte');
  assert.match(divelogs, /\(OpenDivesCore\)\)?\.divelogsList\) === 'function'/);
  const api = readFileSync(new URL('../../plugins/opendives-core/core-api.js', import.meta.url), 'utf8');
  assert.doesNotMatch(api, /divelogsList/, 'when the plugin gains divelogsList, wire its by-ids download and update this test');
});

test('the interrupted screen: the mock-up’s texts, « Annuler » and « Reprendre »', () => {
  const fr = langs.fr.welcomeSteps;
  assert.equal(fr.interrupted, 'Téléchargement interrompu');
  assert.equal(fr.interruptedDetail, '{done} sur {total} · la connexion à Internet a été perdue.');
  assert.equal(fr.interruptedHelp.other, 'Les {n} plongées déjà téléchargées sont gardées. « Reprendre » télécharge seulement les autres.');
  assert.equal(fr.resume, 'Reprendre');
  const divelogs = read('components/FirstLaunchDivelogs.svelte');
  assert.match(divelogs, /welcomeSteps\.resume/);
  assert.match(divelogs, /\{#if d\.interrupted\}/);
  // On mount, an interrupted download is not started again by itself.
  assert.match(divelogs, /step === 'importProgress' && !d\.interrupted/);
});

test('portrait: from the second step the blue panel is a 540 dp hero, the first step keeps 640 dp', () => {
  const page = read('pages/WelcomeStartRelease.svelte');
  assert.match(page, /class:od-welcome-release--compact=\{flow\.stack\.length > 1\}/);
  assert.match(page, /height: 640px/);
  assert.match(page, /\.od-welcome-release--compact \{\s*height: 540px;/);
});

test('every new action has the hand pointer and a hover state; no colour is written in the components', () => {
  for (const file of ['components/FirstLaunchWebdav.svelte', 'components/FirstLaunchSteps.svelte', 'components/FirstLaunchDivelogs.svelte', 'components/FirstLaunchGit.svelte']) {
    const src = read(file);
    assert.match(src, /cursor: pointer/, file);
    assert.match(src, /@media \(hover: hover\)/, file);
    assert.doesNotMatch(src, /#[0-9A-Fa-f]{3,8}\b|rgb\(/, file);
  }
});

test('the new texts exist in French and English', () => {
  const keys = ['connectHint', 'connecting', 'connectingHelp', 'reopenPage', 'refusedTitle', 'refusedHelp', 'retry', 'webdavTitle', 'webdavAddress', 'webdavUser', 'webdavPassword', 'webdavHelp', 'webdavUnreachable', 'webdavDenied', 'gitNotEmptyHint', 'gitEmptyOpenHint', 'noLogbookTitle', 'noLogbookText', 'createHere', 'divelogsDenied', 'interrupted', 'interruptedDetail', 'interruptedHelp', 'resume'];
  for (const lang of ['fr', 'en']) for (const k of keys) assert.ok(langs[lang].welcomeSteps[k], `${lang}: ${k}`);
});

// --- The empty logbook of a tablet (part 6) ------------------------------------------------------------------

test('the logbook menu opens the first launch at its step, and its first screen can be left', () => {
  assert.deepEqual(menuEntry('open'), ['start', 'open']);
  assert.deepEqual(menuEntry('new'), ['start', 'new']);
  assert.ok(!hasBack('start'));
  assert.ok(hasBack('start', true));
  assert.ok(!hasBack('importProgress', true));
  assert.deepEqual(back(menuEntry('open')), ['start']);
  const steps = read('components/FirstLaunchSteps.svelte');
  assert.match(steps, /hasBack\(step, flow\.origin === 'menu'\)/);
  assert.match(steps, /function leave\(\) \{\s*logbook\.welcome = false;\s*resetFlow\(\);/);
  const state = read('lib/first-launch.svelte.js');
  assert.match(state, /export function enterFromMenu\(first\) \{\s*resetFlow\(\);\s*flow\.origin = 'menu';/);
  assert.match(state, /export function resetFlow\(\) \{\s*flow\.origin = '';/);
});

test('the empty logbook menu: rename and move say « coming », open and new enter the first launch, export is off', () => {
  const page = read('pages/Logbook.svelte');
  const menu = page.slice(page.indexOf('od-logbook-empty-menu" backdrop'), page.indexOf('Overflow menu: Filter'));
  const order = ['menuRename', 'menuMove', 'menuOpenOther', 'menuNew', 'menuExport'];
  const at = order.map((k) => menu.indexOf(`welcomeSteps.${k}'`));
  assert.ok(at.every((i) => i > 0) && [...at].sort((a, b) => a - b).join() === at.join(), 'the five items, in the mock-up’s order');
  assert.match(menu, /welcomeSteps\.menuMoveHint/);
  assert.match(menu, /welcomeSteps\.menuExportNone'\)\} disabled/);
  assert.match(menu, /onclick=\{\(\) => openFirstLaunch\('open'\)\}/);
  assert.match(menu, /onclick=\{\(\) => openFirstLaunch\('new'\)\}/);
  assert.doesNotMatch(menu, /logbookSettings|menuSettings|Réglages du carnet/);
  assert.match(page, /function openFirstLaunch\(first\) \{\s*enterFromMenu\(first\);\s*logbook\.welcome = true;/);
  // Only the release tablet's empty logbook has it.
  assert.match(page, /\{#if releaseEmpty\}\s*<!-- The empty logbook of the release edition/);
  const fr = langs.fr.welcomeSteps;
  assert.equal(fr.menuRename, 'Renommer le carnet');
  assert.equal(fr.menuMove, 'Changer d’endroit');
  assert.equal(fr.menuMoveHint, 'Nuage, dépôt git ou cette tablette');
  assert.equal(fr.menuOpenOther, 'Ouvrir un autre carnet');
  assert.equal(fr.menuNew, 'Nouveau carnet');
  assert.equal(fr.menuExport, 'Exporter le carnet');
  assert.equal(fr.menuExportNone, 'Aucune plongée à exporter');
  for (const lang of ['fr', 'en']) for (const k of ['menuRename', 'menuMove', 'menuMoveHint', 'menuOpenOther', 'menuNew', 'menuExport', 'menuExportNone', 'menuSoon']) assert.ok(langs[lang].welcomeSteps[k], `${lang}: ${k}`);
});

test('the empty logbook profile is 724 dp wide in landscape and 624 dp in portrait, inside the pane', () => {
  const empty = read('components/ReleaseEmptyLogbook.svelte');
  assert.match(empty, /width: min\(724px, calc\(100vw - var\(--od-nav-width, 96px\) - var\(--f7-page-master-width, 340px\) - 96px\)\)/);
  assert.match(empty, /width: min\(624px, calc\(100vw - var\(--od-nav-width, 96px\) - 80px\)\)/);
  assert.match(empty, /@media \(orientation: portrait\)/);
  // Landscape on 1 280 dp: 1 280 - 96 - 340 = 844 dp of pane, 60 dp on each side of 724. Portrait on 800 dp: 704, 40 each side.
  assert.ok((1280 - 96 - 340 - 724) / 2 >= 48 && (800 - 96 - 624) / 2 >= 40);
  // The list pane takes the whole width in portrait while the column is alone.
  assert.match(read('App.svelte'), /:has\(\.od-release-empty\)\) \{\s*--f7-page-master-width: 100%;/);
});
