// The router guard: Back is ignored while the view is held or changing page; a navigation waits and runs once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUSY_LIMIT, LOCK_LIMIT, dropPreviousPage, guardRouter, heldBack, heldNavigate, isBusy, lockRouter } from '../../app/src/lib/router-guard.js';
import { traceEvents } from '../../app/src/lib/nav-trace.js';

/** A router with the two calls recorded, and a clock the test moves by hand. */
function fixture() {
  const calls = [];
  const router = {
    allowPageChange: true,
    currentRoute: { url: '/a' },
    back: (...a) => calls.push(['back', ...a]),
    navigate: (...a) => calls.push(['navigate', ...a]),
  };
  const timers = [];
  let t = 0;
  guardRouter(router, { setTimeout: (fn) => timers.push(fn), now: () => t });
  const tick = (ms = 40) => {
    t += ms;
    timers.splice(0).forEach((fn) => fn());
  };
  return { router, calls, tick };
}

test('Back goes through when the router is free', () => {
  const { router, calls } = fixture();
  router.back({ animate: false });
  assert.deepEqual(calls, [['back', { animate: false }]]);
});

test('Back is ignored during a page change and while the router is held', () => {
  const { router, calls } = fixture();
  router.allowPageChange = false;
  router.back();
  router.allowPageChange = true;
  const release = lockRouter(router);
  router.back();
  assert.equal(calls.length, 0);
  release();
  release();
  router.back();
  assert.equal(calls.length, 1);
  assert.equal(isBusy(router), false);
});

test('the original methods bypass the hold, for the code that holds it', () => {
  const { router, calls } = fixture();
  lockRouter(router);
  router.odRaw.navigate('/b');
  assert.deepEqual(calls, [['navigate', '/b']]);
});

test('a navigation during a page change waits for its end, once, the latest address', () => {
  const { router, calls, tick } = fixture();
  router.allowPageChange = false;
  router.navigate('/b');
  router.navigate('/b');
  router.navigate('/c', { reloadDetail: true });
  tick();
  assert.equal(calls.length, 0);
  router.allowPageChange = true;
  tick();
  assert.deepEqual(calls, [['navigate', '/c', { reloadDetail: true }]]);
});

test('a waiting navigation to the page already shown does not run, and none waits for ever', () => {
  const { router, calls, tick } = fixture();
  router.allowPageChange = false;
  router.navigate('/a');
  router.allowPageChange = true;
  tick();
  assert.equal(calls.length, 0);
  router.allowPageChange = false;
  router.navigate('/z');
  tick(4000);
  router.allowPageChange = true;
  tick();
  assert.equal(calls.length, 0);
});

test('a waiting navigation is dropped when another page change went through first', () => {
  const { router, calls, tick } = fixture();
  router.allowPageChange = false;
  router.navigate('/b');
  // The page the navigation was asked from is left while it waits.
  router.currentRoute = { url: '/other' };
  router.allowPageChange = true;
  tick();
  assert.equal(calls.length, 0);
});

test('the code that holds the router navigates and goes back through its own doors', () => {
  const { router, calls } = fixture();
  const release = lockRouter(router, 'test');
  heldNavigate(router, '/b', { animate: false });
  heldBack(router, { animate: false });
  router.back();
  release();
  assert.deepEqual(calls, [['navigate', '/b', { animate: false }], ['back', { animate: false }]]);
});

test('Framework7 loading the page underneath ahead of time is not a Back: it is never ignored', () => {
  const { router, calls } = fixture();
  lockRouter(router, 'test')();
  const release = lockRouter(router, 'test');
  router.back('/a', { preload: true });
  release();
  assert.deepEqual(calls, [['back', '/a', { preload: true }]]);
});

test('a hold kept too long is released by itself', () => {
  const { router, calls } = fixture();
  const timers = [];
  lockRouter(router, 'lost touch', { setTimeout: (fn, ms) => timers.push([fn, ms]), clearTimeout: () => {} });
  router.back();
  assert.equal(calls.length, 0);
  assert.equal(timers[0][1], LOCK_LIMIT);
  timers[0][0]();
  assert.equal(isBusy(router), false);
  router.back();
  assert.equal(calls.length, 1);
  assert.ok(traceEvents().some((e) => e.type === 'lock-timeout'));
});

