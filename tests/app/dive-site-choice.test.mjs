// Task 2026-11-27-412: the dive's site chooser (lib/dive-site-choice.js), the site fields' coordinates and the wiring of the
// screens (source-reading tests, like the other tests of the interface).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { currentSiteUuid, logbookChoice, newSiteUrl, recordedPosition } from '../../app/src/lib/dive-site-choice.js';
import { parseCoordinates } from '../../app/src/lib/coordinates.js';

const read = (p) => readFileSync(new URL(`../../app/src/${p}`, import.meta.url), 'utf8');

const SITES = [
  { uuid: 5, name: 'Poor Knights', country: 'Nouvelle-Zélande', dives: 0 },
  { uuid: 2, name: 'hälvälä', country: 'Finlande', dives: 1 },
  { uuid: 7, name: 'Goat Island', country: 'Nouvelle-Zélande', dives: 0 },
  { uuid: 9, name: '', country: '', dives: 3 },
  { uuid: 11, name: '', country: '', dives: 0 },
  { uuid: 3, name: 'Lake Coleridge', country: 'Nouvelle-Zélande', dives: 1 },
  { uuid: 4, name: 'Site 10', country: 'Canada', dives: 1 },
  { uuid: 6, name: 'Site 2', country: 'Canada', dives: 1 },
];
const names = (list) => list.map((s) => s.name);

test('« Dans votre carnet » is alphabetical, accents and case ignored, numbers in order, unnamed sites last', () => {
  assert.deepEqual(names(logbookChoice(SITES, new Map(), '', 'fr')), ['Goat Island', 'hälvälä', 'Lake Coleridge', 'Poor Knights', 'Site 2', 'Site 10', '']);
});

test('a site with neither a name nor a dive is not listed', () => {
  assert.ok(!logbookChoice(SITES, new Map(), '', 'fr').some((s) => s.uuid === 11));
});

test('the search filters on the name, the region and the country', () => {
  const regions = new Map([[3, 'Canterbury'], [5, 'Northland']]);
  assert.deepEqual(names(logbookChoice(SITES, regions, 'goat', 'fr')), ['Goat Island']);
  assert.deepEqual(names(logbookChoice(SITES, regions, 'halv', 'fr')), ['hälvälä']);
  assert.deepEqual(names(logbookChoice(SITES, regions, 'canter', 'fr')), ['Lake Coleridge']);
  assert.deepEqual(names(logbookChoice(SITES, regions, 'zelande', 'fr')), ['Goat Island', 'Lake Coleridge', 'Poor Knights']);
  assert.deepEqual(names(logbookChoice(SITES, regions, 'finlande', 'fr')), ['hälvälä']);
  assert.deepEqual(logbookChoice(SITES, regions, 'zzz', 'fr'), []);
});

test('the list is a new array: the logbook\'s own is not reordered', () => {
  const copy = SITES.slice();
  logbookChoice(SITES, new Map(), '', 'fr');
  assert.deepEqual(SITES, copy);
});

test('the current site is found by its name; a dive without a site has none', () => {
  assert.equal(currentSiteUuid(SITES, 'Lake Coleridge'), 3);
  assert.equal(currentSiteUuid(SITES, ''), 0);
  assert.equal(currentSiteUuid(SITES, 'Unknown'), 0);
});

test('the dive\'s position: the computer\'s for a dive without a site, then its site\'s dive list, then the site', () => {
  const without = [{ id: 4, latUdeg: -36270200, lonUdeg: 174806400 }, { id: 8, latUdeg: 0, lonUdeg: 0 }, { id: 9 }];
  assert.deepEqual(recordedPosition(4, without, null, null), { latUdeg: -36270200, lonUdeg: 174806400 });
  assert.equal(recordedPosition(8, without, null, null), null);
  assert.equal(recordedPosition(9, without, null, null), null);
  const detail = { diveList: [{ id: 12, recordedLatUdeg: 1000000, recordedLonUdeg: 2000000 }] };
  assert.deepEqual(recordedPosition(12, [], detail, { latUdeg: 5, lonUdeg: 6 }), { latUdeg: 1000000, lonUdeg: 2000000 });
  assert.deepEqual(recordedPosition(13, [], detail, { latUdeg: 5, lonUdeg: 6 }), { latUdeg: 5, lonUdeg: 6 });
});

