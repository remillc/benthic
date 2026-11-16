// The OpenDives server screens of the release edition (tasks 2026-11-16-259 and 260): the API client and how it maps
// errors, the countdown and the disabled « Renvoyer le code », the code field's completeness, the order of the entry
// points, the address that a release build never takes from the development default, the steps and their order, the
// download of the repository and what is kept where. The screens are read from their source; the logic runs here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ServerError, createServerApi, errorFromResponse, plausibleEmail } from '../../app/src/lib/server-api.js';
import { allowedServerUrl, serverBaseUrl } from '../../app/src/lib/server-config.js';
import { serverUrl } from '../../app/src/lib/server-url.js';
import { codeScreen, entryRows, formatCountdown, lockMinutes, resendLeft } from '../../app/src/lib/server-signin.js';
import { codeComplete, sanitizeCode } from '../../app/src/lib/code-input.js';
import { back, forward, hasBack, nextStep } from '../../app/src/lib/first-launch-steps.js';
import { checkMarker, downloadServerLogbook, repositoryApi } from '../../app/src/lib/server-logbook.js';

const root = new URL('../../app/src/', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const langs = Object.fromEntries(['fr', 'en'].map((l) => [l, JSON.parse(read(`i18n/${l}.json`))]));
const BASE = 'https://server.example';

/** A transport that answers one scripted response per call and records the requests. */
function scripted(...responses) {
  const calls = [];
  const transport = async (request) => {
    calls.push(request);
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  return { transport, calls };
}
const json = (status, body) => ({ status, text: JSON.stringify(body) });
const apiWith = (...responses) => {
  const s = scripted(...responses);
  return { api: createServerApi({ baseUrl: BASE, transport: s.transport }), calls: s.calls };
};

// --- The API client and its errors ------------------------------------------------------------------------

test('the code request posts the address and reads the delays the server gives', async () => {
  const { api, calls } = apiWith(json(200, { ok: true, expiresInSeconds: 600, resendAfterSeconds: 30 }));
  assert.deepEqual(await api.requestCode(' diver@example.org '), { expiresInSeconds: 600, resendAfterSeconds: 30 });
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].url, `${BASE}/v1/auth/code`);
  assert.deepEqual(calls[0].body, { email: 'diver@example.org' });
});

test('the verification returns the session of the contract', async () => {
  const session = { sessionToken: 'a'.repeat(64), user: { id: '1', email: 'diver@example.org', isNew: true }, repository: { url: 'https://git.example/diver/logbook.git', branch: 'main' }, git: { username: 'diver', token: 'x' } };
  const { api, calls } = apiWith(json(200, session));
  assert.deepEqual(await api.verifyCode('diver@example.org', '123456'), session);
  assert.deepEqual(calls[0].body, { email: 'diver@example.org', code: '123456' });
  assert.equal(calls[0].url, `${BASE}/v1/auth/verify`);
});

test('every error code of the contract keeps its code; the lock carries its wait', async () => {
  const cases = [
    [400, 'INVALID_ADDRESS'],
    [400, 'WRONG_CODE'],
    [401, 'WRONG_CODE'],
    [410, 'CODE_EXPIRED'],
    [429, 'TOO_MANY_ATTEMPTS'],
    [429, 'RESEND_TOO_SOON'],
  ];
  for (const [status, code] of cases) {
    const { api } = apiWith(json(status, { error: { code, message: 'log only', retryAfterSeconds: 600 } }));
    await assert.rejects(api.verifyCode('a@b.c', '000000'), (e) => e instanceof ServerError && e.code === code && e.retryAfterSeconds === 600);
  }
});

test('a network failure, a 5xx, an unknown route or a body that is not JSON is « unreachable »', async () => {
  for (const response of [new Error('offline'), { status: 502, text: '<html>Bad gateway</html>' }, json(502, { error: { code: 'UNREACHABLE' } }), json(404, { error: { code: 'NOT_FOUND' } }), json(500, { error: { code: 'SERVER_ERROR' } }), { status: 200, text: 'not json' }]) {
    const { api } = apiWith(response);
    await assert.rejects(api.requestCode('a@b.c'), (e) => e instanceof ServerError && e.code === 'UNREACHABLE');
  }
});

