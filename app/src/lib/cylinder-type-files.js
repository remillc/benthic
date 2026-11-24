// @ts-check
// The cylinder types the diver added, kept as files of the account data (task 2026-11-23-373, docs/architecture.md,
// 11.3): `cylinder-types/<id>.json` = { format: 1, id, name, ml, mbar, createdAt, updatedAt }, one file per type, so
// that two devices adding different types merge without a conflict. Nothing is written to the Subsurface log: a dive
// still copies the name, volume and pressure into its own cylinder.
//
// The pure parts are here: the file, the merge of two files with the same name (the clean-up pass of the sync engine),
// the list the diver sees (the logbook's types united with the added ones), the migration of the old device library and
// the « Tailles courantes ». The store and the core are in lib/cylinder-type-library.svelte.js.

/** The folder of the files, in the store and on the `benthic` branch. */
export const CYLINDER_TYPES_FOLDER = 'cylinder-types/';

/** The same name for two devices: letters and digits only, accents and case ignored (as the join matches gear and kits). @param {unknown} name */
export const typeKey = (name) =>
  String(name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

/**
 * One added type.
 * @typedef {Object} CylinderTypeFile
 * @property {number} format
 * @property {string} id
 * @property {string} name
 * @property {number} ml water volume
 * @property {number} mbar working pressure; 0 when unknown
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/** @param {string} id @returns {string} */
export const pathOfType = (id) => `${CYLINDER_TYPES_FOLDER}${id}.json`;

/**
 * A new file.
 * @param {{ id: string, name: string, ml: number, mbar: number, stamp: string }} input
 * @returns {CylinderTypeFile}
 */
export function newTypeFile({ id, name, ml, mbar, stamp }) {
  return { format: 1, id, name: name.trim(), ml: Math.round(ml), mbar: Math.round(mbar), createdAt: stamp, updatedAt: stamp };
}

/** Whether a file read from the store or the server is one a device can use. @param {any} file @returns {file is CylinderTypeFile} */
export const isTypeFile = (file) => !!file && typeof file === 'object' && typeof file.id === 'string' && typeof file.name === 'string' && file.name.trim() !== '' && Number.isFinite(file.ml);

/**
 * The files two devices added for the same name (the clean-up pass of the sync engine, docs/account-sync.md): the
 * earliest id stays, the size with the later `updatedAt` wins, the other files are removed.
 * @param {Map<string, Record<string, any>>} byPath the files by path (`cylinder-types/<id>.json`)
 * @param {() => string} stamp
 * @returns {Map<string, Record<string, any>|null>} the paths to rewrite (a file) or to remove (null)
 */
export function mergeSameName(byPath, stamp) {
  /** @type {Map<string, [string, Record<string, any>][]>} */
  const groups = new Map();
  for (const [path, file] of byPath) {
    if (!path.startsWith(CYLINDER_TYPES_FOLDER) || !isTypeFile(file)) continue;
    const key = typeKey(file.name);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), [path, file]]);
  }
  /** @type {Map<string, Record<string, any>|null>} */
  const changes = new Map();
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const byId = members.slice().sort((a, b) => (String(a[1].id) < String(b[1].id) ? -1 : String(a[1].id) > String(b[1].id) ? 1 : 0));
    const [keepPath, keep] = byId[0];
    const newest = members.slice().sort((a, b) => {
      const x = String(a[1].updatedAt ?? '');
      const y = String(b[1].updatedAt ?? '');
      return x === y ? (String(a[1].id) < String(b[1].id) ? 1 : -1) : x < y ? 1 : -1;
    })[0][1];
    const merged = { ...keep, name: newest.name, ml: newest.ml, mbar: newest.mbar ?? 0 };
    const createdAt = members.map(([, f]) => String(f.createdAt ?? '')).filter(Boolean).sort()[0];
    if (createdAt) merged.createdAt = createdAt;
    if (merged.name !== keep.name || merged.ml !== keep.ml || (merged.mbar ?? 0) !== (keep.mbar ?? 0)) merged.updatedAt = stamp();
    changes.set(keepPath, JSON.stringify(merged) === JSON.stringify(keep) ? keep : merged);
    for (const [path] of byId.slice(1)) changes.set(path, null);
  }
  // Nothing to write for a file that stays as it is.
  for (const [path, value] of [...changes]) if (value !== null && value === byPath.get(path)) changes.delete(path);
  return changes;
}

