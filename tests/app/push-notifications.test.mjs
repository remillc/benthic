// The push notification of an access request (inbox task 2026-11-23-356, parts 3 and 4): the token's register, refresh and
// remove, the payloads, the ask-once rule, and that a server that is down never blocks or breaks anything. The logic is
// lib/push-notifications.js (no Capacitor); the screens are read from the source, the native side was run on the emulator.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ASKED_KEY, NATIVE_TOKEN_KEY, REFRESH_MS, TOKEN_KEY, createPush, parsePush } from '../../app/src/lib/push-notifications.js';
import { createServerApi } from '../../app/src/lib/server-api.js';

const root = new URL('../../app/src/', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8').split('\r\n').join('\n');

function memoryStore() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k), m };
}

/** A client with a fake server and a fake system; `over` replaces any part. */
function client(over = {}) {
  const calls = { register: [], remove: [], signOut: [], registerNative: 0, unregister: 0, requestPermission: 0 };
  let clock = 1_000_000;
  const store = over.store ?? memoryStore();
  const state = { permission: 'granted', session: 'session-token', ...(over.state ?? {}) };
  const push = createPush({
    platform: 'android',
    store,
    api: {
      registerPushToken: async (s, f) => void calls.register.push({ s, ...f }),
      removePushToken: async (s, id) => void calls.remove.push({ s, id }),
      signOut: async (s) => void calls.signOut.push(s),
      ...(over.api ?? {}),
    },
    sessionToken: async () => state.session,
    permission: async () => state.permission,
    requestPermission: async () => {
      calls.requestPermission++;
      state.permission = state.next ?? 'granted';
      return state.permission;
    },
    register: async () => void calls.registerNative++,
    unregister: async () => void calls.unregister++,
    now: () => clock,
    warn: () => {},
    ...(over.deps ?? {}),
  });
  return { push, calls, store, state, tick: (ms) => (clock += ms) };
}

// --- The payloads ---

test('a data message of an access request is read, anything else is ignored', () => {
  const request = parsePush({ type: 'access-request', requestId: 'abc_DEF-123', deviceName: 'Pixel 7', code: '482913', expiresAt: '1790000000000' });
  assert.deepEqual(request, { type: 'access-request', requestId: 'abc_DEF-123', deviceName: 'Pixel 7', code: '482913', expiresAt: 1790000000000 });
  assert.deepEqual(parsePush({ type: 'access-request-done', requestId: 'abc' }), { type: 'access-request-done', requestId: 'abc' });
  for (const bad of [null, undefined, 'x', {}, { type: 'other', requestId: 'abc' }, { type: 'access-request' }, { type: 'access-request', requestId: '../x' }, { type: 'access-request-done', requestId: '' }, { type: 'access-request', requestId: 'a'.repeat(65) }]) {
    assert.equal(parsePush(bad), null, JSON.stringify(bad));
  }
});

// --- The token: register, refresh, remove ---

test('the token is sent once with the device id and platform, and not again until it changes or a week passes', async () => {
  const { push, calls, tick, store } = client();
  assert.equal(await push.onToken('tok-1', 'dev-1'), true);
  assert.deepEqual(calls.register, [{ s: 'session-token', deviceId: 'dev-1', platform: 'android', token: 'tok-1' }]);
  assert.ok(push.registered());
  await push.onToken('tok-1', 'dev-1');
  assert.equal(calls.register.length, 1, 'same token, same device, same week: nothing sent');
  await push.onToken('tok-2', 'dev-1');
  assert.equal(calls.register.length, 2, 'a new token (the system renewed it) is sent');
  assert.equal(calls.register[1].token, 'tok-2');
  tick(REFRESH_MS + 1);
  await push.send('dev-1');
  assert.equal(calls.register.length, 3, 'a week later it is refreshed');
  assert.equal(JSON.parse(store.getItem(TOKEN_KEY)).token, 'tok-2');
});

