// @ts-check
// The cylinder types offered for a default cylinder (Settings, Équipement): "Aucune", the types of the list (the logbook's
// and the diver's added ones), then, under the divider « Tailles courantes », a few common sizes from the core's default
// table in the unit system. A common size that is chosen becomes an added type (ensureCylinderType).
import { formatCylinderSize, formatPressure } from './format.js';
import { t } from './i18n.js';
import { choiceSizes } from './cylinder-type-files.js';
import { addCylinderType, readDefaultSizes, readTypeRows } from './cylinder-type-library.svelte.js';
import { typeKey } from './cylinder-type-files.js';

/** "11,1 L, 207 bar". @param {{ ml: number, mbar: number }} type @param {import('./format.js').Prefs} prefs */
const sizeText = (type, prefs) => [formatCylinderSize(type.ml, type.mbar, prefs), type.mbar ? formatPressure(type.mbar, prefs) : ''].filter(Boolean).join(', ');

/**
 * @param {import('./format.js').Prefs} prefs
 * @param {boolean} [withNone] false for a bailout cylinder or a piece of gear: no « Aucune », and no common sizes
 */
export async function cylinderChoices(prefs, withNone = true) {
  const rows = await readTypeRows();
  const known = new Set(rows.map((row) => typeKey(row.name)));
  // Only the default cylinders list the common sizes (a bailout cylinder or a piece of gear takes the types of the list).
  const sizes = withNone ? choiceSizes(await readDefaultSizes(), prefs.volume === 'cuft').filter((size) => !known.has(typeKey(size.name))) : [];
  return [
    ...(withNone ? [{ value: '', label: t('settings.defaultCylinder.none'), example: t('settings.defaultCylinder.noneText') }] : []),
    ...rows.map((type) => ({ value: type.name, label: type.name, example: sizeText(type, prefs) })),
    ...sizes.map((size, i) => ({
      value: size.name,
      label: size.name,
      example: sizeText(size, prefs),
      ...(i === 0 ? { heading: t('settings.cylinders.commonSizes') } : {}),
    })),
  ];
}

/**
 * Before a default cylinder is set to a common size: that size becomes a type of the diver's list, so that the dives it is
 * added to know its volume and pressure.
 * @param {string} name
 */
export async function ensureCylinderType(name) {
  if (!name) return;
  const rows = await readTypeRows();
  if (rows.some((row) => typeKey(row.name) === typeKey(name))) return;
  const size = (await readDefaultSizes()).find((d) => d.name === name);
  if (size) await addCylinderType({ name: size.name, ml: size.ml, mbar: size.mbar });
}
