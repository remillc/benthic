// The one-off import of the alpha's logbook (decided on 18 November 2026). A diver who upgraded from the alpha keeps,
// on the device, the alpha's Subsurface-cloud logbook: the core's own copy of it, a git repository in
// `.subsurface/cloudstorage/<folder>`. The beta ignores that cloud account (lib/subsurface-cloud.js) and never reads
// the network for it, but it offers to copy the logbook ONCE into a new logbook on this device. The copy needs no
// account, no stored credential and no network: the plugin lists the folders (`alphaCacheList`) and the core reads the
// chosen one as a local git repository, read-only (`alphaCacheOpen`); its dives are exported by the core to a file of
// the app's cache (a staged file: only its path comes back, never the contents: a big logbook is about 100 MB), which
// the first launch then imports like any other file. Nothing here writes into the alpha's folder.
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
 * @typedef {{ id: string, branch: string, dives: number, bytes: number, modified: number }} AlphaLogbook
 * @typedef {{
 *   alphaCacheList: () => Promise<AlphaLogbook[]>,
 *   alphaCacheOpen: (options: { id: string }) => Promise<{ id: number }[]>,
 *   exportDives: (options: { ids: number[], format: 'ssrf', anonymize: boolean, name: string, stage: boolean }) => Promise<{ path?: string, size?: number }>,
 *   discardImport?: (options: { path: string }) => Promise<unknown>,
 * }} AlphaCore
 */

/**
 * The alpha's logbooks on this device, when there are some to offer: only in the release edition, only before the
 * import was done, one per cache folder that holds dives, the most recent first. Reads nothing from the network and
 * needs no account.
 * @param {AlphaCore} core
 * @param {{ getItem: (key: string) => string|null }} store
 * @param {boolean} release
 * @returns {Promise<AlphaLogbook[]>}
 */
export async function findAlphaLogbooks(core, store, release) {
  if (!release || alphaImportDone(store)) return [];
  try {
    const folders = await core.alphaCacheList();
    return folders.filter((f) => f.dives > 0).sort((a, b) => b.modified - a.modified);
  } catch (e) {
    console.error('Reading the previous version’s logbook', /** @type {any} */ (e)?.message);
    return [];
  }
}

/**
 * The alpha's dives as a Subsurface file in the app's cache, written by the core (core to core: the dives never pass
 * through the web layer as text): what the import of the first launch takes like a picked file.
 * @param {AlphaCore} core
 * @param {AlphaLogbook} found
 * @param {string} name the logbook's name; the file is named after it
 * @returns {Promise<{ path: string, name: string, size: number }>} the staged file
 */
export async function alphaLogbookFile(core, found, name) {
  const dives = await core.alphaCacheOpen({ id: found.id });
  if (!dives.length) throw new Error('NO_DIVES');
  const fileName = `${name}.ssrf`;
  const { path = '', size = 0 } = await core.exportDives({ ids: dives.map((d) => d.id), format: 'ssrf', anonymize: false, name: fileName, stage: true });
  if (!path || size <= 0) {
    if (path) await core.discardImport?.({ path }).catch(() => {});
    throw new Error('NO_DIVES');
  }
  return { path, name: fileName, size };
}
