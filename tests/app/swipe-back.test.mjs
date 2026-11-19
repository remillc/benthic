// The swipe back (lib/swipe-back.js) and the swipe that follows a finger (lib/swipe.js): when a swipe goes back, where
// the pages are, which touch may start one, and what happens when the system takes the touch away.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { swipeBackPages, swipeBackPlaces, swipeGoesBack } from '../../app/src/lib/swipe-back.js';
import { horizontalSwipe } from '../../app/src/lib/swipe.js';
import { parseGestureZone } from '../../app/src/lib/safe-area.js';
import { TAP_SLOP } from '../../app/src/lib/tap.js';

test('a released swipe goes back after a flick or past half of the width (Framework7’s rule)', () => {
  assert.equal(swipeGoesBack({ ms: 120, distance: 11, width: 390 }), true, 'a flick');
  assert.equal(swipeGoesBack({ ms: 120, distance: 10, width: 390 }), false, 'a flick too short');
  assert.equal(swipeGoesBack({ ms: 800, distance: 196, width: 390 }), true, 'slow, past half');
  assert.equal(swipeGoesBack({ ms: 800, distance: 195, width: 390 }), false, 'slow, half or less');
});

test('the pages follow the finger past the tap slop: beside each other on Android, a fifth of the way on iPhone', () => {
  assert.deepEqual(swipeBackPlaces({ dx: TAP_SLOP - 2, width: 390, ios: false }), { distance: 0, progress: 0, current: 0, previous: -390 });
  const md = swipeBackPlaces({ dx: TAP_SLOP + 100, width: 400, ios: false });
  assert.deepEqual(md, { distance: 100, progress: 0.25, current: 100, previous: -300 });
  const ios = swipeBackPlaces({ dx: TAP_SLOP + 100, width: 400, ios: true });
  assert.deepEqual(ios, { distance: 100, progress: 0.25, current: 100, previous: -60 });
  // Never past the edge of the view.
  assert.equal(swipeBackPlaces({ dx: 5000, width: 400, ios: true }).current, 400);
  assert.equal(swipeBackPlaces({ dx: 5000, width: 400, ios: true }).previous, 0);
});

/** A tiny document: elements with classes, a parent and children, enough for `closest` and the page order. */
function el(classes, children = []) {
  const node = {
    classList: { contains: (c) => classes.split(' ').includes(c) },
    children,
    parentElement: null,
    closest(selector) {
      const names = selector.split(',').map((s) => s.trim().replace(/^\./, ''));
      for (let n = node; n; n = n.parentElement) if (names.some((c) => n.classList.contains(c))) return n;
      return null;
    },
    querySelector: (selector) => node.children.find((c) => c.classList.contains(selector.replace(/^\./, ''))) ?? null,
    /** 4: `other` follows this node (enough for siblings in order). */
    compareDocumentPosition: (other) => (node.parentElement.children.indexOf(other) > node.parentElement.children.indexOf(node) ? 4 : 2),
  };
  for (const c of children) c.parentElement = node;
  return node;
}

function stack({ currentClasses = 'page page-current', rowClasses = 'row' } = {}) {
  const row = el(rowClasses);
  const master = el('page page-master page-previous page-master-stacked');
  const previous = el('page page-previous');
  const current = el(currentClasses, [row]);
  const viewEl = el('view', [master, previous, current]);
  return { viewEl, master, previous, current, row };
}

test('a swipe back starts from a touch on the current page, with the page just under it', () => {
  const { viewEl, previous, current, row } = stack();
  assert.deepEqual(swipeBackPages({ target: row, viewEl, busy: false, split: false, swipeoutOpen: false }), { current, previous });
});

test('no swipe back while the router is busy, on a page or an element marked no-swipeback, or with nothing underneath', () => {
  const { viewEl, row } = stack();
  assert.equal(swipeBackPages({ target: row, viewEl, busy: true, split: false, swipeoutOpen: false }), null);
  assert.equal(swipeBackPages({ target: row, viewEl, busy: false, split: false, swipeoutOpen: true }), null);
  const dive = stack({ currentClasses: 'page page-current no-swipeback' });
  assert.equal(swipeBackPages({ target: dive.row, viewEl: dive.viewEl, busy: false, split: false, swipeoutOpen: false }), null);
  const map = stack({ rowClasses: 'row no-swipeback' });
  assert.equal(swipeBackPages({ target: map.row, viewEl: map.viewEl, busy: false, split: false, swipeoutOpen: false }), null);
  const root = el('page page-current', [el('row')]);
  const rootView = el('view', [root]);
  assert.equal(swipeBackPages({ target: root.children[0], viewEl: rootView, busy: false, split: false, swipeoutOpen: false }), null);
});

