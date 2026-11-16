// SPDX-License-Identifier: GPL-2.0
// WebDAV and Nextcloud as a cloud logbook (task 2026-11-15-208): the connection check on « Créer le carnet »
// (PROPFIND Depth 0, the Nextcloud path tried for a bare server address), the OpenDives folder (MKCOL, 405 when
// it exists), the file (PUT, GET, the ETag), a changed remote file refused (If-Match), the password kept encrypted
// and never logged or sent to the interface. A fake WebDAV server (node http) stands in for the server.
// Run: node --test tests/desktop/webdav.test.mjs
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { createCloudService } = require('../../desktop/cloud.cjs');
const logbooks = require('../../desktop/logbooks.cjs');
const { startFakeWebdav } = require('./fake-webdav-server.cjs');

const safeStorage = { isEncryptionAvailable: () => true, encryptString: (t) => Buffer.from(`enc:${Buffer.from(t).toString('base64')}`), decryptString: (b) => Buffer.from(b.toString().slice(4), 'base64').toString() };

let root;
let userData;
let server;
let logged;
let source;

function service() {
  return createCloudService({ userData, safeStorage, openExternal: () => {}, clients: {}, log: (text) => logged.push(text) });
}
const fields = (over = {}) => ({ server: server.address, username: server.user, password: server.password, ...over });
const descriptor = (name = 'Mon carnet', folder = 'OpenDives') => logbooks.cloudDescriptor({ provider: 'webdav', folder, name });

before(() => {
  root = mkdtempSync(path.join(tmpdir(), 'od-webdav-'));
});
beforeEach(async () => {
  userData = path.join(root, `u${Math.random().toString(16).slice(2)}`);
  mkdirSync(userData, { recursive: true });
  source = path.join(userData, 'new.ssrf');
  writeFileSync(source, '<divelog program="x"></divelog>');
  logged = [];
  server = await startFakeWebdav();
});
after(() => rmSync(root, { recursive: true, force: true }));

const closeServer = () => server.close();

test('a bare Nextcloud address: the connection is checked, the OpenDives folder made, the file put there', async () => {
  const cloud = service();
  assert.deepEqual(cloud.statusOf('webdav'), { provider: 'webdav', available: true, connected: false, account: '' });
  const remote = await cloud.createWebdavRemote(fields(), descriptor(), source);
  assert.ok(remote.rev);
  assert.ok(server.folders.has('OpenDives/'));
  assert.equal(server.files.get('OpenDives/Mon carnet.ssrf').bytes.toString(), '<divelog program="x"></divelog>');
  // The check came first, on the Nextcloud path, with Depth 0.
  const first = server.requests[0];
  assert.equal(first.method, 'PROPFIND');
  assert.equal(first.path, '/remote.php/dav/files/alice/');
  assert.equal(first.headers.depth, '0');
  // Connected afterwards, as « alice@host », and the same file is read back.
  const status = cloud.statusOf('webdav');
  assert.equal(status.connected, true);
  assert.equal(status.account, `alice@127.0.0.1:${server.port}`);
  assert.deepEqual(Object.keys(status).sort(), ['account', 'available', 'connected', 'provider']);
  const stat = await cloud.stat(descriptor());
  assert.equal(stat.rev, remote.rev);
  await closeServer();
});

test('a pasted Nextcloud address (…/remote.php/dav/files/<user>/) is used as it is', async () => {
  const cloud = service();
  await cloud.createWebdavRemote(fields({ server: `${server.address}/remote.php/dav/files/alice` }), descriptor(), source);
  assert.ok(server.files.has('OpenDives/Mon carnet.ssrf'));
  assert.equal(server.requests[0].path, '/remote.php/dav/files/alice/');
  assert.ok(!server.requests.some((r) => r.path.includes('/remote.php/dav/files/alice/remote.php')));
  await closeServer();
});

