// @ts-check
// Scanning a certification card (tasks 2026-11-18-272 and 277). Two parts:
//  - `scanCard(side)`: THE seam to the phone's document scanner. On Android and iOS it calls the plugin's
//    `scanDocument` (ML Kit Document Scanner / VisionKit: framing, crop and straightening are the system's own
//    screens) which also returns the text read on the device (ML Kit / Vision). The diver cancelling changes nothing.
//    Where the scanner does not exist (desktop, browser) it falls back to the system image picker, with no text;
//    the desktop crop flow is another task.
//  - `parseCardText(text)`: a pure parser that proposes the agency, the level, the number and the date from the
//    recognised text. It only proposes; the diver checks the values. The photo never leaves the device.

import { AGENCIES, LEVEL_SUGGESTIONS } from './profile.js';

/**
 * @typedef {Object} ScanResult
 * @property {Blob} image the card, as a picture
 * @property {string} text the text recognised on it; '' when the scanner does not read text
 */

/** @typedef {() => Promise<{ action: 'cancelled'|'unavailable'|'done', image?: string, text?: string }>} NativeScanner */

/** The plugin's scanner, loaded when first used. @type {NativeScanner} */
const nativeScanner = async () => {
  const { OpenDivesCore } = await import('opendives-core');
  return OpenDivesCore.scanDocument();
};

/** @param {string} base64 @returns {Blob} */
function jpegFromBase64(base64) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: 'image/jpeg' });
}

/**
 * Asks the diver for a picture of one side of the card. Resolves null when the diver cancels (no message, no change).
 * @param {'front'|'back'} _side which side of the card is asked for
 * @param {{ scanner?: NativeScanner, picker?: () => Promise<ScanResult|null> }} [deps] replaced in tests
 * @returns {Promise<ScanResult|null>}
 */
export async function scanCard(_side, { scanner = nativeScanner, picker = pickImage } = {}) {
  /** @type {Awaited<ReturnType<NativeScanner>>|null} */
  let result = null;
  try {
    result = await scanner();
  } catch {
    result = null; // no scanner on this platform (desktop, browser)
  }
  if (result?.action === 'cancelled') return null;
  if (result?.action === 'done' && result.image) return { image: jpegFromBase64(result.image), text: result.text ?? '' };
  return picker();
}

