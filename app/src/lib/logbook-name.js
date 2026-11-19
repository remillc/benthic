// @ts-check
// A logbook's name becomes its file name (task 2026-11-15-218, « Nouveau carnet »): « Mon carnet »
// gives `Mon carnet.ssrf`. Pure functions, so that node:test can run them.

/** The extension of a logbook file. */
export const LOGBOOK_EXTENSION = '.ssrf';

/** Longest name kept, before the extension and a « (2) » suffix (file systems stop at 255 bytes). */
export const MAX_NAME_LENGTH = 100;

/** Names Windows refuses, which a synchronised folder may meet. */
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * The name without the characters a file name cannot hold (`< > : " / \ | ? *`, control characters),
 * spaces collapsed, no space or dot at either end, cut to MAX_NAME_LENGTH. Empty when nothing is left.
 * @param {string} name
 * @returns {string}
 */
export function sanitiseLogbookName(name) {
  let clean = String(name)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '');
  if (clean.length > MAX_NAME_LENGTH) clean = clean.slice(0, MAX_NAME_LENGTH).replace(/[\s.]+$/g, '');
  if (RESERVED.test(clean)) clean = `${clean}_`;
  return clean;
}

/**
 * The file name for a logbook: the sanitised name plus `.ssrf`; when a file of that name already
 * exists (case ignored, as on most devices) « (2) », then « (3) »… is added before the extension.
 * @param {string} name what the diver typed
 * @param {string[]} existing the file names already in the OpenDives folder
 * @returns {string} '' when the name holds nothing a file name can keep
 */
export function logbookFileName(name, existing = []) {
  const base = sanitiseLogbookName(name);
  if (!base) return '';
  const taken = new Set(existing.map((f) => f.toLowerCase()));
  let candidate = base + LOGBOOK_EXTENSION;
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${base} (${n})${LOGBOOK_EXTENSION}`;
  return candidate;
}

/**
 * The name offered for an imported file: its name without the extension (`plongees.ssrf` gives
 * `plongees`); the fallback when nothing is left.
 * @param {string} fileName
 * @param {string} fallback
 * @returns {string}
 */
export function nameFromFile(fileName, fallback) {
  const base = String(fileName).replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, '').trim();
  return base || fallback;
}

/**
 * A name as a file-name slug: lowercase, accents removed, any run of characters other than a-z and 0-9 becomes
 * one `-`, none at either end. A trailing `.ssrf` is dropped first. Empty when nothing is left.
 * @param {string} name
 * @returns {string}
 */
export function slugify(name) {
  return String(name ?? '')
    .replace(/\.ssrf$/i, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * The file name of an export of the whole logbook: `<logbook name slug>-<YYYY-MM-DD>.ssrf`
 * (« Carnet de Roger » gives `carnet-de-roger-2026-11-19.ssrf`).
 * @param {string} name the logbook's name as the app shows it (a file name is accepted)
 * @param {string} day YYYY-MM-DD, the local date
 * @param {string} fallback the translated word for « logbook », used when the name leaves nothing
 * @returns {string}
 */
export function logbookExportName(name, day, fallback) {
  return `${slugify(name) || slugify(fallback) || 'logbook'}-${day}.ssrf`;
}

/** Today's local date as YYYY-MM-DD. @param {Date} [now] */
export function localDay(now = new Date()) {
  const p = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}
