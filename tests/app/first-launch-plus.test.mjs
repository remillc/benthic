// The new first step of the release edition (tasks 2026-11-17-263 and 264; mock-ups
// docs/mockups-release/*-premier-lancement-production*.dc.html): « Se connecter » with the Benthic+ chip, the device,
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
  const start = steps.slice(steps.indexOf("{:else if step === 'start'}"), steps.indexOf("step === 'new' || step === 'importNew'"));
  const order = ['welcomeSteps.signInTitle', 'welcomeSteps.localTitle', 'welcomeSteps.importTitle'].map((k) => start.indexOf(k));
  assert.ok(order.every((i) => i > 0) && order[0] < order[1] && order[1] < order[2], String(order));
  assert.match(start, /<ReleaseChoiceRow main prominent plus /);
  assert.equal([...start.matchAll(/<ReleaseChoiceRow /g)].length, 3);
  assert.equal(langs.fr.welcomeSteps.signInTitle, 'Se connecter');
  assert.equal(langs.fr.welcomeSteps.signInHelp, 'Ou créer un compte.');
  assert.equal(langs.fr.welcomeSteps.localHelp, 'Gardé ici, même sans réseau.');
  assert.equal(langs.fr.welcomeSteps.importStartHelp, 'Un fichier de Benthic ou d’une autre app, ou divelogs.de.');
  assert.equal(langs.fr.welcomeSteps.discoverPlus, 'Découvrir Benthic+');
});

test('the two text buttons are centred, 40 dp high, 12 dp padding, 8 dp apart, 16 dp above and below', () => {
  const css = steps.slice(steps.indexOf('.bc-first-launch--text-buttons {'));
  assert.match(css, /\.bc-first-launch--text-buttons \{[^}]*align-self: center;[^}]*gap: 8px;[^}]*margin: 16px 0;/);
  assert.match(css, /\.bc-first-launch--text-button \{[^}]*height: 40px;[^}]*padding: 0 12px;/);
  assert.match(css, /cursor: pointer/);
  assert.match(css, /&:hover:not\(:disabled\)/);
  assert.match(steps, /onclick=\{\(\) => go\('discover'\)\}/);
  assert.match(steps, /onclick=\{\(\) => go\('signIn'\)\}/);
});

test('every choice button has 24 dp corners and a 48 dp tile with 16 dp corners', () => {
  assert.match(row, /\.bc-release-row \{[^}]*border-radius: 24px/);
  assert.match(row, /\.bc-release-row--tile \{[^}]*width: 48px;[^}]*height: 48px;[^}]*border-radius: 16px/);
  assert.doesNotMatch(row, /border-radius: (20|14)px/);
});

