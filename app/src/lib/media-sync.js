// @ts-check
// The transfers of dive photos and videos (docs/architecture.md, 11.6; task 2026-11-23-359). No screen code and no platform
// code: `core` (the plugin's `media*` calls), `api` (signed URLs), `store` and the policy are parameters, so that node:test
// drives it with fakes and the desktop test with the real server.
//
// One run:
//  1. uploads: every object the references name (original and thumbnail) that this device holds and the server has not
//     been told about leaves, through a signed URL, streamed from its file. Objects already on the server cost nothing.
//     A full account (QUOTA_EXCEEDED) stops the uploads and is remembered; the device keeps the files.
//  2. downloads: thumbnails always (they are small: the logbook stays readable offline); originals only on Wi-Fi and as
//     the diver's choice says (all, those of the last 12 months, on demand).
// A run never throws: the server being down or the network gone leaves the work for the next run. The state of what was
// sent is the device's own (`meta/media.json`, never synced).

import { itemsOf, wantsOriginal, isHash } from './dive-media.js';

const STATE = 'meta/media.json';

/**
 * @typedef {Object} MediaCore the plugin's calls
 * @property {(o: { hash: string }) => Promise<{ exists: boolean, size: number, path: string }>} mediaStat
 * @property {(o: { hash: string, url: string, headers?: Record<string, string> }) => Promise<{ status: number }>} mediaUpload
 * @property {(o: { hash: string, url: string }) => Promise<{ size: number }>} mediaDownload
 */

/**
 * @typedef {Object} MediaApi the server's calls, with the session of the account
 * @property {(hash: string, size: number) => Promise<{ exists: true }|{ exists: false, url: string, headers: Record<string, string> }>} uploadUrl
 * @property {(hash: string) => Promise<{ url: string, size: number|null }>} downloadUrl
 */

/**
 * @typedef {Object} MediaSyncDeps
 * @property {MediaCore} core
 * @property {MediaApi} api
 * @property {import('./file-store.js').FileStore} store
 * @property {() => { photos: import('./dive-media.js').DownloadPolicy, videos: import('./dive-media.js').DownloadPolicy }} policy
 * @property {() => Promise<boolean>|boolean} wifi whether the connection is one for large downloads
 * @property {() => Date} [now]
 */

/**
 * What a run did.
 * @typedef {Object} MediaRunResult
 * @property {number} uploaded @property {number} downloaded @property {number} waiting objects still to send
 * @property {boolean} quotaFull @property {boolean} offline @property {boolean} skipped another run was going
 */

/** @param {unknown} e */
const codeOf = (e) => String(/** @type {any} */ (e)?.code ?? /** @type {any} */ (e)?.message ?? '');

