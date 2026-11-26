// @ts-check
// The equipment inventory of « Mon profil de plongeur » (Benthic+, task 2026-11-17-267): the diver's pieces
// (dive computers, regulators, suits, cylinders, lamps…), the kits they make up, and what each dive used.
//
// Subsurface does not store any of it. The data follows the Benthic logbook format (docs/architecture.md,
// section 11.3) so that it can later be synchronised file by file with the Benthic server:
//   gear/<id>.json              one piece
//   kits/<id>.json              one kit: a name and the ids of its pieces
//   dive-equipment/<id>.json    what one dive used, `diveKey: { benthicId }` (the dive's Benthic id, see `diveKeyOf`; `{ start }` until migrated)
//   meta/state.json             this device's state of the inventory: read only after a subscription ends
//   meta/pending.json           the files changed here and not sent yet
// Everything is read and written through a FileStore (lib/file-store.js). An unknown field of a file is kept: a
// file is read as an object, the keys the app owns are changed, and the object is written back.

import { sameComputer } from './dc-model.js';
import { linkProblem } from './logbook-pairing.js';
import { isShortId, newId } from './short-id.js';
import { migrateDiveIdsInStore } from './dive-id-migration.js';
import { CYLINDER_TYPES_FOLDER, isTypeFile, pathOfType } from './cylinder-type-files.js';
import { DISMISSED_SUITS_FOLDER, dismissedSuitPath, newDismissedSuit, dismissedKeys, suitPieceId, suitNorm } from './suit-pieces.js';
import { WEIGHT_TYPES_FOLDER, isWeightTypeFile, pathOfWeightType } from './weight-type-files.js';

import { ruleProblems } from './maintenance.js';
import { planO2Cells } from './o2-cells-migration.js';
import { rekey as rekeyValidations } from './validation.js';

/** @typedef {import('./file-store.js').FileStore} FileStore */
/** @typedef {import('./maintenance.js').MaintenanceItem} MaintenanceItem */
/** @typedef {import('./maintenance.js').HistoryEntry} HistoryEntry */
/** @typedef {import('./maintenance.js').Task} Task */

/**
 * One piece of the inventory.
 * @typedef {Object} Gear
 * @property {number} format
 * @property {string} id short id (lib/short-id.js)
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {GearType} type
 * @property {string} name
 * @property {string} [brand]
 * @property {string} [model]
 * @property {string} [serial]
 * @property {string} [firmware] a computer's: read at its last download, never typed
 * @property {string} [firmwareReadAt] ISO date of that download
 * @property {string} [computerModel] a computer's name in the logbook, with `computerSerial`, which ties it to the dives
 * @property {string} [computerSerial]
 * @property {string[]} [suitNames] a suit's: the texts of the dives' « Combinaison » field that stand for this piece (task 2026-11-26-405); a text is tied to one piece only
 * @property {string} [purchasedOn] YYYY-MM-DD
 * @property {string} [note] the line under the name
 * @property {Record<string, string>} [details] the fields of the piece's type besides these (lib/gear-fields.js)
 * @property {string} [photoId] a file of gear-photos/: the piece's photo
 * @property {string[]} [tags]
 * @property {boolean} retired retired from the equipment (task 2026-11-19-308): out of the lists, the kits and the reminders; its
 *   maintenance history and its dives stay, and it shows in « Pièces retirées »
 * @property {string} [retiredOn] YYYY-MM-DD, the day it was retired
 * @property {'sold'|'lost'|'worn'|'other'} [retiredReason] « Vendue », « Perdue », « Hors d'usage », « Autre »
 */

/** The reasons offered when a piece is retired. @type {readonly ('sold'|'lost'|'worn'|'other')[]} */
export const RETIRE_REASONS = ['sold', 'lost', 'worn', 'other'];

/**
 * The types of « Nouvelle pièce »: `rebreather` is « Recycleur », `o2Cells` « Cellules O₂ » (a rebreather's cells, task 2026-11-24-397), `bcd` is « Veste », `dsmb` « Parachute de palier »,
 * `floatBuoy` « Bouée de surface ».
 * @typedef {'computer'|'regulator'|'suit'|'undersuit'|'cylinder'|'rebreather'|'o2Cells'|'bcd'|'light'|'weights'|'mask'|'fins'|'scooter'|'camera'|'dsmb'|'floatBuoy'|'knife'|'diveKnife'|'compass'|'other'} GearType
 */

/** The types, in the order of the type grid. @type {GearType[]} */
export const GEAR_TYPES = ['computer', 'regulator', 'suit', 'undersuit', 'cylinder', 'rebreather', 'o2Cells', 'bcd', 'light', 'weights', 'mask', 'fins', 'scooter', 'camera', 'dsmb', 'floatBuoy', 'knife', 'diveKnife', 'compass', 'other'];

/** The groups of the inventory page and of the kit editor. @type {('computer'|'regulator'|'suit'|'cylinder'|'other')[]} */
export const GROUPS = ['computer', 'regulator', 'suit', 'cylinder', 'other'];

/** The groups of the « Ajouter de l'équipement » sheet: one per type, no computers (a dive's computers come from its data). @type {GearType[]} */
export const PICKER_GROUPS = GEAR_TYPES.filter((type) => type !== 'computer');

/** @param {GearType} type @returns {typeof GROUPS[number]} */
/** True when a piece name is a surface marker buoy (« Saucisse », « parachute de palier », « Surface marker buoy »), to show its icon. @param {string} name */
export const isBuoyName = (name) => /saucisse|parachute|bou[eé]e|\b(?:d?smb|sausage)\b|marker buoy/i.test(name ?? '');

export const groupOfType = (type) => (type === 'undersuit' ? 'suit' : GROUPS.includes(/** @type {any} */ (type)) ? type : 'other');

