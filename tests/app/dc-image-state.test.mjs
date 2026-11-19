// The states of a computer photo on screen (tasks 2026-11-19-302 and 303): loading, failed, ready, and the retries.
import test from 'node:test';
import assert from 'node:assert/strict';
import { initialImageState, nextImageState, RETRY_MS } from '../../app/src/lib/dc-image-state.js';

const run = (events, state = initialImageState()) => events.reduce(nextImageState, state);

test('showing starts loading; a photo from the network arrives with a fade', () => {
  const s = run([{ type: 'show', now: 0 }]);
  assert.equal(s.phase, 'loading');
  const ready = nextImageState(s, { type: 'result', src: 'x://a', cached: false, now: 5 });
  assert.deepEqual([ready.phase, ready.src, ready.fade], ['ready', 'x://a', true]);
});

test('a photo the device already has shows directly, with no fade', () => {
  const s = run([{ type: 'show', now: 0 }, { type: 'result', src: 'x://a', cached: true, now: 1 }]);
  assert.deepEqual([s.phase, s.fade], ['ready', false]);
});

test('a failure keeps no photo; the same display does not ask again before the pause', () => {
  let s = run([{ type: 'show', now: 0 }, { type: 'result', src: null, cached: false, now: 10 }]);
  assert.deepEqual([s.phase, s.src], ['failed', null]);
  s = nextImageState(s, { type: 'show', now: 10 + RETRY_MS - 1 });
  assert.equal(s.phase, 'failed', 'no tight loop');
  s = nextImageState(s, { type: 'show', now: 10 + RETRY_MS });
  assert.equal(s.phase, 'loading', 'the next display after the pause asks again');
});

test('offline then online: the failed photo is asked again at once and then shows', () => {
  let s = run([{ type: 'show', now: 0 }, { type: 'result', src: null, cached: false, now: 1 }]);
  assert.equal(s.phase, 'failed');
  s = nextImageState(s, { type: 'online', now: 2 });
  assert.equal(s.phase, 'loading');
  s = nextImageState(s, { type: 'result', src: 'x://a', cached: false, now: 3 });
  assert.deepEqual([s.phase, s.fade], ['ready', true]);
});

test('online changes nothing for a photo that is loading or ready; a late result is ignored', () => {
  const loading = run([{ type: 'show', now: 0 }]);
  assert.equal(nextImageState(loading, { type: 'online', now: 1 }), loading);
  const ready = nextImageState(loading, { type: 'result', src: 'x://a', cached: true, now: 2 });
  assert.equal(nextImageState(ready, { type: 'online', now: 3 }), ready);
  assert.equal(nextImageState(ready, { type: 'result', src: null, cached: false, now: 4 }), ready);
  assert.equal(nextImageState(ready, { type: 'reset' }).phase, 'idle');
});
