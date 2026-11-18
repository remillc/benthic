// @ts-check
// Scanning a certification card (task 2026-11-18-272). Two parts:
//  - `scanCard(side)`: THE seam to the phone's document scanner (Android ML Kit Document Scanner, iOS VisionKit) and
//    its text recognition (ML Kit, Vision). That native part is added later by another task. Until then the seam
//    falls back to the system image picker (`<input type="file" accept="image/*">`, which on Android often offers
//    the camera) and returns no text, so nothing is proposed and the diver types the values.
//  - `parseCardText(text)`: a pure parser that proposes the agency, the level and the number from the recognised
//    text. It only proposes; the diver checks the values. The photo never leaves the device.

import { AGENCIES, LEVEL_SUGGESTIONS } from './profile.js';

/**
 * @typedef {Object} ScanResult
 * @property {Blob} image the card, as a picture
 * @property {string} text the text recognised on it; '' when the scanner does not read text
 */

/**
 * Asks the diver for a picture of one side of the card. Resolves null when the diver cancels.
 * To wire: the document scanner plugin (cropped, straightened picture) and its text recognition; the answer's shape
 * stays `{ image, text }`.
 * @param {'front'|'back'} _side which side of the card is asked for
 * @returns {Promise<ScanResult|null>}
 */
export function scanCard(_side) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    let settled = false;
    const done = (/** @type {ScanResult|null} */ value) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(value);
    };
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      done(file ? { image: file, text: '' } : null);
    });
    input.addEventListener('cancel', () => done(null));
    document.body.append(input);
    input.click();
  });
}

/** Words that name an agency on a card, besides its id. @type {Record<string, RegExp>} */
const AGENCY_WORDS = {
  PADI: /\bPADI\b|professional association of diving/i,
  SSI: /\bSSI\b|scuba schools international/i,
  NAUI: /\bNAUI\b|national association of underwater/i,
  CMAS: /\bCMAS\b|confédération mondiale|confederation mondiale/i,
  FFESSM: /\bFFESSM\b|f[ée]d[ée]ration fran[cç]aise d.{0,3}[ée]tudes/i,
  BSAC: /\bBSAC\b|british sub-aqua/i,
  SDI: /\bSDI\b|scuba diving international/i,
  TDI: /\bTDI\b|technical diving international/i,
  IANTD: /\bIANTD\b/i,
  GUE: /\bGUE\b|global underwater explorers/i,
  PDIC: /\bPDIC\b/i,
  ACUC: /\bACUC\b/i,
};

/** @param {string} s */
const norm = (s) => s.toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * The agency, level and number a card's text suggests.
 * @param {string} text the recognised text, lines separated by line breaks
 * @returns {{ agency: string, level: string, number: string }} '' for what is not found
 */
export function parseCardText(text) {
  const out = { agency: '', level: '', number: '' };
  if (!text.trim()) return out;

  // The agency: the first one whose name is on the card (TDI is checked before SDI: « Scuba Diving International » must not win over « Technical »).
  const order = AGENCIES.map((a) => a.id).filter((id) => id !== 'other');
  for (const id of order) {
    if (AGENCY_WORDS[id]?.test(text)) {
      out.agency = id;
      break;
    }
  }

  // The level: the longest suggested level of the agency (or of any agency) found in the text, whole words only.
  const flat = ` ${norm(text)} `;
  const pools = out.agency ? [LEVEL_SUGGESTIONS[out.agency] ?? []] : [Object.values(LEVEL_SUGGESTIONS).flat()];
  let best = '';
  for (const level of pools[0]) {
    const n = norm(level);
    if (n.length > best.length && flat.includes(` ${n} `)) best = level;
  }
  out.level = best;

  // The number: a token after « No », « N° », « Number », « Cert », « Diver » (label) or the longest mixed digit token on its own line.
  const labelled = /(?:\bn[°o˚º]\.?|\bnum(?:ber|[ée]ro)?\.?|\bcert(?:ification)?\.?(?:\s*(?:no|n[°o]|number))?|\bdiver\s*(?:no|n[°o]|number)|\bcard\s*(?:no|n[°o]|number)|\bid)\s*[:#.]?\s*([A-Z0-9][A-Z0-9\-/]{3,19})/i;
  const m = labelled.exec(text);
  if (m && /\d/.test(m[1])) out.number = m[1].toUpperCase();
  else {
    // A line that is only a code with digits (at least 5), preferring the one with letters and digits.
    const codes = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => /^[A-Z0-9][A-Z0-9\-/ ]{4,19}$/i.test(l) && /\d{4,}|\d.*[A-Z]|[A-Z].*\d/i.test(l) && (l.match(/\d/g) ?? []).length >= 4 && !/^\d{1,2}[ /-]\d{1,2}[ /-]\d{2,4}$/.test(l));
    if (codes.length) out.number = codes.sort((a, b) => Number(/[A-Z]/i.test(b)) - Number(/[A-Z]/i.test(a)))[0].toUpperCase().replace(/\s+/g, ' ');
  }
  return out;
}