/** Days the inventory stays readable after a subscription ends. */
export const READ_ONLY_DAYS = 30;

/** Thrown by a write while the inventory is read only. */
export class ReadOnlyError extends Error {
  constructor() {
    super('INVENTORY_READ_ONLY');
    this.name = 'ReadOnlyError';
  }
}

// The ids of the data are short ids (lib/short-id.js: 10 characters of lowercase Crockford base32, 50 random bits).
export { newId, isUuid } from './short-id.js';

/**
 * The key of a dive in the inventory: its Benthic id (the extra data `Benthic id`, lib/dive-id.js), which never changes. The core's
 * numeric ids are valid for one load only and the number changes at each renumbering. A dive that has no id yet (the pass that
 * gives them runs after a load) is keyed by its start time to the second, the key that records made before the ids hold until
 * `lib/dive-id-migration.js` has turned them into the dive's id.
 * @param {{ date: string, benthicId?: string }} dive a row of the list or a DiveDetail
 */
export const diveKeyOf = (dive) => (isShortId(dive.benthicId) ? dive.benthicId : startKeyOf(dive));

/** The start time of a dive to the second: the key of the records made before the Benthic ids. @param {{ date: string }} dive */
export const startKeyOf = (dive) => String(dive.date).slice(0, 19);

/** The key a record holds (`diveKey`): a Benthic id, or a start time while the record has not been migrated. @param {{ benthicId?: string, start?: string }|undefined} diveKey */
export const recordKey = (diveKey) => diveKey?.benthicId ?? diveKey?.start ?? '';

/** How a record holds a key: `{ benthicId }` for an id, `{ start }` for a start time. @param {string} key @returns {{ benthicId: string }|{ start: string }} */
export const keyField = (key) => (isShortId(key) ? { benthicId: key } : { start: key });

/**
 * What a dive used, as the edit screen holds it before saving.
 * @typedef {Object} DiveEquipment
 * @property {string} suitGearId '' when none from the inventory
 * @property {string} undersuitGearId
 * @property {string[]} gearIds the pieces of « Autre équipement »
 * @property {{ id: string, name: string }[]} adhoc pieces outside the inventory, kept on this dive only
 * @property {string} kitId the kit last applied; '' when none
 */

/** @returns {DiveEquipment} */
export const emptyEquipment = () => ({ suitGearId: '', undersuitGearId: '', gearIds: [], adhoc: [], kitId: '' });

/** @param {DiveEquipment} e */
export const equipmentIsEmpty = (e) => !e.suitGearId && !e.undersuitGearId && !e.gearIds.length && !e.adhoc.length && !e.kitId;

/** @param {DiveEquipment} a @param {DiveEquipment} b */
export const sameEquipment = (a, b) =>
  a.suitGearId === b.suitGearId &&
  a.undersuitGearId === b.undersuitGearId &&
  a.kitId === b.kitId &&
  JSON.stringify([...a.gearIds].sort()) === JSON.stringify([...b.gearIds].sort()) &&
  JSON.stringify(a.adhoc.map((p) => p.name)) === JSON.stringify(b.adhoc.map((p) => p.name));

/** @param {DiveEquipment} e @returns {DiveEquipment} */
export const cloneEquipment = (e) => ({ ...e, gearIds: [...e.gearIds], adhoc: e.adhoc.map((p) => ({ ...p })) });

/**
 * Puts a kit's pieces into what a dive used: the suit and the undersuit are replaced, the other pieces are added
 * to those already there. A computer in the kit is left out (a dive's computers come from its data). Returns a new
 * value; the caller keeps the old one to offer « Annuler ».
 * @param {DiveEquipment} equipment
 * @param {{ id: string, gearIds: string[] }} kit
 * @param {Map<string, Gear>} gearById
 * @returns {DiveEquipment}
 */
export function applyKit(equipment, kit, gearById) {
  const next = cloneEquipment(equipment);
  next.kitId = kit.id;
  for (const gid of kit.gearIds) {
    const g = gearById.get(gid);
    if (!g || g.retired) continue;
    if (g.type === 'suit') next.suitGearId = g.id;
    else if (g.type === 'undersuit') next.undersuitGearId = g.id;
    else if (g.type !== 'computer' && !next.gearIds.includes(g.id)) next.gearIds.push(g.id);
  }
  return next;
}

/**
 * « Comme la précédente »: what the previous dive used, as a copy (its kit included, ad hoc pieces get new ids).
 * @param {DiveEquipment|null} previous
 * @returns {DiveEquipment}
 */
export function copyEquipment(previous) {
  const next = cloneEquipment(previous ?? emptyEquipment());
  next.adhoc = next.adhoc.map((p) => ({ id: newId(), name: p.name }));
  return next;
}

/**
 * The pieces added in the « Ajouter de l'équipement » sheet.
 * @param {DiveEquipment} equipment
 * @param {{ gearIds?: string[], adhocName?: string }} add
 * @returns {DiveEquipment}
 */
export function addToEquipment(equipment, { gearIds = [], adhocName = '' }) {
  const next = cloneEquipment(equipment);
  for (const gid of gearIds) if (!next.gearIds.includes(gid)) next.gearIds.push(gid);
  const name = adhocName.trim();
  if (name && !next.adhoc.some((p) => p.name.toLocaleLowerCase() === name.toLocaleLowerCase())) next.adhoc.push({ id: newId(), name });
  return next;
}

/**
 * @param {DiveEquipment} equipment
 * @param {{ gearId?: string, adhocId?: string }} what
 * @returns {DiveEquipment}
 */
