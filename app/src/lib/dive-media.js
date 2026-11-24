// @ts-check
// Dive photos and videos, synced for Benthic+ (docs/architecture.md, 11.6). Pure: the reference files, their merge, the
// summary line and the download policy; the transfers are lib/media-sync.js, the screens read lib/dive-media.svelte.js.
//
// The reference of a dive lives in `media/<dive id>.json` on the `benthic` branch:
//   { format: 1, diveId, items: [ { hash, mime, size, takenAt, caption, thumb, addedAt?, camera?, durationMs?, width?, height?, name? } ],
//     removed?: [ { hash, removedAt } ] }
// `removed` holds the tombstones of items taken off the dive (task 2026-11-23-367): the merge keeps them, so that a removal
// reaches every device; adding the same file again gives it an `addedAt` later than the removal, which shows it again.
// `hash` is the SHA-256 of the original (the object `media/<hash>` on the server) and `thumb` the hash of its 256 px JPEG
// thumbnail, an object of its own. `diveId` is the dive's Benthic id
// (`diveKeyOf`, as `dive-equipment`), and the file name is that text made safe: `media/<benthic id>.json`. Until the one-time
// migration (lib/dive-id-migration.js) a file is named by the dive's start time. The same dive on two devices is one file.

/** The longest side of a thumbnail, in pixels. */
export const THUMB_SIZE = 256;

/** @typedef {{ hash: string, mime: string, size: number, takenAt: string, caption: string, thumb: string, addedAt?: string, camera?: string, durationMs?: number, width?: number, height?: number, name?: string }} MediaItem */
/** @typedef {{ format: number, diveId: string, updatedAt?: string, items: MediaItem[], removed?: { hash: string, removedAt: string }[] }} MediaFile */
/** @typedef {'all'|'recent'|'onDemand'} DownloadPolicy */

const HASH = /^[0-9a-f]{64}$/;

/** @param {unknown} hash */
export const isHash = (hash) => typeof hash === 'string' && HASH.test(hash);

/** The path of a dive's reference file. @param {string} diveId */
export const mediaPathOf = (diveId) => `media/${String(diveId).replace(/[^0-9A-Za-z]+/g, '-')}.json`;

/** @param {string} mime @returns {'photo'|'video'} */
export const kindOf = (mime) => (String(mime).startsWith('video/') ? 'video' : 'photo');

/** @param {string} diveId @returns {MediaFile} */
export const emptyFile = (diveId) => ({ format: 1, diveId, items: [] });

/** The items written in a file that are well formed, removed ones included. @param {any} file @returns {MediaItem[]} */
function rawItems(file) {
  const items = Array.isArray(file?.items) ? file.items : [];
  return items.filter((i) => i && isHash(i.hash) && typeof i.mime === 'string');
}

/**
 * The tombstones of a file (`removed`: `{ hash, removedAt }`), one per hash, the latest removal. A removed item keeps nothing
 * else; its objects stay on the server (the storage count does not change) and the files stay on the devices.
 * @param {any} file @returns {Map<string, string>} hash to removal time
 */
function tombstones(file) {
  /** @type {Map<string, string>} */
  const out = new Map();
  for (const r of Array.isArray(file?.removed) ? file.removed : []) {
    if (r && isHash(r.hash) && typeof r.removedAt === 'string' && (!out.has(r.hash) || /** @type {string} */ (out.get(r.hash)) < r.removedAt)) out.set(r.hash, r.removedAt);
  }
  return out;
}

/** An item is shown unless it was removed and not added again since: its `addedAt` is later than the removal. @param {MediaItem} item @param {Map<string, string>} gone */
const alive = (item, gone) => !gone.has(item.hash) || String(item.addedAt ?? '') > /** @type {string} */ (gone.get(item.hash));

/** Time taken, then hash. @param {MediaItem} x @param {MediaItem} y */
const byTaken = (x, y) => {
  const a = Date.parse(x.takenAt);
  const b = Date.parse(y.takenAt);
  if (Number.isFinite(a) && Number.isFinite(b) && a !== b) return a < b ? -1 : 1;
  return x.hash < y.hash ? -1 : x.hash > y.hash ? 1 : 0;
};

/**
 * The items a screen shows, in the order of the dive (time taken): the well formed ones that were not removed.
 * @param {any} file @returns {MediaItem[]}
 */
export function itemsOf(file) {
  const gone = tombstones(file);
  return rawItems(file)
    .filter((i) => alive(i, gone))
    .sort(byTaken);
}