test('without a server address nothing is sent and the server is unreachable', async () => {
  const s = scripted();
  const api = createServerApi({ baseUrl: '', transport: s.transport });
  await assert.rejects(api.requestCode('a@b.c'), (e) => e.code === 'UNREACHABLE');
  assert.equal(s.calls.length, 0);
  assert.equal(await api.reachable(), false);
});

test('the health check says whether the server answers', async () => {
  assert.equal(await apiWith(json(200, { status: 'ok', db: true, forgejo: true })).api.reachable(), true);
  assert.equal(await apiWith(new Error('down')).api.reachable(), false);
});

test('an unknown code in a body is told as unreachable, never invented', () => {
  assert.equal(errorFromResponse(400, { error: { code: 'SOMETHING_NEW' } }).code, 'UNREACHABLE');
  assert.equal(errorFromResponse(500, null).code, 'UNREACHABLE');
});

test('the address check is plain: a name, an @, a dotted domain', () => {
  for (const ok of ['vous@exemple.com', ' a.b@c.d.org ']) assert.equal(plausibleEmail(ok), true, ok);
  for (const bad of ['vous@exemple', 'vous', '@exemple.com', 'a b@c.d', 'a@.com', '']) assert.equal(plausibleEmail(bad), false, bad);
});

// --- The countdown and the buttons -------------------------------------------------------------------------

test('the countdown reads minutes and seconds, and counts down from the time the code was asked', () => {
  assert.equal(formatCountdown(42), '0:42');
  assert.equal(formatCountdown(30), '0:30');
  assert.equal(formatCountdown(9), '0:09');
  assert.equal(formatCountdown(61), '1:01');
  assert.equal(formatCountdown(-3), '0:00');
  assert.equal(resendLeft(30, 1000, 1000), 30);
  assert.equal(resendLeft(30, 1000, 13500), 18);
  assert.equal(resendLeft(30, 1000, 99999), 0);
});

test('« Renvoyer le code » is disabled during its countdown and comes back at zero; no message of its own', () => {
  const counting = codeScreen({ code: '', error: '', resendLeft: 42 });
  assert.equal(counting.resend, 'countdown');
  assert.equal(counting.resendDisabled, true);
  const ready = codeScreen({ code: '', error: '', resendLeft: 0 });
  assert.equal(ready.resend, 'link');
  assert.equal(ready.resendDisabled, false);
  // The screen never asks early: RESEND_TOO_SOON has no text.
  for (const lang of Object.values(langs)) assert.equal(JSON.stringify(lang.serverSteps).includes('TOO_SOON'), false);
  assert.match(read('components/FirstLaunchServer.svelte'), /RESEND_TOO_SOON/);
  assert.doesNotMatch(JSON.stringify(langs.fr.serverSteps), /trop tôt|too soon/i);
});

test('« Se connecter » stays disabled until the six digits are there', () => {
  for (const code of ['', '4', '48', '4829', '48291']) assert.equal(codeScreen({ code, error: '', resendLeft: 0 }).primaryDisabled, true, code);
  assert.equal(codeScreen({ code: '482913', error: '', resendLeft: 0 }).primaryDisabled, false);
  assert.equal(codeScreen({ code: '482913', error: '', resendLeft: 0, busy: true }).primaryDisabled, true);
  assert.equal(codeScreen({ code: '482913', error: 'WRONG_CODE', resendLeft: 0 }).primary, 'signIn');
});

test('the code field keeps digits only, at most six, and is complete at six', () => {
  assert.equal(sanitizeCode('482 913'), '482913');
  assert.equal(sanitizeCode('48-29-13-77'), '482913');
  assert.equal(codeComplete('48291'), false);
  assert.equal(codeComplete('482913'), true);
  assert.equal(codeComplete('48291a'), false);
});

