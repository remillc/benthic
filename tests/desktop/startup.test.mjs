// SPDX-License-Identifier: GPL-2.0
// « Ouvrir au démarrage » (task 2026-11-15-202, Réglages > Carnet): « Le dernier carnet » reopens the
// logbooks that were open at the last quit, each in its window; « Choisir à chaque fois » opens the start
// screen. The choice and the list live in the main process (<userData>/logbooks.json). Fake Electron.
// Run: node --test tests/desktop/startup.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { setupBridge } = require('../../desktop/bridge.cjs');
const logbooks = require('../../desktop/logbooks.cjs');
const { createWindowManager } = require('../../desktop/windows.cjs');
const here = path.dirname(fileURLToPath(import.meta.url));

let root;
let nextId = 900;
const texts = { desktopLogbooks: { mainName: 'Main', main: { missingTitle: '{name}', missingText: 'x', ok: 'OK', openTitle: 'o', fileFilter: 'f', newFileTitle: 'n', copyTitle: 'c', copySuffix: 'copy', folderTitle: 'p' } } };

before(() => {
  root = mkdtempSync(path.join(tmpdir(), 'od-startup-'));
});
after(() => rmSync(root, { recursive: true, force: true }));

/** A fake Electron whose windows keep their handlers, so that a test can close them as the system does. */
function fakeElectron() {
  const created = [];
  class FakeWindow {
    constructor(options) {
      this.options = options;
      this.handlers = {};
      this.destroyed = false;
      this.webContents = { id: nextId++, send() {}, reload() {}, setWindowOpenHandler() {}, on() {}, isDestroyed: () => this.destroyed };
      this.title = options.title;
      created.push(this);
    }
    once() {}
    on(name, fn) { (this.handlers[name] ||= []).push(fn); }
    emit(name) { for (const fn of this.handlers[name] || []) fn({ preventDefault() {} }); }
    /** What closing a window does: 'close', then 'closed'. */
    close() {
      this.emit('close');
      this.destroyed = true;
      this.emit('closed');
    }
    loadURL() {}
    show() {}
    focus() {}
    isMinimized() { return false; }
    isDestroyed() { return this.destroyed; }
    getBounds() { return { x: 0, y: 0, width: 800, height: 600 }; }
    setTitle(t) { this.title = t; }
    maximize() {}
  }
  FakeWindow.fromWebContents = (wc) => created.find((w) => w.webContents === wc) ?? null;
  const dialog = { showMessageBox: async () => ({ response: 0 }), showOpenDialog: async () => ({ canceled: true }), showSaveDialog: async () => ({ canceled: true }) };
  return { BrowserWindow: FakeWindow, dialog, shell: { openExternal() {}, showItemInFolder() {} }, created };
}

/** One run of the app on a data folder: the same folder is reused to simulate the next start. */
function run(base, platform = 'win32') {
  const data = path.join(base, 'userData');
  mkdirSync(path.join(base, 'resources'), { recursive: true });
  const app = { getPath: (n) => (n === 'userData' ? data : path.join(base, 'tmp')), getVersion: () => '1', isPackaged: false, on: () => {}, quit: () => {} };
  const safeStorage = { isEncryptionAvailable: () => true, encryptString: (t) => Buffer.from(t), decryptString: (b) => b.toString() };
  const handlers = new Map();
  const bridge = setupBridge({
    ipcMain: { handle: (c, fn) => handlers.set(c, fn), on: () => {} },
    app,
    safeStorage,
    hostPath: process.execPath,
    hostArgs: [path.join(here, 'fake-logbook-host.cjs')],
    resourcesDir: path.join(base, 'resources'),
    broadcast: () => {},
  });
  const fake = fakeElectron();
  const store = new logbooks.LogbookStore(data);
  const wm = createWindowManager({
    electron: fake,
    bridge,
    store,
    ipcMain: { handle: (c, f) => handlers.set(`wm:${c}`, f) },
    texts: () => texts,
    userData: data,
    platform,
    preload: 'p',
    icon: 'i',
    entryUrl: 'app://x/',
    isAppUrl: () => true,
    home: base,
    cloudCheckMs: 0,
  });
  return { data, bridge, fake, store, wm, handlers };
}

const logbookOf = (r, win) => r.bridge.descriptorOf(win.webContents.id);
const file = (base, name) => {
  const p = path.join(base, name);
  writeFileSync(p, '<divelog></divelog>');
  return p;
};

test('the choice defaults to « Le dernier carnet », is kept in the main process, and refuses another value', async () => {
  const base = mkdtempSync(path.join(root, 'a-'));
  const r = run(base);
  assert.deepEqual(await r.wm.handle({}, 'startup'), { mode: 'last' });
  assert.deepEqual(await r.wm.handle({}, 'setStartup', { mode: 'ask' }), { mode: 'ask' });
  // Another run of the app on the same data folder.
  assert.deepEqual(await run(base).wm.handle({}, 'startup'), { mode: 'ask' });
  await assert.rejects(r.wm.handle({}, 'setStartup', { mode: 'always' }), /BAD_ARGUMENT/);
  assert.deepEqual(await run(base).wm.handle({}, 'startup'), { mode: 'ask' });
  // The recent list is untouched by the choice.
  r.store.remember(logbooks.fileDescriptor(file(base, 'x.ssrf')));
  await r.wm.handle({}, 'setStartup', { mode: 'last' });
  assert.equal(r.store.list().length, 1);
  await r.bridge.stop();
});

