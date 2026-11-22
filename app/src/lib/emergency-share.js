// @ts-check
// « Partager la fiche d’urgence » (task 2026-11-19-311, docs/mockups/urgence-partager-android.dc.html): the sheet goes out as
// an image or as a PDF, made on the device with the paths of the dive sheet and of the documents (HTML to PDF in the core;
// the system's share sheet, or the save dialog on the desktop). Nothing is sent to the OpenDives server.
import { Share } from '@capacitor/share';
import { BenthicCore } from 'benthic-core';
import { letterPaper } from './share.js';
import { shareSlug } from './document-share.js';
import { desktopApp } from './layout.svelte.js';
import { t } from './i18n.js';

// The sheet is a document that leaves the app: its colours are written here, as in the other exported sheets.
const RED = '#A1372B';
const INK = '#1F2124';
const GREY = '#4B4A47';
const PAPER = '#F5F4F0';

/** @param {string} s */
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

/** @typedef {ReturnType<typeof import('./emergency.js').sheetText>} SheetText */

/**
 * The sheet as a page: the red band with the name, then a white card for each block.
 * @param {SheetText} text @param {boolean} letter @param {string} diverWord the small label above the name
 */
export function emergencyHtml(text, letter, diverWord) {
  const blocks = text.blocks
    .map(
      (b) => `<section><h2>${esc(b.title)}</h2>${b.name ? `<p class="name">${esc(b.name)}</p>` : ''}${b.line ? `<p class="line">${esc(b.line)}</p>` : ''}${
        b.hotline ? `<p class="line"><b>${esc(b.hotline.label)}</b> ${esc(b.hotline.number)}</p>` : ''
      }</section>`,
    )
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(t('emergency.title'))}</title><style>
@page { size: ${letter ? 'letter' : 'A4'}; margin: 14mm; }
body { margin: 0; color: ${INK}; font-family: system-ui, Roboto, sans-serif; background: ${PAPER}; }
header { background: ${RED}; color: #FFFFFF; border-radius: 18px; padding: 18px 20px; display: flex; align-items: center; gap: 16px; }
header .who { flex: 1; } header small { display: block; font-size: 12px; font-weight: 700; letter-spacing: .8px; }
header h1 { margin: 2px 0; font-size: 28px; line-height: 34px; } header p { margin: 0; font-size: 15px; }
header .blood { background: #FFFFFF; color: ${RED}; border-radius: 16px; width: 84px; padding: 8px 0; text-align: center; font-size: 30px; font-weight: 700; }
header .blood small { font-size: 11px; letter-spacing: .4px; }
section { background: #FFFFFF; border-radius: 16px; padding: 14px 18px; margin-top: 10px; break-inside: avoid; }
h2 { margin: 0 0 4px; font-size: 12px; letter-spacing: .6px; color: ${GREY}; }
.name { margin: 0; font-size: 19px; font-weight: 600; } .line { margin: 2px 0 0; font-size: 14px; color: ${GREY}; }
</style></head><body><header><div class="who"><small>${esc(diverWord)}</small><h1>${esc(text.name)}</h1>${text.birthLine ? `<p>${esc(text.birthLine)}</p>` : ''}</div>${
    text.blood ? `<div class="blood"><small>${esc(t('emergency.blood'))}</small><br>${esc(text.blood)}</div>` : ''
  }</header>${blocks}</body></html>`;
}

/**
 * The sheet drawn on a canvas, 390 points wide, as a PNG (base64). Drawn directly: an SVG foreign object would taint the
 * canvas in the Android WebView (see lib/slate-share.js).
 * @param {SheetText} text @param {string} diverWord
 * @returns {string}
 */
export function emergencyPng(text, diverWord) {
  const scale = 3;
  const width = 390;
  const pad = 16;
  const lines = text.blocks.map((b) => [b.title, b.name, b.line, b.hotline ? `${b.hotline.label} ${b.hotline.number}` : ''].filter(Boolean));
  const height = 24 + 110 + lines.reduce((h, l) => h + 12 + 20 + l.length * 24, 0) + 24;
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  ctx.scale(scale, scale);
  const font = (/** @type {number} */ size, /** @type {number} */ weight) => `${weight} ${size}px system-ui, Roboto, sans-serif`;
  /** @param {number} x @param {number} y @param {number} w @param {number} h @param {number} r @param {string} fill */
  const card = (x, y, w, h, r, fill) => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
  };
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, width, height);
  card(pad, 24, width - pad * 2, 110, 24, RED);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = font(12, 700);
  ctx.fillText(diverWord, pad + 20, 24 + 28);
  ctx.font = font(26, 600);
  ctx.fillText(text.name, pad + 20, 24 + 62, text.blood ? 210 : 320);
  ctx.font = font(14, 400);
  if (text.birthLine) ctx.fillText(text.birthLine, pad + 20, 24 + 88, text.blood ? 210 : 320);
  if (text.blood) {
    card(width - pad - 20 - 80, 24 + 15, 80, 80, 20, '#FFFFFF');
    ctx.fillStyle = RED;
    ctx.textAlign = 'center';
    ctx.font = font(11, 700);
    ctx.fillText(t('emergency.blood'), width - pad - 20 - 40, 24 + 40);
    ctx.font = font(30, 700);
    ctx.fillText(text.blood, width - pad - 20 - 40, 24 + 76);
    ctx.textAlign = 'left';
  }
  let y = 24 + 110 + 12;
  lines.forEach((l) => {
    const h = 20 + l.length * 24;
    card(pad, y, width - pad * 2, h, 20, '#FFFFFF');
    l.forEach((line, i) => {
      ctx.fillStyle = i === 0 ? GREY : i === 1 ? INK : GREY;
      ctx.font = i === 0 ? font(12, 700) : i === 1 ? font(18, 600) : font(14, 400);
      ctx.fillText(line, pad + 16, y + 26 + i * 24, width - pad * 2 - 32);
    });
    y += h + 12;
  });
  return canvas.toDataURL('image/png').split(',')[1];
}

/**
 * Shares the sheet as an image or as a PDF.
 * @param {SheetText} text
 * @param {'image'|'pdf'} how
 */
export async function shareEmergency(text, how) {
  const slug = shareSlug(t('emergency.title'));
  const diverWord = t('emergency.diver');
  const name = `${slug}.${how === 'pdf' ? 'pdf' : 'png'}`;
  let uri;
  if (how === 'pdf') {
    const letter = letterPaper();
    ({ uri } = await BenthicCore.htmlToPdf({ html: emergencyHtml(text, letter, diverWord), name, letter }));
  } else {
    ({ uri } = await BenthicCore.writeShareFile({ name, base64: emergencyPng(text, diverWord) }));
  }
  if (desktopApp) {
    await /** @type {any} */ (window).benthicDesktop.saveAs({ path: uri, name });
    return;
  }
  const mime = how === 'pdf' ? 'application/pdf' : 'image/png';
  await BenthicCore.grantShareFile({ uri, mime });
  await Share.share({ title: t('emergency.title'), files: [uri], dialogTitle: t('emergency.share.title') });
}
