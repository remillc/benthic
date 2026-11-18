// Desktop logbook table (task 2026-11-15-169): sorting, trip rows, selection and the
// right-click menu's items for one and several dives.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  COLUMNS,
  DEFAULT_COLUMNS,
  DEFAULT_SORT,
  shownColumns,
  toggleColumn,
  nextSort,
  sortDives,
  tableRows,
  rowDiveIds,
  clickSelect,
  stepSelect,
  keepSelection,
  contextMenuEntries,
  emptyAreaMenuEntries,
  selectionSummary,
  clampTableWidth,
  EMPTY_SELECTION,
} from '../../app/src/lib/desktop-table.js';

/** @returns {any} */
const dive = (id, number, date, site, maxDepthMm, durationSeconds, trip = null) => ({
  id,
  number,
  date,
  site,
  maxDepthMm,
  durationSeconds,
  profile: [],
  trip: trip ? { id: trip, location: '', autogen: false } : null,
});

// The mock-up's logbook: dives 1 to 4 in a trip, the others alone.
const dives = [
  dive(11, 1, '2013-02-02T08:21:00', '', 28700, 3660, 100),
  dive(12, 2, '2013-02-02T14:05:00', '', 22000, 3960, 100),
  dive(13, 3, '2013-02-03T09:10:00', '', 20900, 3660, 100),
  dive(14, 4, '2013-02-04T08:47:00', '', 21700, 3540, 100),
  dive(15, 5, '2014-04-02T10:00:00', 'Lake Coleridge', 39000, 4680),
  dive(16, 6, '2015-05-23T13:23:00', 'Hälvälä', 79600, 6000),
  dive(17, 7, '2022-04-24T10:30:00', 'Northern Arch', 60400, 6240),
  dive(18, 8, '2025-09-27T11:55:00', '', 101500, 6120),
  dive(19, 9, '2026-02-07T09:09:00', '', 27700, 3300),
];
const extras = new Map([
  [15, { id: 15, waterTempMk: 282150, buddies: ['Marc'] }],
  [16, { id: 16, waterTempMk: 277150, buddies: ['Anne', 'Marc'] }],
  [19, { id: 19, waterTempMk: 277150, buddies: [] }],
]);
const numbers = (list) => list.map((d) => d.number);

test('default columns are those of the mock-up, N° and Date always shown', () => {
  // Compagnons replaced Temp. in the defaults (task 2026-11-15-182).
  assert.deepEqual(DEFAULT_COLUMNS, ['number', 'date', 'site', 'maxDepth', 'duration', 'buddies']);
  assert.deepEqual(
    shownColumns(['site', 'unknown']).map((c) => c.key),
    ['number', 'date', 'site'],
  );
  assert.deepEqual(toggleColumn(DEFAULT_COLUMNS, 'waterTemp'), [...DEFAULT_COLUMNS, 'waterTemp']);
  assert.deepEqual(toggleColumn(DEFAULT_COLUMNS, 'site'), ['number', 'date', 'maxDepth', 'duration', 'buddies']);
  assert.deepEqual(toggleColumn(DEFAULT_COLUMNS, 'date'), DEFAULT_COLUMNS);
  assert.ok(COLUMNS.every((c) => c.label.startsWith('desktop.column.')));
});

test('a header click sorts, a second click reverses', () => {
  assert.deepEqual(nextSort(DEFAULT_SORT, 'date'), { key: 'date', descending: false });
  assert.deepEqual(nextSort(DEFAULT_SORT, 'maxDepth'), { key: 'maxDepth', descending: true });
  assert.deepEqual(nextSort(DEFAULT_SORT, 'site'), { key: 'site', descending: false });
  assert.deepEqual(nextSort({ key: 'site', descending: false }, 'site'), { key: 'site', descending: true });
});

