// @ts-check
// Dive photos and videos, synced for Benthic+ (docs/architecture.md, 11.6). Pure: the reference files, their merge, the
// summary line and the download policy; the transfers are lib/media-sync.js, the screens read lib/dive-media.svelte.js.
//
// The reference of a dive lives in `media/<dive id>.json` on the `benthic` branch:
//   { format: 1, diveId, items: [ { hash, mime, size, takenAt, caption, thumb, durationMs?, width?, height?, name? } ] }
// `hash` is the SHA-256 of the original (the object `media/<hash>` on the server) and `thumb` the hash of its 256 px JPEG
// thumbnail, an object of its own. `diveId` is the dive's Benthic id
// (`diveKeyOf`, as `dive-equipment`), and the file name is that text made safe: `media/<benthic id>.json`. Until the one-time
// migration (lib/dive-id-migration.js) a file is named by the dive's start time. The same dive on two devices is one file.

/** The longest side of a thumbnail, in pixels. */
export const THUMB_SIZE = 256;

/** @typedef {{ hash: string, mime: string, size: number, takenAt: string, caption: string, thumb: string, durationMs?: number, width?: number, height?: number, name?: string }} MediaItem */
/** @typedef {{ format: number, diveId: string, updatedAt?: string, items: MediaItem[] }} MediaFile */
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

/** The items of a file that are well formed; the rest is kept out of the screens, never deleted from the file. @param {any} file @returns {MediaItem[]} */
export function itemsOf(file) {
  const items = Array.isArray(file?.items) ? file.items : [];
  return items.filter((i) => i && isHash(i.hash) && typeof i.mime === 'string');
}

/**
 * Items merged by hash (a union). The same item on both sides keeps the caption and details of the side that changed
 * them from the base, else of the later `updatedAt`.
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
    if (oi && ti) out.push(same(oi, ti) ? oi : same(b.get(hash), oi) ? ti : oi);
    else out.push(/** @type {MediaItem} */ (oi ?? ti));
  }
  return out.sort((x, y) => (x.takenAt < y.takenAt ? -1 : x.takenAt > y.takenAt ? 1 : x.hash < y.hash ? -1 : 1));
}

/**
 * The merge of two devices' reference files for a dive: the union of their items, by hash. A file deleted on one side
 * does not delete the other's.
 * @param {MediaFile|null} base @param {MediaFile|null} ours @param {MediaFile|null} theirs
 * @returns {MediaFile|null}
 */
export function mergeMediaFile(base, ours, theirs) {
  if (!ours) return theirs;
  if (!theirs) return ours;
  const items = unionItems(itemsOf(base), itemsOf(ours), itemsOf(theirs));
  const updatedAt = [ours.updatedAt, theirs.updatedAt].filter(Boolean).sort().pop();
  return { ...ours, format: 1, diveId: ours.diveId || theirs.diveId, ...(updatedAt ? { updatedAt } : {}), items };
}

/**
 * A file with items added (those whose hash is already there are left as they are).
 * @param {MediaFile|null} file @param {string} diveId @param {MediaItem[]} added @param {string} stamp
 * @returns {MediaFile}
 */
export function withItems(file, diveId, added, stamp) {
  const have = new Set(itemsOf(file).map((i) => i.hash));
  const items = [...itemsOf(file), ...added.filter((i) => !have.has(i.hash))];
  return { ...(file ?? emptyFile(diveId)), format: 1, diveId, updatedAt: stamp, items };
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
