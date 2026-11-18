// @ts-check
// Sending a logbook to the OpenDives server (release edition; docs/architecture.md, section 11.3). The files of lib/
// server-logbook-format.js are written to the account's repository through the git host's HTTP interface (the
// contents endpoint takes several files in one commit), in small commits, one per batch of dives, so that an
// interrupted upload resumes where it stopped: the server's tree says which dives are there, the device keeps the ids
// it gave (so a resumed upload names the same files). The marker `opendives.json` is written last: a logbook that has
// one is complete. Pure apart from what it is given (transport, source, store), so that node:test drives it.
import { isEmptyBranch, repositoryApi } from './server-logbook.js';
import { MARKER_PATH, divePath, filesOfDive, markerFile, newId, profilePath, sitePath, stableJson, tripKey, tripPath, uniqueKeys, siteKey } from './server-logbook-format.js';

/** The key of the upload in progress in the device store (lib/device-store.js). */
export const UPLOAD_KEY = 'od.serverUpload';

/** A batch holds at most this many dives and about this many bytes of files. */
const BATCH_DIVES = 5;
const BATCH_BYTES = 300_000;

/** The error of an upload: `UNREACHABLE` (the server did not answer, the progress is kept) or `CANCELLED`. */
export class UploadError extends Error {
  /** @param {'UNREACHABLE'|'CANCELLED'|'REFUSED'} code @param {number} [done] the dives on the server when it stopped */
  constructor(code, done = 0) {
    super(code);
    this.name = 'UploadError';
    this.code = code;
    this.done = done;
  }
}

/**
 * What the device keeps between two runs of an upload. Never a token: the session is in the secure storage.
 * @typedef {Object} UploadState
 * @property {1} v
 * @property {string} repository the repository the ids belong to
 * @property {string} name the logbook's name
 * @property {number} total dives to send
 * @property {Record<string, string>} ids dive, site and trip keys to their UUIDs
 */

/** @param {unknown} text @returns {UploadState|null} */
export function parseState(text) {
  try {
    const s = JSON.parse(String(text));
    if (s && s.v === 1 && typeof s.repository === 'string' && typeof s.name === 'string' && s.ids && typeof s.ids === 'object') return s;
  } catch {
    // Not a state: ignored.
  }
  return null;
}

/**
 * Whether an upload to this repository was left unfinished on this device.
 * @param {{ getItem: (key: string) => string|null }} store
 * @param {string} repositoryUrl
 * @returns {UploadState|null}
 */
export function pendingUpload(store, repositoryUrl) {
  const state = parseState(store.getItem(UPLOAD_KEY));
  return state && state.repository === repositoryUrl ? state : null;
}

/**
 * Time left of an upload, from what it did since this run started.
 * @param {{ done: number, total: number, startedDone: number, elapsedMs: number }} p
 * @returns {{ unit: 'seconds'|'minutes'|'none', n: number }} `none` until a few dives were sent
 */
export function timeLeft({ done, total, startedDone, elapsedMs }) {
  const sent = done - startedDone;
  if (sent < 1 || elapsedMs < 1000 || total <= done) return { unit: 'none', n: 0 };
  const seconds = ((total - done) * elapsedMs) / sent / 1000;
  if (seconds < 45) return { unit: 'seconds', n: Math.max(5, Math.round(seconds / 5) * 5) };
  return { unit: 'minutes', n: Math.max(1, Math.round(seconds / 60)) };
}

/**
 * @typedef {Object} UploadSource where the dives are read from (the core, through the plugin)
 * @property {() => Promise<{ id: number, date: string, site: string, number: number, durationSeconds: number, maxDepthMm: number, trip: { id: number, location: string, autogen: boolean }|null }[]>} list
 * @property {(id: number) => Promise<import('opendives-core').DiveDetail>} detail
 */

/**
 * @typedef {Object} UploadOptions
 * @property {import('./server-api.js').ServerTransport} transport
 * @property {{ repositoryUrl: string, branch: string, token: string }} access
 * @property {{ getItem: (key: string) => string|null, setItem: (key: string, value: string) => unknown, removeItem: (key: string) => unknown }} store
 * @property {UploadSource} source
 * @property {string} name the logbook's name
 * @property {() => string} [now] ISO time, for the files
 * @property {(done: number, total: number) => void} [onProgress]
 * @property {() => boolean} [cancelled]
 * @property {number} [batchDives]
 */

/**
 * Sends the logbook; resumes an earlier run of the same repository. Resolves with the number of dives on the server
 * when the marker is written; rejects with an `UploadError`.
 * @param {UploadOptions} o
 * @returns {Promise<{ dives: number }>}
 */
