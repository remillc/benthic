// @ts-check
// Shared logbook state: dives, the log's units, sync status.
import { Network } from '@capacitor/network';
import { App as CapacitorApp } from '@capacitor/app';
import { shouldReconnect } from './reconnect.js';
import { untrack } from 'svelte';
import { deviceStore } from './device-store.js';
import { syncNetwork, syncAllowedOnThisNetwork, networkKnown, onSyncAllowedAgain } from './sync-network.svelte.js';
import { invalidateCoreCache, setCacheVersions } from './core-cache.js';
import { BenthicCore } from 'benthic-core';
import { runCsvImport } from './csv-import.js';
import { storedDemo } from './demo.js';
import { defaultPrefs } from './format.js';
import { mark } from './perf.js';
import { readSnapshot, saveSnapshot } from './snapshot.js';
import { clearDetailSnapshot } from './detail-snapshot.js';
import { ownLogbookWindow, noLogbookWindow } from './window-logbook.js';
import { nextProgress } from './sync-progress.js';
import { transferCount } from './first-launch.js';
import { failureCause, isRefused, retryDelay } from './sync-failure.js';
import { applyDeviceSettings, keepDiveComputers, prefsAfterLoad } from './settings.svelte.js';
import { fitFilesInZip, isZipName, MAX_ZIP_BYTES, toBase64 } from './zip-fit.js';
import { stageFile } from './staged-file.js';
import { importProgress } from './import-progress.svelte.js';
import { importPayload } from './import-files.js';
import { isRelease } from './edition.js';
import { sheetVariant } from './account-sheet.js';
import { loadBenthicPlusAccount, benthicPlusAccount, benthicPlusSubscriber, setBenthicPlusAccount } from './benthic-plus-state.svelte.js';
import { isIgnoredCloudAccount } from './subsurface-cloud.js';
import { isServerRepository } from './server-logbook.js';
import { signalAccountData } from './account-sync-signal.js';

/** @typedef {import('benthic-core').Dive} Dive */
/** @typedef {import('benthic-core').Prefs} Prefs */

/**
 * - syncing: the device's copy is shown, the sync with the cloud is running;
 * - cloud: read and synced with the Subsurface cloud;
 * - offline: the device's copy, the server did not answer;
 * - local: logbook on this device only (no account);
 * @typedef {'syncing'|'cloud'|'offline'|'local'} SyncState
 */

/**
 * Dives changed here and in the cloud on the same line, which Subsurface's
 * automatic merge could not combine (BenthicCore.syncConflicts).
 * @typedef {Extract<import('benthic-core').SyncConflicts, {conflict: true}>} Conflict
 */

/**
 * The dive list: always replaced whole on a change, never edited in place, so it is not a deep reactive
 * proxy (3,000 dives would be 3,000 proxies read by every derived value); only the swap of the array is tracked.
 * @type {Dive[]}
 */
let diveList = $state.raw([]);

export const logbook = $state({
  /** @type {Dive[]} */
  get dives() {
    return diveList;
  },
  set dives(value) {
    diveList = value;
  },
  /** Checked dives in the Logbook list, shared with the tablet detail pane. */
  checkedDiveIds: /** @type {number[]} */ ([]),
  /** The core's preferences (units, Settings); only the units until the first read. */
  prefs: /** @type {Prefs} */ ({ ...defaultPrefs }),
  /** @type {SyncState} */
  sync: 'local',
  /** Where the running sync is (lib/sync-progress.js); shown while sync is "syncing". */
  syncProgress: /** @type {import('./sync-progress.js').SyncProgress|null} */ (null),
  /**
   * The download after signing in, on the alpha first launch (task 2026-11-16-233): where it is, and the count of
   * what the core received; null when none runs.
   * @type {{ progress: import('./sync-progress.js').SyncProgress|null, n: number, total: number }|null}
   */
  firstDownload: null,
  loading: true,
  /**
   * Start (or a full reload): the device's copy is shown and the exchange with the server is still
   * running (todo 88); the Carnet shows a progress bar meanwhile. Not set by the syncs that follow an edit.
   */
  pulling: false,
  /**
   * The top of the list as it was at the last load (lib/snapshot.js): drawn
   * while the dives are read at start, never used as data.
   * @type {import('./snapshot.js').Snapshot|null}
   */
  preview: readWelcome() ? null : readSnapshot(),
  /** @type {string|null} */
  error: null,
  /** Cloud account email, or the user name for a git repository; empty without an account. */
  email: '',
  /** Where the logbook is synced: the Subsurface cloud, or the user's own git repository. */
  mode: /** @type {'cloud'|'git'} */ ('cloud'),
  /** The git repository, "host/owner/name"; empty for the cloud. */
  repository: '',
  /** The git repository is the signed-in Benthic server account's (release edition): shown as « Serveur Benthic ». */
  benthicPlus: false,
  /** Cloud server host in use, e.g. ssrf-cloud-eu.subsurface-divelog.org. */
  server: '',
  /** Local time of the last successful sync (ISO, no time zone), or null. */
  lastSync: /** @type {string|null} */ (readLastSync()),
  /** Local changes of the cloud log not sent yet. */
  pending: 0,
  /**
   * Fields changed and not sent yet, by dive number (spec, section 4,
   * <DiveRow>: "Notes edited, waiting to be sent"); read from the texts of
   * the pending commits, which list the edits as Subsurface writes them.
   */
  pendingByDive: /** @type {Record<number, string[]>} */ ({}),
  /**
   * A sync conflict to settle (spec, section 6, "Conflict"): read after each
   * sync of the cloud log, cleared once the diver chose a version.
   */
  conflict: /** @type {Conflict|null} */ (null),
  /** Why the last sync failed while the network works; null otherwise (spec, "Sync failures"). */
  syncFailure: /** @type {import('./sync-failure.js').SyncFailure|null} */ (null),
  /** The sheet explaining the failure is open. */
  syncFailureOpen: false,
  /** Minutes until the next automatic try; 0 when none is planned. */
  retryMinutes: 0,
  /** "Plus tard": the dialog is closed, sync stays paused until the choice is made. */
  conflictLater: false,
  /** First launch is shown (first start, or after signing out): nothing is loaded until a choice is made. */
  welcome: readWelcome(),
  /**
   * Release edition: the first launch stays on screen over the logbook while a logbook is being sent to the Benthic
   * server (task 2026-11-17-266); the logbook is already open under it.
   */
  welcomeHold: false,
  /** Last dive changed by an edit or an undo, for the detail screen. */
  edited: /** @type {{ id: number, dive: import('benthic-core').DiveDetail }|null} */ (null),
  /** Last trip changed by a trip change or an undo, for the trip screen. */
  editedTrip: /** @type {import('benthic-core').TripDetail|null} */ (null),
  /** Text of the step that Undo would revert, e.g. "Edit notes [#12]". */
  undoText: '',
  /** Text of the step that Redo would apply again; empty when none. */
  redoText: '',
  /** Increases at each site change, so that site screens read the sites again. */
  sitesVersion: 0,
  /**
   * An earlier version of the logbook is open read only (Sauvegarde et restauration, « Parcourir »): the core holds it
   * instead of the logbook, so nothing is saved or synced until it is closed (lib/backup.svelte.js).
   */
  browsing: false,
});