test('an expired code asks for a new one; the lock disables it for the wait the server gave', () => {
  const expired = codeScreen({ code: '482913', error: 'CODE_EXPIRED', resendLeft: 0 });
  assert.deepEqual([expired.primary, expired.primaryDisabled, expired.resend], ['newCode', false, 'none']);
  const locked = codeScreen({ code: '', error: 'TOO_MANY_ATTEMPTS', resendLeft: 0 });
  assert.deepEqual([locked.primary, locked.primaryDisabled, locked.resend], ['newCode', true, 'none']);
  assert.equal(lockMinutes(600), 10);
  assert.equal(lockMinutes(61), 2);
  assert.equal(lockMinutes(5), 1);
  assert.equal(lockMinutes(undefined), 10);
});

test('the six boxes spread on the phone and stay together, 12 dp apart, on wide screens', () => {
  const server = read('components/FirstLaunchServer.svelte');
  assert.match(server, /gap=\{wide \? 12 : 8\}/);
  assert.match(server, /spread=\{!wide\}/);
  assert.match(server, /const wide = \$derived\(!layout\.phone\)/);
  const field = read('components/CodeField.svelte');
  assert.match(field, /space-between/);
  assert.match(field, /gap = 8, spread = false/);
});

// --- Entry points and steps ---------------------------------------------------------------------------------

test('the OpenDives server is the first and the only highlighted choice of both lists', () => {
  assert.deepEqual(entryRows('where').map((r) => r.key), ['server', 'cloud', 'git', 'device']);
  assert.deepEqual(entryRows('open').map((r) => r.key), ['server', 'cloud', 'git']);
  for (const list of ['where', 'open']) assert.deepEqual(entryRows(list).filter((r) => r.main).map((r) => r.key), ['server']);
  const steps = read('components/FirstLaunchSteps.svelte');
  assert.match(steps, /entryRows\('where'\)/);
  assert.match(steps, /entryRows\('open'\)/);
  // « Dans mon nuage » is an ordinary white row: it no longer carries `main`.
  assert.doesNotMatch(steps, /<ReleaseChoiceRow main icon="cloudUpload"/);
});

test('the server steps: e-mail, code, download; « Retour » goes back one; the download has none', () => {
  assert.equal(nextStep('where', 'server'), 'server');
  assert.equal(nextStep('open', 'server'), 'server');
  assert.equal(nextStep('server', 'code'), 'serverCode');
  assert.equal(nextStep('serverCode', 'session'), 'serverDownload');
  assert.equal(nextStep('server', 'offline'), 'serverOffline');
  assert.equal(nextStep('serverCode', 'offline'), 'serverOffline');
  assert.equal(nextStep('serverDownload', 'offline'), 'serverOffline');
  let stack = ['start', 'new', 'where'];
  for (const choice of ['server', 'code', 'session']) stack = forward(stack, choice);
  assert.deepEqual(stack, ['start', 'new', 'where', 'server', 'serverCode', 'serverDownload']);
  assert.equal(hasBack('serverDownload'), false);
  for (const step of ['server', 'serverCode', 'serverOffline']) assert.equal(hasBack(step), true);
  assert.deepEqual(back(['start', 'open', 'server', 'serverCode']), ['start', 'open', 'server']);
});

test('every text of the server screens is in fr and en, with the plural of the lock, and none is unused', () => {
  const used = new Set();
  const sources = ['components/FirstLaunchServer.svelte', 'components/FirstLaunchSteps.svelte'].map(read).join('\n');
  for (const m of sources.matchAll(/serverSteps\.(\w+)/g)) used.add(m[1]);
  for (const [lang, catalog] of Object.entries(langs)) {
    const keys = Object.keys(catalog.serverSteps);
    for (const key of used) {
      // The device-named texts exist in the four forms (tablet, Phone, Iphone, Desktop).
      assert.ok(key in catalog.serverSteps, `${lang}: ${key}`);
    }
    for (const key of keys) {
      const base = key.replace(/(Phone|Iphone|Desktop)$/, '');
      assert.ok(used.has(key) || used.has(base), `${lang}: ${key} is unused`);
    }
    for (const base of ['offlineHelp', 'progressCopy', 'downloaded']) for (const suffix of ['', 'Phone', 'Iphone', 'Desktop']) assert.ok(`${base}${suffix}` in catalog.serverSteps, `${lang}: ${base}${suffix}`);
    assert.equal(typeof catalog.serverSteps.tooManyAttempts, 'object');
  }
  assert.equal(langs.fr.serverSteps.tooManyAttempts.other, 'Trop d’essais. Vous pourrez demander un nouveau code dans {n} minutes.');
  assert.equal(langs.fr.serverSteps.resendIn, 'Renvoyer le code dans {time}');
});

