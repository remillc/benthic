// SPDX-License-Identifier: GPL-2.0
// Dive ids (23 November 2026) against the development server stack: the branch of a real account holds references to dives by
// start time (equipment, a validation, a photo reference: pushed by raw `bgit*` calls, as a build before the Benthic ids left it),
// then two devices, one of them at the same time as the other, whose logbook has the ids, sync over the real Forgejo. Both must end
// with the same files, no start-time name or key left for a dive that has an id, the dive left without an id kept as it is, and the
// equipment, the validation and the photo reference still attached to their dives.
// Skipped unless the stack is up and the host is given (same variables as tests/desktop/account-sync.test.mjs).
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { join as pathJoin } from 'node:path';
import { createFileStore, memoryBackend, sortedJson } from '../../app/src/lib/file-store.js';
import { createSecretBox, toBase64 } from '../../app/src/lib/secret-box.js';
import { createInventory } from '../../app/src/lib/inventory.js';
import { createProfile } from '../../app/src/lib/profile.js';
import { createAccountSync, isSyncedPath, workingCopyName } from '../../app/src/lib/account-sync.js';
import { accountKeyFile } from '../../app/src/lib/account-keys.js';
import { startToIdMap } from '../../app/src/lib/dive-id-migration.js';
import { signatureRecord } from '../../app/src/lib/validation.js';
import { mediaPathOf } from '../../app/src/lib/dive-media.js';
import { recordKey } from '../../app/src/lib/inventory.js';

const api = process.env.BENTHIC_DEV_API || '';
const mailpit = process.env.BENTHIC_DEV_MAILPIT || '';
const hostCommand = process.env.BENTHIC_HOST || '';
const hostArgs = process.env.BENTHIC_HOST_ARGS ? JSON.parse(process.env.BENTHIC_HOST_ARGS) : [];
const ca = process.env.BENTHIC_DEV_CA || '';
const home = process.env.BENTHIC_TEST_DIR || '';
const skip = !api || !mailpit || !hostCommand || !ca || !home ? 'the dev stack, the host, the CA or the directory is not given' : false;

