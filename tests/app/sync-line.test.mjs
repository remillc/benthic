// Task 2026-11-23-340: the sync progress line, its states and the band profile it runs on.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { SYNC_LINE, lineView, nextLinePhase } from '../../app/src/lib/sync-line.js';
import { BAND_PROFILE, bandProfileInPixels } from '../../app/src/lib/band-profile.js';

test('unknown progress: a quarter of the line slides; reduced motion: a still half-opaque line', () => {
  const moving = lineView('running', 0, false);
  assert.deepEqual([moving.mode, moving.dash, moving.opacity, moving.value], ['sliding', '25 101', 1, undefined]);
  const still = lineView('running', 0, true);
  assert.deepEqual([still.mode, still.dash, still.opacity, still.value], ['still', '100 101', 0.5, undefined]);
});

test('known progress: the line is drawn up to the fraction and says its percent', () => {
  const v = lineView('running', 0.6, false);
  assert.deepEqual([v.mode, v.dash, v.value, v.opacity], ['known', '60 101', 60, 1]);
  assert.match(v.transition, /stroke-dasharray 300ms/);
  assert.equal(lineView('running', 0.6, true).transition, 'none', 'reduced motion: no animated growth');
  assert.equal(lineView('running', 4, false).value, 100, 'never past the end');
});

test('done: completes in 0.6 s, stays 0.3 s, fades in 1.1 s, then nothing is left', () => {
  assert.deepEqual([SYNC_LINE.completeMs, SYNC_LINE.holdMs, SYNC_LINE.fadeMs, SYNC_LINE.passSeconds], [600, 300, 1100, 1.6]);
  const completing = lineView('completing', 0.3, false);
  assert.deepEqual([completing.dash, completing.groupOpacity, completing.value], ['100 101', 1, 100]);
  assert.match(completing.transition, /stroke-dasharray 600ms/);
  assert.equal(lineView('fading', 0.3, false).groupOpacity, 0);
  assert.equal(lineView('idle', 0.3, false).visible, false);
});

test('the phases: the end of a running exchange completes; failure or reduced motion removes the line', () => {
  assert.equal(nextLinePhase('idle', true), 'running');
  assert.equal(nextLinePhase('running', false), 'completing');
  assert.equal(nextLinePhase('running', false, { reduced: true }), 'idle');
  assert.equal(nextLinePhase('running', false, { failed: true }), 'idle');
  assert.equal(nextLinePhase('completing', true), 'running', 'a new exchange takes the line back');
  assert.equal(nextLinePhase('fading', true), 'running');
  assert.equal(nextLinePhase('completing', false), 'completing');
  assert.equal(nextLinePhase('idle', false), 'idle');
});

test('the band profile is the smoothed curve of the same box, and is scaled to pixels as x, y pairs', () => {
  assert.match(BAND_PROFILE, /^M0 30 C4 31\.6 11 30 20 38 .* C284 38 295 36\.8 300 36$/);
  assert.equal(BAND_PROFILE.split('C').length - 1, 13);
  const px = bandProfileInPixels(600, 34);
  assert.ok(px.startsWith('M0.00 7.29 C8.00 7.67 '), px.slice(0, 40));
  assert.ok(px.endsWith(' 600.00 8.74'), px.slice(-30));
  assert.equal(bandProfileInPixels(300, 140), BAND_PROFILE.replace(/-?\d+\.?\d*/g, (n) => Number(n).toFixed(2)));
});

test('every band that draws the profile uses the shared curve', () => {
  const read = (p) => readFileSync(new URL(`../../app/src/${p}`, import.meta.url), 'utf8');
  for (const file of ['components/BandBackdrop.svelte', 'components/SectionBand.svelte', 'components/NavMenu.svelte', 'components/FirstLaunchBand.svelte', 'components/FirstLaunchBenthicPlus.svelte', 'pages/WelcomeStartRelease.svelte']) {
    const source = read(file);
    assert.match(source, /band-profile\.js/, file);
    assert.doesNotMatch(source, /L20 38 L45 70/, `${file} still draws the old polyline`);
  }
});
