// SPDX-License-Identifier: GPL-2.0
// The rename to Benthic (22 November 2026), desktop side (desktop/legacy-migration.cjs): the data folder
// `opendives-desktop` moves to `benthic-desktop`, `odgit` becomes `bgit`, and the web storage of the old origin
// is handed over to the new one. Everything runs on temporary folders, with a fake Electron.
// Run: node --test tests/desktop/legacy-migration.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const legacy = require('../../desktop/legacy-migration.cjs');

let root;
before(() => {
  root = fs.mkdtempSync(path.join(tmpdir(), 'bc-legacy-'));
});
after(() => fs.rmSync(root, { recursive: true, force: true }));

let n = 0;
/** A fresh pair of folders: `<root>/<n>/opendives-desktop` filled like a real data folder, and the new name's path. */
function oldFolder() {
  const base = path.join(root, String(n++));
  const old = path.join(base, 'opendives-desktop');
  fs.mkdirSync(path.join(old, 'carnet', 'objects'), { recursive: true });
  fs.mkdirSync(path.join(old, 'odgit', 'acct'), { recursive: true });
  fs.mkdirSync(path.join(old, 'Local Storage', 'leveldb'), { recursive: true });
  fs.writeFileSync(path.join(old, 'logbooks.json'), '{"list":[{"id":"main"}]}');
  fs.writeFileSync(path.join(old, 'cloud-account.bin'), Buffer.from([1, 2, 3, 4]));
  fs.writeFileSync(path.join(old, 'server-session.bin'), Buffer.from([5, 6]));
  fs.writeFileSync(path.join(old, 'window-state.json'), '{"x":10}');
  fs.writeFileSync(path.join(old, 'carnet', 'objects', 'a'), 'dive data');
  fs.writeFileSync(path.join(old, 'odgit', 'acct', 'HEAD'), 'ref: refs/heads/main');
  return { base, old, userData: path.join(base, 'benthic-desktop') };
}

const snapshot = (dir) => {
  const out = {};
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out[path.relative(dir, p)] = fs.readFileSync(p).toString('hex');
    }
  };
  walk(dir);
  return out;
};

test('the old data folder is renamed to the new name, with every file in it', () => {
  const { old, userData } = oldFolder();
  const before = snapshot(old);
  assert.equal(legacy.migrateUserDataFolder({ userData }), 'renamed');
  assert.equal(fs.existsSync(old), false);
  assert.deepEqual(snapshot(userData), before);
});

test('the empty folder Electron has already made does not stop the move', () => {
  const { old, userData } = oldFolder();
  fs.mkdirSync(userData);
  const before = snapshot(old);
  assert.equal(legacy.migrateUserDataFolder({ userData }), 'renamed');
  assert.deepEqual(snapshot(userData), before);
});

test('a new folder that already holds data is never touched, and neither is the old one', () => {
  const { old, userData } = oldFolder();
  fs.mkdirSync(userData);
  fs.writeFileSync(path.join(userData, 'logbooks.json'), '{"list":[]}');
  const before = snapshot(old);
  assert.equal(legacy.migrateUserDataFolder({ userData }), 'none');
  assert.deepEqual(snapshot(old), before);
  assert.equal(fs.readFileSync(path.join(userData, 'logbooks.json'), 'utf8'), '{"list":[]}');
});

test('no old folder: nothing to do; the same folder named twice: nothing to do', () => {
  const base = path.join(root, `none-${n++}`);
  fs.mkdirSync(base);
  assert.equal(legacy.migrateUserDataFolder({ userData: path.join(base, 'benthic-desktop') }), 'none');
  const { old } = oldFolder();
  assert.equal(legacy.migrateUserDataFolder({ userData: old, legacyUserData: old }), 'none');
});

