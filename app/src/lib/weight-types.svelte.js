// @ts-check
// Settings › Équipement › Types de lest, the operations: one list, the diver's weight types. The core gives the
// descriptions the logbook's dives use, with their dive counts (`BenthicCore.weightTypes`); the diver's files
// (lib/weight-type-files.js) give the weights and the types no dive uses. Renaming a type renames its weights in every
// dive (one undoable step of the core, as for the cylinder types) and its file follows.
import { BenthicCore } from 'benthic-core';
import { newId } from './inventory.js';
import { readWeightTypes, changeWeightTypes } from './inventory.svelte.js';
import { weightPlaceName } from './desktop-detail.js';
import { renameWeightType } from './logbook.svelte.js';
import { BUILTIN_WEIGHT_TYPES, newWeightTypeFile, unionWeightTypes, weightTypeKey } from './weight-type-files.js';

const stamp = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

/** @returns {Promise<import('./weight-type-files.js').WeightTypeRow[]>} */
export async function readWeightTypeRows() {
  const [core, files] = await Promise.all([
    BenthicCore.weightTypes({ action: 'list' }).catch((/** @type {unknown} */ e) => {
      console.error('Weight types of the core', e);
      return null;
    }),
    readWeightTypes().catch((/** @type {unknown} */ e) => {
      console.error('Weight type files', e);
      return [];
    }),
  ]);
  const types = core?.types?.length ? core.types : BUILTIN_WEIGHT_TYPES.map((name) => ({ name, grams: 0, dives: 0 }));
  return unionWeightTypes(types, files, weightPlaceName);
}

/** @param {string} name @param {import('./weight-type-files.js').WeightTypeRow[]} rows @param {string|null} except */
const nameTaken = (name, rows, except) => rows.some((row) => row.name !== except && weightTypeKey(row.name) === weightTypeKey(name));

/**
 * Adds a type of the diver.
 * @param {{ name: string, grams: number }} type
 */
export async function addWeightType({ name, grams }) {
  if (nameTaken(name, await readWeightTypeRows(), null)) throw new Error('NAME_IN_USE');
  await changeWeightTypes([newWeightTypeFile({ id: newId(), name, grams, stamp: stamp() })]);
}

/**
 * Saves a type: its weight, and its name, which renames the weights of that type in every dive.
 * @param {import('./weight-type-files.js').WeightTypeRow} row
 * @param {{ name: string, grams: number }} next
 */
export async function saveWeightType(row, { name, grams }) {
  const finalName = name.trim().replace(/\s+/g, ' ');
  const renamed = finalName !== row.name;
  if (renamed && nameTaken(finalName, await readWeightTypeRows(), row.name)) throw new Error('NAME_IN_USE');
  if (renamed) await renameWeightType(row.name, finalName).catch((/** @type {unknown} */ e) => {
    // A type only its file knows is not in the core: nothing to rename there.
    if (!String(/** @type {any} */ (e)?.message ?? e).includes('NOT_FOUND')) throw e;
  });
  const files = await readWeightTypes();
  const own = files.find((f) => f.id === row.fileId);
  const now = stamp();
  const file = own
    ? { ...own, name: finalName, grams: Math.round(grams), updatedAt: now }
    : newWeightTypeFile({ id: newId(), name: finalName, grams, stamp: now });
  await changeWeightTypes([file]);
}

/**
 * Deletes a type: its file and its row of the core's table. The dives keep their weights (a type some dive uses stays in
 * the list, without a weight of its own).
 * @param {import('./weight-type-files.js').WeightTypeRow} row
 */
export async function removeWeightType(row) {
  if (row.fileId) await changeWeightTypes([], [row.fileId]);
  await BenthicCore.weightTypes({ action: 'remove', name: row.name }).catch((/** @type {unknown} */ e) => console.error('Removing the weight type of the core', e));
}
