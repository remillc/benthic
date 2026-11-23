// @ts-check
// Dive photos and videos on screen (task 2026-11-23-359): who sees the section, a dive's items with their thumbnails, adding
// files, opening an original, and the transfers' triggers. The pure parts are lib/dive-media.js (references, merge, policy),
// lib/media-sync.js (uploads and downloads) and lib/media-thumb.js (the thumbnail drawn in the web view).
import { BenthicCore } from 'benthic-core';
import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { createServerApi } from './server-api.js';
import { serverTransport } from './server-transport.js';
import { serverUrl } from './server-url.js';
import { deviceStore } from './device-store.js';
import { storedDemo } from './demo.js';
import { isRelease } from './edition.js';
import { benthicPlusSubscriber } from './benthic-plus-state.svelte.js';
import { accountDataDeps } from './profile.svelte.js';
import { settings } from './settings.svelte.js';
import { syncNetwork } from './sync-network.svelte.js';
import { signalAccountData } from './account-sync-signal.js';
import { stageFile } from './staged-file.js';
import { makeThumbnail } from './media-thumb.js';
import { createMediaSync } from './media-sync.js';
import { countsOf, itemsOf, kindOf, mediaPathOf, policyOf, withItems, DEFAULT_POLICY } from './dive-media.js';

/** What the screens read: `rev` changes when the references or the files change; `pending`: objects waiting to leave; `quotaFull`. */
export const mediaState = $state({ rev: 0, pending: 0, quotaFull: false });

const bump = () => {
  mediaState.rev++;
};

/** The section and its sync exist only for a Benthic+ account, never in the demo logbook. */
export const diveMediaEnabled = () => isRelease && benthicPlusSubscriber() && !storedDemo(deviceStore);

/** @returns {Promise<boolean>} whether the connection is one for large downloads (not a metered link) */
async function onWifi() {
  const desktop = /** @type {any} */ (globalThis).benthicDesktop;
  if (desktop) return syncNetwork.cost !== 'metered';
  if (Capacitor.isNativePlatform()) {
    try {
      const status = await Network.getStatus();
      return status.connected && status.connectionType === 'wifi';
    } catch {
      return false;
    }
  }
  return /** @type {any} */ (navigator).connection?.type !== 'cellular';
}

/** @returns {Promise<string>} */
async function token() {
  try {
    return (await BenthicCore.serverSessionAccess()).sessionToken || '';
  } catch {
    return '';
  }
}

/** The signed-URL calls with the account's session. @returns {import('./media-sync.js').MediaApi} */
function serverCalls() {
  const server = createServerApi({ baseUrl: serverUrl(), transport: serverTransport });
  return {
    uploadUrl: async (hash, size) => server.mediaUploadUrl(await token(), hash, size),
    downloadUrl: async (hash) => server.mediaDownloadUrl(await token(), hash),
  };
}

/** @type {ReturnType<typeof createMediaSync>|null} */
let engine = null;
const sync = () =>
  (engine ??= createMediaSync({
    core: /** @type {any} */ (BenthicCore),
    api: serverCalls(),
    store: accountDataDeps().store,
    policy: () => ({ photos: policyOf(settings.mediaPhotos, DEFAULT_POLICY.photos), videos: policyOf(settings.mediaVideos, DEFAULT_POLICY.videos) }),
    wifi: onWifi,
  }));

let queued = false;
/**
 * Sends and fetches what is due, now (fire and forget: it never throws and never waits for the server). Called after each
 * account sync, at start, when the network comes back and after a file is added.
 */
export function runMediaSync() {
  if (!diveMediaEnabled() || queued) return;
  queued = true;
  Promise.resolve()
    .then(async () => {
      const r = await sync().run();
      mediaState.quotaFull = r.quotaFull;
      mediaState.pending = r.waiting;
      if (r.downloaded) bump();
    })
    .catch(() => {})
    .finally(() => {
      queued = false;
    });
}

/** The references may have changed (a sync brought some in): the screens read again, and the transfers run. */
export function refreshMedia() {
  bump();
  runMediaSync();
}

