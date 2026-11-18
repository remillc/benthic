// The development tools menu: its actions call the right dev routes (fake transport), it is guarded by the switch, and
// the sheets only reach it through the dynamic import behind `devAccounts`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDevApi } from '../../app/src/lib/dev-accounts.js';
import { createDevTools, SUBSCRIBED_KEY, WELCOME_KEY } from '../../app/src/lib/dev-tools.js';

const read = (path) => readFileSync(new URL('../../app/src/' + path, import.meta.url), 'utf8');

/** A device with a fake server: the calls, the session, the store. */
function setup({ session = null, subscribed } = {}) {
  const calls = [];
  const events = [];
  const mem = new Map(subscribed === undefined ? [] : [[SUBSCRIBED_KEY, subscribed]]);
  let current = session;
  const transport = async (req) => {
    calls.push(`${req.url.replace('http://127.0.0.1:8080', '')} ${req.headers?.Authorization ?? ''}`.trim());
    if (req.url.endsWith('/dev-google')) {
      return { status: 200, text: JSON.stringify({ sessionToken: 'tok-new', user: { email: req.body.email, subscribed: false }, repository: { url: 'r', branch: 'main' }, git: { username: 'u', token: 'g' } }) };
    }
    return { status: 200, text: '{}' };
  };
  const tools = createDevTools({
    api: createDevApi({ baseUrl: 'http://127.0.0.1:8080', transport }),
    session: {
      info: async () => (current ? { signedIn: true, email: current.email } : { signedIn: false, email: '' }),
      access: async () => ({ sessionToken: current?.token ?? '' }),
      save: async (s) => ((current = { email: s.user.email, token: s.sessionToken }), events.push('save')),
    },
    app: { signOut: async (o) => ((current = null), events.push('signOut' + (o?.deleteCopy ? ':copy' : ''))), startWithoutAccount: async () => events.push('free') },
    store: { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) },
    reload: () => events.push('reload'),
    server: () => 'http://127.0.0.1:8080',
    email: () => 'essai-test@opendives.test',
  });
  return { tools, calls, events, mem };
}

test('state: no session is free; a session is subscribed unless marked otherwise', async () => {
  assert.equal((await setup().tools.state()).kind, 'free');
  const s = await setup({ session: { email: 'essai-a@opendives.test', token: 't' } }).tools.state();
  assert.deepEqual([s.kind, s.temporary, s.email], ['subscribed', true, 'essai-a@opendives.test']);
  assert.equal((await setup({ session: { email: 'a@b.c', token: 't' }, subscribed: '0' }).tools.state()).kind, 'free');
});

test('free, default: sign out keeping the device logbook, open it, reload; no server call', async () => {
  const t = setup({ session: { email: 'essai-a@opendives.test', token: 't' } });
  await t.tools.toFree();
  assert.deepEqual(t.events, ['signOut', 'free', 'reload']);
  assert.deepEqual(t.calls, []);
});

test('free, keeping the session: dev-unsubscribe with the token, then reload', async () => {
  const t = setup({ session: { email: 'essai-a@opendives.test', token: 'tok' } });
  await t.tools.toFree('unsubscribe');
  assert.deepEqual(t.calls, ['/v1/account/dev-unsubscribe Bearer tok']);
  assert.equal(t.mem.get(SUBSCRIBED_KEY), '0');
  assert.deepEqual(t.events, ['reload']);
  await assert.rejects(setup().tools.toFree('unsubscribe'), /NO_SESSION/);
});

test('subscribed without a session: dev-google, dev-subscribe, session kept, reload', async () => {
  const t = setup();
  await t.tools.toSubscribed();
  assert.deepEqual(t.calls, ['/v1/auth/dev-google', '/v1/account/dev-subscribe Bearer tok-new']);
  assert.deepEqual(t.events, ['save', 'reload']);
  assert.equal(t.mem.get(SUBSCRIBED_KEY), '1');
});

test('subscribed with a session: only dev-subscribe', async () => {
  const t = setup({ session: { email: 'a@opendives.test', token: 'tok' }, subscribed: '0' });
  await t.tools.toSubscribed();
  assert.deepEqual(t.calls, ['/v1/account/dev-subscribe Bearer tok']);
  assert.equal(t.mem.get(SUBSCRIBED_KEY), '1');
});

test('new account: a fresh not-subscribed account replaces the session', async () => {
  const t = setup({ session: { email: 'old@opendives.test', token: 'old' } });
  await t.tools.newAccount();
  assert.deepEqual(t.calls, ['/v1/auth/dev-google']);
  assert.deepEqual(t.events, ['signOut', 'save', 'reload']);
  assert.equal((await t.tools.state()).kind, 'free');
});

test('delete: dev-reset with the token, then sign out with the copy; refuses a real address', async () => {
  const t = setup({ session: { email: 'essai-a@opendives.test', token: 'tok' } });
  await t.tools.deleteAccount();
  assert.deepEqual(t.calls, ['/v1/account/dev-reset Bearer tok']);
  assert.deepEqual(t.events, ['signOut:copy', 'reload']);
  const real = setup({ session: { email: 'me@example.org', token: 'tok' } });
  await assert.rejects(real.tools.deleteAccount(), /NOT_TEMPORARY/);
  assert.deepEqual(real.calls, []);
});

test('replay the first launch: only the beta key, then reload', () => {
  const t = setup({ session: { email: 'a@opendives.test', token: 't' } });
  t.tools.replayFirstLaunch();
  assert.equal(t.mem.get(WELCOME_KEY), 'show');
  assert.deepEqual(t.events, ['reload']);
  assert.deepEqual(t.calls, []);
});

test('a server that is not local is refused before any request', async () => {
  const bad = createDevApi({ baseUrl: 'https://api.example.org', transport: async () => assert.fail('called') });
  await assert.rejects(bad.unsubscribe('t'));
});

test('the menu is absent without the switch: every entry is behind devAccounts and a dynamic import', () => {
  for (const file of ['components/AccountSheet.svelte', 'components/DesktopAccountSheet.svelte']) {
    const text = read(file);
    assert.match(text, /\{#if devAccounts\}\{#await import\('\.\/DevToolsRow\.svelte'\)/, file);
    assert.doesNotMatch(text, /^\s*import .*DevTools/m, file);
  }
  const app = read('App.svelte');
  assert.match(app, /\{#if devAccounts\}\{#await import\('\.\/components\/DevToolsHost\.svelte'\)/);
  assert.doesNotMatch(app, /^\s*import .*DevTools/m);
  assert.match(read('components/DevToolsMenu.svelte'), /Outils de développement/);
});
