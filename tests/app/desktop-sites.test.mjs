// Desktop Sites (tasks 2026-11-15-171, 175, 177): the table, the search, the selection shared by
// the table and the map, the bars, stacked pins, autocompletion, dives without a site, clean up.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_SORT,
  nextSort,
  sortSites,
  matchesSiteText,
  searchSites,
  reduceSelection,
  withoutSiteBar,
  cleanupBar,
  stackPins,
  countValues,
  completions,
  inlineCompletion,
  worldCountries,
  regionsOfCountry,
  groupWithout,
  withoutAfter,
  filterChoice,
  checkedUnused,
  toggleAllUnused,
  mergeSides,
  highlightParts,
} from '../../app/src/lib/desktop-sites.js';

/** @returns {any} */
const site = (uuid, name, country = '', dives = 0, lastDate = '') => ({ uuid, name, country, dives, lastDate, hasLocation: true, latUdeg: 0, lonUdeg: 0, maxDepthMm: 0 });

const sample = [
  site(1, 'Northern Arch', 'Nouvelle-Zélande', 1, '2022-04-24'),
  site(2, 'Hälvälä', 'Finlande', 1, '2015-05-23'),
  site(3, 'Lake Coleridge', 'Nouvelle-Zélande', 1, '2014-04-02'),
  site(4, 'Cornwall, quai', 'Canada', 0, ''),
];

test('the table sorts by name by default, and a header click reverses it', () => {
  assert.deepEqual(sortSites(sample, DEFAULT_SORT, 'fr').map((s) => s.uuid), [4, 2, 3, 1]);
  const reversed = nextSort(DEFAULT_SORT, 'name');
  assert.equal(reversed.descending, true);
  assert.deepEqual(sortSites(sample, reversed, 'fr').map((s) => s.uuid), [1, 3, 2, 4]);
});

test('counts and dates start with the largest, a site without a dive goes last on its date', () => {
  assert.deepEqual(nextSort(DEFAULT_SORT, 'dives'), { key: 'dives', descending: true });
  const last = sortSites(sample, { key: 'last', descending: true }, 'fr').map((s) => s.uuid);
  assert.deepEqual(last, [1, 2, 3, 4]);
  const oldest = sortSites(sample, { key: 'last', descending: false }, 'fr').map((s) => s.uuid);
  assert.equal(oldest.at(-1), 4, 'no date: last in either direction');
});

test('search covers names, regions and countries, ignoring case and accents', () => {
  const regions = new Map([
    [1, 'Northland'],
    [2, 'Päijät-Häme'],
  ]);
  assert.deepEqual(searchSites(sample, regions, 'cole').map((s) => s.uuid), [3]);
  assert.deepEqual(searchSites(sample, regions, 'NORTHLAND').map((s) => s.uuid), [1], 'a region');
  assert.deepEqual(searchSites(sample, regions, 'finlande').map((s) => s.uuid), [2], 'a country');
  assert.deepEqual(searchSites(sample, regions, 'paijat').map((s) => s.uuid), [2], 'accents folded');
  assert.equal(searchSites(sample, regions, '  ').length, 4, 'an empty search keeps every site');
  assert.ok(!matchesSiteText(sample[0], '', 'zzz'));
});

test('the matching text is highlighted in the name', () => {
  const parts = highlightParts('Lake Coleridge', 'cole');
  assert.deepEqual(parts, [
    { text: 'Lake ', match: false },
    { text: 'Cole', match: true },
    { text: 'ridge', match: false },
  ]);
});

test('a row and a pin select the same site; the row opens the sheet, the pin the map card', () => {
  let s = reduceSelection({ selected: null, mode: 'map' }, { type: 'pin' }, 3);
  assert.deepEqual(s, { selected: 3, mode: 'map' });
  s = reduceSelection(s, { type: 'edit' });
  assert.deepEqual(s, { selected: 3, mode: 'sheet' }, '« Modifier » opens the sheet');
  s = reduceSelection(s, { type: 'row' }, 1);
  assert.deepEqual(s, { selected: 1, mode: 'sheet' });
  s = reduceSelection(s, { type: 'escape' });
  assert.deepEqual(s, { selected: 1, mode: 'map' }, 'Échap returns to the map');
  assert.deepEqual(reduceSelection(s, { type: 'escape' }), s);
});

