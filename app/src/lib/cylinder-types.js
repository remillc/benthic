// @ts-check
// Cylinder types shared by the screens.
import { t } from './i18n.js';

/**
 * What Subsurface itself calls a cylinder whose type is not known (it writes this description for the
 * default cylinder of a dive without one). OpenDives keeps a cylinder under this name when the type it
 * had is deleted and the dive depends on the cylinder (core/libopendives/edit.cpp).
 */
export const UNKNOWN_CYLINDER_TYPE = 'unknown';

/**
 * The name of a cylinder type as shown: the type a cylinder keeps when its own was deleted reads « Type inconnu ».
 * @param {string} name
 */
export function cylinderTypeLabel(name) {
  return name === UNKNOWN_CYLINDER_TYPE ? t('settings.cylinders.unknown') : name;
}

/**
 * One of the diver's own types, which « Supprimer ce type » can delete: not a standard one, and not the
 * "unknown" type a cylinder keeps.
 * @param {{ name: string, standard: boolean }} type
 */
export const deletable = (type) => !type.standard && type.name !== UNKNOWN_CYLINDER_TYPE;

/**
 * The sentences about what deleting a type does to the dives: how many lose the cylinder, how many keep
 * it, without a type. Shown under « Supprimer ce type » and at the start of the confirmation.
 * @param {{ removed: number, kept: number }} counts
 * @returns {string[]}
 */
export function deletionSentences(counts) {
  return [
    counts.removed ? t('settings.cylinders.deleteRemoved', { n: counts.removed }) : '',
    counts.kept ? t('settings.cylinders.deleteKept', { n: counts.kept }) : '',
  ].filter(Boolean);
}

const PSI_MBAR = 68.947572932;
const CUFT_ML = 28316.8466;

/** A number typed with a comma or a point; NaN when invalid, 0 when empty. @param {string} text */
export const parseSizeNumber = (text) => (text.trim() === '' ? 0 : Number(text.trim().replace(',', '.')));

/**
 * The volume and pressure fields of a type, in the units of the settings: litres and bar, or (in
 * cubic feet) the gas volume at working pressure, as Subsurface shows it, and psi.
 * @param {{ ml: number, mbar: number }} type
 * @param {{ cuft: boolean, psi: boolean }} units
 * @param {(value: number, decimals: number) => string} format
 * @returns {{ volume: string, pressure: string }}
 */
export function sizeFields(type, { cuft, psi }, format) {
  return {
    pressure: type.mbar ? format(psi ? type.mbar / PSI_MBAR : type.mbar / 1000, 0) : '',
    volume: type.ml ? format(cuft ? (type.ml / CUFT_ML) * (type.mbar / 1013.25) : type.ml / 1000, cuft ? 0 : 1) : '',
  };
}

/**
 * The size typed, in ml and mbar; the field that is wrong when invalid.
 * @param {string} volume
 * @param {string} pressure
 * @param {{ cuft: boolean, psi: boolean }} units
 * @returns {{ ml: number, mbar: number }|{ invalid: 'volume'|'pressure' }}
 */
export function typedSize(volume, pressure, { cuft, psi }) {
  const p = parseSizeNumber(pressure);
  const v = parseSizeNumber(volume);
  if (Number.isNaN(p) || p < 0) return { invalid: 'pressure' };
  const mbar = Math.round(psi ? p * PSI_MBAR : p * 1000);
  if (Number.isNaN(v) || v <= 0 || (cuft && !mbar)) return { invalid: 'volume' };
  return { ml: Math.round(cuft ? (v * CUFT_ML) / (mbar / 1013.25) : v * 1000), mbar };
}
