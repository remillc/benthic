// @ts-check
// The state of the backup and restore screens (task 2026-11-19-290): the versions read so far, the deleted dives, and the
// choice shown in the detail pane (a tablet's, a desktop's) — shared by the phone's pages, the tablet's page and the
// desktop's dialog, which are the same screens. The reading and the restoring are lib/backup-history.js.
import { OpenDivesCore } from 'opendives-core';
import { listVersions, deletedDives, restoreVersion, restoreDive } from './backup-history.js';
import { afterRestore } from './logbook.svelte.js';

/** Versions read per page. */
export const PAGE = 10;

/**
 * @typedef {{ kind: 'version', id: string } | { kind: 'dive', key: string } | { kind: 'deleted' }} Choice
 */

export const backup = $state({
  /** @type {import('./backup-history.js').Version[]} */
  versions: [],
  more: false,
  /** @type {string|null} the current version's commit */
  head: null,
  loading: false,
  /** The history could not be read. */
  failed: false,
  /** Whether the first page was read (the screen shows its state from then on). */
  loaded: false,
  /** @type {import('./backup-history.js').DeletedDive[]|null} null: not searched yet */
  deleted: null,
  deletedLoading: false,
  /** What the detail pane shows (tablet, desktop). @type {Choice|null} */
  choice: null,
  /** A restore is running. */
  busy: false,
});

/** The calls of the core the history needs. */
const core = { history: (/** @type {string} */ action, /** @type {string[]} */ args) => OpenDivesCore.history(action, args) };

let reading = 0;

/** Reads the first page of the versions again (the screen opens, or a restore added one). */
export async function loadVersions() {
  const turn = ++reading;
  backup.loading = true;
  backup.failed = false;
  try {
    const page = await listVersions(core, { skip: 0, limit: Math.max(PAGE, backup.versions.length) });
    if (turn !== reading) return;
    backup.versions = page.versions;
    backup.more = page.more;
    backup.head = page.head;
    backup.loaded = true;
  } catch (e) {
    console.error('Reading the versions of the logbook', e);
    if (turn === reading) backup.failed = true;
  } finally {
    if (turn === reading) backup.loading = false;
  }
}

/** « Versions plus anciennes ». */
export async function moreVersions() {
  if (backup.loading || !backup.more) return;
  backup.loading = true;
  try {
    const page = await listVersions(core, { skip: backup.versions.length, limit: PAGE });
    backup.versions = [...backup.versions, ...page.versions];
    backup.more = page.more;
  } catch (e) {
    console.error('Reading older versions', e);
    backup.failed = true;
  } finally {
    backup.loading = false;
  }
}

/** Looks for the deleted dives in the whole history. */
export async function loadDeleted() {
  backup.deletedLoading = true;
  try {
    backup.deleted = await deletedDives(core);
  } catch (e) {
    console.error('Looking for the deleted dives', e);
    backup.deleted = [];
  } finally {
    backup.deletedLoading = false;
  }
}

/** Forgets what was read: the account or the logbook changed. */
export function resetBackup() {
  reading++;
  backup.versions = [];
  backup.more = false;
  backup.head = null;
  backup.loaded = false;
  backup.failed = false;
  backup.deleted = null;
  backup.choice = null;
}

/**
 * Restores the whole logbook to a version, as a new commit; the log is read again and the commit is sent like a change.
 * @param {string} commit @param {string} date shown in the commit message
 * @returns {Promise<boolean>} false: it failed, nothing changed
 */
export async function restoreWhole(commit, date) {
  backup.busy = true;
  try {
    await restoreVersion(core, commit, date);
    await afterRestore();
    backup.deleted = null;
    await loadVersions();
    return true;
  } catch (e) {
    console.error('Restoring a version of the logbook', e);
    return false;
  } finally {
    backup.busy = false;
  }
}

/**
 * Restores one dive to a version of its own, or brings a deleted one back.
 * @param {{ commit: string, dir: string, key: string, date?: string }} what
 * @returns {Promise<boolean>}
 */
export async function restoreOne(what) {
  backup.busy = true;
  try {
    await restoreDive(core, what);
    await afterRestore();
    backup.deleted = null;
    await loadVersions();
    return true;
  } catch (e) {
    console.error('Restoring a dive', e);
    return false;
  } finally {
    backup.busy = false;
  }
}

/** The core, for the screens that read details. */
export const historyCore = core;
