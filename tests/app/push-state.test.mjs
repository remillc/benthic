import test from 'node:test';
import assert from 'node:assert/strict';
import { pushLive, setPushLive, onPushLive } from '../../app/src/lib/push-state.js';

test('the live state tells its listeners once per change, and a listener that throws does not stop the others', () => {
  const seen = [];
  const debug = console.debug;
  console.debug = () => {};
  const off1 = onPushLive(() => {
    throw new Error('x');
  });
  const off2 = onPushLive((v) => seen.push(v));
  setPushLive(true);
  setPushLive(true);
  assert.equal(pushLive(), true);
  setPushLive(false);
  assert.deepEqual(seen, [true, false]);
  off1();
  off2();
  console.debug = debug;
});
