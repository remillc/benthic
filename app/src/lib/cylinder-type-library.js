// @ts-check
// The added cylinder types and the core: what the core is given (Subsurface's tank info table, in memory only, nothing
// is written to the log) and what the old device library migrates to (task 2026-11-23-373). No store, no screen code.
import { BenthicCore } from 'benthic-core';
import { invalidateCoreCache } from './core-cache.js';
import { coreStrings, migratedTypes } from './cylinder-type-files.js';

/** What the core was last given, as one text; null when it must be given again. @type {string|null} */
let lastFed = null;

/** The core must be given the list again (a rename undone, the logbook reloaded...). */
export const forgetFed = () => {
  lastFed = null;
};

/**
 * Gives the core the diver's added types, as the types its dive editor, planner and tools offer. Only when the list is
 * not what the core already has.
 * @param {{ name: string, ml: number, mbar: number }[]} files
 * @param {boolean} [force]
 * @returns {Promise<boolean>} whether the core was given the list
 */
export async function feedCore(files, force = false) {
  const added = coreStrings(files);
  const text = JSON.stringify(added);
  if (!force && text === lastFed) return false;
  await BenthicCore.cylinderTypes({ action: 'added', value: JSON.stringify({ added }) });
  lastFed = text;
  invalidateCoreCache(); // the cylinder types the tools list
  return true;
}

/**
 * The types the old device library holds, read through the core (which converts cubic feet and psi): the ones to make
 * into files. The core's default table is the reference for "untouched".
 * @param {string[]} library the old library's strings
 * @returns {Promise<{ name: string, ml: number, mbar: number }[]>}
 */
export async function typesToMigrate(library) {
  await BenthicCore.cylinderTypes({ action: 'library', value: JSON.stringify({ library }) });
  const [{ types }, { defaults }] = await Promise.all([BenthicCore.cylinderTypes({ action: 'list' }), BenthicCore.cylinderTypes({ action: 'defaults' })]);
  const inLibrary = types.filter((type) => type.library).map(({ name, ml, mbar }) => ({ name, ml, mbar }));
  return migratedTypes(inLibrary, defaults ?? []);
}
