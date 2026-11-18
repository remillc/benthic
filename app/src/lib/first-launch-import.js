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

/** How many dives one request of the resumable download asks for. */
export const DOWNLOAD_BATCH = 25;

/**
 * What a resumable divelogs.de download keeps between an interruption and « Reprendre ».
 * @typedef {{ pending: string[]|null, parts: string[], done: number, total: number }} DownloadProgress
 * `pending`: the ids of the dives not downloaded yet (null before the list was read); `parts`: the files kept.
 */

/** @returns {DownloadProgress} */
export function newDownloadProgress() {
  return { pending: null, parts: [], done: 0, total: 0 };
}

/**
 * Whether the plugin can download by ids (`divelogsList` and `divelogsDownload` with `ids`): without it the
 * download is one request and a lost connection keeps nothing. The current plugin has neither (core-api.js).
 * @param {any} calls
 */
export function canResume(calls) {
  return typeof calls.list === 'function' && typeof calls.downloadIds === 'function';
}

/**
 * The resumable download: the list of the account's dives, then batches of `DOWNLOAD_BATCH` ids, each one
 * kept as a file as soon as it arrives. An error leaves `progress` as it is (the batches received stay in
 * `parts`, the others in `pending`): calling it again with the same `progress` downloads only what is missing.
 * @param {{
 *   list: (o: { user: string, password: string }) => Promise<{ ids: string[] }>,
 *   downloadIds: (o: { user: string, password: string, ids: string[] }) => Promise<{ dives: number, path: string }>,
 *   count: (o: { path: string }) => Promise<{ dives: number }>,
 *   discard: (o: { path: string }) => Promise<unknown>,
 * }} calls
 * @param {{ user: string, password: string }} credentials
 * @param {DownloadProgress} progress changed in place
 * @param {(state: { phase: 'download'|'read', done: number, total: number }) => void} report
 * @param {() => boolean} cancelled
 * @returns {Promise<{ path: string, paths: string[], dives: number }|null>} null when cancelled (the parts are discarded)
 * @throws {Error} the plugin's error, with `progress` kept (`NO_DIVES`: the parts are discarded)
 */
export async function downloadDivelogsResumable(calls, credentials, progress, report, cancelled) {
  const auth = { user: credentials.user.trim(), password: credentials.password };
  if (!progress.pending) {
    const listed = (await calls.list(auth)).ids;
    progress.pending = [...listed];
    progress.total = listed.length;
    progress.done = 0;
  }
  report({ phase: 'download', done: progress.done, total: progress.total });
  while (progress.pending.length) {
    if (cancelled()) return discardParts(calls, progress);
    const ids = progress.pending.slice(0, DOWNLOAD_BATCH);
    const part = await calls.downloadIds({ ...auth, ids });
    if (part.path) progress.parts.push(part.path);
    progress.pending = progress.pending.slice(ids.length);
    progress.done += ids.length;
    report({ phase: 'download', done: progress.done, total: progress.total });
  }
  if (cancelled()) return discardParts(calls, progress);
  report({ phase: 'read', done: progress.total, total: progress.total });
  let dives = 0;
  try {
    for (const path of progress.parts) dives += (await calls.count({ path })).dives;
  } catch (e) {
    await discardParts(calls, progress);
    throw e;
  }
  if (!dives) {
    await discardParts(calls, progress);
    throw new Error('NO_DIVES');
  }
  return { path: progress.parts[0], paths: [...progress.parts], dives };
}

/**
 * @param {{ discard: (o: { path: string }) => Promise<unknown> }} calls
 * @param {DownloadProgress} progress
 * @returns {Promise<null>}
 */
export async function discardParts(calls, progress) {
  for (const path of progress.parts) await calls.discard({ path }).catch(() => {});
  progress.parts = [];
  progress.pending = null;
  progress.done = 0;
  progress.total = 0;
  return null;
}

/**
 * The plugin's error as the progress screen takes it: a lost connection after part of the dives came in is an
 * interruption (« Reprendre »); anything else, or a loss before the first dive, goes back to the form.
 * @param {string} code
 * @param {number} done the dives already downloaded
 * @returns {'interrupted'|'form'}
 */
export function failureKind(code, done) {
  return (code === 'NETWORK' || code === 'NETWORK_LOST') && done > 0 ? 'interrupted' : 'form';
}