test('a device id that changed (short ids, to-do #149): the token is registered under the new id and removed under the old one', async () => {
  const { push, calls } = client();
  await push.onToken('tok-1', 'Ez0yvO2RBjDe-bNmVvTUYA');
  await push.send('7k2m9q4x1d');
  assert.deepEqual(calls.register.map((r) => r.deviceId), ['Ez0yvO2RBjDe-bNmVvTUYA', '7k2m9q4x1d']);
  assert.deepEqual(calls.remove, [{ s: 'session-token', id: 'Ez0yvO2RBjDe-bNmVvTUYA' }]);
  await push.send('7k2m9q4x1d');
  assert.equal(calls.remove.length, 1, 'the old id is removed once');
});

test('a token that arrives before the device has its record id waits for it', async () => {
  const { push, calls } = client();
  assert.equal(await push.onToken('tok-1', ''), false);
  assert.equal(calls.register.length, 0);
  assert.equal(await push.send('dev-9'), true);
  assert.equal(calls.register[0].deviceId, 'dev-9');
});

test('no session, no token: nothing is sent', async () => {
  const noSession = client({ state: { session: '' } });
  assert.equal(await noSession.push.onToken('tok', 'dev'), false);
  assert.equal(noSession.calls.register.length, 0);
  const none = client();
  assert.equal(await none.push.send('dev'), false);
});

test('ensure asks the system for the token only when notifications are allowed', async () => {
  const refused = client({ state: { permission: 'denied' } });
  assert.equal(await refused.push.ensure('dev'), false);
  assert.equal(refused.calls.registerNative, 0);
  const prompt = client({ state: { permission: 'prompt' } });
  await prompt.push.ensure('dev');
  assert.equal(prompt.calls.registerNative, 0, 'ensure never asks the system for the permission itself');
  assert.equal(prompt.calls.requestPermission, 0);
  const ok = client();
  await ok.push.ensure('dev');
  assert.equal(ok.calls.registerNative, 1);
  assert.equal((await client().push.ensure('')), false, 'no device record yet');
});

test('the token leaves the server when the device is unpaired', async () => {
  const { push, calls, store } = client();
  await push.onToken('tok', 'dev-1');
  assert.equal(await push.remove(), true);
  assert.deepEqual(calls.remove, [{ s: 'session-token', id: 'dev-1' }]);
  assert.equal(store.getItem(TOKEN_KEY), null);
  assert.equal(store.getItem(NATIVE_TOKEN_KEY), null);
  assert.equal(push.registered(), false);
  assert.equal(await push.remove(), false, 'nothing left to remove');
});

test('sign-out ends the server session and forgets the token, and never waits for a silent server', async () => {
  const { push, calls, store } = client();
  await push.onToken('tok', 'dev-1');
  await push.signOut();
  assert.deepEqual(calls.signOut, ['session-token']);
  assert.equal(store.getItem(TOKEN_KEY), null);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(calls.unregister, 1, 'the system forgets the token too');

  const silent = client({ api: { signOut: () => new Promise(() => {}) } });
  await silent.push.onToken('tok', 'dev-1');
  const started = Date.now();
  await silent.push.signOut(50);
  assert.ok(Date.now() - started < 1000, 'the sign-out is not held by a server that does not answer');
  assert.equal(silent.store.getItem(TOKEN_KEY), null);
});

// --- A server that is down never breaks the app ---

test('a server that is down: no throw, no stored record, a retry at the next call', async () => {
  let down = true;
  const unreachable = async () => {
    if (down) throw new Error('UNREACHABLE');
  };
  const { push, calls, store } = client({ api: { registerPushToken: async (s, f) => (await unreachable(), void calls.register.push(f)), removePushToken: unreachable, signOut: unreachable } });
  assert.equal(await push.onToken('tok', 'dev'), false);
  assert.equal(store.getItem(TOKEN_KEY), null, 'a token the server did not take is not remembered as sent');
  assert.equal(await push.ensure('dev'), false);
  await assert.doesNotReject(push.remove());
  await assert.doesNotReject(push.signOut());
  down = false;
  assert.equal(await push.onToken('tok', 'dev'), true, 'back up: it goes through');
  assert.equal(calls.register.length, 1);
});

