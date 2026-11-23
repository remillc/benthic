// SPDX-License-Identifier: GPL-2.0
// The personal clouds of the desktop app (task 2026-11-15-173): sign-in with PKCE through the system
// browser and a loopback redirect, the refresh token kept encrypted, upload and download of the .ssrf
// file, the remote change noticed, the version to keep on a conflict, and the keys that never reach the
// interface. A fake OAuth server and a fake Google Drive, Graph and Dropbox stand in for the services.
// Run: node --test tests/desktop/cloud.test.mjs
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const cloudModule = require('../../desktop/cloud.cjs');
const { createCloudService, pkcePair, loadClients, decideSync, ACCESS, DROPBOX_PORT } = cloudModule;
const { startFakeCloud, CLIENT, ACCOUNT } = require('./fake-cloud-server.cjs');
const { setupBridge } = require('../../desktop/bridge.cjs');
const logbooks = require('../../desktop/logbooks.cjs');
const { createWindowManager } = require('../../desktop/windows.cjs');
const here = path.dirname(fileURLToPath(import.meta.url));

const CLIENTS = {
  googleDrive: { clientId: CLIENT.googleDrive.id, clientSecret: CLIENT.googleDrive.secret },
  oneDrive: { clientId: CLIENT.oneDrive.id },
  dropbox: { clientId: CLIENT.dropbox.id },
};
const safeStorage = { isEncryptionAvailable: () => true, encryptString: (t) => Buffer.from(`enc:${Buffer.from(t).toString('base64')}`), decryptString: (b) => Buffer.from(b.toString().slice(4), 'base64').toString() };
const texts = {
  desktopLogbooks: { mainName: 'Main', source: { googleDrive: 'Google Drive', oneDrive: 'Microsoft OneDrive', dropbox: 'Dropbox' }, main: { missingTitle: '{name}', missingText: 'x', ok: 'OK', openTitle: 'o', fileFilter: 'f', newFileTitle: 'n', copyTitle: 'c', copySuffix: 'copy', folderTitle: 'p' } },
  desktopCloud: { conflict: { title: '"{name}" changed in two places', local: 'This computer\'s copy', remote: 'The copy on {service}', later: 'Decide later', modified: 'modified {date}', warning: 'The other is kept nowhere.' } },
};

let fake;
let root;
let userData;
/** The pages the "browser" was sent to. */
let opened;

/** A browser that follows the sign-in page's redirect, as the diver's browser does once they agreed. */
const agreeingBrowser = async (url) => {
  opened.push(url);
  const answer = await fetch(url, { redirect: 'manual' });
  const location = answer.headers.get('location');
  assert.ok(location, 'the sign-in page redirects');
  await fetch(location);
};

function service(overrides = {}) {
  return createCloudService({
    userData,
    safeStorage,
    openExternal: agreeingBrowser,
    clients: CLIENTS,
    endpoints: fake.endpoints,
    ports: { dropbox: 0 },
    texts: () => texts,
    ...overrides,
  });
}

before(async () => {
  fake = await startFakeCloud();
  root = mkdtempSync(path.join(tmpdir(), 'bc-cloud-'));
});
beforeEach(() => {
  userData = path.join(root, `u${Math.random().toString(16).slice(2)}`);
  mkdirSync(userData, { recursive: true });
  opened = [];
  fake.state.accessTokens.clear();
});
after(async () => {
  await fake.close();
  rmSync(root, { recursive: true, force: true });
});

const b64url = (buffer) => buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

test('PKCE: the challenge is the S256 of the verifier, and every pair is new', () => {
  const a = pkcePair();
  const b = pkcePair();
  assert.equal(a.challenge, b64url(crypto.createHash('sha256').update(a.verifier).digest()));
  assert.notEqual(a.verifier, b.verifier);
  assert.ok(a.verifier.length >= 43 && a.verifier.length <= 128);
  assert.match(a.verifier, /^[A-Za-z0-9_-]+$/);
});

