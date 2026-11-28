import test from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_REPORT_KEYS, createDeviceReporter, deviceReport } from '../../app/src/lib/device-report.js';
import { createServerApi } from '../../app/src/lib/server-api.js';

const PIXEL = 'Mozilla/5.0 (Linux; Android 15; Pixel 8 Build/AP3A) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const REDUCED = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Benthic/0.3.0 Chrome/130.0.0.0 Electron/33.0.0 Safari/537.36';
const base = { appVersion: '0.3.0', edition: 'release' };

test('an Android phone: type, system, version, model, app version and edition, and nothing else', () => {
  const r = deviceReport({ ua: PIXEL, shortSide: 411, ...base });
  assert.deepEqual(r, { type: 'phone', os: 'android', osVersion: '15', model: 'Pixel 8', appVersion: '0.3.0', edition: 'beta' });
  assert.ok(Object.keys(r).every((k) => DEVICE_REPORT_KEYS.includes(k)));
});

test('an Android tablet is told by the shorter side of the screen; the model comes from the client hints when the user agent hides it', () => {
  const r = deviceReport({ ua: REDUCED, shortSide: 800, model: 'SM-X710', ...base });
  assert.equal(r?.type, 'tablet');
  assert.equal(r?.model, 'SM-X710');
  assert.equal(deviceReport({ ua: REDUCED, shortSide: 800, ...base })?.model, undefined, 'the reduced « K » is no model');
});

test('iPhone and iPad: the system version has dots, the model is the family', () => {
  assert.deepEqual(deviceReport({ ua: IPHONE, touchPoints: 5, navigatorPlatform: 'iPhone', ...base }), { type: 'phone', os: 'ios', osVersion: '18.1', model: 'iPhone', appVersion: '0.3.0', edition: 'beta' });
  assert.deepEqual(deviceReport({ ua: IPAD, touchPoints: 5, ...base }), { type: 'tablet', os: 'ios', osVersion: '18.1', model: 'iPad', appVersion: '0.3.0', edition: 'beta' });
});

test('the desktop app has no model; Windows 11 is read from the client hints, not the frozen user agent', () => {
  const r = deviceReport({ ua: WINDOWS, desktopPlatform: 'win32', platformVersion: '15.0.0', model: 'Surface', ...base });
  assert.deepEqual(r, { type: 'desktop', os: 'windows', osVersion: '11', appVersion: '0.3.0', edition: 'beta' });
  assert.equal(deviceReport({ ua: WINDOWS, desktopPlatform: 'win32', platformVersion: '10.0.0', ...base })?.osVersion, '10');
  assert.equal(deviceReport({ ua: WINDOWS, desktopPlatform: 'darwin', platformVersion: '14.5.0', ...base })?.os, 'macos');
  assert.equal(deviceReport({ ua: WINDOWS, desktopPlatform: 'linux', ...base })?.os, 'linux');
});

test('the alpha says alpha; the release edition is the beta until the public release', () => {
  assert.equal(deviceReport({ ua: PIXEL, shortSide: 411, appVersion: '0.2.0', edition: 'alpha' })?.edition, 'alpha');
  assert.equal(deviceReport({ ua: PIXEL, shortSide: 411, appVersion: '0.3.0', edition: 'release' })?.edition, 'beta');
});

test('what the device is never sends: no name given by the owner, no identifier, nothing else the page knows', () => {
  const r = deviceReport(/** @type {any} */ ({ ua: PIXEL, shortSide: 411, ...base, deviceName: 'Le téléphone de Marie', serial: 'R58M123', imei: '35', email: 'marie@example.org', logbook: 'x' }));
  assert.deepEqual(Object.keys(r ?? {}).sort(), ['appVersion', 'edition', 'model', 'os', 'osVersion', 'type']);
  assert.ok(!JSON.stringify(r).match(/Marie|R58M123|35|logbook/));
});

test('a system the server does not know sends nothing', () => {
  assert.equal(deviceReport({ ua: 'Mozilla/5.0 (X11; CrOS x86_64)', ...base }), null);
  assert.equal(deviceReport({ ua: '', ...base }), null);
});

/** A transport that records the requests and answers with `status`. */
function recorder(status = 204) {
  /** @type {any[]} */
  const calls = [];
  return { calls, transport: async (/** @type {any} */ req) => { calls.push(req); return { status, text: status === 204 ? '' : JSON.stringify({ error: { code: 'UNAUTHORIZED' } }) }; } };
}

