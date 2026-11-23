// @ts-check
// The rewriting of the UUID ids already in circulation to short ids (to-do #149; lib/short-id.js has the mapping).
//
// Two callers share one pure planner, `planShortIds`:
//  - the device's store (`ensureShortIds`, once, in one transaction, with a marker and a backup in `meta/`);
//  - the `benthic` branch (lib/account-sync.js, the « Short ids » commit, and again whenever a file with an old id arrives).
// The planner has no state beyond its input and the mapping is a function of the old id, so two devices that run it on the
// same files write the same files. Dates (`updatedAt`) are never touched: a rewritten file is byte for byte what the other
// device writes, and git merges the two without a conflict.
//
// What is rewritten: the file's name and `id`; every reference to another id (`gearIds`, `*GearId`, `kitId`, `gearId`,
// `photoId`, `invoicePhotoId`), the ids inside a file (a maintenance history entry, a piece outside the inventory on a dive).
// What is not: a sealed block. A sealed card is authenticated with its id, so a rewritten card keeps the id it was sealed under in
// `sealId` (in clear next to `id`) and is opened with it, and so are its photos; nothing needs the data key to migrate, and the card keeps `sealId` for good (a new
// photo is sealed under it too). `documents/<hash>.json` is named by a hash and is not
// touched. The Subsurface logbook (dive ids, branch `main`) is never read here.

import { isUuid, setIdAliases, shortFromUuid } from './short-id.js';

/** The folders whose files carry a Benthic id, with the one rule of their references. */
export const ID_FOLDERS = ['gear/', 'kits/', 'maintenance/', 'dive-equipment/', 'gear-photos/', 'certifications/', 'dive-validations/'];

/** The marker, the collision answers and the backup, in the local store's `meta/` (never synced). */
export const MARKER_PATH = 'meta/ids-v1.json';
export const ALIASES_PATH = 'meta/id-map.json';
export const BACKUP_PATH = 'meta/backup-short-ids.json';

/** @param {string} path @returns {{ folder: string, id: string }|null} */
export function splitPath(path) {
  const folder = ID_FOLDERS.find((f) => path.startsWith(f));
  if (!folder || !path.endsWith('.json') || path.indexOf('/', folder.length) !== -1) return null;
  return { folder, id: path.slice(folder.length, -'.json'.length) };
}

/** True for `gear/<uuid>.json` and the other files of `ID_FOLDERS` named by an old id. @param {string} path */
export const isOldIdPath = (path) => {
  const s = splitPath(path);
  return !!s && isUuid(s.id);
};

/**
 * The file with `m` applied to every id it holds.
 * @param {string} folder @param {Record<string, any>} json @param {(v: any) => any} m
 * @returns {Record<string, any>}
 */
function mapIds(folder, json, m) {
  const out = { ...json };
  if ('id' in out) out.id = m(out.id);
  const list = (/** @type {unknown} */ v) => (Array.isArray(v) ? v.map(m) : v);
  const set = (/** @type {string} */ key, /** @type {(v: any) => any} */ f) => {
    if (key in out) out[key] = f(out[key]);
  };
  if (folder === 'gear/') set('photoId', m);
  else if (folder === 'kits/') set('gearIds', list);
  else if (folder === 'maintenance/') {
    set('gearId', m);
    set('history', (h) => (Array.isArray(h) ? h.map((e) => (e && typeof e === 'object' ? mapIds('history', e, m) : e)) : h));
  } else if (folder === 'history') {
    if ('invoicePhotoId' in out) out.invoicePhotoId = m(out.invoicePhotoId);
  } else if (folder === 'dive-equipment/') {
    set('suitGearId', m);
    set('undersuitGearId', m);
    set('gearIds', list);
    set('kitId', m);
    set('adhoc', (a) => (Array.isArray(a) ? a.map((p) => (p && typeof p === 'object' ? { ...p, id: m(p.id) } : p)) : a));
  }
  return out;
}

/** The newest `updatedAt` wins; the same on every device (a tie goes to the larger text). @param {any} a @param {any} b */
export function newestWins(a, b) {
  const x = String(a?.updatedAt ?? '');
  const y = String(b?.updatedAt ?? '');
  if (x !== y) return x > y ? a : b;
  return JSON.stringify(a) >= JSON.stringify(b) ? a : b;
}