test('when the system refuses the rename, the folder is copied, the new folder is complete and the old one removed', () => {
  const { old, userData } = oldFolder();
  const before = snapshot(old);
  const original = fs.renameSync;
  let refused = false;
  fs.renameSync = (from, to) => {
    if (!refused && from === old) {
      refused = true;
      throw Object.assign(new Error('EXDEV'), { code: 'EXDEV' });
    }
    return original(from, to);
  };
  try {
    assert.equal(legacy.migrateUserDataFolder({ userData }), 'copied');
  } finally {
    fs.renameSync = original;
  }
  assert.deepEqual(snapshot(userData), before);
  assert.equal(fs.existsSync(old), false);
  assert.equal(fs.existsSync(`${userData}.migrating`), false);
});

test('a copy that fails leaves the old folder whole and no half-made new folder', () => {
  const { old, userData } = oldFolder();
  const before = snapshot(old);
  const originalRename = fs.renameSync;
  const originalCp = fs.cpSync;
  fs.renameSync = (from, to) => {
    if (from === old) throw Object.assign(new Error('EPERM'), { code: 'EPERM' });
    return originalRename(from, to);
  };
  fs.cpSync = () => {
    throw new Error('EBUSY');
  };
  try {
    assert.equal(legacy.migrateUserDataFolder({ userData }), 'failed');
  } finally {
    fs.renameSync = originalRename;
    fs.cpSync = originalCp;
  }
  assert.deepEqual(snapshot(old), before);
  assert.equal(fs.existsSync(userData), false);
  assert.equal(fs.existsSync(`${userData}.migrating`), false);
});

test('the working copies of the server logbooks: odgit becomes bgit, once, and never over an existing bgit', () => {
  const { old } = oldFolder();
  assert.equal(legacy.migrateGitFolder(old), true);
  assert.equal(fs.existsSync(path.join(old, 'odgit')), false);
  assert.equal(fs.readFileSync(path.join(old, 'bgit', 'acct', 'HEAD'), 'utf8'), 'ref: refs/heads/main');
  assert.equal(legacy.migrateGitFolder(old), false, 'a second run finds nothing');
  fs.mkdirSync(path.join(old, 'odgit'));
  assert.equal(legacy.migrateGitFolder(old), false, 'bgit exists: odgit is left');
  assert.equal(fs.existsSync(path.join(old, 'odgit')), true);
});

test('web storage of the old origin is detected in Local Storage and IndexedDB, and not once the marker says done', () => {
  const { old } = oldFolder();
  assert.equal(legacy.hasLegacyOriginData(old), false, 'an empty profile has none');
  fs.writeFileSync(path.join(old, 'Local Storage', 'leveldb', '000003.log'), Buffer.concat([Buffer.from([0, 1]), Buffer.from('_app://opendives'), Buffer.from([0, 1]), Buffer.from('CapacitorStorage.od.theme dark')]));
  assert.equal(legacy.hasLegacyOriginData(old), true);
  fs.writeFileSync(path.join(old, legacy.MARKER), JSON.stringify({ status: 'done' }));
  assert.equal(legacy.hasLegacyOriginData(old), false);
  const { old: other } = oldFolder();
  fs.mkdirSync(path.join(other, 'IndexedDB', 'app_opendives_0.indexeddb.leveldb'), { recursive: true });
  assert.equal(legacy.hasLegacyOriginData(other), true);
  const { old: third } = oldFolder();
  fs.writeFileSync(path.join(third, 'Local Storage', 'leveldb', '000003.log'), 'app://benthic and nothing else');
  assert.equal(legacy.hasLegacyOriginData(third), false, 'only the old origin counts');
});

/**
 * A fake Electron for the hand-over. A window "loads" its page by running what the preload does: the old origin
 * sends what it holds and empties itself when told; the new one takes it and writes what it does not have.
 */
