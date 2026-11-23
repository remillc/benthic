// SPDX-License-Identifier: GPL-2.0
// Account data sync between devices (to-do #164, step 7) against the development server stack: the app's own engine
// (app/src/lib/account-sync.js), join (account-join.js), key module (account-keys.js) and secret box (secret-box.js), on the
// core's `bgit*` calls (one benthic-host process per device over stdio), with a real account, a real repository on the dev
// Forgejo and real pushes. Several devices of one diver: gear and profile created on A are read on B; both edit and the
// conflict is merged; a device without the data key sees its sealed items locked until it is paired by approval (it asks, a paired
// device compares the 6-digit code and approves, to-do #183; nothing but key files is committed) or given the recovery key; an
// expired request is cleaned; the start-over.
//
// Skipped unless the stack is up and the host is given:
//
//   BENTHIC_HOST=<host binary>  [BENTHIC_HOST_ARGS='["-d","Ubuntu","-e","/home/me/benthic-host"]']
//   BENTHIC_DEV_API=http://127.0.0.1:8080  BENTHIC_DEV_MAILPIT=http://127.0.0.1:8025
//   BENTHIC_DEV_CA=<ca.pem, as the host sees it>  BENTHIC_TEST_DIR=<a directory, as the host sees it>
//
// The account is `<random>@benthic.test` (a development account) and is deleted at the end (dev-reset).
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';
import { join as pathJoin } from 'node:path';
import { createFileStore, memoryBackend } from '../../app/src/lib/file-store.js';
import { createSecretBox } from '../../app/src/lib/secret-box.js';
import { createInventory } from '../../app/src/lib/inventory.js';
import { createProfile, emptyInfo } from '../../app/src/lib/profile.js';
import { createAccountSync } from '../../app/src/lib/account-sync.js';
import { createAccessRequest, createRecoveryKey, recoverAccountKey,
  resealFiles,
  startOver,
} from '../../app/src/lib/account-keys.js';
import { approveRequest, checkAnswer, declineRequest, finishPairing, pendingRequests, requestAccess } from '../../app/src/lib/account-pairing.js';

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
      // The core's error: a code, then ": details".
      throw Object.assign(e, { code: String(e.message).replace(/^[A-Za-z]+: /, '').split(':')[0] });
    }
  };
  const core = { serverSessionAccess: async () => session };
  for (const m of ['bgitClone', 'bgitPull', 'bgitCommit', 'bgitPush', 'bgitHead', 'bgitWrite', 'bgitRead', 'bgitDiff', 'bgitFiles', 'bgitRemove', 'bgitUnpushed']) core[m] = call(m);
  return core;
}

/** The device key as the platform keeps it: in memory here. */
function memoryKeeper(initial = '') {
  let key = initial;
  let made = !!initial;
  return { read: async () => key, write: async (k) => void (key = k), hadKey: async () => made, markKey: async () => void (made = true) };
}