test('the real server API: a register, a removal and a sign-out through the transport, and a 204 is an answer', async () => {
  const seen = [];
  const transport = async (req) => {
    seen.push(req);
    return req.method === 'POST' && req.url.endsWith('/push-token') ? { status: 200, text: '{"ok":true}' } : { status: 204, text: '' };
  };
  const api = createServerApi({ baseUrl: 'https://server.example', transport });
  await api.registerPushToken('S', { deviceId: 'd-1', platform: 'ios', token: 'T' });
  await api.removePushToken('S', 'd 1');
  await api.signOut('S');
  assert.deepEqual(seen.map((r) => [r.method, r.url]), [
    ['POST', 'https://server.example/v1/devices/push-token'],
    ['DELETE', 'https://server.example/v1/devices/push-token?deviceId=d%201'],
    ['POST', 'https://server.example/v1/auth/sign-out'],
  ]);
  assert.deepEqual(seen[0].body, { deviceId: 'd-1', platform: 'ios', token: 'T' });
  assert.equal(seen[0].headers.Authorization, 'Bearer S');
  const down = createServerApi({ baseUrl: 'https://server.example', transport: async () => ({ status: 503, text: '' }) });
  await assert.rejects(down.signOut('S'));
});

// --- The permission to notify: asked once ---

test('the explanation is due once, while the system has not decided', async () => {
  const { push, store, state } = client({ state: { permission: 'prompt' } });
  assert.equal(await push.explanationDue(), true);
  push.markAsked();
  assert.equal(store.getItem(ASKED_KEY), '1');
  assert.equal(await push.explanationDue(), false, '« Plus tard » never asks again on its own');
  state.permission = 'prompt';
  assert.equal(await push.explanationDue(), false);

  assert.equal(await client({ state: { permission: 'granted' } }).push.explanationDue(), false, 'already allowed: nothing to explain');
  assert.equal(await client({ state: { permission: 'denied' } }).push.explanationDue(), false, 'refused: not asked again');
});

test('« Continuer » opens the system request and the answer is the new state', async () => {
  const yes = client({ state: { permission: 'prompt', next: 'granted' } });
  assert.equal(await yes.push.askSystem(), 'granted');
  assert.equal(yes.calls.requestPermission, 1);
  const no = client({ state: { permission: 'prompt', next: 'denied' } });
  assert.equal(await no.push.askSystem(), 'denied');
});

test('the banner shows when the system refuses, also after one refusal that Android reports as a prompt', () => {
  const { push, store } = client();
  assert.equal(push.view('granted'), 'granted');
  assert.equal(push.view('denied'), 'refused');
  assert.equal(push.view('prompt'), 'undecided');
  store.setItem(ASKED_KEY, '1');
  assert.equal(push.view('prompt'), 'refused');
  assert.equal(push.view('granted'), 'granted');
});

// --- Phone and tablet only ---

test('on the desktop or in a browser no push code runs', async () => {
  const calls = [];
  const push = createPush({
    platform: '',
    store: memoryStore(),
    api: { registerPushToken: async () => calls.push('register'), removePushToken: async () => calls.push('remove'), signOut: async () => calls.push('signOut') },
    sessionToken: async () => 's',
    permission: async () => (calls.push('permission'), 'granted'),
    requestPermission: async () => (calls.push('request'), 'granted'),
    register: async () => void calls.push('native'),
  });
  assert.equal(push.supported(), false);
  assert.equal(await push.permission(), 'unsupported');
  assert.equal(push.view('granted'), 'unsupported');
  assert.equal(await push.explanationDue(), false);
  assert.equal(await push.onToken('t', 'd'), false);
  assert.equal(await push.ensure('d'), false);
  assert.equal(await push.remove(), false);
  await push.signOut();
  assert.deepEqual(calls, []);
  const wiring = read('lib/push-notifications.svelte.js');
  assert.match(wiring, /!desktop && \(p === 'android' \|\| p === 'ios'\)/);
});