// --- The server's address ------------------------------------------------------------------------------------

test('no address without configuration: a release build never ships a development default', () => {
  assert.equal(serverBaseUrl({}), '');
  assert.equal(serverBaseUrl({ configured: '   ' }), '');
  // The build's own default: under node:test there is no Vite environment, so no address at all.
  assert.equal(serverUrl(), '');
  // The development address is in one place, behind Vite's DEV constant, which a build replaces by false.
  const source = read('lib/server-url.js');
  assert.match(source, /import\.meta\.env\.DEV \? developmentUrl\(\) : ''/);
  const literals = source.match(/https?:\/\/[\d.]+:\d+/g) ?? [];
  assert.deepEqual(literals.sort(), ['http://10.0.2.2:8080', 'http://127.0.0.1:8080']);
  for (const file of ['lib/server-config.js', 'lib/server-api.js', 'lib/server-transport.js', 'components/FirstLaunchServer.svelte']) assert.doesNotMatch(read(file), /:8080/, file);
});

test('the configured address wins, the development one fills in only when given, an empty trailing slash goes', () => {
  assert.equal(serverBaseUrl({ configured: 'https://api.example.org/' }), 'https://api.example.org');
  assert.equal(serverBaseUrl({ configured: 'https://api.example.org', developmentUrl: 'http://127.0.0.1:8080' }), 'https://api.example.org');
  assert.equal(serverBaseUrl({ developmentUrl: 'http://10.0.2.2:8080' }), 'http://10.0.2.2:8080');
});

test('only https, or http to this machine, is allowed; credentials in an address are refused', () => {
  for (const ok of ['https://api.example.org', 'http://10.0.2.2:8080', 'http://127.0.0.1:8080', 'http://localhost:8080']) assert.equal(allowedServerUrl(ok), true, ok);
  for (const bad of ['http://api.example.org', 'http://192.168.1.20:8080', 'ftp://x', 'https://user:pw@api.example.org', 'not an address', '']) assert.equal(allowedServerUrl(bad), false, bad);
  assert.equal(serverBaseUrl({ configured: 'http://api.example.org' }), '');
});

