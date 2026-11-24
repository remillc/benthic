// « Votre carnet est prêt » animation (task 2026-11-18-270): the sequence plays once, reduced motion shows the final
// state, the values of the mock-up, and the colours as tokens.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BUBBLES, CHECK_PATH, MORPH, WAVE_PATH, claimReadyMotion, resetReadyMotion } from '../../app/src/lib/ready-animation.js';

const root = new URL('../../app/src/', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('the sequence plays once: the first display plays it, coming back shows the end state', () => {
  resetReadyMotion();
  assert.deepEqual(claimReadyMotion(false), { play: true, bubbles: true, still: false });
  assert.deepEqual(claimReadyMotion(false), { play: false, bubbles: false, still: false });
  assert.deepEqual(claimReadyMotion(false), { play: false, bubbles: false, still: false });
});

test('reduced motion: no sequence, the bubbles stay still, and it does not use up the one play', () => {
  resetReadyMotion();
  assert.deepEqual(claimReadyMotion(true), { play: false, bubbles: true, still: true });
  assert.deepEqual(claimReadyMotion(false), { play: true, bubbles: true, still: false });
});

test('the wave and the check mark share their commands, and the morph runs from 1.3 s to 1.8 s of 2 s', () => {
  const commands = (d) => d.replace(/[-\d.\s]/g, '');
  assert.equal(commands(WAVE_PATH), commands(CHECK_PATH));
  assert.equal(WAVE_PATH, 'M5 13 Q8.5 10 12 13 Q15.5 16 19 13');
  assert.equal(CHECK_PATH, 'M5 12.5 Q7.25 14.75 9.5 17 Q14.25 12.25 19 7.5');
  assert.equal(MORPH.dur, '2s');
  assert.equal(MORPH.keyTimes, '0;0.65;0.9;1');
  assert.equal(MORPH.values.split(';').length, 4);
});

test('the bubbles: 1.6 to 2.5 s, the lowest the longest, at a constant speed, at different phases of the sway', () => {
  assert.equal(BUBBLES.length, 9);
  for (const b of BUBBLES) {
    assert.ok(b.duration >= 1500 && b.duration <= 2500, `duration ${b.duration}`);
    assert.ok(b.cy + b.dy < 0, 'leaves through the top');
  }
  const lowest = [...BUBBLES].sort((a, b) => b.cy - a.cy)[0];
  const highest = [...BUBBLES].sort((a, b) => a.cy - b.cy)[0];
  assert.ok(lowest.duration > highest.duration);
  assert.ok(new Set(BUBBLES.map((b) => b.phase)).size > 5);
});

test('the logo and the bubbles: the timings of the brief, on transform and opacity, colours as tokens', () => {
  const logo = read('components/BenthicPlusReadyLogo.svelte');
  assert.match(logo, /bc-ready-pop 2000ms linear 1 both/);
  assert.match(logo, /15% \{\s*transform: scale\(1\) rotate\(0deg\)/);
  assert.match(logo, /65% \{\s*transform: scale\(1\) rotate\(720deg\)/);
  assert.match(logo, /scale\(1\.14\)/);
  assert.match(logo, /scale\(0\.95\)/);
  assert.match(logo, /@keyframes bc-ready-ring/);
  assert.match(logo, /prefers-reduced-motion: reduce/);
  assert.match(logo, /<animate [^>]*attributeName="d"/);
  const bubbles = read('components/BenthicPlusReadyBubbles.svelte');
  assert.match(bubbles, /700ms ease-in-out var\(--phase\) 6 alternate/);
  assert.match(bubbles, /translate: -5px 0/);
  assert.match(bubbles, /translate: 5px 0/);
  assert.match(bubbles, /prefers-reduced-motion: reduce/);
  for (const [name, source] of [['logo', logo], ['bubbles', bubbles]]) {
    assert.doesNotMatch(source.replace(/\/\*[\s\S]*?\*\//g, ''), /#[0-9A-Fa-f]{3,8}\b|rgba?\(/, `${name}: no hard-coded colour`);
  }
  const theme = read('theme.css');
  for (const token of ['--bc-plus-ring', '--bc-plus-bubble', '--bc-plus-logo-shadow', '--bc-release-row-main: #1F5C99', '--bc-release-on-panel: #FFFFFF']) assert.ok(theme.includes(token), token);
});

test('the screen claims the motion when the step appears and draws the profile band above the wave', () => {
  const screen = read('components/FirstLaunchBenthicPlus.svelte');
  // The motion is decided in lib/ready-motion.svelte.js (shared with the blue panel of a tablet and the desktop).
  assert.match(screen, /claimReady\(\)/);
  assert.match(read('lib/ready-motion.svelte.js'), /claimReadyMotion\(\)/);
  assert.match(screen, /<BenthicPlusReadyLogo play=\{motion\.play\} \/>/);
  assert.match(screen, /bc-plus-hero--profile/);
  assert.match(screen, /bc-plus-hero--wave/);
});