// --- What the screens do ---

test('the account flows register after the device record, remove when unpaired, and sign-out ends the server session', () => {
  const flows = read('lib/account-sync-flows.svelte.js');
  assert.match(flows, /touchDeviceRecord\([\s\S]*?\);\s*\n\s*\/\/[^\n]*\n\s*void ensurePushRegistered\(\);/);
  assert.match(flows, /export async function dropDeviceRecord\(\) \{[^\n]*\n[^\n]*\n\s*removePushToken\(\);/);
  assert.match(flows, /open: \(id\) => void wantRequest\(id\)/);
  assert.match(flows, /!known\.has\(r\.id\) && hidden && !pushClient\.registered\(\)/);
  const logbook = read('lib/logbook.svelte.js');
  assert.match(logbook, /await signOutPush\(\);\s*\n\s*await BenthicCore\.serverSessionClear\(\)/);
});

test('the explanation, « Vos appareils » and the refused banner use the task\'s texts in French and English', () => {
  const fr = JSON.parse(read('i18n/fr.json')).accountSync.push;
  const en = JSON.parse(read('i18n/en.json')).accountSync.push;
  assert.equal(fr.askTitle, 'Être prévenu des demandes d’accès');
  assert.equal(fr.askText, 'Quand un nouvel appareil demande l’accès à vos données chiffrées, Benthic vous prévient sur cet appareil, même s’il est fermé. Vous comparez le code et répondez.');
  assert.equal(fr.askNote, 'Le serveur Benthic n’envoie aucune autre notification.');
  assert.equal([fr.later, fr.continue].join('|'), 'Plus tard|Continuer');
  assert.equal(JSON.parse(read('i18n/fr.json')).settings.groups.notifyDevices, 'Vos appareils');
  assert.equal(fr.requests, 'Demandes d’accès d’un nouvel appareil');
  assert.equal(fr.requestsText, 'Toujours activées : sans elles, un nouvel appareil ne peut pas être jumelé quand Benthic est fermé ici.');
  assert.equal(fr.requestsIos, 'Demandes d’accès');
  assert.equal(fr.always, 'Toujours');
  assert.equal(fr.refusedTitle, 'Notifications désactivées pour Benthic');
  assert.equal(fr.refusedText, 'Les demandes d’accès d’un nouvel appareil et les rappels n’apparaîtront qu’à l’ouverture de l’app.');
  assert.equal(fr.openAndroid, 'Ouvrir les réglages d’Android');
  assert.equal(fr.openIos, 'Ouvrir les Réglages de l’iPhone');
  assert.deepEqual(Object.keys(en).sort(), Object.keys(fr).sort());
  const settings = read('pages/Settings.svelte');
  assert.match(settings, /pushState\.view !== 'unsupported' && benthicPlusSubscriber\(\)/, '« Vos appareils » is for Benthic+ on a phone or a tablet');
  assert.match(settings, /pushState\.view === 'refused'[^\n]*NotifyRefusedBanner/);
  const host = read('components/AccountSyncHost.svelte');
  assert.match(host, /pushExplanationDue\(\)/);
  assert.match(host, /pushState\.asking && !flow\.screen/);
});

test('the Android notification texts are the app\'s, from string resources in French and English', () => {
  const res = (dir) => readFileSync(new URL(`../../plugins/benthic-core/android/src/main/res/${dir}/strings.xml`, import.meta.url), 'utf8');
  const fr = JSON.parse(read('i18n/fr.json')).accountSync.notify;
  const en = JSON.parse(read('i18n/en.json')).accountSync.notify;
  for (const [dir, text] of [['values-fr', fr], ['values', en]]) {
    const xml = res(dir);
    assert.ok(xml.includes(`<string name="bc_access_title">${text.title.replace('{name}', '%1$s')}</string>`), dir);
    assert.ok(xml.includes(`<string name="bc_access_body">${text.body.replace('{code}', '%1$s')}</string>`), dir);
  }
  assert.match(res('values-fr'), /bc_access_action">Répondre</);
});