/** The address a file of the device is shown at (an image or a video tag). @param {{ hash: string, path: string, mime?: string }} o */
export function mediaSrc({ hash, path, mime = '' }) {
  const desktop = /** @type {any} */ (globalThis).benthicDesktop;
  // The desktop's main process serves the media folder at app://media/<hash> (desktop/main.cjs); a check may give its own address.
  if (desktop) return desktop.mediaUrl ? desktop.mediaUrl(hash, mime) : `app://media/${hash}${mime ? `?type=${encodeURIComponent(mime)}` : ''}`;
  return Capacitor.convertFileSrc(`file://${path}`);
}

/**
 * @typedef {import('./dive-media.js').MediaItem & { kind: 'photo'|'video', thumbSrc: string, hasOriginal: boolean }} DiveMediaItem
 */

/**
 * The items of a dive, with the address of each thumbnail when the device holds it.
 * @param {string} diveId @returns {Promise<DiveMediaItem[]>}
 */
export async function loadDiveMedia(diveId) {
  const { store } = accountDataDeps();
  const file = await store.read(mediaPathOf(diveId));
  const core = /** @type {any} */ (BenthicCore);
  /** @type {DiveMediaItem[]} */
  const out = [];
  for (const item of itemsOf(file)) {
    const thumb = item.thumb ? await core.mediaStat({ hash: item.thumb }).catch(() => null) : null;
    const original = await core.mediaStat({ hash: item.hash }).catch(() => null);
    out.push({ ...item, kind: kindOf(item.mime), thumbSrc: thumb?.exists ? mediaSrc({ hash: item.thumb, path: thumb.path, mime: 'image/jpeg' }) : '', hasOriginal: !!original?.exists });
  }
  return out;
}

/** The cloud line's counts, from the items of the dive. @param {DiveMediaItem[]} items */
export const countsOfItems = (items) => countsOf(items);

/**
 * Adds photos or videos chosen by the diver to a dive: each file is copied into the device's media folder under the hash of
 * its content (never altered), its thumbnail is made, the dive's reference file is written (and synced like the rest), and
 * the upload starts in the background. Rejects with the first failure; files done before it stay added.
 * @param {string} diveId @param {File[]} files @returns {Promise<number>} how many were added
 */
export async function addDiveMedia(diveId, files) {
  const core = /** @type {any} */ (BenthicCore);
  const { store } = accountDataDeps();
  /** @type {import('./dive-media.js').MediaItem[]} */
  const items = [];
  for (const file of files) {
    const mime = file.type || (/\.(mp4|mov|m4v|webm)$/i.test(file.name) ? 'video/mp4' : 'image/jpeg');
    const staged = await stageFile(core, file, file.name || 'media');
    const { hash, size } = await core.mediaAdopt({ path: staged.path });
    const thumb = await makeThumbnail(file);
    const stored = thumb ? await core.mediaPutBytes({ data: thumb.base64 }) : null;
    items.push({
      hash,
      mime,
      size,
      takenAt: new Date(file.lastModified || Date.now()).toISOString(),
      caption: '',
      thumb: stored?.hash ?? '',
      ...(thumb?.durationMs ? { durationMs: thumb.durationMs } : {}),
      ...(thumb ? { width: thumb.width, height: thumb.height } : {}),
      name: file.name || '',
    });
  }
  if (!items.length) return 0;
  const path = mediaPathOf(diveId);
  const next = withItems(await store.read(path), diveId, items, new Date().toISOString());
  await store.trackedBatch({ writes: [[path, next]] });
  bump();
  signalAccountData('edit');
  runMediaSync();
  return items.length;
}

/**
 * The address of an original, downloaded first when the device does not hold it (« à la demande »).
 * Rejects `OFFLINE` or `NOT_ON_SERVER`.
 * @param {import('./dive-media.js').MediaItem} item @returns {Promise<string>}
 */
export async function openOriginal(item) {
  const path = await sync().ensureLocal(item.hash);
  bump();
  return mediaSrc({ hash: item.hash, path, mime: item.mime });
}
