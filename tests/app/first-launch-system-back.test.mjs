// The system Back (Android key and gesture, iOS edge swipe) on the steps of the first launch (lib/first-launch-steps.js).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { enterCreate, enterOffer, systemBack } from '../../app/src/lib/first-launch-steps.js';

test('the first step sends the app to the background, or leaves when entered from the menu', () => {
  assert.deepEqual(systemBack(['start'], false), { kind: 'minimize' });
  assert.deepEqual(systemBack(['start'], true), { kind: 'leave' });
});

test('a step with a Retour goes one step back', () => {
  for (const stack of [['start', 'import'], ['start', 'new'], ['start', 'open', 'server', 'serverCode'], ['start', 'odplusConnect']]) {
    assert.deepEqual(systemBack(stack, false), { kind: 'back' }, stack.join('>'));
  }
});

test('from the menu, the OpenDives+ screens over the first screen leave the first launch', () => {
  assert.deepEqual(systemBack(['start', 'odplusConnect'], true), { kind: 'leave' });
  assert.deepEqual(systemBack(['start', 'odplusOffer'], true), { kind: 'leave' });
});

test('running work is cancelled with its own button', () => {
  assert.equal(systemBack(['start', 'import', 'importDivelogs', 'importProgress'], false).kind, 'cancel');
  assert.equal(systemBack(['start', 'open', 'server', 'serverCode', 'serverDownload'], false).kind, 'cancel');
  assert.equal(systemBack(['start', 'odplusConnect', 'server', 'createChoice', 'createSend'], false).kind, 'cancel');
});

test('the offer continues without a subscription', () => {
  assert.equal(systemBack(['start', 'odplusConnect', 'server', 'odplusOffer'], false).kind, 'without');
});

test('what was bought or created is not undone', () => {
  for (const step of ['odplusWelcome', 'odplusHealth', 'odplusReady', 'createInterrupted', 'createOffline']) {
    assert.equal(systemBack(['start', 'odplusOffer', step], false).kind, 'ignore', step);
  }
});

test('after a verified code, Back never returns to the spent code step', () => {
  const signedIn = ['start', 'odplusConnect', 'server', 'serverCode'];
  for (const stack of [enterCreate(signedIn), enterOffer(signedIn)]) {
    assert.ok(!stack.includes('serverCode'));
  }
  assert.deepEqual(enterCreate(signedIn), ['start', 'odplusConnect', 'server', 'createChoice']);
  assert.equal(systemBack(enterCreate(signedIn), false).kind, 'back');
});
