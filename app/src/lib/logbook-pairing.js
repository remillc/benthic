// @ts-check
// Pairing a piece of equipment with what the logbook already holds (task 2026-11-26-405): the dive computers found in the
// dives (model, serial number) and the free text of each dive's « Combinaison » field. A piece is tied to a computer by
// `computerModel` and `computerSerial` (as a download does), to suits by `suitNames`, the logbook's texts, kept in the
// piece's file so the links are synced with the inventory. A logbook value is tied to at most one piece. Pure functions.
import { modelKey, serialKey, sameComputer } from './dc-model.js';

/** @typedef {import('./inventory.js').Gear} Gear */

/**
 * A dive computer of the logbook.
 * @typedef {Object} LogbookComputerItem
 * @property {string} model
 * @property {string} serial
 * @property {number} dives
 * @property {number} [first] the year of its first dive
 * @property {number} [last] the year of its latest dive
 * @property {string} [linkedTo] the id of the piece that already has it
 */

/**
 * A suit text of the logbook.
 * @typedef {Object} LogbookSuitItem
 * @property {string} name the text as the dives hold it
 * @property {number} dives
 * @property {number} [first]
 * @property {number} [last]
 * @property {string} [linkedTo] the id of the piece that already has it
 */

/** A suit text as comparable text: trimmed, lower case. @param {string} name */
export const suitKey = (name) => String(name ?? '').trim().toLowerCase();

/** The key under which the dives of a suit text are counted in the map of `computerDiveCounts`. @param {string} name */
export const suitCountKey = (name) => `suit\u0000${suitKey(name)}`;

/** The suit texts already tied to a piece, by comparable text, with the piece's id. @param {Gear[]} pieces @param {string} [exceptId] @returns {Map<string, string>} */
export function linkedSuits(pieces, exceptId = '') {
  /** @type {Map<string, string>} */
  const map = new Map();
  for (const p of pieces) {
    if (p.id === exceptId) continue;
    for (const name of p.suitNames ?? []) if (suitKey(name)) map.set(suitKey(name), p.id);
  }
  return map;
}

/**
 * The computers of the logbook with the piece that already has each one (any piece but `exceptId`).
 * @param {{ model: string, serial: string, dives: number }[]} computers
 * @param {Gear[]} pieces
 * @param {string} [exceptId]
 * @returns {LogbookComputerItem[]}
 */
export function computerItems(computers, pieces, exceptId = '') {
  const cars = pieces.filter((g) => g.type === 'computer' && g.id !== exceptId);
  return computers
    .filter((c) => c.model && c.dives > 0)
    .map((c) => {
      const owner = cars.find((g) => (g.computerModel === c.model && (g.computerSerial ?? '') === c.serial) || sameComputer(g, c));
      return { model: c.model, serial: c.serial, dives: c.dives, ...(owner ? { linkedTo: owner.id } : {}) };
    });
}

/**
 * The suit texts of the logbook with the piece that already has each one.
 * @param {{ key: string, dives: number }[]} values
 * @param {Gear[]} pieces
 * @param {string} [exceptId]
 * @returns {LogbookSuitItem[]}
 */
export function suitItems(values, pieces, exceptId = '') {
  const linked = linkedSuits(pieces, exceptId);
  return values.filter((v) => v.key && v.key.trim() && v.dives > 0).map((v) => ({ name: v.key, dives: v.dives, ...(linked.has(suitKey(v.key)) ? { linkedTo: /** @type {string} */ (linked.get(suitKey(v.key))) } : {}) }));
}

/**
 * Whether a computer of the logbook looks like a piece: the same brand, or one name inside the other (brand and model
 * typed, else the name).
 * @param {Gear} piece
 * @param {{ model: string }} computer
 */
export function computerResembles(piece, computer) {
  const typed = modelKey([piece.brand, piece.model].filter(Boolean).join(' ') || piece.computerModel || piece.name || '');
  const brand = modelKey(piece.brand ?? '');
  const key = modelKey(computer.model);
  if (!key) return false;
  if (typed && (key.includes(typed) || typed.includes(key))) return true;
  return !!brand && key.startsWith(brand);
}

/** The words of a text, lower case, of at least three letters. @param {string} text */
const words = (text) => (String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);

/** The French and English words for a drysuit, a wetsuit and a semi-dry, taken as one family each. */
const FAMILIES = [
  ['dry', 'drysuit', 'etanche', 'etanches', 'trilaminate'],
  ['wet', 'wetsuit', 'humide', 'humides', 'shorty'],
  ['semi', 'semidry', 'semisec'],
];

/**
 * Whether a suit text of the logbook looks like a piece: a word of the piece's name, brand, model or note in the text,
 * or the same family (« étanche », « dry suit »).
 * @param {Gear} piece
 * @param {string} name
 */
export function suitResembles(piece, name) {
  const own = new Set([...words([piece.name, piece.brand, piece.model, piece.note].filter(Boolean).join(' ')), ...(piece.details?.suitType ? words(piece.details.suitType) : [])]);
  const text = words(name);
  if (text.some((w) => own.has(w))) return true;
  const family = (/** @type {string[]} */ ws) => new Set(FAMILIES.map((f, i) => (ws.some((w) => f.includes(w)) ? i : -1)).filter((i) => i >= 0));
  const a = family([...own]);
  return family(text).size > 0 && [...family(text)].some((i) => a.has(i));
}

