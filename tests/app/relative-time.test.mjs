// Relative times never break inside (task 2026-11-14-159): their words are joined with
// non-breaking spaces by the helpers that format them, and by the texts built around them.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatShortAgo, formatTimeAgo, oneLine } from '../../app/src/lib/format.js';
import { t } from '../../app/src/lib/i18n.js';

test('the helpers give one unbreakable piece', () => {
  for (const text of [
    formatShortAgo('2026-11-14T10:00:00', '2026-11-14T10:02:00'),
    formatShortAgo('2026-11-14T07:00:00', '2026-11-14T10:00:00'),
    formatTimeAgo('2025-01-01T10:00:00'),
  ]) {
    assert.ok(!text.includes(' '), JSON.stringify(text));
  }
  assert.equal(oneLine('il y a 2 min'), 'il y a 2 min');
});

test('the texts built around a relative time keep it on one line', () => {
  assert.ok(!t('desaturation.ago', { time: '3 h' }).includes(' '), t('desaturation.ago', { time: '3 h' }));
});
