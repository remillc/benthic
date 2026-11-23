// @ts-check
// The form of a piece adapts to its type (task 2026-11-19-309, docs/equipment-fields.md): the type is the only required
// field, « Date d'achat » and « Notes » are the only fields every type has. This file says which fields each of the
// types shows, in the order of the form; the screens draw them, the inventory keeps them as they are.
//
// A piece keeps `brand`, `model`, `serial`, `purchasedOn` and `note` as keys of its file (older screens read them);
// every other field of a type goes in `details`, an object of short values (text, a choice, 'yes' or 'no'). Unknown
// keys of `details` are kept when the piece is saved.

/** @typedef {import('./inventory.js').GearType} GearType */

/**
 * One field of a type, after the serial number.
 * @typedef {Object} DetailField
 * @property {string} key the key in `details`; the label is `gear.field.<key>`
 * @property {'text'|'number'|'segments'|'select'|'switch'|'date'|'stamp'|'cylinderType'} kind
 * @property {string[]} [options] the ids of a choice; the labels are `gear.fieldOption.<key>.<id>`
 * @property {boolean} [hint] the field has a hint under it (`gear.fieldHint.<key>`)
 */

/**
 * @typedef {Object} TypeSpec
 * @property {boolean} [named] the diver names the piece (the name is not made from brand and model)
 * @property {boolean} [photo] the form offers a photo
 * @property {boolean} [brand] brand and model
 * @property {boolean} [brandOnly] with `brand`: the brand alone, after the name (a cylinder)
 * @property {boolean} [serial]
 * @property {string} [serialHint] a type's own hint for the serial number: `gear.pieceNew.serialHint.<serialHint>`
 * @property {DetailField[]} [before] fields between the name and the brand (the free type name of « Autre »)
 * @property {DetailField[]} [extras] fields after the serial number
 * @property {DetailField[]} [late] fields after « Date d'achat » (a rebreather's two dates), before « Notes »
 */

/**
 * Fields a type no longer shows (task 334) whose values a saved piece may still hold in `details`: they are kept in
 * the file when the piece is saved as the same type, but not shown.
 * @type {Partial<Record<GearType, string[]>>}
 */
export const REMOVED_FIELDS = {
  scooter: ['battery', 'burnTime', 'speed'],
  camera: ['housingDepth'],
  floatBuoy: ['colour'],
};

/** @type {Record<GearType, TypeSpec>} */
export const SPECS = {
  computer: { photo: true, brand: true, serial: true },
  regulator: {
    photo: true,
    brand: true,
    serial: true,
    extras: [
      { key: 'serialSecond', kind: 'text' },
      { key: 'connection', kind: 'segments', options: ['din', 'yoke'] },
      { key: 'secondStages', kind: 'number' },
      { key: 'nitrox', kind: 'switch', hint: true },
      { key: 'coldWater', kind: 'switch', hint: true },
    ],
  },
  suit: {
    brand: true,
    serial: true,
    serialHint: 'suit',
    extras: [
      { key: 'suitType', kind: 'segments', options: ['wet', 'semi', 'dry'] },
      { key: 'thickness', kind: 'text', hint: true },
      { key: 'size', kind: 'text' },
      { key: 'material', kind: 'select', options: ['neoprene', 'compressed', 'trilaminate', 'other'] },
    ],
  },
  undersuit: { brand: true, extras: [{ key: 'size', kind: 'text' }] },
  // Task 2026-11-22-324 and 334: the dates the O₂ cells were made and installed and the last service, after « Date d'achat »;
  // each feeds a reminder (lib/maintenance.js `o2CellsDue`).
  rebreather: {
    photo: true,
    brand: true,
    serial: true,
    serialHint: 'rebreather',
    late: [
      { key: 'o2CellsMadeOn', kind: 'date' },
      { key: 'o2CellsOn', kind: 'date' },
      { key: 'lastService', kind: 'date' },
    ],
  },
  // The cylinder's brand follows its name; the brand does not make the name, and there is no model (task 334).
  cylinder: {
    named: true,
    brand: true,
    brandOnly: true,
    serial: true,
    serialHint: 'cylinder',
    extras: [],
  },
  bcd: {
    photo: true,
    brand: true,
    serial: true,
    extras: [
      { key: 'bcdType', kind: 'select', options: ['jacket', 'wing', 'sidemount'] },
      { key: 'lift', kind: 'text', hint: true },
      { key: 'weightCapacity', kind: 'text', hint: true },
      { key: 'size', kind: 'text' },
    ],
  },
  light: {
    photo: true,
    brand: true,
    extras: [
      { key: 'lumens', kind: 'number' },
      { key: 'battery', kind: 'text', hint: true },
      { key: 'burnTime', kind: 'text', hint: true },
    ],
  },
  weights: { named: true, extras: [{ key: 'weightsType', kind: 'segments', options: ['shot', 'pockets', 'harness'] }] },
  mask: { brand: true, extras: [{ key: 'corrective', kind: 'switch', hint: true }] },
  fins: {
    brand: true,
    extras: [
      { key: 'finType', kind: 'segments', options: ['boot', 'adjustable'] },
      { key: 'size', kind: 'text' },
    ],
  },
  scooter: {
    photo: true,
    brand: true,
    serial: true,
  },
  camera: { photo: true, brand: true, serial: true },
  dsmb: { brand: true, extras: [{ key: 'lift', kind: 'text', hint: true }] },
  floatBuoy: { brand: true },
  knife: { brand: true },
  diveKnife: { brand: true },
  compass: { brand: true },
  other: { named: true, photo: true, before: [{ key: 'typeName', kind: 'text', hint: true }] },
};

