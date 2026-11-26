// @ts-check
// Pure logic of the cylinder dialogs of the dive detail's Gaz tab (task 2026-11-26-401; mock-ups
// detail-bouteille-android and detail-bouteilles-recycleur-android): what the fields start with, the mix name under
// O₂ and He, which entries are valid, and the patch a Save sends to cylinderChanges (lib/desktop-edit.js). The dialog
// (components/CylinderEditDialog.svelte) and tests/app/cylinder-dialog.test.mjs call it.

import { gasName } from './cylinder-card.js';
import { parseTyped, pressureMbarOf } from './desktop-edit.js';

const MBAR_PER_PSI = 68.9476;

/**
 * @typedef {{ description: string, o2: string, he: string, start: string, end: string, use: string }} CylinderDraft
 * The texts of one cylinder's fields, as typed: percentages and pressures in the diver's unit.
 */

/** A percentage as typed back. @param {number} permille */
export const percentText = (permille) => String(Number((permille / 10).toFixed(1))).replace('.', ',');

/** A pressure as typed back, in the diver's unit; empty when there is none. @param {number} mbar @param {{ pressure: string }} prefs */
export const pressureText = (mbar, prefs) => (mbar > 0 ? String(Math.round(prefs.pressure === 'psi' ? mbar / MBAR_PER_PSI : mbar / 1000)) : '');

/**
 * The dialog's starting texts for a cylinder.
 * @param {import('benthic-core').Cylinder} c @param {{ pressure: string }} prefs
 * @returns {CylinderDraft}
 */
export const cylinderDraft = (c, prefs) => ({
  description: c.description ?? '',
  o2: percentText(c.o2Permille || 210),
  he: percentText(c.hePermille || 0),
  start: pressureText(c.startMbar, prefs),
  end: pressureText(c.endMbar, prefs),
  use: c.use || 'OC-gas',
});

/**
 * A cylinder that is not in the dive yet, as the core's new one: the base of the patch that adds it.
 * @param {string} use
 * @returns {import('benthic-core').Cylinder}
 */
export const blankCylinder = () => /** @type {any} */ ({ description: '', sizeMl: 0, workingPressureMbar: 0, startMbar: 0, endMbar: 0, o2Permille: 210, hePermille: 0, use: 'OC-gas', used: false, protected: false });

/**
 * The texts of an empty cylinder of a rebreather (the diluent or the oxygen that the dive lacks): oxygen starts at 100 %.
 * @param {'diluent'|'oxygen'} role @param {{ pressure: string }} prefs
 */
export const newPartDraft = (role, prefs) => ({ ...cylinderDraft(blankCylinder(), prefs), o2: role === 'oxygen' ? '100' : '21', use: role });

/**
 * Whether the typed percentages make a breathable mix: O₂ from 1 to 100 %, He from 0 to 99 %, together 100 % at most.
 * @param {{ o2: string, he: string }} draft
 * @param {boolean} [oxygenOnly] the oxygen cylinder of a rebreather: only O₂ is entered
 */
export function mixErrors(draft, oxygenOnly = false) {
  const o2 = parseTyped(draft.o2);
  const he = oxygenOnly ? 0 : parseTyped(draft.he);
  const o2Bad = !(o2 >= 1 && o2 <= 100);
  const heBad = !oxygenOnly && !(he >= 0 && he <= 99);
  const sumBad = !o2Bad && !heBad && o2 + he > 100;
  return { o2: o2Bad || sumBad, he: heBad || sumBad };
}

/**
 * The name of the typed mix (« Air », « EAN32 », « Trimix 18/45 »); empty while the entry is not a valid mix.
 * @param {{ o2: string, he: string }} draft
 * @param {{ air: string, oxygen: string, nitrox: string, trimix: string }} words
 * @param {boolean} [oxygenOnly]
 */
export function mixHelper(draft, words, oxygenOnly = false) {
  const errors = mixErrors(draft, oxygenOnly);
  if (errors.o2 || errors.he) return '';
  return gasName(Math.round(parseTyped(draft.o2) * 10), oxygenOnly ? 0 : Math.round(parseTyped(draft.he) * 10), words);
}

/**
 * Which entries are not valid. Pressures are only entered for a dive logged by hand: a computer's are read-only.
 * @param {CylinderDraft} draft @param {{ pressure: string }} prefs @param {{ manual: boolean, oxygenOnly?: boolean }} options
 */
export function draftErrors(draft, prefs, options) {
  const mix = mixErrors(draft, options.oxygenOnly);
  const pressure = (/** @type {string} */ text) => !!options.manual && text.trim() !== '' && Number.isNaN(pressureMbarOf(text, prefs));
  return { o2: mix.o2, he: mix.he, start: pressure(draft.start), end: pressure(draft.end) };
}

/** @param {ReturnType<typeof draftErrors>} errors */
export const hasErrors = (errors) => errors.o2 || errors.he || errors.start || errors.end;

/**
 * What changed in a cylinder, as the patch `cylinderChanges` takes; `{}` when nothing did. A new cylinder type brings its
 * size and working pressure; the mix is always sent whole (both parts); the pressures only for a dive logged by hand.
 * @param {import('benthic-core').Cylinder} c the cylinder as it is
 * @param {CylinderDraft} draft
 * @param {{ name: string, ml: number, workingPressureMbar: number }[]} types the diver's cylinder types
 * @param {{ pressure: string }} prefs
 * @param {{ manual: boolean, oxygenOnly?: boolean }} options
 * @returns {Record<string, string|number>}
 */
export function draftPatch(c, draft, types, prefs, options) {
  /** @type {Record<string, string|number>} */
  const patch = {};
  const before = cylinderDraft(c, prefs);
  if (draft.description !== before.description) {
    const type = types.find((x) => x.name === draft.description);
    Object.assign(patch, type ? { description: draft.description, sizeMl: type.ml, workingPressureMbar: type.workingPressureMbar } : { description: draft.description });
  }
  if (draft.o2 !== before.o2 || (!options.oxygenOnly && draft.he !== before.he)) {
    patch.o2Permille = Math.round(parseTyped(draft.o2) * 10);
    patch.hePermille = options.oxygenOnly ? (c.hePermille || 0) : Math.round(parseTyped(draft.he) * 10);
  }
  if (options.manual) {
    for (const [field, key] of /** @type {const} */ ([['start', 'startMbar'], ['end', 'endMbar']])) {
      if (draft[field] !== before[field]) patch[key] = draft[field].trim() ? pressureMbarOf(draft[field], prefs) : 0;
    }
  }
  if (draft.use !== before.use) patch.use = draft.use || 'OC-gas';
  return patch;
}