/** @param {MediaSyncDeps} deps */
export function createMediaSync(deps) {
  const { core, api, store } = deps;
  const now = deps.now ?? (() => new Date());
  let running = false;

  /** @returns {Promise<{ format: number, uploaded: Record<string, true>, quotaFull?: boolean }>} */
  async function readState() {
    const s = await store.read(STATE);
    return { format: 1, uploaded: s && typeof s.uploaded === 'object' && s.uploaded ? s.uploaded : {}, ...(s?.quotaFull ? { quotaFull: true } : {}) };
  }

  /** Every reference file of the device. @returns {Promise<any[]>} */
  const files = () => store.readAll('media/');

  /** The objects the references name, with what each is: `{ hash, thumb, item }`. @param {any[]} list */
  function objects(list) {
    /** @type {Map<string, { hash: string, thumb: boolean, item: import('./dive-media.js').MediaItem }>} */
    const out = new Map();
    for (const file of list) {
      for (const item of itemsOf(file)) {
        if (!out.has(item.hash)) out.set(item.hash, { hash: item.hash, thumb: false, item });
        if (isHash(item.thumb) && !out.has(item.thumb)) out.set(item.thumb, { hash: item.thumb, thumb: true, item });
      }
    }
    return out;
  }

  /**
   * One pass of uploads and downloads. Quiet: nothing is thrown.
   * @param {{ uploads?: boolean, downloads?: boolean }} [what]
   * @returns {Promise<MediaRunResult>}
   */
  async function run(what = {}) {
    /** @type {MediaRunResult} */
    const result = { uploaded: 0, downloaded: 0, waiting: 0, quotaFull: false, offline: false, skipped: false };
    if (running) return { ...result, skipped: true };
    running = true;
    try {
      const state = await readState();
      const wanted = objects(await files());

      if (what.uploads !== false) {
        let stop = false;
        for (const { hash } of wanted.values()) {
          if (state.uploaded[hash]) continue;
          if (stop) {
            result.waiting++;
            continue;
          }
          try {
            const local = await core.mediaStat({ hash });
            if (!local.exists) continue; // the original is on another device: nothing to send from here
            const signed = await api.uploadUrl(hash, local.size);
            if (!signed.exists) {
              const sent = await core.mediaUpload({ hash, url: signed.url, headers: signed.headers });
              if (sent.status < 200 || sent.status >= 300) throw new Error(`HTTP_${sent.status}`);
              result.uploaded++;
            }
            state.uploaded[hash] = true;
            await store.write(STATE, state);
          } catch (e) {
            const code = codeOf(e);
            result.waiting++;
            if (code === 'QUOTA_EXCEEDED') {
              result.quotaFull = true;
              stop = true;
            } else if (code === 'UNREACHABLE' || code === 'NETWORK' || code === 'SUBSCRIPTION_REQUIRED') {
              result.offline = code !== 'SUBSCRIPTION_REQUIRED';
              stop = true;
            }
            // Anything else (a refusal of this object): left for the next run.
          }
        }
        if (state.quotaFull !== result.quotaFull) {
          const next = { ...state, ...(result.quotaFull ? { quotaFull: true } : {}) };
          if (!result.quotaFull) delete next.quotaFull;
          await store.write(STATE, next);
        }
      }

      if (what.downloads !== false && !result.offline) {
        const wifi = await deps.wifi();
        const choice = deps.policy();
        for (const { hash, thumb, item } of wanted.values()) {
          if (!thumb && !(wifi && wantsOriginal(choice, item, now()))) continue;
          try {
            if ((await core.mediaStat({ hash })).exists) {
              // Held here, so the server has it or will: nothing to fetch.
              continue;
            }
            const signed = await api.downloadUrl(hash);
            await core.mediaDownload({ hash, url: signed.url });
            result.downloaded++;
          } catch (e) {
            const code = codeOf(e);
            if (code === 'UNREACHABLE' || code === 'NETWORK') {
              result.offline = true;
              break;
            }
            // NOT_FOUND: the other device has not uploaded it yet. Anything else: the next run.
          }
        }
      }
      return result;
    } catch (e) {
      console.error('Media sync', e);
      return result;
    } finally {
      running = false;
    }
  }

  /**
   * The original of an item, downloaded now if the device does not hold it (« à la demande »). Rejects `OFFLINE`
   * (no network or the server is down) or `NOT_ON_SERVER`.
   * @param {string} hash @returns {Promise<string>} the file's path
   */
  async function ensureLocal(hash) {
    const have = await core.mediaStat({ hash });
    if (have.exists) return have.path;
    let signed;
    try {
      signed = await api.downloadUrl(hash);
    } catch (e) {
      throw new Error(codeOf(e) === 'NOT_FOUND' ? 'NOT_ON_SERVER' : 'OFFLINE');
    }
    try {
      await core.mediaDownload({ hash, url: signed.url });
    } catch {
      throw new Error('OFFLINE');
    }
    return (await core.mediaStat({ hash })).path;
  }

  /** How many objects wait to leave this device. @returns {Promise<number>} */
  async function pendingUploads() {
    const state = await readState();
    let n = 0;
    for (const { hash } of objects(await files()).values()) {
      if (state.uploaded[hash]) continue;
      if ((await core.mediaStat({ hash }).catch(() => ({ exists: false }))).exists) n++;
    }
    return n;
  }

  return { run, ensureLocal, pendingUploads, readState };
}