// The cylinder's own fields, in the order of the mock-up (profil-piece-nouvelle-bouteille-android): the cylinder type
// comes before the serial number, the dates after it, so the cylinder's list is apart from `extras`.
/** @type {DetailField[]} */
export const CYLINDER_BEFORE_SERIAL = [
  { key: 'cylinderType', kind: 'cylinderType', hint: true },
  { key: 'material', kind: 'segments', options: ['aluminium', 'steel'] },
  { key: 'valve', kind: 'segments', options: ['din', 'yoke'] },
];
/** @type {DetailField[]} */
export const CYLINDER_AFTER_SERIAL = [
  { key: 'o2Clean', kind: 'switch', hint: true },
  { key: 'lastInspection', kind: 'date' },
  { key: 'lastHydro', kind: 'stamp', hint: true },
];

/**
 * The fields of a type, in three lists: those before the serial number, those after it, and those after « Date d'achat ».
 * @param {GearType} type
 * @returns {{ before: DetailField[], after: DetailField[], late: DetailField[] }}
 */
export function detailFields(type) {
  const spec = SPECS[type] ?? SPECS.other;
  if (type === 'cylinder') return { before: CYLINDER_BEFORE_SERIAL, after: CYLINDER_AFTER_SERIAL, late: [] };
  return { before: spec.before ?? [], after: spec.extras ?? [], late: spec.late ?? [] };
}

/** True when a type names its pieces by hand (cylinder, weight belt, other). @param {GearType} type */
export const isNamedByHand = (type) => !!SPECS[type]?.named;

/** Pieces of this type that carry a model (so a name made from brand and model). @param {GearType} type */
export const hasBrand = (type) => !!SPECS[type]?.brand;

/**
 * The name of a piece whose name is not typed: its brand and model, else the type's name (the type is the only
 * required field).
 * @param {{ brand?: string, model?: string }} fields
 * @param {string} typeLabel
 */
export function derivedName({ brand = '', model = '' }, typeLabel) {
  return [brand, model].map((s) => s.trim()).filter(Boolean).join(' ') || typeLabel;
}

/** @param {string} d YYYY-MM-DD */
const realDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d);

/**
 * The date stamped on a cylinder, « 03/22 », as the first of that month (YYYY-MM-DD), or null when the text is not one.
 * @param {string} text
 * @returns {string|null}
 */
