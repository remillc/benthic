// @ts-check
// « Exporter ou imprimer… » of the equipment (task 2026-11-17-267): several pieces as a CSV text the system's share
// sheet can send, save or print. Pure, so that node:test can check it.

/** @param {string} value */
const cell = (value) => (/[",\n\r;]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

/**
 * The pieces as CSV (comma separated, quotes doubled, a header row).
 * @param {import('./inventory.js').Gear[]} pieces
 * @param {string[]} header the column titles, in the order: type, name, brand, model, serial, firmware, purchase date, note, archived
 * @param {(type: string) => string} typeName the translated type
 * @returns {string}
 */
export function gearCsv(pieces, header, typeName) {
  const rows = pieces.map((g) => [typeName(g.type), g.name, g.brand ?? '', g.model ?? '', g.serial ?? '', g.firmware ?? '', g.purchasedOn ?? '', g.note ?? '', g.retired ? '1' : '']);
  return `${[header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;
}

/** @param {string} s */
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

/**
 * The pieces as a page to print (« PDF à imprimer », 26 November 2026): a title and the date, then one table per type in the
 * order of the equipment list, columns Nom, Marque et modèle, Numéro de série, Date d'achat, Note. Pure, so node:test can check it.
 * @param {{ group: string, items: import('./inventory.js').Gear[] }[]} groups the chosen pieces by type (lib/inventory.js groupGear)
 * @param {{ title: string, exportedOn: string, letter: boolean, columns: string[], groupName: (group: string) => string,
 *   date: (iso: string) => string, retired: string }} text the translated texts; `columns` in the order above
 * @returns {string}
 */
export function gearHtml(groups, text) {
  const th = (/** @type {string} */ s) => `<th style="text-align:left;padding:6px 8px;font-size:11px;color:#4B4A47;font-weight:600;border-bottom:1px solid #1F2124">${esc(s)}</th>`;
  const td = (/** @type {string} */ html) => `<td style="padding:7px 8px;font-size:12px;border-bottom:1px solid #E3E1DC;vertical-align:top">${html}</td>`;
  const tables = groups
    .filter((g) => g.items.length)
    .map((g) => {
      const rows = g.items
        .map((p) => {
          const name = `${esc(p.name)}${p.retired ? ` <span style="color:#4B4A47">· ${esc(text.retired)}</span>` : ''}`;
          const model = [p.brand, p.model].filter(Boolean).join(' ');
          return `<tr>${td(name)}${td(esc(model))}${td(esc(p.serial ?? ''))}${td(esc(p.purchasedOn ? text.date(p.purchasedOn) : ''))}${td(esc(p.note ?? ''))}</tr>`;
        })
        .join('');
      return `<h2 style="margin:22px 0 4px;font-size:15px;break-after:avoid">${esc(text.groupName(g.group))}</h2>
<table style="width:100%;border-collapse:collapse;break-inside:auto"><thead><tr>${text.columns.map(th).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
    })
    .join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(text.title)}</title><style>
@page { size: ${text.letter ? 'letter' : 'A4'}; margin: 14mm 14mm 16mm; }
body { margin: 0; color: #1F2124; font-family: system-ui, Roboto, sans-serif; }
h1, h2 { font-family: Roboto, system-ui, sans-serif; }
tr { break-inside: avoid; }
</style></head><body>
<header style="border-bottom:2px solid #1F2124;padding-bottom:10px"><h1 style="margin:0;font-size:28px;line-height:34px;font-weight:800">${esc(text.title)}</h1><p style="margin:2px 0 0;font-size:13px;color:#4B4A47">${esc(text.exportedOn)}</p></header>
${tables}
</body></html>`;
}
