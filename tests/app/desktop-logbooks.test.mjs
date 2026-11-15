// Several logbooks on the desktop (task 2026-11-15-173): the pure logic of the start screen, the
// selector and the new-logbook dialog.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cloudProvidersFor,
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

test('iCloud Drive is offered on macOS only', () => {
  assert.ok(cloudProvidersFor(true).includes('iCloud'));
  assert.ok(!cloudProvidersFor(false).includes('iCloud'));
  assert.deepEqual(cloudProvidersFor(false), ['googleDrive', 'oneDrive', 'dropbox', 'webdav']);
});

test('the icon of a logbook says its source', () => {
  assert.equal(sourceKind({ id: 'main', kind: 'main', name: '', location: '' }), 'device');
  assert.equal(sourceKind({ id: 'f-1', kind: 'file', name: 'a', location: '/x/a.ssrf' }), 'file');
  assert.equal(sourceKind({ id: 'f-1', kind: 'file', name: 'a', location: '/x/a.ssrf', provider: 'dropbox' }), 'cloud');
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

test('the cloud form needs a service with a folder; WebDAV is not available yet', () => {
  assert.ok(cloudFormReady({ provider: 'dropbox', folder: '/d' }));
  assert.ok(!cloudFormReady({ provider: 'dropbox', folder: '' }));
  assert.ok(!cloudFormReady({ provider: '', folder: '/d' }));
  assert.ok(!cloudFormReady({ provider: 'webdav', folder: '/d' }));
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
  assert.deepEqual(keptIn({ id: 'g', kind: 'git', name: 'a', location: 'https://h.org/o/r.git' }, t), { key: 'whereGit', where: 'h.org/o/r' });
});
