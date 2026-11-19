// @ts-check
// The app's one import progress: the state read by components/ImportProgress.svelte (mounted once, in App.svelte, so
// that the line stays across the screens of a flow) and the controller the import code feeds (lib/import-progress.js).
import { createImportProgress, idleState } from './import-progress.js';

/** @type {import('./import-progress.js').ImportState} */
export const importState = $state(idleState());

export const importProgress = createImportProgress((s) => Object.assign(importState, s));
