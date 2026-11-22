// @ts-check
// « Partager le document » (task 2026-11-19-309, docs/mockups/doc-partager-android.dc.html): a document goes out as images
// (one per page) or as one PDF with every page. Made on the device, with the same HTML-to-PDF path as the dive sheet and
// the same share paths (the system's share sheet on a phone or tablet, the save dialog on the desktop). A PDF the diver
// attached (an insurance policy) is shared as it is, with the images.
import { Share } from '@capacitor/share';
import { BenthicCore } from 'benthic-core';
import { toBase64 } from './secret-box.js';
import { letterPaper } from './share.js';
import { desktopApp } from './layout.svelte.js';
import { t } from './i18n.js';

/** @param {string} s */
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

/** A file name from a title: « certificat-medical ». @param {string} title */
export function shareSlug(title) {
  const slug = title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'document';
}

/**
 * The pages of a PDF: one image per page, centred, the title small above the first.
 * @param {string} title
 * @param {string[]} dataUrls the images, in order
 * @param {boolean} letter
 */
export function pagesHtml(title, dataUrls, letter) {
  const pages = dataUrls
    .map((u, i) => `<div style="${i ? 'break-before:page;' : ''}display:flex;flex-direction:column;align-items:center">${i === 0 ? `<p style="margin:0 0 8px;font-size:12px;color:#4B4A47;align-self:flex-start">${esc(title)}</p>` : ''}<img src="${esc(u)}" style="max-width:100%;max-height:${letter ? '240mm' : '250mm'};object-fit:contain" alt=""></div>`)
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
@page { size: ${letter ? 'letter' : 'A4'}; margin: 12mm; }
body { margin: 0; color: #1F2124; font-family: system-ui, Roboto, sans-serif; }
</style></head><body>${pages}</body></html>`;
}

/**
 * @param {{ title: string, images: { bytes: Uint8Array }[], pdfs: { bytes: Uint8Array }[] }} input the document's files, opened
 * @param {'images'|'pdf'} how
 */
export async function shareDocument({ title, images, pdfs }, how) {
  const slug = shareSlug(title);
  /** @type {{ uri: string, mime: string, name: string }[]} */
  const out = [];
  if (how === 'images') {
    let n = 0;
    for (const f of images) {
      n++;
      const name = `${slug}-${n}.jpg`;
      const { uri } = await BenthicCore.writeShareFile({ name, base64: toBase64(f.bytes) });
      out.push({ uri, mime: 'image/jpeg', name });
    }
  } else if (images.length) {
    const letter = letterPaper();
    const dataUrls = images.map((f) => `data:image/jpeg;base64,${toBase64(f.bytes)}`);
    const name = `${slug}.pdf`;
    const { uri } = await BenthicCore.htmlToPdf({ html: pagesHtml(title, dataUrls, letter), name, letter });
    out.push({ uri, mime: 'application/pdf', name });
  }
  let n = 0;
  for (const f of pdfs) {
    n++;
    const name = pdfs.length > 1 ? `${slug}-fichier-${n}.pdf` : `${slug}-fichier.pdf`;
    const { uri } = await BenthicCore.writeShareFile({ name, base64: toBase64(f.bytes) });
    out.push({ uri, mime: 'application/pdf', name });
  }
  if (!out.length) throw new Error('NOTHING_TO_SHARE');
  if (desktopApp) {
    for (const f of out) await /** @type {any} */ (window).benthicDesktop.saveAs({ path: f.uri, name: f.name });
    return;
  }
  for (const f of out) await BenthicCore.grantShareFile({ uri: f.uri, mime: f.mime });
  await Share.share({ title, files: out.map((f) => f.uri), dialogTitle: t('docs.share.title') });
}