// What the kept answers of the core (lib/core-cache.js, lib/dive-preload.js) are tied to: they are read
// again once the list was read again or the sites changed.
setCacheVersions(() => untrack(() => [logbook.dives, logbook.sitesVersion]));

/**
 * One trip change (spec, section 4, "Trip"), saved and synced like a dive
 * edit; the logbook list is read again, as trips changed.
 * @param {Parameters<import('benthic-core').BenthicCorePlugin['tripAction']>[0]} options
 */
export async function tripChange(options) {
  const result = await BenthicCore.tripAction(options);
  logbook.editedTrip = result.trip ?? null;
  logbook.undoText = result.undo;
  logbook.redoText = result.redo ?? '';
  logbook.dives = await BenthicCore.listLoadedDives();
  await persistChanges();
  return result;
}

/**
 * "Group dives into trips" (Settings), the logbook's autogroup: one undoable
 * step, saved and synced like a trip change.
 * @param {boolean} on
 */
export async function setAutogroup(on) {
  const result = await BenthicCore.tripAction({ action: 'autogroup', value: on ? 'on' : 'off' });
  logbook.undoText = result.undo;
  logbook.redoText = result.redo ?? '';
  logbook.dives = await BenthicCore.listLoadedDives();
  logbook.prefs = await prefsAfterLoad();
  await persistChanges();
}

/**
 * Renames a cylinder type (Settings, cylinder types): the cylinders of that
 * type in the logbook too, one undoable step, saved and synced like an edit.
 * @param {string} name
 * @param {string} newName
 */
export async function renameCylinderType(name, newName) {
  const result = await BenthicCore.cylinderTypes({ action: 'rename', name, value: newName });
  invalidateCoreCache();
  logbook.undoText = result.undo;
  logbook.redoText = result.redo ?? '';
  await persistChanges();
  return result;
}

/**
 * What deleting one of the diver's cylinder types would do to the dives: how many lose the
 * cylinder and how many keep it, with its type cleared (the dive's only cylinder, or one a gas
 * change or the pressure graph depends on). Nothing changes.
 * @param {string} name
 * @returns {Promise<import('benthic-core').CylinderTypeDeletion>}
 */
export async function previewCylinderTypeDeletion(name) {
  const result = await BenthicCore.cylinderTypes({ action: 'deletePreview', name });
  return result.deletion ?? { removed: 0, kept: 0 };
}

/**
 * Deletes one of the diver's cylinder types: the type, and its cylinders from the dives that use
 * them (one undoable step, saved and synced like an edit), except where a dive depends on one.
 * @param {string} name
 */
export async function deleteCylinderType(name) {
  const result = await BenthicCore.cylinderTypes({ action: 'delete', name });
  invalidateCoreCache();
  logbook.undoText = result.undo;
  logbook.redoText = result.redo ?? '';
  logbook.dives = await BenthicCore.listLoadedDives();
  await persistChanges();
  return result;
}

/** Delay before an edit is synced: the time Undo is offered (spec: "a few seconds after a change"). */
const SYNC_DELAY_MS = 5000;
/** @type {ReturnType<typeof setTimeout>|undefined} */
let syncTimer;

/**
 * Saves an edit of one dive (one undoable step): saved locally at once; with
 * automatic synchronisation, synced a few seconds later.
 * @param {number} id
 * @param {Record<string, string|number|string[]>} changes
 */
export async function saveDiveChanges(id, changes) {
  const result = await BenthicCore.editDive({ id, changes });
  invalidateCoreCache(); // the buddies, tags and site counts may have moved
  logbook.edited = { id, dive: result.dive };
  logbook.undoText = result.undo;
  logbook.redoText = result.redo ?? '';
  logbook.dives = await BenthicCore.listLoadedDives();
  await persistChanges();
  return result;
}

/**
 * After a change that may touch many dives (sites): the list is read again,
 * then saved and synced like an edit.
 * @param {string} undoText
 */
export async function refreshAfterChange(undoText) {
  logbook.undoText = undoText;
  logbook.redoText = '';
  logbook.dives = await BenthicCore.listLoadedDives();
  logbook.sitesVersion++;
  await persistChanges();
}

/**
 * Deletes a dive (one undoable step), saved and synced like an edit.
 * @param {number} id
 */
export async function deleteDive(id) {
  return deleteDives([id]);
}

/**
 * Deletes several dives in one undoable step (the logbook's selection),
 * saved and synced like an edit.
 * @param {number[]} ids
 */
export async function deleteDives(ids) {
  const result = await BenthicCore.deleteDive({ ids });
  logbook.undoText = result.undo;
  logbook.redoText = result.redo ?? '';
  logbook.dives = await BenthicCore.listLoadedDives();
  logbook.sitesVersion++;
  await persistChanges();
}

/**
 * Merges dives into one with the core's merge (one undoable step), saved and synced like an
 * edit. Whether the dives may be merged is `canMerge` of lib/multi-dive.js: the core merges
 * whatever it is given. The merged dive keeps the first dive's number.
 * @param {number[]} ids
 * @returns {Promise<number>} the merged dive's id (the selection after the merge)
 */
export async function mergeDives(ids) {
  const result = await BenthicCore.mergeDives({ ids });
  logbook.undoText = result.undo;
  logbook.redoText = result.redo ?? '';
  logbook.dives = await BenthicCore.listLoadedDives();
  logbook.sitesVersion++;
  await persistChanges();
  return result.list?.id ?? 0;
}

/**
 * The same changes on several dives, one undoable step (« Modifier ensemble »), saved and
 * synced like an edit. `changes` is built by `multiEditChanges` of lib/multi-dive.js.
 * @param {number[]} ids
 * @param {Record<string, string|number|string[]>} changes
 * @param {number|null} [openId] the dive open in the detail pane (tablet), refreshed when it is one of them
 */
export async function editDivesTogether(ids, changes, openId = null) {
  const result = await BenthicCore.editDives({ ids, changes });
  logbook.undoText = result.undo;
  logbook.redoText = result.redo ?? '';
  logbook.dives = await BenthicCore.listLoadedDives();
  logbook.sitesVersion++;
  // The dive open in the detail pane (tablet), if it was one of them, shows its new values.
  if (openId !== null && ids.includes(openId)) logbook.edited = { id: openId, dive: await BenthicCore.getDive({ id: openId }) };
  await persistChanges();
}

/**
 * Renumbers dives in date order from `start` (one undoable step), saved and
 * synced like an edit. No ids: all the dives, as Subsurface's Renumber dialog.
 * @param {number[]} ids
 * @param {number} start
 */
export async function renumberDives(ids, start) {
  const result = await BenthicCore.renumberDives({ ids, start });
  logbook.undoText = result.undo;
  logbook.redoText = result.redo ?? '';
  logbook.dives = await BenthicCore.listLoadedDives();
  await persistChanges();
}

/**
 * "Renuméroter la plongée": dive `id` takes number `target`, and the dives in
 * between shift by one so that numbers stay unique and without gaps (spec,
 * section 4, "Dive detail"). Moving dive n to a smaller m: dives m to n−1 go
 * up by one; to a larger m: dives n+1 to m go down by one; a number beyond
 * the last dive becomes the last number. An unnumbered dive is inserted: the
 * dives from m on go up by one.
 * @param {number} id
 * @param {number} target
 * @returns {{ ids: number[], numbers: number[], shifted: { from: number, to: number, by: number }|null, number: number }}
 */
