// @ts-check
// Settings › Équipement › Types de lest, the operations: one list, Subsurface's weight types and those of the logbook's
// dives (its ws_info table, read through the core) united with the diver's files (lib/weight-type-files.js). A type the
// logbook has keeps its name here (renaming it in every dive is not offered yet): only its usual weight is the diver's.
// A type the diver added is a file only: renamed, given a usual weight, removed.
import { BenthicCore } from 'benthic-core';
import { newId } from './inventory.js';
import { readWeightTypes, changeWeightTypes } from './inventory.svelte.js';
import { BUILTIN_WEIGHT_TYPES, newWeightTypeFile, unionWeightTypes, weightTypeKey } from './weight-type-files.js';

const stamp = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

/** @returns {Promise<import('./weight-type-files.js').WeightTypeRow[]>} */
export async function readWeightTypeRows() {
  const [core, files] = await Promise.all([
    BenthicCore.toolQuery({ kind: 'weights' }).catch((/** @type {unknown} */ e) => {
      console.error('Weight types of the core', e);
      return null;
    }),
    readWeightTypes().catch((/** @type {unknown} */ e) => {
      console.error('Weight type files', e);
      return [];
    }),
  ]);
  const types = Array.isArray(core?.types) && core.types.length ? core.types : BUILTIN_WEIGHT_TYPES.map((name) => ({ name, grams: 0 }));
  return unionWeightTypes(types, files);
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
 * Saves a type: its usual weight, and its name when it is one the diver added.
 * @param {import('./weight-type-files.js').WeightTypeRow} row
 * @param {{ name: string, grams: number }} next
 */
export async function saveWeightType(row, { name, grams }) {
  const finalName = row.inLogbook ? row.name : name.trim().replace(/\s+/g, ' ');
  if (!row.inLogbook && nameTaken(finalName, await readWeightTypeRows(), row.name)) throw new Error('NAME_IN_USE');
  const files = await readWeightTypes();
  const own = files.find((f) => f.id === row.fileId);
  const now = stamp();
  const file = own
    ? { ...own, name: finalName, grams: Math.round(grams), updatedAt: now }
    : newWeightTypeFile({ id: newId(), name: finalName, grams, stamp: now });
  await changeWeightTypes([file]);
}

/**
 * Removes a type the diver added, or the usual weight of a type the logbook has (it goes back to the weight last used).
 * @param {import('./weight-type-files.js').WeightTypeRow} row
 */
export async function removeWeightType(row) {
  if (row.fileId) await changeWeightTypes([], [row.fileId]);
}
