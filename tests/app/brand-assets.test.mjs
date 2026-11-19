// The Google and Apple marks of « Se connecter ou créer un compte » (task 2026-11-18-279): the providers' own files,
// kept as published, used by the one component, with the colours of their guidelines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../app/src/', import.meta.url));
const read = (p) => fs.readFileSync(root + p, 'utf8');

test('the brand assets are the providers\' files and the README names their sources', () => {
  const readme = read('assets/brands/README.md');
  assert.match(readme, /developers\.google\.com\/identity\/branding-guidelines/);
  assert.match(readme, /developer\.apple\.com\/design\/resources/);
  assert.match(readme, /Christian, 18 November 2026/);
  const g = read('assets/brands/google-g.svg');
  assert.match(g, /viewBox="0 0 24 24"/);
  for (const c of ['#4285F4', '#34A853', '#FBBC05', '#EA4335']) assert.ok(g.includes(c), c);
  const black = read('assets/brands/apple-logo-black.svg');
  const white = read('assets/brands/apple-logo-white.svg');
  assert.ok(!black.includes('fill='));
  // The white logo is the black file with the fill colour only.
  assert.equal(white, black.replace('<path d=', '<path fill="#FFFFFF" d='));
});

test('the sign-in buttons use the logos, not letter discs, and the provider colours come from tokens', () => {
  const plus = read('components/FirstLaunchBenthicPlus.svelte');
  assert.ok(!plus.includes('od-plus--disc'));
  assert.match(plus, /google-g\.svg\?raw/);
  assert.match(plus, /apple-logo-black\.svg/);
  assert.match(plus, /apple-logo-white\.svg/);
  const theme = read('theme.css');
  for (const token of ['--od-brand-google-bg: #FFFFFF', '--od-brand-google-border: #747775', '--od-brand-google-ink: #1F1F1F', '--od-brand-google-bg: #131314', '--od-brand-google-border: #8E918F', '--od-brand-google-ink: #E3E3E3']) {
    assert.ok(theme.includes(token), token);
  }
});

test('both logos are shown at 22 px high on the one connection screen used by phone, tablet and desktop', () => {
  const plus = read('components/FirstLaunchBenthicPlus.svelte');
  assert.match(plus, /od-plus--google-logo {[^}]*width: 22px;\s*height: 22px;/);
  assert.match(plus, /od-plus--apple-logo {[^}]*height: 22px;[^}]*width: auto;/);
  assert.match(read('theme.css'), /--od-brand-apple-bg: #000000;/);
});

test('the first step opens the connection screen on every device, and « Continuer sans compte » goes back', () => {
  const steps = read('lib/first-launch-steps.js');
  assert.match(steps, /'start:signIn': 'odplusConnect'/);
  assert.match(steps, /'odplusConnect:email': 'server'/);
  assert.match(read('components/FirstLaunchSteps.svelte'), /goBackTo\('start'\)/);
  assert.match(read('components/FirstLaunchSteps.svelte'), /go\('signIn'\)/);
});
