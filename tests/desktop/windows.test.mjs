// SPDX-License-Identifier: GPL-2.0
// Several logbooks (task 2026-11-15-173): the bridge's one helper per window, the file logbook that is
// written back to its .ssrf, the git token of a logbook, the recent list, and the window manager with
// a fake Electron. Run: node --test tests/desktop/windows.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { setupBridge } = require('../../desktop/bridge.cjs');
const logbooks = require('../../desktop/logbooks.cjs');
const { createWindowManager } = require('../../desktop/windows.cjs');
const here = path.dirname(fileURLToPath(import.meta.url));

let root;
let userData;
let bridge;
const handlers = new Map();

const invoke = async (sender, channel, ...args) => {
  const answer = await handlers.get(channel)({ sender }, ...args);
  if (!answer.ok) throw Object.assign(new Error(answer.error), { code: answer.code });
  return answer.value;
};
const fakeContents = (id) => ({ id, send: () => {}, isDestroyed: () => false });

before(() => {
  root = mkdtempSync(path.join(tmpdir(), 'bc-windows-'));
  userData = path.join(root, 'userData');
  const resources = path.join(root, 'resources');
  mkdirSync(resources);
  const app = { getPath: (n) => (n === 'userData' ? userData : path.join(root, 'tmp')), getVersion: () => '1', isPackaged: false, on: () => {}, quit: () => {} };
  const safeStorage = { isEncryptionAvailable: () => true, encryptString: (t) => Buffer.from(`enc:${t}`), decryptString: (b) => b.toString().slice(4) };
  const ipcMain = { handle: (c, fn) => handlers.set(c, fn), on: (c, fn) => handlers.set(`on:${c}`, fn) };
  bridge = setupBridge({ ipcMain, app, safeStorage, hostPath: process.execPath, hostArgs: [path.join(here, 'fake-logbook-host.cjs')], resourcesDir: resources, broadcast: () => {} });
});

after(async () => {
  await bridge.stop();
  rmSync(root, { recursive: true, force: true });
});

test('two windows, two helpers: each window has its own process', async () => {
  const a = fakeContents(11);
  const b = fakeContents(12);
  bridge.attach(a, logbooks.MAIN);
  bridge.attach(b, logbooks.MAIN);
  const pidA = await bridge.callFor(11, 'ping');
  const pidB = await bridge.callFor(12, 'ping');
  assert.notEqual(pidA, pidB);
  assert.equal(await invoke(a, 'bc:core', 'ping'), pidA);
  await bridge.detach(11);
  await bridge.detach(12);
});

test('the preload gets the logbook of its window; a window without one gets null', () => {
  bridge.attach(fakeContents(21), null);
  bridge.attach(fakeContents(22), logbooks.fileDescriptor(path.join(root, 'x.ssrf')));
  const none = { sender: { id: 21 } };
  handlers.get('on:bc:paths')(none);
  assert.equal(none.returnValue.logbook, null);
  const file = { sender: { id: 22 } };
  handlers.get('on:bc:paths')(file);
  assert.equal(file.returnValue.logbook.kind, 'file');
});

test('a file logbook is imported from its file at start and written back after a save', async () => {
  const file = path.join(root, 'plongees.ssrf');
  writeFileSync(file, '<divelog>one</divelog>');
  const d = logbooks.fileDescriptor(file);
  bridge.attach(fakeContents(31), d);
  await invoke({ id: 31 }, 'bc:core', 'logExists', { repo: path.join(userData, 'logbooks', d.id, 'repo[main]') });
  await invoke({ id: 31 }, 'bc:core', 'saveLocal');
  assert.equal(readFileSync(file, 'utf8'), 'saved after <divelog>one</divelog>');
  assert.ok(!existsSync(`${file}.bc-tmp`));
  const meta = JSON.parse(readFileSync(path.join(userData, 'logbooks', d.id, 'meta.json'), 'utf8'));
  assert.equal(meta.hash, logbooks.fileHash(file));
  await bridge.detach(31);
});