test('a router closed for too long with no page animation is reopened by the next Back', () => {
  const { router, calls, tick } = fixture();
  router.allowPageChange = false;
  tick(BUSY_LIMIT - 100);
  router.back();
  assert.equal(calls.length, 0);
  tick(200);
  router.back();
  assert.equal(calls.length, 1);
  assert.equal(router.allowPageChange, true);
  assert.ok(traceEvents().some((e) => e.type === 'busy-forced'));
});

test('a router closed while its page animation runs is left alone', () => {
  const { router, calls, tick } = fixture();
  router.allowPageChange = false;
  router.odAnimating = true;
  tick(BUSY_LIMIT + 1000);
  router.back();
  assert.equal(calls.length, 0);
});

/** A router with Framework7's `animate`, whose end the test decides. */
function animated() {
  const events = [];
  const listeners = new Map();
  const page = (name) => ({
    name,
    dispatchEvent: (e) => {
      events.push(`${name}:${e.type}`);
      listeners.get(name)?.();
    },
  });
  const oldPage = page('old');
  const newPage = page('new');
  const classes = new Set(['view']);
  const router = {
    allowPageChange: true,
    currentRoute: { url: '/a' },
    el: { id: 'view-logbook', classList: { remove: (...c) => c.forEach((x) => classes.delete(x)), [Symbol.iterator]: () => classes[Symbol.iterator]() } },
    back: () => {},
    navigate: () => {},
    /** As Framework7: adds the classes and waits for the end of one page's animation. */
    animate($old, $new, direction, transition, callback) {
      classes.add(`router-transition-${direction}`);
      classes.add('router-transition');
      listeners.set(direction === 'forward' ? 'new' : 'old', () => {
        classes.delete(`router-transition-${direction}`);
        classes.delete('router-transition');
        callback();
      });
    },
  };
  const timers = [];
  guardRouter(router, { setTimeout: (fn, ms) => timers.push([fn, ms]), clearTimeout: () => {}, now: () => 0 });
  return { router, timers, events, classes, oldPage, newPage, listeners };
}

test('a page animation that ends by itself: the watchdog does nothing', () => {
  const { router, timers, events, oldPage, newPage, listeners } = animated();
  let ended = 0;
  router.animate([oldPage], [newPage], 'forward', undefined, () => ended++);
  assert.equal(router.odAnimating, true);
  listeners.get('new')();
  assert.equal(ended, 1);
  assert.equal(router.odAnimating, false);
  timers[0][0]();
  assert.equal(ended, 1);
  assert.deepEqual(events, []);
});

test('a page animation that never ends is ended through Framework7’s own listener', () => {
  const { router, timers, events, classes, oldPage, newPage } = animated();
  let ended = 0;
  router.animate([oldPage], [newPage], 'backward', undefined, () => ended++);
  assert.ok(timers[0][1] >= 800, String(timers[0][1]));
  timers[0][0]();
  assert.equal(ended, 1);
  assert.deepEqual(events, ['old:animationend']);
  assert.equal(classes.has('router-transition-backward'), false);
  assert.ok(traceEvents().some((e) => e.type === 'anim-forced'));
});

test('a page animation whose listener is gone is ended by hand, its classes removed', () => {
  const { router, timers, classes, oldPage, newPage, listeners } = animated();
  let ended = 0;
  router.animate([oldPage], [newPage], 'forward', undefined, () => ended++);
  listeners.clear();
  timers[0][0]();
  assert.equal(ended, 1);
  assert.equal([...classes].some((c) => c.startsWith('router-transition')), false);
});

test('a page under the current one leaves the history, its props and the document', () => {
  const removed = [];
  const router = {
    history: ['/', '/dives/1', '/dives/2'],
    propsHistory: [{}, { a: 1 }, { b: 2 }],
    view: { history: [] },
    removePage: (el) => removed.push(el),
  };
  const page = { isConnected: true };
  assert.equal(dropPreviousPage(router, page), true);
  assert.deepEqual(router.history, ['/', '/dives/2']);
  assert.deepEqual(router.propsHistory, [{}, { b: 2 }]);
  assert.deepEqual(router.view.history, ['/', '/dives/2']);
  assert.deepEqual(removed, [page]);
  assert.equal(dropPreviousPage({ history: ['/'] }, page), false);
  assert.equal(dropPreviousPage(router, { isConnected: false }), false);
});
