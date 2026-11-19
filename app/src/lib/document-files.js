// @ts-check
// The files of a document (photos, scans, pages, a PDF) opened from the sealed store for the screens (task 2026-11-19-309).
// A screen that opens files revokes their addresses when it goes (`revokeFiles`).
import { services } from './profile.svelte.js';
import { photoUrl } from './card-canvas.js';

/** @typedef {import('./profile.js').Certification} Doc */
/** @typedef {{ file: import('./profile.js').DocumentFile, bytes: Uint8Array, url: string, pdf: boolean }} OpenFile */

/** The order of a document's files: front, back, then the pages. @param {import('./profile.js').DocumentFile[]} files */
export function orderedFiles(files) {
  const rank = (/** @type {import('./profile.js').DocumentFile} */ f) => (f.side === 'front' ? 0 : f.side === 'back' ? 1 : 2);
  return [...files].sort((a, b) => rank(a) - rank(b) || (a.page ?? 0) - (b.page ?? 0));
}

/**
 * Opens the files of a document, in order.
 * @param {Doc} doc
 * @param {{ max?: number }} [options] open only the first files (a list row needs one or two)
 * @returns {Promise<OpenFile[]>}
 */
export async function openFiles(doc, { max = Infinity } = {}) {
  /** @type {OpenFile[]} */
  const out = [];
  for (const file of orderedFiles(doc.documents).slice(0, max)) {
    const bytes = await services().profile.readPhoto(doc.id, file.hash);
    if (!bytes) continue;
    const pdf = file.mime === 'application/pdf';
    out.push({ file, bytes, pdf, url: pdf ? URL.createObjectURL(new Blob([/** @type {BlobPart} */ (bytes)], { type: 'application/pdf' })) : photoUrl(bytes) });
  }
  return out;
}

/** @param {OpenFile[]} files */
export function revokeFiles(files) {
  for (const f of files) URL.revokeObjectURL(f.url);
}