/**
 * What the library gives the core: one string per added type, « name TAB ml TAB mbar ».
 * @param {{ name: string, ml: number, mbar: number }[]} files
 */
export const coreStrings = (files) => files.map((f) => `${f.name}\t${Math.round(f.ml)}\t${Math.round(f.mbar ?? 0)}`);

/**
 * One row of the list of types.
 * @typedef {Object} TypeRow
 * @property {string} name
 * @property {number} ml
 * @property {number} mbar
 * @property {number} dives how many dives of the logbook use it
 * @property {string|null} fileId the added type's file; null for a type only the logbook's dives have
 */

/**
 * The list the diver sees: the types the logbook's dives use (the core reads them) united by name with the added files.
 * A type that is both stays one row, with its dive count; the added file's size is the diver's choice and wins.
 * @param {{ name: string, ml: number, mbar: number, dives: number }[]} coreTypes
 * @param {{ id: string, name: string, ml: number, mbar: number }[]} files
 * @returns {TypeRow[]}
 */
export function unionTypes(coreTypes, files) {
  /** @type {Map<string, TypeRow>} */
  const rows = new Map();
  for (const type of coreTypes) {
    const key = typeKey(type.name);
    const known = rows.get(key);
    if (known) known.dives += type.dives;
    else rows.set(key, { name: type.name, ml: type.ml, mbar: type.mbar, dives: type.dives, fileId: null });
  }
  for (const file of files) {
    const key = typeKey(file.name);
    const row = rows.get(key);
    if (row) {
      row.fileId = file.id;
      row.ml = file.ml;
      row.mbar = file.mbar ?? 0;
    } else rows.set(key, { name: file.name, ml: file.ml, mbar: file.mbar ?? 0, dives: 0, fileId: file.id });
  }
  return [...rows.values()];
}

/**
 * The types of the old device library (`bc.cylinderLibrary`) that become added types: the ones the diver added, and a
 * standard type whose size was changed. An untouched standard type is not migrated, and no type of the default table
 * is ever copied.
 * @param {{ name: string, ml: number, mbar: number }[]} library the old library as the core reads it
 * @param {{ name: string, ml: number, mbar: number }[]} defaults the core's default table
 * @returns {{ name: string, ml: number, mbar: number }[]}
 */
export function migratedTypes(library, defaults) {
  return library.filter((type) => !defaults.some((d) => d.name === type.name && d.ml === type.ml && d.mbar === type.mbar));
}

/**
 * The common sizes offered as chips and in the default cylinder choices, in the unit system: the imperial entries
 * (AL80, HP100...) when the volume is in cubic feet, the metric ones otherwise.
 * @param {{ name: string, ml: number, mbar: number, imperial: boolean }[]} defaults
 * @param {boolean} cuft
 */
export const commonSizes = (defaults, cuft) => defaults.filter((d) => d.imperial === cuft);

/** The few sizes the default cylinder choices list under « Tailles courantes ». */
export const CHOICE_SIZES = { cuft: ['AL80', 'AL40', 'HP100', 'HP80', 'HP117', 'LP95', 'AL63'], metric: ['10L 232 bar', '12L 232 bar', '15L 232 bar', '12L 200 bar', '10L 200 bar'] };

/**
 * @param {{ name: string, ml: number, mbar: number, imperial: boolean }[]} defaults
 * @param {boolean} cuft
 */
export function choiceSizes(defaults, cuft) {
  const names = cuft ? CHOICE_SIZES.cuft : CHOICE_SIZES.metric;
  return names.map((name) => defaults.find((d) => d.name === name && d.imperial === cuft)).filter((d) => !!d);
}