function fakeElectron({ oldData, newHolds = {}, failOld = false }) {
  const handlers = new Map();
  const ipcMain = {
    handle: (channel, fn) => handlers.set(channel, fn),
    removeHandler: (channel) => handlers.delete(channel),
  };
  const log = { opened: [], written: null, oldCleared: false, destroyed: 0 };
  const newStorage = { ...newHolds };
  const call = (...args) => handlers.get('bc:legacy-origin')({}, ...args);
  class FakeWindow {
    constructor(options) {
      this.options = options;
      this.webContents = {
        send: (channel) => {
          if (channel === 'bc:legacy-origin:clear') {
            log.oldCleared = true;
            queueMicrotask(() => call('old-cleared'));
          }
        },
      };
    }
    loadURL(url) {
      const { host, pathname } = new URL(url);
      log.opened.push(`${host}${pathname}`);
      queueMicrotask(async () => {
        if (host === 'opendives') {
          if (!failOld) await call('old-data', oldData);
          return;
        }
        const old = await call('take');
        let local = 0;
        for (const [k, v] of Object.entries(old.localStorage)) {
          if (!(k in newStorage)) {
            newStorage[k] = v;
            local++;
          }
        }
        log.written = { localStorage: local, files: old.files.length };
        await call('new-done', log.written);
      });
    }
    isDestroyed() {
      return false;
    }
    destroy() {
      log.destroyed++;
    }
  }
  return { BrowserWindow: FakeWindow, ipcMain, log, newStorage, handlers };
}

test('the hand-over reads the old origin, writes only what the new one lacks, empties the old one and writes the marker', async () => {
  const { userData } = oldFolder();
  fs.mkdirSync(userData);
  const fake = fakeElectron({
    oldData: { localStorage: { 'CapacitorStorage.od.theme': 'dark', 'CapacitorStorage.od.autoSync': 'false', 'CapacitorStorage.bc.welcome': 'old' }, files: [['gear/a.json', '{}']] },
    newHolds: { 'CapacitorStorage.bc.welcome': 'kept' },
  });
  const result = await legacy.handOverLegacyOrigin({ BrowserWindow: fake.BrowserWindow, ipcMain: fake.ipcMain, preload: '/x/preload.cjs', userData, timeoutMs: 500 });
  assert.deepEqual(result, { status: 'done', localStorage: 2, files: 1 });
  assert.deepEqual(fake.log.opened, ['opendives/legacy-migrate.html', 'benthic/legacy-migrate.html']);
  assert.equal(fake.newStorage['CapacitorStorage.bc.welcome'], 'kept', 'a value of the new origin is never replaced');
  assert.equal(fake.newStorage['CapacitorStorage.od.theme'], 'dark');
  assert.equal(fake.log.oldCleared, true);
  assert.equal(fake.log.destroyed, 2);
  assert.equal(fake.handlers.size, 0, 'the IPC handler is removed');
  assert.equal(JSON.parse(fs.readFileSync(path.join(userData, legacy.MARKER), 'utf8')).status, 'done');
  assert.equal(legacy.hasLegacyOriginData(userData), false);
});

test('a hand-over that times out is tried again at the next two starts, then given up; nothing is emptied', async () => {
  const { userData } = oldFolder();
  fs.mkdirSync(userData);
  fs.mkdirSync(path.join(userData, 'IndexedDB', 'app_opendives_0.indexeddb.leveldb'), { recursive: true });
  for (let attempt = 1; attempt <= 3; attempt++) {
    assert.equal(legacy.hasLegacyOriginData(userData), true, `attempt ${attempt} is made`);
    const fake = fakeElectron({ oldData: {}, failOld: true });
    const result = await legacy.handOverLegacyOrigin({ BrowserWindow: fake.BrowserWindow, ipcMain: fake.ipcMain, preload: '/x', userData, timeoutMs: 30 });
    assert.equal(result.status, 'failed');
    assert.match(result.error, /timed out/);
    assert.equal(fake.log.oldCleared, false);
    assert.equal(fake.handlers.size, 0);
  }
  assert.equal(legacy.hasLegacyOriginData(userData), false, 'given up after three tries');
  assert.equal(JSON.parse(fs.readFileSync(path.join(userData, legacy.MARKER), 'utf8')).attempts, 3);
});
