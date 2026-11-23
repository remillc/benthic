// SPDX-License-Identifier: GPL-2.0
// The push channel (to-do #185) against the development server stack: two desktop devices of one account, the app's own
// push-events.js reading the server's real /v1/events stream, and the real account sync engine on the core's `bgit*` calls.
// Device A pushes; device B is told `changed` within seconds and its sync catches up. The own push of A starts nothing on A. A
// channel pointed at a dead port stays quiet: nothing throws, no sync is started, the other channels are not affected.
//
// Skipped unless the stack is up and the host is given (same variables as tests/desktop/account-sync.test.mjs):
//
//   BENTHIC_HOST=<host binary>  [BENTHIC_HOST_ARGS='[...]']
//   BENTHIC_DEV_API=http://127.0.0.1:8080  BENTHIC_DEV_MAILPIT=http://127.0.0.1:8025
//   BENTHIC_DEV_CA=<ca.pem, as the host sees it>  BENTHIC_TEST_DIR=<a directory, as the host sees it>
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';
import { join as pathJoin } from 'node:path';
import { createFileStore, memoryBackend } from '../../app/src/lib/file-store.js';
import { createSecretBox } from '../../app/src/lib/secret-box.js';
import { createInventory } from '../../app/src/lib/inventory.js';
import { createAccountSync } from '../../app/src/lib/account-sync.js';
import { createPushEvents } from '../../app/src/lib/push-events.js';

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

/** The native stream of the desktop (bridge.cjs), here with Node fetch: its events go to the listener as the plugin ones do. */
function nodeStream() {
  /** @type {((e: any) => void)|null} */ let listener = null;
  /** @type {Map<number, AbortController>} */ const open = new Map();
  return {
    onEvent: (l) => ((listener = l), () => (listener = null)),
    async open({ id, url, token }) {
      const abort = new AbortController();
      open.set(id, abort);
      void (async () => {
        const send = (data) => open.get(id) === abort && listener?.({ id, ...data });
        try {
          const response = await fetch(url, { headers: { Accept: 'text/event-stream', Authorization: `Bearer ${token}` }, signal: abort.signal });
          if (response.status !== 200) return send({ kind: 'closed', status: response.status });
          send({ kind: 'open', status: 200 });
          const decoder = new TextDecoder();
          let pending = '';
          for await (const chunk of response.body) {
            pending += decoder.decode(chunk, { stream: true });
            let n;
            while ((n = pending.indexOf(String.fromCharCode(10))) >= 0) {
              send({ kind: 'line', line: pending.slice(0, n), status: 200 });
              pending = pending.slice(n + 1);
            }
          }
          send({ kind: 'closed', status: 0 });
        } catch (e) {
          send({ kind: 'closed', status: 0, message: String(e.message) });
        }
      })();
    },
    async close(id) {
      open.get(id)?.abort();
      open.delete(id);
    },
  };
}

const until = async (what, check, ms = 15000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.fail(`timed out: ${what}`);
};

describe('push events against the dev server', { skip }, () => {
  const email = `push-${randomBytes(4).toString('hex')}@benthic.test`;
  const hosts = [];
  const channels = [];
  let sessionToken = '';
  let session;

  async function device(name) {
    const host = startHost();
    hosts.push(host);
    const deviceHome = pathJoin(home, `${name}-${randomBytes(3).toString('hex')}`);
    await host.call('init', { home: deviceHome });
    await host.call('setCaFile', { path: ca });
    const store = createFileStore(memoryBackend());
    const box = createSecretBox(memoryKeeper());
    const inventory = createInventory(store);
    const core = bgitCore(host, deviceHome, session);
    const sync = createAccountSync({ core, store, box });
    const d = { name, store, inventory, sync, syncs: 0, results: [] };
    d.run = async () => {
      d.syncs++;
      const result = await sync.run();
      d.results.push(result);
      return result;
    };
    d.localHead = async () => (await store.read('meta/sync.json'))?.head ?? '';
    return d;
  }

  /** The app channel for a device: the benthic branch runs its sync; the dives branch is not used here. */
  function channelFor(d, url = `${api}/v1/events`) {
    const stream = nodeStream();
    const channel = createPushEvents({
      open: (o) => stream.open({ ...o, url }),
      close: stream.close,
      onEvent: stream.onEvent,
      session: async () => ({ url, token: sessionToken }),
      allowed: () => true,
      handlers: { main: { localHead: async () => '', sync: () => {} }, benthic: { localHead: d.localHead, sync: () => void d.run() } },
    });
    channels.push(channel);
    return channel;
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
    for (const c of channels) c.stop();
    if (sessionToken) await json(`${api}/v1/account/dev-reset`, { method: 'POST', headers: { Authorization: `Bearer ${sessionToken}` }, body: '{}' }).catch(() => {});
    for (const h of hosts) await h.close();
  });

  test('device A pushes, device B is told within seconds and catches up; the own push of A starts nothing on A', async () => {
    const a = await device('a');
    await a.inventory.saveGear({ name: 'Regulator', type: 'regulator', brand: 'Apeks', model: 'XTX200', serial: 'AP-1' });
    const first = await a.run();
    assert.equal(first.status, 'synced', JSON.stringify(first));
    a.syncs = 0;
    const b = await device('b');
    const A = channelFor(a);
    const B = channelFor(b);
    A.start();
    B.start();
    await until('both channels live (hello)', () => A.live && B.live);
    // Both heard the head of the branch at hello: A has it, B does not and syncs by itself.
    await until('B syncs at hello', () => b.results.some((r) => r.status === 'synced'));
    assert.equal(a.syncs, 0, 'A already has the head');
    const startedAt = Date.now();
    const bBefore = b.syncs;
    await a.inventory.saveGear({ name: 'Computer', type: 'dive-computer', brand: 'Shearwater', model: 'Perdix', serial: 'SW-2' });
    const second = await a.run();
    assert.equal(second.status, 'synced', JSON.stringify(second));
    a.syncs = 0;
    await until('B is told and syncs', () => b.syncs > bBefore);
    await until('B holds the head', async () => (await b.localHead()) === second.head);
    console.log(`push: B caught up ${Date.now() - startedAt} ms after the push of A started`);
    await new Promise((r) => setTimeout(r, 2500));
    assert.equal(a.syncs, 0, 'A did not sync again after its own push');
  });

  test('a dead port: the channel stays quiet, nothing throws, no sync starts', async () => {
    const c = await device('c');
    const dead = channelFor(c, 'http://127.0.0.1:9/v1/events');
    dead.start();
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal(dead.live, false);
    assert.equal(dead.connected, false);
    assert.equal(c.syncs, 0);
    dead.stop();
  });

  test('a bad session: the 401 ends the attempts without a sync', async () => {
    const c = await device('d');
    const stream = nodeStream();
    const channel = createPushEvents({
      open: (o) => stream.open(o),
      close: stream.close,
      onEvent: stream.onEvent,
      session: async () => ({ url: `${api}/v1/events`, token: 'not-a-session' }),
      allowed: () => true,
      handlers: { main: { localHead: async () => '', sync: () => {} }, benthic: { localHead: async () => '', sync: () => void c.run() } },
    });
    channels.push(channel);
    channel.start();
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal(channel.live, false);
    assert.equal(c.syncs, 0);
  });
});
