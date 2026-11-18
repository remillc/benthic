// @ts-check
// The release edition's first launch in the desktop app (task 2026-11-16-228; mock-ups docs/mockups/
// bureau-premier-lancement-production*.dc.html). The screens are the tablet's (components/FirstLaunchSteps.svelte);
// this file holds what only the desktop does, kept apart from them so that node:test can run it:
//   - the window without a logbook takes the logbook the first launch makes: the main process creates it and the
//     window reloads on it (desktop/windows.cjs, `create`), so what the diver brought (a file, a divelogs.de
//     download) is parked in the window's session storage and imported once the logbook is open;
//   - the sign-in to a personal cloud (Google Drive, OneDrive, Dropbox) goes through the main process
//     (desktop/cloud.cjs), which already keeps the tokens;
//   - the name of a logbook made from a git address.
import { cloudErrorKey } from './desktop-logbooks.js';

/** Where the dives to import are parked while the window reloads on its new logbook. */
export const PENDING_IMPORT_KEY = 'od.pendingImport';

/**
 * What the new logbook still has to import: the staged files (the import folder of the app's temp folder), read
 * back and imported once the logbook is open.
 * @typedef {{ files: { path: string, name: string }[], csv?: { params: any, companion: boolean } }} PendingImport
 * `files[0]` is the file imported; for a CSV, `files[1]` is its companion (a Poseidon MkVI .txt) when `companion`.
 */

/**
 * The record to park for a source the diver brought. A file is staged now (`stage` writes it to the import
 * folder and answers its path); the divelogs.de download is already there.
 * @param {import('./first-launch.svelte.js').ImportSource} source
 * @param {(file: File) => Promise<string>} stage
 * @returns {Promise<PendingImport>}
 */
export async function pendingFromSource(source, stage) {
  if (source.kind === 'divelogs') return { files: (source.paths ?? [source.path]).map((path) => ({ path, name: 'divelogs.dld' })) };
  const files = [{ path: await stage(source.file), name: source.file.name }];
  if (source.csv?.companion) files.push({ path: await stage(source.csv.companion), name: source.csv.companion.name });
  return source.csv ? { files, csv: { params: source.csv.params, companion: !!source.csv.companion } } : { files };
}

/**
 * @param {Pick<Storage, 'setItem'>} storage
 * @param {PendingImport} pending
 */
export function parkPending(storage, pending) {
  storage.setItem(PENDING_IMPORT_KEY, JSON.stringify(pending));
}

/**
 * The parked record, taken out of the storage (read once). Null when there is none or it is not a record.
 * @param {Pick<Storage, 'getItem'|'removeItem'>} storage
 * @returns {PendingImport|null}
 */
export function takePending(storage) {
  const raw = storage.getItem(PENDING_IMPORT_KEY);
  if (raw === null) return null;
  storage.removeItem(PENDING_IMPORT_KEY);
  try {
    const value = JSON.parse(raw);
    const files = Array.isArray(value?.files) ? value.files : [];
    if (!files.length || !files.every((f) => f && typeof f.path === 'string' && typeof f.name === 'string')) return null;
    return { files: files.map((f) => ({ path: f.path, name: f.name })), ...(value.csv ? { csv: { params: value.csv.params, companion: !!value.csv.companion } } : {}) };
  } catch {
    return null;
  }
}

/**
 * The parked import, run on the new logbook: each staged file is read back and imported as if the diver had
 * picked it, and every staged file is deleted at the end, whatever happened.
 * @param {PendingImport} pending
 * @param {{
 *   read: (path: string) => Promise<Uint8Array>,
 *   importFile: (file: File) => Promise<number>,
 *   importCsv: (file: File, params: any, companion: File|null) => Promise<number>,
 *   remove: (path: string) => Promise<unknown>,
 * }} deps
 * @returns {Promise<number>} the dives added
 */
export async function runPending(pending, deps) {
  try {
    const files = [];
    for (const f of pending.files) files.push(new File([/** @type {BlobPart} */ (await deps.read(f.path))], f.name));
    if (pending.csv) return await deps.importCsv(files[0], pending.csv.params, pending.csv.companion ? (files[1] ?? null) : null);
    let added = 0;
    for (const file of files) added += await deps.importFile(file);
    return added;
  } finally {
    for (const f of pending.files) await deps.remove(f.path).catch(() => {});
  }
}

/**
 * Signs in to a cloud service through the main process, which opens the provider's page in the browser. A
 * service the diver is already signed in to answers at once, unless the diver wants another account.
 * @param {{ cloudStatus: () => Promise<any[]>, cloudSignIn: (o: { provider: string, switchAccount: boolean }) => Promise<any> }} logbooks `odDesktop.logbooks`
 * @param {string} provider
 * @param {boolean} [switchAccount]
 * @returns {Promise<{ provider: string, available: boolean, connected: boolean, account: string }>}
 * @throws the main process's error (`code`: SIGN_IN_CANCELLED, SIGN_IN_DENIED, NOT_AVAILABLE…)
 */
export async function signInTo(logbooks, provider, switchAccount = false) {
  if (!switchAccount) {
    const known = (await logbooks.cloudStatus()).find((p) => p.provider === provider);
    if (known?.connected) return known;
  }
  return logbooks.cloudSignIn({ provider, switchAccount });
}

/**
 * What the sign-in's failure means for the screen: `cancelled` (the diver, or another screen, cancelled: back to
 * « Se connecter »), `unavailable` (this build has no keys for the service: said like the other unbuilt cloud
 * actions), or `refused` (« Connexion non établie »).
 * @param {unknown} error
 * @returns {'cancelled'|'unavailable'|'refused'}
 */
export function signInFailure(error) {
  const key = cloudErrorKey(/** @type {any} */ (error));
  if (key === 'desktopCloud.errors.SIGN_IN_CANCELLED') return 'cancelled';
  if (key === 'desktopCloud.errors.NOT_AVAILABLE') return 'unavailable';
  return 'refused';
}

/**
 * The name of a logbook opened from a git repository (the screen has no name field): the repository's name in its
 * address (`https://github.com/vous/plongees.git` gives `plongees`), else the fallback.
 * @param {string} address
 * @param {string} fallback
 * @returns {string}
 */
export function nameFromGitUrl(address, fallback) {
  try {
    const last = new URL(address.trim()).pathname.split('/').filter(Boolean).pop() ?? '';
    return last.replace(/\.git$/i, '') || fallback;
  } catch {
    return fallback;
  }
}

/**
 * The files a drop carries, when the drop is one the first launch takes: files, and not text or a link.
 * @param {{ types?: ArrayLike<string>|readonly string[], files?: ArrayLike<File> }|null|undefined} transfer
 * @returns {File[]}
 */
export function droppedFiles(transfer) {
  if (!transfer || !Array.from(transfer.types ?? []).includes('Files')) return [];
  return Array.from(transfer.files ?? []);
}

/** The steps whose choices carry the drop line, and where a drop starts or continues the import. */
export const DROP_STEPS = Object.freeze(['start', 'import']);

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
