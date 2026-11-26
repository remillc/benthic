// @ts-check
// Editing a dive in place in the desktop detail pane (task 2026-11-15-172, 184, 191): which
// fields can be edited, what a typed value becomes in the core's terms (the `changes` of
// BenthicCore.editDive, the same keys and units as the phone's editor, pages/EditDive.svelte),
// and what the keys do while a field is edited. Pure functions: the pane's components only
// call them, and tests/app/desktop-edit.test.mjs checks them.

import { WATER_TYPES, waterTypeOfSalinity } from './tools.js';
import { isFeedbackTag, visibleTags } from './weight-feedback.js';

const MBAR_PER_PSI = 68.9476;
const MM_PER_FOOT = 304.8;
const G_PER_LB = 453.59237;

/**
 * What the dive computer records: read-only, except on a dive logged by hand (`dive.manual`).
 * The profile, the maximum depth, the duration, the temperatures and the pressures.
 */
export const RECORDED = /** @type {const} */ (['maxDepth', 'duration', 'waterTemp', 'airTemp', 'startPressure', 'endPressure']);

/**
 * The fields of the Informations, Équipement and Gaz tabs. `kind` says how the field is edited:
 * text (one line), multiline, list (chips), choice (a menu), stars (0 to 5), site (a combo).
 * @typedef {'text'|'multiline'|'list'|'choice'|'stars'|'site'} FieldKind
 */
/** @type {Record<string, FieldKind>} */
export const FIELD_KINDS = {
  site: 'site',
  buddies: 'list',
  guides: 'list',
  tags: 'list',
  waterType: 'choice',
  visibility: 'stars',
  current: 'stars',
  wavesize: 'stars',
  surge: 'stars',
  chill: 'stars',
  rating: 'stars',
  suit: 'text',
  notes: 'multiline',
  surfacePressure: 'text',
  maxDepth: 'text',
  duration: 'text',
  waterTemp: 'text',
  airTemp: 'text',
  startPressure: 'text',
  endPressure: 'text',
};

/**
 * Can this field of this dive be edited? Not what the dive computer recorded, unless the dive was
 * logged by hand; not an unknown field.
 * @param {{ manual?: boolean }|null|undefined} dive
 * @param {string} key
 */
export function isEditable(dive, key) {
  if (!dive || !(key in FIELD_KINDS)) return false;
  return !(/** @type {readonly string[]} */ (RECORDED).includes(key)) || !!dive.manual;
}

/** The dive shows « Enregistré par l'ordinateur de plongée, non modifiable »: it has recorded values. */
export const hasRecordedValues = (/** @type {{ manual?: boolean, computer?: string }} */ dive) => !dive.manual && !!dive.computer;

/** @param {string} text a number typed by the diver, "12,5" or "12.5"; NaN when it is not one */
export function parseTyped(text) {
  const s = text.trim().replace(/\s/g, '').replace(',', '.');
  return s === '' || !/^-?\d*\.?\d+$/.test(s) ? NaN : Number(s);
}

/** A number as typed back: at most `decimals` decimals, no thousands separator. */
function typed(/** @type {number} */ v, decimals = 0) {
  return String(Number(v.toFixed(decimals))).replace('.', ',');
}

/**
 * The text a field starts from when it is edited, in the diver's units.
 * @param {any} dive
 * @param {string} key
 * @param {import('benthic-core').Prefs|{ length: string, temperature: string, pressure: string, weight: string }} prefs
 * @returns {string|string[]|number}
 */
