// @ts-check
// The desktop logbook's table (task 2026-11-15-169): its columns, sorting, rows with
// expandable trips, multiple selection and the right-click menu's items. Pure functions:
// the component (components/DesktopLogbookTable.svelte) formats and draws.

/**
 * The extra values of a dive for the table (the core's dive_columns, opendives.h).
 * @typedef {{id: number, waterTempMk: number, airTempMk: number, meanDepthMm: number, sacMlMin: number,
 *   rating: number, buddies: string[], guides: string[], computer: string, suit: string, gases: string[],
 *   tags: string[], divemode: string, country: string}} DiveColumns
 */

/**
 * @typedef {{key: string, label: string, numeric: boolean, defaultShown: boolean,
 *   value: (dive: import('opendives-core').Dive, extra: DiveColumns|undefined) => string|number}} Column
 */

/** Text of a list for sorting: « Anne, Marc ». */
const joined = (/** @type {string[]|undefined} */ list) => (list ?? []).join(', ');

/**
 * Every column, in the order they show. `label` is the i18n key of the header; `numeric`
 * columns are right-aligned with tabular figures. Sorting reads `value`: numbers for
 * numeric columns (0, unknown, sorts with the smallest), text otherwise.
 * @type {Column[]}
 */
export const COLUMNS = [
  { key: 'number', label: 'desktop.column.number', numeric: true, defaultShown: true, value: (d) => d.number },
  { key: 'date', label: 'desktop.column.date', numeric: false, defaultShown: true, value: (d) => d.date },
  { key: 'site', label: 'desktop.column.site', numeric: false, defaultShown: true, value: (d) => d.site },
  { key: 'maxDepth', label: 'desktop.column.maxDepth', numeric: true, defaultShown: true, value: (d) => d.maxDepthMm },
  { key: 'duration', label: 'desktop.column.duration', numeric: true, defaultShown: true, value: (d) => d.durationSeconds },
  { key: 'buddies', label: 'desktop.column.buddies', numeric: false, defaultShown: true, value: (_, x) => x?.buddies?.[0] ?? '' },
  { key: 'waterTemp', label: 'desktop.column.waterTemp', numeric: true, defaultShown: false, value: (_, x) => x?.waterTempMk ?? 0 },
  { key: 'guides', label: 'desktop.column.guides', numeric: false, defaultShown: false, value: (_, x) => joined(x?.guides) },
  { key: 'computer', label: 'desktop.column.computer', numeric: false, defaultShown: false, value: (_, x) => x?.computer ?? '' },
  { key: 'gases', label: 'desktop.column.gases', numeric: false, defaultShown: false, value: (_, x) => joined(x?.gases) },
  { key: 'suit', label: 'desktop.column.suit', numeric: false, defaultShown: false, value: (_, x) => x?.suit ?? '' },
  { key: 'meanDepth', label: 'desktop.column.meanDepth', numeric: true, defaultShown: false, value: (_, x) => x?.meanDepthMm ?? 0 },
  { key: 'sac', label: 'desktop.column.sac', numeric: true, defaultShown: false, value: (_, x) => x?.sacMlMin ?? 0 },
  { key: 'airTemp', label: 'desktop.column.airTemp', numeric: true, defaultShown: false, value: (_, x) => x?.airTempMk ?? 0 },
  { key: 'rating', label: 'desktop.column.rating', numeric: true, defaultShown: false, value: (_, x) => x?.rating ?? 0 },
  { key: 'country', label: 'desktop.column.country', numeric: false, defaultShown: false, value: (_, x) => x?.country ?? '' },
  { key: 'tags', label: 'desktop.column.tags', numeric: false, defaultShown: false, value: (_, x) => joined(x?.tags) },
];

/** The narrowest a column reads well, in px (fluid layout: the columns that do not fit are left out). */
export const COLUMN_MIN_WIDTH = { number: 48, date: 170, maxDepth: 84, duration: 76, buddies: 116, waterTemp: 84, airTemp: 84, meanDepth: 84, rating: 84 };

