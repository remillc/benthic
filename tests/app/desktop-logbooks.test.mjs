// Several logbooks on the desktop (task 2026-11-15-173): the pure logic of the start screen, the
// selector and the new-logbook dialog.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CLOUD_PROVIDERS,
  providerRow,
  defaultCloudFolder,
  cloudFolderError,
  cloudErrorKey,
  STARTUP_MODES,
  sourceKind,
  sourceText,
  whenText,
  validLogbookName,
  fileNameFor,
  secondStep,
  gitUrlError,
  gitFormReady,
  gitUserFromUrl,
  gitUserError,
  cloudFormReady,
  tokenPageUrl,
  creationErrorKey,
  logbookShortcut,
  isLogbookFileName,
  selectorShortcuts,
  keptIn,
} from '../../app/src/lib/desktop-logbooks.js';

const texts = {
  'desktopLogbooks.source.device': 'Cet ordinateur',
  'desktopLogbooks.source.git': 'Dépôt git',
  'desktopLogbooks.source.file': 'Fichier',
  'desktopLogbooks.source.googleDrive': 'Google Drive',
  'desktopLogbooks.new.folderLabel': 'Dossier',
  'desktopLogbooks.when.openNow': 'ouvert maintenant',
  'desktopLogbooks.when.closedNow': 'à l\'instant',
  'desktopLogbooks.when.closedMinutes': 'fermé il y a {n} min',
  'desktopLogbooks.when.closedHours': 'fermé il y a {n} h',
  'desktopLogbooks.when.openedOn': 'ouvert le {date}',
};
const t = (key, params = {}) => (texts[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => params[k]);

test('the cloud services are the three with an API; iCloud Drive and WebDAV are gone', () => {
  assert.deepEqual([...CLOUD_PROVIDERS], ['googleDrive', 'oneDrive', 'dropbox']);
});

test('the end of a service row: not available, sign in, signing in, connected as', () => {
  const rows = {
    'desktopLogbooks.new.notAvailable': 'Pas encore disponible',
    'desktopCloud.row.signIn': 'Se connecter',
    'desktopCloud.row.signingIn': 'Connexion dans le navigateur…',
    'desktopCloud.row.connected': 'Connecté · {account}',
    'desktopCloud.row.connectedNoAccount': 'Connecté',
  };
  const tt = (key, params = {}) => (rows[key] ?? key).replace('{account}', params.account ?? '');
  const status = (over) => ({ provider: 'dropbox', available: true, connected: false, account: '', ...over });
  assert.deepEqual(providerRow(status({ available: false }), false, tt), { state: 'unavailable', text: 'Pas encore disponible' });
  assert.deepEqual(providerRow(undefined, false, tt), { state: 'unavailable', text: 'Pas encore disponible' });
  assert.deepEqual(providerRow(status({}), false, tt), { state: 'signedOut', text: 'Se connecter' });
  assert.deepEqual(providerRow(status({}), true, tt), { state: 'signingIn', text: 'Connexion dans le navigateur…' });
  assert.deepEqual(providerRow(status({ connected: true, account: 'moi@example.org' }), false, tt), { state: 'connected', text: 'Connecté · moi@example.org' });
  assert.deepEqual(providerRow(status({ connected: true }), false, tt), { state: 'connected', text: 'Connecté' });
  // Not available wins over a stale connection.
  assert.equal(providerRow(status({ available: false, connected: true }), false, tt).state, 'unavailable');
});

test('the folder: Google Drive starts with a folder OpenDives creates, the others with their own', () => {
  assert.equal(defaultCloudFolder('googleDrive'), 'OpenDives');
  assert.equal(defaultCloudFolder('dropbox'), '');
  assert.equal(defaultCloudFolder('oneDrive'), '');
});

test('a cloud folder path: segments with no dot-dot, no forbidden character; empty is the root', () => {
  for (const ok of ['', 'OpenDives', 'OpenDives/plongées', ' a / b ', 'a/b/c/d/e/f']) assert.equal(cloudFolderError(ok), '', ok);
  for (const bad of ['..', 'a/../b', 'a/./b', 'a:b', 'a?b', 'a|b', 'a/b/c/d/e/f/g', 'x'.repeat(101)]) assert.equal(cloudFolderError(bad), 'folder', bad);
});

test('the error of a sign-in or a cloud creation has its own text', () => {
  assert.equal(cloudErrorKey({ code: 'SIGN_IN_DENIED' }), 'desktopCloud.errors.SIGN_IN_DENIED');
  assert.equal(cloudErrorKey({ message: 'NOT_SIGNED_IN' }), 'desktopCloud.errors.NOT_SIGNED_IN');
  assert.equal(cloudErrorKey({ code: 'EXISTS', message: 'EXISTS' }), 'desktopCloud.errors.EXISTS');
  assert.equal(cloudErrorKey({ message: 'NETWORK: no answer' }), 'desktopCloud.errors.NETWORK');
  assert.equal(cloudErrorKey({ message: 'weird failure' }), 'desktopCloud.errors.other');
  assert.equal(cloudErrorKey({}), 'desktopCloud.errors.other');
});

test('the start-up choices', () => {
  assert.deepEqual([...STARTUP_MODES], ['last', 'ask']);
});

test('the icon of a logbook says its source', () => {
  assert.equal(sourceKind({ id: 'main', kind: 'main', name: '', location: '' }), 'device');
  assert.equal(sourceKind({ id: 'f-1', kind: 'file', name: 'a', location: '/x/a.ssrf' }), 'file');
  assert.equal(sourceKind({ id: 'f-1', kind: 'file', name: 'a', location: '/x/a.ssrf', provider: 'dropbox' }), 'cloud');
  assert.equal(sourceKind({ id: 'c-1', kind: 'cloud', name: 'a', location: 'OpenDives/a.ssrf', provider: 'oneDrive' }), 'cloud');
  assert.equal(sourceKind({ id: 'g-1', kind: 'git', name: 'a', location: 'https://h/x' }), 'git');
});

test('the second line: the service, the folder of a file, the repository without its scheme', () => {
  assert.equal(sourceText({ id: 'f', kind: 'file', name: 'a', location: 'C:\\Users\\me\\Documents\\essai.ssrf' }, t), 'Documents');
  assert.equal(sourceText({ id: 'f', kind: 'file', name: 'a', location: '/d/a.ssrf', provider: 'googleDrive' }, t), 'Google Drive');
  assert.equal(sourceText({ id: 'g', kind: 'git', name: 'a', location: 'https://github.com/club/carnet.git' }, t), 'Dépôt git · github.com/club/carnet');
  assert.equal(sourceText({ id: 'main', kind: 'main', name: '', location: '' }, t), 'Cet ordinateur');
});

test('when a logbook was open', () => {
  const now = 10_000_000_000;
  const e = (openedAt, open = false) => ({ id: 'f', kind: 'file', name: 'a', location: '/a', openedAt, open });
  const date = () => '2 nov.';
  assert.equal(whenText(e(now - 5, true), now, t, date), 'ouvert maintenant');
  assert.equal(whenText(e(now - 5_000), now, t, date), 'à l\'instant');
  assert.equal(whenText(e(now - 120_000), now, t, date), 'fermé il y a 2 min');
  assert.equal(whenText(e(now - 3 * 3_600_000), now, t, date), 'fermé il y a 3 h');
  assert.equal(whenText(e(now - 3 * 86_400_000), now, t, date), 'ouvert le 2 nov.');
});

test('the name of a logbook and its file name', () => {
  assert.ok(validLogbookName('Mon carnet'));
  assert.ok(!validLogbookName('   '));
  assert.ok(!validLogbookName('x'.repeat(101)));
  assert.equal(fileNameFor('Mon carnet'), 'Mon carnet.ssrf');
  assert.equal(fileNameFor('a/b:c'), 'a_b_c.ssrf');
  assert.equal(fileNameFor('essai.ssrf'), 'essai.ssrf');
  assert.equal(fileNameFor('  '), 'carnet.ssrf');
});

test('step 1 goes straight to the save dialog for this computer, to a second step for the others', () => {
  assert.equal(secondStep('computer'), null);
  assert.equal(secondStep('cloud'), 'cloud');
  assert.equal(secondStep('git'), 'git');
});

test('the git form: an https address, a branch and a token', () => {
  assert.equal(gitUrlError(''), '');
  assert.equal(gitUrlError('https://github.com/vous/carnet.git'), '');
  assert.equal(gitUrlError('github.com/vous/carnet'), 'url');
  assert.equal(gitUrlError('http://x/y'), 'url');
  assert.ok(gitFormReady({ url: 'https://h/o/r.git', branch: 'main', token: 't' }));
  assert.ok(!gitFormReady({ url: 'https://h/o/r.git', branch: '', token: 't' }));
  assert.ok(!gitFormReady({ url: 'https://h/o/r.git', branch: 'a b', token: 't' }));
  assert.ok(!gitFormReady({ url: 'https://h/o/r.git', branch: 'main', token: ' ' }));
  // The git user name: optional, prefilled with the owner of the address, valid while typed.
  assert.ok(gitFormReady({ url: 'https://h/o/r.git', branch: 'main', token: 't', username: '' }));
  assert.ok(gitFormReady({ url: 'https://h/o/r.git', branch: 'main', token: 't', username: 'marie.d' }));
  assert.ok(!gitFormReady({ url: 'https://h/o/r.git', branch: 'main', token: 't', username: 'a b' }));
  assert.equal(gitUserError(''), '');
  assert.equal(gitUserError('  '), '');
  assert.equal(gitUserError('marie-d_1.x'), '');
  assert.equal(gitUserError('marie@club.org'), '');
  assert.equal(gitUserError('marie d'), 'username');
  assert.equal(gitUserError('-marie'), 'username');
  assert.equal(gitUserError('a'.repeat(101)), 'username');
  assert.equal(gitUserFromUrl('https://github.com/vous/carnet.git'), 'vous');
  assert.equal(gitUserFromUrl('  https://gitlab.com/club-x/sub/carnet '), 'club-x');
  assert.equal(gitUserFromUrl('https://codeberg.org/vous'), '');
  assert.equal(gitUserFromUrl('https://github.com/'), '');
  assert.equal(gitUserFromUrl('github.com/vous/carnet'), '');
  assert.equal(gitUserFromUrl(''), '');
});

test('the cloud form needs a service the diver is signed in to, and a valid folder', () => {
  assert.ok(cloudFormReady({ provider: 'dropbox', connected: true, folder: 'Carnets' }));
  assert.ok(cloudFormReady({ provider: 'dropbox', connected: true, folder: '' }));
  assert.ok(!cloudFormReady({ provider: 'dropbox', connected: false, folder: 'Carnets' }));
  assert.ok(!cloudFormReady({ provider: '', connected: true, folder: 'd' }));
  assert.ok(!cloudFormReady({ provider: 'webdav', connected: true, folder: 'd' }));
  assert.ok(!cloudFormReady({ provider: 'googleDrive', connected: true, folder: '../x' }));
});

test('where to create a token, by host', () => {
  assert.match(tokenPageUrl('https://gitlab.com/a/b'), /gitlab\.com/);
  assert.match(tokenPageUrl('https://codeberg.org/a/b'), /codeberg\.org/);
  assert.match(tokenPageUrl(''), /github\.com/);
});

test('the error of a failed creation maps to a text key', () => {
  assert.equal(creationErrorKey({ code: 'DENIED' }), 'desktopLogbooks.new.errors.DENIED');
  assert.equal(creationErrorKey({ message: 'EXISTS' }), 'desktopLogbooks.new.errors.EXISTS');
  assert.equal(creationErrorKey({ message: 'surprise' }), 'desktopLogbooks.new.errors.other');
});

test('keyboard shortcuts of Windows and Linux', () => {
  const key = (k, o = {}) => ({ key: k, ctrlKey: true, shiftKey: false, altKey: false, metaKey: false, ...o });
  assert.equal(logbookShortcut(key('N', { shiftKey: true })), 'newLogbook');
  assert.equal(logbookShortcut(key('n')), '');
  assert.equal(logbookShortcut(key('o')), 'openLogbook');
  assert.equal(logbookShortcut(key('S', { shiftKey: true })), 'saveCopy');
  assert.equal(logbookShortcut(key('w')), 'closeLogbook');
  assert.equal(logbookShortcut(key('w', { ctrlKey: false })), '');
  assert.equal(selectorShortcuts(false).newLogbook, 'Ctrl+Maj+N');
  assert.equal(selectorShortcuts(true).saveCopy, '⇧⌘S');
});

test('a dropped file is a logbook when it is .ssrf or .xml', () => {
  assert.ok(isLogbookFileName('plongees.SSRF'));
  assert.ok(isLogbookFileName('a.xml'));
  assert.ok(!isLogbookFileName('a.fit'));
});

test('where a new logbook is kept, for its ready screen', () => {
  assert.deepEqual(keptIn({ id: 'f', kind: 'file', name: 'a', location: '/home/me/Documents/a.ssrf' }, t), { key: 'whereComputer', where: 'Documents' });
  assert.deepEqual(keptIn({ id: 'f', kind: 'file', name: 'a', location: '/d/OpenDives/a.ssrf', provider: 'googleDrive' }, t), { key: 'whereCloud', where: 'Google Drive, dossier OpenDives' });
  assert.deepEqual(keptIn({ id: 'c', kind: 'cloud', name: 'a', location: 'OpenDives/a.ssrf', provider: 'googleDrive' }, t), { key: 'whereCloud', where: 'Google Drive, dossier OpenDives' });
  assert.deepEqual(keptIn({ id: 'g', kind: 'git', name: 'a', location: 'https://h.org/o/r.git' }, t), { key: 'whereGit', where: 'h.org/o/r' });
});
