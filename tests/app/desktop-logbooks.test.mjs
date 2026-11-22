// Several logbooks on the desktop (task 2026-11-15-173): the pure logic of the start screen, the
// selector and the new-logbook dialog.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CLOUD_PROVIDERS,
  cloudRows,
  providerAvailable,
  stepCount,
  connectionState,
  cloudErrorKey,
  webdavErrorField,
  webdavServerError,
  webdavFormReady,
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

test('the cloud services: the three with a browser sign-in, then WebDAV or Nextcloud', () => {
  assert.deepEqual([...CLOUD_PROVIDERS], ['googleDrive', 'oneDrive', 'dropbox', 'webdav']);
});

test('the rows of step 2: iCloud Drive on macOS only, before WebDAV ou Nextcloud', () => {
  assert.deepEqual(cloudRows(false), ['googleDrive', 'oneDrive', 'dropbox', 'webdav']);
  assert.deepEqual(cloudRows(true), ['googleDrive', 'oneDrive', 'dropbox', 'iCloudDrive', 'webdav']);
});

test('a row can be chosen when the main process says the service is available; iCloud Drive has no status, so never', () => {
  const status = (over) => ({ provider: 'dropbox', available: true, connected: false, account: '', ...over });
  assert.equal(providerAvailable(status({})), true);
  assert.equal(providerAvailable(status({ available: false })), false);
  assert.equal(providerAvailable(undefined), false);
});

test('the step line: three steps on the cloud path (name, service, connection), two on the others', () => {
  assert.deepEqual(stepCount('choice', 'cloud'), { n: 1, total: 3 });
  assert.deepEqual(stepCount('provider', 'cloud'), { n: 2, total: 3 });
  assert.deepEqual(stepCount('connect', 'cloud'), { n: 3, total: 3 });
  assert.deepEqual(stepCount('choice', 'computer'), { n: 1, total: 2 });
  assert.deepEqual(stepCount('choice', 'git'), { n: 1, total: 2 });
  assert.deepEqual(stepCount('git', 'git'), { n: 2, total: 2 });
});

test('step 3: not signed in, waiting for the browser (also for a switch of account), signed in', () => {
  assert.equal(connectionState({ connected: false, signingIn: false }), 'notConnected');
  assert.equal(connectionState({ connected: false, signingIn: true }), 'waiting');
  assert.equal(connectionState({ connected: true, signingIn: false }), 'connected');
  assert.equal(connectionState({ connected: true, signingIn: true }), 'waiting');
});

test('the error of a sign-in or a cloud creation has its own text', () => {
  assert.equal(cloudErrorKey({ code: 'SIGN_IN_DENIED' }), 'desktopCloud.errors.SIGN_IN_DENIED');
  assert.equal(cloudErrorKey({ message: 'NOT_SIGNED_IN' }), 'desktopCloud.errors.NOT_SIGNED_IN');
  assert.equal(cloudErrorKey({ code: 'EXISTS', message: 'EXISTS' }), 'desktopCloud.errors.EXISTS');
  assert.equal(cloudErrorKey({ message: 'NETWORK: no answer' }), 'desktopCloud.errors.NETWORK');
  assert.equal(cloudErrorKey({ message: 'weird failure' }), 'desktopCloud.errors.other');
  assert.equal(cloudErrorKey({}), 'desktopCloud.errors.other');
  // WebDAV: the server does not answer, not « le service ».
  assert.equal(cloudErrorKey({ code: 'NETWORK' }, 'webdav'), 'desktopCloud.errors.NETWORK_SERVER');
  assert.equal(cloudErrorKey({ code: 'NETWORK' }, 'dropbox'), 'desktopCloud.errors.NETWORK');
  for (const code of ['BAD_ADDRESS', 'INSECURE_ADDRESS', 'BAD_CREDENTIALS', 'SERVER']) assert.equal(cloudErrorKey({ code }, 'webdav'), `desktopCloud.errors.${code}`);
});