/**
 * The columns that fit in a table `width` px wide: N° and Date always, then the others in the diver's order while
 * they fit. The ones left out stay chosen; they come back when the pane is wider (docs/system-design.md,
 * section 7, « Fluid desktop layout »).
 * @param {Column[]} columns the shown columns, in order
 * @param {number} width the room the table has, in px; 0 when not measured yet
 * @returns {Column[]}
 */
export function fittingColumns(columns, width) {
  if (!width) return columns;
  let used = 0;
  /** @type {Column[]} */
  const kept = [];
  for (const column of columns) {
    const need = /** @type {Record<string, number>} */ (COLUMN_MIN_WIDTH)[column.key] ?? 120;
    const required = column.key === 'number' || column.key === 'date';
    if (!required && used + need > width) continue;
    kept.push(column);
    used += need;
  }
  return kept;
}

/** The columns shown when the diver has chosen none. */
export const DEFAULT_COLUMNS = COLUMNS.filter((c) => c.defaultShown).map((c) => c.key);

/**
 * The shown columns, in the diver's order (task 2026-11-15-181), from a remembered list:
 * unknown keys dropped, N° always first, Date always shown (so that a row can be found).
 * @param {string[]|null|undefined} keys
 * @returns {Column[]}
 */
export function shownColumns(keys) {
  const list = (keys?.length ? keys : DEFAULT_COLUMNS).filter((k, i, all) => all.indexOf(k) === i && k !== 'number');
  if (!list.includes('date')) list.unshift('date');
  return ['number', ...list].map((k) => COLUMNS.find((c) => c.key === k)).filter((c) => !!c);
}

/**
 * The column order after moving `key` so that it lands at `index` among the shown columns
 * (0 is N°, which never moves: an index of 0 means just after it).
 * @param {string[]} keys the shown columns, in order (N° first)
 * @param {string} key
 * @param {number} index where it lands, counted in the list without it
 * @returns {string[]}
 */
export function moveColumn(keys, key, index) {
  if (key === 'number' || !keys.includes(key)) return keys;
  const rest = keys.filter((k) => k !== key);
  const at = Math.max(1, Math.min(rest.length, index));
  return [...rest.slice(0, at), key, ...rest.slice(at)];
}

/**
 * Where a dragged header lands, from the pointer's x and the headers' edges: the gap between
 * two columns nearest to the pointer, never before N°. Returns the index in the list without
 * the dragged column, and the neighbours' keys for the announcement.
 * @param {{key: string, left: number, right: number}[]} heads the shown headers, in order
 * @param {string} key the dragged column
 * @param {number} x
 * @returns {{index: number, before: string|null, after: string|null}}
 */
export function dropTarget(heads, key, x) {
  const rest = heads.filter((h) => h.key !== key);
  let index = rest.length;
  for (let i = 0; i < rest.length; i++) {
    if (x < (rest[i].left + rest[i].right) / 2) {
      index = i;
      break;
    }
  }
  index = Math.max(1, index);
  return { index, before: rest[index - 1]?.key ?? null, after: rest[index]?.key ?? null };
}

/**
 * The column list after the columns button adds or removes `key`.
 * @param {string[]} keys
 * @param {string} key
 * @returns {string[]}
 */
export function toggleColumn(keys, key) {
  if (key === 'number' || key === 'date') return keys;
  // The diver's order is kept: a removed column leaves its place, an added one goes last.
  return keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key];
}

/** @typedef {{key: string, descending: boolean}} Sort */

/** Date, newest first: the logbook's order. */
export const DEFAULT_SORT = { key: 'date', descending: true };

/**
 * The sort after a click on a column's header: the same column reverses; another
 * starts descending for numbers and dates (largest, newest first), ascending for text.
 * @param {Sort} sort
 * @param {string} key
 * @returns {Sort}
 */