test('a missing file is reported, not shown as an empty logbook', async () => {
  const d = logbooks.fileDescriptor(path.join(root, 'gone.ssrf'));
  bridge.attach(fakeContents(41), d);
  await assert.rejects(invoke({ id: 41 }, 'bc:core', 'logExists', { repo: path.join(userData, 'logbooks', d.id, 'repo') }), /FILE_MISSING/);
  await bridge.detach(41);
});

test('the git token belongs to its logbook; the main logbook credentials are not reachable from it', async () => {
  const d = logbooks.gitDescriptor({ url: 'https://example.org/me/book.git', branch: 'main' });
  bridge.attach(fakeContents(61), d);
  bridge.storeGitAccess(d, { url: 'https://example.org/me/book.git[main]', username: 'me', branch: 'main', token: 'secret' });
  assert.equal((await invoke({ id: 61 }, 'bc:credentials', 'get', 'git')).token, 'secret');
  assert.equal(await invoke({ id: 61 }, 'bc:credentials', 'get', 'cloud'), null);
  await assert.rejects(invoke({ id: 61 }, 'bc:credentials', 'set', 'cloud', { email: 'a', password: 'b' }));
  bridge.attach(fakeContents(62), logbooks.MAIN);
  assert.equal(await invoke({ id: 62 }, 'bc:credentials', 'get', 'git'), null);
  await assert.rejects(invoke({ id: 61 }, 'bc:fs', 'exists', { path: path.join(userData, `git-remote-${d.id}.bin`) }));
  await bridge.detach(61);
  await bridge.detach(62);
});

test('recent logbooks: newest first, once each, kept by a new store (a restart), cleared on request', () => {
  const s = new logbooks.LogbookStore(userData, () => 5);
  s.clear();
  const a = logbooks.fileDescriptor(path.join(root, 'a.ssrf'));
  const b = logbooks.gitDescriptor({ url: 'https://example.org/c/d.git', branch: 'main' });
  s.remember(a);
  s.remember(b);
  s.remember(a);
  const again = new logbooks.LogbookStore(userData).list();
  assert.deepEqual(again.map((e) => e.id), [a.id, b.id]);
  assert.equal(again[1].branch, 'main');
  s.forget(a.id);
  assert.deepEqual(new logbooks.LogbookStore(userData).list().map((e) => e.id), [b.id]);
  s.clear();
  assert.deepEqual(new logbooks.LogbookStore(userData).list(), []);
});

test('renamed display names survive restart and clearing recents without changing other logbooks', () => {
  const dir = path.join(root, 'rename-store');
  const store = new logbooks.LogbookStore(dir);
  const a = logbooks.fileDescriptor(path.join(root, 'rename-a.ssrf'));
  const b = logbooks.fileDescriptor(path.join(root, 'rename-b.ssrf'));
  store.remember(a);
  store.remember(b);
  store.setLastOpen([a, b]);
  assert.throws(() => store.rename(a, '  '), /BAD_ARGUMENT/);
  assert.throws(() => store.rename(a, 'x'.repeat(101)), /BAD_ARGUMENT/);
  assert.equal(store.rename(a, '  My dives  ').name, 'My dives');
  const restarted = new logbooks.LogbookStore(dir);
  assert.equal(restarted.find(a.id).name, 'My dives');
  assert.equal(restarted.lastOpen().find((entry) => entry.id === a.id).name, 'My dives');
  assert.equal(restarted.find(b.id).name, b.name);
  restarted.clear();
  assert.equal(new logbooks.LogbookStore(dir).withSavedName(logbooks.fileDescriptor(a.location)).name, 'My dives');
  assert.equal(restarted.withSavedName(b).name, b.name);
});

