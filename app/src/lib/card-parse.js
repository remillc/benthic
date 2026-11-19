// @ts-check
// What the text read on a card or a document suggests (task « card extraction », 19 Nov 2026). Pure JavaScript, no
// platform: the phone's scanner returns the recognised text (ML Kit / Vision) and these parsers propose field values from it.
// They only propose: every value is marked « à vérifier » in the screens, a field the diver typed is never overwritten, and a
// field is left '' when the text does not say it clearly. Tolerant to OCR noise (O/0, I/1, broken lines, capitals, accents,
// extra spaces). Sides of a card are read together: join their texts with `joinTexts`.

import { AGENCIES, LEVEL_SUGGESTIONS } from './profile.js';

/** The texts of several sides or pages, as one text. @param {...string} texts @returns {string} */
export function joinTexts(...texts) {
  return texts.filter((t) => t && t.trim()).join('\n');
}

/** Same length as the input: the accents are dropped, so that positions found in the folded text are valid in the original. @param {string} s */
const fold = (s) => s.normalize('NFC').normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC');

/**
 * Cleans the OCR text: one space between words, no empty line, no odd spaces.
 * @param {string} text
 * @returns {string}
 */
function clean(text) {
  return text
    .normalize('NFC')
    .replace(/\r/g, '')
    .replace(/[  -​\t]/g, ' ')
    .split('\n')
    .map((l) => l.replace(/ {2,}/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/** O, o, I, l, | read in place of digits inside something that looks like a date (« 1O/O3/2O19 »). @param {string} text */
function fixDateDigits(text) {
  return text.replace(/(?<![A-Za-z0-9])[0-9OoIl|]{1,4}(?:[/.\-][0-9OoIl|]{1,4}){1,2}(?![A-Za-z0-9])/g, (token) => ((token.match(/\d/g) ?? []).length >= 3 ? token.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1') : token));
}

/** A text ready for the matching: cleaned, digits repaired in dates, accents folded. @param {string} text @returns {{ orig: string, flat: string }} */
function prepare(text) {
  const orig = fixDateDigits(clean(text));
  return { orig, flat: fold(orig) };
}

// ---------------------------------------------------------------- dates

/** @type {Record<string, number>} */
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
  return y >= 1950 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31 && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s) ? s : '';
}

/** @param {number} y @param {number} m @returns {number} the number of days in the month */
const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** @typedef {{ at: number, end: number, date: string, month: boolean }} Found */

/**
 * Every date of a folded text, in the order written; `month` is true when only the month and year are written (the day is then
 * the first, or the last for an expiry).
 * @param {string} flat
 * @returns {Found[]}
 */
function scanDates(flat) {
  /** @type {Found[]} */
  const found = [];
  /** @param {RegExpMatchArray} m @param {string} date @param {boolean} [month] */
  const add = (m, date, month = false) => {
    const at = m.index ?? 0;
    const end = at + m[0].length;
    if (date && !found.some((f) => at < f.end && end > f.at)) found.push({ at, end, date, month });
  };
  for (const m of flat.matchAll(/(?<![\d/.-])(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?![\d/])/g)) add(m, iso(+m[1], +m[2], +m[3]));
  for (const m of flat.matchAll(/(?<![\d/.-])(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{4}|\d{2})(?![\d/])/g)) {
    const [a, b] = [+m[1], +m[2]];
    add(m, b > 12 ? iso(+m[3], a, b) : iso(+m[3], b, a));
  }
  for (const m of flat.matchAll(/(?<!\d)(\d{1,2})(?:st|nd|rd|th|er)?[-. ]*([a-z]{3,9})\.?[-,. ']*(\d{4}|\d{2})(?!\d)/gi)) {
    const month = MONTHS[m[2].toLowerCase()];
    add(m, month ? iso(+m[3], month, +m[1]) : '');
  }
  for (const m of flat.matchAll(/(?<![a-z])([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})(?!\d)/gi)) {
    const month = MONTHS[m[1].toLowerCase()];
    add(m, month ? iso(+m[3], month, +m[2]) : '');
  }
  for (const m of flat.matchAll(/(?<![\d/.-])(\d{1,2})[/.-](\d{4})(?![\d/])/g)) add(m, iso(+m[2], +m[1], 1), true);
  for (const m of flat.matchAll(/(?<![a-z])([a-z]{3,9})\.?[ ,-]+(\d{4})(?!\d)/gi)) {
    const month = MONTHS[m[1].toLowerCase()];
    add(m, month ? iso(+m[2], month, 1) : '', true);
  }
  return found.sort((x, y) => x.at - y.at);
}

/** The words that say what a date is, on the folded, lower-cased text. */
const DATE_LABELS = {
  birth: /date\s*of\s*birth|birth\s*date|\bborn\b|\bdob\b|\bd\.?o\.?b\b|\bnee?\(?e?\)?\s*le\b|naissance|geburt/g,
  expiry: /expir\w*|\bvalid(?:e|ity)?\s*(?:until|till|thru|through|to|jusqu\w*)|validit\w*|valab\w*\s*(?:jusqu\w*|au|until)|valide\s*jusqu\w*|jusqu\w*|\buntil\b|good\s*thru|\bexp\b\.?|end\s*date|date\s*de\s*fin|echeance|renouvel\w*|renewal|\bto\b|\bau\b/g,
  start: /\bstart\w*|\bdebut\b|\beffective\b|valid\s*from|\bfrom\b|\bdepuis\b|\bdu\b|\bbegin\w*|date\s*d.?effet|prise\s*d.?effet|inception/g,
  issue: /date\s*of\s*(?:issue|certification|qualification|completion|exam\w*)|date\s*d.?(?:obtention|emission|delivrance|examen)|\bissued?\b|issue\s*date|\bdelivre\w*|\bemis(?:e)?\b|\bcertified\b|\bcompleted\b|\bobtained\b|\bobtenu\b|\bfait\s*le\b|\betabli\w*\s*le\b|\bexamin\w*|\bdate\b|\bqualified\b|\bawarded\b/g,
};

/** @typedef {'birth'|'expiry'|'start'|'issue'|''} DateRole */
/** @typedef {Found & { role: DateRole }} Dated */

/**
 * Every date with its role, from the words written just before it (up to 36 characters, back to the previous date).
 * @param {string} flat the folded text
 * @returns {Dated[]}
 */
function datesWithRoles(flat) {
  const lower = flat.toLowerCase();
  const found = scanDates(flat);
  return found.map((f, i) => {
    const from = Math.max(i ? found[i - 1].end : 0, f.at - 36);
    const window = lower.slice(from, f.at);
    /** @type {DateRole} */
    let role = '';
    let best = -1;
    for (const key of /** @type {const} */ (['birth', 'expiry', 'start', 'issue'])) {
      for (const m of window.matchAll(DATE_LABELS[key])) {
        const end = (m.index ?? 0) + m[0].length;
        if (end >= best) {
          best = end;
          role = key;
        }
      }
    }
    return { ...f, role };
  });
}

/** The date as the field holds it: the last day of the month for an expiry written « 12/2027 ». @param {Dated} d @returns {string} */
function expiryOf(d) {
  if (!d.month) return d.date;
  const [y, m] = d.date.split('-').map(Number);
  return iso(y, m, daysIn(y, m));
}

/**
 * The issue date on a card: a date after a label (« Date », « Issued », « Délivré le ») first, else the first date
 * found that is not in the future, not a birth date and not an expiry. Reads « 12 JUN 2015 », « 12 juin 2015 »,
 * « June 12, 2015 », « 12/06/2015 » (day first unless the second number cannot be a month), « 2015-06-12 », « 06/2015 ».
 * @param {string} text
 * @param {string} today YYYY-MM-DD
 * @returns {string} YYYY-MM-DD, '' when none
 */
export function findDate(text, today) {
  const dates = datesWithRoles(prepare(text).flat).filter((d) => d.date <= today && d.role !== 'birth' && d.role !== 'expiry');
  return (dates.find((d) => d.role === 'issue') ?? dates.find((d) => d.role === '') ?? dates[0])?.date ?? '';
}

/**
 * Every real date in a text, in the order they are written (an expiry date is in the future, which `findDate` leaves out).
 * @param {string} text
 * @returns {{ at: number, date: string }[]}
 */
export function findDates(text) {
  return scanDates(prepare(text).flat).map((f) => ({ at: f.at, date: f.date }));
}

/** @param {string} date YYYY-MM-DD @param {number} months @returns {string} */
function addMonths(date, months) {
  const [y, m, d] = date.split('-').map(Number);
  const total = m - 1 + months;
  const year = y + Math.floor(total / 12);
  const month = (total % 12) + 1;
  return iso(year, month, Math.min(d, daysIn(year, month)));
}

// ---------------------------------------------------------------- codes, phones, names

/**
 * A number or code at the start of a string: letters, digits, dashes and slashes, then groups of digits.
 * `O` and `I` read inside a number that is nearly all digits are repaired.
 * @param {string} rest folded text after a label
 * @returns {string} '' when what follows is not a number (fewer than 4 digits, a date, a phone)
 */
function takeCode(rest) {
  const m = /^[\s:#.\-–]*([A-Z0-9][A-Z0-9\-/]+(?: [0-9]{2,}[A-Z0-9\-/]*){0,3})/i.exec(rest);
  if (!m) return '';
  let token = m[1].replace(/[-/ ]+$/, '');
  const digits = (token.match(/\d/g) ?? []).length;
  const letters = token.replace(/[^A-Za-z]/g, '');
  if (digits >= 5 && letters && /^[OIl]+$/.test(letters) && letters.length <= 2) token = token.replace(/[Oo]/g, '0').replace(/[Il]/g, '1');
  const count = (token.match(/\d/g) ?? []).length;
  if (count < 4 || token.length > 22 || token.length < 4) return '';
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(token) || /^(19|20)\d{2}$/.test(token)) return '';
  return token.toUpperCase();
}

/** Words that are never a person's name. */
const NOT_NAME = /^(?:name|nom|no|number|numero|level|niveau|diver|plongeur|scuba|open|water|course|cours|development|trainer|examiner|instructor|instructeur|moniteur|certification|certificat|card|carte|date|issued|delivre|signature|signed|cabinet|clinique|centre|center|hopital|medical|medicale|medecin|docteur|doctor|physician|diving|dive|international|association|federation|club|school|ecole|le|la|les|du|des|de|the|and|et|of|by|par|est|apte|certifie|certify|member|membre|padi|ssi|naui|cmas|ffessm|bsac|sdi|tdi|gue|iantd)$/i;

/** @param {string} s */
const titleCase = (s) =>
  s
    .toLocaleLowerCase()
    .replace(/(^|[\s'’-])(\p{L})/gu, (_, sep, c) => sep + c.toLocaleUpperCase())
    .replace(/\s(De|Du|Des|La|Le|Van|Von|Der|Den|Da|Di)(?=\s)/g, (w) => w.toLocaleLowerCase());

/**
 * A person's name at the start of a text: two to four capitalised (or upper-case) words. Written case is fixed to « Jean Dupont ».
 * @param {string} rest
 * @returns {string} '' when what follows is not a name
 */
function takeName(rest) {
  const m = /^[\s:.\-–]*((?:[A-ZÀ-ÖØ-Þ][\p{L}'’-]+)(?:[ ](?:[a-z]{2,3}[ ])?[A-ZÀ-ÖØ-Þ][\p{L}'’-]+){0,3})/u.exec(rest);
  if (!m) return '';
  const words = m[1].split(' ');
  const kept = [];
  for (const w of words) {
    if (NOT_NAME.test(fold(w)) && !/^(?:de|du|van|von|la|le|da|di)$/i.test(w)) break;
    kept.push(w);
  }
  while (kept.length && /^(?:de|du|van|von|la|le|da|di)$/i.test(kept[kept.length - 1])) kept.pop();
  const real = kept.filter((w) => !/^(?:de|du|van|von|la|le|da|di)$/i.test(w));
  return real.length >= 2 || (real.length === 1 && real[0].length >= 3 && kept.length === 1 && false) ? titleCase(kept.join(' ')) : '';
}

/**
 * The first international phone number, the one after an emergency word first.
 * @param {string} orig
 * @param {string} flat
 * @returns {string} « +33 1 23 45 67 89 », '' when none
 */
function findPhone(orig, flat) {
  const all = [...orig.matchAll(/(?<![\w])(\+|00)[\s.]*(\d[\d\s().\-]{6,22}\d)/g)]
    .map((m) => {
      const digits = m[2].replace(/\(0\)/g, '').replace(/\D/g, '');
      const text = `+${m[2].replace(/\(0\)/g, ' ').replace(/[().]/g, ' ').replace(/\s{2,}/g, ' ').trim()}`;
      return { at: m.index ?? 0, digits: digits.length, text };
    })
    .filter((p) => p.digits >= 7 && p.digits <= 14);
  if (!all.length) return '';
  const label = /(?:emergency|urgence|urgences|hotline|helpline|24\s*h|24\/7|assistance|alarm|alert)/i.exec(flat);
  return (label ? all.find((p) => p.at >= (label.index ?? 0)) : undefined)?.text ?? all[0].text;
}

// ---------------------------------------------------------------- certification cards

/** Words that name an agency on a card, besides its id (case-sensitive where a lower-case word would be common). @type {{ id: string, name?: string, re: RegExp }[]} */
const AGENCY_WORDS = [
  { id: 'PADI', re: /\bPADI\b|professional association of diving/gi },
  { id: 'SSI', re: /\bSSI\b|scuba schools international/gi },
  { id: 'NAUI', re: /\bNAUI\b|national association of underwater/gi },
  { id: 'FFESSM', re: /\bFFESSM\b|f[ée]d[ée]ration fran[cç]aise d.{0,3}[ée]tudes et de sports sous|\bCODEP\b|\bCOREG\b|\bCODEP[ -]?\d{2}\b/gi },
  { id: 'CMAS', re: /\bCMAS\b|conf[ée]d[ée]ration mondiale des activit/gi },
  { id: 'BSAC', re: /\bBSAC\b|british sub-?aqua/gi },
  { id: 'TDI', re: /\bTDI\b|technical diving international/gi },
  { id: 'SDI', re: /\bSDI\b|scuba diving international/gi },
  { id: 'IANTD', re: /\bIANTD\b|international association of nitrox and technical/gi },
  { id: 'GUE', re: /\bGUE\b|global underwater explorers/gi },
  { id: 'PDIC', re: /\bPDIC\b|professional diving instructors corporation/gi },
  { id: 'ACUC', re: /\bACUC\b|american canadian underwater certifications/gi },
  { id: 'other', name: 'RAID', re: /\bRAID\b|rescue advanced diver/g },
  { id: 'other', name: 'PSS', re: /\bPSS\b|professional scuba schools/g },
  { id: 'other', name: 'ANMP', re: /\bANMP\b|association nationale des moniteurs de plong[ée]e/g },
];

/**
 * The levels, as the words a card prints. One entry per level of `LEVEL_SUGGESTIONS`; the pattern runs on the folded, lower-case
 * text where every other character is a space (« Stress & Rescue » is « stress rescue »).
 * @type {[string, RegExp][]}
 */
const LEVEL_WORDS = [
  ['Open Water Diver', /\bopen water(?: scuba)?(?: diver)?\b|\bow diver\b|\bowd\b/],
  ['Open Water Scuba Diver', /\bopen water(?: scuba)?(?: diver)?\b|\bow diver\b/],
  ['Scuba Diver', /\bscuba diver\b/],
  ['Advanced Adventurer', /\badvanced adventurer\b/],
  ['Advanced Open Water Diver', /\badvanced open water(?: diver)?\b|\baow(?:d)?\b/],
  ['Advanced Diver', /\badvanced(?: adventure)? diver\b|\badvanced adventure\b/],
  ['Advanced Scuba Diver', /\badvanced scuba diver\b/],
  ['Rescue Diver', /\brescue diver\b|\brescue\b/],
  ['Rescue Scuba Diver', /\brescue scuba diver\b|\brescue diver\b/],
  ['Rescue Diver, Emergency First Response', /\brescue diver\b.{0,40}\b(?:emergency first response|efr)\b/],
  ['Stress & Rescue (Sauveteur)', /\bstress (?:and )?rescue\b|\bsauveteur\b/],
  ['Enriched Air Diver (Nitrox)', /\benriched air(?: diver)?(?: nitrox)?\b|\bnitrox\b|\beanx\b/],
  ['Enriched Air Nitrox', /\benriched air(?: diver)?(?: nitrox)?\b|\bnitrox\b|\beanx\b/],
  ['Nitrox Diver', /\bnitrox(?: diver)?\b|\benriched air\b/],
  ['Advanced Nitrox Diver', /\badvanced nitrox(?: diver)?\b/],
  ['Advanced Nitrox', /\badvanced nitrox\b/],
  ['Open Circuit Nitrox', /\bopen circuit nitrox\b|\boc nitrox\b|\bnitrox(?: diver)?\b/],
  ['Deep Diver', /\bdeep diver\b|\bdeep\b/],
  ['Deep Diving', /\bdeep diving\b|\bdeep\b/],
  ['Divemaster', /\bdive ?master\b|\bdm\b/],
  ['Master Scuba Diver', /\bmaster scuba diver\b|\bmsd\b/],
  ['Master Diver', /\bmaster diver\b/],
  ['Tec 40', /\btec ?40\b/],
  ['Tec 45', /\btec ?45\b/],
  ['Tec 50', /\btec ?50\b/],
  ['1 star diver', /\b(?:1|one) stars?(?: diver)?\b|\b1 etoiles?\b/],
  ['2 star diver', /\b(?:2|two) stars?(?: diver)?\b|\b2 etoiles?\b/],
  ['3 star diver', /\b(?:3|three) stars?(?: diver)?\b|\b3 etoiles?\b/],
  ['Instructor 1 star', /\binstructor (?:1|one) stars?\b|\bmoniteur 1 etoiles?\b/],
  ['Niveau 1', /\bniveau (?:1|i|un)\b|\bniv 1\b|\bn1\b|\bplongeur (?:1|une) etoiles?\b|\b1 etoiles?\b/],
  ['Niveau 2', /\bniveau (?:2|ii|deux)\b|\bniv 2\b|\bn2\b|\bplongeur (?:2|deux) etoiles?\b|\b2 etoiles?\b/],
  ['Niveau 3', /\bniveau (?:3|iii|trois)\b|\bniv 3\b|\bn3\b|\bplongeur (?:3|trois) etoiles?\b|\b3 etoiles?\b/],
  ['Niveau 4', /\bniveau (?:4|iv|quatre)\b|\bniv 4\b|\bn4\b/],
  ['Plongeur Nitrox', /\bplongeur nitrox\b|\bnitrox\b|\bnx\b/],
  ['Plongeur Nitrox confirmé', /\bnitrox confirme\b|\bnx confirme\b|\bplongeur nitrox confirme\b/],
  ['Initiateur', /\binitiat(?:eur|rice)\b/],
  ['MF1', /\bmf ?1\b|\bmoniteur federal (?:1|1er degre|premier degre)\b|\bmoniteur 1er degre\b/],
  ['MF2', /\bmf ?2\b|\bmoniteur federal (?:2|2eme degre|deuxieme degre)\b|\bmoniteur 2eme degre\b/],
  ['Ocean Diver', /\bocean diver\b/],
  ['Sport Diver', /\bsport diver\b/],
  ['Dive Leader', /\bdive leader\b/],
  ['First Class Diver', /\bfirst class(?: diver)?\b/],
  ['Solo Diver', /\bsolo diver\b|\bsolo\b/],
  ['Decompression Procedures', /\bdecompression procedures\b|\bdeco procedures\b|\bdecompression\b/],
  ['Extended Range', /\bextended range\b|\bextended\b/],
  ['Trimix Diver', /\btrimix\b/],
  ['Technical Decompression', /\btechnical decompression\b|\btech decompression\b|\btec deco\b/],
  ['Normoxic Trimix', /\bnormoxic(?: trimix)?\b/],
  ['Fundamentals', /\bfundamentals?\b/],
  ['Recreational Diver 1', /\brecreational(?: diver)?(?: level)? (?:1|i)\b|\brec ?1\b/],
  ['Recreational Diver 2', /\brecreational(?: diver)?(?: level)? (?:2|ii)\b|\brec ?2\b/],
  ['Tech 1', /\btech(?:nical)?(?: diver)?(?: level)? ?(?:1|i)\b/],
  ['Tech 2', /\btech(?:nical)?(?: diver)?(?: level)? ?(?:2|ii)\b/],
];

/** A text for the level words: asterisks read as stars, every other character a space. @param {string} flat */
function wordsOf(flat) {
  return ` ${flat
    .toLowerCase()
    .replace(/\*{3}/g, ' 3 star ')
    .replace(/\*{2}/g, ' 2 star ')
    .replace(/\*/g, ' 1 star ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `;
}

/**
 * The longest level of an agency's list the words name.
 * @param {string} words from `wordsOf`
 * @param {string[]} pool level names
 * @returns {{ level: string, size: number, tie: boolean }} `tie` when two levels are named equally well
 */
function bestLevel(words, pool) {
  let best = { level: '', size: 0, tie: false };
  for (const level of pool) {
    const re = LEVEL_WORDS.find(([name]) => name === level)?.[1];
    const exact = ` ${level.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
    const size = Math.max(re ? (re.exec(words)?.[0].length ?? 0) : 0, words.includes(exact) ? exact.trim().length : 0);
    if (size > best.size) best = { level, size, tie: false };
    else if (size && size === best.size && level !== best.level) best.tie = true;
  }
  return best;
}

/** Labels that precede an instructor's name or number: only with a colon or a dash, so that « Open Water Scuba Instructor » is not one. */
const INSTRUCTOR_LABEL = /\b(?:instructor|instructeur|instructrice|moniteur|monitrice|instr\.?|inst\.?)(?:\s*(?:name|nom|no\.?|n[°º˚]|number|numero|#))?\s*[:\-–]|\b(?:certified|issued|signed|emis(?:e)?|delivre(?:e)?)\s*by\b|\b(?:delivre(?:e)?|certifie(?:e)?)\s*par\b/gi;

/**
 * The instructor's name and number when printed.
 * @param {string} orig @param {string} flat
 * @returns {{ name: string, number: string, lines: Set<number> }} `lines` are the lines that are the instructor's (not the diver's number)
 */
function findInstructor(orig, flat) {
  const lines = orig.split('\n');
  const flatLines = flat.split('\n');
  /** @type {Set<number>} */
  const mine = new Set();
  let name = '';
  let number = '';
  flatLines.forEach((line, i) => {
    for (const m of line.matchAll(INSTRUCTOR_LABEL)) {
      mine.add(i);
      const at = (m.index ?? 0) + m[0].length;
      const after = lines[i].slice(at);
      const numberLabel = /^\s*(?:no|n[°º˚o]|number|numero|#|id|cert\w*)\b\.?\s*[:#.\-]?\s*/i.exec(fold(after));
      if (/(?:\bno\.?|n[°º˚]|number|numero|#)\s*[:\-–]$/i.test(m[0])) {
        number ||= takeCode(after) || takeCode(fold(lines[i + 1] ?? ''));
        continue;
      }
      if (numberLabel) {
        number ||= takeCode(fold(after).slice(numberLabel[0].length)) || takeCode(fold(lines[i + 1] ?? ''));
        continue;
      }
      let found = takeName(after);
      if (!found && !after.trim() && lines[i + 1]) {
        found = takeName(lines[i + 1]);
        if (found) mine.add(i + 1);
      }
      if (found && !name) {
        name = found;
        const tail = fold(after.slice(after.indexOf(found.split(' ')[0]) + found.length));
        const n = /(?:#|\bno\.?|n[°º˚]|number|numero|\bid\b)\s*[:.]?\s*([A-Z0-9][A-Z0-9\- ]{3,14})/i.exec(tail) ?? /\b(\d{5,10})\b/.exec(tail);
        if (n) number ||= takeCode(n[1]) || '';
      }
    }
  });
  return { name, number, lines: mine };
}

/** The labels that precede a card's number. */
const NUMBER_LABEL = /(?:\b(?:diver|cert(?:ification|ificate)?|card|member(?:ship)?|licen[cs]e|licence|brevet|diplome|passport|id|ref(?:erence)?)\s*(?:no|n[°º˚o]|nr|num(?:ber|ero)?|#|id)?|\bn[°º˚]|\bno\b|\bnr\b|\bnum(?:ber|ero)?\b|#)\s*\.?\s*[:#.\-–]?/gi;

/**
 * The agency, level, number, issue date and instructor a certification card's text suggests.
 * @param {string} text the recognised text, lines separated by line breaks (both sides together when both were scanned)
 * @param {string} [today] YYYY-MM-DD; a date after it is not proposed (an expiry date, a misreading)
 * @returns {{ agency: string, agencyName: string, level: string, number: string, issuedOn: string, instructor: string, instructorNumber: string }} '' for what is not found; `agencyName` only for an agency that is not in the list (« other »)
 */
export function parseCardText(text, today = new Date().toISOString().slice(0, 10)) {
  const out = { agency: '', agencyName: '', level: '', number: '', issuedOn: '', instructor: '', instructorNumber: '' };
  if (!text || !text.trim()) return out;
  const { orig, flat } = prepare(text);
  out.issuedOn = findDate(text, today);

  // The agency: the one named most often; on a tie, the one whose level is on the card, then the order of the list (« SDI TDI ERDI » footers).
  const words = wordsOf(flat);
  const scored = AGENCY_WORDS.map((a, order) => ({ ...a, order, count: (flat.match(a.re) ?? []).length })).filter((a) => a.count);
  if (scored.length) {
    const top = Math.max(...scored.map((a) => a.count));
    const leaders = scored.filter((a) => a.count === top);
    const withLevel = leaders.map((a) => ({ a, size: a.id === 'other' ? 0 : bestLevel(words, LEVEL_SUGGESTIONS[a.id] ?? []).size }));
    const winner = withLevel.sort((x, y) => y.size - x.size || x.a.order - y.a.order)[0].a;
    // ANMP next to the FFESSM is the FFESSM's own wording.
    out.agency = winner.id;
    if (winner.id === 'other') out.agencyName = winner.name ?? '';
  }

  // The level: the longest named level of the agency (or of any agency, when none is clear and only one level wins).
  if (out.agency && out.agency !== 'other') out.level = bestLevel(words, LEVEL_SUGGESTIONS[out.agency] ?? []).level;
  else if (!out.agency) {
    const all = [...new Set(Object.values(LEVEL_SUGGESTIONS).flat())];
    const best = bestLevel(words, all);
    if (!best.tie) out.level = best.level;
  }

  // The instructor, then the card's number outside the instructor's lines.
  const instructor = findInstructor(orig, flat);
  out.instructor = instructor.name;
  out.instructorNumber = instructor.number;
  const flatLines = flat.split('\n');
  const own = flatLines.filter((_, i) => !instructor.lines.has(i));
  const ownFlat = own.join('\n');
  for (const m of ownFlat.matchAll(NUMBER_LABEL)) {
    const at = (m.index ?? 0) + m[0].length;
    const lineEnd = ownFlat.indexOf('\n', at);
    const rest = ownFlat.slice(at, lineEnd < 0 ? undefined : lineEnd);
    const code = takeCode(rest) || (!rest.replace(/[\s:#.\-–]/g, '') ? takeCode(ownFlat.slice(lineEnd + 1).split('\n')[0] ?? '') : '');
    if (code) {
      out.number = code;
      break;
    }
  }
  if (!out.number) {
    // A line that is only a code with at least four digits, the ones with letters and digits first.
    const codes = own
      .map((l) => l.trim())
      .filter((l) => /^[A-Z0-9][A-Z0-9\-/ ]{4,21}$/i.test(l) && (l.match(/\d/g) ?? []).length >= 4 && !/^\d{1,2}[ /.-]\d{1,2}[ /.-]\d{2,4}$/.test(l) && !scanDates(l).length && /\d/.test(l) && (!/^[A-Z ]+$/i.test(l)))
      .map((l) => l.toUpperCase().replace(/\s+/g, ' '));
    if (codes.length) out.number = codes.sort((a, b) => Number(/[A-Z]/.test(b)) - Number(/[A-Z]/.test(a)))[0];
  }
  return out;
}

// ---------------------------------------------------------------- insurance

/** The diving insurers a card names. @type {{ test: RegExp, name: (text: string) => string }[]} */
const INSURERS = [
  {
    test: /\bDAN\b|divers alert network/i,
    name: (text) => (/canada/i.test(text) ? 'DAN Canada' : /europe/i.test(text) ? 'DAN Europe' : /asia.?pacific/i.test(text) ? 'DAN Asia-Pacific' : /southern africa/i.test(text) ? 'DAN Southern Africa' : /\bamerica|\busa\b|\bu\.s\./i.test(text) ? 'DAN America' : /\bworld/i.test(text) ? 'DAN World' : 'DAN'),
  },
  { test: /aqua\s?med/i, name: () => 'Aquamed' },
  { test: /dive\s*master\s*insurance|divemaster\s*insurance/i, name: () => 'Divemaster Insurance' },
  { test: /\bAXA\b/i, name: () => 'AXA' },
  { test: /\bAllianz\b/i, name: () => 'Allianz' },
  { test: /dive\s*assure|diveassure/i, name: () => 'DiveAssure' },
  { test: /\bHiscox\b/i, name: () => 'Hiscox' },
  { test: /\bGenerali\b/i, name: () => 'Generali' },
  { test: /\bAgeas\b/i, name: () => 'Ageas' },
  { test: /\bGroupama\b/i, name: () => 'Groupama' },
  { test: /\bMMA\b/, name: () => 'MMA' },
  { test: /\bLafont\b/i, name: () => 'Lafont' },
  { test: /\bPADI\b.*insurance|dive insurance/i, name: () => 'PADI Dive Insurance' },
];

const PLAN_NAMES = /\b(preferred plus|preferred|master|basic|family|silver|gold|platinum|premium|standard|classic|diver plus|plus|sport|tech|lifetime)\b/i;

/** The labels that precede a policy or member number. */
const POLICY_LABEL = /(?:\b(?:polic(?:y|e)|contrat|contract|member(?:ship)?|membre|adherent|certificate|certificat|dan|id|assur\w*)\s*(?:no|n[°º˚o]|nr|number|numero|num|#|id)?)\s*\.?\s*[:#.\-–]?/gi;

/**
 * What an insurance card's text suggests: the insurer, the plan, the policy number, the emergency phone and the dates. It
 * only proposes; the diver checks every value.
 * @param {string} text the recognised text, lines separated by line breaks
 * @returns {{ insurer: string, plan: string, policyNumber: string, emergencyPhone: string, startsOn: string, expiresOn: string }} '' for what is not found
 */
export function parseInsuranceText(text) {
  const out = { insurer: '', plan: '', policyNumber: '', emergencyPhone: '', startsOn: '', expiresOn: '' };
  if (!text || !text.trim()) return out;
  const { orig, flat } = prepare(text);
  out.insurer = INSURERS.find((i) => i.test.test(flat))?.name(flat) ?? '';

  const plan = /\b(?:plan|formule|garantie|coverage|couverture|programme?|membership type|type d.adhesion|option)\s*[:\-–]?\s*([A-Za-z][A-Za-z+ ]{1,24}?)(?=\s*(?:\n|$|[·,;|]|\d|\bvalid|\bexp))/i.exec(orig);
  if (plan && !/^(?:no|number|numero|n)\b/i.test(plan[1])) out.plan = plan[1].trim().replace(/\s+/g, ' ');
  if (!out.plan) {
    const line = flat.split('\n').find((l) => /member|adhes|formule|cover|plan\b|membre/i.test(l) && PLAN_NAMES.test(l));
    const known = line && PLAN_NAMES.exec(line);
    if (known) out.plan = known[1].replace(/\b\w/g, (c) => c.toUpperCase());
  }

  for (const m of flat.matchAll(POLICY_LABEL)) {
    const at = (m.index ?? 0) + m[0].length;
    const lineEnd = flat.indexOf('\n', at);
    const rest = flat.slice(at, lineEnd < 0 ? undefined : lineEnd);
    // The code may follow filler words (« Member · Sport · no 884 »): take the first code on the line after the label.
    const inLine = /(?:^|[^A-Z0-9])((?:[A-Z]{0,4}[-/]?)?\d[A-Z0-9\-/]*(?: \d{2,}[A-Z0-9\-/]*){0,3})/i.exec(rest);
    const code = (inLine && takeCode(inLine[1])) || (!rest.replace(/[\s:#.\-–]/g, '') ? takeCode(flat.slice(lineEnd + 1).split('\n')[0] ?? '') : '');
    if (code && !/^\+/.test(rest.trim())) {
      out.policyNumber = code;
      break;
    }
  }

  out.emergencyPhone = findPhone(orig, flat);

  const dates = datesWithRoles(flat).filter((d) => d.role !== 'birth');
  const expiry = dates.find((d) => d.role === 'expiry');
  const start = dates.find((d) => d.role === 'start' || d.role === 'issue');
  if (expiry) out.expiresOn = expiryOf(expiry);
  if (start && start !== expiry) out.startsOn = start.date;
  const rest = dates.filter((d) => d !== expiry && d !== start && d.role === '');
  if (!out.expiresOn && rest.length) {
    out.expiresOn = expiryOf(rest[rest.length - 1]);
    rest.pop();
  }
  if (!out.startsOn && rest.length && rest[0].date < (out.expiresOn || '9999')) out.startsOn = rest[0].date;
  return out;
}

// ---------------------------------------------------------------- medical certificate

const FIT = /\b(?:apte|aptitude|fit\s*to\s*dive|fit\s*for\s*diving|no\s*contra-?indications?|absence\s*de\s*contre[\s-]*indications?|aucune\s*contre[\s-]*indications?|pas\s*de\s*contre[\s-]*indications?|ne\s*presente\s*pas\s*de\s*contre)/i;
const UNFIT = /\b(?:inapte|inaptitude|unfit|not\s*fit)\b/i;
/** @type {Record<string, number>} */
const COUNT_WORDS = { un: 1, une: 1, one: 1, deux: 2, two: 2, trois: 3, three: 3 };

/**
 * What a medical certificate's text suggests: the doctor, the date, the expiry (written, or « valable un an ») and whether it
 * says the diver is fit. A certificate that says the diver is unfit proposes nothing.
 * @param {string} text
 * @param {string} [today] YYYY-MM-DD
 * @returns {{ doctor: string, issuedOn: string, expiresOn: string, fit: boolean }}
 */
export function parseMedicalText(text, today = new Date().toISOString().slice(0, 10)) {
  const out = { doctor: '', issuedOn: '', expiresOn: '', fit: false };
  if (!text || !text.trim()) return out;
  const { orig, flat } = prepare(text);
  if (UNFIT.test(flat) && !/\bnot\s*unfit\b/i.test(flat)) return out;
  out.fit = FIT.test(flat);

  for (const m of flat.matchAll(/\b(dr|docteur|doctor|dre|medecin|physician|pr|professeur)\b\.?(?:\s*(?:name|nom))?\s*[:.]?\s*/gi)) {
    const at = (m.index ?? 0) + m[0].length;
    const name = takeName(orig.slice(at));
    if (name) {
      out.doctor = `${/^(?:pr|professeur)$/i.test(m[1]) ? 'Pr' : 'Dr'} ${name}`;
      break;
    }
  }

  const dates = datesWithRoles(flat).filter((d) => d.role !== 'birth');
  const expiry = dates.find((d) => d.role === 'expiry');
  const issued = dates.filter((d) => d !== expiry && d.date <= today);
  const issue = issued.find((d) => d.role === 'issue') ?? issued.find((d) => d.role === '' || d.role === 'start');
  if (issue) out.issuedOn = issue.date;
  if (expiry) out.expiresOn = expiryOf(expiry);
  else if (issue) {
    const v = /(?:valable|valide|validite|valid(?:ity)?)\s*(?:pour|for|:|de)?\s*(\d{1,2}|un|une|one|deux|two|trois|three)\s*(ans?|annees?|mois|months?|years?)/i.exec(flat);
    if (v) {
      const n = COUNT_WORDS[v[1].toLowerCase()] ?? Number(v[1]);
      out.expiresOn = addMonths(issue.date, /mois|month/i.test(v[2]) ? n : n * 12);
    }
  }
  return out;
}

// ---------------------------------------------------------------- other documents

/**
 * What the text of another document suggests: a title (its heading) and an expiry date written with its label. Nothing else is
 * proposed; a date without a label is left to the diver.
 * @param {string} text
 * @returns {{ title: string, number: string, expiresOn: string }}
 */
export function parseOtherText(text) {
  const out = { title: '', number: '', expiresOn: '' };
  if (!text || !text.trim()) return out;
  const { orig, flat } = prepare(text);
  const lines = orig.split('\n');
  for (const line of lines.slice(0, 4)) {
    const f = fold(line);
    const letters = (f.match(/[A-Za-z]/g) ?? []).length;
    const digits = (f.match(/\d/g) ?? []).length;
    const wordCount = f.split(/\s+/).filter((w) => /[A-Za-z]{2,}/.test(w)).length;
    if (letters < 8 || wordCount < 2 || line.length > 60 || digits > 3) continue;
    if (/\b(?:date|name|nom|prenom|no|numero|n°|born|naissance|valid|expir|tel|phone|www|http|@)\b/i.test(f) || scanDates(f).length) continue;
    out.title = line === line.toLocaleUpperCase() ? line.charAt(0) + line.slice(1).toLocaleLowerCase() : line;
    break;
  }
  const expiry = datesWithRoles(flat).find((d) => d.role === 'expiry');
  if (expiry) out.expiresOn = expiryOf(expiry);
  for (const m of flat.matchAll(NUMBER_LABEL)) {
    const at = (m.index ?? 0) + m[0].length;
    const lineEnd = flat.indexOf('\n', at);
    const code = takeCode(flat.slice(at, lineEnd < 0 ? undefined : lineEnd));
    if (code) {
      out.number = code;
      break;
    }
  }
  return out;
}

export { AGENCIES };