export async function uploadLogbook(o) {
  const api = repositoryApi(o.access.repositoryUrl);
  if (!api) throw new UploadError('UNREACHABLE');
  const headers = { Authorization: `token ${o.access.token}` };
  const now = o.now ?? (() => new Date().toISOString());
  const stamp = now();

  /** One call; a failure to reach the server, or a 5xx, is `UNREACHABLE`. @param {import('./server-api.js').ServerRequest} request */
  async function call(request) {
    try {
      return await o.transport({ ...request, headers });
    } catch {
      throw new UploadError('UNREACHABLE');
    }
  }

  /** The files of the branch (an empty repository has no branch yet: nothing). @returns {Promise<Set<string>>} */
  async function listPaths() {
    /** @type {Set<string>} */
    const paths = new Set();
    for (let page = 1; page < 500; page++) {
      const r = await call({ method: 'GET', url: `${api}/git/trees/${encodeURIComponent(o.access.branch)}?recursive=true&per_page=1000&page=${page}` });
      if (isEmptyBranch(r)) break;
      if (r.status < 200 || r.status >= 300) throw new UploadError('UNREACHABLE');
      let tree;
      try {
        tree = JSON.parse(r.text);
      } catch {
        throw new UploadError('UNREACHABLE');
      }
      for (const e of tree.tree ?? []) if (e.type === 'blob') paths.add(e.path);
      if (!tree.truncated && !(tree.total_count > page * 1000)) break;
    }
    return paths;
  }

  /** One commit of several new files. @param {{ path: string, text: string }[]} files @param {string} message */
  async function commit(files, message) {
    const r = await call({
      method: 'POST',
      url: `${api}/contents`,
      body: {
        branch: o.access.branch,
        message,
        author: { name: 'OpenDives', email: 'noreply@opendives.app' },
        committer: { name: 'OpenDives', email: 'noreply@opendives.app' },
        files: files.map((f) => ({ operation: 'create', path: f.path, content: toBase64(f.text) })),
      },
    });
    // 422: a file is already there (an earlier answer was lost after the commit): the caller lists the tree again.
    if (r.status === 422 || r.status === 409) return false;
    if (r.status < 200 || r.status >= 300) throw new UploadError(r.status >= 500 ? 'UNREACHABLE' : 'REFUSED');
    return true;
  }

  const rows = await o.source.list();
  const keys = uniqueKeys(rows);
  const total = rows.length;

  // The ids: kept from an earlier run of this repository, made for what is new, and written down before any commit.
  const earlier = pendingUpload(o.store, o.access.repositoryUrl);
  /** @type {UploadState} */
  const state = { v: 1, repository: o.access.repositoryUrl, name: o.name, total, ids: earlier ? { ...earlier.ids } : {} };
  /** @param {string} key */
  const idFor = (key) => (state.ids[key] ??= newId());
  /** The first date of each trip, to name it across loads. @type {Map<number, string>} */
  const tripFirst = new Map();
  for (const r of rows) if (r.trip && (!tripFirst.has(r.trip.id) || r.date < /** @type {string} */ (tripFirst.get(r.trip.id)))) tripFirst.set(r.trip.id, r.date);
  const diveIds = rows.map((r, i) => ({
    id: idFor(keys[i]),
    siteId: r.site ? idFor(siteKey(r.site)) : null,
    tripId: r.trip ? idFor(tripKey(r.trip.location, /** @type {string} */ (tripFirst.get(r.trip.id)))) : null,
  }));
  o.store.setItem(UPLOAD_KEY, JSON.stringify(state));

  let paths = await listPaths();
  if (paths.has(MARKER_PATH)) {
    o.onProgress?.(total, total);
    o.store.removeItem(UPLOAD_KEY);
    return { dives: total };
  }

  /** @returns {number[]} indexes of the dives not on the server */
  const missing = () => rows.map((_, i) => i).filter((i) => !paths.has(divePath(diveIds[i].id)) || !paths.has(profilePath(diveIds[i].id)));
  let todo = missing();
  const startedDone = total - todo.length;
  o.onProgress?.(startedDone, total);

  const limit = o.batchDives ?? BATCH_DIVES;
  let sent = startedDone;
  let again = 0;
  for (let at = 0; at < todo.length; ) {
    if (o.cancelled?.()) throw new UploadError('CANCELLED', sent);
    /** @type {{ path: string, text: string }[]} */
    const files = [];
    /** @type {Set<string>} */
    const queued = new Set();
    let bytes = 0;
    let count = 0;
    while (at + count < todo.length && count < limit && bytes < BATCH_BYTES) {
      const i = todo[at + count];
      let detail;
      try {
        detail = await o.source.detail(rows[i].id);
      } catch {
        throw new UploadError('REFUSED', sent);
      }
      const ids = diveIds[i];
      const writeSite = !!ids.siteId && !paths.has(sitePath(ids.siteId)) && !queued.has(ids.siteId);
      const writeTrip = !!ids.tripId && !paths.has(tripPath(ids.tripId)) && !queued.has(ids.tripId);
      if (writeSite && ids.siteId) queued.add(ids.siteId);
      if (writeTrip && ids.tripId) queued.add(ids.tripId);
      for (const f of filesOfDive({ detail, ids, now: stamp, writeSite, writeTrip })) {
        files.push(f);
        bytes += f.text.length;
      }
      count++;
    }
    let ok;
    try {
      ok = await commit(files, `Send ${count} dive${count === 1 ? '' : 's'}`);
    } catch (e) {
      if (e instanceof UploadError) throw new UploadError(e.code, sent);
      throw e;
    }
    if (!ok) {
      if (++again > 3) throw new UploadError('REFUSED', sent);
      // Some of the files are there already: look at the tree again and send what is still missing.
      paths = await listPaths();
      todo = missing();
      at = 0;
      sent = total - todo.length;
      o.onProgress?.(sent, total);
      continue;
    }
    for (const f of files) paths.add(f.path);
    at += count;
    sent += count;
    o.onProgress?.(sent, total);
  }

  if (o.cancelled?.()) throw new UploadError('CANCELLED', sent);
  try {
    const ok = await commit([{ path: MARKER_PATH, text: stableJson(markerFile({ name: o.name, now: stamp })) }], 'Create the logbook');
    if (!ok) paths = await listPaths();
  } catch (e) {
    if (e instanceof UploadError) throw new UploadError(e.code, sent);
    throw e;
  }
  o.store.removeItem(UPLOAD_KEY);
  return { dives: total };
}

/** @param {string} text UTF-8 text @returns {string} base64 */
function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
