// @ts-check
// State of the desktop logbook (task 2026-11-15-169): the selection (shared by the table
// and the detail pane, which sums several dives up), the sort, the shown columns, the
// folded trips, the table's width, and the extra values of the columns. The sort, the
// columns and the widths are remembered on the device (lib/device-store.js).
import { OpenDivesCore } from 'opendives-core';
import { deviceStore } from './device-store.js';
import { DEFAULT_COLUMNS, DEFAULT_SORT, EMPTY_SELECTION } from './desktop-table.js';

const SORT_KEY = 'od.desktopSort';
const COLUMNS_KEY = 'od.desktopColumns';
const WIDTH_KEY = 'od.desktopTableWidth';

/** @template T @param {string} key @param {T} fallback @returns {T} */
function remembered(key, fallback) {
  try {
    const text = deviceStore.getItem(key);
    return text ? JSON.parse(text) : fallback;
  } catch {
    return fallback;
  }
}

export const desk = $state({
  /** @type {import('./desktop-table.js').Selection} */
  selection: EMPTY_SELECTION,
  /** @type {import('./desktop-table.js').Sort} */
  sort: DEFAULT_SORT,
  /** @type {string[]} */
  columns: DEFAULT_COLUMNS,
  /** @type {Record<number, boolean>} */
  collapsed: {},
  /** Width of the table's pane, in px (the detail takes the rest); null until the diver moves the handle (desktop-table.js, tableWidthFor). */
  tableWidth: /** @type {number|null} */ (null),
  /** The extra values of the columns, by dive id (the core's dive_columns). */
  extras: /** @type {Map<number, import('./desktop-table.js').DiveColumns>} */ (new Map()),
});

/** Reads the remembered choices: called once the device store is loaded. */
export function loadDesktopChoices() {
  desk.sort = remembered(SORT_KEY, DEFAULT_SORT);
  desk.columns = remembered(COLUMNS_KEY, DEFAULT_COLUMNS);
  desk.tableWidth = remembered(WIDTH_KEY, null);
}

/** @param {import('./desktop-table.js').Sort} sort */
export function setSort(sort) {
  desk.sort = sort;
  deviceStore.setItem(SORT_KEY, JSON.stringify(sort));
}

/** @param {string[]} columns */
export function setColumns(columns) {
  desk.columns = columns;
  deviceStore.setItem(COLUMNS_KEY, JSON.stringify(columns));
}

/** @param {number} width */
export function setTableWidth(width) {
  desk.tableWidth = width;
  deviceStore.setItem(WIDTH_KEY, JSON.stringify(width));
}

/**
 * Asks the core for the columns' extra values, after the logbook loads or changes. A core
 * without it (an older helper) leaves the extra columns empty.
 */
export async function loadExtras() {
  try {
    const list = /** @type {import('./desktop-table.js').DiveColumns[]} */ (await /** @type {any} */ (OpenDivesCore).diveColumns());
    desk.extras = new Map(list.map((x) => [x.id, x]));
  } catch (e) {
    console.error('Desktop columns', e);
  }
}
