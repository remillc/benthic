// Logbook, phone layout (task 2026-11-18-278): the dives by year in white cards, a trip as its own card, the date block,
// and the name a screen reader gives each row.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { groupByMonth } from '../../app/src/lib/carnet-months.js';
import { buildRows, dayOfMonth, monthAbbreviation } from '../../app/src/lib/logbook-cards.js';
import { diveRowLabel, spokenDepth, spokenDuration } from '../../app/src/lib/dive-row-text.js';
import { formatLongDate, formatTimeOfDay, locale } from '../../app/src/lib/format.js';
import { language } from '../../app/src/lib/i18n.js';

const src = (path) => readFileSync(new URL(`../../app/src/${path}`, import.meta.url), 'utf8').split(String.fromCharCode(13)).join('');
const catalog = (lang) => JSON.parse(src(`i18n/${lang}.json`));
const plain = (text) => text.replace(/ | /g, ' ');
const french = language === 'fr' || language === 'fr-CA';

/** @param {number} id @param {string} date @param {number} [trip] */
const dive = (id, date, trip) => ({ id, date, trip: trip ? { id: trip, location: '' } : null });
const rowsOf = (dives, expanded = {}, cards = true) => buildRows(groupByMonth(dives), expanded, cards);
/** One word per row: Y2026 a year, d5 a dive, t7 a trip header; ^ opens a card, $ closes it, + space above. */
const shape = (rows) =>
  rows.map((r) => (r.kind === 'year' ? `Y${r.year}` : `${r.kind === 'trip' ? 't' : 'd'}${r.dive?.id ?? r.id}${r.cardFirst ? '^' : ''}${r.cardLast ? '$' : ''}${r.gapBefore ? '+' : ''}`));

test('the dives are grouped by year, each year under its title', () => {
  const rows = rowsOf([dive(5, '2026-02-07T09:09:00'), dive(4, '2026-01-15T09:30:00'), dive(3, '2025-09-27T11:55:00'), dive(2, '2022-04-24T10:30:00'), dive(1, '2013-02-02T08:21:00')]);
  assert.deepEqual(shape(rows), ['Y2026', 'd5^', 'd4$', 'Y2025', 'd3^$', 'Y2022', 'd2^$', 'Y2013', 'd1^$']);
  assert.deepEqual(rows.filter((r) => r.kind === 'year').map((r) => r.key), ['y2026', 'y2025', 'y2022', 'y2013']);
});

test('the rows keep their place in the list: index follows the order, the year row carries the month below it', () => {
  const rows = rowsOf([dive(2, '2026-02-07T09:09:00'), dive(1, '2025-12-31T23:00:00')]);
  assert.deepEqual(rows.map((r) => r.index), [0, 1, 2, 3]);
  assert.equal(rows[0].month, '2026-02');
  assert.equal(rows[2].month, '2025-12');
});

test('a trip is its own card; the dives before and after it are cards of their own', () => {
  const rows = rowsOf([dive(6, '2013-04-01T10:00:00'), dive(5, '2013-03-04T10:00:00', 7), dive(4, '2013-03-03T10:00:00', 7), dive(3, '2013-03-02T10:00:00', 7), dive(2, '2013-02-02T10:00:00'), dive(1, '2013-02-01T10:00:00')], { 7: true });
  assert.deepEqual(shape(rows), ['Y2013', 'd6^$', 't7^+', 'd5', 'd4', 'd3$', 'd2^+', 'd1$']);
});

test('a folded trip is its header alone: a card closed on itself', () => {
  const rows = rowsOf([dive(3, '2013-02-04T10:00:00', 7), dive(2, '2013-02-03T10:00:00', 7), dive(1, '2013-02-02T10:00:00', 7)]);
  assert.deepEqual(shape(rows), ['Y2013', 't7^$']);
  assert.equal(rows[1].dives.length, 3);
});

