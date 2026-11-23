// SPDX-License-Identifier: GPL-2.0
// Short ids (to-do #149) against the development server stack: the branch of a real account holds UUID ids (pushed by raw `bgit*`
// calls, as an installed build before the short ids left it), then two devices that hold the account key update the app, rewrite
// their store and sync, one of them at the same time as the other, over the real Forgejo. Both must end with the same files, no
// UUID name left on the server, and every piece, kit link, maintenance entry, dive link and certification (with its card photo).
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
import { isOldIdPath } from '../../app/src/lib/short-id-migration.js';
import { shortFromUuid as ns } from '../../app/src/lib/short-id.js';

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

describe('short ids against the dev server', { skip }, () => {
  const email = `short-${randomBytes(4).toString('hex')}@benthic.test`;
  const devices = [];
  let sessionToken = '';
  let session;

  async function device(name) {
    const host = startHost();
    const deviceHome = pathJoin(home, `${name}-${randomBytes(3).toString('hex')}`);
    await host.call('init', { home: deviceHome });
    await host.call('setCaFile', { path: ca });
    const store = createFileStore(memoryBackend());
    const box = createSecretBox(keeper());
    const inventory = createInventory(store);
    const profile = createProfile(store, box);
    const core = bgitCore(host, deviceHome, session);
    const sync = createAccountSync({ core, store, box });
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

  test('a branch with UUID ids: two devices migrate at once and keep every piece, link, entry and card', async () => {
    // What an old build left on the server.
    const seeder = await device('seed');
    const inventory = createInventory(seeder.store, { id: randomUUID });
    const profile = createProfile(seeder.store, seeder.box, { id: randomUUID });
    const suit = await inventory.saveGear({ name: 'Suit', type: 'suit' });
    const mask = await inventory.saveGear({ name: 'Mask', type: 'mask' });
    const photoId = await inventory.savePhoto('data:image/jpeg;base64,AA==');
    await inventory.saveGear({ id: mask.id, name: 'Mask', type: 'mask', photoId });
    const kit = await inventory.saveKit({ name: 'Cold', gearIds: [suit.id, mask.id] });
    const maintenance = await inventory.noteMaintenance({ gearId: suit.id, task: 'service' }, { kind: 'service', doneOn: '2026-05-01' });
    await inventory.saveDiveEquipment('2026-01-01T10:00:00', { suitGearId: suit.id, undersuitGearId: '', gearIds: [mask.id], adhoc: [], kitId: kit.id });
    const card = await profile.saveCertification({ agency: 'PADI', level: 'Open Water', number: '77', photos: { front: new Uint8Array([0xff, 0xd8, 4, 5, 6]) } });
    const files = {};
    for (const p of await seeder.store.list('')) if (isSyncedPath(p)) files[p] = (await seeder.store.readSnapshot(p)).text;
    files['keys/account.json'] = sortedJson(accountKeyFile(await seeder.box.deviceKid()).json);
    const dir = workingCopyName(session.repositoryUrl);
    const access = { dir, username: session.username, token: session.token, branch: 'benthic' };
    await seeder.core.bgitClone({ ...access, url: session.repositoryUrl });
    await seeder.core.bgitWrite({ dir, files: Object.entries(files).map(([path, text]) => ({ path, text })) });
    await seeder.core.bgitCommit({ dir, paths: Object.keys(files), message: 'Benthic: old build' });
    await seeder.core.bgitPush(access);
    assert.ok(Object.keys(files).some(isOldIdPath));

    const a = await device('a');
    const b = await device('b');
    for (const d of [a, b]) {
      const r = await d.sync.run();
      assert.equal(r.status, 'synced', JSON.stringify(r));
    }
    // Both at once: B has rewritten its copy and committed « Short ids » when A's whole run goes through the server, then B pulls and pushes
    // (two pushes at the very same moment are refused by the server, with no relation to the ids).
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
    assert.deepEqual(rb.conflicts, [], 'identical files merge without a conflict');
    b.core.bgitPull = realPull;
    for (let i = 0; i < 2; i++) for (const d of [a, b]) assert.equal((await d.sync.run()).status, 'synced');

    const onServer = (await a.core.bgitFiles({ dir })).files.filter((p) => !p.startsWith('keys/'));
    assert.deepEqual(onServer.filter(isOldIdPath), [], 'no UUID name left on the server');
    const snapshot = async (d) => Object.fromEntries(await Promise.all((await d.store.list('')).filter(isSyncedPath).sort().map(async (p) => [p, (await d.store.readSnapshot(p)).text])));
    assert.deepEqual(await snapshot(a), await snapshot(b));
    assert.deepEqual(Object.keys(await snapshot(a)).sort(), onServer.sort());
    for (const d of [a, b]) {
      assert.deepEqual((await d.inventory.listGear()).map((g) => g.name).sort(), ['Mask', 'Suit']);
      assert.deepEqual((await d.inventory.listKits())[0].gearIds.sort(), [ns(suit.id), ns(mask.id)].sort());
      assert.equal(await d.inventory.readPhoto(ns(photoId)), 'data:image/jpeg;base64,AA==');
      const [m] = await d.inventory.listMaintenance();
      assert.deepEqual([m.gearId, m.history.length, m.id], [ns(suit.id), 1, ns(maintenance.id)]);
      const [rec] = await d.inventory.listDiveEquipment();
      assert.deepEqual([rec.suitGearId, rec.kitId], [ns(suit.id), ns(kit.id)]);
      const c = await d.profile.getCertification(ns(card.id));
      assert.equal(c.number, '77');
      assert.deepEqual([...(await d.profile.readPhoto(c.id, c.documents[0].hash))], [0xff, 0xd8, 4, 5, 6]);
      assert.deepEqual((await d.store.read('meta/pending.json')).paths, []);
    }
  });
});
