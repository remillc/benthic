// @ts-check
// The alpha first launch on Android (phones: tasks 2026-11-16-233 to 236; tablets: tasks 237 and 239): which
// screens use the new style, the three steps of the download after signing in, and the snackbar that follows
// each path. iOS keeps the screens it had.

/**
 * The new first-launch style: the Android look, on a phone (below 768 dp: a blue band) and on a tablet (a
 * blue panel beside or above the step). The wording is the device's (see `deviceKey`).
 * @param {{ phone: boolean, ios: boolean }} where
 */
export function newFirstLaunch({ ios }) {
  return !ios;
}

/**
 * The key of a text that names the device: « ce téléphone » on a phone, the `Tablet` variant (« cette
 * tablette ») on a tablet.
 * @param {string} key the phone's key
 * @param {boolean} phone
 */
export function deviceKey(key, phone) {
  return phone ? key : `${key}Tablet`;
}

/** The snackbar of each path, shown over the logbook that opens at the end. */
export const FIRST_LAUNCH_SNACKBARS = /** @type {const} */ ({
  /** Signed in: the logbook was downloaded. */
  downloaded: 'firstLaunch.snackbar.downloaded',
  /** Connected to the diver's own git repository: the logbook was downloaded from it (task 2026-11-16-247). */
  gitDownloaded: 'firstLaunch.snackbar.gitDownloaded',
  /** A new account: its empty logbook is ready. */
  created: 'firstLaunch.snackbar.created',
  /** Without an account: the logbook of this phone. */
  local: 'firstLaunch.snackbar.local',
});

/** The same snackbars on a tablet (« cette tablette »). */
export const FIRST_LAUNCH_SNACKBARS_TABLET = /** @type {const} */ ({
  downloaded: 'firstLaunch.snackbar.downloadedTablet',
  gitDownloaded: 'firstLaunch.snackbar.gitDownloadedTablet',
  created: 'firstLaunch.snackbar.created',
  local: 'firstLaunch.snackbar.localTablet',
});

/**
 * "Transfer from storage (30/80)": what the core has received so far, and what it will receive.
 * @param {string} message a message of the core's sync work
 * @returns {{ n: number, total: number }|null}
 */
export function transferCount(message) {
  if (!/^Transfer from storage/.test(message)) return null;
  const m = /\((\d+)\/(\d+)\)/.exec(message);
  if (!m || Number(m[2]) <= 0) return null;
  return { n: Math.min(Number(m[1]), Number(m[2])), total: Number(m[2]) };
}

/** @typedef {'done'|'running'|'waiting'} DownloadStepState */

/**
 * The three steps of the download (connection, the dives, the copy on the phone) from the sync progress
 * (lib/sync-progress.js: connect up to 15 %, receive 15 to 65 %, then the local copy is written and read).
 * @param {import('./sync-progress.js').SyncProgress|null} progress
 * @returns {{ connect: DownloadStepState, dives: DownloadStepState, copy: DownloadStepState, value: number }}
 *   value: 0 to 1, how far the dives are received
 */
export function downloadSteps(progress) {
  if (!progress || progress.stage === 'connect') {
    return { connect: progress && progress.fraction >= 0.15 ? 'done' : 'running', dives: progress && progress.fraction >= 0.15 ? 'running' : 'waiting', copy: 'waiting', value: 0 };
  }
  if (progress.stage === 'read') return { connect: 'done', dives: 'done', copy: 'running', value: 1 };
  const value = Math.min(1, Math.max(0, (progress.fraction - 0.15) / 0.5));
  return { connect: 'done', dives: 'running', copy: 'waiting', value };
}
