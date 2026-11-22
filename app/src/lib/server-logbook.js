// @ts-check
// The logbook kept on the OpenDives server (release edition; docs/architecture.md, section 11.3): the dives are in
// Subsurface's git format on branch `main` of the diver's repository, read and written by the core's git code exactly
// like a personal git repository (« Utiliser mon propre dépôt git »). This file holds what is JavaScript around it:
// opening the repository the sign-in gave, creating the first logbook in it, and recognising it afterwards. Pure apart
// from the core it is given, so that node:test drives it with a fake.

/** The error of opening or sending: `UNREACHABLE` (the server did not answer), `REFUSED` (the token was refused), `NOT_EMPTY` or `FAILED`. */
export class ServerLogbookError extends Error {
  /** @param {'UNREACHABLE'|'REFUSED'|'NOT_EMPTY'|'FAILED'} code */
  constructor(code) {
    super(code);
    this.name = 'ServerLogbookError';
    this.code = code;
  }
}

/**
 * « host/owner/name » of a repository address, without scheme, `.git`, branch suffix or case: the form the plugin gives
 * as the repository of a connected logbook and the form two addresses are compared in.
 * @param {string} url
 * @returns {string}
 */
export function repositoryKey(url) {
  return String(url ?? '')
    .trim()
    .replace(/\[[^\]]*\]$/, '')
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '')
    .toLowerCase();
}

/**
 * Whether the connected repository is the one of the signed-in OpenDives account: the logbook then shows as « Serveur
 * OpenDives » where the sync location is named.
 * @param {string} connected the `repository` of configureCloud
 * @param {{ signedIn: boolean, repositoryUrl: string }} session serverSessionInfo
 */
export function isServerRepository(connected, session) {
  return !!connected && session.signedIn && repositoryKey(connected) === repositoryKey(session.repositoryUrl);
}

/**
 * The counts of « Votre carnet est prêt ». Gear and certifications are not in the dives branch, so they are 0 here.
 * @param {{ site?: string }[]} rows the dives the core listed
 * @returns {{ dives: number, sites: number, gear: number, certifications: number, known: boolean }}
 */
export function logbookCounts(rows) {
  const sites = new Set(rows.map((d) => d.site).filter(Boolean));
  return { dives: rows.length, sites: sites.size, gear: 0, certifications: 0, known: true };
}

/**
 * The plugin's gitConnect options for an access given by the sign-in.
 * @param {{ repositoryUrl: string, branch: string, username: string, token: string }} access
 * @param {boolean} empty the repository holds no reference: the core creates the logbook branch in it
 */
export function connectOptions(access, empty) {
  return { url: access.repositoryUrl, username: access.username, token: access.token, branch: access.branch, empty };
}

/**
 * The error of the core's git calls as one of ours.
 * @param {unknown} e
 * @returns {ServerLogbookError}
 */
export function asServerError(e) {
  if (e instanceof ServerLogbookError) return e;
  const code = String(/** @type {any} */ (e)?.code ?? /** @type {any} */ (e)?.message ?? '');
  if (code === 'DENIED' || code === 'BAD_CREDENTIALS') return new ServerLogbookError('REFUSED');
  if (code === 'NOT_EMPTY' || code === 'LOG_EXISTS') return new ServerLogbookError('NOT_EMPTY');
  if (code === 'NETWORK' || code === 'UNREACHABLE' || code === 'BAD_ADDRESS') return new ServerLogbookError('UNREACHABLE');
  return new ServerLogbookError('FAILED');
}

/** @typedef {Pick<import('benthic-core').BenthicCorePlugin, 'gitCheck'|'gitConnect'|'listCloudDives'>} OpenCore */

/**
 * Looks at the account's repository and, when it holds the logbook, connects it and downloads it through the core.
 * `{ state: 'none' }` is an account with no logbook yet (an empty repository, or no `main` branch).
 * @param {OpenCore} core
 * @param {{ repositoryUrl: string, branch: string, username: string, token: string }} access
 * @param {{ download?: boolean }} [options] `download: false` only checks (the desktop window downloads when it opens the logbook)
 * @returns {Promise<{ state: 'none' } | { state: 'ready', counts: ReturnType<typeof logbookCounts> }>}
 */
export async function openServerLogbook(core, access, { download = true } = {}) {
  let found;
  try {
    found = await core.gitCheck({ url: access.repositoryUrl, username: access.username, token: access.token });
  } catch (e) {
    throw asServerError(e);
  }
  if (found.status === 'denied' || found.status === 'auth') throw new ServerLogbookError('REFUSED');
  if (found.status !== 'ok') throw new ServerLogbookError('UNREACHABLE');
  if (!found.branches.includes(access.branch)) return { state: 'none' };
  if (!download) return { state: 'ready', counts: { dives: 0, sites: 0, gear: 0, certifications: 0, known: false } };
  try {
    await core.gitConnect(connectOptions(access, false));
    const listed = await core.listCloudDives();
    return { state: 'ready', counts: logbookCounts(listed.dives ?? []) };
  } catch (e) {
    throw asServerError(e);
  }
}

/**
 * @typedef {Object} SendCore
 * @property {OpenCore['gitConnect']} gitConnect
 * @property {import('benthic-core').BenthicCorePlugin['deviceLog']} deviceLog
 * @property {import('benthic-core').BenthicCorePlugin['saveLocal']} saveLocal
 * @property {import('benthic-core').BenthicCorePlugin['syncChanges']} syncChanges
 */

/**
 * Pushes the saved commits to the server. The core pushes in one git push and git resumes by itself: sending again after
 * a dropped connection sends what the server does not have.
 * @param {Pick<SendCore, 'syncChanges'>} core
 */
export async function pushToServer(core) {
  let status;
  try {
    status = await core.syncChanges();
  } catch (e) {
    throw asServerError(e);
  }
  if (status.status === 'offline' || status.status === 'stopped') throw new ServerLogbookError('UNREACHABLE');
}

/**
 * Creates the account's first logbook in its repository and sends what the diver chose.
 *  - `blank`: the core creates the empty Subsurface logbook on branch `main` and pushes it;
 *  - `file`: the same, then `importFile` brings the dives of the file into it and they are pushed;
 *  - `device`: the same, then the dives of the logbook already on this device are brought in and pushed.
 * `onStage('importing')` is told before the dives are brought in, `onStage('sending')` before their push.
 * @param {SendCore} core
 * @param {{ repositoryUrl: string, branch: string, username: string, token: string }} access
 * @param {{ source: 'blank'|'file'|'device', importFile?: () => Promise<unknown>, onStage?: (stage: 'importing'|'sending') => void }} what
 * @returns {Promise<void>} rejects with a ServerLogbookError
 */
export async function createServerLogbook(core, access, { source, importFile, onStage }) {
  try {
    await core.gitConnect(connectOptions(access, true));
  } catch (e) {
    throw asServerError(e);
  }
  if (source === 'blank') return;
  onStage?.('importing');
  try {
    if (source === 'file') {
      if (!importFile) throw new ServerLogbookError('FAILED');
      await importFile();
    } else {
      await core.deviceLog({ action: 'import' });
    }
    await core.saveLocal();
  } catch (e) {
    throw asServerError(e);
  }
  onStage?.('sending');
  await pushToServer(core);
}
