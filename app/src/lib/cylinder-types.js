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