test('the Android debug build allows clear text to the development server only; the main manifest does not', () => {
  const debug = readFileSync(new URL('../../app/android/app/src/debug/res/xml/network_security_config_debug.xml', import.meta.url), 'utf8');
  assert.deepEqual([...debug.matchAll(/<domain [^>]*>([^<]+)</g)].map((m) => m[1]), ['10.0.2.2', '127.0.0.1']);
  assert.match(readFileSync(new URL('../../app/android/app/src/debug/AndroidManifest.xml', import.meta.url), 'utf8'), /networkSecurityConfig="@xml\/network_security_config_debug"/);
  const main = readFileSync(new URL('../../app/android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');
  assert.doesNotMatch(main, /usesCleartextTraffic|networkSecurityConfig/);
});

// --- What is kept, and where ---------------------------------------------------------------------------------

test('the session goes to the plugin\'s secure storage, never to the device store or localStorage', () => {
  const server = read('components/FirstLaunchServer.svelte');
  assert.match(server, /OpenDivesCore\.serverSessionSave/);
  for (const file of ['components/FirstLaunchServer.svelte', 'lib/server-api.js', 'lib/server-logbook.js', 'lib/server-transport.js', 'lib/server-signin.js']) {
    assert.doesNotMatch(read(file), /localStorage|deviceStore|device-store|sessionStorage/, file);
  }
  const kotlin = readFileSync(new URL('../../plugins/opendives-core/android/src/main/java/org/opendives/core/ServerSessionStore.kt', import.meta.url), 'utf8');
  assert.match(kotlin, /SealedFile/);
  assert.match(kotlin, /tokens=\*\*\*/);
  const swift = readFileSync(new URL('../../plugins/opendives-core/ios/Plugin/CredentialStore.swift', import.meta.url), 'utf8');
  assert.match(swift, /ServerSessionStore/);
  const bridge = readFileSync(new URL('../../desktop/bridge.cjs', import.meta.url), 'utf8');
  assert.match(bridge, /server: 'server-session\.bin'/);
});

// --- The download ---------------------------------------------------------------------------------------------

test('the repository address gives the git host\'s API address', () => {
  assert.equal(repositoryApi('https://git.example/diver/logbook.git'), 'https://git.example/api/v1/repos/diver/logbook');
  assert.equal(repositoryApi('http://127.0.0.1:3000/demo1/logbook.git'), 'http://127.0.0.1:3000/api/v1/repos/demo1/logbook');
  assert.equal(repositoryApi('https://git.example/only-one'), null);
  assert.equal(repositoryApi('nonsense'), null);
});

test('the marker tells a logbook the app can read, a newer one and something else', () => {
  assert.equal(checkMarker({ format: 1, kind: 'opendives-logbook', minReader: 1 }), 'ok');
  assert.equal(checkMarker({ format: 2, kind: 'opendives-logbook', minReader: 2 }), 'newer');
  assert.equal(checkMarker({ format: 1, kind: 'other' }), 'notALogbook');
  assert.equal(checkMarker(null), 'notALogbook');
});

test('the download lists the branch, fetches the small files with the git token and reports each one', async () => {
  const files = {
    'opendives.json': { format: 1, kind: 'opendives-logbook', minReader: 1 },
    'dives/ab/ab12/dive.json': { id: 'ab12' },
    'dives/ab/ab12/profile.json': { big: true },
    'dives/cd/cd34/dive.json': { id: 'cd34' },
    'sites/s1.json': { id: 's1' },
  };
  const requests = [];
  const transport = async (request) => {
    requests.push(request);
    const url = new URL(request.url);
    if (url.pathname.endsWith('/git/trees/main')) return json(200, { tree: Object.keys(files).map((path) => ({ path, type: 'blob' })).concat([{ path: 'dives', type: 'tree' }]), truncated: false });
    const path = decodeURIComponent(url.pathname.split('/raw/')[1]);
    return json(200, files[path]);
  };
  const progress = [];
  const result = await downloadServerLogbook({ transport, repositoryUrl: 'https://git.example/diver/logbook.git', branch: 'main', token: 'secret', onProgress: (d, t) => progress.push([d, t]) });
  assert.deepEqual({ ...result }, { marker: 'ok', dives: 2, sites: 1, trips: 0, openable: false });
  assert.deepEqual(progress[0], [0, 4]);
  assert.deepEqual(progress.at(-1), [4, 4]);
  assert.ok(requests.every((r) => r.headers.Authorization === 'token secret'));
  // The samples wait until a dive is opened.
  assert.ok(!requests.some((r) => r.url.includes('profile.json')));
});

test('an empty repository is an empty answer; a failing server is unreachable; a cancelled download stops', async () => {
  const empty = async () => ({ status: 409, text: '{}' });
  assert.equal((await downloadServerLogbook({ transport: empty, repositoryUrl: 'https://git.example/a/b.git', branch: 'main', token: 't' })).marker, 'empty');
  const down = async () => ({ status: 502, text: '' });
  await assert.rejects(downloadServerLogbook({ transport: down, repositoryUrl: 'https://git.example/a/b.git', branch: 'main', token: 't' }), /UNREACHABLE/);
  const files = async (request) => (request.url.includes('/git/trees/') ? json(200, { tree: [{ path: 'opendives.json', type: 'blob' }] }) : json(200, {}));
  await assert.rejects(downloadServerLogbook({ transport: files, repositoryUrl: 'https://git.example/a/b.git', branch: 'main', token: 't', cancelled: () => true }), /CANCELLED/);
});
