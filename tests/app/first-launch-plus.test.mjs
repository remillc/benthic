// The new first step of the release edition (tasks 2026-11-17-263 and 264; mock-ups
// docs/mockups-release/*-premier-lancement-production*.dc.html): « Se connecter » with the OpenDives+ chip, the device,
// the import, then two text buttons; choice buttons with 24 dp corners and 48 dp tiles with 16 dp corners everywhere,
// 24 sp titles on tablet and desktop, the logo with a thin ring and no shadow. The screens need Framework7 and a
// WebView: their markup and CSS are read from the source; the real sizes were measured in a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../app/src/', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const steps = read('components/FirstLaunchSteps.svelte');
const row = read('components/ReleaseChoiceRow.svelte');
const langs = Object.fromEntries(['fr', 'en'].map((l) => [l, JSON.parse(read(`i18n/${l}.json`))]));

test('the three choices come in the order of the mock-up, « Se connecter » first and filled', () => {
  const start = steps.slice(steps.indexOf("{#if step === 'start'}"), steps.indexOf("step === 'new' || step === 'importNew'"));
  const order = ['welcomeSteps.signInTitle', 'welcomeSteps.localTitle', 'welcomeSteps.importTitle'].map((k) => start.indexOf(k));
  assert.ok(order.every((i) => i > 0) && order[0] < order[1] && order[1] < order[2], String(order));
  assert.match(start, /<ReleaseChoiceRow main prominent plus /);
  assert.equal([...start.matchAll(/<ReleaseChoiceRow /g)].length, 3);
  assert.equal(langs.fr.welcomeSteps.signInTitle, 'Se connecter');
  assert.equal(langs.fr.welcomeSteps.signInHelp, 'Ou créer un compte.');
  assert.equal(langs.fr.welcomeSteps.localHelp, 'Gardé ici, même sans réseau.');
  assert.equal(langs.fr.welcomeSteps.importHelp, 'Un fichier d’OpenDives ou d’une autre app, ou divelogs.de.');
  assert.equal(langs.fr.welcomeSteps.discoverPlus, 'Découvrir OpenDives+');
});

test('the two text buttons are centred, 40 dp high, 12 dp padding, 8 dp apart, 16 dp above and below', () => {
  const css = steps.slice(steps.indexOf('.od-first-launch--text-buttons {'));
  assert.match(css, /\.od-first-launch--text-buttons \{[^}]*align-self: center;[^}]*gap: 8px;[^}]*margin: 16px 0;/);
  assert.match(css, /\.od-first-launch--text-button \{[^}]*height: 40px;[^}]*padding: 0 12px;/);
  assert.match(css, /cursor: pointer/);
  assert.match(css, /&:hover:not\(:disabled\)/);
  assert.match(steps, /openOffer\(showSnackbar, t\)/);
  assert.match(steps, /openSignIn\(showSnackbar, t\)/);
});

test('every choice button has 24 dp corners and a 48 dp tile with 16 dp corners', () => {
  assert.match(row, /\.od-release-row \{[^}]*border-radius: 24px/);
  assert.match(row, /\.od-release-row--tile \{[^}]*width: 48px;[^}]*height: 48px;[^}]*border-radius: 16px/);
  assert.doesNotMatch(row, /border-radius: (20|14)px/);
});

test('tablet and desktop: 24 sp titles on 30, « Se connecter » larger (20 dp, 28 dp corners, 56 dp tile, 16 sp line)', () => {
  const at = row.indexOf('@media (min-width: 768px)');
  assert.ok(at > 0);
  const css = row.slice(at);
  assert.match(css, /\.od-release-row--title \{\s+font-size: 24px;\s+line-height: 30px;/);
  assert.match(css, /\.od-release-row--prominent \{\s+padding: 20px;\s+border-radius: 28px;/);
  assert.match(css, /width: 56px;\s+height: 56px;\s+border-radius: 18px/);
  assert.match(css, /\.od-release-row--help \{\s+font-size: 16px;\s+line-height: 22px/);
  assert.match(row, /\.od-release-row--title \{[^}]*font-weight: 600/);
});

test('the OpenDives+ chip is a small component with tokens only', () => {
  const chip = read('components/PlusChip.svelte');
  assert.match(chip, /class="od-plus-chip"/);
  assert.match(chip, /height: 24px;[^}]*padding: 0 10px 0 8px;[^}]*border-radius: 12px/);
  assert.match(chip, /var\(--od-release-plus-chip\)/);
  assert.doesNotMatch(chip.slice(chip.indexOf('<style>')), /#[0-9A-Fa-f]{3,6}\b|rgb\(/);
  assert.match(read('theme.css'), /--od-release-plus-chip: rgb\(255 255 255 \/ 0\.22\)/);
});

test('the logo on the band has a 1 dp ring at 30 % white and no shadow', () => {
  const page = read('pages/WelcomeStartRelease.svelte');
  assert.match(page, /border: 1px solid var\(--od-release-logo-ring\)/);
  assert.match(read('theme.css'), /--od-release-logo-ring: rgb\(255 255 255 \/ 0\.3\)/);
  assert.doesNotMatch(page, /drop-shadow|box-shadow: 0 [1-9]/);
});

test('the name steps end with « Créer le carnet » and « Importer le carnet »', () => {
  assert.match(steps, /\{t\('welcomeSteps\.importLogbook'\)\}/);
  assert.match(steps, /\{t\('welcomeSteps\.createLogbook'\)\}/);
  assert.equal(langs.fr.welcomeSteps.importLogbook, 'Importer le carnet');
  assert.equal(langs.fr.welcomeSteps.createLogbook, 'Créer le carnet');
});

test('the two OpenDives+ entries are named placeholders for task 265', () => {
  const plus = read('lib/release-plus.js');
  assert.match(plus, /export function openSignIn/);
  assert.match(plus, /export function openOffer/);
  assert.match(plus, /PLACEHOLDER for task 265/);
});
