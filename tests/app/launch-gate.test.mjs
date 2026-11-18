// The launch screen stays until the first real screen is ready (app/src/lib/launch.js), and the start screen is
// decided before the first paint (app/src/lib/logbook.svelte.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readyOrTimeout, markFirstScreenReady, LAUNCH_SAFETY_MS } from '../../app/src/lib/launch.js';

const read = (path) => readFileSync(new URL(`../../app/src/${path}`, import.meta.url), 'utf8');

test('the ready signal releases the launch screen', async () => {
  let done;
  const ready = new Promise((resolve) => (done = resolve));
  const outcome = readyOrTimeout(ready, 5000);
  done();
  assert.equal(await outcome, 'ready');
});

test('the safety timeout releases it when the first screen never says it is ready', async () => {
  assert.ok(LAUNCH_SAFETY_MS >= 1000 && LAUNCH_SAFETY_MS < 4000, 'shorter than the native limit (4 s)');
  assert.equal(await readyOrTimeout(new Promise(() => {}), 10), 'timeout');
});

test('marking the first screen ready twice is harmless', () => {
  markFirstScreenReady();
  markFirstScreenReady();
});

test('the first launch counts as shown from the first paint unless the logbook was started before', () => {
  const src = read('lib/logbook.svelte.js');
  assert.match(src, /function readWelcome\(\) \{\s*return readWelcomeState\(\) !== 'done';/);
  // An account found on this device on the very first start closes it again.
  assert.match(src, /const firstStart = readWelcomeState\(\) === null;\s*if \(logbook\.welcome && !firstStart\) return;/);
  assert.match(src, /logbook\.welcome = false;\s*writeWelcomeState\('done'\);/);
});

test('the first launch popup and the Logbook both tell that the first screen is ready', () => {
  const src = read('components/Welcome.svelte');
  assert.match(src, /onPopupOpened=\{markFirstScreenReady\}/);
  assert.match(src, /if \(!logbook\.welcome && !logbook\.welcomeHold\) markFirstScreenReady\(\)/);
});