test('a site that is no longer listed is no longer selected', () => {
  const s = { selected: 3, mode: /** @type {const} */ ('sheet') };
  assert.deepEqual(reduceSelection(s, { type: 'visible', uuids: [1, 2, 3] }), s);
  assert.deepEqual(reduceSelection(s, { type: 'visible', uuids: [1, 2] }), { selected: null, mode: 'map' });
  assert.deepEqual(reduceSelection({ selected: null, mode: 'map' }, { type: 'visible', uuids: [] }), { selected: null, mode: 'map' });
});

test('the « plongées sans site » bar: its count, absent at 0 and while searching', () => {
  assert.deepEqual(withoutSiteBar(5, false), { count: 5 });
  assert.equal(withoutSiteBar(0, false), null, 'no dive without a site: no bar');
  assert.equal(withoutSiteBar(5, true), null, 'the search hides the bars');
});

test('the count lowers when dives get a site, and the bar goes at 0', () => {
  const without = [{ id: 1 }, { id: 2 }, { id: 3 }];
  assert.equal(withoutAfter(without, [2]), 2);
  assert.equal(withoutSiteBar(withoutAfter(without, [2]), false)?.count, 2);
  assert.equal(withoutSiteBar(withoutAfter(without, [1, 2, 3]), false), null);
  assert.equal(withoutAfter(without, [99]), 3, 'a dive that was not in the list changes nothing');
});

test('the clean-up bar shows duplicates and unused sites, under the first bar', () => {
  assert.deepEqual(cleanupBar(2, 3, false), { duplicates: 2, unused: 3 });
  assert.deepEqual(cleanupBar(0, 3, false), { duplicates: 0, unused: 3 });
  assert.equal(cleanupBar(0, 0, false), null);
  assert.equal(cleanupBar(2, 3, true), null);
});

test('pins that overlap at the zoom merge into one with their count', () => {
  const groups = stackPins(
    [
      { uuid: 1, x: 100, y: 100 },
      { uuid: 2, x: 104, y: 98 },
      { uuid: 3, x: 108, y: 103 },
      { uuid: 4, x: 400, y: 300 },
    ],
    14,
  );
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].uuids, [1, 2, 3]);
  assert.deepEqual(groups[1].uuids, [4]);
  // Zoomed in, the same sites are apart.
  assert.equal(stackPins([{ uuid: 1, x: 100, y: 100 }, { uuid: 2, x: 160, y: 100 }], 14).length, 2);
});

test('Country completes with the countries of the logbook first, with their count', () => {
  const mine = countValues(['Nouvelle-Zélande', 'Nouvelle-Zélande', 'Finlande', 'Canada', ''], 'fr');
  assert.deepEqual(mine[0], { value: 'Nouvelle-Zélande', count: 2 });
  const world = ['Nouvelle-Calédonie', 'Nouvelle-Zélande', 'Papouasie-Nouvelle-Guinée', 'Norvège'];
  const list = completions('Nouv', mine, world);
  assert.deepEqual(
    list.map((x) => x.value),
    ['Nouvelle-Zélande', 'Nouvelle-Calédonie', 'Papouasie-Nouvelle-Guinée'],
    'the logbook first, then the others that start with the text, then those that contain it',
  );
  assert.equal(list[0].count, 2);
  assert.equal(list[1].count, 0);
  assert.deepEqual(completions('', mine, world), []);
});

test('a country of the logbook beats a more frequent match that does not start with the text', () => {
  const mine = [
    { value: 'Papouasie-Nouvelle-Guinée', count: 9 },
    { value: 'Nouvelle-Zélande', count: 1 },
  ];
  assert.equal(completions('nouv', mine, [])[0].value, 'Nouvelle-Zélande');
});

test('the grey completion inside the field is what the first proposal adds to the text', () => {
  assert.equal(inlineCompletion('Nouv', [{ value: 'Nouvelle-Zélande' }]), 'elle-Zélande');
  assert.equal(inlineCompletion('nouv', [{ value: 'Nouvelle-Zélande' }]), 'elle-Zélande', 'the case typed is kept by the field');
  assert.equal(inlineCompletion('Zél', [{ value: 'Nouvelle-Zélande' }]), '', 'only a start can be completed');
  assert.equal(inlineCompletion('Nouvelle-Zélande', [{ value: 'Nouvelle-Zélande' }]), '');
  assert.equal(inlineCompletion('x', []), '');
});