test('another WebDAV server: the Nextcloud path is not there, the address itself is used', async () => {
  await closeServer();
  server = await startFakeWebdav({ root: '/dav/' });
  const cloud = service();
  await cloud.createWebdavRemote(fields({ server: `${server.address}/dav/` }), descriptor(), source);
  assert.ok(server.files.has('OpenDives/Mon carnet.ssrf'));
  const paths = server.requests.filter((r) => r.method === 'PROPFIND').map((r) => r.path);
  assert.equal(paths[0], '/dav/remote.php/dav/files/alice/');
  assert.equal(paths[1], '/dav/');
  await closeServer();
});

test('a wrong password is BAD_CREDENTIALS: nothing created, nothing kept', async () => {
  const cloud = service();
  await assert.rejects(cloud.createWebdavRemote(fields({ password: 'wrong' }), descriptor(), source), { code: 'BAD_CREDENTIALS' });
  assert.equal(server.files.size, 0);
  assert.ok(!server.requests.some((r) => r.method === 'MKCOL' || r.method === 'PUT'));
  assert.equal(cloud.statusOf('webdav').connected, false);
  assert.ok(!existsSync(path.join(userData, 'cloud-webdav.bin')));
  await assert.rejects(cloud.createWebdavRemote(fields({ username: 'bob' }), descriptor(), source), { code: 'BAD_CREDENTIALS' });
  await assert.rejects(cloud.createWebdavRemote(fields({ password: '' }), descriptor(), source), { code: 'BAD_CREDENTIALS' });
  await closeServer();
});

test('addresses: nothing WebDAV there, no answer, http away from this computer, not a web address', async () => {
  const cloud = service();
  // A web server that has no WebDAV at this path.
  await assert.rejects(cloud.createWebdavRemote(fields({ server: `${server.address}/blog/` }), descriptor(), source), { code: 'BAD_ADDRESS' });
  await assert.rejects(cloud.createWebdavRemote(fields({ server: 'ftp://example.org/' }), descriptor(), source), { code: 'BAD_ADDRESS' });
  await assert.rejects(cloud.createWebdavRemote(fields({ server: '' }), descriptor(), source), { code: 'BAD_ADDRESS' });
  await assert.rejects(cloud.createWebdavRemote(fields({ server: 'https://user:pw@example.org/' }), descriptor(), source), { code: 'BAD_ADDRESS' });
  await assert.rejects(cloud.createWebdavRemote(fields({ server: 'http://cloud.example.org/' }), descriptor(), source), { code: 'INSECURE_ADDRESS' });
  await assert.rejects(cloud.createWebdavRemote(fields({ server: 'http://192.168.1.20/' }), descriptor(), source), { code: 'INSECURE_ADDRESS' });
  // Nothing was even sent for the refused ones: only the /blog/ trials reached the server.
  assert.ok(server.requests.every((r) => r.path.startsWith('/blog/') || r.path.startsWith('/remote.php/dav/files/alice/blog')));
  await closeServer();
  // Nobody answers on that port any more.
  await assert.rejects(cloud.createWebdavRemote(fields(), descriptor(), source), { code: 'NETWORK' });
  assert.equal(cloud.statusOf('webdav').connected, false);
});

test('a server that fails is SERVER', async () => {
  await closeServer();
  server = await startFakeWebdav({ serverError: true });
  await assert.rejects(service().createWebdavRemote(fields(), descriptor(), source), { code: 'SERVER' });
  await closeServer();
});

test('the OpenDives folder that exists already (405) is fine, a file of the same name is EXISTS and the earlier account stays', async () => {
  const cloud = service();
  await cloud.createWebdavRemote(fields(), descriptor('Premier'), source);
  const savedBefore = readFileSync(path.join(userData, 'cloud-webdav.bin'));
  await cloud.createWebdavRemote(fields(), descriptor('Second'), source);
  assert.ok(server.files.has('OpenDives/Premier.ssrf') && server.files.has('OpenDives/Second.ssrf'));
  assert.ok(server.requests.some((r) => r.method === 'MKCOL'));
  // Same name again.
  await assert.rejects(cloud.createWebdavRemote(fields(), descriptor('Second'), source), { code: 'EXISTS' });
  assert.equal(cloud.statusOf('webdav').connected, true);
  // A first creation that fails leaves no account behind.
  const other = service();
  rmSync(path.join(userData, 'cloud-webdav.bin'));
  await assert.rejects(other.createWebdavRemote(fields(), descriptor('Second'), source), { code: 'EXISTS' });
  assert.equal(other.statusOf('webdav').connected, false);
  assert.ok(savedBefore.length > 0);
  await closeServer();
});

