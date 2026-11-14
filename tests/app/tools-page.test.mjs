// The Désaturation card of the Tools page (app/src/lib/tools-page.js, task 2026-11-14-122).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { desaturationState } from '../../app/src/lib/tools-page.js';

const dive = (date, minutes = 50) => ({ date, durationSeconds: minutes * 60 });

test('no dive in the logbook', () => {
  assert.deepEqual(desaturationState([], 'auto', '2026-11-14T12:00:00'), { kind: 'empty', remainingSeconds: 0, sinceSeconds: -1, share: 0 });
});

test('one dive 6 h ago: 12 h wait, 6 h left, half the bar', () => {
  // Surfaced at 06:00 (05:10 + 50 min), now 12:00.
  const s = desaturationState([dive('2026-11-14T05:10:00')], 'auto', '2026-11-14T12:00:00');
  assert.equal(s.kind, 'waiting');
  assert.equal(s.sinceSeconds, 6 * 3600);
  assert.equal(s.remainingSeconds, 6 * 3600);
  assert.equal(s.share, 0.5);
});

test('two dives the same day: 18 h counted from the last surfacing', () => {
  const s = desaturationState([dive('2026-11-14T08:00:00'), dive('2026-11-14T11:10:00')], 'auto', '2026-11-14T12:00:00');
  assert.equal(s.kind, 'waiting');
  assert.equal(s.sinceSeconds, 0);
  assert.equal(s.remainingSeconds, 18 * 3600);
  assert.equal(s.share, 0);
});

test('the fixed setting is followed', () => {
  const s = desaturationState([dive('2026-11-14T05:10:00')], '24', '2026-11-14T12:00:00');
  assert.equal(s.remainingSeconds, 18 * 3600);
  assert.equal(s.share, 0.25);
});

test('wait over, dive within 48 h: allowed, no bar', () => {
  const s = desaturationState([dive('2026-11-13T08:10:00')], 'auto', '2026-11-14T12:00:00');
  assert.deepEqual(s, { kind: 'allowed', remainingSeconds: 0, sinceSeconds: 27 * 3600, share: 0 });
});

test('no dive in the last 48 h: at rest', () => {
  assert.equal(desaturationState([dive('2026-11-12T11:00:00')], 'auto', '2026-11-14T12:00:00').kind, 'rest');
  // Exactly 48 h after surfacing still counts as recent.
  assert.equal(desaturationState([dive('2026-11-12T11:10:00')], 'auto', '2026-11-14T12:00:00').kind, 'allowed');
});

test('a dive dated in the future does not count', () => {
  assert.equal(desaturationState([dive('2026-11-20T09:00:00')], 'auto', '2026-11-14T12:00:00').kind, 'rest');
});

test('the dives are read in any order; the latest surfacing counts', () => {
  const s = desaturationState([dive('2026-11-14T09:00:00', 20), dive('2026-11-14T08:00:00', 150), dive('2026-10-01T09:00:00')], 'auto', '2026-11-14T12:00:00');
  // 08:00 + 150 min = 10:30, later than 09:20.
  assert.equal(s.sinceSeconds, 90 * 60);
  assert.equal(s.kind, 'waiting');
});
