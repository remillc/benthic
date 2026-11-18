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
  assert.match(read('assets/brands/google-g.svg'), /<mask id="mask0_/);
  assert.match(read('assets/brands/google-g.svg'), /viewBox="10 10 20 20"/);
  assert.match(read('assets/brands/apple-logo-black.svg'), /<title>Left Black Logo Medium<\/title>/);
  assert.match(read('assets/brands/apple-logo-white.svg'), /<title>Left White Logo Medium<\/title>/);
});

test('the sign-in buttons use the logos, not letter discs, and the provider colours come from tokens', () => {
  const plus = read('components/FirstLaunchOdPlus.svelte');
  assert.ok(!plus.includes('od-plus--disc'));
  assert.match(plus, /google-g\.svg\?raw/);
  assert.match(plus, /apple-logo-black\.svg/);
  assert.match(plus, /apple-logo-white\.svg/);
  const theme = read('theme.css');
  for (const token of ['--od-brand-google-bg: #FFFFFF', '--od-brand-google-border: #747775', '--od-brand-google-ink: #1F1F1F', '--od-brand-google-bg: #131314', '--od-brand-google-border: #8E918F', '--od-brand-google-ink: #E3E3E3']) {
    assert.ok(theme.includes(token), token);
  }
});

test('the first step opens the connection screen on every device, and « Continuer sans compte » goes back', () => {
  const steps = read('lib/first-launch-steps.js');
  assert.match(steps, /'start:signIn': 'odplusConnect'/);
  assert.match(steps, /'odplusConnect:email': 'server'/);
  assert.match(read('components/FirstLaunchSteps.svelte'), /goBackTo\('start'\)/);
  assert.match(read('components/FirstLaunchSteps.svelte'), /go\('signIn'\)/);
});