test('sorting by date, number, depth, duration and temperature', () => {
  assert.deepEqual(numbers(sortDives(dives, extras, DEFAULT_SORT)), [9, 8, 7, 6, 5, 4, 3, 2, 1]);
  assert.deepEqual(numbers(sortDives(dives, extras, { key: 'date', descending: false })), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(numbers(sortDives(dives, extras, { key: 'number', descending: true })), [9, 8, 7, 6, 5, 4, 3, 2, 1]);
  assert.deepEqual(numbers(sortDives(dives, extras, { key: 'maxDepth', descending: true })), [8, 6, 7, 5, 1, 9, 2, 4, 3]);
  assert.deepEqual(numbers(sortDives(dives, extras, { key: 'duration', descending: false })).slice(0, 4), [9, 4, 3, 1]);
  // Unknown temperatures (0) sort with the smallest; ties keep newest first.
  assert.deepEqual(numbers(sortDives(dives, extras, { key: 'waterTemp', descending: true })).slice(0, 3), [5, 9, 6]);
});

test('sorting by text keeps empty values last in both directions', () => {
  const up = numbers(sortDives(dives, extras, { key: 'site', descending: false }));
  const down = numbers(sortDives(dives, extras, { key: 'site', descending: true }));
  assert.deepEqual(up.slice(0, 3), [6, 5, 7]);
  assert.deepEqual(down.slice(0, 3), [7, 5, 6]);
  assert.deepEqual(up.slice(3), [9, 8, 4, 3, 2, 1]);
  assert.deepEqual(down.slice(3), [9, 8, 4, 3, 2, 1]);
  assert.deepEqual(numbers(sortDives(dives, extras, { key: 'buddies', descending: false })).slice(0, 2), [6, 5]);
});

test('by date, a trip is one expandable row at its place; folded, its dives hide', () => {
  const sorted = sortDives(dives, extras, DEFAULT_SORT);
  const rows = tableRows(sorted, DEFAULT_SORT, {});
  assert.deepEqual(
    rows.map((r) => (r.type === 'trip' ? `trip${r.id}` : r.dive.number)),
    [9, 8, 7, 6, 5, 'trip100', 4, 3, 2, 1],
  );
  const trip = rows[5];
  assert.equal(trip.type === 'trip' && trip.dives.length, 4);
  assert.equal(rows[6].type === 'dive' && rows[6].inTrip, true);
  const folded = tableRows(sorted, DEFAULT_SORT, { 100: true });
  assert.deepEqual(
    folded.map((r) => (r.type === 'trip' ? `trip${r.id}` : r.dive.number)),
    [9, 8, 7, 6, 5, 'trip100'],
  );
  assert.deepEqual(rowDiveIds(folded), [19, 18, 17, 16, 15]);
});

test('by another column, rows are the dives alone', () => {
  const sort = { key: 'maxDepth', descending: true };
  const rows = tableRows(sortDives(dives, extras, sort), sort, {});
  assert.equal(rows.length, 9);
  assert.ok(rows.every((r) => r.type === 'dive' && !r.inTrip));
});

test('click, Ctrl+click and Shift+click select dives', () => {
  const order = rowDiveIds(tableRows(sortDives(dives, extras, DEFAULT_SORT), DEFAULT_SORT, {}));
  let s = clickSelect(EMPTY_SELECTION, 17, {}, order);
  assert.deepEqual(s.ids, [17]);
  s = clickSelect(s, 16, { toggle: true }, order);
  assert.deepEqual(s.ids, [17, 16]);
  s = clickSelect(s, 17, { toggle: true }, order);
  assert.deepEqual(s.ids, [16]);
  s = clickSelect(clickSelect(EMPTY_SELECTION, 18, {}, order), 15, { shift: true }, order);
  assert.deepEqual(s.ids, [18, 17, 16, 15]);
  // Shift from the same anchor the other way replaces the range.
  s = clickSelect(s, 19, { shift: true }, order);
  assert.deepEqual(s.ids, [19, 18]);
  // Ctrl+Shift adds the range to what was selected.
  s = clickSelect(clickSelect(clickSelect(EMPTY_SELECTION, 11, {}, order), 19, { toggle: true }, order), 17, { shift: true, toggle: true }, order);
  assert.deepEqual(s.ids.sort(), [11, 17, 18, 19]);
});

test('↑ and ↓ move between dives, Shift grows the range', () => {
  const order = [19, 18, 17];
  let s = stepSelect(EMPTY_SELECTION, 1, order);
  assert.deepEqual(s.ids, [19]);
  s = stepSelect(s, 1, order);
  assert.deepEqual(s.ids, [18]);
  s = stepSelect(s, 1, order);
  s = stepSelect(s, 1, order);
  assert.deepEqual(s.ids, [17]);
  s = stepSelect(s, -1, order, true);
  assert.deepEqual(s.ids, [18, 17].sort().reverse());
  assert.deepEqual(keepSelection({ ids: [18, 5], anchor: 5, focus: 18 }, order), { ids: [18], anchor: 18, focus: 18 });
});

test('right-click menu for one dive and for several', () => {
  const available = new Set(['merge', 'addToTrip', 'edit', 'editTogether', 'copy', 'export', 'share', 'delete']);
  const keys = (entries) => entries.map((e) => e.key);
  const one = contextMenuEntries(1, { mac: false, available });
  assert.deepEqual(keys(one), ['addToTrip', 'edit', 'separator', 'copy', 'export', 'share', 'separator', 'delete']);
  const two = contextMenuEntries(2, { mac: false, available });
  assert.deepEqual(keys(two), ['merge', 'addToTrip', 'editTogether', 'separator', 'copy', 'export', 'share', 'separator', 'delete']);
  assert.deepEqual(
    two.filter((e) => 'shortcut' in e && e.shortcut).map((e) => e.shortcut),
    ['Ctrl+M', 'Ctrl+E', 'Ctrl+C', 'Ctrl+Maj+E', 'Suppr'],
  );
  assert.deepEqual(
    contextMenuEntries(2, { mac: true, available }).filter((e) => 'shortcut' in e && e.shortcut).map((e) => e.shortcut),
    ['⌘M', '⌘E', '⌘C', '⇧⌘E', '⌫'],
  );
  assert.equal(two.at(-1).danger, true);
  // Only what the app can do: no empty group, no separator at either end.
  assert.deepEqual(keys(contextMenuEntries(2, { mac: false, available: new Set(['export', 'delete']) })), ['export', 'separator', 'delete']);
  assert.deepEqual(contextMenuEntries(0, { mac: false, available }), []);
});

test('merge stays in the menu, disabled with its reason, when the dives cannot be merged (task 178)', () => {
  const available = new Set(['merge', 'addToTrip', 'edit', 'editTogether', 'copy', 'export', 'share', 'delete']);
  const merge = (opts) => contextMenuEntries(2, { mac: false, available, ...opts }).find((e) => e.key === 'merge');
  assert.equal(merge({ mergeable: true }).disabled, undefined);
  assert.equal(merge({ mergeable: true }).hint, undefined);
  assert.equal(merge({ mergeable: false }).disabled, true);
  assert.equal(merge({ mergeable: false }).hint, 'multiDive.mergeBlocked');
  // One dive: no merge item at all; the other entries stay, in the task's order, Partager… included.
  assert.equal(contextMenuEntries(1, { mac: false, available, mergeable: false }).some((e) => e.key === 'merge'), false);
  assert.deepEqual(
    contextMenuEntries(3, { mac: false, available, mergeable: false }).map((e) => e.key),
    ['merge', 'addToTrip', 'editTogether', 'separator', 'copy', 'export', 'share', 'separator', 'delete'],
  );
});

test('the menu of the empty area offers Coller, disabled without dives on the clipboard', () => {
  assert.deepEqual(emptyAreaMenuEntries({ mac: false, canPaste: true }).map((e) => [e.key, e.disabled, e.shortcut]), [['paste', false, 'Ctrl+V']]);
  assert.equal(emptyAreaMenuEntries({ mac: true, canPaste: false })[0].disabled, true);
  assert.equal(emptyAreaMenuEntries({ mac: true, canPaste: false })[0].shortcut, '⌘V');
});

test('the summary of several dives', () => {
  assert.deepEqual(selectionSummary([dives[6], dives[5]]), { count: 2, numbers: [6, 7], seconds: 12240, maxDepthMm: 79600 });
});

test('pane widths stay within the window', () => {
  assert.equal(clampTableWidth(720, 1344), 720);
  assert.equal(clampTableWidth(1200, 1344), 944);
  assert.equal(clampTableWidth(100, 1344), 420);
});

test('the trips a run of dives can join, above and below (task 194)', async () => {
  const { adjacentTrips } = await import('../../app/src/lib/desktop-table.js');
  // Newest first: 9 8 7 6 5 | trip 100: 4 3 2 1.
  assert.deepEqual(adjacentTrips(dives, [15]), { previous: null, next: { id: 100, location: '' } });
  assert.deepEqual(adjacentTrips(dives, [16, 15]).next?.id, 100);
  assert.deepEqual(adjacentTrips(dives, [19]), { previous: null, next: null });
  // Not consecutive: nothing.
  assert.deepEqual(adjacentTrips(dives, [17, 15]), { previous: null, next: null });
  // A dive of the trip itself does not join its own trip.
  assert.deepEqual(adjacentTrips(dives, [14]), { previous: null, next: null });
  // A dive just below a trip: the trip is « previous ».
  const below = [...dives, { ...dives[0], id: 10, number: 0, date: '2012-01-01T10:00:00', trip: null }];
  assert.equal(adjacentTrips(below, [10]).previous?.id, 100);
});

test("columns keep the diver's order, N° first (task 181)", async () => {
  const { shownColumns, moveColumn, dropTarget } = await import('../../app/src/lib/desktop-table.js');
  assert.deepEqual(shownColumns(['site', 'date', 'number', 'duration']).map((c) => c.key), ['number', 'site', 'date', 'duration']);
  assert.deepEqual(shownColumns(['site']).map((c) => c.key), ['number', 'date', 'site']);
  const keys = ['number', 'date', 'site', 'maxDepth', 'duration', 'buddies'];
  // « Site » dropped between Durée and Compagnons.
  assert.deepEqual(moveColumn(keys, 'site', 4), ['number', 'date', 'maxDepth', 'duration', 'site', 'buddies']);
  assert.deepEqual(moveColumn(keys, 'buddies', 0), ['number', 'buddies', 'date', 'site', 'maxDepth', 'duration']);
  assert.deepEqual(moveColumn(keys, 'number', 3), keys);
  const heads = keys.map((key, i) => ({ key, left: i * 100, right: i * 100 + 100 }));
  assert.deepEqual(dropTarget(heads, 'site', 470), { index: 4, before: 'duration', after: 'buddies' });
  assert.deepEqual(dropTarget(heads, 'site', 10), { index: 1, before: 'number', after: 'date' });
  assert.deepEqual(dropTarget(heads, 'site', 900), { index: 5, before: 'buddies', after: null });
});

test('fittingColumns drops the trailing columns that do not fit and keeps N° and Date', async () => {
  const { fittingColumns, shownColumns } = await import('../../app/src/lib/desktop-table.js');
  const all = shownColumns(['number', 'date', 'site', 'maxDepth', 'duration', 'buddies', 'waterTemp', 'computer']);
  const keys = (w) => fittingColumns(all, w).map((c) => c.key);
  assert.deepEqual(keys(0), all.map((c) => c.key), 'not measured yet: everything');
  assert.deepEqual(keys(2000), all.map((c) => c.key));
  assert.deepEqual(keys(100), ['number', 'date'], 'N° and Date are never dropped');
  assert.deepEqual(keys(560), ['number', 'date', 'site', 'maxDepth', 'duration']);
  assert.ok(keys(700).length > keys(560).length);
});

test('tableWidthFor: 760 in a wide window, 57 % of the view in a narrow one, the remembered width otherwise', async () => {
  const { tableWidthFor } = await import('../../app/src/lib/desktop-table.js');
  assert.equal(tableWidthFor(null, 1344), 760);
  assert.equal(tableWidthFor(null, 1104), 629);
  assert.equal(tableWidthFor(null, 1824), 760);
  assert.equal(tableWidthFor(500, 1104), 500);
});

test('column widths: clamped to the minimum and maximum, unknown columns dropped (task 181)', async () => {
  const { clampColumnWidth, cleanColumnWidths, minColumnWidth, COLUMN_MAX_WIDTH, fittingColumns } = await import('../../app/src/lib/desktop-table.js');
  assert.equal(clampColumnWidth('date', 10), minColumnWidth('date'));
  assert.equal(clampColumnWidth('site', 5000), COLUMN_MAX_WIDTH);
  assert.equal(clampColumnWidth('site', 301.4), 301);
  assert.deepEqual(cleanColumnWidths({ site: 300, bogus: 200, date: 'x', duration: 1 }), { site: 300, duration: minColumnWidth('duration') });
  assert.deepEqual(cleanColumnWidths(null), {});
  // A widened column needs its own width: the ones that no longer fit are left out.
  const all = shownColumns(['date', 'site', 'maxDepth', 'duration']);
  assert.equal(fittingColumns(all, 520).length, 5);
  assert.equal(fittingColumns(all, 520, { site: 400 }).length, 4);
});

test('columns and widths are stored per logbook through the device store only (task 181)', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../../app/src/lib/desktop-logbook.svelte.js', import.meta.url), 'utf8');
  assert.match(src, /remembered\(logbookKey\(COLUMNS_KEY\)/);
  assert.match(src, /remembered\(logbookKey\(COLUMN_WIDTHS_KEY\)/);
  assert.match(src, /deviceStore\.setItem\(logbookKey\(COLUMNS_KEY\)/);
  assert.match(src, /deviceStore\.setItem\(logbookKey\(COLUMN_WIDTHS_KEY\)/);
  assert.doesNotMatch(src, /localStorage/);
});

// --- Task 2026-11-18-279, item 2: the lighter desktop list. ---

test('the Profile column is in the picker, off by default, and never sortable', async () => {
  const { COLUMNS, DEFAULT_COLUMNS, shownColumns, toggleColumn } = await import('../../app/src/lib/desktop-table.js');
  const profile = COLUMNS.find((c) => c.key === 'profile');
  assert.ok(profile);
  assert.equal(profile.defaultShown, false);
  assert.equal(profile.sortable, false);
  assert.ok(!DEFAULT_COLUMNS.includes('profile'));
  assert.deepEqual(DEFAULT_COLUMNS, ['number', 'date', 'site', 'maxDepth', 'duration', 'buddies']);
  // The picker adds it last; a saved order is kept as it is (defaults apply only when nothing is saved).
  const saved = ['number', 'buddies', 'date', 'site'];
  assert.deepEqual(shownColumns(toggleColumn(saved, 'profile')).map((c) => c.key), ['number', 'buddies', 'date', 'site', 'profile']);
  assert.deepEqual(shownColumns(saved).map((c) => c.key), saved);
});

test('tableRows marks the dive that closes a trip card', async () => {
  const { tableRows, DEFAULT_SORT } = await import('../../app/src/lib/desktop-table.js');
  const d = (id, tripId) => ({ id, number: id, date: `2013-02-0${id}T10:00:00`, trip: tripId ? { id: tripId, location: '' } : null });
  const rows = tableRows([d(3, 7), d(2, 7), d(1, 0)], DEFAULT_SORT, {});
  assert.deepEqual(rows.filter((r) => r.type === 'dive').map((r) => [r.dive.id, r.inTrip, !!r.last]), [[3, true, false], [2, true, true], [1, false, false]]);
});

test('the year line follows the first visible dive and counts the year', async () => {
  const { yearCounts, yearLineAt, rowOffsets, tableRows, DEFAULT_SORT, showsYearLine, windowRange, BODY_TOP, BODY_TOP_YEAR, ROW_HEIGHT } = await import('../../app/src/lib/desktop-table.js');
  const dives = [];
  for (let i = 0; i < 3; i++) dives.push({ id: 10 - i, number: 10 - i, date: `2026-0${3 - i}-01T10:00:00`, trip: null });
  for (let i = 0; i < 4; i++) dives.push({ id: 6 - i, number: 6 - i, date: `2013-02-0${4 - i}T10:00:00`, trip: { id: 1, location: '' } });
  const rows = tableRows(dives, DEFAULT_SORT, {});
  const counts = yearCounts(dives);
  assert.equal(counts.get('2026'), 3);
  const o = rowOffsets(rows);
  assert.deepEqual(yearLineAt(rows, o, 0, counts), { year: '2026', count: 3 });
  assert.deepEqual(yearLineAt(rows, o, 2 * ROW_HEIGHT + 10, counts), { year: '2026', count: 3 });
  // The trip row reaches the top: its first dive's year.
  assert.deepEqual(yearLineAt(rows, o, 3 * ROW_HEIGHT, counts), { year: '2013', count: 4 });
  assert.equal(yearLineAt([], new Float64Array(1), 0, counts), null);
  assert.equal(showsYearLine({ key: 'date', descending: true }), true);
  assert.equal(showsYearLine({ key: 'maxDepth', descending: true }), false);
  // The window starts later when the year line makes the sticky area taller.
  const big = rowOffsets(Array.from({ length: 500 }, () => ({ type: 'dive' })));
  assert.ok(windowRange(big, 5000, 800, BODY_TOP_YEAR).start <= windowRange(big, 5000, 800, BODY_TOP).start);
  assert.equal(BODY_TOP_YEAR - BODY_TOP, 32);
});

test('the Date column reads « lun. 14 sept. 2026 » with the weekday', async () => {
  const { formatWeekdayDate } = await import('../../app/src/lib/format.js');
  const text = formatWeekdayDate('2026-09-14T10:15:00');
  assert.match(text, /^\p{L}+\.? /u);
  assert.match(text, /2026/);
});
