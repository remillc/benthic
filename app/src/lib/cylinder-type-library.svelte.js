// @ts-check
// Settings › Équipement › Types de bouteilles, the operations (task 2026-11-23-373): one list of the types the logbook's
// dives use and the ones the diver added; the added ones are files of the account data (lib/cylinder-type-files.js) kept
// by the inventory's store and synced like the gear. The core is given them in memory (lib/cylinder-type-library.js).
import { BenthicCore } from 'benthic-core';
import { newId } from './inventory.js';
import { gear, readCylinderTypes, changeCylinderTypes } from './inventory.svelte.js';
import { logbook, renameCylinderType, deleteCylinderType } from './logbook.svelte.js';
import { oldCylinderLibrary, dropOldCylinderLibrary } from './settings.svelte.js';
import { feedCore, forgetFed, typesToMigrate } from './cylinder-type-library.js';
import { newTypeFile, typeKey, unionTypes } from './cylinder-type-files.js';
import { sortCylinderTypes } from '../../../plugins/benthic-core/cylinder-sort.js';
import { UNKNOWN_CYLINDER_TYPE } from './cylinder-types.js';

const stamp = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

/**
 * At start: the old device library becomes files (once), then the core is given the added types.
 * @returns {Promise<void>}
 */
export async function startCylinderTypes() {
  const files = await readCylinderTypes();
  const old = oldCylinderLibrary();
  if (old) {
    const known = new Set(files.map((f) => typeKey(f.name)));
    const fresh = (await typesToMigrate(old)).filter((type) => !known.has(typeKey(type.name)));
    const now = stamp();
    const made = fresh.map((type) => newTypeFile({ id: newId(), name: type.name, ml: type.ml, mbar: type.mbar, stamp: now }));
    if (made.length) await changeCylinderTypes(made);
    dropOldCylinderLibrary();
    files.push(...made);
  }
  await feedCore(files, true);
  gear.cylinderTypes = files;
}

/**
 * The list on screen: what the core reads from the dives, united with the added types.
 * @returns {Promise<import('./cylinder-type-files.js').TypeRow[]>}
 */
export async function readTypeRows() {
  const [{ types }, files] = await Promise.all([BenthicCore.cylinderTypes({ action: 'list' }), readCylinderTypes()]);
  gear.cylinderTypes = files;
  return sortCylinderTypes(unionTypes(types, files));
}

/** The common sizes of the core's default table, with `imperial` set for AL80, HP100... @returns {Promise<{ name: string, ml: number, mbar: number, imperial: boolean }[]>} */
export async function readDefaultSizes() {
  return (await BenthicCore.cylinderTypes({ action: 'defaults' })).defaults ?? [];
}

/** @param {string} name @param {import('./cylinder-type-files.js').TypeRow[]} rows @param {string|null} except */
const nameTaken = (name, rows, except) => rows.some((row) => row.name !== except && typeKey(row.name) === typeKey(name));

/**
 * Adds a type of the diver: one file.
 * @param {{ name: string, ml: number, mbar: number }} type
 */
export async function addCylinderType({ name, ml, mbar }) {
  const trimmed = name.trim();
  if (nameTaken(trimmed, await readTypeRows(), null)) throw new Error('NAME_IN_USE');
  await changeCylinderTypes([newTypeFile({ id: newId(), name: trimmed, ml, mbar, stamp: stamp() })]);
}

/**
 * Saves a type that was edited: its name and its size.
 * - A type some dive uses is renamed by the core, with its cylinders (one undoable step), and its file follows if it has one.
 * - An added type no dive uses is only a file.
 * - A new size of a type that has no file yet (one the logbook's dives carry) makes it an added type: the size is the
 *   diver's, and the dives keep their own.
 * @param {import('./cylinder-type-files.js').TypeRow} row
 * @param {{ name: string, ml: number, mbar: number }} next
 */
export async function saveCylinderType(row, { name, ml, mbar }) {
  const trimmed = name.trim();
  if (nameTaken(trimmed, await readTypeRows(), row.name)) throw new Error('NAME_IN_USE');
  const renamed = trimmed !== row.name;
  const resized = ml !== row.ml || mbar !== row.mbar;
  if (renamed && (row.dives > 0 || !row.fileId)) {
    await renameCylinderType(row.name, trimmed);
    forgetFed();
  }
  if (!row.fileId && !resized) return;
  const files = await readCylinderTypes();
  const file = files.find((f) => f.id === row.fileId);
  const now = stamp();
  const next = file
    ? { ...file, name: trimmed, ml, mbar, updatedAt: now }
    : newTypeFile({ id: newId(), name: trimmed, ml, mbar, stamp: now });
  if (!file || next.name !== file.name || next.ml !== file.ml || next.mbar !== file.mbar) await changeCylinderTypes([next]);
  else await feedCore(files, true);
}

/**
 * Deletes a type. One a dive uses (or one only the logbook has) goes through the core, with the dives' confirmation; an
 * added type no dive uses is only a file, removed (it syncs as a deletion). The file goes too when there is one.
 * @param {import('./cylinder-type-files.js').TypeRow} row
 */
export async function deleteType(row) {
  if (row.name === UNKNOWN_CYLINDER_TYPE) return;
  if (row.dives > 0 || !row.fileId) {
    await deleteCylinderType(row.name);
    forgetFed();
  }
  if (row.fileId) await changeCylinderTypes([], [row.fileId]);
  else await feedCore(await readCylinderTypes(), true);
}

/**
 * An undone or redone rename changed the core's own copy of the diver's types: the file that lost its name takes the
 * one the core now has, when exactly one differs.
 * @param {{ name: string, library: boolean }[]} coreTypes
 */
export async function followCoreTypes(coreTypes) {
  const files = await readCylinderTypes();
  const inCore = coreTypes.filter((t) => t.library).map((t) => t.name);
  const lost = files.filter((f) => !inCore.includes(f.name));
  const fresh = inCore.filter((n) => !files.some((f) => f.name === n));
  if (lost.length === 1 && fresh.length === 1) await changeCylinderTypes([{ ...lost[0], name: fresh[0], updatedAt: stamp() }]);
  else forgetFed();
}

/** Whether the sizes show in cubic feet. */
export const usesCubicFeet = () => logbook.prefs.volume === 'cuft';