test('the new-site address carries the dive, the typed name and the position', () => {
  assert.equal(newSiteUrl(9, ' Leigh Reef ', { latUdeg: -36270200, lonUdeg: 174806400 }), '/sites/new?dive=9&name=Leigh%20Reef&lat=-36270200&lon=174806400');
  assert.equal(newSiteUrl(9, '', null), '/sites/new?dive=9');
});

const LEIGH = { latUdeg: -36270200, lonUdeg: 174806400 };

test('coordinates are read in decimal degrees, with or without the hemisphere letters, before or after', () => {
  for (const text of ['-36.2702, 174.8064', '-36.2702 174.8064', '36.2702 S, 174.8064 E', '36.2702° S 174.8064° E', '36.2702S 174.8064E', 'S 36.2702 E 174.8064', 'S36.2702, E174.8064', '36,2702 S 174,8064 E']) {
    assert.deepEqual(parseCoordinates(text), LEIGH, text);
  }
});

test('coordinates are read in degrees and minutes, with or without the marks', () => {
  const dm = { latUdeg: -36270000, lonUdeg: 174806667 };
  for (const text of ['36° 16.2′ S 174° 48.4′ E', "36°16.2'S 174°48.4'E", '36 16.2 S 174 48.4 E', 'S 36° 16.2′ E 174° 48.4′', "-36 16.2, 174 48.4"]) {
    assert.deepEqual(parseCoordinates(text), dm, text);
  }
});

test('coordinates are read in degrees, minutes and seconds', () => {
  const dms = { latUdeg: -36270194, lonUdeg: 174806389 };
  for (const text of ['36° 16′ 12.7″ S 174° 48′ 23.0″ E', '36°16\'12.7"S 174°48\'23"E', '36 16 12.7 S, 174 48 23 E', '-36 16 12.7, 174 48 23']) {
    assert.deepEqual(parseCoordinates(text), dms, text);
  }
});

test('coordinates that cannot be a position are refused', () => {
  for (const text of ['', '36.27 N', 'N 36.27 N 174.8', '36 61 S 174 48 E', '-36.27 N, 174.8 E', '95 N 10 E', '10 N 190 E', 'abc', '36.27 E 174.8 N']) {
    assert.equal(parseCoordinates(text), null, text);
  }
});

test('the coordinates of a site are rewritten in the Settings format once typed', () => {
  // The field keeps what the diver typed until it is left, then shows formatCoordinates (the « Coordonnées GPS » setting).
  const edit = read('pages/SiteEdit.svelte');
  assert.match(edit, /onchange=\{typedCoordinates\}/);
  assert.match(edit, /coordsText = formatCoordinates\(p\.latUdeg, p\.lonUdeg\)/);
  const desktop = read('components/DesktopSiteNew.svelte');
  assert.match(desktop, /coordsText = formatCoordinates\(p\.latUdeg, p\.lonUdeg\)/);
  assert.match(read('components/DesktopSiteSheet.svelte'), /const coordsText = \$derived\(site\?\.hasLocation \? formatCoordinates/);
});

test('country and region suggest values on the phone form and keep any typed value', () => {
  const edit = read('pages/SiteEdit.svelte');
  assert.match(edit, /<SuggestField label=\{t\('sites\.country'\)\} bind:value=\{country\} suggest=\{completeCountry\}/);
  assert.match(edit, /<SuggestField label=\{t\('sites\.region'\)\} bind:value=\{region\} suggest=\{completeRegion\}/);
  const field = read('components/SuggestField.svelte');
  assert.match(field, /bind:value/);
  assert.match(field, /onclick=\{\(\) => \(value = p\.value\)\}/);
  // The desktop forms had the completions already.
  assert.match(read('components/DesktopSiteNew.svelte'), /complete=\{completeCountry\}/);
  assert.match(read('components/DesktopSiteSheet.svelte'), /complete=\{completeRegion\}/);
});

test('the dive detail\'s Site card opens the chooser and links the dive through the save path of the other fields', () => {
  const fields = read('components/DesktopDiveFields.svelte');
  assert.match(fields, /<DesktopEditField card noLead name="site"[^>]*onpick=\{openSiteChooser\}/);
  assert.match(fields, /<DesktopEditField name="site"[^>]*onpick=\{openSiteChooser\}/);
  assert.match(fields, /write\(\{ site: uuid \}\)/);
  assert.match(fields, /<DiveSiteChooser /);
  assert.match(fields, /onnone=\{\(\) => linkSite\(0\)\}/);
  // A shared-map site is added to the diver's sites first, as « Choisir un site » does.
  assert.match(fields, /addBaseSite\(base\.id\)/);
  // « Nouveau site »: a page on a phone and a tablet, a dialog on the desktop.
  assert.match(fields, /layout\.desktop\) siteDialog = \{ name \}/);
  assert.match(fields, /openOver\(newSiteUrl\(dive\.id, name, divePosition\)\)/);
});