/**
 * Items merged by hash (a union). The same item on both sides keeps the caption and details of the side that changed
 * them from the base, else ours; the later `addedAt` wins when one side added it again.
 * @param {MediaItem[]} base @param {MediaItem[]} ours @param {MediaItem[]} theirs @returns {MediaItem[]}
 */
function unionItems(base, ours, theirs) {
  const index = (/** @type {MediaItem[]} */ list) => new Map(list.map((i) => [i.hash, i]));
  const b = index(base);
  const o = index(ours);
  const t = index(theirs);
  const same = (/** @type {any} */ x, /** @type {any} */ y) => JSON.stringify(x) === JSON.stringify(y);
  /** @type {MediaItem[]} */
  const out = [];
  for (const hash of new Set([...o.keys(), ...t.keys()])) {
    const oi = o.get(hash);
    const ti = t.get(hash);
    if (oi && ti) {
      const oa = String(oi.addedAt ?? '');
      const ta = String(ti.addedAt ?? '');
      // One side added it again since the base (a newer addedAt): that side wins, the later of two.
      const ba = String(b.get(hash)?.addedAt ?? '');
      if (oa > ba || ta > ba) out.push(oa >= ta ? oi : ti);
      else out.push(same(oi, ti) ? oi : same(b.get(hash), oi) ? ti : oi);
    } else out.push(/** @type {MediaItem} */ (oi ?? ti));
  }
  return out;
}

/**
 * The merge of two devices' reference files for a dive: the union of their items, by hash, and of their tombstones (the
 * latest removal of a hash). An item removed on one side and not added again since is gone on both; added again later
 * than the removal (a newer `addedAt`), it is back. A file deleted on one side does not delete the other's.
 * @param {MediaFile|null} base @param {MediaFile|null} ours @param {MediaFile|null} theirs
 * @returns {MediaFile|null}
 */
export function mergeMediaFile(base, ours, theirs) {
  if (!ours) return theirs;
  if (!theirs) return ours;
  const gone = tombstones(ours);
  for (const [hash, at] of tombstones(theirs)) if (!gone.has(hash) || /** @type {string} */ (gone.get(hash)) < at) gone.set(hash, at);
  const items = unionItems(rawItems(base), rawItems(ours), rawItems(theirs))
    .filter((i) => alive(i, gone))
    .sort(byTaken);
  const removed = [...gone].map(([hash, removedAt]) => ({ hash, removedAt })).sort((x, y) => (x.hash < y.hash ? -1 : 1));
  const updatedAt = [ours.updatedAt, theirs.updatedAt].filter(Boolean).sort().pop();
  return { ...ours, format: 1, diveId: ours.diveId || theirs.diveId, ...(updatedAt ? { updatedAt } : {}), items, ...(removed.length ? { removed } : {}) };
}

/** One millisecond after an ISO time. @param {string} iso */
const justAfter = (iso) => new Date(Date.parse(iso) + 1).toISOString();

/**
 * A file with items added. Those already shown are left as they are. One removed earlier comes back with an `addedAt` later
 * than its removal (so that the other devices, which hold the tombstone, show it again).
 * @param {MediaFile|null} file @param {string} diveId @param {MediaItem[]} added @param {string} stamp
 * @returns {MediaFile}
 */
export function withItems(file, diveId, added, stamp) {
  const gone = tombstones(file);
  const have = new Set(itemsOf(file).map((i) => i.hash));
  const fresh = added
    .filter((i) => !have.has(i.hash))
    .map((i) => ({ ...i, addedAt: gone.has(i.hash) && /** @type {string} */ (gone.get(i.hash)) >= stamp ? justAfter(/** @type {string} */ (gone.get(i.hash))) : stamp }));
  const items = [...itemsOf(file), ...fresh].sort(byTaken);
  const removed = /** @type {any} */ (file)?.removed;
  return { ...(file ?? emptyFile(diveId)), format: 1, diveId, updatedAt: stamp, items, ...(removed ? { removed } : {}) };
}

/**
 * A file with items removed from the dive: each leaves `items` and keeps a tombstone `{ hash, removedAt }`, which the merge
 * carries to the other devices.
 * @param {MediaFile|null} file @param {string} diveId @param {string[]} hashes @param {string} stamp
 * @returns {MediaFile}
 */
