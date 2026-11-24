// @ts-check
// The `.benthic` import on screen (task 2026-11-23-360): the file picked and read (`openBenthicFile`), and the run with its
// progress state (`runBenthicImport`), shared by the first launch (an inline step) and the replace flow (an overlay mounted in
// App.svelte). The engine is lib/benthic-import.js; this file gives it the app's services and turns its progress into the
// steps of the screen. Nothing here changes data: the engine writes only when every step succeeded.
import { BenthicCore } from 'benthic-core';
import { services } from './profile.svelte.js';
import { loadProfile } from './profile.svelte.js';
import { loadInventory } from './inventory.svelte.js';
import { signalAccountData } from './account-sync-signal.js';
import { BenthicImportError, importBenthic, inspectBenthic, isBenthicName } from './benthic-import.js';
import { blobSource } from './zip-read.js';

export { isBenthicName };

/**
 * What the screens read. `phase` is the engine's; `active` while a run goes on.
 */
export const benthicRun = $state({
  active: false,
  /** Shown over the app (the replace flow); the first launch draws the same card inline. */
  overlay: false,
  fileName: '',
  exportedAt: '',
  /** @type {import('./benthic-import.js').Counts|null} */
  counts: null,
  /** @type {'verify'|'logbook'|'data'|'media'|'write'} */
  phase: 'verify',
  verifyFiles: 0,
  verifyTotal: 0,
  verified: false,
  /** The share of the current phase, 0..1. */
  fraction: 0,
  done: 0,
  total: 0,
  cancelling: false,
});

/** The run's abort controller. @type {AbortController|null} */
let controller = null;

/** « Annuler »: stops before anything is written (the engine ends with CANCELLED and nothing changed). */
export function cancelBenthicRun() {
  if (!benthicRun.active || benthicRun.phase === 'write') return;
  benthicRun.cancelling = true;
  controller?.abort();
}

/**
 * A `.benthic` file the diver picked, read for « Nouveau carnet » or the replace dialog: its end and its manifest, nothing
 * more (fast, whatever the size).
 * @param {File} file
 * @returns {Promise<import('./benthic-import.js').Inspection>}
 * @throws {BenthicImportError}
 */
export function openBenthicFile(file) {
  return inspectBenthic(blobSource(file));
}

/**
 * The same for a `.benthic` file already in the app's cache (opened from another app): read through the plugin, in pieces.
 * @param {import('./zip-read.js').ByteSource} source
 * @returns {Promise<import('./benthic-import.js').Inspection>}
 * @throws {BenthicImportError}
 */
export function openBenthicSource(source) {
  return inspectBenthic(source);
}

/**
 * The media hook of the device: the plugin's media folder (`mediaAdopt`, the dive media sync). `put` stages each original in the
 * cache in pieces, `finish` adopts them into the media folder under the hash of their content, `discard` deletes what was
 * staged. A plugin without `mediaAdopt` gives none: the originals are then verified and counted and not kept. The file carries
 * the originals only, not the dives' reference files (the export does not write them), so an adopted original is not attached
 * to a dive.
 * @returns {import('./benthic-import.js').MediaDeps|undefined}
 */
function deviceMedia() {
  const core = /** @type {any} */ (BenthicCore);
  if (typeof core.mediaAdopt !== 'function') return undefined;
  /** @type {string[]} */
  const staged = [];
  return {
    async put(name, chunks) {
      const { toBase64 } = await import('./zip-fit.js');
      let path = '';
      for await (const chunk of chunks) {
        const data = toBase64(chunk);
        ({ path } = path ? await core.stageImport({ path, data, append: true }) : await core.stageImport({ name, data }));
      }
      if (path) staged.push(path);
      return { undo: async () => {} };
    },
    async finish() {
      for (const path of staged.splice(0)) await core.mediaAdopt({ path });
    },
    async discard() {
      for (const path of staged.splice(0)) await core.discardImport({ path }).catch(() => {});
    },
  };
}

/**
 * Runs the import with the app's services and the screen's state.
 * @param {import('./benthic-import.js').Inspection} inspection
 * @param {{
 *   fileName: string,
 *   overlay?: boolean,
 *   applyLogbook: (logbook: { path: string, dives: number }|null) => Promise<unknown>,
 * }} options `applyLogbook` is the existing path that makes the logbook (the new device logbook, or `replaceDeviceLogbook`)
 * @returns {Promise<{ dives: number, files: number, skipped: number }>}
 * @throws {BenthicImportError} INCOMPLETE, CANCELLED, BAD_LOGBOOK, TOO_NEW, FAILED: nothing was changed
 */
export async function runBenthicImport(inspection, { fileName, overlay = false, applyLogbook }) {
  if (benthicRun.active) throw new BenthicImportError('FAILED');
  controller = new AbortController();
  Object.assign(benthicRun, {
    active: true,
    overlay,
    fileName,
    exportedAt: inspection.exportedAt,
    counts: inspection.counts,
    phase: 'verify',
    verifyFiles: 0,
    verifyTotal: inspection.files.length,
    verified: false,
    fraction: 0,
    done: 0,
    total: 0,
    cancelling: false,
  });
  const { store, box } = services();
  try {
    const result = await importBenthic(
      inspection,
      { core: BenthicCore, store, box, applyLogbook, media: deviceMedia() },
      {
        signal: controller.signal,
        onProgress: (p) => {
          if (p.phase !== benthicRun.phase) {
            if (benthicRun.phase === 'verify') benthicRun.verified = true;
            benthicRun.phase = p.phase;
          }
          benthicRun.done = p.done;
          benthicRun.total = p.total;
          benthicRun.fraction = p.total > 0 ? Math.min(1, p.done / p.total) : 0;
          if (p.phase === 'verify') benthicRun.verifyFiles = p.files;
        },
      },
    );
    benthicRun.verified = true;
    // The screens that read the store show what came in.
    await Promise.all([loadInventory(), loadProfile()]).catch(() => {});
    signalAccountData('edit');
    return result;
  } finally {
    benthicRun.active = false;
    benthicRun.overlay = false;
    benthicRun.cancelling = false;
    controller = null;
  }
}
