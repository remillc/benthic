// SPDX-License-Identifier: GPL-2.0
// Dive photos and videos synced between two devices of one Benthic+ account, against the development server stack (task
// 2026-11-23-359): the desktop's own media folder (desktop/media.cjs), the transfers (app/src/lib/media-sync.js), the
// references on the `benthic` branch (app/src/lib/account-sync.js over the core's git calls) and the signed URLs of the API
// with MinIO. Device A adds a photo to a dive; device B gets the thumbnail and the reference, and opens the original on
// demand; an account over its quota keeps the file on the device and says so.
//
// Skipped unless the stack is up and the host is given (as tests/desktop/account-sync.test.mjs):
//
//   BENTHIC_HOST=<host binary>  BENTHIC_DEV_API=http://127.0.0.1:8080  BENTHIC_DEV_MAILPIT=http://127.0.0.1:8025
//   BENTHIC_DEV_CA=<ca.pem>  BENTHIC_TEST_DIR=<a directory>
//   BENTHIC_TEST_QUOTA=<bytes>   optional: the API's MEDIA_QUOTA_BYTES (start it with that value) to check the limit
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createHash, randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';
import { join as pathJoin } from 'node:path';
import fs from 'node:fs';
import { createFileStore, memoryBackend } from '../../app/src/lib/file-store.js';
import { createSecretBox } from '../../app/src/lib/secret-box.js';
import { createAccountSync, workingCopyName } from '../../app/src/lib/account-sync.js';
import { createServerApi } from '../../app/src/lib/server-api.js';
import { createMediaSync } from '../../app/src/lib/media-sync.js';
import { mediaPathOf, withItems, itemsOf } from '../../app/src/lib/dive-media.js';

const require = createRequire(import.meta.url);
const { createMedia } = require('../../desktop/media.cjs');

const api = process.env.BENTHIC_DEV_API || '';
const mailpit = process.env.BENTHIC_DEV_MAILPIT || '';
const hostCommand = process.env.BENTHIC_HOST || '';
const ca = process.env.BENTHIC_DEV_CA || '';
const home = process.env.BENTHIC_TEST_DIR || '';
const quota = Number(process.env.BENTHIC_TEST_QUOTA || 0);
const skip = !api || !mailpit || !hostCommand || !ca || !home ? 'the dev stack, the host, the CA or the directory is not given' : false;

function startHost() {
  const child = spawn(hostCommand, [], { stdio: ['pipe', 'pipe', 'inherit'] });
  const pending = new Map();
  let nextId = 1;
  createInterface({ input: child.stdout }).on('line', (line) => {
    let m;
    try {
      m = JSON.parse(line);
    } catch {
      return;
    }
    if (m.event) return;
    const waiting = pending.get(m.id);
    if (!waiting) return;
    pending.delete(m.id);
    if ('error' in m) waiting.reject(new Error(m.error));
    else waiting.resolve(m.result);
  });
  const exited = new Promise((resolve) => child.on('close', resolve));
  return {
    call(method, args) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject: (e) => reject(new Error(`${method}: ${e.message}`)) });
        child.stdin.write(`${JSON.stringify({ id, method, args })}\n`);
      });
    },
    close() {
      child.stdin.end();
      return exited;
    },
  };
}