export function removeFromEquipment(equipment, { gearId = '', adhocId = '' }) {
  const next = cloneEquipment(equipment);
  if (gearId) next.gearIds = next.gearIds.filter((gid) => gid !== gearId);
  if (adhocId) next.adhoc = next.adhoc.filter((p) => p.id !== adhocId);
  return next;
}

/**
 * What is wrong with a name typed for a piece outside the inventory: '' when it is fine.
 * @param {string} text
 * @returns {'' | 'empty'}
 */
export const adhocProblem = (text) => (text.trim() ? '' : 'empty');

/**
 * Whether a piece's text fields are acceptable, for live validation.
 * @param {{ name: string, purchasedOn?: string }} fields
 * @returns {{ name?: 'empty', purchasedOn?: 'date' }}
 */
export function gearProblems(fields) {
  /** @type {{ name?: 'empty', purchasedOn?: 'date' }} */
  const out = {};
  if (!fields.name.trim()) out.name = 'empty';
  const d = (fields.purchasedOn ?? '').trim();
  const real = /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d);
  if (d && !real) out.purchasedOn = 'date';
  return out;
}

/**
 * Whether the fields of « Noter un entretien » are acceptable, for live validation. The cost is a number, typed with a
 * point or a comma.
 * @param {{ doneOn: string, cost: string }} fields
 * @returns {{ doneOn?: 'date', cost?: 'number' }}
 */
export function entryProblems(fields) {
  /** @type {{ doneOn?: 'date', cost?: 'number' }} */
  const out = {};
  const d = fields.doneOn.trim();
  const real = /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d);
  if (!real) out.doneOn = 'date';
  const c = fields.cost.trim().replace(',', '.');
  if (c && !(/^\d+(\.\d{1,2})?$/.test(c))) out.cost = 'number';
  return out;
}

/**
 * Whether a kit's fields are acceptable.
 * @param {{ name: string, gearIds: string[] }} fields
 * @param {{ id: string, name: string }[]} others the other kits
 * @returns {{ name?: 'empty'|'taken', gearIds?: 'none' }}
 */
