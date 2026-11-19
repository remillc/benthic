import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReport, clearLog, deviceFromUserAgent, describeError, dropReport, LOG_LINES, MAX_PENDING, NAV_LINES, noteLog, pendingReports,
  queueReport, recentLog, reportKey, reportText, sendReport,
} from '../../app/src/lib/error-report.js';

const info = { appVersion: '0.3.0', edition: /** @type {const} */ ('beta'), platform: 'android', osVersion: 'Android 15', device: 'Pixel 8' };

/** A store in memory, as the device store answers. */
function memoryStore() {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k), map };
}

test('a report keeps its fields, scrubbed, and carries no more than the contract', () => {
  const report = buildReport({
    kind: 'js',
    message: 'TypeError: cannot read x for marie@example.org',
    stack: "at f (/Users/marie/app/a.js:1:2)",
    route: '/dive/42?name=Blue Hole',
    log: ['12:00:00 error site at 43.296482, 5.369780'],
    info,
  });
  assert.deepEqual(Object.keys(report).sort(), ['appVersion', 'device', 'edition', 'kind', 'log', 'message', 'occurredAt', 'osVersion', 'platform', 'route', 'stack']);
  assert.equal(report.message, 'TypeError: cannot read x for [email]');
  assert.equal(report.stack, "at f (/Users/[user]/app/a.js:1:2)");
  assert.equal(report.route, '/dive/42');
  assert.deepEqual(report.log, ['12:00:00 error site at [coordinate], [coordinate]']);
  assert.ok(!Number.isNaN(Date.parse(report.occurredAt)));
  assert.ok(!JSON.stringify(report).includes('marie'));
});

test('the log is a ring of the last lines', () => {
  clearLog();
  for (let i = 0; i < LOG_LINES + 10; i++) noteLog('warn', `line ${i}`);
  const log = recentLog();
  assert.equal(log.length, LOG_LINES);
  assert.match(log[0], /line 10$/);
  noteLog('error', new TypeError('bad'), { a: 1 });
  assert.match(recentLog().at(-1), /error TypeError: bad \{"a":1\}$/);
  clearLog();
  assert.deepEqual(recentLog(), []);
});

test('the system and the model come from the user agent', () => {
  assert.deepEqual(deviceFromUserAgent('Mozilla/5.0 (Linux; Android 15; Pixel 8 Build/AP3A) AppleWebKit/537.36', 'android'), { osVersion: 'Android 15', device: 'Pixel 8' });
  assert.deepEqual(deviceFromUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)', 'ios'), { osVersion: 'iOS 17.4', device: 'iPhone' });
  assert.deepEqual(deviceFromUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Electron/33.2.0 Safari/537.36', 'desktop'), { osVersion: 'Windows NT 10.0', device: 'Electron/33.2.0' });
  assert.deepEqual(deviceFromUserAgent('curl/8', 'web'), { osVersion: '', device: '' });
});

test('whatever was thrown becomes a message and a stack', () => {
  const e = new RangeError('too far');
  assert.equal(describeError(e).message, 'RangeError: too far');
  assert.ok(describeError(e).stack.includes('too far'));
  assert.equal(describeError({ code: 'CORE_ERROR', message: 'x' }).message, 'CORE_ERROR: x');
  assert.equal(describeError('plain').message, 'plain');
  assert.equal(describeError({ a: 1 }).message, '{"a":1}');
});

test('the text shown is the report', () => {
  const report = buildReport({ kind: 'core', message: 'boom', stack: 'at x', route: '/sites/', log: ['l1'], occurredAt: '2026-11-19T10:00:00Z', info });
  const text = reportText(report);
  assert.match(text, /^version: 0\.3\.0 \(beta\)\nplatform: android, Android 15\ndevice: Pixel 8\npage: \/sites\/\ndate: 2026-11-19T10:00:00\.000Z\nkind: core\n\nboom\n\nat x\n\nl1$/);
});

test('the queue keeps a fault once, at most MAX_PENDING, and drops what was answered', () => {
  const store = memoryStore();
  const make = (m) => buildReport({ kind: 'js', message: m, info });
  assert.equal(queueReport(store, make('a')), true);
  assert.equal(queueReport(store, make('a')), false);
  for (const m of ['b', 'c', 'd', 'e', 'f']) queueReport(store, make(m));
  const list = pendingReports(store);
  assert.equal(list.length, MAX_PENDING);
  assert.equal(list[0].message, 'b');
  dropReport(store, make('b'));
  assert.equal(pendingReports(store).length, MAX_PENDING - 1);
  for (const r of pendingReports(store)) dropReport(store, r);
  assert.equal(store.map.size, 0);
  store.setItem('od.errorReports', 'not json');
  assert.deepEqual(pendingReports(store), []);
  assert.equal(reportKey(make('x')), reportKey(make('x')));
});

test('sending: sent, offline (kept) and refused (dropped)', async () => {
  const report = buildReport({ kind: 'js', message: 'boom', info });
  const calls = [];
  const answer = (status) => async (request) => (calls.push(request), { status, text: '{}' });
  assert.equal(await sendReport(report, { baseUrl: 'http://s', transport: answer(200) }), 'sent');
  assert.equal(calls[0].url, 'http://s/v1/error-reports');
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].body, report);
  assert.equal(calls[0].headers, undefined);
  assert.equal(await sendReport(report, { baseUrl: 'http://s', transport: answer(429) }), 'offline');
  assert.equal(await sendReport(report, { baseUrl: 'http://s', transport: answer(503) }), 'offline');
  assert.equal(await sendReport(report, { baseUrl: 'http://s', transport: answer(400) }), 'refused');
  assert.equal(await sendReport(report, { baseUrl: 'http://s', transport: answer(413) }), 'refused');
  assert.equal(await sendReport(report, { baseUrl: 'http://s', transport: async () => { throw new Error('network'); } }), 'offline');
  assert.equal(await sendReport(report, { baseUrl: '', transport: answer(200) }), 'offline');
});

test('a report carries the navigation trace after the log: scrubbed lines, at most NAV_LINES of them', () => {
  const nav = Array.from({ length: NAV_LINES + 5 }, (_, i) => `nav 10:27:42:${String(i).padStart(3, '0')} back logbook from /dives/${i} | +40 route logbook / (1)`);
  nav[nav.length - 1] = 'nav 10:27:50:000 route logbook /sites/ for marie@example.org';
  const report = buildReport({ kind: 'js', message: 'boom', log: ['12:00:00 route /dives/3'], nav, info });
  assert.equal(report.log.length, 1 + NAV_LINES);
  assert.equal(report.log[0], '12:00:00 route /dives/3');
  assert.ok(report.log.slice(1).every((line) => line.startsWith('nav ')));
  assert.equal(report.log[report.log.length - 1], 'nav 10:27:50:000 route logbook /sites/ for [email]');
  // The server takes up to 200 lines of 500 characters (docs/architecture.md, section 11.9).
  assert.ok(LOG_LINES + NAV_LINES <= 200);
  assert.ok(reportText(report).includes('nav 10:27:50:000'), 'the diver reads the trace before sending');
});