for (const provider of ['googleDrive', 'oneDrive', 'dropbox']) {
  test(`${provider}: sign-in with PKCE, the code exchange, the account, and the token stored encrypted`, async () => {
    const cloud = service();
    const before = cloud.status().find((p) => p.provider === provider);
    assert.deepEqual(before, { provider, available: true, connected: false, account: '' });
    const status = await cloud.signIn(provider);
    assert.deepEqual(status, { provider, available: true, connected: true, account: ACCOUNT[provider] });
    // The page the browser was sent to.
    assert.equal(opened.length, 1);
    const page = new URL(opened[0]);
    const q = page.searchParams;
    assert.equal(q.get('response_type'), 'code');
    assert.equal(q.get('code_challenge_method'), 'S256');
    assert.equal(q.get('scope'), ACCESS[provider].scope);
    assert.equal(q.get('client_id'), CLIENTS[provider].clientId);
    assert.ok((q.get('state') || '').length >= 24);
    const redirect = new URL(q.get('redirect_uri'));
    assert.equal(redirect.hostname, '127.0.0.1');
    assert.equal(redirect.protocol, 'http:');
    if (provider === 'googleDrive') assert.equal(q.get('access_type'), 'offline');
    if (provider === 'dropbox') assert.equal(q.get('token_access_type'), 'offline');
    // The fake server verified the verifier against the challenge when it exchanged the code (it refuses otherwise);
    // the refresh token is on disk, but not as text.
    const file = path.join(userData, `cloud-${provider}.bin`);
    assert.ok(existsSync(file));
    assert.ok(!readFileSync(file, 'utf8').includes('rt-'));
    // A new service object (a restart of the app) still is connected.
    assert.equal(service().status().find((p) => p.provider === provider).connected, true);
    // Sign out forgets it.
    assert.equal(cloud.signOut(provider).connected, false);
    assert.ok(!existsSync(file));
  });
}