export function renumberShiftPlan(id, target) {
  const dive = logbook.dives.find((d) => d.id === id);
  const numbered = logbook.dives.filter((d) => d.number > 0);
  const last = numbered.reduce((max, d) => Math.max(max, d.number), 0);
  const n = dive?.number ?? 0;
  const m = Math.max(1, Math.min(Math.round(target), n > 0 ? last : last + 1));
  const targetTaken = numbered.some((d) => d.id !== id && d.number === m);
  /** @type {number[]} */
  const ids = [id];
  /** @type {number[]} */
  const numbers = [m];
  /** @type {{ from: number, to: number, by: number }|null} */
  let shifted = null;
  if (n > 0 && m < n) shifted = { from: m, to: n - 1, by: 1 };
  else if (n > 0 && m > n) shifted = { from: n + 1, to: m, by: -1 };
  else if (n === 0 && m <= last && targetTaken) shifted = { from: m, to: last, by: 1 };
  if (shifted) {
    const { from, to, by } = shifted;
    for (const d of numbered)
      if (d.id !== id && d.number >= from && d.number <= to) {
        ids.push(d.id);
        numbers.push(d.number + by);
      }
    if (ids.length === 1) shifted = null;
  }
  return { ids, numbers, shifted, number: m };
}

/**
 * Gives each dive its own number (one undoable step, as Subsurface's
 * RenumberDives), saved and synced like an edit.
 * @param {number[]} ids
 * @param {number[]} numbers
 */
export async function renumberDivesTo(ids, numbers) {
  const result = await BenthicCore.renumberDives({ ids, start: 0, numbers });
  logbook.undoText = result.undo;
  logbook.redoText = result.redo ?? '';
  logbook.dives = await BenthicCore.listLoadedDives();
  await persistChanges();
}

/**
 * The dives that a new dive logged in the middle of the logbook pushes down:
 * that dive and every later one, and the number the first one should take
 * (the previous dive's number plus one, 1 for the first dive of the log).
 * @param {number} id the new dive
 * @returns {{ ids: number[], start: number }|null} null if the dive is not in the logbook
 */
export function renumberPlanFrom(id) {
  const sorted = [...logbook.dives].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  const i = sorted.findIndex((d) => d.id === id);
  if (i < 0) return null;
  return { ids: sorted.slice(i).map((d) => d.id), start: (sorted[i - 1]?.number ?? 0) + 1 };
}

/**
 * Logs a dive by hand (one undoable step), saved and synced like an edit.
 * @param {Record<string, string|number|string[]>} fields
 * @returns {Promise<number>} the new dive's identifier
 */
export async function addDive(fields) {
  const result = await BenthicCore.createDive({ fields });
  logbook.undoText = result.undo;
  logbook.redoText = result.redo ?? '';
  logbook.dives = await BenthicCore.listLoadedDives();
  await persistChanges();
  return result.list?.id ?? 0;
}

/**
 * Saves a plan as a planned dive, or replaces one (one undoable step), saved
 * and synced like an edit. The dive list does not show planned dives.
 * @param {import('benthic-core').PlanRequest} request
 * @param {number} [replaceId]
 * @param {string} [title] kept with the plan; empty for none
 */
export async function savePlan(request, replaceId = 0, title = '') {
  const result = await BenthicCore.savePlan({ request, replaceId, title });
  logbook.undoText = result.undo;
  logbook.redoText = result.redo ?? '';
  await persistChanges();
  return result.list?.id ?? 0;
}

/**
 * Imports a file chosen by the diver (one undoable step), saved and synced
 * like an edit. Errors keep the core's code (IMPORT_FAILED, NO_DIVES,
 * NO_NEW_DIVES) for the message. A .zip holding .fit files (Garmin Connect's « Export
 * Original ») gives each .fit to the core, which cannot read them inside the archive.
 * @param {File} file
 * @returns {Promise<number>} the number of dives added to the logbook
 */
export function importFile(file) {
  // One progress line from the copy to the end of the import (lib/import-progress.js).
  return importProgress.session(['copy', 'import', 'save'], file.name, async () => {
    if (isZipName(file.name) && file.size <= MAX_ZIP_BYTES) {
      const fits = await fitFilesInZip(new Uint8Array(await file.arrayBuffer()));
      if (fits.length) return importFits(fits);
    }
    // The file goes to the app's cache in pieces and the core reads it there: a logbook is never one string
    // (the plugin's bridge and the Android Java heap cannot hold 100 MB).
    importProgress.phase('copy', file.size);
    const staged = await stageFile(BenthicCore, file, undefined, importProgress.reporter('copy'));
    return importData(file.name, { path: staged.path });
  });
}

/**
 * Several files chosen together, imported as one undoable step: a Suunto app .json and the .fit
 * with the same base name give one dive, the other files are read on their own. One file goes
 * through importFile, unchanged.
 * @param {File[]} files
 * @returns {Promise<number>} the number of dives added to the logbook
 */
export async function importFiles(files) {
  if (files.length === 1) return importFile(files[0]);
  // Small files travel together (a Suunto .json and its .fit are read as one dive); a big one cannot, it goes alone.
  if (files.reduce((n, f) => n + f.size, 0) > MAX_TOGETHER_BYTES) {
    let added = 0;
    for (const file of files) added += await importFile(file);
    return added;
  }
  const before = logbook.dives.length;
  const result = await BenthicCore.importDivesFiles({ files: await importPayload(files) });
  logbook.undoText = result.undo;
  logbook.redoText = result.redo ?? '';
  logbook.dives = await BenthicCore.listLoadedDives();
  logbook.sitesVersion++;
  await persistChanges();
  return Math.max(0, logbook.dives.length - before);
}

/** Files chosen together travel in one call (as base64) up to this many bytes in all; above, one import each. */
const MAX_TOGETHER_BYTES = 6 * 1024 * 1024;

/**
 * The .fit files taken out of a .zip, one import each. The dives added are counted together; an
 * error is reported only when none was added (« Annuler » then undoes the last file's dives).
 * @param {{ name: string, data: Uint8Array }[]} fits
 * @returns {Promise<number>}
 */
async function importFits(fits) {
  let added = 0;
  /** @type {unknown} */
  let failure = null;
  for (const fit of fits) {
    try {
      added += await importData(fit.name, toBase64(fit.data));
    } catch (e) {
      failure = e;
    }
  }
  if (!added && failure) throw failure;
  return added;
}

/**
 * The same import from a file already in the cache (a file another app sent, lib/open-link.js) or from small contents.
 * @param {string} name the file's name; the core reads the format from its extension
 * @param {string|{ path: string }} data base64 contents (a small file), or the staged file the core reads where it is
 *   (a logbook; it is deleted after the import)
 * @returns {Promise<number>} the number of dives added to the logbook
 */
export function importData(name, data) {
  return importProgress.session(['import', 'save'], name, async () => {
    const before = logbook.dives.length;
    // The core reports nothing inside the import: the segment is indeterminate (« Lecture des plongées… »).
    importProgress.phase('import');
    const result = await BenthicCore.importDives(typeof data === 'string' ? { name, data } : { name, path: data.path });
    importProgress.phase('save');
    logbook.undoText = result.undo;
    logbook.redoText = result.redo ?? '';
    logbook.dives = await BenthicCore.listLoadedDives();
    logbook.sitesVersion++;
    await persistChanges();
    return Math.max(0, logbook.dives.length - before);
  });
}

