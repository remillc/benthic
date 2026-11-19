// The navigation trace (lib/nav-trace.js): a ring of the last events, as text for the development menu and packed for an error report.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { TRACE_EVENTS, clearTrace, onTrace, pathOf, setTraceClock, trace, traceEvents, traceLines, traceText } from '../../app/src/lib/nav-trace.js';

let t = 0;
beforeEach(() => {
  clearTrace();
  t = Date.UTC(2026, 10, 19, 10, 27, 42, 829);
  setTraceClock(() => t);
});

test('events are kept in order with their time, one per line', () => {
  trace('back', 'logbook from /dives/3');
  t += 54;
  trace('route', 'logbook /');
  assert.equal(traceText(), '10:27:42:829 back logbook from /dives/3\n10:27:42:883 route logbook /');
  assert.deepEqual(traceEvents().map((e) => e.type), ['back', 'route']);
});

test('the ring keeps the last events only', () => {
  for (let i = 0; i < TRACE_EVENTS + 25; i++) trace('nav', String(i));
  const events = traceEvents();
  assert.equal(events.length, TRACE_EVENTS);
  assert.equal(events[0].detail, '25');
  assert.equal(events[events.length - 1].detail, String(TRACE_EVENTS + 24));
});

test('a route is kept as its path: no query, no fragment', () => {
  assert.equal(pathOf('/statistics/dives/?title=Avec%20Marie&c=x'), '/statistics/dives/');
  assert.equal(pathOf('/dives/12#compte'), '/dives/12');
  assert.equal(pathOf(undefined), '');
});

test('the packed trace starts each line with « nav », holds several events a line and never passes the line length', () => {
  for (let i = 0; i < 60; i++) {
    trace('back', `logbook from /dives/${i}`);
    t += 120;
  }
  const lines = traceLines(300);
  assert.ok(lines.length < 20, `${lines.length} lines`);
  for (const line of lines) {
    assert.ok(line.startsWith('nav 10:2'), line);
    assert.ok(line.length <= 300, String(line.length));
  }
  assert.match(lines[0], /^nav 10:27:42:829 back logbook from \/dives\/0 \| \+120 back logbook from \/dives\/1 \|/);
  // Every event is there.
  assert.equal(lines.join(' | ').split('back logbook').length - 1, 60);
});

test('a listener hears each event, and its fault stops nothing', () => {
  const heard = [];
  const stop = onTrace((e) => heard.push(e.type));
  const stopBad = onTrace(() => {
    throw new Error('listener');
  });
  trace('nav', '/a');
  trace('back', '');
  stop();
  stopBad();
  trace('nav', '/b');
  assert.deepEqual(heard, ['nav', 'back']);
  assert.equal(traceEvents().length, 3);
});
