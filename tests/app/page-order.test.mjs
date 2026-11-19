// The pages of a view stay in the order of its history (lib/page-order.js): a page loaded on the way back is put
// right before the current page in the view's component list, not first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keepPageOrder, placeBeforeCurrent } from '../../app/src/lib/page-order.js';

const el = (name) => ({ name, classList: { contains: (c) => name.split(' ').includes(c) } });

test('in a view that keeps its list, the page loaded on the way back goes right before the current page', () => {
  const list = { el: el('list') };
  const current = { el: el('plans page-current') };
  const loaded = { el: undefined };
  // Framework7-Svelte has just put the new entry first.
  const pages = [loaded, list, current];
  assert.equal(placeBeforeCurrent(pages, current.el), true);
  assert.deepEqual(pages, [list, loaded, current]);
});

test('nothing moves when the new page already is right before the current one, or when the current page is not known', () => {
  const current = { el: el('site page-current') };
  const loaded = { el: undefined };
  const simple = [loaded, current];
  assert.equal(placeBeforeCurrent(simple, current.el), false);
  assert.deepEqual(simple, [loaded, current]);
  const three = [loaded, current, { el: el('other') }];
  assert.equal(placeBeforeCurrent(three, current.el), false);
  const unknown = [loaded, { el: el('a') }, { el: el('b') }];
  assert.equal(placeBeforeCurrent(unknown, el('elsewhere')), false);
  assert.equal(placeBeforeCurrent(unknown, null), false);
  assert.deepEqual(unknown.map((p) => p.el?.name), [undefined, 'a', 'b']);
});

test('pages between the list and the current page keep their order', () => {
  const list = { el: el('list') };
  const a = { el: el('a') };
  const current = { el: el('b page-current') };
  const loaded = { el: undefined };
  const pages = [loaded, list, a, current];
  placeBeforeCurrent(pages, current.el);
  assert.deepEqual(pages, [list, a, loaded, current]);
});

test('only a page loaded on the way back is moved; the router’s own loader still runs', () => {
  const calls = [];
  const router = {
    el: { children: [] },
    pageComponentLoader(request) {
      calls.push(request.direction);
      return 'loaded';
    },
  };
  keepPageOrder(router);
  keepPageOrder(router);
  assert.equal(router.pageComponentLoader({ direction: 'forward' }), 'loaded');
  assert.equal(router.pageComponentLoader({ direction: 'backward' }), 'loaded');
  assert.deepEqual(calls, ['forward', 'backward'], 'wrapped once');
});