/**
 * A CSV file with the column mapping the diver chose (components/CsvImportDialog.svelte, task 2026-11-16-224):
 * the core's CSV import, one undoable step, saved and synced like any import. The files are staged in the app's
 * cache for the call and discarded after it.
 * @param {File} file
 * @param {import('benthic-core').CsvParams} params the mapping (lib/csv-import.js, buildParams)
 * @param {File|null} [companion] Poseidon MkVI: the .txt of the same dive
 * @returns {Promise<number>} the number of dives added to the logbook
 */
export async function importCsvFile(file, params, companion = null) {
  const before = logbook.dives.length;
  const result = await runCsvImport(
    {
      stage: async (f) => (await stageFile(BenthicCore, f)).path,
      discard: (path) => BenthicCore.discardImport({ path }),
      importCsv: (o) => BenthicCore.importCsv(o),
    },
    { file, companion, params, dryRun: false },
  );
  logbook.undoText = result.undo;
  logbook.redoText = result.redo ?? '';
  logbook.dives = await BenthicCore.listLoadedDives();
  logbook.sitesVersion++;
  await persistChanges();
  return Math.max(0, logbook.dives.length - before);
}

/**
 * A dive or a plan received by QR code (lib/qr-receive.svelte.js): its .ssrf text goes through the
 * core's import, as a normal dive of the logbook (new number), one undoable step, saved and synced
 * like any import.
 * @param {string} xml
 * @returns {Promise<{id: number, added: number}>} the first dive added (0 if none) and how many
 */
export async function importReceived(xml) {
  const bytes = new TextEncoder().encode(xml);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const before = logbook.dives.length;
  const result = await BenthicCore.importDives({ name: 'benthic-qr.ssrf', data: btoa(binary) });
  logbook.undoText = result.undo;
  logbook.redoText = result.redo ?? '';
  logbook.dives = await BenthicCore.listLoadedDives();
  logbook.sitesVersion++;
  await persistChanges();
  return { id: result.list?.id ?? 0, added: Math.max(0, logbook.dives.length - before) };
}

/** Dives logged on this device without an account (0 when none, or unreadable). */
export async function deviceDiveCount() {
  // The demo logbook is never offered to an account (task 2026-11-16-224).
  if (storedDemo(deviceStore)) return 0;
  try {
    return (await BenthicCore.deviceLog({ action: 'count' })).count;
  } catch (e) {
    console.error('Device dives', e);
    return 0;
  }
}

/**
 * Adds the dives logged on this device without an account to the account's
 * logbook: one undoable step, saved and synced like an import.
 * @returns {Promise<number>} the number of dives added
 */
export async function importDeviceDives() {
  if (storedDemo(deviceStore)) throw new Error('NO_DIVES');
  const before = logbook.dives.length;
  const result = await BenthicCore.deviceLog({ action: 'import' });
  logbook.undoText = result.undo;
  logbook.redoText = result.redo ?? '';
  logbook.dives = await BenthicCore.listLoadedDives();
  logbook.sitesVersion++;
  await persistChanges();
  return Math.max(0, logbook.dives.length - before);
}

/**
 * After a download from a dive computer (BenthicCore.downloadDives): the
 * new dives are one undoable step already made by the core; it is saved and
 * synced like an edit. The remembered computers, updated by the core after
 * every attempt as Subsurface does, are kept on this device.
 * @param {import('benthic-core').DownloadResult|null} result null after a failed attempt
 */
export async function afterDownload(result) {
  try {
    logbook.prefs = await prefsAfterLoad();
    if (logbook.prefs.diveComputerList) keepDiveComputers(logbook.prefs.diveComputerList);
  } catch (e) {
    console.error('Reading the remembered dive computers', e);
  }
  // Release edition: the computer enters the equipment inventory the first time it is downloaded from
  // (task 2026-11-17-267). Imported after the dives, so that the logbook's list of computers is up to date.
  const noteComputer = result && isRelease ? () => import('./inventory.svelte.js').then((m) => m.noteDownloadedComputer(result, isSubscriber())) : null;
  if (!result?.downloaded) {
    await noteComputer?.();
    return;
  }
  logbook.undoText = result.undo;
  logbook.redoText = '';
  logbook.dives = await BenthicCore.listLoadedDives();
  logbook.sitesVersion++;
  await persistChanges();
  await noteComputer?.();
}

/**
 * After each sync of the cloud log: the conflicts Subsurface's merge left,
 * if any (read only).
 */
async function readConflicts() {
  if (!logbook.email) return;
  try {
    const found = await BenthicCore.syncConflicts();
    logbook.conflict = found.conflict ? found : null;
  } catch (e) {
    console.error('Reading the sync conflicts', e);
  }
}

/** A choice just made and not sent yet: its snackbar can still take it back. */
let choiceHeld = false;

/**
 * The diver's choices for a sync conflict, dive by dive (by file path of the
 * git log): one new commit on this device. Nothing is sent before
 * sendConflictChoice().
 * @param {Record<string, 'device'|'cloud'>} choices
 */
export async function resolveConflict(choices) {
  await BenthicCore.resolveConflicts({ choices });
  choiceHeld = true;
  logbook.conflict = null;
  logbook.conflictLater = false;
  undoCleared();
  logbook.dives = await BenthicCore.listLoadedDives();
  await countPending();
}

/** "Plus tard": the dialog closes, the diver stays where they were; sync stays paused. */
export function postponeConflict() {
  logbook.conflictLater = true;
}

/** The status row of the Carnet or the sync card of the side menu: the dialog again. */
export function reopenConflict() {
  logbook.conflictLater = false;
}

/** The snackbar is gone: the choice is sent, like an edit. */
export async function sendConflictChoice() {
  choiceHeld = false;
  await persistChanges();
}

/** "Annuler": the conflict as it was, and its dialog again. */
export async function cancelConflictChoice() {
  choiceHeld = false;
  await BenthicCore.cancelConflictResolution();
  logbook.dives = await BenthicCore.listLoadedDives();
  await readConflicts();
  await countPending();
}

/** Undoes the last edit, saved and synced the same way. */
/**
 * Undoes the last change, or applies again the last one undone (`redo`).
 * @param {boolean} [redo]
 */
export async function undoLastChange(redo = false) {
  const result = await BenthicCore.undo({ redo });
  invalidateCoreCache();
  if (result.dive) logbook.edited = { id: result.dive.id, dive: result.dive };
  if (result.list) {
    logbook.dives = await BenthicCore.listLoadedDives();
    logbook.sitesVersion++;
  }
  if (result.trip) {
    logbook.editedTrip = result.trip;
    logbook.dives = await BenthicCore.listLoadedDives();
  }
  if (result.site) {
    logbook.dives = await BenthicCore.listLoadedDives();
    logbook.sitesVersion++;
  }
  // An undone or redone rename of a cylinder type: the added type's file follows.
  if (result.cylinderTypes) import('./cylinder-type-library.svelte.js').then((m) => m.followCoreTypes(result.cylinderTypes.types)).catch((e) => console.error('Cylinder types', e));
  logbook.undoText = result.undo;
  logbook.redoText = result.redo ?? '';
  await persistChanges();
  return result;
}

