// SPDX-License-Identifier: GPL-2.0
// Backup and restore of an OpenDives+ logbook (task 2026-11-19-290) against the development server stack: the app's own
// version engine (app/src/lib/backup-history.js) on the core's `history` calls (opendives-host over stdio), with a real
// account, a real repository on the dev Forgejo and real pushes. Three syncs with changes, the middle version restored, the
// newest still listed and restorable back; a dive deleted, synced and restored from the deleted ones; a version opened
// read only; the account deleted with its whole history. Skipped unless the stack is up and the host is given:
//
//   OPENDIVES_HOST=<host binary>  [OPENDIVES_HOST_ARGS='["-d","Ubuntu","-e","/home/me/opendives-host"]']
//   OPENDIVES_DEV_API=http://127.0.0.1:8080  OPENDIVES_DEV_MAILPIT=http://127.0.0.1:8025
//   OPENDIVES_DEV_CA=<ca.pem, as the host sees it>  OPENDIVES_TEST_DIR=<a directory, as the host sees it>
//
// The account is `<random>@opendives.test` and is deleted at the end (DELETE /v1/account).
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';
import { listVersions, versionDetail, restoreVersion, restoreDive, deletedDives, diveVersions, keyOfDate } from '../../app/src/lib/backup-history.js';

const api = process.env.OPENDIVES_DEV_API || '';
const mailpit = process.env.OPENDIVES_DEV_MAILPIT || '';
const hostCommand = process.env.OPENDIVES_HOST || '';
const hostArgs = process.env.OPENDIVES_HOST_ARGS ? JSON.parse(process.env.OPENDIVES_HOST_ARGS) : [];
const ca = process.env.OPENDIVES_DEV_CA || '';
const home = process.env.OPENDIVES_TEST_DIR || '';
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