/** The system image picker (on Android it often offers the camera). Resolves null when the diver cancels. @returns {Promise<ScanResult|null>} */
function pickImage() {
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
 * @param {string} [today] YYYY-MM-DD; a date after it is not proposed (an expiry date, a misreading)
 * @returns {{ agency: string, level: string, number: string, issuedOn: string }} '' for what is not found
 */
export function parseCardText(text, today = new Date().toISOString().slice(0, 10)) {
  const out = { agency: '', level: '', number: '', issuedOn: findDate(text, today) };
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

const MONTHS = {
  jan: 1, janv: 1, january: 1, janvier: 1, feb: 2, fev: 2, fevr: 2, february: 2, fevrier: 2, mar: 3, mars: 3, march: 3,
  apr: 4, avr: 4, april: 4, avril: 4, may: 5, mai: 5, jun: 6, juin: 6, june: 6, jul: 7, juil: 7, july: 7, juillet: 7,
  aug: 8, aout: 8, august: 8, sep: 9, sept: 9, september: 9, septembre: 9, oct: 10, october: 10, octobre: 10,
  nov: 11, november: 11, novembre: 11, dec: 12, december: 12, decembre: 12,
};

/** @param {number} y @param {number} m @param {number} d @returns {string} YYYY-MM-DD, '' when not a real date */
function iso(y, m, d) {
  if (y < 100) y += y > 50 ? 1900 : 2000;
  const s = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return y >= 1950 && m >= 1 && m <= 12 && d >= 1 && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s) ? s : '';
}

/**
 * The issue date on a card: a date after a label (« Date », « Issued », « Délivré le ») first, else the first date
 * found that is not in the future. Reads « 12 JUN 2015 », « 12 juin 2015 », « June 12, 2015 », « 12/06/2015 »
 * (day first unless the second number cannot be a month), « 2015-06-12 ».
 * @param {string} text
 * @param {string} today YYYY-MM-DD
 * @returns {string} YYYY-MM-DD, '' when none
 */
export function findDate(text, today) {
  /** @type {{ at: number, date: string }[]} */
  const found = [];
  const flat = text.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const add = (/** @type {RegExpMatchArray} */ m, /** @type {string} */ date) => date && date <= today && found.push({ at: m.index ?? 0, date });
  for (const m of flat.matchAll(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/g)) add(m, iso(+m[1], +m[2], +m[3]));
  for (const m of flat.matchAll(/\b(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{4}|\d{2})\b/g)) {
    const [a, b] = [+m[1], +m[2]];
    add(m, b > 12 ? iso(+m[3], a, b) : iso(+m[3], b, a));
  }
  for (const m of flat.matchAll(/\b(\d{1,2})(?:st|nd|rd|th|er)?[-. ]+([a-z]{3,9})\.?[-, ]+(\d{4})\b/gi)) add(m, MONTHS[m[2].toLowerCase()] ? iso(+m[3], MONTHS[m[2].toLowerCase()], +m[1]) : '');
  for (const m of flat.matchAll(/\b([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/gi)) add(m, MONTHS[m[1].toLowerCase()] ? iso(+m[3], MONTHS[m[1].toLowerCase()], +m[2]) : '');
  if (!found.length) return '';
  found.sort((x, y) => x.at - y.at);
  for (const label of flat.matchAll(/\b(?:date|issued?|delivree?|emise?|certified)\b[^\n]{0,20}/gi)) {
    const start = label.index ?? 0;
    const hit = found.find((f) => f.at >= start && f.at <= start + label[0].length + 2);
    if (hit) return hit.date;
  }
  return found[0].date;
}

/**
 * Every real date in a text, in the order they are written (an expiry date is in the future, which `findDate` leaves out).
 * @param {string} text
 * @returns {{ at: number, date: string }[]}
 */
export function findDates(text) {
  /** @type {{ at: number, date: string }[]} */
  const found = [];
  const flat = text.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const add = (/** @type {RegExpMatchArray} */ m, /** @type {string} */ date) => date && found.push({ at: m.index ?? 0, date });
  for (const m of flat.matchAll(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/g)) add(m, iso(+m[1], +m[2], +m[3]));
  for (const m of flat.matchAll(/\b(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{4}|\d{2})\b/g)) {
    const [a, b] = [+m[1], +m[2]];
    add(m, b > 12 ? iso(+m[3], a, b) : iso(+m[3], b, a));
  }
  for (const m of flat.matchAll(/\b(\d{1,2})(?:st|nd|rd|th|er)?[-. ]+([a-z]{3,9})\.?[-, ]+(\d{4})\b/gi)) add(m, MONTHS[m[2].toLowerCase()] ? iso(+m[3], MONTHS[m[2].toLowerCase()], +m[1]) : '');
  for (const m of flat.matchAll(/\b([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/gi)) add(m, MONTHS[m[1].toLowerCase()] ? iso(+m[3], MONTHS[m[1].toLowerCase()], +m[2]) : '');
  return found.sort((x, y) => x.at - y.at);
}

/** The diving insurers a card names. @type {{ test: RegExp, name: (text: string) => string }[]} */
const INSURERS = [
  { test: /\bDAN\b|divers alert network/i, name: (text) => (/canada/i.test(text) ? 'DAN Canada' : /europe/i.test(text) ? 'DAN Europe' : /\bDAN\b.*\bworld|asia.?pacific/i.test(text) ? 'DAN World' : 'DAN') },
  { test: /\bAXA\b/i, name: () => 'AXA' },
  { test: /\bAllianz\b/i, name: () => 'Allianz' },
  { test: /dive\s*assure|diveassure/i, name: () => 'DiveAssure' },
  { test: /\bHiscox\b/i, name: () => 'Hiscox' },
  { test: /\bPADI\b.*insurance|dive insurance/i, name: () => 'PADI Dive Insurance' },
];

/**
 * What an insurance card's text suggests: the insurer, the plan, the policy number, the emergency phone and the dates. It
 * only proposes; the diver checks every value.
 * @param {string} text the recognised text, lines separated by line breaks
 * @returns {{ insurer: string, plan: string, policyNumber: string, emergencyPhone: string, startsOn: string, expiresOn: string }} '' for what is not found
 */
export function parseInsuranceText(text) {
  const out = { insurer: '', plan: '', policyNumber: '', emergencyPhone: '', startsOn: '', expiresOn: '' };
  if (!text.trim()) return out;
  out.insurer = INSURERS.find((i) => i.test.test(text))?.name(text) ?? '';

  const plan = /\bplan\s*[:\-]?\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ+ ]{1,20}?)(?=\s*(?:\r?\n|$|[·,;]|\d))/i.exec(text);
  if (plan) out.plan = plan[1].trim();

  const labelled = /(?:\bpolic[ye]\b|\bpolice\b|\bcontrat\b|\bmember(?:ship)?\b|\bmembre\b|\badh[ée]rent\b)[^\n\d]{0,25}?(?:n[°o˚º]\.?|no\.?|number|num[ée]ro|#|:)?\s*([A-Z0-9][A-Z0-9 -]{4,19}\d)/i.exec(text);
  if (labelled) out.policyNumber = labelled[1].trim().replace(/\s+/g, ' ');

  const phones = [...text.matchAll(/(\+\d[\d\s().-]{7,18}\d)/g)].map((m) => ({ at: m.index ?? 0, value: m[1].trim() }));
  if (phones.length) {
    const label = /(?:emergency|urgence|urgences|hotline|24\s*h)/i.exec(text);
    const near = label ? phones.find((p) => p.at >= (label.index ?? 0)) : undefined;
    out.emergencyPhone = (near ?? phones[0]).value;
  }

  const dates = findDates(text);
  if (dates.length) {
    const after = (/** @type {RegExp} */ re) => {
      for (const m of text.normalize('NFD').replace(/[̀-ͯ]/g, '').matchAll(re)) {
        const start = m.index ?? 0;
        const hit = dates.find((d) => d.at >= start && d.at <= start + m[0].length + 3);
        if (hit) return hit.date;
      }
      return '';
    };
    out.expiresOn = after(/\b(?:expir\w*|valid(?:e|ity)?\s*(?:until|thru|through|to)|valable\s*jusqu\w*|until|jusqu\w*|exp\.?|end(?:s)?|fin)\b[^\n]{0,24}/gi);
    out.startsOn = after(/\b(?:start\w*|d[ée]but|effective|valid\s*from|from|depuis|du|begin\w*)\b[^\n]{0,24}/gi);
    const sorted = [...dates].map((d) => d.date).sort();
    if (!out.expiresOn && sorted.length > 1) out.expiresOn = sorted[sorted.length - 1];
    if (!out.startsOn && sorted.length > 1 && sorted[0] !== out.expiresOn) out.startsOn = sorted[0];
    if (!out.expiresOn && sorted.length === 1) out.expiresOn = sorted[0];
  }
  return out;
}