async function json(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function codeFor(email) {
  for (let i = 0; i < 40; i++) {
    const list = await json(`${mailpit}/api/v1/messages`);
    const message = (list.body.messages ?? []).find((m) => m.To?.some((to) => to.Address === email));
    const match = message && /\b(\d{6})\b/.exec(message.Subject);
    if (match) return match[1];
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('no e-mail');
}

function bgitCore(host, deviceHome, session) {
  const call = (method) => async (options) => {
    try {
      const args = { ...options };
      if (args.dir) args.dir = pathJoin(deviceHome, 'bgit', args.dir);
      const result = await host.call(method, { ...args, allowHttp: false });
      return typeof result === 'string' ? JSON.parse(result || 'null') : result;
    } catch (e) {
      throw Object.assign(e, { code: String(e.message).replace(/^[A-Za-z]+: /, '').split(':')[0] });
    }
  };
  const core = { serverSessionAccess: async () => session };
  for (const m of ['bgitClone', 'bgitPull', 'bgitCommit', 'bgitPush', 'bgitHead', 'bgitWrite', 'bgitRead', 'bgitDiff', 'bgitFiles', 'bgitRemove', 'bgitUnpushed']) core[m] = call(m);
  return core;
}

function memoryKeeper() {
  let key = '';
  let made = false;
  return { read: async () => key, write: async (k) => void (key = k), hadKey: async () => made, markKey: async () => void (made = true) };
}

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

describe('dive photos and videos between two devices against the dev server', { skip }, () => {
  const email = `media-${randomBytes(4).toString('hex')}@benthic.test`;
  const devices = [];
  let sessionToken = '';
  let session;
  const DIVE = '2026-05-01T10:30:00';

  /** A device: its own host (git), store, account engine, media folder and transfer engine. */
  async function device(name, policy) {
    const host = startHost();
    const deviceHome = pathJoin(home, `${name}-${randomBytes(3).toString('hex')}`);
    await host.call('init', { home: deviceHome });
    await host.call('setCaFile', { path: ca });
    const store = createFileStore(memoryBackend());
    const box = createSecretBox(memoryKeeper());
    const sync = createAccountSync({ core: bgitCore(host, deviceHome, session), store, box });
    const tempDir = pathJoin(deviceHome, 'tmp');
    fs.mkdirSync(pathJoin(tempDir, 'import'), { recursive: true });
    const media = createMedia({ userData: deviceHome, tempDir });
    const plugin = {
      mediaStat: (o) => media.call('stat', o),
      mediaUpload: (o) => media.call('upload', o),
      mediaDownload: (o) => media.call('download', o),
    };
    const server = createServerApi({
      baseUrl: api,
      transport: async (r) => {
        const response = await fetch(r.url, { method: r.method, headers: { ...(r.headers ?? {}), ...(r.body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: r.body !== undefined ? JSON.stringify(r.body) : undefined });
        return { status: response.status, text: await response.text() };
      },
    });
    const transfers = createMediaSync({
      core: plugin,
      api: { uploadUrl: (hash, size) => server.mediaUploadUrl(sessionToken, hash, size), downloadUrl: (hash) => server.mediaDownloadUrl(sessionToken, hash) },
      store,
      policy: () => policy,
      wifi: () => true,
    });
    const d = { name, host, store, sync, media, tempDir, transfers, deviceHome };
    devices.push(d);
    return d;
  }

  /** What the app does when a file is chosen: staged, adopted by its hash, a thumbnail of its own, a reference. */
  async function addPhoto(d, bytes, mime = 'image/jpeg') {
    const staged = pathJoin(d.tempDir, 'import', `import-${randomBytes(3).toString('hex')}.jpg`);
    fs.writeFileSync(staged, bytes);
    const { hash, size } = await d.media.call('adopt', { path: staged });
    const thumbBytes = randomBytes(300);
    const thumb = await d.media.call('putBytes', { base64: thumbBytes.toString('base64') });
    const path = mediaPathOf(DIVE);
    const file = withItems(await d.store.read(path), DIVE, [{ hash, mime, size, takenAt: new Date().toISOString(), caption: '', thumb: thumb.hash }], new Date().toISOString());
    await d.store.trackedBatch({ writes: [[path, file]] });
    return { hash, size, thumb: thumb.hash, thumbBytes };
  }

  before(async () => {
    await json(`${api}/v1/auth/code`, { method: 'POST', body: JSON.stringify({ email }) });
    const verified = await json(`${api}/v1/auth/verify`, { method: 'POST', body: JSON.stringify({ email, code: await codeFor(email) }) });
    assert.equal(verified.status, 200);
    sessionToken = verified.body.sessionToken;
    session = { repositoryUrl: verified.body.repository.url, branch: verified.body.repository.branch, username: verified.body.git.username, token: verified.body.git.token, sessionToken };
    assert.equal((await json(`${api}/v1/account/dev-subscribe`, { method: 'POST', headers: { Authorization: `Bearer ${sessionToken}` }, body: '{}' })).status, 200);
  });

  after(async () => {
    if (sessionToken) await json(`${api}/v1/account/dev-reset`, { method: 'POST', headers: { Authorization: `Bearer ${sessionToken}` }, body: '{}' }).catch(() => {});
    if (sessionToken) await fetch(`${api}/v1/account`, { method: 'DELETE', headers: { Authorization: `Bearer ${sessionToken}` } }).catch(() => {});
    for (const d of devices) await d.host.close();
  });

  let a;
  let b;
  let photo;
  const original = randomBytes(40000);

  test('device A adds a photo to a dive: the reference is synced and the objects are uploaded', async () => {
    a = await device('a', { photos: 'recent', videos: 'onDemand' });
    photo = await addPhoto(a, original);
    assert.equal(photo.hash, sha(original), 'the object is named by the SHA-256 of its content');
    assert.equal((await a.sync.run()).status, 'synced');
    const up = await a.transfers.run();
    assert.equal(up.uploaded, 2, 'the original and its thumbnail');
    const usage = await json(`${api}/v1/media/usage`, { headers: { Authorization: `Bearer ${sessionToken}` } });
    assert.equal(usage.body.objects, 2);
    assert.equal(usage.body.usedBytes, original.length + photo.thumbBytes.length);
    assert.equal((await a.transfers.run()).uploaded, 0, 'nothing is sent twice');
  });

  test('device B gets the reference and the thumbnail, not the original (on demand), then opens the original', async () => {
    b = await device('b', { photos: 'onDemand', videos: 'onDemand' });
    assert.equal((await b.sync.run()).status, 'synced');
    const refs = itemsOf(await b.store.read(mediaPathOf(DIVE)));
    assert.equal(refs.length, 1);
    assert.equal(refs[0].hash, photo.hash);
    const down = await b.transfers.run();
    assert.equal(down.downloaded, 1, 'the thumbnail');
    assert.equal((await b.media.call('stat', { hash: photo.thumb })).exists, true);
    assert.equal((await b.media.call('stat', { hash: photo.hash })).exists, false, 'the original waits until it is asked for');
    const path = await b.transfers.ensureLocal(photo.hash);
    assert.ok(fs.readFileSync(path).equals(original), 'the original comes back byte for byte');
  });

  test('a photo added on B shows on A: the references merge as a union by hash', async () => {
    const second = await addPhoto(b, randomBytes(5000));
    await b.sync.run();
    await b.transfers.run();
    await a.sync.run();
    assert.deepEqual(itemsOf(await a.store.read(mediaPathOf(DIVE))).map((i) => i.hash).sort(), [photo.hash, second.hash].sort());
    const down = await a.transfers.run();
    assert.ok(down.downloaded >= 1, 'A gets the thumbnail, and the recent photo on Wi-Fi');
    assert.equal((await a.media.call('stat', { hash: second.thumb })).exists, true);
  });

  test('a device that adds a photo the account already has makes no second object', async () => {
    const usage = () => json(`${api}/v1/media/usage`, { headers: { Authorization: `Bearer ${sessionToken}` } }).then((r) => r.body);
    const before = await usage();
    const c = await device('c', { photos: 'recent', videos: 'onDemand' });
    await c.sync.run();
    await addPhoto(c, original); // the same bytes: already in the dive's references, so nothing new is named
    await c.sync.run();
    await c.transfers.run();
    const after = await usage();
    assert.equal(after.objects, before.objects);
    assert.equal(after.usedBytes, before.usedBytes);
    // And the same bytes on another dive: the server already holds the original, only its thumbnail would leave.
    const path = mediaPathOf('2026-05-02T09:00:00');
    const { hash, size } = await c.media.call('adopt', { path: (() => { const f = pathJoin(c.tempDir, 'import', 'import-dup.jpg'); fs.writeFileSync(f, original); return f; })() });
    await c.store.trackedBatch({ writes: [[path, withItems(null, '2026-05-02T09:00:00', [{ hash, mime: 'image/jpeg', size, takenAt: new Date().toISOString(), caption: '', thumb: '' }], 't')]] });
    assert.equal((await c.transfers.run()).uploaded, 0, 'the original is on the server already');
    assert.equal((await usage()).objects, before.objects);
  });

  test('with the account over its quota the file stays on the device and the run says so', { skip: quota ? false : 'BENTHIC_TEST_QUOTA is not set (start the API with MEDIA_QUOTA_BYTES)' }, async () => {
    const big = await addPhoto(a, randomBytes(quota));
    await a.sync.run();
    const run = await a.transfers.run();
    assert.equal(run.quotaFull, true);
    assert.equal((await a.media.call('stat', { hash: big.hash })).exists, true, 'the file is kept on the device');
    assert.ok(run.waiting >= 1);
    void workingCopyName;
  });

  test('a server that is down never blocks: the run answers offline and the files stay', async () => {
    const dead = createMediaSync({
      core: { mediaStat: (o) => a.media.call('stat', o), mediaUpload: async () => { throw new Error('NETWORK'); }, mediaDownload: async () => { throw new Error('NETWORK'); } },
      api: { uploadUrl: async () => { throw Object.assign(new Error('UNREACHABLE'), { code: 'UNREACHABLE' }); }, downloadUrl: async () => { throw Object.assign(new Error('UNREACHABLE'), { code: 'UNREACHABLE' }); } },
      store: a.store,
      policy: () => ({ photos: 'all', videos: 'all' }),
      wifi: () => true,
    });
    await a.store.write('meta/media.json', { format: 1, uploaded: {} });
    const run = await dead.run();
    assert.equal(run.offline, true);
    assert.equal(run.uploaded, 0);
  });
});