test('unfolding a trip adds its dives after its header, folding takes them away again', () => {
  const dives = [dive(3, '2013-02-04T10:00:00', 7), dive(2, '2013-02-03T10:00:00', 7), dive(1, '2013-02-02T10:00:00', 7)];
  assert.equal(rowsOf(dives, { 7: true }).length, 5);
  assert.equal(rowsOf(dives, { 7: false }).length, 2);
  const open = rowsOf(dives, { 7: true });
  assert.deepEqual(open.filter((r) => r.kind === 'inTrip').map((r) => [r.dive.id, r.tripFirst, r.tripLast]), [[3, true, false], [2, false, false], [1, false, true]]);
});

test('a trip that runs from one year into the next stays in one card, under the year of its first dive', () => {
  const rows = rowsOf([dive(3, '2014-01-02T10:00:00', 7), dive(2, '2013-12-31T10:00:00', 7), dive(1, '2013-12-30T10:00:00', 7)], { 7: true });
  assert.deepEqual(shape(rows), ['Y2013', 't7^', 'd3', 'd2', 'd1$']);
});

test('the tablet keeps the flat list: no year rows, no card marks', () => {
  const rows = rowsOf([dive(2, '2026-02-07T09:09:00'), dive(1, '2013-02-02T08:21:00')], {}, false);
  assert.deepEqual(rows.map((r) => r.kind), ['dive', 'dive']);
  assert.ok(rows.every((r) => r.cardFirst === undefined && r.gapBefore === undefined));
});

test('an empty logbook has no rows', () => {
  assert.deepEqual(rowsOf([]), []);
});

test('the date block: the day, and the month in capitals as the language abbreviates it', () => {
  assert.equal(dayOfMonth('2026-02-07T09:09:00'), '7');
  assert.equal(dayOfMonth('2013-12-31T09:09:00'), '31');
  assert.equal(monthAbbreviation('2026-02-07T09:09:00', 'fr-FR'), 'FÉVR.');
  assert.equal(monthAbbreviation('2025-09-27T11:55:00', 'fr-FR'), 'SEPT.');
  assert.equal(monthAbbreviation('2026-02-07T09:09:00', 'en-US'), 'FEB');
  assert.equal(monthAbbreviation('', 'en-US'), '');
});

test('the month follows the locale of the formats', () => {
  const expected = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 1, 7))).toLocaleUpperCase(locale);
  assert.equal(monthAbbreviation('2026-02-07T09:09:00', locale), expected);
});

test('the spoken depth and duration follow the unit and the plural of the language', () => {
  const fr = catalog('fr').units;
  const en = catalog('en').units;
  assert.equal(fr.feetSpoken.other, '{v} pieds');
  assert.equal(fr.metersSpoken.other, '{v} mètres');
  assert.equal(fr.minutesSpoken.other, '{v} minutes');
  assert.equal(en.feetSpoken.other, '{v} feet');
  assert.equal(spokenDepth(0, { length: 'ft' }), '', 'an unknown depth is not read');
  assert.match(plain(spokenDepth(27700, { length: 'm' })), french ? /^27,7 mètres$/ : /^27\.7 meters$/);
  assert.match(plain(spokenDepth(27700, { length: 'ft' })), french ? /^91 pieds$/ : /^91 feet$/);
  assert.match(plain(spokenDuration(55 * 60)), /^55 minutes$/);
  assert.match(plain(spokenDuration(60)), /^1 minute$/);
});

/** The task's example: dive 9, 7 February 2026, 9:09, no site, 91 feet, 55 minutes. */
const example = { number: 9, date: '2026-02-07T09:09:00', site: '', maxDepthMm: 27740, durationSeconds: 3300 };