async function persistChanges() {
  await BenthicCore.saveLocal();
  await countPending();
  clearTimeout(syncTimer);
  // With a conflict waiting, the automatic sync that would run only brings the dialog back (syncEdits).
  if (logbook.email && autoSyncing() && !choiceHeld) syncTimer = setTimeout(syncEdits, SYNC_DELAY_MS);
}

/**
 * After the core restored a version of the logbook (or of a dive) as a new commit and read the log again: the list is read
 * again, the undo history is gone, and the commit is sent like any saved change.
 */
export async function afterRestore() {
  logbook.dives = await BenthicCore.listLoadedDives();
  logbook.sitesVersion++;
  invalidateCoreCache();
  undoCleared();
  await persistChanges();
}

/**
 * Opens an earlier version of the logbook read only (the core's `history('open')`); the dives of the version are returned.
 * Close it with `closeVersion`.
 * @param {string} commit
 * @returns {Promise<Dive[]>}
 */
export async function openVersion(commit) {
  clearTimeout(syncTimer);
  logbook.browsing = true;
  try {
    return await BenthicCore.history('open', [commit]);
  } catch (e) {
    await closeVersion();
    throw e;
  }
}

/** Closes the version opened read only: the core reads the logbook again. */
export async function closeVersion() {
  if (!logbook.browsing) return;
  try {
    const cached = await BenthicCore.history('close');
    if (cached.dives) logbook.dives = cached.dives;
    logbook.sitesVersion++;
    invalidateCoreCache();
    undoCleared();
  } finally {
    logbook.browsing = false;
  }
  await countPending();
}

/** The core's undo history was emptied (a load): no "Undo" may be offered any more. */
function undoCleared() {
  logbook.undoText = '';
  logbook.redoText = '';
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('bc-undo-cleared'));
}

/**
 * The outcome of a sync, for the message after "Sync": done; offline
 * (the server did not answer); failed (it answered, the exchange stopped).
 * @typedef {'done'|'offline'|'failed'} SyncOutcome
 */

/**
 * Synchronisation is always automatic; this tells whether it may run now: the connection allows it
 * (« Seulement sur Wi-Fi ou câble », lib/sync-network.svelte.js) and no older version is being browsed.
 */
export function autoSyncing() {
  return syncAllowedOnThisNetwork() && !logbook.browsing;
}

/**
 * Sends the saved edits (automatic synchronisation).
 * @returns {Promise<SyncOutcome>}
 */
async function syncEdits() {
  // A version opened read only holds the core: nothing is sent from it.
  if (logbook.browsing) return /** @type {SyncOutcome} */ ('failed');
  // Paused while a conflict waits for the diver: a sync attempt brings its dialog
  // back ("Plus tard" lasts until the next attempt), and nothing is sent.
  if (logbook.conflict) {
    logbook.conflictLater = false;
    return /** @type {SyncOutcome} */ ('failed');
  }
  // Also paused while the choice can be taken back.
  if (choiceHeld) return /** @type {SyncOutcome} */ ('failed');
  logbook.syncProgress = null;
  logbook.sync = 'syncing';
  /** @type {SyncOutcome} */
  let outcome = 'failed';
  try {
    const status = await BenthicCore.syncChanges();
    if (status.reloaded) {
      // The cloud brought changes: the merged log was read again, its dives
      // are new objects and the undo history is gone (lib/undo.js).
      logbook.dives = await BenthicCore.listLoadedDives();
      logbook.sitesVersion++;
      undoCleared();
    }
    const reached = status.status !== 'offline' && status.status !== 'stopped';
    logbook.sync = reached ? 'cloud' : 'offline';
    if (reached) markSynced();
    outcome = reached ? 'done' : status.status === 'offline' ? 'offline' : 'failed';
    if (!reached) noteFailure(status.cause === 'auth');
    if (status.status === 'merged') await readConflicts();
  } catch (e) {
    console.error('Syncing the edits', e);
    logbook.sync = 'offline';
  }
  await countPending();
  // The diver's equipment, profile and the rest follow the dives (lib/account-sync.svelte.js).
  signalAccountData('dives');
  return outcome;
}

/**
 * "bc.welcome" (the beta: "bc.welcomeBeta"): "show" after signing out, "done" once a way to start was
 * chosen, absent before the first start.
 * @returns {string|null}
 */
// The beta has its own key: after the alpha it starts from its first launch, whatever the alpha chose (the alpha's
// files and settings stay as they were).
const WELCOME_KEY = isRelease ? 'bc.welcomeBeta' : 'bc.welcome';

function readWelcomeState() {
  // A window that holds a logbook of its own (a file or a git repository) or none has no first launch:
  // that belongs to the logbook of this computer (task 2026-11-15-173).
  if (ownLogbookWindow()) return 'done';
  try {
    return deviceStore.getItem(WELCOME_KEY);
  } catch {
    return 'done';
  }
}

/**
 * The first launch is shown at start unless the logbook was started before. The very first start (no value yet) counts
 * as a first launch from the first paint, so that the Logbook is never drawn before the choice is known: startApp
 * then closes it again only when an account is already configured on this device (see startApp).
 */
function readWelcome() {
  return readWelcomeState() !== 'done';
}

/** @param {'show'|'done'} value */
function writeWelcomeState(value) {
  if (ownLogbookWindow()) return;
  try {
    deviceStore.setItem(WELCOME_KEY, value);
  } catch {
    // Not fatal: first launch may be shown again at the next start.
  }
}

/**
 * Calls sent at the very start, before the screens are built, so that the
 * core reads the device copy while the interface starts; the first load
 * takes their answers instead of asking again. The core runs the calls in the
 * order they were sent: settings, account, device copy.
 * @type {{ configure: Promise<any>, cached: Promise<any>|null, probe: Promise<any>|null }|null}
 */
let early = null;

/** Set when an account was found: lets the next start send the probe at once. */
// The beta has its own key: the alpha's hint says a Subsurface-cloud account, which the beta ignores (no probe at start).
const ACCOUNT_HINT = isRelease ? 'bc.repositoryAccount' : 'bc.cloudAccount';

/** @param {boolean} has */
function rememberAccount(has) {
  try {
    if (has) deviceStore.setItem(ACCOUNT_HINT, '1');
    else deviceStore.removeItem(ACCOUNT_HINT);
  } catch {
    // Not fatal: the probe is then sent after the account is read.
  }
}

/**
 * First thing the app does (main.js): the settings of this device go into the
 * core first, then, when this is not a first launch, the account and the
 * device copy are asked for without waiting, then startApp.
 * @returns {Promise<void>}
 */