describe('account data sync between devices against the dev server', { skip }, () => {
  const email = `account-${randomBytes(4).toString('hex')}@benthic.test`;
  /** @type {Awaited<ReturnType<typeof device>>[]} */
  const devices = [];
  let sessionToken = '';
  let session;

  /** A device: its own host process and home, store, box (a new key of its own), inventory, profile and engine. */
  async function device(name) {
    const host = startHost();
    const deviceHome = pathJoin(home, `${name}-${randomBytes(3).toString('hex')}`);
    await host.call('init', { home: deviceHome });
    await host.call('setCaFile', { path: ca });
    const store = createFileStore(memoryBackend());
    const box = createSecretBox(memoryKeeper());
    const inventory = createInventory(store);
    const profile = createProfile(store, box);
    const core = bgitCore(host, deviceHome, session);
    const sync = createAccountSync({ core, store, box });
    const d = { name, host, store, box, inventory, profile, core, sync };
    devices.push(d);
    return d;
  }

  /** The account key this device holds. */
  const heldKey = async (d) => ({ key: await d.box.accountKeyBase64(), kid: d.box.getAccountKid() });

  /** What the flows do once the key arrived: adopt, seal the local sealed files again, keep the key. */
  async function adoptAndReseal(d, account) {
    await d.box.adoptAccountKey(account.key);
    const files = [];
    for (const path of ['profile/diver.json', ...(await d.store.list('certifications/')), ...(await d.store.list('documents/'))]) {
      const value = await d.store.read(path);
      if (value) files.push({ path, json: value });
    }
    const { writes, deletes } = await resealFiles(files, d.box);
    if (writes.length || deletes.length) await d.store.trackedBatch({ writes: writes.map((w) => [w.path, w.json]), removes: deletes });
    await d.box.persistAccountKey();
  }

  const synced = async (d) => {
    const result = await d.sync.run();
    assert.equal(result.status, 'synced', `${d.name}: ${JSON.stringify(result)}`);
    return result;
  };

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

  /** @type {Awaited<ReturnType<typeof device>>} */ let a;
  /** @type {Awaited<ReturnType<typeof device>>} */ let b;
  let gearId = '';

  test('device A edits gear and profile; the first sync writes the account key and the data to an empty branch', async () => {
    a = await device('a');
    const piece = await a.inventory.saveGear({ name: 'Regulator', type: 'regulator', brand: 'Apeks', model: 'XTX200', serial: 'AP-1' });
    gearId = piece.id;
    await a.profile.saveInfo({ ...emptyInfo(), fullName: 'Ann Diver', bloodGroup: 'A+' });
    const result = await synced(a);
    assert.ok(result.sent >= 2);
    assert.equal(result.keyMissing, false);
    assert.equal(result.hasRecovery, false);
    const keys = await a.sync.readKeys();
    assert.equal(keys.kid, await a.box.deviceKid(), 'the device\'s own key is the account key: nothing was re-sealed');
    assert.equal(await a.sync.unsent(), 0);
  });

  test('device B syncs and sees the gear; the sealed profile stays locked until it is paired', async () => {
    b = await device('b');
    const result = await synced(b);
    assert.equal(result.keyMissing, true, 'the account has a key this device does not hold');
    assert.equal((await b.inventory.getGear(gearId)).name, 'Regulator');
    const locked = await b.profile.readInfo();
    assert.deepEqual([locked.fullName, locked.bloodGroup], ['', ''], 'the sealed profile reads as empty here, not as a failure');
    assert.ok((await b.store.read('profile/diver.json')).enc, 'the sealed file itself is on the device, untouched');
    // Nothing of B's goes up under another key: typing on B while locked either refuses or waits, never overwrites A's profile.
    await b.profile.saveInfo({ ...emptyInfo(), fullName: 'Typed on B' }).catch((e) => assert.match(String(e.message), /MISSING_DATA_KEY/));
    const again = await synced(b);
    assert.equal(again.keyMissing, true);
    const onServer = JSON.parse((await a.core.bgitRead({ dir: (await import('../../app/src/lib/account-sync.js')).workingCopyName(session.repositoryUrl), paths: ['profile/diver.json'] })).texts[0]);
    assert.equal(onServer.enc.kid, await a.box.deviceKid(), 'the profile on the server is still sealed with the account key');
  });

  /** The pairing steps over a device's engine: the server's key files, and key files only committed. */
  const doors = (d) => ({ store: d.store, box: d.box, fetchKeys: () => d.sync.fetchKeys(), commitKeyFiles: (c) => d.sync.commitKeyFiles({ ...c, keysOnly: true }) });
  const thisDevice = { deviceName: 'Test tablet', platform: 'android' };

  test('pairing by approval: B asks, A compares the code and approves, B adopts the key and deletes the answer', async () => {
    await synced(b); // B has the working copy, no key
    const request = await requestAccess(thisDevice, doors(b));
    assert.equal((await checkAnswer(request, doors(b))).state, 'waiting');
    const [seen] = await pendingRequests(await a.sync.fetchKeys());
    assert.equal(seen.code, request.code, 'both devices show the same 6 digits');
    assert.equal(seen.deviceName, 'Test tablet');
    await approveRequest(seen.id, await heldKey(a), doors(a));
    const answer = await checkAnswer(request, doors(b));
    assert.equal(answer.state, 'answer');
    const account = await finishPairing(request, answer.json, doors(b));
    await synced(b);
    const info = await b.profile.readInfo();
    assert.equal(info.fullName, 'Ann Diver');
    assert.equal(info.bloodGroup, 'A+');
    assert.equal(b.box.getAccountKid(), a.box.getAccountKid());
    assert.equal(account.kid, a.box.getAccountKid());
    // A sees the request and the answer gone: that is the confirmation.
    await synced(a);
    const keys = await a.sync.readKeys();
    assert.deepEqual([keys.pairing.length, keys.requests.length], [0, 0]);
    assert.equal((await b.sync.readKeys()).keyMissing, false);
  });

  test('a declined request is deleted and B is told', async () => {
    const c = await device('c0');
    await synced(c);
    const request = await requestAccess(thisDevice, doors(c));
    const [seen] = await pendingRequests(await a.sync.fetchKeys());
    await declineRequest(seen.id, 'Test tablet', doors(a));
    assert.equal((await checkAnswer(request, doors(c))).state, 'declined');
    assert.equal((await synced(c)).keyMissing, true);
  });

  test('both edit while apart: different fields merge, the same field keeps the later change and is reported', async () => {
    await a.inventory.saveGear({ id: gearId, name: 'Regulator', type: 'regulator', brand: 'Apeks', model: 'XTX200', serial: 'AP-1', note: 'from A' });
    await a.profile.saveInfo({ ...(await a.profile.readInfo()), fullName: 'Ann A. Diver' });
    await synced(a);
    // B edits the same note and another field of the profile, without having pulled A's changes.
    await b.inventory.saveGear({ id: gearId, name: 'Regulator', type: 'regulator', brand: 'Apeks', model: 'XTX200', serial: 'AP-1', note: 'from B' });
    await b.profile.saveInfo({ ...(await b.profile.readInfo()), bloodGroup: 'B+' });
    const result = await synced(b);
    assert.ok(result.conflicts?.some((c) => c.path === `gear/${gearId}.json`), JSON.stringify(result.conflicts));
    await synced(a);
    for (const d of [a, b]) {
      const info = await d.profile.readInfo();
      assert.equal(info.fullName, 'Ann A. Diver', `${d.name}: A's name`);
      assert.equal(info.bloodGroup, 'B+', `${d.name}: B's blood group`);
      assert.equal((await d.inventory.getGear(gearId)).note, 'from B', `${d.name}: the later change`);
    }
    assert.equal(await a.sync.unsent(), 0);
    assert.equal(await b.sync.unsent(), 0);
  });

  test('the recovery key unlocks a new device; a wrong key does not', async () => {
    const made = await createRecoveryKey(await heldKey(a));
    assert.match(made.recoveryKey, /^[0-9A-Z]{4}(-[0-9A-Z]{4}){5}-[0-9A-Z]{2}$/);
    const first = await a.sync.commitKeyFiles({ writes: [made.file], message: 'Benthic: recovery key' });
    assert.equal(first.hasRecovery, true);
    const d = await device('d');
    const result = await synced(d);
    assert.equal(result.keyMissing, true);
    assert.equal(result.hasRecovery, true);
    const { recovery } = await d.sync.readKeys();
    await assert.rejects(recoverAccountKey('0000-0000-0000-0000-0000-0000-00', recovery), /RECOVERY_KEY_WRONG/);
    const account = await recoverAccountKey(made.recoveryKey.replace(/-/g, ' ').toLowerCase(), recovery);
    await adoptAndReseal(d, account);
    await synced(d);
    assert.equal((await d.profile.readInfo()).fullName, 'Ann A. Diver');
  });

  test('an expired request is deleted by the next sync; one still valid stays', async () => {
    const old = await createAccessRequest(thisDevice, { now: () => Date.now() - 30 * 60 * 1000 });
    const fresh = await createAccessRequest(thisDevice);
    await a.sync.commitKeyFiles({ writes: [old.file, fresh.file], message: 'Benthic: request' });
    await synced(a);
    await synced(b);
    const paths = (await b.sync.readKeys()).requests.map((f) => f.path);
    assert.deepEqual(paths, [fresh.file.path]);
    await a.sync.commitKeyFiles({ deletes: [fresh.file.path], message: 'Benthic: request cancelled' });
  });

  test('start over: a new account key, the sealed files go from the account, the gear stays', async () => {
    const paths = await a.sync.paths();
    assert.ok(paths.some((p) => p.startsWith('keys/recovery')));
    const plan = await startOver(paths);
    await a.box.adoptAccountKey(plan.key.key);
    await a.box.persistAccountKey();
    const profile = await a.store.read('profile/diver.json');
    const { enc, ...rest } = profile;
    await a.store.trackedBatch({ writes: [['profile/diver.json', rest]], removes: plan.deletes.filter((p) => !p.startsWith('keys/')) });
    const result = await a.sync.commitKeyFiles({ writes: [plan.account], deletes: plan.deletes.filter((p) => p.startsWith('keys/')), message: 'Benthic: start over' });
    assert.equal(result.status, 'synced', JSON.stringify(result));
    assert.equal(result.hasRecovery, false);
    // Another device now finds an account key it does not hold, and no sealed data left to read.
    await synced(b);
    assert.equal((await b.sync.readKeys()).kid, plan.key.kid);
    assert.equal((await b.inventory.getGear(gearId)).name, 'Regulator');
    assert.equal((await b.sync.paths()).some((p) => p.startsWith('certifications/') || p === 'keys/recovery.json'), false);
  });
});
