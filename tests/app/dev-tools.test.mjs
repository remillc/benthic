// The development tools menu: its actions call the right dev routes (fake transport), it is guarded by the switch, and
// the sheets only reach it through the dynamic import behind `devAccounts`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDevApi } from '../../app/src/lib/dev-accounts.js';
import { ALPHA_IMPORT_KEY } from '../../app/src/lib/alpha-logbook.js';
import { createDevTools, accountSegments, runSegment, SUBSCRIBED_KEY, WELCOME_KEY } from '../../app/src/lib/dev-tools.js';
import { createDevReset, resetLines, RESET_STEPS } from '../../app/src/lib/dev-reset.js';

const read = (path) => readFileSync(new URL('../../app/src/' + path, import.meta.url), 'utf8');

/** A device with a fake server: the calls, the session, the store. */
function setup({ session = null, subscribed } = {}) {
  const calls = [];
  const reads = [];
  const events = [];
  // The server's own answer to GET /v1/account: the truth when a session exists (the device flag is only a fallback).
  const server = { subscribed: session ? subscribed !== '0' : false, down: false };
  const mem = new Map(subscribed === undefined ? [] : [[SUBSCRIBED_KEY, subscribed]]);
  let current = session;
  const accounts = [];
  const transport = async (req) => {
    if (req.method === 'GET' && req.url.endsWith('/v1/account')) {
      reads.push(req.headers?.Authorization ?? '');
      if (server.down) return { status: 503, text: '{}' };
      return { status: 200, text: JSON.stringify({ email: current?.email, subscription: { subscribed: server.subscribed } }) };
    }
    if (req.url.endsWith('/dev-google')) server.subscribed = false;
    if (req.url.endsWith('/dev-subscribe')) server.subscribed = true;
    if (req.url.endsWith('/dev-unsubscribe')) server.subscribed = false;
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
      clear: async () => ((current = null), events.push('clear')),
    },
    app: { signOut: async (o) => ((current = null), events.push('signOut' + (o?.deleteCopy ? ':copy' : ''))), startWithoutAccount: async () => events.push('free') },
    store: { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) },
    account: (a) => accounts.push(a),
    reload: () => events.push('reload'),
    server: () => 'http://127.0.0.1:8080',
    email: () => 'essai-test@opendives.test',
  });
  return { tools, calls, reads, events, mem, server, accounts };
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
  assert.deepEqual(t.events, ['signOut', 'clear', 'free', 'reload']);
  assert.deepEqual(t.calls, []);
});

test('free, keeping the session: dev-unsubscribe with the token, the account state follows, no restart', async () => {
  const t = setup({ session: { email: 'essai-a@opendives.test', token: 'tok' } });
  await t.tools.toFree('unsubscribe');
  assert.deepEqual(t.calls, ['/v1/account/dev-unsubscribe Bearer tok']);
  assert.equal(t.mem.get(SUBSCRIBED_KEY), '0');
  assert.deepEqual(t.events, []);
  assert.deepEqual(t.accounts, [{ signedIn: true, email: 'essai-a@opendives.test', subscribed: false }]);
});

test('free, keeping the session, from no session: a temporary account is signed in and left not subscribed', async () => {
  const t = setup();
  await t.tools.toFree('unsubscribe');
  assert.deepEqual(t.calls, ['/v1/auth/dev-google']);
  assert.deepEqual(t.events, ['save']);
  const s = await t.tools.state();
  assert.deepEqual([s.signedIn, s.kind, s.temporary], [true, 'free', true]);
});

test('free, keeping the session, from a subscribed session: dev-unsubscribe, still signed in', async () => {
  const t = setup({ session: { email: 'a@opendives.test', token: 'tok' } });
  await t.tools.toFree('unsubscribe');
  const s = await t.tools.state();
  assert.deepEqual([s.signedIn, s.kind], [true, 'free']);
});

test('free signed out and subscribed work from every starting state, with or without a session', async () => {
  for (const make of [() => setup(), () => setup({ session: { email: 'a@opendives.test', token: 't' }, subscribed: '0' }), () => setup({ session: { email: 'a@opendives.test', token: 't' } })]) {
    const a = make();
    await a.tools.toFree('signOut');
    assert.equal((await a.tools.state()).signedIn, false);
    const b = make();
    await b.tools.toSubscribed();
    assert.equal((await b.tools.state()).kind, 'subscribed');
  }
});

test('import of the previous version: refused with NO_ALPHA when the device keeps no copy, allowed when unknown', async () => {
  const mk = (n) => createDevTools({ api: createDevApi({ baseUrl: 'http://127.0.0.1:8080', transport: async () => ({ status: 200, text: '{}' }) }), session: { info: async () => ({ signedIn: false, email: '' }), access: async () => ({ sessionToken: '' }), save: async () => {} }, app: { signOut: async () => {}, startWithoutAccount: async () => {} }, store: { getItem: () => null, setItem() {}, removeItem() {} }, reload() {}, server: () => '', alphaFolders: n === null ? undefined : async () => n });
  await assert.rejects(mk(0).importAlphaLogbook(), /NO_ALPHA/);
  await mk(2).importAlphaLogbook();
  await mk(null).importAlphaLogbook();
});