export function boot() {
  const settingsApplied = applyDeviceSettings().then(() => mark('settings'));
  if (readWelcomeState() === 'done') {
    const configure = BenthicCore.configureCloud();
    // Without a remembered account (the beta's local logbook) the device copy of a cloud log is not asked for: the core
    // would answer « Cloud account not configured ». loadCloud asks for it itself once an account is found.
    const cached = deviceStore.getItem(ACCOUNT_HINT) ? BenthicCore.listCloudDives({ cached: true }) : null;
    let probe = null;
    try {
      // The probe runs on the plugin's network thread, not in the core's
      // order: it is sent once the account is set, or it finds none.
      if (!syncNetwork.unmeteredOnly && deviceStore.getItem(ACCOUNT_HINT)) probe = configure.then(() => BenthicCore.probeCloud());
    } catch {
      // No hint: loadCloud sends the probe.
    }
    // Answers not taken (no account here): nothing to report.
    for (const call of [configure, cached, probe]) call?.catch(() => {});
    early = { configure, cached, probe };
  }
  return settingsApplied.then(() => startApp());
}

/**
 * At start: first launch is shown on the very first start, unless a cloud
 * account is already configured on this device (development credentials);
 * otherwise the logbook is loaded.
 */
export async function startApp() {
  mark('startApp');
  // The very first start: the first launch is already on screen (readWelcome); only an account found on this device closes it.
  const firstStart = readWelcomeState() === null;
  if (logbook.welcome && !firstStart) return;
  // The desktop's start screen: no logbook is open in this window (task 2026-11-15-173).
  if (noLogbookWindow()) {
    logbook.loading = false;
    return;
  }
  if (firstStart) {
    let configured = false;
    try {
      const account = await BenthicCore.configureCloud();
      // The beta after the alpha: a Subsurface-cloud account is not opened, first launch is shown (its files stay).
      configured = account.available && !isIgnoredCloudAccount(account, isRelease);
    } catch (e) {
      console.error('Reading the cloud account', e);
    }
    if (!configured) {
      logbook.welcome = true;
      logbook.loading = false;
      return;
    }
    logbook.welcome = false;
    writeWelcomeState('done');
  }
  await loadLogbook();
}

/**
 * Signs out (spec, section 4, "Sign out"): the core closes the log and forgets
 * the account, the credentials are forgotten, and first launch is shown. The
 * device copy is kept, unless deleteCopy (refused while changes are not sent).
 * @param {{ deleteCopy?: boolean }} [options]
 */
export async function signOut({ deleteCopy = false } = {}) {
  await BenthicCore.signOut({ deleteCopy });
  // The Benthic server's session goes with the logbook that was connected through it (the tokens are erased).
  if (logbook.benthicPlus || benthicPlusAccount.signedIn) await BenthicCore.serverSessionClear();
  setBenthicPlusAccount({ signedIn: false });
  forgetAccount(true);
}

/**
 * After the server confirmed the deletion of the account: with keepDives, the
 * dives are now the logbook of this device, which is opened; otherwise first
 * launch is shown, as after signing out.
 * @param {{ keepDives: boolean }} options
 */
export async function accountDeleted({ keepDives }) {
  forgetAccount(!keepDives);
  if (keepDives) await loadLogbook();
}

/**
 * The demo logbook is erased from this device (« Commencer mon carnet »): its dives and the sites they leave unused,
 * saved, then first launch is shown again as after signing out. The demo has no account, so nothing is sent anywhere.
 * @returns {Promise<void>}
 */
export async function eraseDemoLogbook() {
  // Only this device's own logbook: an account's logbook is never touched, whatever the stored flag says.
  if (logbook.email) throw new Error('NOT_DEMO');
  const ids = logbook.dives.map((d) => d.id);
  if (ids.length) await BenthicCore.deleteDive({ ids });
  const sites = /** @type {{ uuid: number }[]} */ (await BenthicCore.siteQuery({ kind: 'list' }));
  if (sites.length) await BenthicCore.siteAction({ action: 'delete', uuids: sites.map((x) => x.uuid) });
  await BenthicCore.saveLocal();
  undoCleared();
}

/**
 * « Remplacer ce carnet » (decided on 18 November 2026): the logbook of this device becomes the file's. Only a device
 * logbook: an account's logbook (cloud, git, Benthic+ server) is never touched, because removing its dives would be
 * sent to the shared log. The dives of the file are brought in after the current ones are removed; if that fails, the
 * current logbook is put back from a copy taken first, so a bad file never leaves the device without its logbook.
 * @param {string} name the new logbook's name (kept as its label on this device)
 * @param {string|{ path: string }} data the file: a staged file (a Subsurface `.ssrf` in the app's cache, read by the core where
 *   it is), or its contents in base64 for a small one
 * @param {string} fileName the file's name; the core reads the format from its extension
 * @returns {Promise<number>} the dives of the new logbook
 */
export async function replaceDeviceLogbook(name, data, fileName) {
  if (logbook.email || logbook.benthicPlus || logbook.repository) throw new Error('NOT_REPLACEABLE');
  const ids = logbook.dives.map((d) => d.id);
  // The copy taken first is a file in the app's cache, written by the core: it never goes through the bridge as a string.
  importProgress.phase('import');
  const backup = ids.length ? (await BenthicCore.exportDives({ ids, format: 'ssrf', anonymize: false, name: 'replaced-logbook.ssrf', stage: true })).path ?? '' : '';
  await wipeDeviceLogbook();
  try {
    await BenthicCore.importDives(typeof data === 'string' ? { name: fileName, data } : { name: fileName, path: data.path });
    const dives = await BenthicCore.listLoadedDives();
    if (!dives.length) throw new Error('NO_DIVES');
  } catch (e) {
    await wipeDeviceLogbook();
    if (backup) await BenthicCore.importDives({ name: 'replaced-logbook.ssrf', path: backup });
    logbook.dives = await BenthicCore.listLoadedDives();
    logbook.sitesVersion++;
    await BenthicCore.saveLocal();
    undoCleared();
    throw e;
  }
  if (backup) await BenthicCore.discardImport({ path: backup }).catch(() => {});
  importProgress.phase('save');
  await BenthicCore.saveLocal();
  undoCleared();
  logbook.dives = await BenthicCore.listLoadedDives();
  logbook.sitesVersion++;
  try {
    deviceStore.setItem('bc.logbookName', name);
  } catch {
    // Not fatal.
  }
  return logbook.dives.length;
}

/** Every dive and every site of the open logbook is removed (the core's undoable steps; the caller drops the history). */
async function wipeDeviceLogbook() {
  const ids = (await BenthicCore.listLoadedDives()).map((d) => d.id);
  if (ids.length) await BenthicCore.deleteDive({ ids });
  const sites = /** @type {{ uuid: number }[]} */ (await BenthicCore.siteQuery({ kind: 'list' }));
  if (sites.length) await BenthicCore.siteAction({ action: 'delete', uuids: sites.map((x) => x.uuid) });
}

/** First launch is shown again: the logbook on screen is gone (the demo was erased). */
export function showFirstLaunchAgain() {
  forgetAccount(true);
}

/** @param {boolean} showWelcome */
function forgetAccount(showWelcome) {
  logbook.preview = null;
  saveSnapshot(null);
  clearDetailSnapshot();
  logbook.dives = [];
  logbook.email = '';
  logbook.mode = 'cloud';
  logbook.repository = '';
  logbook.benthicPlus = false;
  logbook.server = '';
  logbook.sync = 'local';
  logbook.pending = 0;
  logbook.pendingByDive = {};
  logbook.lastSync = null;
  logbook.welcome = showWelcome;
  try {
    deviceStore.removeItem('bc.lastSync');
  } catch {
    // Not fatal.
  }
  if (showWelcome) writeWelcomeState('show');
}

