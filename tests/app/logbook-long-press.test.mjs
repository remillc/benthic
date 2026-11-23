// Task 2026-11-23-341: a long press starts the selection while the finger is still down; the lift is ignored.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../../app/src/pages/Logbook.svelte', import.meta.url), 'utf8');
const pointerDown = src.slice(src.indexOf('function down(e)'), src.indexOf('function move(e)'));
const touchEnd = src.slice(src.indexOf('function touchEnd(e)'), src.indexOf('function touchCancel()'));

test('the 500 ms threshold is the long press', () => {
  assert.match(src, /const LONG_PRESS_MS = 500;/);
  assert.equal((pointerDown.match(/LONG_PRESS_MS/g) ?? []).length, 2, 'dive rows and trip rows');
});

test('the timer of a dive row starts the selection and gives the feedback', () => {
  assert.match(pointerDown, /if \(!selecting\) startSelection\(id\);/);
  assert.match(pointerDown, /checked\[id\] = true;/);
  assert.match(pointerDown, /longPressFeedback\(\)/);
});

test('the timer of a trip row selects the trip', () => {
  assert.match(pointerDown, /selectTrip\(pressedTrip\)/);
});

test('the lift decides nothing: no selection, no toggle in touchend', () => {
  assert.doesNotMatch(touchEnd, /startSelection|selectTrip|checked\[/);
});

test('the click that follows the press is dropped, and a move past 10 px before the threshold cancels the press', () => {
  assert.match(src, /if \(pressed\) \{\s*pressed = false;\s*e\.preventDefault\(\);/);
  assert.match(src, /Math\.hypot\(e\.clientX - startX, e\.clientY - startY\) > 10\) cancel\(\)/);
});