export function fieldValue(dive, key, prefs) {
  switch (key) {
    case 'site':
      return dive.site ?? '';
    case 'buddies':
      return [...dive.buddies];
    case 'guides':
      return [...dive.guides];
    case 'tags':
      return visibleTags(dive.tags);
    case 'waterType':
      return dive.userSalinity ? waterTypeOfSalinity(dive.userSalinity) : '';
    case 'visibility':
      return dive.visibility ?? 0;
    case 'rating':
      return dive.rating ?? 0;
    case 'current':
    case 'wavesize':
    case 'surge':
    case 'chill':
      return dive.conditions?.[key] ?? 0;
    case 'suit':
      return dive.suit ?? '';
    case 'notes':
      return dive.notes ?? '';
    case 'surfacePressure':
      return dive.surfacePressureMbar ? String(dive.surfacePressureMbar) : '';
    case 'maxDepth':
      return dive.maxDepthMm ? typed(prefs.length === 'ft' ? dive.maxDepthMm / MM_PER_FOOT : dive.maxDepthMm / 1000, prefs.length === 'ft' ? 0 : 1) : '';
    case 'duration':
      return dive.durationSeconds ? typed(dive.durationSeconds / 60, 1) : '';
    case 'waterTemp':
    case 'airTemp': {
      const mk = key === 'waterTemp' ? dive.waterTempMk : dive.airTempMk;
      if (!mk) return '';
      const c = mk / 1000 - 273.15;
      return typed(prefs.temperature === 'F' ? (c * 9) / 5 + 32 : c, 1);
    }
    case 'startPressure':
    case 'endPressure':
      return '';
    default:
      return '';
  }
}

/** @param {number} v @param {{ temperature: string }} prefs */
const temperatureMk = (v, prefs) => Math.round(((prefs.temperature === 'F' ? ((v - 32) * 5) / 9 : v) + 273.15) * 1000);

const sameList = (/** @type {string[]} */ a, /** @type {string[]} */ b) => a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * What typing `value` into `key` changes, in the core's terms.
 * - `{ ok: true, changes }`: send `changes` to BenthicCore.editDive;
 * - `{ ok: true, changes: null }`: nothing changed, nothing is written;
 * - `{ ok: false, error: 'readonly' }`: a recorded value of a dive that was not logged by hand;
 * - `{ ok: false, error: 'invalid' }`: the text is not a valid value (shown while typing).
 * The site is not handled here: it may create a site first (siteChoice).
 * @param {any} dive
 * @param {string} key
 * @param {string|string[]|number} value
 * @param {import('benthic-core').Prefs|{ length: string, temperature: string, pressure: string, weight: string }} prefs
 * @returns {{ ok: true, changes: Record<string, string|number|string[]>|null } | { ok: false, error: 'readonly'|'invalid' }}
 */
export function fieldChanges(dive, key, value, prefs) {
  if (!isEditable(dive, key)) return { ok: false, error: 'readonly' };
  const before = fieldValue(dive, key, prefs);
  const same = Array.isArray(value) && Array.isArray(before) ? sameList(value, before) : value === before;
  if (same) return { ok: true, changes: null };
  /** @type {Record<string, string|number|string[]>} */
  const changes = {};
  const text = typeof value === 'string' ? value : '';
  const empty = !text.trim();
  switch (key) {
    case 'buddies':
      changes.buddies = /** @type {string[]} */ (value);
      break;
    case 'guides':
      changes.diveguide = /** @type {string[]} */ (value);
      break;
    case 'tags': {
      // The « Ce lest était » tags are kept as they are (weight-feedback.js): only the others change.
      const kept = dive.tags.filter(isFeedbackTag);
      changes.tags = [.../** @type {string[]} */ (value), ...kept];
      break;
    }
    case 'waterType':
      changes.userSalinity = WATER_TYPES.find((w) => w.id === value)?.salinity ?? 0;
      break;
    case 'visibility':
      changes.visibility = Number(value);
      break;
    case 'rating':
      changes.rating = Number(value);
      break;
    case 'current':
    case 'wavesize':
    case 'surge':
    case 'chill':
      changes[key] = Number(value);
      break;
    case 'suit':
      changes.suit = text.trim();
      break;
    case 'notes':
      changes.notes = text;
      break;
    case 'surfacePressure': {
      const v = parseTyped(text);
      if (!empty && !(v >= 500 && v <= 1100)) return { ok: false, error: 'invalid' };
      changes.surfacePressureMbar = empty ? 0 : Math.round(v);
      break;
    }
    case 'maxDepth': {
      const v = parseTyped(text);
      if (!(v > 0) || v > (prefs.length === 'ft' ? 1640 : 500)) return { ok: false, error: 'invalid' };
      changes.maxDepthMm = Math.round(prefs.length === 'ft' ? v * MM_PER_FOOT : v * 1000);
      break;
    }
    case 'duration': {
      const v = parseTyped(text);
      if (!(v > 0) || v >= 48 * 60) return { ok: false, error: 'invalid' };
      changes.durationSeconds = Math.round(v * 60);
      break;
    }
    case 'waterTemp':
    case 'airTemp': {
      const f = prefs.temperature === 'F';
      const v = parseTyped(text);
      const [lo, hi] = key === 'waterTemp' ? (f ? [28, 110] : [-2, 45]) : f ? [-40, 140] : [-40, 60];
      if (!empty && !(v >= lo && v <= hi)) return { ok: false, error: 'invalid' };
      changes[key === 'waterTemp' ? 'waterTempMk' : 'airTempMk'] = empty ? 0 : temperatureMk(v, prefs);
      break;
    }
    default:
      return { ok: false, error: 'readonly' };
  }
  return { ok: true, changes };
}

