// SPDX-License-Identifier: GPL-2.0
// The desktop maintenance notifications (task 2026-11-19-308): shown at their time, a window's list replaced by the
// next one, a missed one dropped, the click given back to its window.
// Run: node --test tests/desktop/notifications.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createNotifier, LATE_MS } = require('../../desktop/notifications.cjs');

function setup() {
  const shown = [];
  const clicks = [];
  let clock = 1_000_000;
  class FakeNotification {
    static isSupported() {
      return true;
    }
    constructor(options) {
      this.options = options;
    }
    on(_event, handler) {
      this.click = handler;
    }
    show() {
      shown.push(this);
    }
  }
  const notifier = createNotifier({
    Notification: FakeNotification,
    now: () => clock,
    setInterval: () => 1,
    clearInterval: () => {},
    onClick: (windowId, extra) => clicks.push({ windowId, extra }),
  });
  return { notifier, shown, clicks, advance: (ms) => (clock += ms), at: () => clock };
}

test('a notification is shown when its time comes, once', () => {
  const { notifier, shown, advance, at } = setup();
  notifier.schedule(1, [{ id: 1, title: 'Entretien dans 30 jours : Apeks XTX50', body: 'Prévu', at: at() + 60_000, extra: { gearId: 'g' } }]);
  assert.equal(shown.length, 0);
  advance(60_000);
  notifier.check();
  assert.equal(shown.length, 1);
  assert.equal(shown[0].options.title, 'Entretien dans 30 jours : Apeks XTX50');
  notifier.check();
  assert.equal(shown.length, 1);
});

test('a new list replaces the window\'s previous one; another window keeps its own', () => {
  const { notifier, advance, at } = setup();
  notifier.schedule(1, [{ id: 1, title: 'a', at: at() + 10_000 }]);
  notifier.schedule(2, [{ id: 2, title: 'b', at: at() + 10_000 }]);
  notifier.schedule(1, [{ id: 3, title: 'c', at: at() + 10_000 }]);
  assert.deepEqual(notifier.pending(1), [3]);
  assert.deepEqual(notifier.pending(2), [2]);
  notifier.forget(2);
  assert.deepEqual(notifier.pending(2), []);
  advance(0);
});

test('a notification missed by hours is dropped, not shown late', () => {
  const { notifier, shown, advance, at } = setup();
  notifier.schedule(1, [{ id: 1, title: 'a', at: at() + 1000 }]);
  advance(1000 + LATE_MS + 1);
  notifier.check();
  assert.equal(shown.length, 0);
  assert.deepEqual(notifier.pending(1), []);
});

test('the click gives the extra back to the window that scheduled it', () => {
  const { notifier, shown, clicks, advance, at } = setup();
  notifier.schedule(7, [{ id: 1, title: 'a', at: at() + 1, extra: { gearId: 'g1', itemId: 'i1' } }]);
  advance(5);
  notifier.check();
  shown[0].click();
  assert.deepEqual(clicks, [{ windowId: 7, extra: { gearId: 'g1', itemId: 'i1' } }]);
});

test('bad entries are ignored', () => {
  const { notifier } = setup();
  notifier.schedule(1, [null, { title: 'x' }, { title: 'ok', at: Number.POSITIVE_INFINITY }, { id: 5, title: 'fine', at: 2_000_000 }]);
  assert.deepEqual(notifier.pending(1), [5]);
});
