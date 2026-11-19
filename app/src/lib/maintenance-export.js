// @ts-check
// « Exporter l'historique » (task 2026-11-19-308, point 5, docs/mockups/ent-historique-pdf.dc.html): the maintenance
// history of one piece as a PDF in the paper of the settings (letter or A4, lib/share.js letterPaper): the piece, its type,
// serial number, purchase date, dive count and next maintenance, a table Date, Type, Fait par, Coût, Notes, then the invoices
// that were attached, one per page. Made on the device, with the same HTML-to-PDF path as the dive sheet.
import { Share } from '@capacitor/share';
import { OpenDivesCore } from 'opendives-core';
import { formatLongDate, formatNumber } from './format.js';
import { t } from './i18n.js';
import { taskLabel } from './maintenance-text.js';
import { localDay } from './logbook-name.js';

/** @param {string} s */
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

/**
 * The rows of the table, latest first: one per entry of every reminder of the piece.
 * @param {import('./maintenance.js').MaintenanceItem[]} items the reminders of the piece, history included
 * @returns {{ id: string, date: string, type: string, by: string, cost: number|null, notes: string, invoice: string }[]}
 */
export function historyRows(items) {
  return items
    .flatMap((item) =>
      (item.history ?? []).map((h) => ({
        id: h.id,
        date: h.doneOn,
        // A service is named after the reminder's task (« Inspection visuelle »); the other kinds by their own name.
        type: h.kind === 'service' ? taskLabel(item) : t(`maintenance.kind.${h.kind}`),
        by: h.doneBy ?? '',
        cost: h.cost ?? null,
        notes: h.notes ?? '',
        invoice: h.invoicePhotoId ?? '',
      })),
    )
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** @param {number} cost */
const money = (cost) => formatNumber(cost, Number.isInteger(cost) ? 0 : 2);

/**
 * The page as HTML. `next`: the piece's next maintenance in words (« 12 décembre 2026 ou dans 18 plongées »), '' when it has no
 * reminder. Fields without a value are left out of the figures, as on screen.
 * @param {{
 *   name: string, typeLabel: string, note?: string, serial?: string, purchasedOn?: string, dives: number, next: string,
 *   rows: ReturnType<typeof historyRows>, invoices: { label: string, dataUrl: string }[], exportedOn: string, letter: boolean,
 * }} input
 */
export function historyHtml({ name, typeLabel, note, serial, purchasedOn, dives, next, rows, invoices, exportedOn, letter }) {
  const label = 'display:block;font-size:11px;color:#4B4A47';
  const figure = (/** @type {string} */ l, /** @type {string} */ v) => `<div><span style="${label}">${esc(l)}</span><span style="font-size:14px">${esc(v)}</span></div>`;
  const figures = [
    serial ? figure(t('gear.piece.serial'), serial) : '',
    purchasedOn ? figure(t('gear.piece.purchasedOn'), formatLongDate(purchasedOn)) : '',
    figure(t('maintenance.export.dives'), String(dives)),
    next ? figure(t('maintenance.export.next'), next) : '',
  ].join('');
  const th = (/** @type {string} */ text, right = false) => `<th style="text-align:left;padding:8px 10px;font-size:12px;color:#4B4A47;font-weight:600;border-bottom:1px solid #1F2124"${right ? ' align="right"' : ''}>${esc(text)}</th>`;
  const td = (/** @type {string} */ html, right = false) => `<td style="padding:9px 10px;font-size:13px;border-bottom:1px solid #E3E1DC;vertical-align:top"${right ? ' align="right"' : ''}>${html}</td>`;
  const body = rows.length
    ? rows
        .map(
          (r) =>
            `<tr>${td(esc(formatLongDate(r.date)))}${td(esc(r.type))}${td(esc(r.by || t('maintenance.piece.byYouShort')))}${td(r.cost != null ? `<span style="white-space:nowrap">${esc(money(r.cost))}</span>` : '', true)}${td(esc(r.notes))}</tr>`,
        )
        .join('')
    : `<tr>${td(`<span style="color:#4B4A47">${esc(t('maintenance.piece.historyEmpty'))}</span>`)}<td colspan="4" style="border-bottom:1px solid #E3E1DC"></td></tr>`;
  const footer = invoices.length ? t('maintenance.export.footerInvoices') : t('maintenance.export.footer');
  const pages = invoices
    .map(
      (i) =>
        `<div style="break-before:page;padding-top:4px"><p style="margin:0 0 12px;font-size:13px;color:#4B4A47">${esc(i.label)}</p><img src="${esc(i.dataUrl)}" style="max-width:100%;max-height:230mm;object-fit:contain" alt=""></div>`,
    )
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(name)}</title><style>
@page { size: ${letter ? 'letter' : 'A4'}; margin: 14mm 14mm 16mm; }
body { margin: 0; color: #1F2124; font-family: system-ui, Roboto, sans-serif; }
h1, h2 { font-family: Roboto, system-ui, sans-serif; }
</style></head><body>
<header style="border-bottom:2px solid #1F2124;padding-bottom:12px"><p style="margin:0;font-size:13px;color:#4B4A47">${esc(t('maintenance.export.title', { date: exportedOn }))}</p><h1 style="margin:2px 0 0;font-size:30px;line-height:36px;font-weight:800">${esc(name)}</h1><p style="margin:2px 0 0;font-size:13px;color:#4B4A47">${esc([typeLabel, note].filter(Boolean).join(' · '))}</p></header>
<div style="margin-top:20px;display:grid;grid-template-columns:repeat(4,1fr);gap:16px">${figures}</div>
<h2 style="margin:28px 0 6px;font-size:16px">${esc(t('maintenance.export.table'))}</h2>
<table style="width:100%;border-collapse:collapse"><thead><tr>${th(t('maintenance.export.date'))}${th(t('maintenance.export.type'))}${th(t('maintenance.export.by'))}${th(t('maintenance.export.cost'), true)}${th(t('maintenance.export.notes'))}</tr></thead><tbody>${body}</tbody></table>
<p style="margin:24px 0 0;font-size:11px;color:#4B4A47;border-top:1px solid #E3E1DC;padding-top:8px">${esc(footer)}</p>
${pages}
</body></html>`;
}

/** The file name: « historique-entretien-apeks-xtx50-2026-11-19.pdf ». @param {string} name @param {string} day */
export function historyFileName(name, day) {
  const slug = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${t('maintenance.export.file')}-${slug || 'piece'}-${day}.pdf`;
}

/**
 * Makes the PDF of a piece's history and hands it over: the system's share sheet on a phone or tablet, the save dialog on
 * the desktop. `input` is what `historyHtml` needs but the date, the paper and the invoices, which are read here.
 * @param {Omit<Parameters<typeof historyHtml>[0], 'exportedOn'|'letter'|'invoices'>} input
 * @param {{ letter: boolean, readPhoto: (id: string) => Promise<string>, desktop: boolean }} env
 */
export async function exportHistory(input, { letter, readPhoto, desktop }) {
  const invoices = [];
  for (const r of input.rows) {
    if (!r.invoice) continue;
    const dataUrl = await readPhoto(r.invoice);
    if (dataUrl.startsWith('data:image/')) invoices.push({ label: `${formatLongDate(r.date)} · ${r.type}`, dataUrl });
  }
  const day = localDay();
  const html = historyHtml({ ...input, invoices, exportedOn: formatLongDate(day), letter });
  const name = historyFileName(input.name, day);
  const { uri } = await OpenDivesCore.htmlToPdf({ html, name, letter });
  if (desktop) {
    await /** @type {any} */ (window).odDesktop.saveAs({ path: uri, name });
    return;
  }
  await OpenDivesCore.grantShareFile({ uri, mime: 'application/pdf' });
  await Share.share({ title: name, files: [uri], dialogTitle: t('maintenance.export.share') });
}