/**
 * What the Site field's text means, as the phone's editor decides it when it saves: empty clears
 * the site, a name of the logbook chooses that site (not case sensitive), another name creates one.
 * @param {string} text
 * @param {string} current the dive's site now
 * @param {{ name: string, uuid: number }[]} sites
 * @returns {{ action: 'none' } | { action: 'clear' } | { action: 'existing', uuid: number } | { action: 'create', name: string }}
 */
export function siteChoice(text, current, sites) {
  const name = text.trim();
  if (name === current) return { action: 'none' };
  if (!name) return { action: 'clear' };
  const same = sites.find((s) => s.name.toLocaleLowerCase() === name.toLocaleLowerCase());
  return same ? { action: 'existing', uuid: same.uuid } : { action: 'create', name };
}

/**
 * The list under a chips field: what the logbook already holds that matches the typed text (the
 * most used first, not the ones already chosen), and « Ajouter « Ju » comme nouveau… » when the
 * text is new.
 * @param {{ key: string, dives: number }[]} known
 * @param {string[]} chosen
 * @param {string} query
 * @returns {{ matches: { key: string, dives: number }[], addNew: string|null }}
 */
export function listSuggestions(known, chosen, query) {
  const q = query.trim();
  const lower = q.toLocaleLowerCase();
  const taken = new Set(chosen.map((c) => c.toLocaleLowerCase()));
  const matches = known
    .filter((k) => !taken.has(k.key.toLocaleLowerCase()) && (!q || k.key.toLocaleLowerCase().includes(lower)))
    .sort((a, b) => b.dives - a.dives || a.key.localeCompare(b.key))
    .slice(0, 6);
  const exists = known.some((k) => k.key.toLocaleLowerCase() === lower) || taken.has(lower);
  return { matches, addNew: q && !exists ? q : null };
}

/** @param {string[]} list @param {string} name the list with `name` added (once, trimmed) */
export function withItem(list, name) {
  const n = name.trim();
  return !n || list.some((v) => v.toLocaleLowerCase() === n.toLocaleLowerCase()) ? list : [...list, n];
}

/** @param {string[]} list @param {number} index the list without that item */
export const withoutItem = (list, index) => list.filter((_, i) => i !== index);

/**
 * What a key does while a field is being edited: Entrée keeps the value (in a multi-line field,
 * Ctrl or ⌘ + Entrée does; Entrée adds a line), Échap restores it, Tab keeps it and moves to the
 * next editable field (Maj+Tab: the previous).
 * @param {{ key: string, shiftKey?: boolean, ctrlKey?: boolean, metaKey?: boolean }} e
 * @param {{ multiline?: boolean }} [field]
 * @returns {'commit'|'cancel'|'next'|'previous'|null}
 */
export function editKeyAction(e, field = {}) {
  if (e.key === 'Escape') return 'cancel';
  if (e.key === 'Enter') return field.multiline && !(e.ctrlKey || e.metaKey) ? null : 'commit';
  if (e.key === 'Tab') return e.shiftKey ? 'previous' : 'next';
  return null;
}

