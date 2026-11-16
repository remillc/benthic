// @ts-check
// The alpha first launch in the desktop app (task 2026-11-16-242; mock-ups docs/mockups/
// bureau-premier-lancement-alpha-*.dc.html). The screens are the tablet's (pages/WelcomeStart.svelte and the step
// pages, with the « cet ordinateur » texts); this file holds what only the desktop adds, kept apart so that
// node:test can run it: what a drop on the first-launch window carries, and what is done with it.
//
// How the desktop knows it is the first launch: nothing new. The first window of a fresh start opens the
// logbook of this computer (desktop/windows.cjs, `openMain`), and its « od.welcome » state is absent
// (lib/logbook.svelte.js, `startApp`), so first launch (the route /welcome) opens, exactly as on the other
// platforms. A window without a logbook (« Fermer le carnet », a new window, « Choisir à chaque fois ») is
// another screen (components/DesktopLogbookStart.svelte): it comes after first use.

/**
 * The files a drop carries, when the drop is one the first launch takes: files, and not text or a link.
 * @param {{ types?: ArrayLike<string>|readonly string[], files?: ArrayLike<File> }|null|undefined} transfer
 * @returns {File[]}
 */
export function droppedFiles(transfer) {
  if (!transfer || !Array.from(transfer.types ?? []).includes('Files')) return [];
  return Array.from(transfer.files ?? []);
}

/**
 * A file dropped on the first-launch window: the logbook of this computer is started (the choice « Commencer sans
 * compte »), then the dives of the file are imported into it, as « Importer un fichier » does. The files are
 * imported one after the other; the result is what was added and the first error, if any.
 * @param {File[]} files
 * @param {{ start: () => Promise<unknown>, importFile: (file: File) => Promise<number> }} deps
 * @returns {Promise<{ added: number, error: string }>} `error`: the core's code of the first failure, or ''
 */
export async function startWithDrop(files, deps) {
  await deps.start();
  let added = 0;
  let error = '';
  for (const file of files) {
    try {
      added += await deps.importFile(file);
    } catch (e) {
      if (!error) error = String(/** @type {any} */ (e)?.message ?? '');
    }
  }
  return { added, error };
}