test('Region proposes only the regions of the chosen country', () => {
  const sites = [site(1, 'A', 'Canada'), site(2, 'B', 'Canada'), site(3, 'C', 'Finlande'), site(4, 'D', 'Canada')];
  const regions = new Map([
    [1, 'Ontario'],
    [2, 'Ontario'],
    [3, 'Pirkanmaa'],
    [4, 'Québec'],
  ]);
  assert.deepEqual(regionsOfCountry(sites, regions, 'Canada', 'fr'), [
    { value: 'Ontario', count: 2 },
    { value: 'Québec', count: 1 },
  ]);
  assert.deepEqual(regionsOfCountry(sites, regions, 'canada', 'fr').length, 2, 'case ignored');
});

test('the countries of the world come from the system names, in the language', () => {
  const fr = worldCountries('fr');
  assert.ok(fr.includes('Nouvelle-Zélande'));
  assert.ok(fr.includes('Finlande'));
  assert.ok(!fr.some((n) => /^[A-Z]{2}$/.test(n)), 'no bare code');
  assert.ok(worldCountries('en').includes('New Zealand'));
  // With a stub: unknown codes are left out.
  const stub = worldCountries('xx', () => ({ of: (c) => (c === 'NZ' ? 'Zedland' : c) }));
  assert.deepEqual(stub, ['Zedland']);
});

test('the dives without a site: trips grouped under the trip, the newest first', () => {
  const dives = [
    { id: 9, date: '2026-02-07T09:09:00' },
    { id: 8, date: '2025-09-27T11:55:00' },
    { id: 4, date: '2013-02-04T08:47:00' },
    { id: 3, date: '2013-02-03T09:00:00' },
    { id: 2, date: '2013-02-02T09:00:00' },
  ];
  const trips = new Map([
    [4, { id: 1, location: '' }],
    [3, { id: 1, location: '' }],
    [2, { id: 1, location: '' }],
  ]);
  const groups = groupWithout(dives, (id) => trips.get(id));
  assert.deepEqual(groups.map((g) => g.first.id), [9, 8, 4]);
  assert.equal(groups[0].trip, null);
  assert.deepEqual(groups[2].others.map((d) => d.id), [3, 2], 'the other dives of the trip');
});

test('the site choice filters by name, region and country, keeping the distance order', () => {
  const rows = [
    { site: sample[0], metres: 3200 },
    { site: sample[2], metres: 3300 },
    { site: sample[1], metres: null },
  ];
  assert.deepEqual(filterChoice(rows, new Map(), 'nor').map((r) => r.site.uuid), [1]);
  assert.deepEqual(filterChoice(rows, new Map(), 'nouvelle').map((r) => r.site.uuid), [1, 3], 'the country too, in order');
  assert.equal(filterChoice(rows, new Map(), '').length, 3);
});

test('the sites without a dive: the checked ones, and « Tout sélectionner » toggles', () => {
  const unused = [site(10, 'Goat Island'), site(11, 'Poor Knights'), site(12, '')];
  assert.deepEqual(checkedUnused(unused, { 10: true, 11: true, 12: false }), [10, 11]);
  const all = toggleAllUnused(unused, {});
  assert.deepEqual(checkedUnused(unused, all), [10, 11, 12]);
  assert.deepEqual(checkedUnused(unused, toggleAllUnused(unused, all)), [], 'a second click unchecks');
  // A site checked that is no longer in the list is not deleted.
  assert.deepEqual(checkedUnused(unused, { 99: true }), []);
});

test('merging two sites: the site with more dives is offered first, and the choice decides which one is kept', () => {
  const few = site(1, 'Goat Island', 'NZ', 2);
  const many = site(2, 'Goat Is.', 'NZ', 9);
  const sides = mergeSides(few, many, undefined);
  assert.equal(sides.first, many);
  assert.equal(sides.keep, many);
  assert.equal(sides.other, few);
  // The other site chosen: it is kept and the first one goes.
  const swapped = mergeSides(few, many, 1);
  assert.equal(swapped.keep, few);
  assert.equal(swapped.other, many);
  assert.equal(swapped.first, many, 'the order of the rows does not change');
  // An unknown choice falls back to the default.
  assert.equal(mergeSides(few, many, 77).keep, many);
  // Same dives: the one with a position comes first.
  const placed = { ...site(3, 'A', 'NZ', 4), hasLocation: true };
  const bare = { ...site(4, 'A', 'NZ', 4), hasLocation: false };
  assert.equal(mergeSides(bare, placed, null).keep, placed);
});
