// @ts-check
// A file another app shared while the first launch is on screen (no logbook yet): it waits here until
// components/FirstLaunchSteps.svelte takes it to « Importer un carnet » (lib/open-link.js puts it here).

/** @type {{ file: File|null }} */
export const sharedFile = $state({ file: null });