test('the pill of the account selector slides, stays still on the first render and with reduced motion', () => {
  const menu = read('components/DevToolsMenu.svelte');
  assert.match(menu, /segments-pill/);
  assert.match(menu, /transition: transform 0\.3s cubic-bezier\(0\.2, 0\.9, 0\.3, 1\.2\)/);
  assert.match(menu, /prefers-reduced-motion: reduce\) \{\s+\.bc-dev-tools-menu--segments-pill-slide/);
  assert.match(menu, /target = -1/);
});

test('subscribed without a session: dev-google, dev-subscribe, session kept, the account state follows, no restart', async () => {
  const t = setup();
  await t.tools.toSubscribed();
  assert.deepEqual(t.calls, ['/v1/auth/dev-google', '/v1/account/dev-subscribe Bearer tok-new']);
  assert.deepEqual(t.events, ['save']);
  assert.deepEqual(t.accounts, [{ signedIn: true, email: 'essai-test@opendives.test', subscribed: true }]);
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
  assert.deepEqual(t.events, ['signOut', 'clear', 'save', 'reload']);
  assert.equal((await t.tools.state()).kind, 'free');
});

test('delete: dev-reset with the token, then sign out with the copy; refuses a real address', async () => {
  const t = setup({ session: { email: 'essai-a@opendives.test', token: 'tok' } });
  await t.tools.deleteAccount();
  assert.deepEqual(t.calls, ['/v1/account/dev-reset Bearer tok']);
  assert.deepEqual(t.events, ['signOut:copy', 'clear', 'reload']);
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

test('import the previous version’s logbook: the done mark is cleared, the first launch replays, nothing else changes', async () => {
  const t = setup({ session: { email: 'a@opendives.test', token: 't' } });
  t.mem.set(ALPHA_IMPORT_KEY, '1');
  await t.tools.importAlphaLogbook();
  assert.equal(t.mem.has(ALPHA_IMPORT_KEY), false);
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

test('state: with a session the server decides, whatever the device flag says; the flag only stands in when it is down', async () => {
  const t = setup({ session: { email: 'a@opendives.test', token: 'tok' }, subscribed: '1' });
  t.server.subscribed = false; // the flag still says subscribed
  const s = await t.tools.state();
  assert.deepEqual([s.kind, s.fromServer], ['free', true]);
  assert.deepEqual(t.reads, ['Bearer tok']);
  t.server.down = true;
  const down = await t.tools.state();
  assert.deepEqual([down.kind, down.fromServer], ['subscribed', false]);
  assert.equal((await setup().tools.state()).fromServer, false); // no session: the server is not asked
});

test('free signed out, from a session the logbook never connected: the session is forgotten anyway', async () => {
  // app.signOut only clears the session of a logbook opened through it: the dev tool clears it itself.
  const t = setup({ session: { email: 'essai-a@opendives.test', token: 'tok' } });
  await t.tools.toFree('signOut');
  assert.equal((await t.tools.state()).signedIn, false);
});

test('selector: the current segment is the only one disabled, whatever the starting state', async () => {
  const states = {
    none: setup(),
    free: setup({ session: { email: 'a@opendives.test', token: 't' }, subscribed: '0' }),
    subscribed: setup({ session: { email: 'a@opendives.test', token: 't' } }),
  };
  const expected = { none: 0, free: 1, subscribed: 2 };
  for (const [name, t] of Object.entries(states)) {
    const segments = accountSegments(await t.tools.state());
    assert.deepEqual(segments.map((x) => x.on), [0, 1, 2].map((i) => i === expected[name]), name);
    assert.deepEqual(segments.map((x) => x.disabled), [0, 1, 2].map((i) => i === expected[name]), name);
  }
  // Busy or not loaded: all disabled, and the current one stays marked.
  const busy = accountSegments(await states.free.tools.state(), { busy: 'sub' });
  assert.ok(busy.every((x) => x.disabled));
  assert.deepEqual(busy.map((x) => x.on), [false, true, false]);
  assert.ok(accountSegments(null, { ready: false }).every((x) => x.disabled && !x.on));
  assert.ok(accountSegments(null).every((x) => !x.disabled && !x.on)); // state still loading: tapping works
});

test('selector: each segment calls the right action from each starting state, and ends on its own state', async () => {
  const starts = {
    none: () => setup(),
    free: () => setup({ session: { email: 'a@opendives.test', token: 't' }, subscribed: '0' }),
    subscribed: () => setup({ session: { email: 'a@opendives.test', token: 't' } }),
  };
  const target = { out: 0, keep: 1, sub: 2 };
  for (const [name, make] of Object.entries(starts)) {
    for (const id of ['out', 'keep', 'sub']) {
      const t = make();
      const enabled = accountSegments(await t.tools.state()).find((x) => x.id === id);
      if (enabled.disabled) continue; // the current state: not tappable
      await runSegment(t.tools, id);
      assert.ok(t.events.includes('reload') || t.accounts.length > 0, name + ' -> ' + id);
      const after = accountSegments(await t.tools.state());
      assert.equal(after.findIndex((x) => x.on), target[id], name + ' -> ' + id);
    }
  }
});

test('reset: the steps, in order, with the alpha cache kept by default; nothing is sent to a server', async () => {
  const seen = [];
  const reset = createDevReset({
    allowed: () => true,
    cancelNotifications: async () => seen.push('notifications'),
    native: async (o) => seen.push('native:' + o.keepAlpha),
    clearIndexedDb: async () => seen.push('indexedDb'),
    clearDeviceStore: async () => seen.push('deviceStore'),
    clearLocalStorage: () => seen.push('localStorage'),
    reload: () => seen.push('reload'),
  });
  const done = await reset.run();
  assert.deepEqual(done, [...RESET_STEPS]);
  assert.deepEqual(seen, ['notifications', 'native:true', 'indexedDb', 'deviceStore', 'localStorage', 'reload']);
  seen.length = 0;
  await reset.run({ keepAlpha: false });
  assert.equal(seen[1], 'native:false');
});

test('reset: refused outside a development build, before anything is touched', async () => {
  const reset = createDevReset({
    allowed: () => false,
    cancelNotifications: async () => assert.fail('touched'),
    native: async () => assert.fail('touched'),
    clearIndexedDb: async () => assert.fail('touched'),
    clearDeviceStore: async () => assert.fail('touched'),
    clearLocalStorage: () => assert.fail('touched'),
    reload: () => assert.fail('touched'),
  });
  await assert.rejects(reset.run(), /NOT_DEV/);
});

test('reset: the confirmation lists the logbook only when there are dives, the session only when signed in, the alpha only when not kept', () => {
  assert.deepEqual(resetLines({ dives: 1386, loggedIn: false, keepAlpha: true }), ['logbook', 'settings', 'equipment', 'files', 'notifications']);
  assert.deepEqual(resetLines({ dives: 0, loggedIn: true, keepAlpha: false }), ['settings', 'session', 'equipment', 'files', 'notifications', 'alpha']);
});

test('reset: the module is behind the switch, the menu asks twice and offers the export; the native side refuses a release', () => {
  const menu = read('components/DevToolsMenu.svelte');
  assert.match(menu, /exportOpenLogbook/);
  assert.match(menu, /resetArmed/);
  assert.match(menu, /bind:checked=\{keepAlpha\}/);
  assert.match(read('lib/dev-reset.js'), /if \(!deps\.allowed\(\)\) throw new Error\('NOT_DEV'\)/);
  const kotlin = readFileSync(new URL('../../plugins/opendives-core/android/src/main/java/org/opendives/core/OpenDivesCorePlugin.kt', import.meta.url), 'utf8');
  assert.match(kotlin, /fun devResetApp[\s\S]*FLAG_DEBUGGABLE[\s\S]*NOT_DEBUG/);
  assert.doesNotMatch(kotlin.match(/fun devResetApp[\s\S]*?call\.resolve\(\)\n    \}/)[0], /cacerts|maps/i);
  const swift = readFileSync(new URL('../../plugins/opendives-core/ios/Plugin/OpenDivesCorePlugin.swift', import.meta.url), 'utf8');
  assert.match(swift, /func devResetApp[\s\S]*#if DEBUG[\s\S]*#else[\s\S]*NOT_DEBUG/);
});

test('segment “Free” has no qualifier and a device icon; the other two keep theirs', () => {
  const menu = read('components/DevToolsMenu.svelte');
  assert.match(menu, /toFreeOut: 'Free', toFreeOutTag: ''/);
  assert.match(menu, /toFreeOut: 'Gratuit', toFreeOutTag: ''/);
  assert.match(menu, /segment\('out', 0, 'phone'/);
  assert.match(menu, /toFreeKeepTag: 'signed in'/);
  assert.match(menu, /toSubTag: 'Benthic\+'/);
});

test('the sheet follows a drag on its grip: closes past a quarter of its height or on a flick, springs back otherwise, honours reduced motion', () => {
  const menu = read('components/DevToolsMenu.svelte');
  assert.match(menu, /use:dragToClose/);
  assert.match(menu, /dy > height \/ 4 \|\| \(velocity > 0\.5/);
  assert.match(menu, /prefers-reduced-motion: reduce\)'\)\.matches/);
  assert.match(menu, /touch-action: none/);
});
