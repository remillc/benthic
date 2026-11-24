// « Nettoyer les sites » as a status page with one screen per problem (task 2026-11-24-395): the sources
// and the routes, since the screens run in the WebView.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (/** @type {string} */ p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const app = read('app/src/App.svelte');
const fr = JSON.parse(read('app/src/i18n/fr.json'));
const en = JSON.parse(read('app/src/i18n/en.json'));

test('every step has its own route: collections end with a slash, a site to place is a resource', () => {
  assert.match(app, /path: '\/sites\/cleanup\/', [^\n]*SitesCleanupStatus\.svelte/);
  assert.match(app, /path: '\/sites\/cleanup\/duplicates\/', [^\n]*SitesCleanup\.svelte/);
  assert.match(app, /path: '\/sites\/cleanup\/unused\/', [^\n]*SitesUnused\.svelte/);
  assert.match(app, /path: '\/sites\/without\/'/);
  assert.match(app, /path: '\/sites\/unplaced\/'/);
  assert.match(app, /path: '\/sites\/:uuid\/place', [^\n]*SitePlace\.svelte/);
  assert.doesNotMatch(app, /path: '\/sites\/cleanup'/, 'the old single screen is gone');
});

test('Sites has one « Nettoyer les sites » row, with « n points à régler », hidden at 0', () => {
  const sites = read('app/src/pages/Sites.svelte');
  assert.match(sites, /\{#if pointsToFix\}/);
  assert.match(sites, /href="\/sites\/cleanup\/"/);
  assert.match(sites, /t\('sites\.pointsToFix', \{ n: pointsToFix \}\)/);
  for (const old of ['/sites/without/', '/sites/unplaced/', 'sites.cleanupLink', 'sites.withoutLink', 'sites.unplacedLink']) assert.ok(!sites.includes(old), old);
});

test('the status page is a list of links to the screens, one row per problem', () => {
  const page = read('app/src/pages/SitesCleanupStatus.svelte');
  assert.match(page, /cleanupProblems\(counts\)/);
  assert.match(page, /href=\{p\.route\}/);
});

test('the duplicates screen no longer holds the unused sites, which have a screen with the delete action in the top bar', () => {
  const dup = read('app/src/pages/SitesCleanup.svelte');
  assert.doesNotMatch(dup, /unusedTitle|deleteSelection|selectAll/);
  assert.match(dup, /t\('sites\.duplicatesTitle'\)/);
  const unused = read('app/src/pages/SitesUnused.svelte');
  assert.match(unused, /\{#snippet right\(\)\}[\s\S]*sites\.deleteCount[\s\S]*\{\/snippet\}/, 'Android: Supprimer (n) in the navbar');
  assert.match(unused, /\{#if ios\}[\s\S]*t\('sites\.delete'\)/, 'iPhone: a text button');
  assert.match(unused, /bc-sites-unused--delete-ios[\s\S]*--bc-alarm/, 'red, from the theme');
});

test('placing a site: search, draggable pin, my position, coordinates, Save (iPhone OK)', () => {
  const place = read('app/src/pages/SitePlace.svelte');
  assert.match(place, /t\('sites\.searchPlace'\)/);
  assert.match(place, /<SiteMap pin=\{position\} editable/);
  assert.match(place, /useDevicePosition/);
  assert.match(place, /formatCoordinates\(position\.latUdeg, position\.lonUdeg\)/);
  assert.match(place, /t\(ios \? 'dialog\.ok' : 'edit\.save'\)/);
  assert.match(place, /placeAt\(/);
});

test('sites without coordinates: « Utiliser cette position » only with a position, « Placer sur la carte » always', () => {
  const page = read('app/src/pages/SitesUnplaced.svelte');
  assert.match(page, /\{#if position\}[\s\S]*sites\.useThisPosition[\s\S]*sites\.placeOnMap[\s\S]*\{:else\}[\s\S]*sites\.placeOnMap/);
  assert.match(page, /sites\.noDiveGps/);
  assert.match(page, /\/sites\/\$\{site\.uuid\}\/place/);
});

test('the desktop has one bar and its steps in the right pane', () => {
  const page = read('app/src/pages/DesktopSites.svelte');
  assert.match(page, /sites\.pointsToFix/);
  assert.match(page, /desktopSites\.cleanUp/);
  assert.doesNotMatch(page, /withoutSiteBar|bars\.without|desktopSites\.findThem/);
  for (const pane of ['cleanup', 'duplicates', 'unused', 'without', 'unplaced', 'place']) assert.match(page, new RegExp(`pane === '${pane}'`), pane);
  assert.match(read('app/src/components/DesktopCleanupHeader.svelte'), /t\('sites\.cleanupTitle'\)/, '« ‹ Nettoyer les sites » above the title');
  assert.match(read('app/src/components/DesktopSitesUnused.svelte'), /DesktopCleanupHeader[\s\S]*bc-cleanup-unused--danger/, 'Supprimer la sélection (n) beside the title');
});

test('the new texts exist in both languages, with plural forms where they count', () => {
  for (const [name, tr] of [
    ['fr', fr],
    ['en', en],
  ]) {
    for (const key of ['pointsToFix', 'withoutCount', 'unplacedCount', 'duplicatesCount', 'unusedCount', 'unplacedLine']) {
      assert.ok(tr.sites[key]?.one && tr.sites[key]?.other, `${name} sites.${key}`);
    }
    for (const key of ['cleanupHintDuplicates', 'cleanupHintUnused', 'cleanupHintWithout', 'cleanupHintUnplaced', 'duplicatesTitle', 'useThisPosition', 'placeOnMap', 'noDiveGps', 'placeTitle', 'searchPlace', 'dragPin', 'deleteCount', 'unplacedIntro']) {
      assert.equal(typeof tr.sites[key], 'string', `${name} sites.${key}`);
    }
  }
  assert.equal(fr.sites.cleanupHintUnplaced, 'Les placer sur la carte');
  assert.equal(fr.sites.pointsToFix.other, '{n} points à régler');
});