/** A fake Electron: windows are objects that remember what was done to them. */
let nextId = 100;
function fakeElectron() {
  const created = [];
  class FakeWindow {
    constructor(options) {
      this.options = options;
      this.webContents = { id: nextId++, send() {}, reload: () => (this.reloads = (this.reloads || 0) + 1), setWindowOpenHandler() {}, on() {}, isDestroyed: () => false };
      this.title = options.title;
      created.push(this);
    }
    once() {}
    on() {}
    loadURL(u) { this.url = u; }
    show() {}
    focus() { this.focused = true; }
    isMinimized() { return false; }
    isDestroyed() { return false; }
    getBounds() { return { x: 10, y: 10, width: 800, height: 600 }; }
    setTitle(t) { this.title = t; }
    maximize() {}
  }
  FakeWindow.fromWebContents = (wc) => created.find((w) => w.webContents === wc) ?? null;
  const dialogs = { open: [], save: [], message: [] };
  const dialog = {
    showOpenDialog: async () => dialogs.open.shift() ?? { canceled: true },
    showSaveDialog: async () => dialogs.save.shift() ?? { canceled: true },
    showMessageBox: async (...a) => dialogs.message.push(a),
  };
  return { BrowserWindow: FakeWindow, dialog, shell: { openExternal() {}, showItemInFolder() {} }, created, dialogs };
}

function manager(fake) {
  const texts = { desktopLogbooks: { mainName: 'Main', main: { missingTitle: '{name}', missingText: 'x', ok: 'OK', openTitle: 'o', fileFilter: 'f', newFileTitle: 'n', copyTitle: 'c', copySuffix: 'copy', folderTitle: 'p' } } };
  return createWindowManager({
    electron: fake,
    bridge,
    store: new logbooks.LogbookStore(userData),
    ipcMain: { handle: (c, f) => handlers.set(`wm:${c}`, f) },
    texts: () => texts,
    userData,
    platform: 'win32',
    preload: 'p',
    icon: 'i',
    entryUrl: 'app://x/',
    isAppUrl: () => true,
    home: root,
    env: {},
  });
}

test('windows: opening a logbook opens a window; the same logbook again only focuses it', async () => {
  const fake = fakeElectron();
  const wm = manager(fake);
  const main = wm.openMain();
  assert.equal(main.title, 'Benthic Log · Main');
  const file = path.join(root, 'w.ssrf');
  writeFileSync(file, 'x');
  const first = await wm.openPath(file, main);
  assert.equal(first.opened, true);
  assert.equal(fake.created.length, 2);
  assert.equal(fake.created[1].title, 'Benthic Log · w.ssrf');
  await wm.openPath(file, main);
  assert.equal(fake.created.length, 2);
  assert.equal(fake.created[1].focused, true);
});

test('renaming updates the window without changing the file, restarting the helper, or reloading', async () => {
  const fake = fakeElectron();
  const wm = manager(fake);
  const main = wm.openMain();
  const file = path.join(root, 'rename-window.ssrf');
  writeFileSync(file, '<divelog>unchanged</divelog>');
  await wm.openPath(file, main);
  const win = fake.created[1];
  const id = win.webContents.id;
  const before = bridge.descriptorOf(id);
  const pid = await bridge.callFor(id, 'ping');
  const renamed = await wm.handle({ sender: win.webContents }, 'rename', { name: 'New name' });
  assert.deepEqual(renamed, { ...before, name: 'New name' });
  assert.equal(win.title, 'Benthic Log · New name');
  assert.equal(win.reloads, undefined);
  assert.equal(await bridge.callFor(id, 'ping'), pid);
  assert.equal(readFileSync(file, 'utf8'), '<divelog>unchanged</divelog>');
  await assert.rejects(wm.handle({ sender: win.webContents }, 'rename', { name: '' }), /BAD_ARGUMENT/);
  assert.equal(bridge.descriptorOf(id).name, 'New name');
  await wm.closeLogbook(win);
  await wm.openPath(file, win);
  assert.equal(bridge.descriptorOf(id).name, 'New name');
  assert.equal(win.title, 'Benthic Log · New name');
});