/** First launch, "Start without an account": the logbook of this device. */
export function startWithoutAccount() {
  logbook.welcome = false;
  writeWelcomeState('done');
  return loadLogbook();
}

/**
 * Alpha first launch on a phone, after signing in: the account's logbook is downloaded while first launch
 * stays open on its download screen (`logbook.firstDownload` says where it is); it closes when the logbook is
 * there. The result is false when the download failed or was cancelled: first launch stays open.
 * @param {() => boolean} [cancelled] true once the diver cancelled (the account was signed out)
 * @returns {Promise<boolean>}
 */
export async function downloadAccountLogbook(cancelled = () => false) {
  logbook.firstDownload = { progress: null, n: 0, total: 0 };
  logbook.lastSync = null;
  try {
    await loadLogbook({ force: true });
    if (cancelled()) {
      logbook.error = null;
      return false;
    }
    if (logbook.error) return false;
    logbook.welcome = false;
    writeWelcomeState('done');
    return true;
  } finally {
    logbook.firstDownload = null;
  }
}

/**
 * Signed in, or a new account with its first logbook: first launch closes
 * and the logbook of the account is loaded (its credentials are stored).
 */
export function accountReady() {
  logbook.welcome = false;
  writeWelcomeState('done');
  logbook.lastSync = null;
  return loadLogbook();
}

/**
 * The logbook now lives in another git repository (Account, "Modifier le
 * dépôt"): what was shown belongs to the previous one, the new one is loaded.
 */
export function repositoryChanged() {
  logbook.preview = null;
  saveSnapshot(null);
  clearDetailSnapshot();
  logbook.dives = [];
  logbook.pending = 0;
  logbook.pendingByDive = {};
  logbook.conflict = null;
  clearFailure();
  logbook.lastSync = null;
  try {
    deviceStore.removeItem('bc.lastSync');
  } catch {
    // Not fatal.
  }
  return loadLogbook({ force: true });
}

/**
 * "Sync". A logbook already shown: the exchange of the
 * automatic synchronisation (send, fetch, merge; read again only when the
 * cloud brought changes), so that only the status line moves, not the list
 * nor the menu (to-do #2). Otherwise (no copy yet, an error): the full load.
 */
export async function syncNow() {
  if (!logbook.email || logbook.loading || logbook.error || logbook.sync === 'syncing') {
    if (logbook.sync === 'syncing') return /** @type {SyncOutcome} */ ('failed');
    await loadLogbook({ force: true });
    return /** @type {SyncOutcome} */ (logbook.error ? 'failed' : logbook.sync === 'offline' ? 'offline' : 'done');
  }
  clearTimeout(syncTimer);
  return syncEdits();
}

/**
 * Edits of each dive in the messages of the pending commits. Subsurface's
 * commit message lists the edit texts ("Edit notes [#12]", "(undo) Edit
 * tags [#12]"); a dive without a number is shown by its date ("[@…]") and
 * is not matched here.
 * @param {{ message: string }[]} commits
 */
