// Todo 92: the touch ripple of a button must stay on the button.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (p) => readFileSync(new URL(`../../app/src/${p}`, import.meta.url), 'utf8');

function fakeEnv(position) {
  const style = {};
  class Fake {
    classList = { contains: () => false };
    style = style;
  }
  globalThis.HTMLElement = Fake;
  globalThis.getComputedStyle = () => ({ position });
  return new Fake();
}

test('a static button becomes the box of the wave: positioned, clipping, own stacking context', async () => {
  const { prepareRippleTarget } = await import('../../app/src/lib/ripple-fix.js');
  const el = fakeEnv('static');
  prepareRippleTarget(el);
  assert.deepEqual(el.style, { position: 'relative', overflow: 'hidden', isolation: 'isolate' });
});

test('a positioned element (map pin, Framework7 button) is left as it is', async () => {
  const { prepareRippleTarget } = await import('../../app/src/lib/ripple-fix.js');
  for (const position of ['absolute', 'relative', 'fixed', 'sticky']) {
    const el = fakeEnv(position);
    prepareRippleTarget(el);
    assert.deepEqual(el.style, {}, position);
  }
  prepareRippleTarget(null);
});

test('the fix is installed at start, before Framework7 handles touches (capture phase)', () => {
  assert.match(read('start.js'), /installRippleFix\(\);/);
  assert.match(read('lib/ripple-fix.js'), /capture: true/);
});
