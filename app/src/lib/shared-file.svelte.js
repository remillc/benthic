// @ts-check
// A file another app shared while the first launch is on screen (no logbook yet): it waits here until
// components/FirstLaunchSteps.svelte takes it to « Importer un carnet » (lib/open-link.js puts it here).
// A shared logbook is a staged file in the app's cache (`staged`: only its path, never its contents); `file` is
// for a small file already in memory.

/** @type {{ file: File|null, staged: { path: string, size: number, name: string, summary: { sites: number, firstYear: number|null, lastYear: number|null }|null }|null, benthic: SharedBenthic|null }} */
export const sharedFile = $state({ file: null, staged: null, benthic: null });
// `benthic`: a .benthic file (the full export) shared with the app, read in the cache: its name, its staged path and its inspection.
/** @typedef {{ path: string, size: number, name: string, inspection: import('./benthic-import.js').Inspection }} SharedBenthic */
