// @ts-check
// The texts of the `.benthic` import that depend on what the file holds (task 2026-11-23-360): the rows of « Ce que le
// fichier contient », the size, the list of the replace dialog. Pure functions over the counts read from the manifest
// (lib/benthic-import.js) and a `t` function, so that node:test checks them.
import { sizeParts } from './import-progress.js';

/** @typedef {(key: string, params?: Record<string, string|number>) => string} T */

/**
 * « 1,2 Go », « 340 Mo », « 12 Ko ».
 * @param {number} bytes @param {T} t @param {(n: number) => string} [format] the number as the language writes it
 */
export function sizeText(bytes, t, format = (n) => String(n)) {
  const { n, unit } = sizeParts(bytes);
  return t(`benthicImport.size.${unit}`, { n: format(n) });
}

/**
 * The rows of « Ce que le fichier contient », only the parts the file has.
 * @param {import('./benthic-import.js').Counts} counts
 * @param {T} t
 * @param {(n: number) => string} [format]
 * @returns {{ key: 'dives'|'equipment'|'profile'|'media', title: string, value: string }[]}
 */
export function contentsRows(counts, t, format = (n) => String(n)) {
  /** @type {{ key: 'dives'|'equipment'|'profile'|'media', title: string, value: string }[]} */
  const rows = [];
  if (counts.dives > 0) {
    rows.push({ key: 'dives', title: t('benthicImport.rowDives'), value: counts.sites ? `${format(counts.dives)} · ${format(counts.sites)}` : format(counts.dives) });
  }
  if (counts.gear || counts.kits || counts.maintenance) {
    const parts = [counts.gear ? t('benthicImport.pieces', { n: counts.gear }) : '', counts.kits ? t('benthicImport.kits', { n: counts.kits }) : ''].filter(Boolean);
    rows.push({ key: 'equipment', title: t('benthicImport.rowEquipment'), value: parts.join(' · ') });
  }
  if (counts.profile || counts.certifications || counts.documents) {
    const parts = [counts.certifications ? t('benthicImport.certs', { n: counts.certifications }) : '', counts.documents ? t('benthicImport.documents', { n: counts.documents }) : ''].filter(Boolean);
    rows.push({ key: 'profile', title: t('benthicImport.rowProfile'), value: parts.length ? parts.join(' · ') : t('benthicImport.profileOnly') });
  }
  if (counts.media > 0) rows.push({ key: 'media', title: t('benthicImport.rowMedia'), value: sizeText(counts.mediaBytes, t, format) });
  return rows;
}

/**
 * « 312 plongées, l’équipement, le profil, les brevets et 1,2 Go de photos et vidéos » (the replace dialog).
 * @param {import('./benthic-import.js').Counts} counts
 * @param {T} t
 * @param {(n: number) => string} [format]
 */
export function replaceContents(counts, t, format = (n) => String(n)) {
  /** @type {string[]} */
  const parts = [];
  if (counts.dives > 0) parts.push(t('welcomeSteps.summaryDives', { n: counts.dives }));
  if (counts.gear || counts.kits || counts.maintenance) parts.push(t('benthicImport.replace.equipment'));
  if (counts.profile) parts.push(t('benthicImport.replace.profile'));
  if (counts.certifications) parts.push(t('benthicImport.replace.certs'));
  if (counts.documents) parts.push(t('benthicImport.replace.documents'));
  if (counts.media > 0) parts.push(t('benthicImport.replace.media', { size: sizeText(counts.mediaBytes, t, format) }));
  if (parts.length < 2) return parts.join('');
  return `${parts.slice(0, -1).join(', ')}${t('benthicImport.replace.and')}${parts[parts.length - 1]}`;
}

/** The export's day, « 2026-11-20 », from the manifest's instant. @param {string} exportedAt */
export const exportDay = (exportedAt) => String(exportedAt).slice(0, 10);

/**
 * The steps of the progress list and where each stands, from the phase the engine is in.
 * @param {'verify'|'logbook'|'data'|'media'|'write'} phase
 * @param {{ media: boolean, dives: boolean }} has the parts the file has (a part it lacks is not listed)
 * @returns {{ key: 'verify'|'logbook'|'data'|'media', state: 'done'|'current'|'waiting' }[]}
 */
export function progressSteps(phase, has) {
  const order = /** @type {const} */ (['verify', 'logbook', 'data', 'media', 'write']);
  const at = order.indexOf(phase);
  const keys = /** @type {('verify'|'logbook'|'data'|'media')[]} */ (['verify', ...(has.dives ? ['logbook'] : []), 'data', ...(has.media ? ['media'] : [])]);
  return keys.map((key) => {
    const index = order.indexOf(key);
    return { key, state: index < at ? 'done' : index === at ? 'current' : 'waiting' };
  });
}
