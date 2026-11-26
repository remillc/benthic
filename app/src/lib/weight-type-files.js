// @ts-check
// Settings › Équipement › Types de lest: the weight types the diver added or gave a usual weight, as files of the account
// data (`weight-types/<id>.json`), synced like the cylinder types. Subsurface keeps its weight types in memory only (its
// ws_info table: its own types and those of the logbook's dives, each with the weight last used): nothing here is written
// to the log. The list shown is that table united with the files. Pure, so that node:test can check it.

export const WEIGHT_TYPES_FOLDER = 'weight-types/';

/** Subsurface's own weight types (the keys of detail.weightPlaces): shown translated, never renamed or removed. */
export const BUILTIN_WEIGHT_TYPES = ['integrated', 'belt', 'ankle', 'backplate', 'clip-on'];

/**
 * @typedef {{ id: string, name: string, grams: number, createdAt: string, updatedAt: string }} WeightTypeFile
 * @typedef {{ name: string, grams: number, builtin: boolean, inLogbook: boolean, fileId: string|null }} WeightTypeRow
 *   grams: the usual weight (the file's), else the weight last used (the core's), 0 when none.
 *   inLogbook: the core lists it (a type of Subsurface's or of a dive), so it cannot be renamed or removed here.
 */

/** The same name, whatever its case and spaces. @param {string} name */
export const weightTypeKey = (name) => String(name).trim().replace(/\s+/g, ' ').toLocaleLowerCase();

export const pathOfWeightType = (/** @type {string} */ id) => `${WEIGHT_TYPES_FOLDER}${id}.json`;

/** @param {any} file @returns {file is WeightTypeFile} */
export const isWeightTypeFile = (file) =>
  !!file && typeof file === 'object' && typeof file.id === 'string' && typeof file.name === 'string' && file.name.trim() !== '' &&
  Number.isFinite(file.grams) && file.grams >= 0;

/** @param {{ id: string, name: string, grams: number, stamp: string }} fields @returns {WeightTypeFile} */
export const newWeightTypeFile = ({ id, name, grams, stamp }) => ({ id, name: name.trim().replace(/\s+/g, ' '), grams: Math.round(grams), createdAt: stamp, updatedAt: stamp });

/**
 * The list: the core's types in its order (Subsurface's first, then the dives'), then the diver's own added ones by name.
 * A file of a type the core lists gives it its usual weight. Two files of one name (two devices) count once, the newer.
 * @param {{ name: string, grams: number }[]} coreTypes
 * @param {WeightTypeFile[]} files
 * @returns {WeightTypeRow[]}
 */
export function unionWeightTypes(coreTypes, files) {
  /** @type {Map<string, WeightTypeFile>} */
  const byKey = new Map();
  for (const f of files) {
    const key = weightTypeKey(f.name);
    const seen = byKey.get(key);
    if (!seen || f.updatedAt > seen.updatedAt) byKey.set(key, f);
  }
  /** @type {WeightTypeRow[]} */
  const rows = [];
  const listed = new Set();
  for (const c of coreTypes) {
    const key = weightTypeKey(c.name);
    if (!c.name || listed.has(key)) continue;
    listed.add(key);
    const file = byKey.get(key);
    rows.push({ name: c.name, grams: file ? file.grams : Math.max(0, Math.round(c.grams || 0)), builtin: BUILTIN_WEIGHT_TYPES.includes(c.name), inLogbook: true, fileId: file?.id ?? null });
  }
  const added = [...byKey.entries()].filter(([key]) => !listed.has(key)).map(([, f]) => f)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  for (const f of added) rows.push({ name: f.name, grams: f.grams, builtin: false, inLogbook: false, fileId: f.id });
  return rows;
}