test('Google and Microsoft redirect to a free loopback port; Dropbox to the fixed http://127.0.0.1:53682/', async () => {
  const cloud = service({ ports: {} });
  await cloud.signIn('googleDrive');
  await cloud.signIn('oneDrive');
  const redirects = opened.map((u) => new URL(u).searchParams.get('redirect_uri'));
  assert.match(redirects[0], /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.match(redirects[1], /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(DROPBOX_PORT, 53682);
  await cloud.signIn('dropbox');
  assert.equal(new URL(opened[2]).searchParams.get('redirect_uri'), 'http://127.0.0.1:53682/');
});

test('a redirect with another state is refused: no token, nothing stored', async () => {
  const cloud = service({
    openExternal: async (url) => {
      const redirect = new URL(new URL(url).searchParams.get('redirect_uri'));
      redirect.searchParams.set('code', 'stolen');
      redirect.searchParams.set('state', 'not-the-state');
      await fetch(redirect);
    },
  });
  await assert.rejects(cloud.signIn('dropbox'), { code: 'STATE_MISMATCH' });
  assert.equal(cloud.status().find((p) => p.provider === 'dropbox').connected, false);
  assert.equal(readdirSync(userData).filter((n) => n.startsWith('cloud-')).length, 0);
});

test('the diver refusing at the provider ends the sign-in without a token', async () => {
  const cloud = service({
    openExternal: async (url) => {
      const redirect = new URL(new URL(url).searchParams.get('redirect_uri'));
      redirect.searchParams.set('error', 'access_denied');
      redirect.searchParams.set('state', new URL(url).searchParams.get('state'));
      await fetch(redirect);
    },
  });
  await assert.rejects(cloud.signIn('googleDrive'), { code: 'SIGN_IN_DENIED' });
  assert.equal(cloud.status().find((p) => p.provider === 'googleDrive').connected, false);
});

test('a sign-in nobody finishes ends by itself, and a stray request to the loopback address is ignored', async () => {
  const cloud = service({
    signInTimeoutMs: 150,
    openExternal: async (url) => {
      const redirect = new URL(new URL(url).searchParams.get('redirect_uri'));
      const stray = await fetch(new URL('/favicon.ico', redirect));
      assert.equal(stray.status, 404);
    },
  });
  await assert.rejects(cloud.signIn('oneDrive'), { code: 'SIGN_IN_TIMEOUT' });
});

test('a service without its client id is not available: its row is disabled and nothing opens', async () => {
  const cloud = service({ clients: { googleDrive: CLIENTS.googleDrive } });
  const all = cloud.status();
  assert.equal(all.find((p) => p.provider === 'googleDrive').available, true);
  assert.equal(all.find((p) => p.provider === 'oneDrive').available, false);
  assert.equal(all.find((p) => p.provider === 'dropbox').available, false);
  await assert.rejects(cloud.signIn('dropbox'), { code: 'NOT_AVAILABLE' });
  assert.equal(opened.length, 0);
  // And without the file at all.
  assert.deepEqual(loadClients(path.join(root, 'nothing.json')), {});
});

test('oauth-clients.local.json: the three services, the Dropbox key named appKey, blanks ignored', () => {
  const file = path.join(root, 'clients.json');
  writeFileSync(file, JSON.stringify({ google: { clientId: ' g ', clientSecret: 's' }, microsoft: { clientId: '' }, dropbox: { appKey: 'd' } }));
  assert.deepEqual(loadClients(file), { googleDrive: { clientId: 'g', clientSecret: 's' }, dropbox: { clientId: 'd' } });
});

test('the access token is refreshed when it stops working; Microsoft\'s rotated refresh token is kept', async () => {
  for (const provider of ['googleDrive', 'oneDrive', 'dropbox']) {
    const cloud = service();
    await cloud.signIn(provider);
    const source = path.join(root, 'r.ssrf');
    writeFileSync(source, 'one');
    const d = { provider, folder: 'OpenDives', fileName: `refresh-${provider}.ssrf` };
    await cloud.createRemote(d, source);
    const refreshes = fake.state.refreshCount;
    fake.state.accessTokens.clear(); // the services stop honouring the token
    const remote = await cloud.stat(d, undefined);
    assert.ok(remote.rev);
    assert.equal(fake.state.refreshCount, refreshes + 1);
    // Again, with a new service object: the stored refresh token (rotated for Microsoft) still works.
    fake.state.accessTokens.clear();
    assert.ok(await service().stat(d, undefined));
    assert.equal(fake.state.refreshCount, refreshes + 2);
  }
});

test('a revoked refresh token signs the account out and says so', async () => {
  const cloud = service();
  await cloud.signIn('dropbox');
  fake.state.refreshTokens.clear();
  fake.state.accessTokens.clear();
  await assert.rejects(cloud.stat({ provider: 'dropbox', folder: '', fileName: 'x.ssrf' }, undefined), { code: 'SIGN_IN_EXPIRED' });
  assert.equal(cloud.status().find((p) => p.provider === 'dropbox').connected, false);
});

test('upload, download and the revision, on each service; a changed file is refused unless the revision matches', async () => {
  for (const provider of ['googleDrive', 'oneDrive', 'dropbox']) {
    const cloud = service();
    await cloud.signIn(provider);
    const d = { provider, folder: 'OpenDives/plongées', fileName: 'Mon carnet é.ssrf' };
    const source = path.join(root, `up-${provider}.ssrf`);
    writeFileSync(source, 'first version');
    const created = await cloud.createRemote(d, source);
    assert.ok(created.rev);
    await assert.rejects(cloud.createRemote(d, source), { code: 'EXISTS' });
    const target = path.join(root, `down-${provider}.ssrf`);
    const got = await cloud.download(d, created.ref, target);
    assert.equal(readFileSync(target, 'utf8'), 'first version');
    assert.equal(got.rev, created.rev);
    // A second upload at the known revision goes through and gives a new revision.
    writeFileSync(source, 'second version');
    const second = await cloud.upload(d, created.ref, source, { expectedRev: created.rev });
    assert.notEqual(second.rev, created.rev);
    assert.equal((await cloud.stat(d, second.ref)).rev, second.rev);
    // The file was changed elsewhere: an upload that knows the old revision is refused.
    await assert.rejects(cloud.upload(d, created.ref, source, { expectedRev: created.rev }), { code: 'REMOTE_CHANGED' });
    // A file that is not there.
    assert.equal(await cloud.stat({ ...d, fileName: 'absent.ssrf' }, undefined), null);
  }
});

test('Dropbox arguments are plain ASCII on the wire; a Graph upload goes in chunks with no bearer token on the upload address', async () => {
  const cloud = service();
  await cloud.signIn('dropbox');
  const source = path.join(root, 'ascii.ssrf');
  writeFileSync(source, 'x');
  await cloud.createRemote({ provider: 'dropbox', folder: 'é', fileName: 'ü.ssrf' }, source);
  assert.ok(!/[^\x20-\x7e]/.test(fake.state.lastUploadArg));
  await cloud.signIn('oneDrive');
  const big = Buffer.alloc(10 * 1024 * 1024 + 1000, 7);
  writeFileSync(source, big);
  const d = { provider: 'oneDrive', folder: 'Big', fileName: 'big.ssrf' };
  const sent = await cloud.createRemote(d, source);
  assert.equal(sent.rev.startsWith('ctag-'), true);
  const target = path.join(root, 'big-down.ssrf');
  await cloud.download(d, undefined, target);
  assert.equal(readFileSync(target).length, big.length);
  const puts = fake.state.log.filter((r) => r.provider === 'oneDrive' && r.method === 'PUT' && String(r.headers['content-range']).endsWith(`/${big.length}`));
  assert.equal(puts.length, 2);
  assert.ok(puts.every((r) => !r.headers.authorization));
});

test('what to do when the working copy meets the remote file', () => {
  const remote = (rev) => ({ rev });
  assert.equal(decideSync({ knownRev: 'a', remote: remote('a'), pending: false }), 'same');
  assert.equal(decideSync({ knownRev: 'a', remote: remote('a'), pending: true }), 'upload');
  assert.equal(decideSync({ knownRev: 'a', remote: remote('b'), pending: false }), 'download');
  assert.equal(decideSync({ knownRev: 'a', remote: remote('b'), pending: true }), 'conflict');
  assert.equal(decideSync({ knownRev: undefined, remote: remote('b'), pending: false }), 'download');
  assert.equal(decideSync({ knownRev: 'a', remote: null, pending: false }), 'upload');
});

test('the conflict dialog offers the two copies with their dates, and a way to decide later', async () => {
  const calls = [];
  const cloud = service({ dialog: { showMessageBox: async (parent, options) => (calls.push({ parent, options }), { response: 1 }) }, parentOf: () => 'the-window', locale: 'en' });
  const choice = await cloud.askConflict({}, { provider: 'dropbox', name: 'Mon carnet', localModified: Date.UTC(2026, 10, 14, 9, 0), remoteModified: '2026-11-15T10:30:00Z' });
  assert.equal(choice, 'remote');
  assert.equal(calls[0].parent, 'the-window');
  assert.deepEqual(calls[0].options.buttons, ['This computer\'s copy', 'The copy on Dropbox', 'Decide later']);
  assert.ok(calls[0].options.message.includes('Mon carnet'));
  assert.match(calls[0].options.detail, /November 1[45], 2026/);
  for (const [response, expected] of [[0, 'local'], [2, 'later']]) {
    const c = service({ dialog: { showMessageBox: async () => ({ response }) } });
    assert.equal(await c.askConflict({}, { provider: 'dropbox', name: 'x', localModified: 0, remoteModified: '' }), expected);
  }
});

// --- A cloud logbook in a window: the bridge, the window manager, a fake helper and a fake Electron ---

let nextId = 700;
function fakeElectron(answers) {
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
    loadURL() {}
    show() {}
    focus() {}
    isMinimized() { return false; }
    isDestroyed() { return false; }
    getBounds() { return { x: 0, y: 0, width: 800, height: 600 }; }
    setTitle(t) { this.title = t; }
    maximize() {}
  }
  FakeWindow.fromWebContents = (wc) => created.find((w) => w.webContents === wc) ?? null;
  const dialog = {
    showMessageBox: async (_parent, options) => {
      answers.asked.push(options);
      return { response: answers.next ?? 2 };
    },
    showOpenDialog: async () => ({ canceled: true }),
    showSaveDialog: async () => ({ canceled: true }),
  };
  return { BrowserWindow: FakeWindow, dialog, shell: { openExternal() {}, showItemInFolder() {} }, created };
}

/** A whole desktop in a temporary folder, with the cloud service bound to the fake provider. */
function desktop() {
  const base = mkdtempSync(path.join(root, 'd-'));
  const data = path.join(base, 'userData');
  mkdirSync(path.join(base, 'resources'), { recursive: true });
  const handlers = new Map();
  const answers = { asked: [], next: 2 };
  const fakeE = fakeElectron(answers);
  const app = { getPath: (n) => (n === 'userData' ? data : path.join(base, 'tmp')), getVersion: () => '1', isPackaged: false, on: () => {}, quit: () => {} };
  const cloud = createCloudService({
    userData: data,
    safeStorage,
    openExternal: agreeingBrowser,
    clients: CLIENTS,
    endpoints: fake.endpoints,
    ports: { dropbox: 0 },
    texts: () => texts,
    dialog: fakeE.dialog,
    parentOf: () => undefined,
  });
  const bridge = setupBridge({
    ipcMain: { handle: (c, fn) => handlers.set(c, fn), on: (c, fn) => handlers.set(`on:${c}`, fn) },
    app,
    safeStorage,
    hostPath: process.execPath,
    hostArgs: [path.join(here, 'fake-logbook-host.cjs')],
    resourcesDir: path.join(base, 'resources'),
    broadcast: () => {},
    cloud,
  });
  const wm = createWindowManager({
    electron: fakeE,
    bridge,
    store: new logbooks.LogbookStore(data),
    ipcMain: { handle: (c, f) => handlers.set(`wm:${c}`, f) },
    texts: () => texts,
    userData: data,
    platform: 'win32',
    preload: 'p',
    icon: 'i',
    entryUrl: 'app://x/',
    isAppUrl: () => true,
    home: base,
    cloud,
    cloudCheckMs: 0,
  });
  return { base, data, handlers, answers, fakeE, cloud, bridge, wm };
}

const remoteText = (provider, file) => fake.state.files[provider].get(file)?.bytes.toString();

test('a cloud logbook: created in the service, the working copy kept, every save sent up', async () => {
  const d = desktop();
  const main = d.wm.openMain();
  await assert.rejects(d.wm.handle({ sender: main.webContents }, 'create', { where: 'cloud', name: 'Nuage', provider: 'dropbox', folder: 'ignored' }), { code: 'NOT_SIGNED_IN' });
  await d.wm.handle({ sender: main.webContents }, 'cloudSignIn', { provider: 'dropbox' });
  const result = await d.wm.handle({ sender: main.webContents }, 'create', { where: 'cloud', name: 'Nuage', provider: 'dropbox', folder: 'ignored' });
  assert.equal(result.opened, true);
  assert.equal(result.descriptor.kind, 'cloud');
  assert.equal(result.descriptor.provider, 'dropbox');
  assert.equal(result.descriptor.location, 'Nuage.ssrf');
  assert.ok(remoteText('dropbox', 'Nuage.ssrf').includes('<dives>'));
  // The working copy is in the cache; the same name again is refused.
  assert.ok(existsSync(logbooks.localFileOf(d.data, result.descriptor)));
  await assert.rejects(d.wm.handle({ sender: main.webContents }, 'create', { where: 'cloud', name: 'Nuage', provider: 'dropbox', folder: 'ignored' }), { code: 'EXISTS' });
  // A save in the window goes up.
  const win = d.fakeE.created[d.fakeE.created.length - 1];
  const key = win.webContents.id;
  const before = fake.state.files.dropbox.get('Nuage.ssrf').rev;
  await d.bridge.callFor(key, 'saveLocal');
  assert.notEqual(fake.state.files.dropbox.get('Nuage.ssrf').rev, before);
  assert.match(remoteText('dropbox', 'Nuage.ssrf'), /^saved after /);
  assert.equal(logbooks.readMeta(d.data, result.descriptor.id).pending, false);
  await d.bridge.stop();
});

test('changed elsewhere and nothing unsent: the new version is downloaded and the window reads it again', async () => {
  const d = desktop();
  const main = d.wm.openMain();
  await d.wm.handle({ sender: main.webContents }, 'cloudSignIn', { provider: 'oneDrive' });
  const { descriptor } = await d.wm.handle({ sender: main.webContents }, 'create', { where: 'cloud', name: 'Ailleurs', provider: 'oneDrive', folder: '' });
  const win = d.fakeE.created[d.fakeE.created.length - 1];
  const key = win.webContents.id;
  await d.bridge.callFor(key, 'ping');
  // Nothing changed: nothing happens.
  assert.equal((await d.bridge.cloudCheck(key)).reload, false);
  fake.state.putFile('oneDrive', 'Ailleurs.ssrf', Buffer.from('<divelog>from the other computer</divelog>'));
  const result = await d.wm.checkCloud(win);
  assert.equal(result.reload, true);
  assert.equal(win.reloads, 1);
  assert.equal(readFileSync(logbooks.localFileOf(d.data, descriptor), 'utf8'), '<divelog>from the other computer</divelog>');
  assert.equal(d.answers.asked.length, 0, 'nothing to ask');
  // The helper reads the downloaded file at its next call.
  await d.bridge.callFor(key, 'listLoadedDives');
  assert.equal(logbooks.readMeta(d.data, descriptor.id).pending, false);
  await d.bridge.stop();
});

test('changed in both places: the diver chooses, and nothing is overwritten before they do', async () => {
  const d = desktop();
  const main = d.wm.openMain();
  await d.wm.handle({ sender: main.webContents }, 'cloudSignIn', { provider: 'googleDrive' });
  const { descriptor } = await d.wm.handle({ sender: main.webContents }, 'create', { where: 'cloud', name: 'Deux', provider: 'googleDrive', folder: 'OpenDives' });
  const win = d.fakeE.created[d.fakeE.created.length - 1];
  const key = win.webContents.id;
  await d.bridge.callFor(key, 'ping');
  const remoteKey = [...fake.state.files.googleDrive.keys()].find((k) => k.endsWith('/Deux.ssrf'));
  const local = logbooks.localFileOf(d.data, descriptor);

  // 1. « Décider plus tard »: both copies stay as they are.
  fake.state.putFile('googleDrive', remoteKey, Buffer.from('REMOTE-1'));
  d.answers.next = 2;
  await d.bridge.callFor(key, 'saveLocal');
  assert.equal(d.answers.asked.length, 1);
  assert.equal(remoteText('googleDrive', remoteKey), 'REMOTE-1');
  assert.match(readFileSync(local, 'utf8'), /^saved after /);
  assert.equal(logbooks.readMeta(d.data, descriptor.id).pending, true);
  assert.deepEqual(d.answers.asked[0].buttons, ['This computer\'s copy', 'The copy on Google Drive', 'Decide later']);
  // The check that follows does not ask again until the window is opened again.
  await d.bridge.cloudCheck(key);
  assert.equal(d.answers.asked.length, 1);

  // 2. « La copie de cet ordinateur »: it replaces the service's.
  d.answers.next = 0;
  await d.bridge.callFor(key, 'setup-not-a-method').catch(() => {});
  const fresh = d.fakeE.created.length;
  await d.wm.handle({ sender: main.webContents }, 'open', { id: descriptor.id });
  assert.equal(d.fakeE.created.length, fresh, 'the logbook is already open: its window only comes forward');
  // Closing and opening it again meets the pending change.
  await d.wm.closeLogbook(win);
  await d.wm.handle({ sender: win.webContents }, 'open', { id: descriptor.id });
  await d.bridge.callFor(win.webContents.id, 'ping');
  assert.equal(d.answers.asked.length, 2);
  assert.match(remoteText('googleDrive', remoteKey), /^saved after /);
  assert.equal(logbooks.readMeta(d.data, descriptor.id).pending, false);

  // 3. « La copie de {service} »: the service's replaces this computer's.
  fake.state.putFile('googleDrive', remoteKey, Buffer.from('REMOTE-2'));
  d.answers.next = 2;
  await d.bridge.callFor(win.webContents.id, 'saveLocal');
  d.answers.next = 1;
  await d.wm.closeLogbook(win);
  await d.wm.handle({ sender: win.webContents }, 'open', { id: descriptor.id });
  await d.bridge.callFor(win.webContents.id, 'ping');
  assert.equal(readFileSync(local, 'utf8'), 'REMOTE-2');
  assert.equal(logbooks.readMeta(d.data, descriptor.id).pending, false);
  await d.bridge.stop();
});

test('without a connection a save waits, and goes up at the next check', async () => {
  const d = desktop();
  const main = d.wm.openMain();
  await d.wm.handle({ sender: main.webContents }, 'cloudSignIn', { provider: 'dropbox' });
  const { descriptor } = await d.wm.handle({ sender: main.webContents }, 'create', { where: 'cloud', name: 'Hors ligne', provider: 'dropbox', folder: 'ignored' });
  const win = d.fakeE.created[d.fakeE.created.length - 1];
  const key = win.webContents.id;
  await d.bridge.callFor(key, 'ping');
  // The network goes away: the service object cannot reach anything.
  const down = createCloudService({ userData: d.data, safeStorage, openExternal: agreeingBrowser, clients: CLIENTS, endpoints: { dropbox: { ...fake.endpoints.dropbox, api: 'http://127.0.0.1:9/2', content: 'http://127.0.0.1:9/content', token: 'http://127.0.0.1:9/token' } }, texts: () => texts });
  const realStat = d.cloud.stat;
  const realUpload = d.cloud.upload;
  d.cloud.stat = down.stat;
  d.cloud.upload = down.upload;
  const before = fake.state.files.dropbox.get('Hors ligne.ssrf').rev;
  await d.bridge.callFor(key, 'saveLocal');
  assert.equal(logbooks.readMeta(d.data, descriptor.id).pending, true);
  assert.equal(fake.state.files.dropbox.get('Hors ligne.ssrf').rev, before);
  d.cloud.stat = realStat;
  d.cloud.upload = realUpload;
  const result = await d.bridge.cloudCheck(key);
  assert.equal(result.state, 'uploaded');
  assert.notEqual(fake.state.files.dropbox.get('Hors ligne.ssrf').rev, before);
  assert.equal(logbooks.readMeta(d.data, descriptor.id).pending, false);
  await d.bridge.stop();
});

test('the tokens and the client keys never reach the interface', async () => {
  const d = desktop();
  const main = d.wm.openMain();
  const status = await d.wm.handle({ sender: main.webContents }, 'cloudSignIn', { provider: 'googleDrive' });
  const all = await d.wm.handle({ sender: main.webContents }, 'cloudStatus');
  const text = JSON.stringify([status, all]);
  for (const secret of ['rt-', 'at-', CLIENT.googleDrive.secret, CLIENT.googleDrive.id, CLIENT.oneDrive.id]) assert.ok(!text.includes(secret), `the status does not carry ${secret}`);
  assert.deepEqual(Object.keys(all[0]).sort(), ['account', 'available', 'connected', 'provider']);
  // The files are not reachable through the bridge's file and core calls.
  const file = path.join(d.data, 'cloud-googleDrive.bin');
  assert.ok(existsSync(file));
  const sender = { id: 0 };
  const invoke = (channel, ...args) => d.handlers.get(channel)({ sender }, ...args);
  assert.equal((await invoke('bc:fs', 'exists', { path: file })).ok, false);
  assert.equal((await invoke('bc:fs', 'readFile', { path: file })).ok, false);
  assert.equal((await invoke('bc:core', 'importDives', { file })).ok, false);
  assert.equal((await invoke('bc:core', 'importFile', { source: file, repo: path.join(d.data, 'x') })).ok, false);
  assert.equal((await invoke('bc:core', 'importFile', { source: path.join(d.data, 'oauth-clients.local.json'), repo: path.join(d.data, 'x') })).ok, false);
  // The preload exposes no function that returns a token.
  const preload = readFileSync(path.join(here, '..', '..', 'desktop', 'preload.cjs'), 'utf8');
  assert.ok(!/refreshToken|accessToken|clientSecret/.test(preload));
  await d.bridge.stop();
});

test('« Annuler la connexion » ends a sign-in waiting for the browser at once', async () => {
  /** @type {any} */
  let cloud;
  cloud = service({
    signInTimeoutMs: 60_000,
    // The page was opened, then closed by the diver: Benthic cancels the wait.
    openExternal: async () => {
      setTimeout(() => cloud.cancelSignIn('oneDrive'), 20);
    },
  });
  const started = Date.now();
  await assert.rejects(cloud.signIn('oneDrive'), { code: 'SIGN_IN_CANCELLED' });
  assert.ok(Date.now() - started < 5000, 'not after the timeout');
  assert.equal(cloud.status().find((p) => p.provider === 'oneDrive').connected, false);
});

test('« Rouvrir la page » opens the same sign-in page again while the sign-in waits', async () => {
  /** @type {any} */
  let cloud;
  /** @type {string[]} */
  const opened = [];
  cloud = service({
    signInTimeoutMs: 60_000,
    openExternal: async (url) => {
      opened.push(url);
      if (opened.length === 1)
        setTimeout(() => {
          assert.equal(cloud.reopenSignIn('oneDrive'), true);
          setTimeout(() => cloud.cancelSignIn('oneDrive'), 20);
        }, 20);
    },
  });
  await assert.rejects(cloud.signIn('oneDrive'), { code: 'SIGN_IN_CANCELLED' });
  assert.equal(opened.length, 2);
  assert.equal(opened[1], opened[0]);
  // No sign-in waiting: nothing to reopen.
  assert.equal(cloud.reopenSignIn('oneDrive'), false);
});

test('« Changer de compte »: the service asks which account again, and the stored account is replaced only once the new sign-in succeeded', async () => {
  const extra = { googleDrive: ['prompt', 'select_account consent'], oneDrive: ['prompt', 'select_account'], dropbox: ['force_reauthentication', 'true'] };
  for (const provider of ['googleDrive', 'oneDrive', 'dropbox']) {
    const cloud = service();
    await cloud.signIn(provider);
    // An ordinary sign-in does not ask for the account (Google asks for the consent only).
    const plain = new URL(opened[0]).searchParams;
    assert.equal(plain.get('force_reauthentication'), null);
    assert.notEqual(plain.get('prompt'), extra[provider][1]);
    const file = path.join(userData, `cloud-${provider}.bin`);
    const first = readFileSync(file);
    // A switch the diver refuses at the service: the first account is still there.
    const refusing = service({
      openExternal: async (url) => {
        const redirect = new URL(new URL(url).searchParams.get('redirect_uri'));
        redirect.searchParams.set('error', 'access_denied');
        redirect.searchParams.set('state', new URL(url).searchParams.get('state'));
        await fetch(redirect);
      },
    });
    await assert.rejects(refusing.signIn(provider, { switchAccount: true }), { code: 'SIGN_IN_DENIED' });
    assert.deepEqual(readFileSync(file), first);
    assert.equal(refusing.statusOf(provider).connected, true);
    // A switch that succeeds: the page asks for the account, and the tokens are new.
    opened = [];
    const status = await service().signIn(provider, { switchAccount: true });
    assert.equal(status.connected, true);
    const q = new URL(opened[0]).searchParams;
    assert.equal(q.get(extra[provider][0]), extra[provider][1]);
    assert.notDeepEqual(readFileSync(file), first);
    // Without the switch the page has no such parameter, whatever the service.
    opened = [];
    await service().signIn(provider);
    assert.equal(new URL(opened[0]).searchParams.get('force_reauthentication'), null);
    assert.notEqual(new URL(opened[0]).searchParams.get('prompt'), 'select_account');
  }
});

test('the folder is never the diver\'s: Benthic on Google Drive, the app folder root on OneDrive and Dropbox', async () => {
  const d = desktop();
  const main = d.wm.openMain();
  for (const [provider, location] of [['googleDrive', 'Benthic/Dossier.ssrf'], ['oneDrive', 'Dossier.ssrf'], ['dropbox', 'Dossier.ssrf']]) {
    await d.wm.handle({ sender: main.webContents }, 'cloudSignIn', { provider });
    const result = await d.wm.handle({ sender: main.webContents }, 'create', { where: 'cloud', name: 'Dossier', provider, folder: '../elsewhere' });
    assert.equal(result.descriptor.location, location, provider);
  }
  await d.bridge.stop();
});

test('WebDAV from the dialog: the server, user name and password create the logbook, which then saves like any cloud logbook', async () => {
  const { startFakeWebdav } = require('./fake-webdav-server.cjs');
  const dav = await startFakeWebdav();
  const d = desktop();
  const main = d.wm.openMain();
  const spec = { where: 'cloud', name: 'Serveur', provider: 'webdav', server: dav.address, username: dav.user, password: dav.password };
  await assert.rejects(d.wm.handle({ sender: main.webContents }, 'create', { ...spec, password: 'nope' }), { code: 'BAD_CREDENTIALS' });
  assert.equal(dav.files.size, 0);
  const result = await d.wm.handle({ sender: main.webContents }, 'create', spec);
  assert.equal(result.descriptor.provider, 'webdav');
  assert.equal(result.descriptor.location, 'Benthic/Serveur.ssrf');
  assert.ok(dav.files.get('Benthic/Serveur.ssrf').bytes.toString().includes('<dives>'));
  const status = (await d.wm.handle({ sender: main.webContents }, 'cloudStatus')).find((p) => p.provider === 'webdav');
  assert.equal(status.connected, true);
  assert.ok(!JSON.stringify(status).includes(dav.password));
  // A save goes up with If-Match on the revision this computer knows.
  const win = d.fakeE.created[d.fakeE.created.length - 1];
  const before = dav.files.get('Benthic/Serveur.ssrf').etag;
  await d.bridge.callFor(win.webContents.id, 'saveLocal');
  assert.notEqual(dav.files.get('Benthic/Serveur.ssrf').etag, before);
  assert.equal(dav.requests.filter((r) => r.method === 'PUT').pop().headers['if-match'], before);
  await d.bridge.stop();
  await dav.close();
});
