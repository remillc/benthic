// The router guard: Back is ignored while the view is held or changing page; a navigation waits and runs once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guardRouter, lockRouter, isBusy } from '../../app/src/lib/router-guard.js';

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
