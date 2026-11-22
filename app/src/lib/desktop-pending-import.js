// @ts-check
// The dives the first launch of the desktop app parked before its window reloaded on the new logbook (see
// lib/desktop-first-launch.js): imported once that logbook is open, then « N plongées importées ».
import { importFile, importCsvFile } from './logbook.svelte.js';
import { importErrorKey } from './deep-link.js';
import { takePending, runPending } from './desktop-first-launch.js';
import { showSnackbar } from './snackbar.js';
import { t } from './i18n.js';

/** @returns {any} */
const bridge = () => /** @type {any} */ (globalThis).benthicDesktop;

/** Runs the parked import, if there is one. Safe to call again: the record is taken once. */
export async function resumePendingImport() {
  let pending = null;
  try {
    pending = takePending(sessionStorage);
  } catch {
    return;
  }
  if (!pending) return;
  try {
    const added = await runPending(pending, {
      // Read in pieces: a logbook can be bigger than one call may carry.
      read: async (path) => {
        const { size } = await bridge().fs.readChunk({ path, offset: 0, length: 0 });
        const out = new Uint8Array(size);
        for (let at = 0; at < size; ) {
          const { data } = await bridge().fs.readChunk({ path, offset: at, length: 3 * 1024 * 1024 });
          const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
          if (!bytes.length) throw new Error('SHORT_READ');
          out.set(bytes, at);
          at += bytes.length;
        }
        return out;
      },
      importFile,
      importCsv: importCsvFile,
      remove: (path) => bridge().fs.remove({ path }),
    });
    if (added) showSnackbar(t('logbook.imported', { n: added }));
  } catch (e) {
    const code = String(/** @type {any} */ (e)?.message ?? '');
    console.error('Importing into the new logbook', code);
    showSnackbar(t(importErrorKey(code)));
  }
}