function startHost() {
  const child = spawn(hostCommand, hostArgs, { stdio: ['pipe', 'pipe', 'inherit'] });
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

/** The 6 digits of the last e-mail to the address (the subject, Mailpit). */
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

/** The `bgit*` calls of the plugin over one host process: `dir` is a folder of this device's own home. */
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

/** One key for the account: every device of this test already holds it (the pairing is tested elsewhere). */
const KEY = toBase64(new Uint8Array(32).fill(9));
const keeper = () => ({ read: async () => KEY, write: async () => {}, hadKey: async () => true, markKey: async () => {} });

const DIVES = [
  { id: 1, benthicId: '0abcdefghj', date: '2026-11-01T10:00:00' },
  { id: 2, benthicId: '7k2m9q4x1d', date: '2026-11-02T09:00:00' },
  { id: 3, benthicId: '1bbbbbbbbb', date: '2026-11-03T09:00:00' },
  { id: 4, benthicId: '', date: '2026-11-04T09:00:00' },
];

describe('dive ids against the dev server', { skip }, () => {
  const email = `diveid-${randomBytes(4).toString('hex')}@benthic.test`;
  const devices = [];
  let sessionToken = '';
  let session;

  async function device(name, dives = DIVES) {
    const host = startHost();
    const deviceHome = pathJoin(home, `${name}-${randomBytes(3).toString('hex')}`);
    await host.call('init', { home: deviceHome });
    await host.call('setCaFile', { path: ca });
    const store = createFileStore(memoryBackend());
    const box = createSecretBox(keeper());
    const inventory = createInventory(store);
    const profile = createProfile(store, box);
    const core = bgitCore(host, deviceHome, session);
    const sync = createAccountSync({ core, store, box, diveIds: () => startToIdMap(dives) });
    const d = { name, host, store, box, inventory, profile, core, sync };
    devices.push(d);
    return d;
  }

  before(async () => {
    await json(`${api}/v1/auth/code`, { method: 'POST', body: JSON.stringify({ email }) });
    const verified = await json(`${api}/v1/auth/verify`, { method: 'POST', body: JSON.stringify({ email, code: await codeFor(email) }) });
    assert.equal(verified.status, 200);
    sessionToken = verified.body.sessionToken;
    const repoUrl = process.env.BENTHIC_DEV_REPO_HOST ? verified.body.repository.url.replace('127.0.0.1', process.env.BENTHIC_DEV_REPO_HOST) : verified.body.repository.url;
    session = { repositoryUrl: repoUrl, branch: verified.body.repository.branch, username: verified.body.git.username, token: verified.body.git.token, sessionToken };
    const sub = await json(`${api}/v1/account/dev-subscribe`, { method: 'POST', headers: { Authorization: `Bearer ${sessionToken}` }, body: '{}' });
    assert.equal(sub.status, 200);
  });

  after(async () => {
    if (sessionToken) await json(`${api}/v1/account/dev-reset`, { method: 'POST', headers: { Authorization: `Bearer ${sessionToken}` }, body: '{}' }).catch(() => {});
    for (const d of devices) await d.host.close();
  });

  test('references by start time: two devices move them to the ids at once and keep the equipment, the validation and the photos', async () => {
    // What a build before the ids left on the server.
    const seeder = await device('seed', []);
    const mask = await seeder.inventory.saveGear({ name: 'Mask', type: 'mask' });
    await seeder.inventory.saveDiveEquipment('2026-11-01T10:00:00', { suitGearId: '', undersuitGearId: '', gearIds: [mask.id], adhoc: [], kitId: '' });
    await seeder.inventory.saveDiveEquipment('2026-11-04T09:00:00', { suitGearId: '', undersuitGearId: '', gearIds: [mask.id], adhoc: [], kitId: '' });
    const validation = signatureRecord({ id: 'val1', signer: { name: 'Ana', role: 'buddy' }, signature: 'x', dives: [{ date: '2026-11-02T09:00:00', durationSeconds: 1 }], now: new Date(Date.UTC(2026, 10, 23)) });
    await seeder.inventory.commitFiles([[`dive-validations/${validation.id}.json`, validation]]);
    const item = { hash: 'a'.repeat(64), mime: 'image/jpeg', size: 1, takenAt: '', caption: '', thumb: '' };
    await seeder.inventory.commitFiles([[mediaPathOf('2026-11-03T09:00:00'), { format: 1, diveId: '2026-11-03T09:00:00', items: [item] }]]);
    const files = {};
    for (const p of await seeder.store.list('')) if (isSyncedPath(p)) files[p] = (await seeder.store.readSnapshot(p)).text;
    files['keys/account.json'] = sortedJson(accountKeyFile(await seeder.box.deviceKid()).json);
    const dir = workingCopyName(session.repositoryUrl);
    const access = { dir, username: session.username, token: session.token, branch: 'benthic' };
    await seeder.core.bgitClone({ ...access, url: session.repositoryUrl });
    await seeder.core.bgitWrite({ dir, files: Object.entries(files).map(([path, text]) => ({ path, text })) });
    await seeder.core.bgitCommit({ dir, paths: Object.keys(files), message: 'Benthic: old build' });
    await seeder.core.bgitPush(access);

    const a = await device('a');
    const b = await device('b');
    for (const d of [a, b]) {
      const r = await d.sync.run();
      assert.equal(r.status, 'synced', JSON.stringify(r));
    }
    // Both at once: A's whole run goes through the server while B has moved its working copy and not pushed yet.
    const realPull = b.core.bgitPull;
    let first = true;
    b.core.bgitPull = async (o) => {
      if (first) {
        first = false;
        const r = await a.sync.run();
        assert.equal(r.status, 'synced', JSON.stringify(r));
      }
      return realPull(o);
    };
    const rb = await b.sync.run();
    assert.equal(rb.status, 'synced', JSON.stringify(rb));
    b.core.bgitPull = realPull;
    for (let i = 0; i < 2; i++) for (const d of [a, b]) assert.equal((await d.sync.run()).status, 'synced');

    const onServer = (await a.core.bgitFiles({ dir })).files.filter((p) => !p.startsWith('keys/'));
    assert.ok(onServer.includes('media/1bbbbbbbbb.json'), 'the photo reference is under the dive id');
    assert.ok(!onServer.includes('media/2026-11-03T09-00-00.json'), 'no start-time name left');
    const snapshot = async (d) => Object.fromEntries(await Promise.all((await d.store.list('')).filter(isSyncedPath).sort().map(async (p) => [p, (await d.store.readSnapshot(p)).text])));
    assert.deepEqual(await snapshot(a), await snapshot(b), 'both devices end with the same files');
    assert.deepEqual(Object.keys(await snapshot(a)).sort(), onServer.sort());
    for (const d of [a, b]) {
      const records = await d.inventory.listDiveEquipment();
      assert.deepEqual(records.map((r) => recordKey(r.diveKey)).sort(), ['0abcdefghj', '2026-11-04T09:00:00'], 'the dive without an id keeps its start');
      for (const r of records) assert.equal(r.gearIds.length, 1, 'the piece is still attached');
      const [v] = await d.store.readAll('dive-validations/');
      assert.equal(v.dives[0].benthicId, '7k2m9q4x1d');
      const [m] = await d.store.readAll('media/');
      assert.deepEqual([m.diveId, m.items.length], ['1bbbbbbbbb', 1]);
      assert.deepEqual((await d.store.read('meta/pending.json')).paths, []);
    }
  });
});