test('download, upload with If-Match, and a file changed elsewhere is refused', async () => {
  const cloud = service();
  const d = descriptor();
  const made = await cloud.createWebdavRemote(fields(), d, source);
  // Download.
  const target = path.join(userData, 'down.ssrf');
  const got = await cloud.download(d, undefined, target);
  assert.equal(readFileSync(target, 'utf8'), '<divelog program="x"></divelog>');
  assert.equal(got.rev, made.rev);
  // Upload on the revision we know: accepted, with If-Match sent.
  writeFileSync(source, '<divelog program="y"></divelog>');
  const sent = await cloud.upload(d, undefined, source, { expectedRev: made.rev });
  assert.notEqual(sent.rev, made.rev);
  const put = server.requests.filter((r) => r.method === 'PUT').pop();
  assert.equal(put.headers['if-match'], `"${made.rev}"`);
  assert.equal(server.files.get('OpenDives/Mon carnet.ssrf').bytes.toString(), '<divelog program="y"></divelog>');
  // Changed elsewhere: the old revision is refused and the remote file is left as it is.
  server.touch('OpenDives/Mon carnet.ssrf', 'changed on the server');
  writeFileSync(source, '<divelog program="z"></divelog>');
  await assert.rejects(cloud.upload(d, undefined, source, { expectedRev: sent.rev }), { code: 'REMOTE_CHANGED' });
  assert.equal(server.files.get('OpenDives/Mon carnet.ssrf').bytes.toString(), 'changed on the server');
  // The change is seen by the next check.
  const now = await cloud.stat(d);
  assert.notEqual(now.rev, sent.rev);
  assert.equal(cloud.decide({ knownRev: sent.rev, remote: now, pending: false }), 'download');
  assert.equal(cloud.decide({ knownRev: sent.rev, remote: now, pending: true }), 'conflict');
  // A file that is gone: stat says null, a plain upload (no revision) puts it again, folder included.
  server.files.clear();
  server.folders.delete('OpenDives/');
  assert.equal(await cloud.stat(d), null);
  const again = await cloud.upload(d, undefined, source);
  assert.ok(again.rev);
  assert.ok(server.files.has('OpenDives/Mon carnet.ssrf'));
  await assert.rejects(cloud.download(descriptor('Absent'), undefined, target), { code: 'REMOTE_MISSING' });
  await closeServer();
});

test('the password: encrypted at rest, never in the status, the log or an error', async () => {
  const cloud = service();
  const secret = server.password;
  await cloud.createWebdavRemote(fields(), descriptor(), source);
  const bytes = readFileSync(path.join(userData, 'cloud-webdav.bin'), 'utf8');
  assert.ok(!bytes.includes(secret));
  assert.ok(!JSON.stringify(cloud.status()).includes(secret));
  assert.ok(!logged.join('\n').includes(secret));
  // Wrong password: the error text does not carry it either.
  const error = await cloud.createWebdavRemote(fields({ password: 'hunter2-not-this' }), descriptor('Autre'), source).catch((e) => e);
  assert.ok(!String(error.message).includes('hunter2-not-this'));
  // A new service object (a restart of the app) is still connected; signing out forgets it.
  assert.equal(service().statusOf('webdav').connected, true);
  assert.equal(cloud.signOut('webdav').connected, false);
  assert.ok(!existsSync(path.join(userData, 'cloud-webdav.bin')));
  await closeServer();
});

test('without safe storage no password is kept', async () => {
  const cloud = createCloudService({ userData, safeStorage: { ...safeStorage, isEncryptionAvailable: () => false }, openExternal: () => {}, clients: {} });
  assert.equal(cloud.statusOf('webdav').available, false);
  await assert.rejects(cloud.createWebdavRemote(fields(), descriptor(), source), { code: 'CREDENTIALS_NOT_SAVED' });
  assert.ok(!existsSync(path.join(userData, 'cloud-webdav.bin')));
  await closeServer();
});