test('windows: closing a logbook leaves the start screen; opening from it reuses the window', async () => {
  const fake = fakeElectron();
  const wm = manager(fake);
  const main = wm.openMain();
  await wm.closeLogbook(main);
  assert.equal(bridge.descriptorOf(main.webContents.id), null);
  assert.equal(main.title, 'Benthic Log');
  assert.equal(main.reloads, 1);
  const file = path.join(root, 'r.ssrf');
  writeFileSync(file, 'x');
  await wm.openPath(file, main);
  assert.equal(fake.created.length, 1);
  assert.equal(bridge.descriptorOf(main.webContents.id).location, path.resolve(file));
});

test('windows (task 242): the window without a logbook, after first use, lists the logbook of this computer; the first start is not that window', async () => {
  const fake = fakeElectron();
  const wm = manager(fake);
  const store = new logbooks.LogbookStore(userData);
  store.clear();
  // First start: the window holds the logbook of this computer (its first launch is the page's, « bc.welcome » absent), never none.
  const main = wm.openMain();
  assert.equal(bridge.descriptorOf(main.webContents.id).kind, 'main');
  // « Fermer le carnet »: the window has none, and the recent list, which the screen shows, holds the logbook just closed.
  await wm.closeLogbook(main);
  assert.equal(bridge.descriptorOf(main.webContents.id), null);
  const recent = await wm.handle({ sender: main.webContents }, 'recent');
  assert.deepEqual(recent.map((e) => [e.kind, e.open]), [['main', false]]);
  assert.deepEqual(await wm.handle({ sender: main.webContents }, 'exists'), { main: true });
});

test('windows: a recent logbook whose file is gone is told and forgotten', async () => {
  const fake = fakeElectron();
  const wm = manager(fake);
  const main = wm.openMain();
  const gone = logbooks.fileDescriptor(path.join(root, 'vanished.ssrf'));
  new logbooks.LogbookStore(userData).remember(gone);
  await wm.handle({ sender: main.webContents }, 'open', { id: gone.id });
  assert.equal(fake.dialogs.message.length, 1);
  assert.ok(!new logbooks.LogbookStore(userData).find(gone.id));
});

test('windows (task 241): exists looks only at the files of the recent list and takes no path from the page', async () => {
  const fake = fakeElectron();
  const wm = manager(fake);
  const store = new logbooks.LogbookStore(userData);
  store.clear();
  const there = path.join(root, 'there.ssrf');
  writeFileSync(there, 'x');
  const gone = logbooks.fileDescriptor(path.join(root, 'gone-241.ssrf'));
  const git = logbooks.gitDescriptor({ url: 'https://github.com/club/carnet', branch: 'main' });
  const sync = logbooks.fileDescriptor(path.join(root, 'no-sync-folder', 'sync.ssrf'), { provider: 'dropbox' });
  for (const d of [gone, git, sync, logbooks.fileDescriptor(there)]) store.remember(d);
  const main = wm.openMain();
  const answer = await wm.handle({ sender: main.webContents }, 'exists', { ids: ['x'], path: path.join(root, 'there.ssrf'), paths: [there] });
  // The answer names recent entries only, by id; the options are ignored.
  assert.deepEqual(Object.keys(answer).sort(), [gone.id, git.id, sync.id, logbooks.fileDescriptor(there).id, 'main'].filter((id) => id in answer).sort());
  assert.equal(answer[gone.id], false);
  assert.equal(answer[sync.id], false);
  assert.equal(answer[logbooks.fileDescriptor(there).id], true);
  // A git repository (and the logbook of this computer) is not checked: it counts as there.
  assert.equal(answer[git.id], true);
  assert.ok(!Object.keys(answer).includes(path.resolve(there)));
  // A file that is not in the list is not looked at at all.
  const stranger = path.join(root, 'stranger.ssrf');
  writeFileSync(stranger, 'x');
  assert.ok(!(logbooks.fileDescriptor(stranger).id in answer));
});

