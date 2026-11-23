// @ts-check
// The dives the first launch of the desktop app parked before its window reloaded on the new logbook (see
// lib/desktop-first-launch.js): imported once that logbook is open, then « N plongées importées ».
import { importFile, importCsvFile, importData } from './logbook.svelte.js';
import { runBenthicImport } from './benthic-import.svelte.js';
import { inspectBenthic } from './benthic-import.js';
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
  if (pending.benthic) return resumeBenthicImport(pending);
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

/**
 * A parked .benthic file (task 2026-11-23-360): the archive is read where it was staged, in pieces (it can be gigabytes), and
 * imported into the new logbook with the same engine as everywhere: verified first, nothing written unless it all succeeds.
 * @param {import('./desktop-first-launch.js').PendingImport} pending
 */
async function resumeBenthicImport(pending) {
  const file = pending.files[0];
  try {
    const { size } = await bridge().fs.readChunk({ path: file.path, offset: 0, length: 0 });
    /** @type {import('./zip-read.js').ByteSource} */
    const source = {
      size,
      async read(offset, length) {
        // The bridge answers at most 4 MB a call.
        const want = Math.max(0, Math.min(length, size - offset));
        const out = new Uint8Array(want);
        for (let at = 0; at < want; ) {
          const { data } = await bridge().fs.readChunk({ path: file.path, offset: offset + at, length: Math.min(4 * 1024 * 1024, want - at) });
          const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
          if (!bytes.length) throw new Error('SHORT_READ');
          out.set(bytes, at);
          at += bytes.length;
        }
        return out;
      },
    };
    const inspection = await inspectBenthic(source);
    const result = await runBenthicImport(inspection, {
      fileName: file.name,
      overlay: true,
      applyLogbook: (logbook) => (logbook ? importData('logbook.ssrf', { path: logbook.path }) : Promise.resolve(0)),
    });
    showSnackbar(t(result.dives ? 'logbook.imported' : 'benthicImport.doneNoDives', { n: result.dives, name: file.name.replace(/.[^.]*$/, '') }));
  } catch (e) {
    const code = String(/** @type {any} */ (e)?.code ?? /** @type {any} */ (e)?.message ?? '');
    console.error('Importing the .benthic file into the new logbook', code);
    showSnackbar(t(code === 'INCOMPLETE' ? 'benthicImport.incompleteTitle' : code === 'CANCELLED' ? 'benthicImport.cancelled' : 'benthicImport.failed'));
  } finally {
    await bridge().fs.remove({ path: file.path }).catch(() => {});
  }
}