test('a WebDAV error shows under its field: the address, the password, or at the bottom', () => {
  for (const code of ['BAD_ADDRESS', 'INSECURE_ADDRESS', 'NETWORK']) assert.equal(webdavErrorField({ code }), 'server', code);
  assert.equal(webdavErrorField({ code: 'BAD_CREDENTIALS' }), 'password');
  assert.equal(webdavErrorField({ message: 'BAD_CREDENTIALS' }), 'password');
  for (const code of ['DENIED', 'SERVER', 'EXISTS', 'CREDENTIALS_NOT_SAVED']) assert.equal(webdavErrorField({ code }), '', code);
  assert.equal(webdavErrorField({}), '');
});

test('the WebDAV address: https, or http for this computer only; a bare host is fine', () => {
  for (const ok of ['', 'https://cloud.exemple.com', 'cloud.exemple.com', 'https://cloud.exemple.com/remote.php/dav/files/vous/', 'http://localhost:8080/dav', 'http://127.0.0.1/', ' https://cloud.exemple.com ']) assert.equal(webdavServerError(ok), '', ok);
  for (const insecure of ['http://cloud.exemple.com', 'http://192.168.1.20/dav']) assert.equal(webdavServerError(insecure), 'insecure', insecure);
  for (const bad of ['ftp://cloud.exemple.com', 'https://user:pw@cloud.exemple.com', 'https://', 'cloud exemple com']) assert.equal(webdavServerError(bad), 'address', bad);
});

test('the WebDAV button is enabled once the server, user name and password are filled and the address is usable', () => {
  const form = { server: 'https://cloud.exemple.com', username: 'vous', password: 'x' };
  assert.ok(webdavFormReady(form));
  assert.ok(!webdavFormReady({ ...form, server: '' }));
  assert.ok(!webdavFormReady({ ...form, username: '  ' }));
  assert.ok(!webdavFormReady({ ...form, password: '' }));
  assert.ok(!webdavFormReady({ ...form, server: 'http://cloud.exemple.com' }));
  // A password made of spaces is a password.
  assert.ok(webdavFormReady({ ...form, password: '  ' }));
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
  assert.equal(secondStep('cloud'), 'provider');
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

test('the last cloud step needs a service the diver is signed in to, or the three WebDAV fields', () => {
  assert.ok(cloudFormReady({ provider: 'dropbox', connected: true }));
  assert.ok(!cloudFormReady({ provider: 'dropbox', connected: false }));
  assert.ok(!cloudFormReady({ provider: '', connected: true }));
  assert.ok(!cloudFormReady({ provider: 'iCloudDrive', connected: true }));
  const webdav = { server: 'https://cloud.exemple.com', username: 'vous', password: 'x' };
  assert.ok(cloudFormReady({ provider: 'webdav', connected: false, webdav }));
  assert.ok(!cloudFormReady({ provider: 'webdav', connected: true }));
  assert.ok(!cloudFormReady({ provider: 'webdav', connected: false, webdav: { ...webdav, password: '' } }));
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
  assert.equal(logbookShortcut(key('S', { shiftKey: true })), '', 'Save a copy is gone: saving is automatic');
  assert.equal(logbookShortcut(key('w')), 'closeLogbook');
  assert.equal(logbookShortcut(key('w', { ctrlKey: false })), '');
  assert.equal(selectorShortcuts(false).newLogbook, 'Ctrl+Maj+N');
  assert.equal('saveCopy' in selectorShortcuts(true), false);
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
  assert.deepEqual(keptIn({ id: 'c', kind: 'cloud', name: 'a', location: 'a.ssrf', provider: 'googleDrive' }, t), { key: 'whereCloud', where: 'Google Drive, dossier OpenDives' });
  assert.deepEqual(keptIn({ id: 'g', kind: 'git', name: 'a', location: 'https://h.org/o/r.git' }, t), { key: 'whereGit', where: 'h.org/o/r' });
});