test('the sync sends PUT /v1/session/device with the session and exactly the report', async () => {
  const { calls, transport } = recorder();
  const api = createServerApi({ baseUrl: 'https://server.test', transport });
  const device = /** @type {any} */ (deviceReport({ ua: PIXEL, shortSide: 411, ...base }));
  assert.equal(await api.reportDevice('t'.repeat(64), device), 'ok');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'PUT');
  assert.equal(calls[0].url, 'https://server.test/v1/session/device');
  assert.deepEqual(calls[0].headers, { Authorization: `Bearer ${'t'.repeat(64)}` });
  assert.deepEqual(calls[0].body, device);
});

test('the server saying the session ended (401) is told apart from a server that does not answer', async () => {
  const device = /** @type {any} */ (deviceReport({ ua: PIXEL, shortSide: 411, ...base }));
  assert.equal(await createServerApi({ baseUrl: 'https://s.test', transport: recorder(401).transport }).reportDevice('x', device), 'ended');
  assert.equal(await createServerApi({ baseUrl: 'https://s.test', transport: recorder(503).transport }).reportDevice('x', device), 'failed');
  assert.equal(await createServerApi({ baseUrl: 'https://s.test', transport: async () => { throw new Error('offline'); } }).reportDevice('x', device), 'failed');
});

test('the sign-in carries the device report; without one nothing extra is sent', async () => {
  const answer = { status: 200, text: JSON.stringify({ sessionToken: 'a'.repeat(64), user: { id: '1', email: 'm@example.org', isNew: false }, repository: { url: 'https://g/x.git', branch: 'main' }, git: { username: 'u', token: 't' } }) };
  /** @type {any[]} */
  const seen = [];
  const api = createServerApi({ baseUrl: 'https://s.test', transport: async (req) => { seen.push(req); return answer; } });
  const device = /** @type {any} */ (deviceReport({ ua: IPHONE, touchPoints: 5, ...base }));
  await api.verifyCode('m@example.org', '123456', device);
  await api.verifyCode('m@example.org', '123456');
  await api.signInApple({ idToken: 'i', nonce: 'n', device });
  assert.deepEqual(seen[0].body, { email: 'm@example.org', code: '123456', device });
  assert.deepEqual(seen[1].body, { email: 'm@example.org', code: '123456' });
  assert.deepEqual(seen[2].body, { identityToken: 'i', nonce: 'n', device });
});

test('local mode (no session) sends nothing, at any sync', async () => {
  let sent = 0;
  const r = createDeviceReporter({ send: async () => { sent++; return 'ok'; }, device: async () => ({ type: 'phone', os: 'android', osVersion: '15', appVersion: '0.3.0', edition: 'beta' }), sessionToken: async () => '' });
  assert.equal(await r.report(), 'skipped');
  assert.equal(await r.report({ force: true }), 'skipped');
  assert.equal(sent, 0);
});

test('a burst of syncs sends one report a minute; a forced one (desktop check) always goes', async () => {
  let clock = 0;
  let sent = 0;
  const r = createDeviceReporter({
    send: async () => { sent++; return 'ok'; }, now: () => clock,
    device: async () => ({ type: 'desktop', os: 'windows', osVersion: '11', appVersion: '0.3.0', edition: 'beta' }), sessionToken: async () => 'tok',
  });
  assert.equal(await r.report(), 'sent');
  clock = 10_000;
  assert.equal(await r.report(), 'skipped');
  assert.equal(await r.report({ force: true }), 'sent');
  clock = 80_000;
  assert.equal(await r.report(), 'sent');
  assert.equal(sent, 3);
});

test('a failed report is tried again at the next sync; a session the server ended is told to the app, which keeps its logbook', async () => {
  let outcome = /** @type {'ok'|'ended'|'failed'} */ ('failed');
  let ended = 0;
  const r = createDeviceReporter({
    send: async () => outcome, onEnded: () => { ended++; }, now: () => 0,
    device: async () => ({ type: 'phone', os: 'ios', osVersion: '18.1', appVersion: '0.3.0', edition: 'beta' }), sessionToken: async () => 'tok',
  });
  assert.equal(await r.report(), 'failed');
  outcome = 'ended';
  assert.equal(await r.report(), 'ended');
  assert.equal(ended, 1);
  const boom = createDeviceReporter({ send: async () => { throw new Error('x'); }, device: async () => null, sessionToken: async () => { throw new Error('no core'); } });
  assert.equal(await boom.report(), 'failed', 'never throws');
});
