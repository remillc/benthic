// @ts-check
// A file another app shared while the first launch is on screen (no logbook yet): it waits here until
// components/FirstLaunchSteps.svelte takes it to « Importer un carnet » (lib/open-link.js puts it here).
// A shared logbook is a staged file in the app's cache (`staged`: only its path, never its contents); `file` is
// for a small file already in memory.

/** @type {{ file: File|null, staged: { path: string, size: number, name: string, summary: { sites: number, firstYear: number|null, lastYear: number|null }|null }|null }} */
export const sharedFile = $state({ file: null, staged: null });