export function nextSort(sort, key) {
  if (sort.key === key) return { key, descending: !sort.descending };
  const column = COLUMNS.find((c) => c.key === key);
  return { key, descending: !!column && (column.numeric || key === 'date') };
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/**
 * The dives sorted by `sort`; ties keep the logbook's order (date, then number), newest first.
 * Empty text sorts last whatever the direction, so that « Site à préciser » never heads the list.
 * @param {import('opendives-core').Dive[]} dives
 * @param {Map<number, DiveColumns>} extras
 * @param {Sort} sort
 * @returns {import('opendives-core').Dive[]}
 */
export function sortDives(dives, extras, sort) {
  const column = COLUMNS.find((c) => c.key === sort.key) ?? COLUMNS[1];
  const sign = sort.descending ? -1 : 1;
  const tie = (/** @type {import('opendives-core').Dive} */ a, /** @type {import('opendives-core').Dive} */ b) =>
    b.date.localeCompare(a.date) || b.number - a.number;
  return [...dives].sort((a, b) => {
    const va = column.value(a, extras.get(a.id));
    const vb = column.value(b, extras.get(b.id));
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sign || tie(a, b);
    const sa = String(va);
    const sb = String(vb);
    if (!sa !== !sb) return sa ? -1 : 1;
    if (column.key === 'date') return sa.localeCompare(sb) * sign || tie(a, b);
    return collator.compare(sa, sb) * sign || tie(a, b);
  });
}

/**
 * @typedef {{type: 'dive', dive: import('opendives-core').Dive, inTrip: boolean}
 *   | {type: 'trip', id: number, location: string, dives: import('opendives-core').Dive[], expanded: boolean}} TableRow
 */

/**
 * The table's rows. Sorted by date or number, the dives of a trip gather under one
 * expandable trip row (at the place of its first dive in that order); sorted by any other
 * column, the rows are the dives alone, since a trip's dives no longer follow each other.
 * A trip of one dive is still a trip row.
 * @param {import('opendives-core').Dive[]} sorted
 * @param {Sort} sort
 * @param {Record<number, boolean>} collapsed trips the diver folded, by trip id
 * @returns {TableRow[]}
 */
export function tableRows(sorted, sort, collapsed) {
  if (sort.key !== 'date' && sort.key !== 'number') return sorted.map((dive) => ({ type: 'dive', dive, inTrip: false }));
  /** @type {Map<number, import('opendives-core').Dive[]>} */
  const byTrip = new Map();
  for (const d of sorted) {
    if (!d.trip) continue;
    const list = byTrip.get(d.trip.id);
    if (list) list.push(d);
    else byTrip.set(d.trip.id, [d]);
  }
  /** @type {TableRow[]} */
  const rows = [];
  const placed = new Set();
  for (const d of sorted) {
    if (!d.trip) {
      rows.push({ type: 'dive', dive: d, inTrip: false });
      continue;
    }
    if (placed.has(d.trip.id)) continue;
    placed.add(d.trip.id);
    const dives = byTrip.get(d.trip.id) ?? [d];
    const expanded = !collapsed[d.trip.id];
    rows.push({ type: 'trip', id: d.trip.id, location: d.trip.location, dives, expanded });
    if (expanded) for (const dive of dives) rows.push({ type: 'dive', dive, inTrip: true });
  }
  return rows;
}

/** The dives of the rows, in their order: what ↑ ↓ and Shift+click walk through. */
export const rowDiveIds = (/** @type {TableRow[]} */ rows) => rows.flatMap((r) => (r.type === 'dive' ? [r.dive.id] : []));

/** @typedef {{ids: number[], anchor: number|null, focus: number|null}} Selection */

/** @type {Selection} */
export const EMPTY_SELECTION = { ids: [], anchor: null, focus: null };

/**
 * The selection after a click on a dive's row: a plain click selects that dive alone;
 * Ctrl (⌘ on macOS) adds or removes it; Shift selects from the anchor to it, in the rows'
 * order (with Ctrl too, added to what was selected).
 * @param {Selection} selection
 * @param {number} id
 * @param {{shift?: boolean, toggle?: boolean}} keys
 * @param {number[]} order the dives' ids in the rows' order
 * @returns {Selection}
 */
export function clickSelect(selection, id, keys, order) {
  if (keys.shift && selection.anchor !== null && order.includes(selection.anchor)) {
    const a = order.indexOf(selection.anchor);
    const b = order.indexOf(id);
    const range = order.slice(Math.min(a, b), Math.max(a, b) + 1);
    const ids = keys.toggle ? [...new Set([...selection.ids, ...range])] : range;
    return { ids, anchor: selection.anchor, focus: id };
  }
  if (keys.toggle) {
    const has = selection.ids.includes(id);
    const ids = has ? selection.ids.filter((x) => x !== id) : [...selection.ids, id];
    return { ids, anchor: id, focus: id };
  }
  return { ids: [id], anchor: id, focus: id };
}

/**
 * The selection after ↑ or ↓: the next dive in the rows' order, alone (with Shift, the
 * range from the anchor grows or shrinks). With nothing selected, the first dive.
 * @param {Selection} selection
 * @param {1|-1} step
 * @param {number[]} order
 * @param {boolean} [shift]
 * @returns {Selection}
 */
export function stepSelect(selection, step, order, shift = false) {
  if (!order.length) return selection;
  const at = selection.focus === null ? -1 : order.indexOf(selection.focus);
  const next = order[at < 0 ? 0 : Math.min(order.length - 1, Math.max(0, at + step))];
  if (shift) return clickSelect(selection.anchor === null ? { ...selection, anchor: next } : selection, next, { shift: true }, order);
  return { ids: [next], anchor: next, focus: next };
}

/**
 * The selection kept after the logbook changes (a reload, a deletion): the dives still there.
 * @param {Selection} selection
 * @param {number[]} order
 * @returns {Selection}
 */
export function keepSelection(selection, order) {
  const present = new Set(order);
  const ids = selection.ids.filter((id) => present.has(id));
  const keep = (/** @type {number|null} */ id) => (id !== null && present.has(id) ? id : (ids[0] ?? null));
  return { ids, anchor: keep(selection.anchor), focus: keep(selection.focus) };
}

/**
 * @typedef {{key: string, label: string, icon: string, shortcut?: string, danger?: boolean, disabled?: boolean, text?: string, hint?: string}
 *   | {key: 'separator'}} MenuEntry
 */

/**
 * The right-click menu for the selected dives, in order (task 2026-11-15-169): only what
 * applies to them. `shortcut` names the keys in the platform's words (« Ctrl+E », « ⌘E »).
 * Merging needs two dives or more; « Modifier ensemble… » is « Modifier » for one dive.
 * `available` lists the actions the app can do; the others are left out. `mergeable` tells
 * whether the selected dives can be merged (task 2026-11-15-178, `canMerge` of lib/multi-dive.js):
 * when not, « Fusionner » stays in the menu, disabled, with its reason as a supporting line (`hint`,
 * a translation key).
 * @param {number} count number of dives selected (1 or more)
 * @param {{mac: boolean, available: Set<string>, mergeable?: boolean}} options
 * @returns {MenuEntry[]}
 */
export function contextMenuEntries(count, { mac, available, mergeable = true }) {
  if (count < 1) return [];
  const key = (/** @type {string} */ k, /** @type {boolean} */ shift = false) =>
    mac ? `${shift ? '⇧' : ''}⌘${k}` : `Ctrl+${shift ? 'Maj+' : ''}${k}`;
  /** @type {MenuEntry[][]} */
  const groups = [
    [
      count > 1
        ? { key: 'merge', label: 'desktop.menu.merge', icon: 'merge', shortcut: key('M'), ...(mergeable ? {} : { disabled: true, hint: 'multiDive.mergeBlocked' }) }
        : null,
      { key: 'addToTrip', label: 'desktop.menu.addToTrip', icon: 'trip' },
      count > 1
        ? { key: 'editTogether', label: 'desktop.menu.editTogether', icon: 'edit', shortcut: key('E') }
        : { key: 'edit', label: 'desktop.menu.edit', icon: 'edit', shortcut: key('E') },
    ].filter((e) => e !== null && available.has(e.key)),
    [
      { key: 'copy', label: 'desktop.menu.copy', icon: 'copy', shortcut: key('C') },
      { key: 'export', label: 'desktop.menu.export', icon: 'export', shortcut: key('E', true) },
      { key: 'share', label: 'desktop.menu.share', icon: 'share' },
    ].filter((e) => available.has(e.key)),
    [{ key: 'delete', label: 'desktop.menu.delete', icon: 'delete', shortcut: mac ? '⌫' : 'Suppr', danger: true }].filter((e) =>
      available.has(e.key),
    ),
  ].map((g) => /** @type {MenuEntry[]} */ (g));
  /** @type {MenuEntry[]} */
  const entries = [];
  for (const group of groups.filter((g) => g.length)) {
    if (entries.length) entries.push({ key: 'separator' });
    entries.push(...group);
  }
  return entries;
}

/**
 * The right-click menu of the table's empty area (task 2026-11-15-178): « Coller », disabled when
 * the clipboard holds no dives.
 * @param {{mac: boolean, canPaste: boolean}} options
 * @returns {MenuEntry[]}
 */
export function emptyAreaMenuEntries({ mac, canPaste }) {
  return [{ key: 'paste', label: 'desktopMultiDive.paste', icon: 'file', shortcut: mac ? '⌘V' : 'Ctrl+V', disabled: !canPaste }];
}

/**
 * What the detail pane says for several dives: their numbers (« 6 et 7 », « 2, 5 et 9 »,
 * long lists shortened by the caller), the time under water and the deepest depth.
 * @param {import('opendives-core').Dive[]} dives
 * @returns {{count: number, numbers: number[], seconds: number, maxDepthMm: number}}
 */
export function selectionSummary(dives) {
  return {
    count: dives.length,
    numbers: dives.map((d) => d.number).sort((a, b) => a - b),
    seconds: dives.reduce((s, d) => s + d.durationSeconds, 0),
    maxDepthMm: dives.reduce((m, d) => Math.max(m, d.maxDepthMm), 0),
  };
}

/**
 * The pane widths kept within the window: the table at least `minTable`, the detail at
 * least `minDetail`.
 * @param {number} wanted table width asked (dragging the handle, or remembered)
 * @param {number} available width of both panes together
 * @param {{minTable?: number, minDetail?: number}} [limits]
 * @returns {number}
 */
export function clampTableWidth(wanted, available, { minTable = 420, minDetail = 400 } = {}) {
  return Math.round(Math.max(minTable, Math.min(wanted, available - minDetail)));
}

/**
 * The width of the table's pane: what the diver dragged it to, or, until then, 760 dp in a wide window and
 * 57 % of the view in a narrower one (fluid layout: the detail keeps its room in a 1200 dp window).
 * @param {number|null|undefined} stored the remembered width, null when the diver never moved the handle
 * @param {number} available the width of the view
 * @returns {number}
 */
export function tableWidthFor(stored, available) {
  return typeof stored === 'number' ? stored : Math.min(760, Math.round(available * 0.57));
}

/**
 * The trips the selected dives can join (task 2026-11-15-194, « Fusionner avec le voyage
 * précédent / suivant »): in the logbook's order, newest first, the selection must be one run
 * of consecutive dives; « previous » is the trip of the dive just above it (more recent), « next »
 * that of the dive just below, each only when the run is not already in that trip.
 * @param {import('opendives-core').Dive[]} dives every dive of the logbook
 * @param {number[]} ids the selected dives
 * @returns {{previous: {id: number, location: string}|null, next: {id: number, location: string}|null}}
 */
export function adjacentTrips(dives, ids) {
  const none = { previous: null, next: null };
  if (!ids.length) return none;
  const order = [...dives].sort((a, b) => b.date.localeCompare(a.date) || b.number - a.number);
  const chosen = new Set(ids);
  const at = order.map((d, i) => (chosen.has(d.id) ? i : -1)).filter((i) => i >= 0);
  if (at.length !== ids.length) return none;
  const first = at[0];
  const last = at[at.length - 1];
  if (last - first + 1 !== at.length) return none;
  const inside = new Set(order.slice(first, last + 1).map((d) => d.trip?.id ?? null));
  /** @param {import('opendives-core').Dive|undefined} d */
  const tripOf = (d) => (d?.trip && !(inside.size === 1 && inside.has(d.trip.id)) ? { id: d.trip.id, location: d.trip.location } : null);
  return { previous: tripOf(order[first - 1]), next: tripOf(order[last + 1]) };
}

// --- Windowing: the table draws only the rows in view. ----------------------------------------

/** A dive row is 48 px plus the 2 px between rows; a trip row 44 px plus 2 (the table's styles set the 48 and the 44). */
export const ROW_HEIGHT = 50;
export const TRIP_HEIGHT = 46;
/** From the top of the table to the first row: spacing, header (36), spacing. */
export const BODY_TOP = 40;
/** Rows kept drawn above and below the view, so a fast scroll or a held key finds rows in place. */
export const OVERSCAN = 10;

/**
 * Where each row starts, in px from the first row's top; one more entry holds the total height.
 * @param {{type: string}[]} rows
 * @returns {Float64Array}
 */
export function rowOffsets(rows) {
  const out = new Float64Array(rows.length + 1);
  for (let i = 0; i < rows.length; i++) out[i + 1] = out[i] + (rows[i].type === 'trip' ? TRIP_HEIGHT : ROW_HEIGHT);
  return out;
}

/**
 * The first row whose bottom is below `y` (px from the first row's top); the row count when none.
 * @param {Float64Array} offsets from rowOffsets
 * @param {number} y
 */
export function rowAt(offsets, y) {
  let lo = 0;
  let hi = offsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid + 1] > y) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/**
 * The rows to draw for a scroll position: those in view plus the overscan, and the height of the
 * two spacer rows that stand for the others (less the 2 px a row of their own would add around them).
 * @param {Float64Array} offsets from rowOffsets
 * @param {number} scrollTop
 * @param {number} viewHeight the scroll area's height; unknown (0) counts as a tall screen
 * @returns {{start: number, end: number, padTop: number, padBottom: number}}
 */
export function windowRange(offsets, scrollTop, viewHeight) {
  const n = offsets.length - 1;
  const top = scrollTop - BODY_TOP;
  const start = Math.max(0, rowAt(offsets, top) - OVERSCAN);
  const end = Math.min(n, rowAt(offsets, top + (viewHeight || 900)) + 1 + OVERSCAN);
  return {
    start,
    end,
    padTop: start > 0 ? offsets[start] - 2 : 0,
    padBottom: end < n ? offsets[n] - offsets[end] - 2 : 0,
  };
}

/**
 * The scroll position that brings row `index` fully into view (under the sticky header), the current one when it already is.
 * @param {Float64Array} offsets from rowOffsets
 * @param {number} index
 * @param {number} scrollTop
 * @param {number} viewHeight
 */
export function scrollForRow(offsets, index, scrollTop, viewHeight) {
  if (index < 0 || index >= offsets.length - 1) return scrollTop;
  const top = BODY_TOP + offsets[index];
  const bottom = top + (offsets[index + 1] - offsets[index]) - 2;
  const head = BODY_TOP - 2;
  if (top - head < scrollTop) return Math.max(0, top - head);
  if (bottom > scrollTop + viewHeight) return bottom - viewHeight;
  return scrollTop;
}
