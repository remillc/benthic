// @ts-check
// The one-time move of the references to a dive from its start time to its Benthic id (decided on 23 November 2026).
//
// Before the ids, three kinds of file on the `benthic` branch (and in the device's store) named a dive by its start time to the
// second: `dive-equipment/` (`diveKey: { start }`), `dive-validations/` (`dives: [{ start, hash }]`) and `media/<start made
// file-safe>.json` (`diveId`). They now hold the dive's Benthic id (lib/dive-id.js): `diveKey: { benthicId }`,
// `dives: [{ benthicId, hash }]`, `media/<benthic id>.json`.
//
// The mapping start -> id comes from the logbook, which every device shares, so every device computes the same result: the
// planner has no state and no clock, a rewritten file keeps its `updatedAt` (it is the same record, not an edit), and two devices
// that run it on the same files write the same bytes, which git merges without a conflict (the idea of short-id-migration.js).
// A start with no dive in the logbook (the dive is not loaded yet, or has no id yet, or was deleted) is left as it is and tried
// again at the next run. Two dives that start in the same second (two computers): the one with the smallest id takes the key.
//
// Two callers share the planner: the device's store (`migrateDiveIdsInStore`, run when the logbook has its ids) and the working
// copy of the `benthic` branch (the account-sync clean-up pass, lib/account-sync.js), which also receives files from a device that
// has not migrated yet. docs/account-sync.md, « Dive ids ».

import { mergeMediaFile, mediaPathOf } from './dive-media.js';
import { isShortId } from './short-id.js';

/** The folders that hold references to dives. */
export const DIVE_REFERENCE_FOLDERS = ['dive-equipment/', 'dive-validations/', 'media/'];

/** The start time of a dive to the second, as the records hold it: `YYYY-MM-DDTHH:MM:SS`. @param {unknown} key */
const isStartKey = (key) => typeof key === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(key);

/**
 * Start time -> Benthic id, from the dives of the logbook (rows of the list). Only a dive that has an id counts. Of dives that start
 * in the same second, the smallest id is the one.
 * @param {readonly { date: string, benthicId?: string }[]} dives
 * @returns {Map<string, string>}
 */
export function startToIdMap(dives) {
  /** @type {Map<string, string>} */
  const map = new Map();
  for (const d of dives) {
    if (!isShortId(d.benthicId)) continue;
    const start = String(d.date).slice(0, 19);
    const had = map.get(start);
    if (had === undefined || d.benthicId < had) map.set(start, d.benthicId);
  }
  return map;
}

/** The same start time as `media/` names it: made file-safe. @param {string} start */
const mediaName = (start) => mediaPathOf(start);

/**
 * What the references become. `files` holds the files of the three folders (any other path is ignored).
 * @param {{ files: Map<string, Record<string, any>>, startToId: Map<string, string> }} input
 * @returns {{ writes: Map<string, Record<string, any>>, removes: string[] }} the files to write (new or rewritten) and the paths to remove
 */
export function planDiveIds({ files, startToId }) {
  /** @type {Map<string, Record<string, any>>} */
  const writes = new Map();
  /** @type {string[]} */
  const removes = [];
  if (!startToId.size) return { writes, removes };
  /** The file-safe name of each start time, to find the dive of a media file. */
  const byMediaName = new Map([...startToId].map(([start, id]) => [mediaName(start), id]));

  for (const [path, file] of files) {
    if (path.startsWith('dive-equipment/')) {
      const start = file.diveKey?.start;
      const id = !file.diveKey?.benthicId && isStartKey(start) ? startToId.get(start) : undefined;
      if (id) writes.set(path, { ...file, diveKey: { benthicId: id } });
    } else if (path.startsWith('dive-validations/')) {
      if (!Array.isArray(file.dives)) continue;
      let changed = false;
      /** @type {Record<string, any>[]} */
      const dives = [];
      for (const d of file.dives) {
        const id = d && !d.benthicId && isStartKey(d.start) ? startToId.get(d.start) : undefined;
        if (!id) {
          dives.push(d);
          continue;
        }
        changed = true;
        // Two entries that now name the same dive are one.
        if (!dives.some((x) => x?.benthicId === id)) dives.push({ benthicId: id, hash: d.hash });
      }
      if (changed) writes.set(path, { ...file, dives });
    }
  }

  // Media: `media/<start made safe>.json` -> `media/<id>.json`; a file already at the target is merged (a union by hash).
  for (const [path, file] of files) {
    if (!path.startsWith('media/') || !path.endsWith('.json') || isShortId(file.diveId)) continue;
    const id = byMediaName.get(path);
    if (!id) continue;
    const target = `media/${id}.json`;
    const moved = { ...file, diveId: id };
    const there = writes.get(target) ?? files.get(target);
    // The file already at the target stays `ours`, so that the result does not depend on which device runs this.
    writes.set(target, there ? { ...mergeMediaFile(null, /** @type {any} */ (there), /** @type {any} */ (moved)), diveId: id } : moved);
    removes.push(path);
  }
  return { writes, removes: removes.sort() };
}

/**
 * Runs the migration on the device's store: the files are rewritten as tracked changes, so that the next sync sends them.
 * Cheap when there is nothing to do (a look at the three folders). Never throws for a store that is read only (the inventory is
 * read only after the subscription ended): the references are migrated by another device or later.
 * @param {import('./file-store.js').FileStore} store
 * @param {Map<string, string>} startToId
 * @param {(writes: [string, unknown][], removes: string[]) => Promise<void>} [commit] how the changes are written (the inventory's, which refuses when read only)
 * @returns {Promise<number>} the files written or removed
 */
export async function migrateDiveIdsInStore(store, startToId, commit = (writes, removes) => store.trackedBatch({ writes, removes })) {
  if (!startToId.size) return 0;
  /** @type {Map<string, Record<string, any>>} */
  const files = new Map();
  for (const folder of DIVE_REFERENCE_FOLDERS) {
    for (const path of await store.list(folder)) {
      if (!path.endsWith('.json') || path.indexOf('/', folder.length) !== -1) continue;
      const value = await store.read(path);
      if (value && typeof value === 'object' && !Array.isArray(value)) files.set(path, value);
    }
  }
  const { writes, removes } = planDiveIds({ files, startToId });
  if (!writes.size && !removes.length) return 0;
  try {
    await commit([...writes], removes);
  } catch (e) {
    if (/** @type {any} */ (e)?.name === 'ReadOnlyError') return 0;
    throw e;
  }
  return writes.size + removes.length;
}
