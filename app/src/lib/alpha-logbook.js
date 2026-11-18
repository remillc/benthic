// @ts-check
// The one-off import of the alpha's logbook (decided on 18 November 2026). A diver who upgraded from the alpha keeps,
// on the device, the alpha's Subsurface-cloud logbook: the core's own copy of it, in the cache of the cloud account the
// alpha signed in to. The beta ignores that account (lib/subsurface-cloud.js) and never reads the network for it, but it
// offers to copy the logbook ONCE into a new logbook on this device. Nothing here writes to the alpha's files or to the
// cloud: the copy is read from the device (`listCloudDives({ cached: true })`, no network) and exported as a Subsurface
// file, which the first launch then imports like any other file.
import { isIgnoredCloudAccount } from './subsurface-cloud.js';

/** The device-store key that says the alpha's logbook was imported; the row of « Importer un carnet » is gone from then on. */
export const ALPHA_IMPORT_KEY = 'od.alphaImportDone';

/** @param {{ getItem: (key: string) => string|null }} store */
export function alphaImportDone(store) {
  try {
    return store.getItem(ALPHA_IMPORT_KEY) === '1';
  } catch {
    return false;
  }
}

/** @param {{ setItem: (key: string, value: string) => void }} store */
export function markAlphaImportDone(store) {
  try {
    store.setItem(ALPHA_IMPORT_KEY, '1');
  } catch {
    // Not fatal: the row may be offered again.
  }
}

/**
 * @typedef {{ dives: number, ids: number[] }} AlphaLogbook
 * @typedef {{
 *   configureCloud: () => Promise<{ available?: boolean, mode?: string }>,
 *   listCloudDives: (options: { cached: boolean }) => Promise<{ available?: boolean, dives?: { id: number }[] }>,
 *   exportDives: (options: { ids: number[], format: 'ssrf', anonymize: boolean, name: string, text: boolean }) => Promise<{ text?: string }>,
 * }} AlphaCore
 */

/**
 * The alpha's logbook on this device, when there is one to offer: only in the release edition, only before it was
 * imported, only with a Subsurface-cloud account left by the alpha and a device copy of its logbook that holds dives.
 * Reads nothing from the network.
 * @param {AlphaCore} core
 * @param {{ getItem: (key: string) => string|null }} store
 * @param {boolean} release
 * @returns {Promise<AlphaLogbook|null>}
 */
export async function findAlphaLogbook(core, store, release) {
  if (!release || alphaImportDone(store)) return null;
  try {
    const account = await core.configureCloud();
    if (!isIgnoredCloudAccount(account, release)) return null;
    const copy = await core.listCloudDives({ cached: true });
    const dives = copy.dives ?? [];
    return dives.length ? { dives: dives.length, ids: dives.map((d) => d.id) } : null;
  } catch (e) {
    console.error('Reading the previous version’s logbook', /** @type {any} */ (e)?.message);
    return null;
  }
}

/**
 * The alpha's dives as a Subsurface file, in memory: what the import of the first launch takes like a picked file.
 * @param {AlphaCore} core
 * @param {AlphaLogbook} found
 * @param {string} name the logbook's name; the file is named after it
 * @returns {Promise<{ file: File, text: string }>}
 */
export async function alphaLogbookFile(core, found, name) {
  const { text = '' } = await core.exportDives({ ids: found.ids, format: 'ssrf', anonymize: false, name: 'previous-version.ssrf', text: true });
  if (!text) throw new Error('NO_DIVES');
  return { file: new File([text], `${name}.ssrf`, { type: 'application/xml' }), text };
}
