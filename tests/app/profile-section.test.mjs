// Task 2026-11-23-347: « Profil » is a main navigation entry after Sites, for a Benthic+ account only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(`../../app/src/${path}`, import.meta.url), 'utf8');
const nav = read('lib/navigation.svelte.js');

test('the sections are Carnet, Sites, Profil, Statistiques, Outils; Profil only with Benthic+', () => {
  assert.match(nav, /sectionOrder = \['logbook', 'sites', 'profile', 'statistics', 'tools'\]/);
  assert.match(nav, /export const sections = \(\) => sectionOrder\.filter\(\(s\) => s !== 'profile' \|\| navigation\.profile\)/);
  const app = read('App.svelte');
  // The view starts on its default pane on a wide screen: nothing navigates at start (report 35 of 24 November 2026).
  assert.match(app, /\{#if navigation\.profile\}<View id="view-profile" tab url=\{profileWide\(\) \? '\/profile\/info' : '\/profile'\} \/>\{\/if\}/);
  assert.match(app, /navigation\.profile = on/);
  for (const file of ['components/NavigationBar.svelte', 'components/NavRail.svelte', 'components/NavMenu.svelte']) assert.match(read(file), /sections\(\)/, file);
});

test('every router of the guard, the page order and the swipe back includes the Profil view', () => {
  for (const file of ['lib/router-guard.js', 'lib/page-order.js', 'lib/swipe-back.js']) assert.match(read(file), /'sites', 'profile', 'statistics'/, file);
});

test('profile pages open in the Profil view, not over the current section; a free account opens nothing', () => {
  assert.match(nav, /path === '\/profile' \|\| path\.startsWith\('\/profile\/'\)\) \{\s*void openProfilePath/);
  assert.match(nav, /if \(!navigation\.profile\) return;/);
  assert.doesNotMatch(nav, /isOverPath = [^\n]*profile/);
});

test('the profile home has no back arrow and no footnote; the badge is the overdue count', () => {
  const home = read('pages/ProfileDiver.svelte');
  assert.doesNotMatch(home, /BackLink|gear\.profile\.kept/);
  assert.match(home, /gear\.profile\.encrypted/);
  assert.match(read('components/NavBadge.svelte'), /overdueBadge\(\)/);
});

test('a screen opened over a section closes before the section changes; the Back key does not hide a view that is changing page', () => {
  // Report 33 of 24 November 2026: the Logbook chosen in the rail while Réglages was open in the Account view.
  assert.match(nav, /export async function goToSection/);
  assert.match(nav, /await closeOverPages\(f7\.views\.current\);\s*showSection\(section\);/);
  assert.match(nav, /classList\.contains\('view-master-detail'\)\) \{\s*router\.navigate\(router\.history\[0\], \{ reloadAll: true, animate: false \}\);\s*await untilFree\(router\);/);
  assert.match(read('lib/back-button.js'), /if \(view && isBusy\(view\.router\)\) \{[\s\S]*?return 'busy';/);
});
