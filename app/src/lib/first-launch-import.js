// @ts-check
// The divelogs.de import of the release edition's first launch (task 2026-11-15-218), as two pure
// functions over the plugin's calls: the check of the credentials (the form's button), then the
// download and the read-only count (the progress screen). Nothing is added to a logbook here: the
// dives go into the new logbook once the diver has chosen where to keep it. The credentials are
// only passed to the calls and never kept.

/**
 * @typedef {{
 *   check: (o: { user: string, password: string }) => Promise<{ dives: number }>,
 *   download: (o: { user: string, password: string }) => Promise<{ dives: number, path: string }>,
 *   count: (o: { path: string }) => Promise<{ dives: number }>,
 *   discard: (o: { path: string }) => Promise<unknown>,
 * }} DivelogsCalls
 */

/**
 * « Importer »: divelogs.de checks the user name and the password.
 * @param {DivelogsCalls} calls
 * @param {{ user: string, password: string }} credentials
 * @returns {Promise<number>} the dives of the account
 * @throws {Error} the plugin's error (LOGIN_FAILED, NETWORK…)
 */
export async function checkDivelogs(calls, credentials) {
  return (await calls.check({ user: credentials.user.trim(), password: credentials.password })).dives;
}

/**
 * The progress screen: the download, then the read-only count. The core reports no progress inside the
 * download, so `report` gets the phase changes: `download` (done 0 of total), `read` (done = total).
 * @param {DivelogsCalls} calls
 * @param {{ user: string, password: string }} credentials
 * @param {number} total the dives of the account (from the check)
 * @param {(state: { phase: 'download'|'read', done: number, total: number }) => void} report
 * @param {() => boolean} cancelled true once « Annuler » was pressed
 * @returns {Promise<{ path: string, dives: number }|null>} null when cancelled (nothing is kept)
 * @throws {Error} `NO_DIVES` or the plugin's error; the downloaded file is discarded first
 */
export async function downloadDivelogs(calls, credentials, total, report, cancelled) {
  report({ phase: 'download', done: 0, total });
  const downloaded = await calls.download({ user: credentials.user.trim(), password: credentials.password });
  if (cancelled()) {
    if (downloaded.path) await calls.discard({ path: downloaded.path }).catch(() => {});
    return null;
  }
  report({ phase: 'read', done: downloaded.dives, total: downloaded.dives });
  let dives = 0;
  try {
    dives = downloaded.path ? (await calls.count({ path: downloaded.path })).dives : 0;
  } catch (e) {
    await calls.discard({ path: downloaded.path }).catch(() => {});
    throw e;
  }
  if (!dives) {
    if (downloaded.path) await calls.discard({ path: downloaded.path }).catch(() => {});
    throw new Error('NO_DIVES');
  }
  if (cancelled()) {
    await calls.discard({ path: downloaded.path }).catch(() => {});
    return null;
  }
  return { path: downloaded.path, dives };
}
