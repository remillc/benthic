// @ts-check
// An upload to the OpenDives server left unfinished (the app was closed, or the connection dropped and the diver chose
// « Plus tard ») is offered again when the app starts (task 2026-11-17-266): the first launch opens over the logbook on
// « Envoi interrompu », or straight on the upload when the desktop window has just reloaded on the logbook it made.
import { OpenDivesCore } from 'opendives-core';
import { deviceStore } from './device-store.js';
import { flow } from './first-launch.svelte.js';
import { logbook } from './logbook.svelte.js';
import { pendingUpload } from './server-upload.js';

let checked = false;

/**
 * The upload to this repository left unfinished on this device, if any (only ids and a name: no secret).
 * @param {string} repositoryUrl
 */
export function unfinishedUpload(repositoryUrl) {
  return pendingUpload(deviceStore, repositoryUrl);
}

/**
 * What to show for a state left by an earlier run.
 * @param {import('./server-upload.js').UploadState & { fresh?: boolean }|null} state
 * @returns {'createSend'|'createInterrupted'|null}
 */
export function resumeStep(state) {
  if (!state) return null;
  return state.fresh ? 'createSend' : 'createInterrupted';
}

/** Once per start, in the release edition: opens the screen of the unfinished upload, if there is one. */
export async function resumeServerUpload() {
  if (checked) return;
  checked = true;
  try {
    const info = await OpenDivesCore.serverSessionInfo();
    if (!info.signedIn) return;
    const state = /** @type {any} */ (pendingUpload(deviceStore, info.repositoryUrl));
    const step = resumeStep(state);
    if (!step) return;
    Object.assign(flow.create, { name: state.name, total: state.total, done: 0, source: 'device', deviceReady: true, file: null });
    flow.stack = ['start', step];
    logbook.welcomeHold = true;
  } catch {
    // Not signed in, or no secure storage: nothing to resume.
  }
}