/**
 * The weights of the dive from the rows of the Équipement tab: unchanged rows keep their exact grams
 * (a text that was not touched is not converted back), as the phone's editor does.
 * @param {any} dive
 * @param {{ description: string, text: string, grams0: number, text0: string }[]} rows
 * @param {{ weight: string }} prefs
 * @returns {{ ok: true, changes: Record<string, string[]>|null } | { ok: false, error: 'invalid' }}
 */
export function weightChanges(dive, rows, prefs) {
  const pounds = prefs.weight === 'lbs';
  /** @type {{ description: string, grams: number }[]} */
  const items = [];
  for (const r of rows) {
    const v = parseTyped(r.text);
    if (r.text.trim() && !(v >= 0 && v <= (pounds ? 400 : 200))) return { ok: false, error: 'invalid' };
    const grams = r.grams0 >= 0 && r.text === r.text0 ? r.grams0 : r.text.trim() ? Math.round(pounds ? v * G_PER_LB : v * 1000) : 0;
    items.push({ description: r.description, grams });
  }
  const before = (dive.weights ?? []).map((/** @type {{ description: string, grams: number }} */ w) => ({ description: w.description, grams: w.grams }));
  if (JSON.stringify(items) === JSON.stringify(before)) return { ok: true, changes: null };
  return { ok: true, changes: { weights: items.map((i) => JSON.stringify(i)) } };
}

/** A weight in grams as the text of its field. @param {number} grams @param {{ weight: string }} prefs */
export const weightText = (grams, prefs) => (grams ? typed(prefs.weight === 'lbs' ? grams / G_PER_LB : grams / 1000, 1) : '');

/**
 * The cylinders of the dive from the Gaz tab's rows, in their new order. A row is a cylinder
 * of the dive (`index`) with the fields the diver changed (`patch`, in the core's units), or a new
 * one (`index` -1, all its fields are sent). Nothing is sent when no cylinder was added, removed,
 * moved or changed. The pressures are recorded values: refused unless the dive was logged by hand.
 * @param {any} dive
 * @param {{ index: number, patch: Record<string, string|number> }[]} rows
 * @returns {{ ok: true, changes: Record<string, string[]>|null } | { ok: false, error: 'readonly'|'invalid' }}
 */
export function cylinderChanges(dive, rows) {
  const items = [];
  for (const row of rows) {
    const patch = row.patch;
    if (!dive.manual && ('startMbar' in patch || 'endMbar' in patch)) return { ok: false, error: 'readonly' };
    if ('o2Permille' in patch || 'hePermille' in patch) {
      const old = row.index >= 0 ? dive.cylinders[row.index] : null;
      const o2 = Number('o2Permille' in patch ? patch.o2Permille : (old?.o2Permille || 210));
      const he = Number('hePermille' in patch ? patch.hePermille : (old?.hePermille ?? 0));
      if (!(o2 >= 10 && o2 <= 1000) || !(he >= 0 && he <= 990) || o2 + he > 1000) return { ok: false, error: 'invalid' };
    }
    const base =
      row.index < 0
        ? { description: '', use: 'OC-gas', sizeMl: 0, workingPressureMbar: 0, startMbar: 0, endMbar: 0, o2Permille: 210, hePermille: 0 }
        : {};
    items.push({ index: row.index, ...base, ...patch });
  }
  const removed = dive.cylinders.length !== rows.filter((r) => r.index >= 0).length;
  const kept = rows.filter((r) => r.index >= 0);
  const reordered = kept.some((r, i) => i > 0 && kept[i - 1].index > r.index);
  const touched = items.some((item) => Object.keys(item).length > 1);
  if (!removed && !reordered && !touched) return { ok: true, changes: null };
  return { ok: true, changes: { cylinders: items.map((i) => JSON.stringify(i)) } };
}

/**
 * A pressure typed in the diver's unit, in mbar; NaN when it is not valid.
 * @param {string} text @param {{ pressure: string }} prefs
 */
export function pressureMbarOf(text, prefs) {
  const psi = prefs.pressure === 'psi';
  const v = parseTyped(text);
  if (!(v >= 0 && v <= (psi ? 7000 : 500))) return NaN;
  return Math.round(psi ? v * MBAR_PER_PSI : v * 1000);
}
