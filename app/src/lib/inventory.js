// @ts-check
// The equipment inventory of « Mon profil de plongeur » (OpenDives+, task 2026-11-17-267): the diver's pieces
// (dive computers, regulators, suits, cylinders, lamps…), the kits they make up, and what each dive used.
//
// Subsurface does not store any of it. The data follows the OpenDives logbook format (docs/architecture.md,
// section 11.3) so that it can later be synchronised file by file with the OpenDives server:
//   gear/<uuid>.json            one piece
//   kits/<uuid>.json            one kit: a name and the ids of its pieces
//   dive-equipment/<uuid>.json  what one dive used (the on-device logbook has no stable id yet, see `diveKeyOf`)
//   meta/state.json             this device's state of the inventory: read only after a subscription ends
//   meta/pending.json           the files changed here and not sent yet
// Everything is read and written through a FileStore (lib/file-store.js). An unknown field of a file is kept: a
// file is read as an object, the keys the app owns are changed, and the object is written back.

/** @typedef {import('./file-store.js').FileStore} FileStore */

/**
 * One piece of the inventory.
 * @typedef {Object} Gear
 * @property {number} format
 * @property {string} id UUID version 4
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
 * @property {string} [purchasedOn] YYYY-MM-DD
 * @property {string} [note] the line under the name
 * @property {string[]} [tags]
 * @property {boolean} retired archived: hidden unless asked for
 */

/** @typedef {'computer'|'regulator'|'suit'|'undersuit'|'cylinder'|'light'|'other'} GearType */

/** The types, in the order of the type menu. @type {GearType[]} */
export const GEAR_TYPES = ['computer', 'regulator', 'suit', 'undersuit', 'cylinder', 'light', 'other'];

/** The groups of the inventory page and of the kit editor. @type {('computer'|'regulator'|'suit'|'cylinder'|'other')[]} */
export const GROUPS = ['computer', 'regulator', 'suit', 'cylinder', 'other'];

/** The groups of the « Ajouter de l'équipement » sheet: one per type, no computers (a dive's computers come from its data). @type {GearType[]} */
export const PICKER_GROUPS = ['regulator', 'suit', 'undersuit', 'cylinder', 'light', 'other'];

/** @param {GearType} type @returns {typeof GROUPS[number]} */
export const groupOfType = (type) => (type === 'undersuit' ? 'suit' : type === 'light' ? 'other' : type);

/** Days the inventory stays readable after a subscription ends. */
export const READ_ONLY_DAYS = 30;

/** Thrown by a write while the inventory is read only. */
export class ReadOnlyError extends Error {
  constructor() {
    super('INVENTORY_READ_ONLY');
    this.name = 'ReadOnlyError';
  }
}

/** A random UUID version 4. @returns {string} */
export function newId() {
  const c = /** @type {any} */ (globalThis).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0'));
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10).join('')}`;
}

/** @param {string} id */
export const isUuid = (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);

/**
 * The key of a dive in the inventory. The on-device logbook is the Subsurface core's, whose numeric ids are valid
 * for one load only; the number changes at each renumbering. What does not move is the start time to the second
 * (Subsurface itself treats two dives that start together as the same dive, merging them), so a dive is keyed by it.
 * Editing the start time of a dive re-keys its record (`rekeyDive`). The key goes away when the logbook moves to the
 * OpenDives format and a dive has its own UUID: the record's content then joins the dive's file.
 * @param {{ date: string }} dive a row of the list or a DiveDetail
 */
export const diveKeyOf = (dive) => String(dive.date).slice(0, 19);

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
    .filter((g) => !!g && g.type !== 'computer')
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
    const pending = (await store.read('meta/pending.json')) ?? { format: 1, paths: [] };
    const paths = new Set(/** @type {string[]} */ (pending.paths));
    for (const [p] of writes) paths.add(p);
    for (const p of removes) paths.add(p);
    await store.batch({ writes: [...writes, ['meta/pending.json', { ...pending, format: 1, paths: [...paths].sort() }]], removes });
  }

  return {
    readState,

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
      await commit([[`gear/${piece.id}.json`, piece]]);
      return piece;
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
      await commit(writes, [`gear/${gearId}.json`]);
    },

    /**
     * A computer downloaded from: enters the inventory the first time (serial and firmware), and its firmware and
     * download date are refreshed each time. Nothing is written while read only (the download itself is never blocked).
     * @param {{ vendor?: string, model: string, serial: string, firmware: string }} computer
     * @returns {Promise<{ added: boolean, gear: Gear|null }>}
     */
    async recordDownloadedComputer(computer) {
      if ((await readState()).readOnlyFrom) return { added: false, gear: null };
      const all = await store.readAll('gear/');
      const found = all.find((g) => g.type === 'computer' && g.computerModel === computer.model && (g.computerSerial ?? '') === computer.serial);
      const read = stamp().slice(0, 10);
      if (found) {
        const next = { ...found };
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
      const kit = { ...(existing ?? { format: 1, createdAt: stamp() }), id: existing?.id ?? id(), name: fields.name.trim(), gearIds: [...new Set(fields.gearIds)], updatedAt: stamp() };
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

    /** @returns {Promise<(DiveEquipment & { id: string, diveKey: { start: string } })[]>} */
    async listDiveEquipment() {
      return store.readAll('dive-equipment/');
    },

    /**
     * What a dive used: one file per dive; an empty value removes the file.
     * @param {string} diveKey
     * @param {DiveEquipment} equipment
     */
    async saveDiveEquipment(diveKey, equipment) {
      const existing = (await store.readAll('dive-equipment/')).find((r) => r.diveKey?.start === diveKey);
      if (equipmentIsEmpty(equipment)) {
        if (existing) await commit([], [`dive-equipment/${existing.id}.json`]);
        return;
      }
      const rec = {
        ...(existing ?? { format: 1, createdAt: stamp() }),
        id: existing?.id ?? id(),
        diveKey: { start: diveKey },
        suitGearId: equipment.suitGearId,
        undersuitGearId: equipment.undersuitGearId,
        gearIds: [...equipment.gearIds],
        adhoc: equipment.adhoc.map((p) => ({ id: p.id, name: p.name.trim() })),
        kitId: equipment.kitId,
        updatedAt: stamp(),
      };
      await commit([[`dive-equipment/${rec.id}.json`, rec]]);
    },

    /** A dive's start time was edited: its record follows. @param {string} from @param {string} to */
    async rekeyDive(from, to) {
      if (from === to) return;
      const rec = (await store.readAll('dive-equipment/')).find((r) => r.diveKey?.start === from);
      if (rec) await commit([[`dive-equipment/${rec.id}.json`, { ...rec, diveKey: { start: to }, updatedAt: stamp() }]]);
    },

    /** A dive was deleted from the logbook. @param {string} diveKey */
    async forgetDive(diveKey) {
      const rec = (await store.readAll('dive-equipment/')).find((r) => r.diveKey?.start === diveKey);
      if (rec) await commit([], [`dive-equipment/${rec.id}.json`]);
    },
  };
}

/** @typedef {ReturnType<typeof createInventory>} Inventory */