export function kitProblems(fields, others) {
  /** @type {{ name?: 'empty'|'taken', gearIds?: 'none' }} */
  const out = {};
  const name = fields.name.trim();
  if (!name) out.name = 'empty';
  else if (others.some((k) => k.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) out.name = 'taken';
  if (!fields.gearIds.length) out.gearIds = 'none';
  return out;
}

/**
 * A name for a copy of a kit that no other kit has: « Eau froide (copie) », then « Eau froide (copie 2) ».
 * @param {string} base the name with the word « copie » already applied: `copy(n)` gives the text for copy n
 * @param {string[]} taken the names in use
 * @param {(n: number) => string} copy
 */
export function uniqueKitName(base, taken, copy) {
  const used = new Set(taken.map((n) => n.trim().toLocaleLowerCase()));
  let n = 1;
  let name = copy(n);
  while (used.has(name.trim().toLocaleLowerCase())) name = copy(++n);
  return name || base;
}

/**
 * What a kit was used for: the dives whose record names it as the last kit applied, and the latest of them.
 * @param {string} kitId
 * @param {{ kitId?: string, diveKey?: { benthicId?: string, start?: string } }[]} records
 * @param {{ date: string }[]} dives the logbook's rows (a record whose dive is gone is not counted)
 * @returns {{ dives: number, last: string }} `last`: the start of the latest dive, or ''
 */
export function kitUse(kitId, records, dives) {
  const keys = new Set(records.filter((r) => r.kitId === kitId && r.diveKey).map((r) => recordKey(r.diveKey)));
  let n = 0;
  let last = '';
  for (const d of dives) {
    if (!keys.has(diveKeyOf(d))) continue;
    n++;
    if (d.date > last) last = d.date;
  }
  return { dives: n, last };
}

/**
 * The figures of a piece, from the dives that used it.
 * @param {string[]} diveKeys the keys of the dives that used the piece
 * @param {{ date: string, maxDepthMm: number, durationSeconds: number }[]} dives the logbook's rows
 * @returns {{ dives: number, seconds: number, deepestMm: number, last: string }} `last`: the start of the latest dive, or ''
 */
export function pieceFigures(diveKeys, dives) {
  const wanted = new Set(diveKeys);
  let n = 0;
  let seconds = 0;
  let deepestMm = 0;
  let last = '';
  for (const d of dives) {
    if (!wanted.has(diveKeyOf(d))) continue;
    n++;
    seconds += d.durationSeconds;
    deepestMm = Math.max(deepestMm, d.maxDepthMm);
    if (d.date > last) last = d.date;
  }
  return { dives: n, seconds, deepestMm, last };
}

/**
 * The text of a kit in the menu: the first pieces' names (computers left out, as applying a kit does).
 * @param {{ gearIds: string[] }} kit
 * @param {Map<string, Gear>} gearById
 * @param {number} [max]
 */
export function kitSummary(kit, gearById, max = 4) {
  return kit.gearIds
    .map((gid) => gearById.get(gid))
    .filter((g) => !!g && g.type !== 'computer' && !g.retired)
    .slice(0, max)
    .map((g) => /** @type {Gear} */ (g).name)
    .join(', ');
}

/**
 * The inventory in groups for a list: pieces sorted by name inside each group, empty groups left out.
 * @param {Gear[]} gear
 * @param {{ picker?: boolean }} [options] `picker`: one group per type, no computers
 * @returns {{ group: string, items: Gear[] }[]}
 */
export function groupGear(gear, { picker = false } = {}) {
  const order = picker ? PICKER_GROUPS : GROUPS;
  const key = (/** @type {Gear} */ g) => (picker ? g.type : groupOfType(g.type));
  const byName = (/** @type {Gear} */ a, /** @type {Gear} */ b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  return order
    .map((group) => ({ group: /** @type {string} */ (group), items: gear.filter((g) => key(g) === group).sort(byName) }))
    .filter((g) => g.items.length);
}

/**
 * The pieces whose name, brand, model, serial or note contain the words typed (accents and case ignored).
 * @param {Gear[]} gear
 * @param {string} query
 */
export function searchGear(gear, query) {
  const fold = (/** @type {string} */ s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase();
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return gear;
  return gear.filter((g) => {
    const hay = fold([g.name, g.brand, g.model, g.serial, g.note].filter(Boolean).join(' '));
    return words.every((w) => hay.includes(w));
  });
}

/** The inventory is read only from `readOnlyFrom`. @typedef {{ readOnlyFrom: string|null }} InventoryState */

/**
 * The read-only notice counts the days left of the 30.
 * @param {InventoryState} state
 * @param {Date} [now]
 * @returns {{ readOnly: boolean, daysLeft: number, until: string }} `until`: the date (YYYY-MM-DD) the diver loses it; `daysLeft` 0 once past
 */
export function readOnlyInfo(state, now = new Date()) {
  if (!state.readOnlyFrom) return { readOnly: false, daysLeft: READ_ONLY_DAYS, until: '' };
  const from = new Date(state.readOnlyFrom);
  const end = new Date(from.getTime() + READ_ONLY_DAYS * 86400000);
  const left = Math.ceil((end.getTime() - now.getTime()) / 86400000);
  return { readOnly: true, daysLeft: Math.max(0, left), until: end.toISOString().slice(0, 10) };
}

/**
 * The inventory over a FileStore. The clock and the id source are injected for the tests.
 * @param {FileStore} store
 * @param {{ now?: () => Date, id?: () => string }} [deps]
 */
export function createInventory(store, { now = () => new Date(), id = newId } = {}) {
  const stamp = () => now().toISOString().replace(/\.\d{3}Z$/, 'Z');

  /** The files that remember deleted suit texts, among those of `names`: removed when the texts are tied to a piece again. @param {string[]} names @returns {Promise<string[]>} */
  async function undismissPaths(names) {
    const paths = [...new Set(names.map(dismissedSuitPath))];
    if (!paths.length) return [];
    const present = new Set(await store.list(DISMISSED_SUITS_FOLDER));
    return paths.filter((p) => present.has(p));
  }

  /** @returns {Promise<InventoryState>} */
  async function readState() {
    const s = await store.read('meta/state.json');
    return { readOnlyFrom: typeof s?.readOnlyFrom === 'string' ? s.readOnlyFrom : null };
  }

  /**
   * Every write goes through here: refused when read only, and recorded as not sent yet.
   * @param {[string, unknown][]} writes
   * @param {string[]} [removes]
   */
  async function commit(writes, removes = []) {
    if ((await readState()).readOnlyFrom) throw new ReadOnlyError();
    await store.trackedBatch({ writes, removes });
  }

  return {
    readState,
    /** The store and the writes of the inventory, for the other Benthic data of a dive (lib/validation.svelte.js). */
    store,
    commitFiles: commit,

    /**
     * The read-only flag: set when the subscription ends, cleared when it is renewed.
     * @param {boolean} on
     */
    async setReadOnly(on) {
      const state = (await store.read('meta/state.json')) ?? { format: 1 };
      const nextFrom = on ? (state.readOnlyFrom ?? stamp()) : null;
      await store.write('meta/state.json', { ...state, format: 1, readOnlyFrom: nextFrom });
    },

    /** The files changed here and not sent yet. @returns {Promise<string[]>} */
    async pendingPaths() {
      return (await store.read('meta/pending.json'))?.paths ?? [];
    },
    /** Called once the server has taken the files (a later task). */
    async clearPending() {
      await store.write('meta/pending.json', { format: 1, paths: [] });
    },

    /** @returns {Promise<Gear[]>} */
    async listGear() {
      return store.readAll('gear/');
    },
    /** @param {string} gearId @returns {Promise<Gear|null>} */
    getGear: (gearId) => store.read(`gear/${gearId}.json`),

    /**
     * Creates a piece (no `id`) or changes one: the keys given replace those of the file, the others stay.
     * @param {Partial<Gear> & { name: string, type: GearType }} fields
     * @returns {Promise<Gear>}
     */
    async saveGear(fields) {
      const problems = gearProblems(fields);
      if (problems.name || problems.purchasedOn) throw new Error(`INVALID_GEAR:${Object.keys(problems).join(',')}`);
      const existing = fields.id ? await store.read(`gear/${fields.id}.json`) : null;
      // A logbook value is tied to one piece at most (task 2026-11-26-405).
      const bad = linkProblem(await store.readAll('gear/'), existing?.id ?? '', {
        suitNames: fields.suitNames?.filter((n) => !(existing?.suitNames ?? []).includes(n)),
        computer: fields.computerModel && fields.computerModel !== existing?.computerModel ? { model: fields.computerModel, serial: fields.computerSerial ?? '' } : undefined,
      });
      if (bad) throw new Error(`LINKED_ELSEWHERE:${bad}`);
      /** @type {Gear} */
      const piece = {
        ...(existing ?? { format: 1, createdAt: stamp(), retired: false }),
        ...fields,
        id: existing?.id ?? id(),
        name: fields.name.trim(),
        updatedAt: stamp(),
      };
      for (const key of /** @type {const} */ (['brand', 'model', 'serial', 'purchasedOn', 'note'])) {
        if (typeof piece[key] === 'string') {
          const v = /** @type {string} */ (piece[key]).trim();
          if (v) piece[key] = v;
          else delete piece[key];
        }
      }
      if (piece.details && !Object.keys(piece.details).length) delete piece.details;
      if (piece.suitNames && !piece.suitNames.length) delete piece.suitNames;
      await commit([[`gear/${piece.id}.json`, piece]], await undismissPaths(piece.suitNames ?? []));
      return piece;
    },

    /**
     * « Retirer de l'équipement »: the piece leaves the lists, the kits and the reminders; its history and its dives stay.
     * @param {string} gearId @param {'sold'|'lost'|'worn'|'other'} [reason]
     */
    async retireGear(gearId, reason) {
      const piece = await store.read(`gear/${gearId}.json`);
      if (!piece) return;
      /** @type {Gear} */
      const next = { ...piece, retired: true, retiredOn: stamp().slice(0, 10), updatedAt: stamp() };
      if (reason && RETIRE_REASONS.includes(reason)) next.retiredReason = reason;
      else delete next.retiredReason;
      await commit([[`gear/${gearId}.json`, next]]);
    },

    /** « Remettre en service »: the piece is back in the lists, its kits and its reminders. @param {string} gearId */
    async restoreGear(gearId) {
      const piece = await store.read(`gear/${gearId}.json`);
      if (!piece) return;
      const { retiredOn, retiredReason, ...rest } = piece;
      await commit([[`gear/${gearId}.json`, { ...rest, retired: false, updatedAt: stamp() }]]);
    },

    /** The comparable suit texts the diver deleted (task 2026-11-26-406). @returns {Promise<Set<string>>} */
    async dismissedSuits() {
      return dismissedKeys(await store.readAll(DISMISSED_SUITS_FOLDER));
    },

    /**
     * Applies a plan of lib/suit-pieces.js: new suit pieces for the logbook's suit texts, and spellings added to the pieces that
     * have them. Idempotent: the ids come from the text, a piece that exists is extended, never made twice. @param {{ create: { id: string, name: string, suitNames: string[] }[], extend: { id: string, suitNames: string[] }[] }} plan
     * @returns {Promise<number>} the files written
     */
    async applySuitPlan(plan) {
      /** @type {[string, unknown][]} */
      const writes = [];
      const all = await store.readAll('gear/');
      const known = new Map(all.map((g) => [g.id, g]));
      for (const c of plan.create) {
        if (known.has(c.id)) continue;
        writes.push([`gear/${c.id}.json`, { format: 1, createdAt: stamp(), retired: false, id: c.id, name: c.name, type: 'suit', suitNames: c.suitNames, updatedAt: stamp() }]);
      }
      for (const e of plan.extend) {
        const piece = known.get(e.id);
        if (!piece) continue;
        const have = new Set((piece.suitNames ?? []).map((/** @type {string} */ n) => n.trim()));
        const add = e.suitNames.filter((n) => !have.has(n.trim()));
        if (add.length) writes.push([`gear/${piece.id}.json`, { ...piece, suitNames: [...(piece.suitNames ?? []), ...add], updatedAt: stamp() }]);
      }
      if (!writes.length) return 0;
      await commit(writes, await undismissPaths(plan.create.flatMap((c) => c.suitNames)));
      return writes.length;
    },

    /**
     * The suit piece for a text typed in a dive: the piece that holds the text (or a suit of that name), else a new one. The text is
     * tied to it, so its dives count. @param {string} text @returns {Promise<Gear|null>}
     */
    async suitPieceFor(text) {
      const name = text.trim();
      if (!suitNorm(name)) return null;
      const all = await store.readAll('gear/');
      const key = suitNorm(name);
      const found = all.find((g) => (g.suitNames ?? []).some((/** @type {string} */ n) => suitNorm(n) === key)) ?? all.find((g) => g.type === 'suit' && !g.retired && suitNorm(g.name) === key);
      if (found) {
        if (!(found.suitNames ?? []).some((/** @type {string} */ n) => n.trim() === name)) await commit([[`gear/${found.id}.json`, { ...found, suitNames: [...(found.suitNames ?? []), name], updatedAt: stamp() }]], await undismissPaths([name]));
        return (await store.read(`gear/${found.id}.json`)) ?? found;
      }
      const piece = { format: 1, createdAt: stamp(), retired: false, id: suitPieceId(name), name, type: 'suit', suitNames: [name], updatedAt: stamp() };
      await commit([[`gear/${piece.id}.json`, piece]], await undismissPaths([name]));
      return piece;
    },

    /**
     * Moves suit texts to a piece: they leave the piece that had them. One transaction. @param {string} gearId @param {string[]} names
     */
    async moveSuitNames(gearId, names) {
      const all = await store.readAll('gear/');
      const target = all.find((g) => g.id === gearId);
      if (!target) return;
      const keys = new Set(names.map(suitNorm));
      /** @type {[string, unknown][]} */
      const writes = [];
      for (const g of all) {
        if (g.id === gearId || !(g.suitNames ?? []).some((/** @type {string} */ n) => keys.has(suitNorm(n)))) continue;
        const rest = g.suitNames.filter((/** @type {string} */ n) => !keys.has(suitNorm(n)));
        const next = { ...g, updatedAt: stamp() };
        if (rest.length) next.suitNames = rest;
        else delete next.suitNames;
        writes.push([`gear/${g.id}.json`, next]);
      }
      const have = new Set((target.suitNames ?? []).map((/** @type {string} */ n) => n.trim()));
      writes.push([`gear/${gearId}.json`, { ...target, suitNames: [...(target.suitNames ?? []), ...names.map((n) => n.trim()).filter((n) => n && !have.has(n))], updatedAt: stamp() }]);
      await commit(writes, await undismissPaths(names));
    },

    /** @param {string} gearId @param {boolean} retired */
    async archiveGear(gearId, retired) {
      const piece = await store.read(`gear/${gearId}.json`);
      if (!piece) return;
      await commit([[`gear/${gearId}.json`, { ...piece, retired, updatedAt: stamp() }]]);
    },

    /**
     * Deletes a piece and every link to it: the kits that held it, and the dives that used it. All in one
     * transaction.
     * @param {string} gearId
     */
    async deleteGear(gearId) {
      /** @type {[string, unknown][]} */
      const writes = [];
      for (const kit of await store.readAll('kits/')) {
        if (kit.gearIds?.includes(gearId)) writes.push([`kits/${kit.id}.json`, { ...kit, gearIds: kit.gearIds.filter((/** @type {string} */ x) => x !== gearId), updatedAt: stamp() }]);
      }
      for (const rec of await store.readAll('dive-equipment/')) {
        const touched = rec.gearIds?.includes(gearId) || rec.suitGearId === gearId || rec.undersuitGearId === gearId;
        if (!touched) continue;
        writes.push([
          `dive-equipment/${rec.id}.json`,
          {
            ...rec,
            gearIds: (rec.gearIds ?? []).filter((/** @type {string} */ x) => x !== gearId),
            suitGearId: rec.suitGearId === gearId ? '' : (rec.suitGearId ?? ''),
            undersuitGearId: rec.undersuitGearId === gearId ? '' : (rec.undersuitGearId ?? ''),
            updatedAt: stamp(),
          },
        ]);
      }
      // Its reminders and photos go with it.
      /** @type {string[]} */
      const removes = [`gear/${gearId}.json`];
      const piece = await store.read(`gear/${gearId}.json`);
      if (piece?.photoId) removes.push(`gear-photos/${piece.photoId}.json`);
      // The texts of a deleted suit are not made into a piece again (task 2026-11-26-406).
      for (const name of new Map((piece?.suitNames ?? []).map((/** @type {string} */ n) => [suitNorm(n), n])).values()) writes.push([dismissedSuitPath(name), newDismissedSuit(name, stamp())]);
      for (const m of await store.readAll('maintenance/')) {
        if (m.gearId !== gearId) continue;
        removes.push(`maintenance/${m.id}.json`);
        for (const h of m.history ?? []) if (h.invoicePhotoId) removes.push(`gear-photos/${h.invoicePhotoId}.json`);
      }
      await commit(writes, removes);
    },

    /**
     * A computer downloaded from: enters the inventory the first time (serial and firmware), and its firmware and
     * download date are refreshed each time. Nothing is written while read only (the download itself is never blocked).
     * `add: false` (task 2026-11-19-306): a computer that is not in the equipment is not added (the end of the download
     * offers it); one that is, brand, model and serial number matching, only gets its firmware and its tie to the
     * logbook refreshed.
     * @param {{ vendor?: string, model: string, serial: string, firmware: string }} computer
     * @param {{ add?: boolean }} [options]
     * @returns {Promise<{ added: boolean, gear: Gear|null }>}
     */
    async recordDownloadedComputer(computer, { add = true } = {}) {
      if ((await readState()).readOnlyFrom) return { added: false, gear: null };
      const all = await store.readAll('gear/');
      const found = all.find((g) => g.type === 'computer' && ((g.computerModel === computer.model && (g.computerSerial ?? '') === computer.serial) || sameComputer(g, computer)));
      const read = stamp().slice(0, 10);
      if (!found && !add) return { added: false, gear: null };
      if (found) {
        const next = { ...found };
        if (!next.computerModel) {
          next.computerModel = computer.model;
          next.computerSerial = computer.serial;
        }
        if (computer.firmware) {
          next.firmware = computer.firmware;
          next.firmwareReadAt = read;
        }
        if (JSON.stringify(next) !== JSON.stringify(found)) await commit([[`gear/${found.id}.json`, { ...next, updatedAt: stamp() }]]);
        return { added: false, gear: next };
      }
      /** @type {Gear} */
      const piece = {
        format: 1,
        id: id(),
        createdAt: stamp(),
        updatedAt: stamp(),
        type: 'computer',
        name: computer.model,
        computerModel: computer.model,
        computerSerial: computer.serial,
        retired: false,
      };
      if (computer.vendor) piece.brand = computer.vendor;
      if (computer.serial) piece.serial = computer.serial;
      if (computer.firmware) {
        piece.firmware = computer.firmware;
        piece.firmwareReadAt = read;
      }
      await commit([[`gear/${piece.id}.json`, piece]]);
      return { added: true, gear: piece };
    },

    /** The cylinder types the diver added (lib/cylinder-type-files.js). @returns {Promise<import('./cylinder-type-files.js').CylinderTypeFile[]>} */
    async listCylinderTypes() {
      return (await store.readAll(CYLINDER_TYPES_FOLDER)).filter(isTypeFile);
    },

    /**
     * Writes and removes added types in one step, tracked for the sync. Not refused when the subscription ended: these
     * types are a setting of the diver's list, not Benthic+ data.
     * @param {import('./cylinder-type-files.js').CylinderTypeFile[]} files
     * @param {string[]} [removeIds]
     */
    async changeCylinderTypes(files, removeIds = []) {
      await store.trackedBatch({ writes: files.map((f) => [pathOfType(f.id), f]), removes: removeIds.map(pathOfType) });
    },

    /** The weight types the diver added or gave a usual weight (lib/weight-type-files.js). @returns {Promise<import('./weight-type-files.js').WeightTypeFile[]>} */
    async listWeightTypes() {
      return (await store.readAll(WEIGHT_TYPES_FOLDER)).filter(isWeightTypeFile);
    },

    /**
     * Writes and removes weight type files in one step, tracked for the sync. Like the cylinder types, a setting of the
     * diver's list, not Benthic+ data.
     * @param {import('./weight-type-files.js').WeightTypeFile[]} files
     * @param {string[]} [removeIds]
     */
    async changeWeightTypes(files, removeIds = []) {
      await store.trackedBatch({ writes: files.map((f) => [pathOfWeightType(f.id), f]), removes: removeIds.map(pathOfWeightType) });
    },

    /** @returns {Promise<{ id: string, name: string, gearIds: string[], createdAt: string, updatedAt: string }[]>} */
    async listKits() {
      return (await store.readAll('kits/')).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    },

    /** @param {{ id?: string, name: string, gearIds: string[] }} fields */
    async saveKit(fields) {
      const others = (await store.readAll('kits/')).filter((k) => k.id !== fields.id);
      const problems = kitProblems(fields, others);
      if (problems.name || problems.gearIds) throw new Error(`INVALID_KIT:${Object.keys(problems).join(',')}`);
      const existing = fields.id ? await store.read(`kits/${fields.id}.json`) : null;
      // A retired piece does not show in the kit's screens, so the form does not send it: it stays in the kit, ready for « Remettre en service ».
      const retired = new Set((await store.readAll('gear/')).filter((g) => g.retired).map((g) => g.id));
      const kept = (existing?.gearIds ?? []).filter((/** @type {string} */ gid) => retired.has(gid));
      const kit = { ...(existing ?? { format: 1, createdAt: stamp() }), id: existing?.id ?? id(), name: fields.name.trim(), gearIds: [...new Set([...fields.gearIds, ...kept])], updatedAt: stamp() };
      await commit([[`kits/${kit.id}.json`, kit]]);
      return kit;
    },

    /** Deleting a kit leaves the dives that used it as they are, without the kit's name. @param {string} kitId */
    async deleteKit(kitId) {
      /** @type {[string, unknown][]} */
      const writes = [];
      for (const rec of await store.readAll('dive-equipment/')) {
        if (rec.kitId === kitId) writes.push([`dive-equipment/${rec.id}.json`, { ...rec, kitId: '', updatedAt: stamp() }]);
      }
      await commit(writes, [`kits/${kitId}.json`]);
    },

    /** A copy of a kit under a new name. @param {string} kitId @param {string} name */
    async duplicateKit(kitId, name) {
      const kit = await store.read(`kits/${kitId}.json`);
      if (!kit) throw new Error('KIT_NOT_FOUND');
      return this.saveKit({ name, gearIds: kit.gearIds ?? [] });
    },

    /** @returns {Promise<MaintenanceItem[]>} */
    async listMaintenance() {
      return store.readAll('maintenance/');
    },

    /**
     * Creates a reminder (no `id`) or changes one: the keys given replace those of the file, the others (the history
     * included) stay.
     * @param {{ id?: string, gearId: string, task: Task, label?: string, intervalMonths: number|null, intervalDives: number|null, startOn?: string, dueOn?: string, dueFrom?: string, notifyDays?: 14|30|60|null, warnInDive?: boolean }} fields
     * @returns {Promise<MaintenanceItem>}
     */
    async saveMaintenance(fields) {
      const problems = ruleProblems({ months: fields.intervalMonths, dives: fields.intervalDives });
      if (problems.months || problems.dives || problems.criteria) throw new Error(`INVALID_RULE:${Object.keys(problems).join(',')}`);
      const existing = fields.id ? await store.read(`maintenance/${fields.id}.json`) : null;
      /** @type {MaintenanceItem} */
      const item = {
        ...(existing ?? { format: 1, createdAt: stamp(), startOn: fields.startOn ?? stamp().slice(0, 10), notifyDays: null, warnInDive: true, history: [] }),
        ...fields,
        id: existing?.id ?? id(),
        updatedAt: stamp(),
      };
      if (item.task !== 'custom') delete item.label;
      else item.label = (item.label ?? '').trim();
      await commit([[`maintenance/${item.id}.json`, item]]);
      return item;
    },

    /**
     * « Retirer le rappel »: the rule goes, the history stays; a reminder without any history is deleted.
     * @param {string} itemId
     */
    async removeRule(itemId) {
      const item = await store.read(`maintenance/${itemId}.json`);
      if (!item) return;
      if (!item.history?.length) await commit([], [`maintenance/${itemId}.json`]);
      else await commit([[`maintenance/${itemId}.json`, { ...item, intervalMonths: null, intervalDives: null, updatedAt: stamp() }]]);
    },

    /**
     * « Noter un entretien »: adds an entry to the history of a reminder (found by `id`, else by piece and task, else
     * created without a rule) and moves the last service to the latest date of the history.
     * @param {{ id?: string, gearId: string, task: Task, label?: string }} target
     * @param {{ kind: HistoryEntry['kind'], doneOn: string, doneBy?: string, cost?: number|null, notes?: string, invoicePhotoId?: string }} entry
     * @returns {Promise<MaintenanceItem>}
     */
    async noteMaintenance(target, entry) {
      const problems = entryProblems({ doneOn: entry.doneOn, cost: entry.cost == null ? '' : String(entry.cost) });
      if (problems.doneOn || problems.cost) throw new Error(`INVALID_ENTRY:${Object.keys(problems).join(',')}`);
      const all = await store.readAll('maintenance/');
      let item = target.id ? all.find((m) => m.id === target.id) : all.find((m) => m.gearId === target.gearId && m.task === target.task && (target.task !== 'custom' || m.label === target.label));
      if (!item) {
        item = { format: 1, createdAt: stamp(), id: id(), gearId: target.gearId, task: target.task, intervalMonths: null, intervalDives: null, startOn: stamp().slice(0, 10), notifyDays: null, warnInDive: true, history: [] };
        if (target.task === 'custom') item.label = target.label ?? '';
      }
      /** @type {HistoryEntry} */
      const row = { id: id(), kind: entry.kind, doneOn: entry.doneOn };
      if (entry.doneBy?.trim()) row.doneBy = entry.doneBy.trim();
      if (entry.cost != null) row.cost = entry.cost;
      if (entry.notes?.trim()) row.notes = entry.notes.trim();
      if (entry.invoicePhotoId) row.invoicePhotoId = entry.invoicePhotoId;
      const history = [...(item.history ?? []), row].sort((a, b) => (a.doneOn < b.doneOn ? 1 : a.doneOn > b.doneOn ? -1 : 0));
      const next = { ...item, history, lastDoneOn: history[0].doneOn, updatedAt: stamp() };
      await commit([[`maintenance/${next.id}.json`, next]]);
      return next;
    },

    /** A photo (a piece's, an invoice's) as a data URL, in its own file. @param {string} dataUrl @returns {Promise<string>} its id */
    async savePhoto(dataUrl) {
      const photoId = id();
      await commit([[`gear-photos/${photoId}.json`, { format: 1, id: photoId, createdAt: stamp(), dataUrl }]]);
      return photoId;
    },

    /**
     * One-time move of the photos of pieces and invoices from `media/<id>.json` to `gear-photos/<id>.json` (`media/` is
     * kept for the dives' photos). Only the files that hold a `dataUrl` move; a file already at its new place wins.
     * Not blocked by the read-only state: it moves data, it does not change the diver's logbook.
     * @returns {Promise<number>} how many files moved
     */
    async migrateGearPhotos() {
      /** @type {[string, unknown][]} */
      const writes = [];
      /** @type {string[]} */
      const removes = [];
      for (const path of await store.list('media/')) {
        const file = await store.read(path);
        if (!file || typeof file.dataUrl !== 'string') continue;
        const target = `gear-photos/${path.slice('media/'.length)}`;
        if (!(await store.read(target))) writes.push([target, file]);
        removes.push(path);
      }
      if (writes.length || removes.length) await store.trackedBatch({ writes, removes });
      return removes.length;
    },

    /**
     * The O₂ cells of every rebreather become a piece of their own (task 2026-11-24-397; lib/o2-cells-migration.js has the rules:
     * idempotent, the same on every device, no date lost). Nothing is written while read only.
     * @returns {Promise<boolean>} true when files were written
     */
    async migrateO2Cells() {
      if ((await readState()).readOnlyFrom) return false;
      const plan = planO2Cells({ gear: await store.readAll('gear/'), maintenance: await store.readAll('maintenance/') });
      if (!plan.writes.length && !plan.removes.length) return false;
      await store.trackedBatch(plan);
      return true;
    },

    /** @param {string} photoId @returns {Promise<string>} the data URL, '' when the file is gone */
    async readPhoto(photoId) {
      return (await store.read(`gear-photos/${photoId}.json`))?.dataUrl ?? '';
    },

    /** @returns {Promise<(DiveEquipment & { id: string, diveKey: { benthicId?: string, start?: string } })[]>} */
    async listDiveEquipment() {
      return store.readAll('dive-equipment/');
    },

    /**
     * What a dive used: one file per dive; an empty value removes the file.
     * @param {string} diveKey
     * @param {DiveEquipment} equipment
     */
    async saveDiveEquipment(diveKey, equipment) {
      const existing = (await store.readAll('dive-equipment/')).find((r) => recordKey(r.diveKey) === diveKey);
      if (equipmentIsEmpty(equipment)) {
        if (existing) await commit([], [`dive-equipment/${existing.id}.json`]);
        return;
      }
      const rec = {
        ...(existing ?? { format: 1, createdAt: stamp() }),
        id: existing?.id ?? id(),
        diveKey: keyField(diveKey),
        suitGearId: equipment.suitGearId,
        undersuitGearId: equipment.undersuitGearId,
        gearIds: [...equipment.gearIds],
        adhoc: equipment.adhoc.map((p) => ({ id: p.id, name: p.name.trim() })),
        kitId: equipment.kitId,
        updatedAt: stamp(),
      };
      await commit([[`dive-equipment/${rec.id}.json`, rec]]);
    },

    /**
     * The records that name a dive by its start time take its Benthic id (lib/dive-id-migration.js). A no-op when there is none.
     * @param {Map<string, string>} startToId
     * @returns {Promise<number>} the files written or removed
     */
    migrateDiveIds: (startToId) => migrateDiveIdsInStore(store, startToId, commit),

    /** A dive's start time was edited: its record follows. @param {string} from @param {string} to */
    async rekeyDive(from, to) {
      if (from === to) return;
      const rec = (await store.readAll('dive-equipment/')).find((r) => recordKey(r.diveKey) === from);
      const writes = /** @type {[string, unknown][]} */ ([]);
      if (rec) writes.push([`dive-equipment/${rec.id}.json`, { ...rec, diveKey: keyField(to), updatedAt: stamp() }]);
      // The dive's validations follow it (lib/validation.js).
      for (const v of rekeyValidations(await store.readAll('dive-validations/'), from, to)) writes.push([`dive-validations/${v.id}.json`, { ...v, updatedAt: stamp() }]);
      if (writes.length) await commit(writes);
    },

    /** A dive was deleted from the logbook. @param {string} diveKey */
    async forgetDive(diveKey) {
      const rec = (await store.readAll('dive-equipment/')).find((r) => recordKey(r.diveKey) === diveKey);
      if (rec) await commit([], [`dive-equipment/${rec.id}.json`]);
    },
  };
}

/** @typedef {ReturnType<typeof createInventory>} Inventory */