test('tablet and desktop: 24 sp titles on 30, « Se connecter » larger (20 dp, 28 dp corners, 56 dp tile, 16 sp line)', () => {
  const at = row.indexOf('@media (min-width: 768px)');
  assert.ok(at > 0);
  const css = row.slice(at);
  assert.match(css, /\.bc-release-row--title \{\s+font-size: 24px;\s+line-height: 30px;/);
  assert.match(css, /\.bc-release-row--prominent \{\s+padding: 20px;\s+border-radius: 28px;/);
  assert.match(css, /width: 56px;\s+height: 56px;\s+border-radius: 18px/);
  assert.match(css, /\.bc-release-row--help \{\s+font-size: 16px;\s+line-height: 22px/);
  assert.match(row, /\.bc-release-row--title \{[^}]*font-weight: 600/);
});

test('the Benthic+ chip is a small component with tokens only', () => {
  const chip = read('components/BenthicPlusChip.svelte');
  assert.match(chip, /class="bc-plus-chip"/);
  assert.match(chip, /height: 24px;[^}]*padding: 0 10px 0 8px;[^}]*border-radius: 12px/);
  assert.match(chip, /var\(--bc-plus-chip\)/);
  assert.doesNotMatch(chip.slice(chip.indexOf('<style>')), /#[0-9A-Fa-f]{3,6}\b|rgb\(/);
  assert.match(read('theme.css'), /--bc-plus-chip: rgb\(255 255 255 \/ 0\.22\)/);
});

test('the logo on the band has a 1 dp ring at 30 % white and no shadow', () => {
  const page = read('pages/WelcomeStartRelease.svelte');
  assert.match(page, /border: 1px solid var\(--bc-release-logo-ring\)/);
  assert.match(read('theme.css'), /--bc-release-logo-ring: rgb\(255 255 255 \/ 0\.3\)/);
  assert.doesNotMatch(page, /drop-shadow|box-shadow: 0 [1-9]/);
});

test('the name steps end with « Créer le carnet » and « Importer le carnet »', () => {
  assert.match(steps, /\{t\('welcomeSteps\.importLogbook'\)\}/);
  assert.match(steps, /\{t\('welcomeSteps\.createLogbook'\)\}/);
  assert.equal(langs.fr.welcomeSteps.importLogbook, 'Importer le carnet');
  assert.equal(langs.fr.welcomeSteps.createLogbook, 'Créer le carnet');
});

// Task 2026-11-19-309, point 4: the tile no longer names the battery (task 308 dropped it) but the vest, the piece that does need a yearly check.
test('the offer has a full-width « Service reminders » tile under the four tiles, in the maintenance colours', () => {
  const plus = read('components/FirstLaunchBenthicPlus.svelte');
  const css = read('theme.css');
  const offer = plus.slice(plus.indexOf("{:else if step === 'odplusOffer'}"), plus.indexOf("{:else if step === 'odplusReady'}"));
  assert.ok(offer.indexOf('bc-plus--cards') < offer.indexOf('bc-plus--card-maintenance'));
  assert.ok(offer.indexOf('bc-plus--card-maintenance') < offer.indexOf('priceBlock'));
  assert.match(offer, /name="bell"/);
  assert.match(plus, /\.bc-plus--card-maintenance \{\s*background: var\(--bc-maintenance\);/);
  assert.equal(langs.fr.odplus.offer.maintenance, 'Rappels d’entretien');
  assert.equal(langs.fr.odplus.offer.maintenanceText, 'Détendeur, bouteille, veste : prévenu 30 jours avant l’échéance.');
  assert.equal(langs.en.odplus.offer.maintenance, 'Service reminders');
  assert.equal(langs.en.odplus.offer.maintenanceText, 'Regulator, cylinder, vest: notified 30 days before they are due.');
  // Light, then dark.
  assert.match(css, /--bc-maintenance: #F6E3E0;\s*--bc-maintenance-icon: #8A2A1F;/);
  assert.match(css, /--bc-maintenance: #4A2723;\s*--bc-maintenance-icon: #F0A59B;/);
});

// --- « Tout ce qui est inclus » (task 2026-11-19-295) ---------------------------------------------------------------

test('the offer opens « Tout ce qui est inclus », which goes back to the offer and keeps the system Back working', async () => {
  const { forward, back, systemBack, hasBack } = await import('../../app/src/lib/first-launch-steps.js');
  assert.deepEqual(forward(['start', 'odplusOffer'], 'all'), ['start', 'odplusOffer', 'odplusAll']);
  assert.deepEqual(back(['start', 'odplusOffer', 'odplusAll']), ['start', 'odplusOffer']);
  assert.equal(hasBack('odplusAll'), true);
  assert.equal(systemBack(['start', 'odplusOffer', 'odplusAll'], false).kind, 'back');
  assert.equal(systemBack(['start', 'odplusOffer', 'odplusAll'], true).kind, 'back', 'from the account sheet too: the offer comes back first');
  assert.equal(systemBack(['start', 'odplusOffer'], true).kind, 'leave', 'the offer still returns to the account sheet');
});

test('the list shows only the features that are built, in the four groups of the mock-up', async () => {
  const { INCLUDED, includedGroups } = await import('../../app/src/lib/benthic-plus.js');
  assert.deepEqual(INCLUDED.map((g) => g.key), ['carnet', 'profile', 'maps', 'friends']);
  const shown = includedGroups();
  assert.ok(shown.every((g) => g.rows.length > 0 && g.rows.every((r) => r.built)));
  assert.ok(!shown.some((g) => g.key === 'friends'), 'nothing of « Avec vos compagnons » is built yet: the group is dropped');
  for (const lang of ['fr', 'en']) {
    const all = langs[lang].odplus.all;
    for (const g of INCLUDED) {
      assert.ok(all[g.key], `${lang}: group ${g.key}`);
      for (const r of g.rows) assert.ok(all[r.key] && all[`${r.key}Text`], `${lang}: row ${r.key}`);
    }
    for (const key of ['title', 'subtitle', 'free', 'syncTextPhone', 'syncTextIphone', 'syncTextDesktop']) assert.ok(all[key], `${lang}: ${key}`);
  }
  assert.equal(langs.fr.odplus.all.subtitle, 'Tout ce qui est inclus dans l’offre Benthic+.');
  assert.equal(langs.fr.odplus.offer.pill, 'L’offre Benthic+');
  assert.equal(langs.fr.odplus.offer.lead, 'Votre carnet à l’abri, sur tous vos appareils.');
  assert.equal(langs.fr.odplus.offer.seeAll, 'Voir tout ce qui est inclus');
});

test('the offer has the new price block, the « see all » link and 48 dp buttons', () => {
  const plus = read('components/FirstLaunchBenthicPlus.svelte');
  const offer = plus.slice(plus.indexOf("{:else if step === 'odplusOffer'}"), plus.indexOf("{:else if step === 'odplusAll'}"));
  assert.ok(offer.indexOf('bc-plus--card-maintenance') < offer.indexOf('bc-plus--see-all'));
  assert.ok(offer.indexOf('bc-plus--see-all') < offer.indexOf('priceBlock'));
  assert.match(plus, /.bc-plus--see-all {[^}]*height: 48px;/s);
  assert.match(plus, /.bc-plus--text-centre {[^}]*height: 48px;/s);
  assert.match(plus, /.bc-plus--price {[^}]*align-items: center;/s, 'plain centred text, not a card');
  assert.doesNotMatch(plus.slice(plus.indexOf('.bc-plus--price {'), plus.indexOf('.bc-plus--price-label')), /background/);
  assert.match(plus, /.bc-plus-all--footer {[^}]*position: sticky;[^}]*bottom: 0;/s);
});