describe('backup and restore against the dev server', { skip }, () => {
  const email = `backup-${randomBytes(4).toString('hex')}@opendives.test`;
  let host;
  let core;
  let session;
  let access;

  /** The engine's door to the core. */
  const history = async (action, args = []) => JSON.parse(await host.call('history', { action, args }));

  const dive = (date) => host.call('createDive', { fields: JSON.stringify({ date, durationSeconds: 1800, maxDepthMm: 15000 }) });
  const sync = async () => JSON.parse(await host.call('sync', {}));
  const count = async () => JSON.parse(await host.call('listLoadedDives', {})).length;
  const listed = async () => JSON.parse(await host.call('listLoadedDives', {}));

  before(async () => {
    host = startHost();
    core = { history };
    await host.call('init', { home });
    await host.call('setCaFile', { path: ca });
    await json(`${api}/v1/auth/code`, { method: 'POST', body: JSON.stringify({ email }) });
    const verified = await json(`${api}/v1/auth/verify`, { method: 'POST', body: JSON.stringify({ email, code: await codeFor(email) }) });
    assert.equal(verified.status, 200);
    session = verified.body.sessionToken;
    // A host built on an old system libgit2 cannot verify an IP address in the certificate: OPENDIVES_DEV_REPO_HOST names the
    // address the certificate also has as a name (localhost).
    const repoUrl = process.env.OPENDIVES_DEV_REPO_HOST ? verified.body.repository.url.replace('127.0.0.1', process.env.OPENDIVES_DEV_REPO_HOST) : verified.body.repository.url;
    access = { url: repoUrl, branch: verified.body.repository.branch, username: verified.body.git.username, token: verified.body.git.token };
    const sub = await json(`${api}/v1/account/dev-subscribe`, { method: 'POST', headers: { Authorization: `Bearer ${session}` }, body: '{}' });
    assert.equal(sub.status, 200);
    await host.call('gitConfigure', access);
    await host.call('gitCreateLog', {});
    await host.call('cloudListDives', { email: '', password: '' });
  });

  after(async () => {
    // Deleted already by the last test; this only covers a failure on the way.
    if (session) await json(`${api}/v1/account/dev-reset`, { method: 'POST', headers: { Authorization: `Bearer ${session}` }, body: '{}' }).catch(() => {});
    if (host) await host.close();
  });

  /** @type {string[]} */
  const syncs = [];

  test('three syncs with changes give three more versions', async () => {
    for (const date of ['2026-12-01T10:00:00', '2026-12-02T10:00:00', '2026-12-03T10:00:00']) {
      await dive(date);
      await host.call('saveLocal', {});
      const status = await sync();
      assert.equal(status.status, 'pushed');
      syncs.push((await history('info')).head);
    }
    const { versions, head } = await listVersions(core, { limit: 10 });
    assert.equal(head, syncs[2]);
    assert.deepEqual(versions.slice(0, 4).map((v) => v.id), [syncs[2], syncs[1], syncs[0], versions[3].id]);
    assert.deepEqual(versions.slice(0, 3).map((v) => v.counts.dives), [3, 2, 1]);
    assert.equal(versions[0].current, true);
    assert.deepEqual(versions[1].since, { added: 1, removed: 0, modified: 0, sites: 0 });
    assert.deepEqual(versions[2].since, { added: 2, removed: 0, modified: 0, sites: 0 });
  });

  test('the middle version: counts, what restoring would remove, then restored as a new commit and sent', async () => {
    const detail = await versionDetail(core, syncs[1]);
    assert.equal(detail.counts.dives, 2);
    assert.deepEqual(detail.added.map((d) => d.key), ['2026-12-03 10:00:00']);
    const before = (await history('log', ['0', '50', '0'])).commits.length;
    const restored = await restoreVersion(core, syncs[1], '2 December');
    assert.ok(restored.commit);
    assert.equal(await count(), 2, 'the log in memory is the middle version');
    const status = await sync();
    assert.equal(status.status, 'pushed');
    const info = await history('info');
    assert.equal(info.head, restored.commit);
    assert.equal(info.remote, restored.commit, 'the server has the restore commit');
    const log = (await history('log', ['0', '50', '0'])).commits;
    assert.equal(log.length, before + 1, 'one commit added, nothing rewritten');
    assert.ok(log.some((c) => c.id === syncs[2]), 'the newest version is still in the history');
    const { versions } = await listVersions(core, { limit: 10 });
    assert.equal(versions[0].current, true);
    assert.equal(versions[0].counts.dives, 2);
    assert.ok(versions.some((v) => v.id === syncs[2] && v.counts.dives === 3));
  });

  test('the newest version restores back, and the three dives are there', async () => {
    const back = await restoreVersion(core, syncs[2], '3 December');
    assert.ok(back.commit);
    assert.equal(await count(), 3);
    assert.equal((await sync()).status, 'pushed');
    assert.equal((await history('info')).remote, back.commit);
  });

  let deletedKey = '';
  test('a dive is deleted and synced, then restored from the deleted dives', async () => {
    const dives = await listed();
    const victim = dives.find((d) => d.date.startsWith('2026-12-02'));
    deletedKey = keyOfDate(victim.date);
    await host.call('deleteDive', { ids: [victim.id] });
    await host.call('saveLocal', {});
    assert.equal((await sync()).status, 'pushed');
    assert.equal(await count(), 2);
    const gone = await deletedDives(core);
    assert.deepEqual(gone.map((d) => d.key), [deletedKey]);
    const versions = await diveVersions(core, deletedKey);
    assert.equal(versions[0].state, 'deleted');
    assert.equal(versions[1].state, 'new');
    const r = await restoreDive(core, { commit: gone[0].commit, dir: gone[0].dir, key: gone[0].key, date: 'today' });
    assert.ok(r.commit);
    assert.equal(await count(), 3, 'the dive is back in the log in memory');
    assert.equal((await sync()).status, 'pushed');
    assert.deepEqual(await deletedDives(core), []);
    assert.equal(keyOfDate((await listed()).find((d) => d.date.startsWith('2026-12-02')).date), deletedKey);
  });

  test('a version opens read only: its dives, nothing saved or sent, and the logbook comes back', async () => {
    const opened = JSON.parse(await host.call('history', { action: 'open', args: [syncs[0]] }));
    assert.equal(opened.length, 1);
    await assert.rejects(host.call('saveLocal', {}), /NO_LOG|NOT_GIT|log/i);
    await assert.rejects(host.call('sync', {}));
    const closed = JSON.parse(await host.call('history', { action: 'close', args: [] }));
    assert.equal(closed.dives.length, 3);
    assert.equal(await count(), 3);
    const before = (await history('info')).head;
    assert.equal((await sync()).status, 'up_to_date');
    assert.equal((await history('info')).head, before);
  });

  test('deleting the account erases the repository and its whole history', async () => {
    const check = JSON.parse(await host.call('gitCheck', { url: access.url, username: access.username, token: access.token }));
    assert.equal(check.status, 'ok');
    assert.ok(check.branches.includes('main'));
    const deleted = await fetch(`${api}/v1/account`, { method: 'DELETE', headers: { Authorization: `Bearer ${session}` } });
    assert.equal(deleted.status, 204);
    const after = JSON.parse(await host.call('gitCheck', { url: access.url, username: access.username, token: access.token }));
    assert.notEqual(after.status, 'ok', 'the repository is gone');
    assert.ok(!(after.branches ?? []).includes('main'));
    session = '';
  });
});