test('the chooser lists the logbook alphabetically, the shared map apart, for Benthic+ only, with « Plongée sans site »', () => {
  const chooser = read('components/DiveSiteChooser.svelte');
  assert.match(chooser, /logbookChoice\(sites, deskSites\.regions, query, language\)/);
  assert.match(chooser, /benthicPlusAccount\.signedIn && connection\.online/);
  assert.match(chooser, /t\('diveSite\.inLogbook'\)/);
  assert.match(chooser, /t\('sharedSites\.chooseSection'\)/);
  assert.match(chooser, /t\('diveSite\.none'\)/);
  assert.match(chooser, /t\('sites\.newSite'\)/);
  assert.match(chooser, /aria-selected=\{s\.uuid === current\}/);
  // A full screen on a phone (Android and iPhone looks), a dialog with two columns elsewhere.
  assert.match(chooser, /\{#if phone && !ios\}/);
  assert.match(chooser, /\{:else if phone\}/);
  assert.match(chooser, /bc-dive-site-chooser--columns/);
});

test('the site form from a dive takes the typed name and the dive\'s position, and the map has its search, legend and red cross', () => {
  const edit = read('pages/SiteEdit.svelte');
  assert.match(edit, /let name = \$state\(f7route\.query\?\.name \?\? ''\)/);
  assert.match(edit, /await saveDiveChanges\(forDive, \{ site: uuid \}\)/);
  assert.match(edit, /<MapPlaceSearch onpick=\{setPosition\} \/>/);
  assert.match(edit, /cross=\{!!forDive\}/);
  assert.match(edit, /onbaseselect=\{pickShared\}/);
  const desktop = read('components/DesktopSiteNew.svelte');
  assert.match(desktop, /search=\{!!dive\} legend=\{!!dive\} shared=\{around\} onshared=\{pickShared\}/);
  assert.match(desktop, /t\(dive \? 'diveSite\.addAndLink' : 'desktopSites\.addSite'\)/);
  assert.match(read('components/DesktopSitePosMap.svelte'), /MapPlaceSearch/);
});

test('every key of the chooser exists in French and English', () => {
  for (const lang of ['fr', 'en']) {
    const json = JSON.parse(read(`i18n/${lang}.json`));
    for (const key of ['title', 'inLogbook', 'none', 'touchNote', 'clickNote', 'filterNote', 'commonNote', 'newNote', 'addAndLink', 'computerPosition', 'mapSearchLabel', 'touchToPlace', 'clickOrShared', 'legend', 'legendYours', 'mapLabel', 'suggestions', 'failed']) {
      assert.equal(typeof json.diveSite[key], 'string', `${lang}: diveSite.${key}`);
    }
  }
});
