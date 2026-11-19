// The navigation's health (lib/nav-health.js): when the page is looked at, what counts as broken or stuck, the repair
// and the report. The page itself is given by the test (a snapshot, as lib/nav-invariants.js reads it).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startNavHealth, STUCK_MS, tidyView } from '../../app/src/lib/nav-health.js';
import { clearTrace, trace, traceEvents } from '../../app/src/lib/nav-trace.js';

beforeEach(() => clearTrace());

const view = (more = {}) => ({
  id: 'view-logbook', classes: 'view tab tab-active', visible: true, current: '/', history: ['/'], allow: true, locks: 0, swiping: false,
  pages: [{ classes: 'page page-current', route: '/', transform: 'none', dx: 0 }],
  ...more,
});
const app = (v) => ({ hash: '', activeTabs: 1, orphanBackdrop: false, views: [v] });

/** The health check on a page the test changes, with a clock moved by hand. */
function fixture() {
  let t = 1000;
  /** @type {{ at: number, fn: Function, id: number }[]} */
  let timers = [];
  let ids = 0;
  const listeners = {};
  const state = { page: app(view()), reports: [], repairs: [] };
  const doc = {
    hidden: false,
    addEventListener: (type, fn) => (listeners[type] = fn),
    removeEventListener: () => {},
  };
  const health = startNavHealth({
    doc: /** @type {any} */ (doc),
    read: () => state.page,
    repair: (problems) => {
      state.repairs.push(problems);
      return 'tidied';
    },
    report: (message) => state.reports.push(message),
    clock: {
      setTimeout: (fn, ms) => {
        timers.push({ at: t + ms, fn, id: ++ids });
        return ids;
      },
      clearTimeout: (id) => (timers = timers.filter((x) => x.id !== id)),
      now: () => t,
    },
  });
  /** Moves the clock, running the timers that come due, in order. */
  const advance = (ms) => {
    const end = t + ms;
    for (;;) {
      const next = timers.filter((x) => x.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      timers = timers.filter((x) => x !== next);
      t = next.at;
      next.fn();
    }
    t = end;
  };
  return { state, health, advance, doc, touch: (type, n) => listeners[type]({ touches: { length: n } }) };
}

test('a sound page after a navigation: nothing is reported', () => {
  const { state, advance } = fixture();
  trace('route', 'logbook / (1)');
  advance(2000);
  assert.deepEqual(state.reports, []);
  assert.deepEqual(state.repairs, []);
});

test('the page is looked at once the events stop, not at each event', () => {
  const { state, advance } = fixture();
  state.page = app(view({ pages: [{ classes: 'page page-next', route: '/', transform: 'none', dx: 0 }] }));
  for (let i = 0; i < 5; i++) {
    trace('nav', '/x');
    advance(300);
  }
  assert.equal(state.repairs.length, 0, 'events keep coming: not yet');
  advance(700);
  assert.equal(state.repairs.length, 1);
});

test('a broken page at rest is written to the trace, repaired and reported once', () => {
  const { state, advance } = fixture();
  state.page = app(view({ current: '/dives/3' }));
  trace('route', 'logbook /dives/3 (2)');
  advance(800);
  assert.equal(state.repairs.length, 1);
  assert.match(state.reports[0], /^Navigation left in a broken state \(repaired\): view-logbook: the current page is \/, the router says \/dives\/3/);
  const types = traceEvents().map((e) => e.type);
  assert.deepEqual(types.slice(-2), ['broken', 'repair']);
  // Its own events do not start another look.
  advance(5000);
  assert.equal(state.repairs.length, 1);
});

test('pages that move are looked at again and left alone when they come to rest', () => {
  const { state, advance } = fixture();
  state.page = app(view({ classes: 'view tab tab-active router-transition-forward router-transition', allow: false }));
  trace('nav', '/dives/3');
  advance(1500);
  assert.equal(state.repairs.length, 0);
  state.page = app(view());
  advance(1000);
  assert.deepEqual(state.reports, []);
});

test('pages that move for STUCK_MS without a rest are stuck: repaired and reported', () => {
  const { state, advance } = fixture();
  state.page = app(view({ allow: false }));
  trace('nav', '/dives/3');
  advance(STUCK_MS);
  assert.equal(state.repairs.length, 0);
  advance(1500);
  assert.equal(state.repairs.length, 1);
  assert.match(state.reports[0], /still moving after 10 s on \/ \(closed\)/);
});

test('a look pushed back by a busy session proves nothing: the pages rested in between', () => {
  const { state, advance } = fixture();
  // Seen moving once (a swipe under the finger)...
  state.page = app(view({ locks: 1 }));
  trace('lock', 'logbook swipe-back');
  advance(750);
  // ...then at rest, but events keep pushing the look back for longer than STUCK_MS...
  state.page = app(view());
  for (let i = 0; i < 40; i++) {
    trace('nav', '/x');
    advance(300);
  }
  // ...and the next look lands on another swipe.
  state.page = app(view({ locks: 1 }));
  trace('lock', 'logbook swipe-back');
  advance(750);
  assert.deepEqual(state.reports, [], 'not stuck: nobody saw the pages move for 10 s');
  state.page = app(view());
  advance(1000);
  assert.deepEqual(state.reports, []);
});

test('while a finger holds the pages they are not stuck, however long', () => {
  const { state, advance, touch } = fixture();
  touch('touchstart', 1);
  state.page = app(view({ locks: 1 }));
  trace('lock', 'logbook swipe-back');
  advance(STUCK_MS * 3);
  assert.deepEqual(state.reports, []);
  // The finger is lifted and the swipe never ends: now it counts.
  touch('touchend', 0);
  advance(STUCK_MS + 1500);
  assert.equal(state.reports.length, 1);
});

test('nothing is looked at while the app is hidden, and at most three repairs a minute', () => {
  const { state, advance, doc } = fixture();
  state.page = app(view({ current: '/dives/3' }));
  doc.hidden = true;
  trace('route', 'x');
  advance(2000);
  assert.equal(state.repairs.length, 0);
  doc.hidden = false;
  for (let i = 0; i < 6; i++) {
    trace('route', 'x');
    advance(1000);
  }
  assert.equal(state.repairs.length, 3);
  assert.equal(traceEvents().filter((e) => e.type === 'broken').length, 6, 'each one is still written to the trace');
});

test('tidying a view removes what a page change or a swipe left behind and reopens the router', () => {
  const classes = (list) => {
    const set = new Set(list);
    return { remove: (...c) => c.forEach((x) => set.delete(x)), contains: (c) => set.has(c), [Symbol.iterator]: () => set[Symbol.iterator](), set };
  };
  const removed = [];
  const page = (list) => ({ classList: classes(list), style: { transform: 'translate3d(18px,0,0)', transition: 'transform 300ms' }, querySelectorAll: () => [] });
  const current = page(['page', 'page-current', 'page-swipeback-active', 'page-transitioning']);
  const next = page(['page', 'page-next']);
  const props = [];
  const router = {
    el: { classList: classes(['view', 'router-transition-backward', 'router-transition', 'od-pushing']), style: { removeProperty: (p) => props.push(p) }, children: [current, next, { classList: classes(['navbar']) }] },
    removePage: (el) => removed.push(el),
    odLocks: 2,
    swipeBackActive: true,
    odAnimating: true,
    allowPageChange: false,
  };
  tidyView(router);
  assert.deepEqual([...router.el.classList.set], ['view']);
  assert.deepEqual([...current.classList.set], ['page', 'page-current']);
  assert.deepEqual(current.style, { transform: '', transition: '' });
  assert.deepEqual(removed, [next]);
  assert.deepEqual([router.odLocks, router.swipeBackActive, router.odAnimating, router.allowPageChange], [0, false, false, true]);
  assert.equal(props.length, 3);
});

test('a fragment in the address is left to the tests: the app neither repairs nor reports it', () => {
  const { state, advance } = fixture();
  state.page = { ...app(view()), hash: '#compte' };
  trace('route', 'logbook / (1)');
  advance(2000);
  assert.deepEqual(state.reports, []);
  assert.deepEqual(state.repairs, []);
});
