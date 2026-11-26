// @ts-check
// Settings › Équipement › Types de lest: one list, the diver's weight types. A type is a weight description the logbook's
// dives use (read through the core, with the number of dives) or one the diver added; the diver's files
// (`weight-types/<id>.json`, synced like the cylinder types) hold the weight of each. Nothing here is written to the log
// but the renaming, which the core does in every dive. Pure, so that node:test can check it.

export const WEIGHT_TYPES_FOLDER = 'weight-types/';

/** The weight types the dive editor offers when the core cannot give any (the keys of detail.weightPlaces). */
export const BUILTIN_WEIGHT_TYPES = ['integrated', 'belt', 'ankle', 'backplate', 'clip-on'];

/**
 * @typedef {{ id: string, name: string, grams: number, createdAt: string, updatedAt: string }} WeightTypeFile
 * @typedef {{ name: string, grams: number, dives: number, fileId: string|null }} WeightTypeRow
 *   grams: the weight (the file's when it has one), else the weight last used (the core's), 0 when none.
 *   dives: the number of dives that use the type.
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
 * The list: the core's types (the dives' and the table's) united with the diver's files, sorted by `label` ignoring
 * accents and case (fr-CA collation). A file gives a type its weight (when it is above 0). Two files of one name (two
 * devices) count once, the newer.
 * @param {{ name: string, grams: number, dives?: number }[]} coreTypes
 * @param {WeightTypeFile[]} files
 * @param {(name: string) => string} [label] the name as shown (the built-in names are translated)
 * @returns {WeightTypeRow[]}
 */
export function unionWeightTypes(coreTypes, files, label = (name) => name) {
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
    const grams = file && file.grams > 0 ? file.grams : Math.max(0, Math.round(c.grams || 0));
    rows.push({ name: c.name, grams, dives: c.dives ?? 0, fileId: file?.id ?? null });
  }
  for (const [key, f] of byKey) if (!listed.has(key)) rows.push({ name: f.name, grams: f.grams, dives: 0, fileId: f.id });
  const collator = new Intl.Collator('fr-CA', { sensitivity: 'base' });
  return rows.sort((a, b) => collator.compare(label(a.name), label(b.name)));
}
