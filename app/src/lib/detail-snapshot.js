// @ts-check
// Detail snapshot: the dive the detail pane opens at start (the first of the list), kept in the
// app's storage next to the list snapshot (lib/snapshot.js, same rules: a cache, one per
// logbook, the beta has its own key, versioned, ignored when it does not match) and drawn in the
// pane at once at the next start, while the core still reads the logbook. The dive identifiers
// change at every load, so the pane cannot open the real dive before the list is loaded: until
// then the snapshot is drawn by DiveDetail in its preview mode (nothing in it acts on data), and
// when the real dive opens, `seedStartDetail` hands this detail to the real page as its first
// frame (lib/dive-preload.js), which then reads the dive from the core as always.

import { logbookKey } from './window-logbook.js';
import { isRelease } from './edition.js';
import { groupByMonth } from './carnet-months.js';

/** @typedef {import('benthic-core').DiveDetail} DiveDetail */
/** @typedef {{ v: 1, date: string, number: number, order: string, detail: DiveDetail }} DetailSnapshot */

const KEY = logbookKey(isRelease ? 'bc.detailSnapshotBeta' : 'bc.detailSnapshot');
const VERSION = 1;
/** Samples kept at most: a longer profile is thinned (the real detail replaces it within a second). */
const MAX_SAMPLES = 1200;

/**
 * The order the first dive was the first of: the list of the tablet is by date, the desktop table
 * by its sort. A snapshot is drawn only where the order is the same as when it was kept.
 * @param {boolean} desktop @param {{ key: string, descending: boolean }} [sort] the table's sort
 */
export function orderOf(desktop, sort) {
  return desktop ? `table:${sort?.key ?? ''}:${sort?.descending ? 'desc' : 'asc'}` : 'list';
}

/**
 * What the first screen of the detail draws. Dropped: the tissues (a layer the diver turns on),
 * and the samples past MAX_SAMPLES (every array is thinned with the same stride, first and last kept).
 * @param {DiveDetail} detail
 * @returns {DiveDetail}
 */
export function trimDetail(detail) {
  const s = detail.samples;
  if (!s) return detail;
  const n = s.timeSeconds?.length ?? 0;
  const step = n > MAX_SAMPLES ? Math.ceil(n / MAX_SAMPLES) : 1;
  /** @param {any} array */
  const thin = (array) => {
    if (!Array.isArray(array) || step === 1) return array;
    const out = array.filter((_, i) => i % step === 0 || i === array.length - 1);
    return out;
  };
  /** Same indexes for every per-sample array: the last index is kept in all of them. */
  const samples = {
    ...s,
    timeSeconds: thin(s.timeSeconds),
    depthMm: thin(s.depthMm),
    cylinder: thin(s.cylinder),
    ceilingMm: thin(s.ceilingMm),
    calcCeilingMm: thin(s.calcCeilingMm),
    ppo2Mbar: thin(s.ppo2Mbar),
    temperatureMk: thin(s.temperatureMk),
    tissues: null,
  };
  return { ...detail, samples };
}

/**
 * @param {DiveDetail} detail the dive as the pane shows it
 * @param {string} order orderOf(...)
 * @returns {DetailSnapshot}
 */
export function buildDetailSnapshot(detail, order) {
  return { v: VERSION, date: detail.date, number: detail.number, order, detail: trimDetail(detail) };
}

/** @param {DetailSnapshot|null} snapshot null forgets it */
export function saveDetailSnapshot(snapshot) {
  try {
    if (snapshot) localStorage.setItem(KEY, JSON.stringify(snapshot));
    else localStorage.removeItem(KEY);
  } catch {
    // Not fatal: the next start shows the skeleton.
  }
}

/** Forgets it: sign-out, another logbook, data deleted (with the list snapshot). */
export function clearDetailSnapshot() {
  start = null;
  saveDetailSnapshot(null);
}

/** @returns {DetailSnapshot|null} */
export function readDetailSnapshot() {
  try {
    const text = localStorage.getItem(KEY);
    if (!text) return null;
    const s = JSON.parse(text);
    if (s?.v !== VERSION || typeof s.date !== 'string' || typeof s.number !== 'number' || typeof s.order !== 'string' || !s.detail?.samples?.timeSeconds) return null;
    return s;
  } catch {
    return null;
  }
}

/** Whether the snapshot is of this dive of the list (same date and number). @param {DetailSnapshot|null} snapshot @param {{ date: string, number: number }|null|undefined} dive */
export function snapshotIsOf(snapshot, dive) {
  return !!snapshot && !!dive && snapshot.date === dive.date && snapshot.number === dive.number;
}

/**
 * The dive the tablet's list opens first: the first dive of the first entry of the list as the
 * Logbook screen groups it (most recent first, a trip drawn as one row).
 * @template {{ id: number, date: string, number: number, trip?: any }} D
 * @param {D[]} sortedDives from the most recent to the oldest
 * @returns {D|null}
 */
export function firstDiveOf(sortedDives) {
  const first = groupByMonth(sortedDives)[0]?.entries[0];
  return (first?.type === 'trip' ? first.dives[0] : first?.dive) ?? null;
}

/**
 * The first row of the list snapshot: the dive the pane will open at this start.
 * @param {import('./snapshot.js').Snapshot|null} preview
 */
export function previewFirst(preview) {
  if (!preview) return null;
  return firstDiveOf(preview.entries.flatMap((entry) => (entry.type === 'trip' ? entry.dives : [entry.dive])));
}

/**
 * Keeps the detail of the dive the pane shows, when it is the list's first dive. `load` is dive-preload.js's
 * loadDive: the detail as the core reads it for this version of the logbook, not the snapshot that seeded the page.
 * @param {{ id: number, date: string, number: number }} first
 * @param {string} order orderOf(...)
 * @param {(id: number) => Promise<DiveDetail>} load
 */
export async function rememberFirstDetail(first, order, load) {
  const detail = await load(first.id);
  if (snapshotIsOf({ date: detail.date, number: detail.number, order, v: VERSION, detail }, first)) saveDetailSnapshot(buildDetailSnapshot(detail, order));
}

// --- The snapshot read at start, once --------------------------------------------------------------

/** @type {DetailSnapshot|null|undefined} undefined: not read yet */
let start;

/** The snapshot kept by the previous run, read the first time (before this run saves its own). */
export function startSnapshot() {
  if (start === undefined) start = readDetailSnapshot();
  return start;
}

/** The marker of a detail that is not of the logbook version it is read at: the real page reads the dive again. */
export const SEEDED_STAMP = ['detail-snapshot'];

/**
 * The real dive of the first row has an identifier now: hands the snapshot over as that dive's detail
 * for the page's first frame (the page reads it from the core right after). One-shot.
 * @param {{ id: number, date: string, number: number }} dive
 * @param {(id: number, detail: DiveDetail, stamp: unknown[]) => void} keep dive-preload.js keepDive
 * @returns {boolean} whether it matched
 */
export function seedStartDetail(dive, keep) {
  const snapshot = startSnapshot();
  if (!snapshotIsOf(snapshot, dive) || !snapshot) return false;
  keep(dive.id, { ...snapshot.detail, id: dive.id }, SEEDED_STAMP);
  start = null;
  return true;
}