/**
 * What the sheet « Associer aux plongées du carnet » offers: the values of the piece's type that are tied to no other piece
 * and resemble it; when none resembles it, every free value (the diver may know better).
 * @template {{ linkedTo?: string }} T
 * @param {T[]} items
 * @param {(item: T) => boolean} resembles
 * @returns {T[]}
 */
export function candidatesFor(items, resembles) {
  const free = items.filter((i) => !i.linkedTo);
  const near = free.filter(resembles);
  return near.length ? near : free;
}

/** The dives of the chosen items. @param {{ dives: number }[]} items */
export const totalDives = (items) => items.reduce((n, i) => n + i.dives, 0);

/**
 * « 2019 à 2021 », « 2022 », or '' when the years are not known.
 * @param {{ first?: number, last?: number }} item
 * @param {(first: number, last: number) => string} range the translated « {first} à {last} »
 */
export function yearsText(item, range) {
  const { first, last } = item;
  if (!first) return '';
  if (!last || last === first) return String(first);
  return range(first, last);
}

/**
 * Brand and model from a computer's text in the logbook (« Heinrichs Weikamp OSTC 3 »): the longest known brand that begins it.
 * @param {string} text
 * @param {string[]} vendors
 * @returns {{ brand: string, model: string }}
 */
export function splitBrandModel(text, vendors) {
  const clean = String(text ?? '').trim();
  const lower = clean.toLowerCase();
  const found = [...vendors].filter((v) => v && (lower === v.toLowerCase() || lower.startsWith(v.toLowerCase() + ' '))).sort((a, b) => b.length - a.length)[0];
  if (found) return { brand: found, model: clean.slice(found.length).trim() };
  const space = clean.indexOf(' ');
  return space > 0 ? { brand: clean.slice(0, space), model: clean.slice(space + 1).trim() } : { brand: '', model: clean };
}

/**
 * The fields to write on a piece paired with logbook computers or suit texts. A computer: the logbook's model and serial
 * (the piece then counts its dives, as after a download) and the serial shown. Suits: the texts, without doubles.
 * @param {Gear|undefined} piece
 * @param {{ computer?: { model: string, serial: string }, suitNames?: string[] }} link
 * @returns {Partial<Gear>}
 */
export function linkFields(piece, link) {
  /** @type {Partial<Gear>} */
  const fields = {};
  if (link.computer) {
    fields.computerModel = link.computer.model;
    fields.computerSerial = link.computer.serial;
    if (link.computer.serial) fields.serial = link.computer.serial;
  }
  if (link.suitNames) {
    const seen = new Set((piece?.suitNames ?? []).map(suitKey));
    const next = [...(piece?.suitNames ?? [])];
    for (const name of link.suitNames) {
      if (!suitKey(name) || seen.has(suitKey(name))) continue;
      seen.add(suitKey(name));
      next.push(name.trim());
    }
    fields.suitNames = next;
  }
  return fields;
}

/**
 * The reason a link cannot be made, or '': a suit text already tied to another piece, a computer already tied to another piece.
 * @param {Gear[]} pieces every piece
 * @param {string} gearId the piece being tied ('' for a new one)
 * @param {{ computer?: { model: string, serial: string }, suitNames?: string[] }} link
 * @returns {'' | 'suit' | 'computer'}
 */
export function linkProblem(pieces, gearId, link) {
  if (link.suitNames?.length) {
    const taken = linkedSuits(pieces, gearId);
    if (link.suitNames.some((n) => taken.has(suitKey(n)))) return 'suit';
  }
  if (link.computer) {
    const c = link.computer;
    const other = pieces.some((g) => g.type === 'computer' && g.id !== gearId && ((g.computerModel === c.model && serialKey(g.computerSerial) === serialKey(c.serial)) || sameComputer(g, c)));
    if (other) return 'computer';
  }
  return '';
}

/**
 * The rows of the list: a computer « Shearwater Perdix 2 » with « n° 4A21F7 · 212 plongées, 2021 à 2026 », a suit text with
 * « 140 plongées, 2016 à 2026 ». The wording comes from the caller (translated texts).
 * @param {'computer'|'suit'} kind
 * @param {(LogbookComputerItem|LogbookSuitItem)[]} items
 * @param {{ serial: (serial: string) => string, dives: (n: number) => string, range: (first: number, last: number) => string }} text
 * @returns {{ key: string, title: string, detail: string, linked: boolean }[]}
 */
export function pairRows(kind, items, text) {
  return items.map((item) => {
    const years = yearsText(item, text.range);
    const count = [text.dives(item.dives), years].filter(Boolean).join(', ');
    if (kind === 'computer') {
      const c = /** @type {LogbookComputerItem} */ (item);
      return { key: computerKey(c), title: c.model, detail: [c.serial ? text.serial(c.serial) : '', count].filter(Boolean).join(' · '), linked: !!c.linkedTo };
    }
    const s = /** @type {LogbookSuitItem} */ (item);
    return { key: s.name, title: s.name, detail: count, linked: !!s.linkedTo };
  });
}

/** The key of a computer in a list: model and serial. @param {{ model: string, serial: string }} c */
export const computerKey = (c) => `${c.model}|${c.serial}`;
