// The push channel only lives while the app is on screen (lib/push-front.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AWAY_GRACE_MS, createFrontGate } from '../../app/src/lib/push-front.js';

function gate(signedIn = true) {
  const calls = [];
  const timers = [];
  const state = { signedIn };
  const g = createFrontGate({
    start: () => calls.push('start'),
    stop: () => calls.push('stop'),
    resume: () => calls.push('resume'),
    wanted: () => state.signedIn,
    setTimer: (fn, ms) => timers.push({ fn, ms, live: true }) - 1,
    clearTimer: (i) => (timers[i].live = false),
  });
  const fire = () => timers.filter((t) => t.live).forEach((t) => ((t.live = false), t.fn()));
  return { g, calls, timers, fire, state };
}

test('the connection closes shortly after the app leaves the screen, and opens again when it comes back', () => {
  const { g, calls, timers, fire } = gate();
  g.follow();
  g.toBack();
  assert.deepEqual(calls, ['start'], 'still open during the short wait');
  assert.equal(timers[0].ms, AWAY_GRACE_MS);
  fire();
  assert.deepEqual(calls, ['start', 'stop']);
  assert.equal(g.away, true);
  g.toFront();
  assert.deepEqual(calls, ['start', 'stop', 'start']);
});

test('a brief absence keeps the connection: back before the wait ends only checks it', () => {
  const { g, calls, fire } = gate();
  g.follow();
  g.toBack();
  g.toFront();
  fire();
  assert.deepEqual(calls, ['start', 'resume']);
});

test('signing in while the app is away opens nothing until it is on screen; signed out, nothing opens at all', () => {
  const { g, calls, fire, state } = gate(false);
  g.follow();
  g.toBack();
  fire();
  state.signedIn = true;
  g.follow();
  assert.ok(!calls.includes('start'));
  g.toFront();
  assert.equal(calls.at(-1), 'start');
  state.signedIn = false;
  g.follow();
  assert.equal(calls.at(-1), 'stop');
  g.toBack();
  fire();
  g.toFront();
  assert.equal(calls.at(-1), 'stop', 'signed out: coming back opens nothing');
});

test('the wiring closes on pause only on a phone or a tablet; the desktop keeps its connection', () => {
  const src = readFileSync(new URL('../../app/src/lib/push-sync.svelte.js', import.meta.url), 'utf8');
  assert.match(src, /if \(Capacitor\.isNativePlatform\(\)\) \{\s*CapacitorApp\.addListener\('pause', \(\) => gate\.toBack\(\)\)/);
  assert.match(src, /addListener\('resume', \(\) => gate\.toFront\(\)\)/);
});

test('the push channel learns the local head without asking the core: reading the log again would renumber every dive', () => {
  const src = readFileSync(new URL('../../app/src/lib/logbook.svelte.js', import.meta.url), 'utf8').split('\r\n').join('\n');
  const body = src.slice(src.indexOf('export async function divesLocalHead()'));
  const fn = body.slice(0, body.indexOf('\n}\n') + 2);
  assert.doesNotMatch(fn, /BenthicCore\./, 'divesLocalHead never calls the core');
  assert.match(fn, /return knownHead;/);
});
