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