export function pendingFields(commits) {
  /** @type {Record<number, string[]>} */
  const byDive = {};
  const edit = /Edit (notes|suit|rating|visibility|wavesize|current|surge|chill|buddies|dive guide|tags|dive site|dive) \[#(\d+)\]/g;
  for (const c of commits) {
    for (const m of c.message.matchAll(edit)) {
      const n = Number(m[2]);
      const field = m[1] === 'dive guide' ? 'diveguide' : m[1] === 'dive site' ? 'site' : m[1];
      byDive[n] ??= [];
      if (!byDive[n].includes(field)) byDive[n].push(field);
    }
  }
  return byDive;
}

async function countPending() {
  try {
    const commits = await BenthicCore.pendingChanges();
    logbook.pending = commits.length;
    logbook.pendingByDive = pendingFields(commits);
  } catch (e) {
    console.error('Counting the changes not sent', e);
  }
}

// Offline: sending starts by itself when the network is back (spec, section 6).
if (typeof window !== 'undefined') {
  // The same when started offline or with nothing pending: the logbook leaves
  // "offline" by exchanging with the server, whatever woke it (the WebView's
  // 'online' event, the Network plugin, the app coming back to the front).
  let reconnecting = false;
  // The network came back while a load or a sync was still running: the exchange
  // is made as soon as the logbook is shown as offline.
  let wanted = false;
  const reconnect = async () => {
    if (reconnecting) return;
    // Metered link with « Seulement sur Wi-Fi ou câble »: nothing automatic; onSyncAllowedAgain sends what waited.
    if (!autoSyncing()) return;
    if (!shouldReconnect(logbook)) {
      wanted = logbook.loading || logbook.sync === 'syncing';
      return;
    }
    wanted = false;
    reconnecting = true;
    try {
      await syncNow();
    } finally {
      reconnecting = false;
    }
  };
  window.addEventListener('online', reconnect);
  Network.addListener('networkStatusChange', (/** @type {{ connected: boolean }} */ s) => {
    if (s.connected) reconnect();
  }).catch((/** @type {unknown} */ e) => console.error('Network status', e));
  CapacitorApp.addListener('resume', async () => {
    try {
      const s = await Network.getStatus();
      if (s.connected) reconnect();
    } catch {
      reconnect();
    }
  }).catch((/** @type {unknown} */ e) => console.error('App resume', e));
  // Safety net for a missed event: while the logbook is offline or a gain came
  // during a load, the connection is read again every few seconds.
  setInterval(async () => {
    if (!wanted && logbook.sync !== 'offline') return;
    try {
      const s = await Network.getStatus();
      if (s.connected && (wanted || !logbook.syncFailure)) reconnect();
    } catch {
      /* no plugin: the events above are all there is */
    }
  }, 5000);
  // The metered link went away: what waited goes now.
  onSyncAllowedAgain(() => {
    if (logbook.email && logbook.pending && logbook.sync !== 'syncing' && logbook.sync !== 'offline') syncEdits();
  });
  // Where the sync is: only while one is shown as running.
  BenthicCore.addListener('syncProgress', (/** @type {{ message: string }} */ { message }) => {
    if (logbook.sync === 'syncing') logbook.syncProgress = nextProgress(message, logbook.syncProgress);
    const first = logbook.firstDownload;
    if (first) {
      first.progress = nextProgress(message, first.progress);
      const count = transferCount(message);
      if (count) {
        first.n = count.n;
        first.total = count.total;
      }
    }
  }).catch((/** @type {unknown} */ e) => console.error('Sync progress', e));
}

// Synchronisation is always automatic (task 346): the old on/off setting of an earlier version is dropped.
try {
  deviceStore.removeItem('bc.autoSync');
} catch {
  // Not fatal: it is ignored anyway.
}

function readLastSync() {
  try {
    return deviceStore.getItem('bc.lastSync');
  } catch {
    return null;
  }
}

/** Notes a successful sync, kept across launches. */
/** @type {ReturnType<typeof setTimeout>|undefined} */
let retryTimer;
let retries = 0;

/** @param {boolean} refused the server answered and refused the credentials */
function noteFailure(refused) {
  logbook.syncFailure = failureCause({ online: navigator.onLine, gitMode: logbook.mode === 'git', refused });
  clearTimeout(retryTimer);
  logbook.retryMinutes = 0;
  // Only the unreachable server is tried again; the other two wait for the diver.
  if (logbook.syncFailure === 'server' && autoSyncing()) {
    logbook.retryMinutes = retryDelay(retries++);
    // An automatic retry: it waits again when the link became metered meanwhile.
    retryTimer = setTimeout(() => (autoSyncing() ? syncNow() : undefined), logbook.retryMinutes * 60000);
  }
}

function clearFailure() {
  clearTimeout(retryTimer);
  retries = 0;
  logbook.retryMinutes = 0;
  logbook.syncFailure = null;
  logbook.syncFailureOpen = false;
}

function markSynced() {
  clearFailure();
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
  logbook.lastSync = local;
  try {
    deviceStore.setItem('bc.lastSync', local);
  } catch {
    // Not fatal: only the Account screen shows it.
  }
}

/**
 * The suffix of the texts that name where the sync goes: '' (Subsurface cloud), 'Git' (the diver's own repository) or
 * 'Server' (the Benthic server account's repository, release edition).
 * @returns {''|'Git'|'Server'}
 */
export function syncFlavour() {
  return logbook.mode === 'git' ? (logbook.benthicPlus ? 'Server' : 'Git') : '';
}

/** Whether the connected repository is the signed-in Benthic server account's (the release edition's sign-in). @param {string} repository */
async function onBenthicServer(repository) {
  if (!isRelease) return false;
  try {
    return isServerRepository(repository, await BenthicCore.serverSessionInfo());
  } catch {
    return false;
  }
}

/**
 * Cloud log: the device's copy is read (no network) while the server is asked
 * for its head (network only), at the same time. The copy is shown as soon as
 * it is read; when the server's head is the copy's, the log is up to date and
 * nothing else is done. Otherwise the core syncs and reads the log again.
 * With automatic synchronisation off, only the device's copy is read, unless
 * `force` ("Sync") or there is no copy yet.
 * @param {boolean} force
 * @param {typeof early} [pre] answers of the calls sent at start (boot), for the first load
 * @returns {Promise<boolean>} false when no cloud account is configured
 */
async function loadCloud(force, pre = null) {
  void loadBenthicPlusAccount();
  const account = await (pre?.configure ?? BenthicCore.configureCloud());
  const ignored = isIgnoredCloudAccount(account, isRelease);
  rememberAccount(account.available && !ignored);
  mark('configured');
  if (!account.available || ignored) {
    logbook.email = '';
    logbook.mode = 'cloud';
    logbook.repository = '';
    logbook.benthicPlus = false;
    logbook.server = '';
    return false;
  }
  logbook.email = account.email;
  logbook.mode = account.mode === 'git' ? 'git' : 'cloud';
  logbook.repository = account.repository ?? '';
  logbook.benthicPlus = logbook.mode === 'git' ? await onBenthicServer(logbook.repository) : false;

  await networkKnown();
  if (!autoSyncing() && !force) {
    try {
      const cached = await (pre?.cached ?? BenthicCore.listCloudDives({ cached: true }));
      if (cached.dives) {
        if (cached.server) logbook.server = cached.server;
        logbook.dives = cached.dives;
        logbook.prefs = await prefsAfterLoad();
        logbook.sync = 'cloud';
        await countPending();
        return true;
      }
    } catch (e) {
      console.error('Reading the device copy of the cloud log', e);
    }
    // No copy on this device yet: the first one has to be fetched.
  }

  const probe = (pre?.probe ?? BenthicCore.probeCloud()).then(
    (head) => ({ ok: true, ...head }),
    (/** @type {unknown} */ error) => ({ ok: false, exists: false, head: '', error }),
  );

  /** @type {string|null} commit of the copy shown */
  let shownHead = null;
  try {
    const cached = await (pre?.cached ?? BenthicCore.listCloudDives({ cached: true }));
    mark('cachedRead');
    if (cached.server) logbook.server = cached.server;
    if (cached.dives) {
      logbook.dives = cached.dives;
      logbook.prefs = await prefsAfterLoad();
      logbook.syncProgress = null;
      logbook.sync = 'syncing';
      logbook.pulling = true;
      logbook.loading = false;
      shownHead = cached.head ?? '';
    }
  } catch (e) {
    // An unreadable copy is not fatal: the sync below reads the log again.
    console.error('Reading the device copy of the cloud log', e);
  }

  const server = await probe;
  mark('probeDone');
  if (shownHead !== null) {
    if (server.ok && server.exists && server.head === shownHead) {
      logbook.sync = 'cloud';
      markSynced();
      return true;
    }
    if (!server.ok) {
      // The server did not answer: the copy shown is the offline logbook.
      console.error('Asking the cloud server for its head', server.error);
      logbook.sync = 'offline';
      noteFailure(isRefused(/** @type {any} */ (server.error)?.message));
      return true;
    }
  }
  try {
    const fresh = await BenthicCore.listCloudDives();
    if (fresh.dives) {
      logbook.dives = fresh.dives;
      logbook.prefs = await prefsAfterLoad();
    }
    if (fresh.server) logbook.server = fresh.server;
    logbook.sync = fresh.synced ? 'cloud' : 'offline';
    if (fresh.synced) markSynced();
    else noteFailure(isRefused(fresh.offlineReason));
  } catch (e) {
    if (shownHead === null) throw e;
    // The copy shown stays usable: the logbook is only out of date.
    console.error('Syncing with the cloud', e);
    logbook.sync = 'offline';
    noteFailure(isRefused(/** @type {any} */ (e)?.message));
  }
  return true;
}

let loadStarted = false;

/**
 * Loads the logbook: the cloud log when an account is configured, otherwise
 * the log on this device.
 * @param {{ force?: boolean }} [options] force: exchange with the server even
 *   with automatic synchronisation off ("Sync")
 */
export async function loadLogbook({ force = false } = {}) {
  undoCleared();
  // The snapshot is for the first load only; a reload shows the loading bars.
  if (loadStarted) logbook.preview = null;
  const pre = early;
  early = null;
  loadStarted = true;
  logbook.loading = true;
  logbook.error = null;
  try {
    if (await loadCloud(force, pre)) {
      await countPending();
      await readConflicts();
    } else {
      let local = await BenthicCore.listDives();
      if (!local.exists) {
        await BenthicCore.importSample();
        local = await BenthicCore.listDives();
      }
      logbook.dives = local.dives;
      logbook.sync = 'local';
      logbook.pending = 0;
      logbook.pendingByDive = {};
      logbook.prefs = await prefsAfterLoad();
    }
  } catch (e) {
    // Never the raw core text on screen (spec, section 6): it goes to the log.
    console.error('Loading the logbook', e);
    logbook.error = 'load';
  } finally {
    logbook.loading = false;
    logbook.pulling = false;
  }
}

// Development builds only: lets a headless check put the logbook in any state (account, Benthic+).
if (import.meta.env?.DEV && typeof window !== 'undefined') /** @type {any} */ (window).__logbook = logbook;

/**
 * Whether the diver has a Benthic+ account (the server's logbook): the equipment of a dive is theirs to change only then;
 * for everyone else « Autre équipement » shows with the Benthic+ chip and stays inert.
 */
export const isSubscriber = () => sheetVariant({ release: isRelease, subscriber: benthicPlusSubscriber(), email: logbook.email }) === 'subscriber';