/**
 * What the rewriting does to a set of files.
 * @param {{ files: Map<string, Record<string, any>>, aliases?: Record<string, string>, derive?: (uuid: string, attempt: number) => string, merge?: (folder: string, a: Record<string, any>, b: Record<string, any>) => Record<string, any> }} input
 *   `files`: the parsed files by path (only `ID_FOLDERS` are looked at); `aliases`: the collision answers already recorded;
 *   `derive`: the mapping (`shortFromUuid`; replaced only by the tests to force a collision);
 *   `merge`: joins a rewritten file with one that already holds its new path (the other device got there first, or an old
 *   version pushed an old-id file later); `newestWins` by default
 * @returns {{ writes: Map<string, Record<string, any>>, removes: string[], map: Record<string, string>, aliases: Record<string, string>, collisions: string[] }}
 *   `map`: every old id met and its new id; `aliases`: the ones that did not get the first answer of the mapping;
 *   `collisions`: the old ids that did not
 */
export function planShortIds({ files, aliases = {}, derive = shortFromUuid, merge = (_folder, a, b) => newestWins(a, b) }) {
  /** @type {Set<string>} */
  const olds = new Set();
  /** @type {Set<string>} */
  // A new id is never given twice. A short id already in the tree is not counted: if it is what an old id maps to, it is that old id's
  // twin (the other device got there first) and the two files are merged; an independent file with the same 50 bits is not a case.
  const taken = new Set(Object.values(aliases));
  /** @param {string} v */
  const note = (v) => {
    if (isUuid(v)) olds.add(v.toLowerCase());
  };
  for (const [path, json] of files) {
    const s = splitPath(path);
    if (!s) continue;
    note(s.id);
    mapIds(s.folder, json, (v) => (typeof v === 'string' ? (note(v), v) : v));
  }
  /** @type {Map<string, string>} */
  const table = new Map();
  /** @type {Record<string, string>} */
  const used = { ...aliases };
  /** @type {string[]} */
  const collisions = [];
  for (const old of [...olds].sort()) {
    if (used[old]) {
      table.set(old, used[old]);
      continue;
    }
    let attempt = 0;
    let candidate = derive(old, attempt);
    while (taken.has(candidate)) candidate = derive(old, ++attempt);
    taken.add(candidate);
    table.set(old, candidate);
    if (attempt) {
      used[old] = candidate;
      collisions.push(old);
    }
  }
  const m = (/** @type {any} */ v) => (typeof v === 'string' && isUuid(v) ? (table.get(v.toLowerCase()) ?? v) : v);

  /** The files by the path they will have; several files on one path are merged, whichever order they come in. @type {Map<string, { folder: string, files: Record<string, any>[] }>} */
  const byTarget = new Map();
  /** @type {string[]} */
  const moved = [];
  const sorted = [...files].filter(([p]) => splitPath(p)).sort(([a], [b]) => (a < b ? -1 : 1));
  for (const [path, json] of sorted) {
    const s = /** @type {{ folder: string, id: string }} */ (splitPath(path));
    const next = mapIds(s.folder, json, m);
    if (s.folder === 'certifications/' && typeof json.id === 'string' && isUuid(json.id) && next.id !== json.id && !('sealId' in next)) next.sealId = json.id;
    const target = `${s.folder}${m(s.id)}.json`;
    if (target !== path) moved.push(path);
    const group = byTarget.get(target) ?? { folder: s.folder, files: [] };
    // The file that already holds the path comes first, so that a tie goes to it.
    if (target === path) group.files.unshift(next);
    else group.files.push(next);
    byTarget.set(target, group);
  }
  /** @type {Map<string, Record<string, any>>} */
  const writes = new Map();
  for (const [target, group] of byTarget) {
    const value = group.files.reduce((a, b) => merge(group.folder, b, a));
    const before = files.get(target);
    if (!before || JSON.stringify(before) !== JSON.stringify(value)) writes.set(target, value);
  }
  const removes = moved;
  return { writes, removes: removes.filter((p) => !writes.has(p)), map: Object.fromEntries(table), aliases: used, collisions };
}

/**
 * The text of a file as the store keeps it, or null when it cannot be read as JSON (such a file is left alone).
 * @param {import('./file-store.js').FileStore} store @param {string} path
 */
async function snapshot(store, path) {
  try {
    return await store.readSnapshot(path);
  } catch {
    return { text: /** @type {string|null} */ (null), value: null };
  }
}

/** One run at a time per store. @type {WeakMap<object, Promise<{ migrated: number }>>} */
const running = new WeakMap();