test('windows (task 241): relocate replaces a missing entry with the picked file and opens it in this window', async () => {
  const fake = fakeElectron();
  const wm = manager(fake);
  const store = new logbooks.LogbookStore(userData);
  store.clear();
  const gone = logbooks.fileDescriptor(path.join(root, 'essai-241.ssrf'));
  store.remember(gone);
  const main = wm.openMain();
  await wm.closeLogbook(main);
  const moved = path.join(root, 'sub-241', 'essai-renamed.ssrf');
  mkdirSync(path.dirname(moved), { recursive: true });
  writeFileSync(moved, 'x');
  // Cancelled: nothing changes.
  const cancelled = await wm.handle({ sender: main.webContents }, 'relocate', { id: gone.id });
  assert.equal(cancelled.canceled, true);
  assert.ok(store.find(gone.id));
  // Picked: the old entry goes, the picked file is the logbook of this window and the first of the list.
  fake.dialogs.open.push({ canceled: false, filePaths: [moved] });
  const result = await wm.handle({ sender: main.webContents }, 'relocate', { id: gone.id });
  assert.equal(result.opened, true);
  assert.equal(fake.created.length, 1);
  assert.equal(bridge.descriptorOf(main.webContents.id).location, path.resolve(moved));
  const recent = new logbooks.LogbookStore(userData).list();
  assert.ok(!recent.some((e) => e.id === gone.id));
  assert.equal(recent[0].location, path.resolve(moved));
});

test('windows (task 241): relocate refuses an entry that is not a file of the recent list, and a picked file that is not a logbook', async () => {
  const fake = fakeElectron();
  const wm = manager(fake);
  const store = new logbooks.LogbookStore(userData);
  store.clear();
  const git = logbooks.gitDescriptor({ url: 'https://github.com/club/carnet', branch: 'main' });
  store.remember(git);
  const gone = logbooks.fileDescriptor(path.join(root, 'gone2-241.ssrf'));
  store.remember(gone);
  const main = wm.openMain();
  const ask = (id) => wm.handle({ sender: main.webContents }, 'relocate', { id });
  await assert.rejects(ask(git.id), /NOT_FOUND/);
  await assert.rejects(ask('f-000000000000'), /NOT_FOUND/);
  await assert.rejects(ask('../../etc'), /NOT_FOUND/);
  fake.dialogs.open.push({ canceled: false, filePaths: [path.join(root, 'notes.txt')] });
  await assert.rejects(ask(gone.id), /BAD_ARGUMENT/);
  assert.ok(store.find(gone.id), 'the entry stays when the picked file is refused');
});

test('windows (task 241): forget removes one entry from the recent list', async () => {
  const fake = fakeElectron();
  const wm = manager(fake);
  const store = new logbooks.LogbookStore(userData);
  store.clear();
  const a = logbooks.fileDescriptor(path.join(root, 'fa-241.ssrf'));
  const b = logbooks.fileDescriptor(path.join(root, 'fb-241.ssrf'));
  store.remember(a);
  store.remember(b);
  const main = wm.openMain();
  const left = await wm.handle({ sender: main.webContents }, 'forget', { id: a.id });
  assert.ok(!left.some((e) => e.id === a.id));
  assert.ok(left.some((e) => e.id === b.id));
});

test('windows: a new logbook is an empty .ssrf opened in a new window on this computer', async () => {
  const fake = fakeElectron();
  const wm = manager(fake);
  const main = wm.openMain();
  const target = path.join(root, 'neuf');
  fake.dialogs.save.push({ canceled: false, filePath: target });
  const result = await wm.handle({ sender: main.webContents }, 'create', { where: 'computer', name: 'Neuf' });
  assert.equal(result.opened, true);
  assert.ok(readFileSync(`${target}.ssrf`, 'utf8').includes('<dives>'));
  fake.dialogs.save.push({ canceled: true });
  assert.equal((await wm.handle({ sender: main.webContents }, 'create', { where: 'computer', name: 'X' })).canceled, true);
});
