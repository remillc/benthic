// The development-only simulated Google sign-in and purchase (the private server's DEV_MODE routes): off unless
// VITE_DEV_ACCOUNTS=1, refused for any server that is not this machine's, and absent from a build made without the switch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { devAccounts } from '../../app/src/lib/dev-switch.js';
import { createDevApi, isLocalServerUrl, isTempEmail, randomTempEmail } from '../../app/src/lib/dev-accounts.js';
import { enterDownload, forward } from '../../app/src/lib/first-launch-steps.js';
import { ServerError } from '../../app/src/lib/server-api.js';

const root = new URL('../../app/src/', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('the switch is off by default (no constant defined outside a build made with it)', () => {
  assert.equal(devAccounts, false);
});

test('without the switch the Google button keeps its not-available answer and the dev files are only reached behind the switch', () => {
  const plus = read('components/FirstLaunchBenthicPlus.svelte');
  assert.match(plus, /odplus\.providerUnavailable/);
  assert.match(plus, /if \(devAccounts && provider === 'google'\)/);
  for (const m of plus.matchAll(/import\('\.\.\/lib\/dev-accounts\.js'\)/g)) {
    const before = plus.slice(Math.max(0, m.index - 400), m.index);
    assert.match(before, /if \(devAccounts\)|if \(!devAccounts/, 'a dynamic import of dev-accounts.js outside the switch');
  }
  assert.doesNotMatch(plus, /from '\.\.\/lib\/dev-accounts\.js'|from '\.\/DevGoogleSheet\.svelte'/);
  assert.match(read('pages/Account.svelte'), /\{#if devAccounts && server\}/);
  assert.doesNotMatch(read('pages/Account.svelte'), /from '\.\.\/components\/DevDeleteAccount\.svelte'/);
  assert.match(read('components/DevGoogleSheet.svelte'), /Simulation \(développement\)/);
  assert.match(read('components/DevDeleteAccount.svelte'), /Supprimer ce compte d’essai/);
});

test('only this machine\'s servers are local', () => {
  for (const ok of ['http://127.0.0.1:8080', 'http://10.0.2.2:8080', 'http://localhost:8080', 'http://[::1]:8080']) assert.equal(isLocalServerUrl(ok), true, ok);
  for (const bad of ['https://api.example.org', 'http://192.168.1.20:8080', 'http://127.0.0.1.example.org', 'not an address', '']) assert.equal(isLocalServerUrl(bad), false, bad);
});

test('a temporary address looks like essai-xxxx@opendives.test and only such addresses can be deleted', () => {
  assert.match(randomTempEmail(), /^essai-[a-z2-9]{4}@opendives\.test$/);
  assert.notEqual(randomTempEmail(), randomTempEmail());
  assert.equal(isTempEmail('essai-ab12@opendives.test'), true);
  assert.equal(isTempEmail('someone@example.org'), false);
});

test('the dev calls refuse a server that is not local, before any request', async () => {
  let calls = 0;
  const transport = async () => (calls++, { status: 200, text: '{}' });
  for (const baseUrl of ['https://api.example.org', 'http://192.168.1.20:8080', '']) {
    const api = createDevApi({ baseUrl, transport });
    await assert.rejects(api.signIn('a@opendives.test', 'A'), (e) => e instanceof ServerError && e.code === 'UNREACHABLE');
    await assert.rejects(api.subscribe('t'), ServerError);
    await assert.rejects(api.reset('t'), ServerError);
  }
  assert.equal(calls, 0);
});

test('a local server: the sign-in, the simulated purchase and the deletion call the three dev routes', async () => {
  const seen = [];
  const session = { sessionToken: 'a'.repeat(64), user: { id: '1', email: 'a@opendives.test', isNew: true, subscribed: false }, repository: { url: 'https://127.0.0.1:3443/x/logbook.git', branch: 'main' }, git: { username: 'x', token: 'tok' } };
  const transport = async (r) => (seen.push(r), { status: 200, text: JSON.stringify(r.url.endsWith('dev-google') ? session : { ok: true }) });
  const api = createDevApi({ baseUrl: 'http://127.0.0.1:8080', transport });
  assert.equal((await api.signIn(' a@opendives.test ', ' Ann ')).user.subscribed, false);
  await api.subscribe(session.sessionToken);
  await api.reset(session.sessionToken);
  assert.deepEqual(seen.map((r) => [r.method, r.url]), [
    ['POST', 'http://127.0.0.1:8080/v1/auth/dev-google'],
    ['POST', 'http://127.0.0.1:8080/v1/account/dev-subscribe'],
    ['POST', 'http://127.0.0.1:8080/v1/account/dev-reset'],
  ]);
  assert.deepEqual(seen[0].body, { email: 'a@opendives.test', name: 'Ann' });
  assert.equal(seen[1].headers.Authorization, `Bearer ${session.sessionToken}`);
  // A server that answers 404 (not in dev mode) is seen as unreachable.
  const off = createDevApi({ baseUrl: 'http://127.0.0.1:8080', transport: async () => ({ status: 404, text: '{"error":{"code":"NOT_FOUND"}}' }) });
  await assert.rejects(off.signIn('a@opendives.test', ''), (e) => e.code === 'UNREACHABLE');
});

test('the download step of the simulated sign-in sits over the address step, so that Retour leaves for it', () => {
  assert.deepEqual(enterDownload(['start', 'odplusConnect']), ['start', 'odplusConnect', 'server', 'serverDownload']);
  assert.deepEqual(enterDownload(['start', 'odplusConnect', 'odplusOffer', 'odplusWelcome', 'odplusHealth']), ['start', 'odplusConnect', 'server', 'serverDownload']);
  assert.deepEqual(forward(['start', 'odplusConnect'], 'email'), ['start', 'odplusConnect', 'server']);
});

/** The text of every file of a build. */
function bundleText(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(d, e.name));
      else if (/\.(js|css|html)$/.test(e.name)) out.push(readFileSync(join(d, e.name), 'utf8'));
    }
  };
  walk(dir);
  return out.join('\n');
}

test('a build without the switch contains nothing of it; a build with it does', { timeout: 300000 }, () => {
  const app = fileURLToPath(new URL('../../app/', import.meta.url));
  const vite = fileURLToPath(new URL('../../app/node_modules/vite/bin/vite.js', import.meta.url));
  const tmp = mkdtempSync(join(tmpdir(), 'od-devaccounts-'));
  const marks = /dev-google|dev-subscribe|dev-unsubscribe|dev-reset|DevGoogle|od-dev-google|od-dev-delete|od-dev-tools|Outils de développement|essai-/;
  try {
    for (const [name, on] of [['off', ''], ['on', '1']]) {
      const outDir = join(tmp, name);
      const r = spawnSync(process.execPath, [vite, 'build', '--outDir', outDir, '--emptyOutDir'], { cwd: app, env: { ...process.env, VITE_DEV_ACCOUNTS: on }, encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr + r.stdout);
      const text = bundleText(outDir);
      if (on) assert.match(text, marks, 'the build with the switch lost the dev code');
      else assert.doesNotMatch(text, marks, 'the default build carries the dev code');
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
