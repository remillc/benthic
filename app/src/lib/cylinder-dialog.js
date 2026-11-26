// @ts-check
// Pure logic of the cylinder dialogs of the dive detail's Gaz tab (task 2026-11-26-401; mock-ups
// detail-bouteille-android and detail-bouteilles-recycleur-android): what the fields start with, the mix name under
// O₂ and He, which entries are valid, and the patch a Save sends to cylinderChanges (lib/desktop-edit.js). The dialog
// (components/CylinderEditDialog.svelte) and tests/app/cylinder-dialog.test.mjs call it.

import { gasName } from './cylinder-card.js';
import { parseTyped, pressureMbarOf } from './desktop-edit.js';
import { pressureUsed } from './cylinder-card.js';

const MBAR_PER_PSI = 68.9476;

/**
 * @typedef {{ description: string, o2: string, he: string, start: string, end: string, use: string, depth: string }} CylinderDraft
 * The texts of one cylinder's fields, as typed: percentages, pressures and the gas-change depth in the diver's units.
 */

const MM_PER_FOOT = 304.8;
const feetOf = (/** @type {{ length: string }} */ prefs) => prefs.length === 'ft';

/** The gas-change depth as typed back, in the diver's unit; empty when there is none. @param {number} mm @param {{ length: string }} prefs */
export const depthText = (mm, prefs) => (mm > 0 ? String(feetOf(prefs) ? Math.round(mm / MM_PER_FOOT) : Number((mm / 1000).toFixed(1))).replace('.', ',') : '');

/** A typed depth in mm; 0 for none, NaN when it is not a depth (0 to 500 m, 1 640 ft). @param {string} text @param {{ length: string }} prefs */
export function depthMmOf(text, prefs) {
  if (!text.trim()) return 0;
  const v = parseTyped(text);
  if (!(v >= 0 && v <= (feetOf(prefs) ? 1640 : 500))) return NaN;
  return Math.round(v * (feetOf(prefs) ? MM_PER_FOOT : 1000));
}

/**
 * The maximum operating depth of a mix at a ppO₂ of 1.6 bar, in mm, in the dive's water; 0 when the mix is not valid.
 * @param {number} o2Percent @param {number} surfaceMbar @param {number} salinity the water's density in g per 10 000 L (1 030 kg/m³ = 10 300)
 */
export function modMm(o2Percent, surfaceMbar, salinity) {
  if (!(o2Percent > 0)) return 0;
  const surface = (surfaceMbar || 1013) / 1000;
  const mm = ((1.6 / (o2Percent / 100) - surface) * 1e8) / (((salinity || 10300) / 10) * 9.80665);
  return mm > 0 ? Math.round(mm) : 0;
}

/**
 * What sits under Début and Fin: the pressure used, or that the cylinder was not breathed when both are given and equal.
 * @param {{ start: string, end: string }} draft @param {{ pressure: string }} prefs
 * @returns {{ kind: 'used', mbar: number }|{ kind: 'unused' }|null}
 */
export function consumption(draft, prefs) {
  const start = draft.start.trim() ? pressureMbarOf(draft.start, prefs) : 0;
  const end = draft.end.trim() ? pressureMbarOf(draft.end, prefs) : 0;
  if (!(start > 0 && end > 0)) return null;
  const used = pressureUsed(start, end);
  if (used > 0) return { kind: 'used', mbar: used };
  return Math.abs(start - end) < 1 ? { kind: 'unused' } : null;
}

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
  depth: depthText(c.depthMm || 0, prefs),
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
  return { o2: mix.o2, he: mix.he, start: pressure(draft.start), end: pressure(draft.end), depth: Number.isNaN(depthMmOf(draft.depth, prefs)) };
}

/** @param {ReturnType<typeof draftErrors>} errors */
export const hasErrors = (errors) => errors.o2 || errors.he || errors.start || errors.end || errors.depth;

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
  // The gas-change depth only applies to a cylinder breathed in open circuit: the dialog hides it for a rebreather's own.
  if (!options.oxygenOnly && draft.depth !== before.depth) patch.depthMm = depthMmOf(draft.depth, prefs) || 0;
  return patch;
}
