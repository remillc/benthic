// @ts-check
// Copy and paste of dives in the desktop Carnet (task 2026-11-15-178, part 3). Ctrl/⌘+C writes two
// forms: plain text (the selected rows as the table shows them, a header line, tab-separated, one
// dive per line: it pastes into a spreadsheet as columns) and the dives in Subsurface XML from the
// core's export (the private type `application/x-opendives-dives`'s content). Ctrl/⌘+V adds the dives
// of the clipboard, or of a plain text that is a Subsurface `<divelog>`, through the import's
// duplicate check. Electron cannot put a custom type beside the text (every write replaces the
// others), so the main process (desktop/bridge.cjs, `benthicDesktop.clipboard`) writes the plain text and
// keeps the XML tied to it; the dives are offered while the clipboard still holds that text. A
// pasted `<divelog>` text works everywhere.
import { BenthicCore } from 'benthic-core';

/** The private clipboard type holding the dives as Subsurface XML. */
export const DIVES_TYPE = 'application/x-opendives-dives';

/**
 * The plain-text form of the selected rows: a header line, then one line per dive, cells
 * separated by tabs. A tab or a line break inside a cell becomes a space, so that each dive
 * stays on one line and each cell in one column.
 * @param {string[]} headers the column names
 * @param {string[][]} rows the cells of each dive, in the table's order
 * @returns {string}
 */
export function selectionText(headers, rows) {
  const clean = (/** @type {string} */ cell) => String(cell ?? '').replace(/[\t\r\n]+/g, ' ').trim();
  return [headers, ...rows].map((line) => line.map(clean).join('\t')).join('\n');
}

/**
 * Whether a text is a Subsurface log: an optional XML declaration and comments, then the
 * `<divelog>` element.
 * @param {string} text
 */
export function isDivelog(text) {
  return /^﻿?\s*(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<divelog[\s>]/.test(text);
}

/**
 * The dives a clipboard holds: the private type's XML, else the plain text when it is a
 * `<divelog>`; an empty string when it holds no dives.
 * @param {{ text?: string, dives?: string }|null|undefined} content
 * @returns {string}
 */
export function divesIn(content) {
  if (!content) return '';
  if (content.dives && isDivelog(content.dives)) return content.dives;
  return content.text && isDivelog(content.text) ? content.text : '';
}

/** @param {string} text UTF-8 text as base64, for the core's import */
export function textToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** @returns {any} the desktop bridge's clipboard, when there is one */
const bridge = () => /** @type {any} */ (globalThis).window?.benthicDesktop?.clipboard ?? null;

/**
 * Writes the selected dives on the clipboard: the plain text and, through the bridge, the dives'
 * XML under the private type.
 * @param {number[]} ids the dives to copy
 * @param {string} text the plain-text form (selectionText)
 */
export async function copyDives(ids, text) {
  const bridged = bridge();
  if (!bridged) {
    await navigator.clipboard.writeText(text);
    return;
  }
  /** @type {string} */
  let dives = '';
  try {
    ({ text: dives = '' } = await BenthicCore.exportDives({ ids, format: 'ssrf', anonymize: false, name: 'clipboard.ssrf', text: true }));
  } catch (e) {
    // The text alone still copies.
    console.error('Copy dives', e);
  }
  await bridged.write({ text, dives });
}

/** The dives' XML on the clipboard, or '' when it holds none. */
export async function clipboardDives() {
  const bridged = bridge();
  try {
    if (bridged) return divesIn(await bridged.read());
    return divesIn({ text: await navigator.clipboard.readText() });
  } catch (e) {
    console.error('Read the clipboard', e);
    return '';
  }
}