test('the first start opens the logbook of this computer', async () => {
  const r = run(mkdtempSync(path.join(root, 'b-')));
  const windows = await r.wm.openStartup();
  assert.equal(windows.length, 1);
  assert.equal(logbookOf(r, windows[0]).kind, 'main');
  await r.bridge.stop();
});

test('« Le dernier carnet »: each logbook open at the quit comes back in its own window, in the same order', async () => {
  const base = mkdtempSync(path.join(root, 'c-'));
  const first = run(base);
  const a = file(base, 'a.ssrf');
  const b = file(base, 'b.ssrf');
  const windows = [first.wm.openMain()];
  await first.wm.openPath(a, windows[0]);
  await first.wm.openPath(b, windows[0]);
  assert.equal(first.fake.created.length, 3);
  // The app quits: before-quit comes first, then every window closes one by one.
  first.wm.beforeQuit();
  for (const win of [...first.fake.created]) win.close();
  assert.deepEqual(first.store.lastOpen().map((d) => d.kind), ['main', 'file', 'file']);
  await first.bridge.stop();

  const second = run(base);
  const reopened = await second.wm.openStartup();
  assert.deepEqual(reopened.map((w) => logbookOf(second, w).kind), ['main', 'file', 'file']);
  assert.deepEqual(reopened.map((w) => logbookOf(second, w).location).slice(1), [path.resolve(a), path.resolve(b)]);
  assert.equal(second.fake.created.length, 3);
  assert.ok(second.fake.created[1].title.endsWith('a.ssrf'));
  await second.bridge.stop();
});

test('a logbook closed before the quit is not reopened; the last window closing counts as the quit on Windows and Linux', async () => {
  const base = mkdtempSync(path.join(root, 'd-'));
  const first = run(base);
  const a = file(base, 'a.ssrf');
  const b = file(base, 'b.ssrf');
  const main = first.wm.openMain();
  await first.wm.openPath(a, main);
  await first.wm.openPath(b, main);
  const [, winA, winB] = first.fake.created;
  winB.close(); // the diver closes b on purpose
  assert.deepEqual(first.store.lastOpen().map((d) => d.kind), ['main', 'file']);
  main.close();
  winA.close(); // the last window: the app quits, a.ssrf is what was open
  assert.deepEqual(first.store.lastOpen().map((d) => d.location), [path.resolve(a)]);
  await first.bridge.stop();

  const second = run(base);
  const reopened = await second.wm.openStartup();
  assert.deepEqual(reopened.map((w) => logbookOf(second, w).location), [path.resolve(a)]);
  await second.bridge.stop();
});

test('« Choisir à chaque fois »: one window on the start screen, nothing opened, the recent list kept', async () => {
  const base = mkdtempSync(path.join(root, 'e-'));
  const first = run(base);
  const a = file(base, 'a.ssrf');
  const main = first.wm.openMain();
  await first.wm.openPath(a, main);
  first.wm.beforeQuit();
  for (const win of [...first.fake.created]) win.close();
  await first.wm.handle({}, 'setStartup', { mode: 'ask' });
  await first.bridge.stop();

  const second = run(base);
  const windows = await second.wm.openStartup();
  assert.equal(windows.length, 1);
  assert.equal(logbookOf(second, windows[0]), null);
  assert.equal(windows[0].title, 'OpenDives');
  const recent = await second.wm.handle({}, 'recent');
  assert.ok(recent.some((e) => e.location === path.resolve(a)));
  await second.bridge.stop();
});

test('a logbook file that is gone is skipped without a dialog; when nothing is left, the start screen', async () => {
  const base = mkdtempSync(path.join(root, 'f-'));
  const first = run(base);
  const a = file(base, 'a.ssrf');
  first.store.setLastOpen([logbooks.fileDescriptor(a), logbooks.fileDescriptor(path.join(base, 'gone.ssrf'))]);
  await first.bridge.stop();
  let asked = 0;
  const second = run(base);
  second.fake.dialog.showMessageBox = async () => (asked++, { response: 0 });
  let windows = await second.wm.openStartup();
  assert.deepEqual(windows.map((w) => logbookOf(second, w).location), [path.resolve(a)]);
  assert.equal(asked, 0);
  await second.bridge.stop();

  const third = run(base);
  third.store.setLastOpen([logbooks.fileDescriptor(path.join(base, 'gone.ssrf'))]);
  windows = await third.wm.openStartup();
  assert.equal(logbookOf(third, windows[0]), null);
  await third.bridge.stop();
});
