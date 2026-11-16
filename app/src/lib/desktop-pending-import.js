// @ts-check
// The dives the first launch of the desktop app parked before its window reloaded on the new logbook (see
// lib/desktop-first-launch.js): imported once that logbook is open, then « N plongées importées ».
import { importFile, importCsvFile } from './logbook.svelte.js';
import { importErrorKey } from './deep-link.js';
import { takePending, runPending } from './desktop-first-launch.js';
import { showSnackbar } from './snackbar.js';
import { t } from './i18n.js';

/** @returns {any} */
const bridge = () => /** @type {any} */ (globalThis).odDesktop;

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
      read: async (path) => Uint8Array.from(atob(await bridge().fs.readFile({ path })), (c) => c.charCodeAt(0)),
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