export function parseStampText(text) {
  const m = /^\s*(0?[1-9]|1[0-2])\s*[/.-]\s*(\d{2}|\d{4})\s*$/.exec(text);
  if (!m) return null;
  const year = m[2].length === 2 ? `20${m[2]}` : m[2];
  return `${year}-${m[1].padStart(2, '0')}-01`;
}

/** The stamp of a date, « 03/22 ». @param {string} iso YYYY-MM-DD */
export const stampText = (iso) => (iso ? `${iso.slice(5, 7)}/${iso.slice(2, 4)}` : '');

/**
 * What is wrong with the values of a type's fields, for live validation: the key of each wrong field and why.
 * `stampText` holds what is typed for the hydrostatic test (the field is a text; `details.lastHydro` is its date).
 * @param {GearType} type
 * @param {Record<string, string>} details
 * @param {{ stampText?: string }} [typed]
 * @returns {Record<string, 'number'|'date'|'stamp'>}
 */
export function detailProblems(type, details, typed = {}) {
  /** @type {Record<string, 'number'|'date'|'stamp'>} */
  const out = {};
  const { before, after, late } = detailFields(type);
  for (const f of [...before, ...after, ...late]) {
    const v = (details[f.key] ?? '').trim();
    if (f.kind === 'number' && v && !/^\d{1,6}$/.test(v)) out[f.key] = 'number';
    if (f.kind === 'date' && v && !realDate(v)) out[f.key] = 'date';
    if (f.kind === 'stamp') {
      const text = typed.stampText ?? stampText(v);
      if (text.trim() && !parseStampText(text)) out[f.key] = 'stamp';
    }
  }
  return out;
}

/**
 * The `details` to keep for a type: the values of its fields that are not empty, the keys of other types' fields left
 * out (the diver changed the type while filling the form), the unknown keys of the stored file kept.
 * @param {GearType} type
 * @param {Record<string, string>} details what the form holds
 * @param {Record<string, string>} [stored] what the file already had
 * @param {GearType} [storedType] the type the file had (the removed fields of that type are kept); default `type`
 * @returns {Record<string, string>}
 */
export function detailsToKeep(type, details, stored = {}, storedType = type) {
  const { before, after, late } = detailFields(type);
  const own = new Set([...before, ...after, ...late].map((f) => f.key));
  const allKnown = new Set(Object.values(SPECS).flatMap((s) => [...(s.before ?? []), ...(s.extras ?? []), ...(s.late ?? [])].map((f) => f.key)));
  for (const f of [...CYLINDER_BEFORE_SERIAL, ...CYLINDER_AFTER_SERIAL]) allKnown.add(f.key);
  /** @type {Record<string, string>} */
  const out = {};
  const removed = new Set(REMOVED_FIELDS[storedType] ?? []);
  for (const [k, v] of Object.entries(stored)) if (!allKnown.has(k) || (removed.has(k) && !own.has(k))) out[k] = v;
  for (const k of own) {
    const v = (details[k] ?? '').trim();
    if (v) out[k] = v;
  }
  return out;
}

/**
 * The rows of a piece's sheet for its type's own fields, in the order of the form; a field left empty is not listed.
 * @param {GearType} type
 * @param {Record<string, string>|undefined} details
 * @param {{ label: (key: string) => string, option: (key: string, id: string) => string, yes: string, date: (iso: string) => string }} text
 * @returns {{ label: string, value: string }[]}
 */
export function detailRows(type, details, text) {
  const { before, after, late } = detailFields(type);
  /** @type {{ label: string, value: string }[]} */
  const rows = [];
  for (const f of [...before, ...after, ...late]) {
    const v = (details?.[f.key] ?? '').trim();
    if (!v) continue;
    const value = f.kind === 'switch' ? (v === 'yes' ? text.yes : '') : f.kind === 'segments' || f.kind === 'select' ? text.option(f.key, v) : f.kind === 'date' ? text.date(v) : f.kind === 'stamp' ? stampText(v) : v;
    if (value) rows.push({ label: text.label(f.key), value });
  }
  return rows;
}