/**
 * Rewrites the old ids of the device's store, once (and again when files with old ids come back, e.g. a restored backup):
 * one transaction renames the files, rewrites the ids and the references and marks every rewritten path as not sent
 * yet; `meta/ids-v1.json` is the marker; the files as they were are in `meta/backup-short-ids.json` (rollback:
 * docs/account-sync.md, « Short ids »). Sealed files are never opened.
 * @param {import('./file-store.js').FileStore} store
 * @param {{ now?: () => Date }} [deps]
 * @returns {Promise<{ migrated: number }>} the files rewritten
 */
export function ensureShortIds(store, deps = {}) {
  const current = running.get(store);
  if (current) return current;
  const p = run(store, deps).finally(() => running.delete(store));
  running.set(store, p);
  return p;
}

/** @param {import('./file-store.js').FileStore} store @param {{ now?: () => Date }} deps */
async function run(store, { now = () => new Date() }) {
  const marker = await store.read(MARKER_PATH);
  const aliases = (await store.read(ALIASES_PATH))?.map ?? {};
  setIdAliases(aliases);
  /** @type {string[]} */
  const paths = [];
  for (const folder of ID_FOLDERS) paths.push(...(await store.list(folder)));
  // Once it has run, a look at the names is enough: an old id can only come back as a file name.
  if (marker && !paths.some(isOldIdPath)) return { migrated: 0 };

  for (let attempt = 0; attempt < 5; attempt++) {
    /** @type {Map<string, Record<string, any>>} */
    const files = new Map();
    /** @type {[string, string|null][]} */
    const expected = [];
    for (const path of paths) {
      const { text, value } = await snapshot(store, path);
      expected.push([path, text]);
      if (value && typeof value === 'object' && !Array.isArray(value)) files.set(path, value);
    }
    const stored = await store.readSnapshot('meta/pending.json').catch(() => ({ text: /** @type {string|null} */ (null), value: null }));
    const markerNow = await store.readSnapshot(MARKER_PATH);
    expected.push(['meta/pending.json', stored.text], [MARKER_PATH, markerNow.text]);
    const aliasesNow = await store.readSnapshot(ALIASES_PATH);
    expected.push([ALIASES_PATH, aliasesNow.text]);
    const backupNow = await store.readSnapshot(BACKUP_PATH);
    expected.push([BACKUP_PATH, backupNow.text]);

    const plan = planShortIds({ files, aliases: aliasesNow.value?.map ?? {} });
    const stamp = now().toISOString().replace(/\.\d{3}Z$/, 'Z');
    if (!plan.writes.size && !plan.removes.length) {
      await store.write(MARKER_PATH, { format: 1, migratedAt: markerNow.value?.migratedAt ?? stamp, checkedAt: stamp, files: markerNow.value?.files ?? 0 });
      return { migrated: 0 };
    }
    /** @type {Record<string, string>} */
    const saved = { ...(backupNow.value?.files ?? {}) };
    for (const path of [...plan.removes, ...plan.writes.keys()]) {
      // The photos and the sealed documents are big and only renamed or re-pointed; the map brings the rest back.
      if (path.startsWith('gear-photos/') || path in saved) continue;
      const text = expected.find(([p]) => p === path)?.[1];
      if (typeof text === 'string') saved[path] = text;
    }
    const oldPending = Array.isArray(stored.value?.paths) ? /** @type {string[]} */ (stored.value.paths) : [];
    const writes = /** @type {[string, unknown][]} */ ([...plan.writes]);
    writes.push(
      [MARKER_PATH, { format: 1, migratedAt: markerNow.value?.migratedAt ?? stamp, checkedAt: stamp, files: (markerNow.value?.files ?? 0) + plan.writes.size, map: { ...(markerNow.value?.map ?? {}), ...plan.map } }],
      [BACKUP_PATH, { format: 1, createdAt: backupNow.value?.createdAt ?? stamp, note: 'The files as they were before the short ids; see docs/account-sync.md', files: saved }],
    );
    if (Object.keys(plan.aliases).length) writes.push([ALIASES_PATH, { format: 1, map: plan.aliases }]);
    // Every rewritten file goes to the server like an edit; the old names are sent as removals; an edit not sent yet follows its file.
    const pending = [...new Set([...oldPending, ...plan.writes.keys(), ...plan.removes])].sort();
    writes.push(['meta/pending.json', { ...(stored.value && typeof stored.value === 'object' ? stored.value : {}), format: 1, paths: pending }]);
    // The pending list is written by this same transaction, so the batch is untracked (`batchIfUnchanged`).
    const ok = await store.batchIfUnchanged(expected, { writes, removes: plan.removes });
    if (!ok) continue;
    setIdAliases(plan.aliases);
    return { migrated: plan.writes.size };
  }
  throw new Error('SHORT_IDS_CONFLICT');
}