export function withoutItems(file, diveId, hashes, stamp) {
  const gone = tombstones(file);
  for (const hash of hashes) gone.set(hash, gone.has(hash) && /** @type {string} */ (gone.get(hash)) > stamp ? /** @type {string} */ (gone.get(hash)) : stamp);
  const drop = new Set(hashes);
  const removed = [...gone].map(([hash, removedAt]) => ({ hash, removedAt })).sort((x, y) => (x.hash < y.hash ? -1 : 1));
  return { ...(file ?? emptyFile(diveId)), format: 1, diveId, updatedAt: stamp, items: itemsOf(file).filter((i) => !drop.has(i.hash)), removed };
}

/**
 * The depth of the profile at an offset in the dive, in mm: the samples are `timeSeconds` and `depthMm` (as the core returns
 * them); between two samples the depth is interpolated. `null` when the offset falls outside the dive (before the first
 * sample or after the last) or when there is no profile.
 * @param {{ timeSeconds?: ArrayLike<number>, depthMm?: ArrayLike<number> }|null|undefined} samples
 * @param {number} offsetSeconds
 * @returns {number|null}
 */
export function depthAtOffset(samples, offsetSeconds) {
  const times = samples?.timeSeconds;
  const depths = samples?.depthMm;
  if (!times || !depths || !times.length || times.length !== depths.length || !Number.isFinite(offsetSeconds)) return null;
  const last = times.length - 1;
  if (offsetSeconds < times[0] || offsetSeconds > times[last]) return null;
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= offsetSeconds) lo = mid;
    else hi = mid;
  }
  if (lo === last) return depths[last];
  const span = times[hi] - times[lo];
  return span > 0 ? Math.round(depths[lo] + ((depths[hi] - depths[lo]) * (offsetSeconds - times[lo])) / span) : depths[lo];
}

/**
 * Seconds from the start of the dive to the moment a picture was taken (the picture offset of Subsurface, worked out here
 * because the core returns only the count of the logbook's pictures). Both times are read on the device's clock: a time
 * without a zone (the camera's own clock, the dive's start) is the device's local time. `null` when either does not read.
 * @param {string} takenAt @param {string} diveStart @returns {number|null}
 */
export function offsetInDive(takenAt, diveStart) {
  const taken = Date.parse(takenAt);
  const start = Date.parse(diveStart);
  return Number.isFinite(taken) && Number.isFinite(start) ? Math.round((taken - start) / 1000) : null;
}

/**
 * The objects a file names: each original and its thumbnail.
 * @param {any} file @returns {string[]}
 */
export function objectsOf(file) {
  const out = [];
  for (const i of itemsOf(file)) {
    out.push(i.hash);
    if (isHash(i.thumb)) out.push(i.thumb);
  }
  return out;
}

/** The counts of the cloud line: « 3 photos et 1 vidéo ». @param {MediaItem[]} items */
export function countsOf(items) {
  const videos = items.filter((i) => kindOf(i.mime) === 'video').length;
  return { photos: items.length - videos, videos };
}

/**
 * Whether the original of an item is to be downloaded by itself on Wi-Fi: the choice of its kind (photo or video).
 * « Celles des 12 derniers mois »: taken in the last 12 months; an item with no date counts as recent.
 * @param {{ photos: DownloadPolicy, videos: DownloadPolicy }} policy @param {MediaItem} item @param {Date} now
 */
export function wantsOriginal(policy, item, now) {
  const choice = policy[kindOf(item.mime) === 'video' ? 'videos' : 'photos'];
  if (choice === 'all') return true;
  if (choice === 'onDemand') return false;
  const taken = Date.parse(item.takenAt);
  if (!Number.isFinite(taken)) return true;
  const limit = new Date(now);
  limit.setFullYear(limit.getFullYear() - 1);
  return taken >= limit.getTime();
}

/** The defaults of Réglages › Carnet: photos 12 months, videos on demand. @type {{ photos: DownloadPolicy, videos: DownloadPolicy }} */
export const DEFAULT_POLICY = { photos: 'recent', videos: 'onDemand' };

/** @param {unknown} value @param {DownloadPolicy} fallback @returns {DownloadPolicy} */
export const policyOf = (value, fallback) => (value === 'all' || value === 'recent' || value === 'onDemand' ? value : fallback);

/** « 0:42 », « 1:02:03 ». @param {number} ms */
export function durationText(ms) {
  const total = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/**
 * A time taken as the local wall-clock time the formats of the app read (`2014-04-02T10:11:00`): a time written without a zone
 * is already that; one with a zone (the file's own date, `…Z`) is shown on the device's clock. '' when it does not read.
 * @param {string} takenAt
 */
export function takenLocalIso(takenAt) {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(takenAt)) return takenAt;
  const date = new Date(takenAt);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
}
