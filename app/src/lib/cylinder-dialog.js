// @ts-check
// Pure logic of the cylinder dialogs of the dive detail's Gaz tab (task 2026-11-26-401; mock-ups
// detail-bouteille-android and detail-bouteilles-recycleur-android): what the fields start with, the mix name under
// O₂ and He, which entries are valid, and the patch a Save sends to cylinderChanges (lib/desktop-edit.js). The dialog
// (components/CylinderEditDialog.svelte) and tests/app/cylinder-dialog.test.mjs call it.

import { gasName, OTHER_TYPE } from './cylinder-card.js';
import { parseTyped, pressureMbarOf } from './desktop-edit.js';
import { pressureUsed } from './cylinder-card.js';

const MBAR_PER_PSI = 68.9476;

/**
 * @typedef {{ description: string, o2: string, he: string, start: string, end: string, use: string, depth: string, custom: boolean, size: string, workingPressure: string }} CylinderDraft
 * The texts of one cylinder's fields, as typed: percentages, pressures and the gas-change depth in the diver's units.
 * `custom`: the type is « Autre… » (a cylinder outside the table of types): `size` and `workingPressure` are typed too.
 */

const ML_PER_CUFT = 28316.8466;
const cuftOf = (/** @type {{ volume?: string }} */ prefs) => prefs.volume === 'cuft';

/** A size as typed back: litres of water, or in cubic feet the gas at the working pressure (Subsurface). @param {number} ml @param {number} wpMbar @param {{ volume?: string }} prefs */
export function sizeText(ml, wpMbar, prefs) {
  if (!(ml > 0)) return '';
  const v = cuftOf(prefs) ? (wpMbar ? (ml * (wpMbar / 1000 / 1.01325)) / ML_PER_CUFT : ml / ML_PER_CUFT) : ml / 1000;
  return String(Number(v.toFixed(1))).replace('.', ',');
}

/** A typed size in ml; 0 for none, NaN when it is not a size (up to 100 L, 400 cu ft). @param {string} text @param {number} wpMbar @param {{ volume?: string }} prefs */
export function sizeMlOf(text, wpMbar, prefs) {
  if (!text.trim()) return 0;
  const v = parseTyped(text);
  const cuft = cuftOf(prefs);
  if (!(v >= 0 && v <= (cuft ? 400 : 100))) return NaN;
  return Math.round(!cuft ? v * 1000 : wpMbar ? (v * ML_PER_CUFT) / (wpMbar / 1000 / 1.01325) : v * ML_PER_CUFT);
}

/**
 * A cylinder type chosen in the dialog, as the phone's editor did: « Autre… » drops the type's name and shows the size and the
 * working pressure (they keep their values); a type fills them. Mutates the draft.
 * @param {CylinderDraft} draft @param {string} name @param {{ name: string, ml: number, workingPressureMbar: number }[]} types @param {{ pressure: string, volume?: string }} prefs
 */
export function chooseType(draft, name, types, prefs) {
  if (name === OTHER_TYPE) {
    draft.custom = true;
    draft.description = '';
    return;
  }
  draft.custom = false;
  draft.description = name;
  const type = types.find((x) => x.name === name);
  if (!type) return;
  draft.workingPressure = pressureText(type.workingPressureMbar, prefs);
  draft.size = sizeText(type.ml, type.workingPressureMbar, prefs);
}

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
 * @param {import('benthic-core').Cylinder} c @param {{ pressure: string, length?: string, volume?: string }} prefs
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
  custom: !c.description && !!c.sizeMl,
  size: sizeText(c.sizeMl, c.workingPressureMbar, prefs),
  workingPressure: pressureText(c.workingPressureMbar, prefs),
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
 * Which entries are not valid. The pressures are entered on every dive (a computer's included).
 * @param {CylinderDraft} draft @param {{ pressure: string, volume?: string }} prefs @param {{ oxygenOnly?: boolean }} options
 */
export function draftErrors(draft, prefs, options) {
  const mix = mixErrors(draft, options.oxygenOnly);
  const pressure = (/** @type {string} */ text) => text.trim() !== '' && Number.isNaN(pressureMbarOf(text, prefs));
  // « Autre… »: the size and the working pressure are typed (the working pressure first: a size in cubic feet depends on it).
  const wp = draft.custom ? pressure(draft.workingPressure) : false;
  const wpMbar = draft.custom && !wp && draft.workingPressure.trim() ? pressureMbarOf(draft.workingPressure, prefs) : 0;
  const size = draft.custom && Number.isNaN(sizeMlOf(draft.size, wpMbar, prefs));
  return { o2: mix.o2, he: mix.he, start: pressure(draft.start), end: pressure(draft.end), depth: Number.isNaN(depthMmOf(draft.depth, prefs)), size, workingPressure: wp };
}

/** @param {ReturnType<typeof draftErrors>} errors */
export const hasErrors = (errors) => errors.o2 || errors.he || errors.start || errors.end || errors.depth || errors.size || errors.workingPressure;

/**
 * What changed in a cylinder, as the patch `cylinderChanges` takes; `{}` when nothing did. A new cylinder type brings its
 * size and working pressure; the mix is always sent whole (both parts); the pressures on every dive.
 * @param {import('benthic-core').Cylinder} c the cylinder as it is
 * @param {CylinderDraft} draft
 * @param {{ name: string, ml: number, workingPressureMbar: number }[]} types the diver's cylinder types
 * @param {{ pressure: string, length?: string, volume?: string }} prefs
 * @param {{ oxygenOnly?: boolean }} options
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
  for (const [field, key] of /** @type {const} */ ([['start', 'startMbar'], ['end', 'endMbar']])) {
    if (draft[field] !== before[field]) patch[key] = draft[field].trim() ? pressureMbarOf(draft[field], prefs) : 0;
  }
  // « Autre… »: the size and the working pressure go together (a size in cubic feet depends on the pressure).
  if (draft.custom && (draft.size !== before.size || draft.workingPressure !== before.workingPressure)) {
    const wp = draft.workingPressure.trim() ? pressureMbarOf(draft.workingPressure, prefs) : 0;
    patch.sizeMl = sizeMlOf(draft.size, wp, prefs);
    patch.workingPressureMbar = wp;
  }
  if (draft.use !== before.use) patch.use = draft.use || 'OC-gas';
  // The gas-change depth only applies to a cylinder breathed in open circuit: the dialog hides it for a rebreather's own.
  if (!options.oxygenOnly && draft.depth !== before.depth) patch.depthMm = depthMmOf(draft.depth, prefs) || 0;
  return patch;
}
