// @ts-check
// « Partager » of the photos and videos of a dive (task 2026-11-23-367): the originals go out as files. On a phone or a tablet
// through the system's share sheet (@capacitor/share, the same path as the document and the dive sheet; saving to the device's
// gallery goes through it too); on the desktop through the system's « Enregistrer sous… » dialog, one file after the other.
import { Share } from '@capacitor/share';
import { BenthicCore } from 'benthic-core';
import { toBase64 } from './secret-box.js';
import { desktopApp } from './layout.svelte.js';
import { t } from './i18n.js';

const EXTENSIONS = /** @type {Record<string, string>} */ ({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/x-m4v': 'm4v',
});

/**
 * The name a shared file gets: the file's own name when the item has one, else a short one from its hash. Unique in a batch.
 * @param {{ hash: string, mime: string, name?: string }} item @param {Set<string>} [taken]
 */
export function shareName(item, taken = new Set()) {
  const ext = EXTENSIONS[item.mime] ?? (item.mime.split('/')[1] || 'bin').replace(/[^a-z0-9]/gi, '');
  const own = (item.name ?? '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim();
  let name = own && /\.[A-Za-z0-9]{2,5}$/.test(own) ? own : `${own || `benthic-${item.hash.slice(0, 8)}`}.${ext}`;
  if (taken.has(name)) name = `${item.hash.slice(0, 8)}-${name}`;
  taken.add(name);
  return name;
}

/** The bytes of a file as base64, read in pieces so that a video does not need one huge string at once. @param {Blob} blob */
async function base64Of(blob) {
  const piece = 3 * 1024 * 1024;
  let out = '';
  for (let at = 0; at < blob.size; at += piece) out += toBase64(new Uint8Array(await blob.slice(at, at + piece).arrayBuffer()));
  return out;
}

/**
 * Shares the originals of items. `source` gives the address of an original (downloading it first when the device does not
 * hold it) and rejects `OFFLINE` or `NOT_ON_SERVER`.
 * @param {{ hash: string, mime: string, name?: string }[]} items
 * @param {(item: any) => Promise<string>} source
 * @returns {Promise<void>}
 */
export async function shareMedia(items, source) {
  if (!items.length) return;
  const taken = new Set();
  /** @type {{ uri: string, mime: string, name: string }[]} */
  const files = [];
  for (const item of items) {
    const blob = await (await fetch(await source(item))).blob();
    const name = shareName(item, taken);
    const { uri } = await BenthicCore.writeShareFile({ name, base64: await base64Of(blob) });
    files.push({ uri, mime: item.mime, name });
  }
  if (desktopApp) {
    for (const f of files) await /** @type {any} */ (window).benthicDesktop.saveAs({ path: f.uri, name: f.name });
    return;
  }
  for (const f of files) await BenthicCore.grantShareFile({ uri: f.uri, mime: f.mime });
  await Share.share({ title: t('detail.mediaGallery'), files: files.map((f) => f.uri), dialogTitle: t('share.title') });
}
