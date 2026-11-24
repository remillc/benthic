// SPDX-License-Identifier: GPL-2.0
// The cylinder types the diver added (task 2026-11-23-373) between two devices, against the development server stack: the app's own
// engine and files (app/src/lib/account-sync.js, cylinder-type-files.js), the core's `bgit*` calls and `cylinderTypes` (one
// benthic-host process per device over stdio), a real account and a real repository on the dev Forgejo.
//   - A takes a « Tailles courantes » size from the core's default table, saves it as a file, and syncs;
//   - B shows it, and its core offers it, before any dive uses it;
//   - A renames it and B follows; A deletes it and B no longer has it.
//
// Skipped unless the stack is up and the host is given (as tests/desktop/account-sync.test.mjs):
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
import { createInventory, newId } from '../../app/src/lib/inventory.js';
import { createAccountSync } from '../../app/src/lib/account-sync.js';
import { coreStrings, commonSizes, newTypeFile } from '../../app/src/lib/cylinder-type-files.js';

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

const isoIn = (seconds) => new Date(Date.now() + seconds * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
const types = async (d) => (await d.inventory.listCylinderTypes()).map((f) => `${f.name}:${f.ml}`).sort();
/** What the device's core offers as cylinder types, through the host (the dive editor, the planner and the tools read this table). */
const coreList = async (d) => JSON.parse(await d.host.call('cylinderTypes', { action: 'list' })).cylinderTypes.types;
const coreNames = async (d) => (await coreList(d)).map((t) => t.name).sort();
const coreDefaults = async (d) => JSON.parse(await d.host.call('cylinderTypes', { action: 'defaults' })).cylinderTypes.defaults;

describe('cylinder types between two devices against the dev server', { skip }, () => {
  const email = `cyl-${randomBytes(4).toString('hex')}@benthic.test`;
  /** @type {Awaited<ReturnType<typeof device>>[]} */
  const devices = [];
  let sessionToken = '';
  let session;

  /** A device: its own host process and home, store, box, inventory and engine. */
  async function device(name) {
    const host = startHost();
    const deviceHome = pathJoin(home, `${name}-${randomBytes(3).toString('hex')}`);
    await host.call('init', { home: deviceHome });
    await host.call('setCaFile', { path: ca });
    const store = createFileStore(memoryBackend());
    const box = createSecretBox(memoryKeeper());
    const inventory = createInventory(store);
    const core = bgitCore(host, deviceHome, session);
    const sync = createAccountSync({ core, store, box });
    const d = { name, host, store, box, inventory, core, sync };
    devices.push(d);
    return d;
  }

  const synced = async (d) => {
    const result = await d.sync.run();
    assert.equal(result.status, 'synced', `${d.name}: ${JSON.stringify(result)}`);
    return result;
  };

  /** What the app does after a change or a sync: the core is given the files in memory. */
  async function feed(d) {
    const added = coreStrings(await d.inventory.listCylinderTypes());
    await d.host.call('cylinderTypes', { action: 'added', value: JSON.stringify({ added }) });
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

  /** @type {Awaited<ReturnType<typeof device>>} */ let a;
  /** @type {Awaited<ReturnType<typeof device>>} */ let b;
  let fileId = '';

  test('the core exports its default table as suggestions, in both unit systems, and it is not the list', async () => {
    a = await device('a');
    b = await device('b');
    const defaults = await coreDefaults(a);
    assert.ok(defaults.some((d) => d.name === 'AL80' && d.imperial), 'AL80 is an imperial size');
    assert.ok(defaults.some((d) => d.name === '12L 232 bar' && !d.imperial && d.ml === 12000 && d.mbar === 232000), 'a metric size in litres and bar');
    assert.deepEqual(await coreNames(a), [], 'the default table is not the list');
  });

  test('A adds a type from a common size and syncs; B shows it, and its core offers it, before any dive uses it', async () => {
    const size = commonSizes(await coreDefaults(a), true).find((d) => d.name === 'HP100');
    const file = newTypeFile({ id: newId(), name: size.name, ml: size.ml, mbar: size.mbar, stamp: isoIn(0) });
    fileId = file.id;
    await a.inventory.changeCylinderTypes([file]);
    await feed(a);
    assert.deepEqual(await coreNames(a), ['HP100'], "A's core offers it");
    await synced(a);
    await synced(b);
    assert.deepEqual(await types(b), [`HP100:${size.ml}`]);
    await feed(b);
    assert.deepEqual(await coreNames(b), ['HP100'], "B's core offers it with no dive using it");
    const [row] = await coreList(b);
    // Subsurface's table keeps a pressure in whole bar (or psi) and a size in litres or cubic feet.
    assert.deepEqual([row.ml, Math.abs(row.mbar - size.mbar) < 1000, row.dives], [size.ml, true, 0]);
    assert.equal((await a.store.read('meta/pending.json'))?.paths?.length ?? 0, 0, 'nothing left to send');
  });

  test('A renames it, B follows', async () => {
    const [file] = await a.inventory.listCylinderTypes();
    await a.inventory.changeCylinderTypes([{ ...file, name: 'HP100 steel', updatedAt: isoIn(2) }]);
    await synced(a);
    await synced(b);
    assert.deepEqual((await b.inventory.listCylinderTypes()).map((f) => [f.id, f.name]), [[fileId, 'HP100 steel']]);
    await feed(b);
    assert.deepEqual(await coreNames(b), ['HP100 steel']);
  });

  test('A deletes it, B no longer has it; two devices adding the same name end with one file', async () => {
    await a.inventory.changeCylinderTypes([], [fileId]);
    await synced(a);
    await synced(b);
    assert.deepEqual(await types(b), []);
    await feed(b);
    assert.deepEqual(await coreNames(b), []);
    // The same name added on both devices before they met: the clean-up pass leaves one file.
    await a.inventory.changeCylinderTypes([newTypeFile({ id: '0000-from-a', name: 'Steel 12L', ml: 12000, mbar: 232000, stamp: isoIn(3) })]);
    await b.inventory.changeCylinderTypes([newTypeFile({ id: '0001-from-b', name: 'steel 12 l', ml: 12100, mbar: 200000, stamp: isoIn(4) })]);
    await synced(a);
    await synced(b);
    await synced(a);
    for (const d of [a, b]) assert.deepEqual(await types(d), ['steel 12 l:12100'], `${d.name}: one file, the later size and name`);
    assert.equal((await a.inventory.listCylinderTypes())[0].id, '0000-from-a');
  });
});
