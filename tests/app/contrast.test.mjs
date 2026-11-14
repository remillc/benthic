// High contrast follows the system (task 2026-11-14-149).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HIGH_CONTRAST_LEVEL, isHighContrast } from '../../app/src/lib/contrast.js';

test('the media query alone turns it on', () => {
  assert.equal(isHighContrast(true, 0), true);
});

test('the Android contrast level: above 0.5 only', () => {
  assert.equal(HIGH_CONTRAST_LEVEL, 0.5);
  assert.equal(isHighContrast(false, 0), false);
  assert.equal(isHighContrast(false, 0.5), false, 'the medium level is not « more »');
  assert.equal(isHighContrast(false, 1), true);
  assert.equal(isHighContrast(false, -1), false, 'reduced contrast');
});