test('a row reads as one item: number, date, time, site, depth, duration', () => {
  const label = plain(diveRowLabel(example, { length: 'ft' }));
  const notSet = catalog(french ? 'fr' : 'en').dive.siteNotSet;
  assert.ok(label.startsWith(french ? 'Plongée 9, ' : 'Dive 9, '));
  // The long date of a language may hold a comma ("February 7, 2026"): the pieces are checked in order.
  const order = [formatLongDate(example.date), formatTimeOfDay(example.date), notSet.charAt(0).toLocaleLowerCase() + notSet.slice(1), spokenDepth(example.maxDepthMm, { length: 'ft' }), spokenDuration(example.durationSeconds)].map(plain);
  let at = 0;
  for (const piece of order) {
    const found = label.indexOf(piece, at);
    assert.ok(found >= at, `"${piece}" in "${label}"`);
    at = found + piece.length;
  }
  if (french) assert.match(label, /^Plongée 9, 7 février 2026, .+, site à préciser, 91 pieds, 55 minutes$/);
  else assert.match(label, /^Dive 9, February 7, 2026, .+, dive site not set, 91 feet, 55 minutes$/);
});

test('a row with a site reads the site as written; with no number it reads "Plongée" alone; no depth, no depth part', () => {
  const label = plain(diveRowLabel({ ...example, number: 0, site: 'Northern Arch', maxDepthMm: 0 }, { length: 'm' }));
  assert.ok(label.startsWith(french ? 'Plongée, ' : 'Dive, '));
  assert.ok(label.includes('Northern Arch'));
  assert.ok(!/mètre|meter|pied|feet/.test(label));
  assert.ok(label.endsWith('55 minutes'));
});

test('the phone logbook draws the cards, the tablet and the desktop keep their rows', () => {
  const logbook = src('pages/Logbook.svelte');
  assert.match(logbook, /const cards = \$derived\(!layout\.split\)/);
  assert.match(logbook, /buildRows\(monthGroups, expanded, cards\)/);
  assert.match(logbook, /card=\{cards\}/);
  // The list stays virtual and its dives stay a raw array.
  assert.match(logbook, /f7\.virtualList\.create/);
  assert.match(logbook, /vl\.replaceAllItems\(items\)/);
  assert.match(src('lib/logbook.svelte.js'), /\$state\.raw/);
  assert.ok(!src('pages/DesktopLogbook.svelte').includes('od-dive-row--card'));
});

test('a card row has one accessible name; its parts are hidden from the screen reader', () => {
  const row = src('components/DiveRow.svelte');
  assert.match(row, /diveRowLabel\(dive, prefs\)/);
  for (const part of ['od-dive-row--date', 'od-dive-row--text', 'od-dive-row--right']) assert.match(row, new RegExp(`class="${part}[^"]*" aria-hidden="true"`));
  assert.match(row, /name="pinOff"/, 'the crossed-out pin on a dive with no site');
  assert.match(row, /<ProfileThumbnail[^>]* wide \/>/);
});

test('the trip header folds with its chevron, as before, and says whether it is open', () => {
  const trip = src('components/TripRow.svelte');
  const card = trip.slice(trip.indexOf('{#if card}'), trip.indexOf('{:else}'));
  assert.match(card, /aria-expanded=\{expanded\}/);
  assert.match(card, /onclick=\{toggle\}/);
  assert.match(card, /name="trip"/, 'the suitcase');
});

test('the colours are tokens in light and in dark, none hard-coded in the rows', () => {
  const theme = src('theme.css');
  for (const token of ['--od-date-block', '--od-on-date-block', '--od-trip-header', '--od-profile-chip']) assert.equal(theme.split(`${token}:`).length - 1, 2, `${token} in light and dark`);
  assert.match(theme, /--od-date-block: #E6EEF7/);
  for (const file of ['components/DiveRow.svelte', 'components/TripRow.svelte']) {
    const css = src(file).slice(src(file).indexOf('<style>'));
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(css), `${file} has no colour value`);
  }
});

test('the right column gives way before the site: the site ellipsizes and the column is capped', () => {
  const row = src('components/DiveRow.svelte');
  assert.match(row, /\.od-dive-row--text \{[^}]*min-width: 0/);
  assert.match(row, /\.od-dive-row--site \{[^}]*text-overflow: ellipsis/);
  assert.match(row, /\.od-dive-row--right \{[^}]*max-width: 40%/);
  assert.match(row, /\.od-dive-row--date \{[^}]*min-width: 48px;[^}]*min-height: 48px/, 'the date block grows with a large text');
});