test('no swipe back on the list or the detail of a pair shown side by side, nor from a page of another view', () => {
  const pane = stack({ currentClasses: 'page page-current page-master-detail' });
  assert.equal(swipeBackPages({ target: pane.row, viewEl: pane.viewEl, busy: false, split: true, swipeoutOpen: false }), null);
  assert.ok(swipeBackPages({ target: pane.row, viewEl: pane.viewEl, busy: false, split: false, swipeoutOpen: false }));
  const inner = stack();
  const outer = el('view', [el('page page-previous'), el('page page-current', [inner.viewEl])]);
  assert.equal(swipeBackPages({ target: inner.row, viewEl: outer, busy: false, split: false, swipeoutOpen: false }), null);
});

// --- The swipe that follows the finger ---

/** An event target that records its listeners; `fire` calls them. */
function target() {
  const listeners = {};
  return {
    listeners,
    addEventListener: (type, fn) => (listeners[type] ??= []).push(fn),
    removeEventListener: (type, fn) => (listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn)),
    fire: (type, event) => [...(listeners[type] ?? [])].forEach((fn) => fn(event)),
  };
}

function swipeFixture(handlers = {}) {
  const container = target();
  const touched = target();
  const calls = [];
  horizontalSwipe(container, {
    accept: () => true,
    move: (dx) => {
      calls.push(['move', dx]);
      return handlers.move?.(dx);
    },
    end: (dx) => calls.push(['end', dx]),
    ...(handlers.noCancel ? {} : { cancel: () => calls.push(['cancel']) }),
  });
  let t = 0;
  let prevented = 0;
  const event = (x, y = 100) => ({ target: touched, touches: [{ clientX: x, clientY: y }], timeStamp: (t += 16), cancelable: true, preventDefault: () => prevented++ });
  return {
    calls,
    touched,
    container,
    prevented: () => prevented,
    start: (x) => container.fire('touchstart', event(x)),
    move: (x, y) => touched.fire('touchmove', event(x, y)),
    end: () => touched.fire('touchend', { timeStamp: (t += 16) }),
    cancel: () => touched.fire('touchcancel', { timeStamp: (t += 16) }),
  };
}

test('a sideways swipe is followed to its end; the moves and the end are heard on the element touched', () => {
  const s = swipeFixture();
  s.start(100);
  s.move(130);
  s.move(160);
  s.end();
  assert.deepEqual(s.calls, [['move', 30], ['move', 60], ['end', 60]]);
  assert.equal(s.prevented(), 2);
  // Nothing is left listening on the element.
  assert.deepEqual([s.touched.listeners.touchmove.length, s.touched.listeners.touchend.length, s.touched.listeners.touchcancel.length], [0, 0, 0]);
  // The container hears the start; its move listener does nothing (it only tells the browser that moves may be held
  // back there). The end is never listened to on the container: an element that left the document still ends its swipe.
  assert.deepEqual(Object.keys(s.container.listeners).sort(), ['touchmove', 'touchstart']);
  const before = s.calls.length;
  s.container.fire('touchmove', { touches: [{ clientX: 300, clientY: 100 }], timeStamp: 999, cancelable: true, preventDefault() {} });
  assert.equal(s.calls.length, before);
});

test('the system takes the touch: `cancel` is called, not `end`', () => {
  const s = swipeFixture();
  s.start(100);
  s.move(140);
  s.cancel();
  assert.deepEqual(s.calls, [['move', 40], ['cancel']]);
  const old = swipeFixture({ noCancel: true });
  old.start(100);
  old.move(140);
  old.cancel();
  assert.deepEqual(old.calls, [['move', 40], ['end', 0]]);
});

test('a first move that is declined is not followed and keeps the page’s own scroll', () => {
  const s = swipeFixture({ move: () => false });
  s.start(100);
  s.move(60);
  s.move(20);
  s.end();
  assert.deepEqual(s.calls, [['move', -40]]);
  assert.equal(s.prevented(), 0);
});

test('a vertical move is the page’s scroll', () => {
  const s = swipeFixture();
  s.start(100);
  s.move(102, 160);
  s.move(160, 220);
  s.end();
  assert.deepEqual(s.calls, []);
});

test('a new touch while a swipe is followed ends it (a second finger, an end that never came)', () => {
  const s = swipeFixture();
  s.start(100);
  s.move(150);
  s.start(300);
  assert.deepEqual(s.calls, [['move', 50], ['cancel']]);
});

test('the system’s gesture zones are read from the native insets; a wrong value is no zone', () => {
  assert.deepEqual(parseGestureZone('{"top":24,"left":0,"gestureLeft":30,"gestureRight":30}'), { left: 30, right: 30 });
  assert.deepEqual(parseGestureZone({ gestureLeft: 0, gestureRight: 22.5 }), { left: 0, right: 22.5 });
  assert.deepEqual(parseGestureZone('{"top":24}'), { left: 0, right: 0 }, 'an older native side');
  assert.deepEqual(parseGestureZone({ gestureLeft: 400, gestureRight: -3 }), { left: 0, right: 0 });
  assert.deepEqual(parseGestureZone('not json'), { left: 0, right: 0 });
});
