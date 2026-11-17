// @ts-check
// The inventory on screen (task 2026-11-17-267): the pieces, the kits and the dives' equipment read from the local
// store (lib/inventory.js over lib/file-store.js), kept in one reactive object that the screens share. Every change
// goes through the functions here: write, then read again, so the screens never show what is not saved.
// The server is not wired yet (it waits for the project owner): `pending` counts the files changed on this device.
import { OpenDivesCore } from 'opendives-core';
import { createFileStore, indexedDbBackend, memoryBackend, requestPersistence } from './file-store.js';
import { createInventory, diveKeyOf, readOnlyInfo, pieceFigures, emptyEquipment, cloneEquipment } from './inventory.js';
import { logbook } from './logbook.svelte.js';

/** @typedef {import('./inventory.js').Gear} Gear */
/** @typedef {import('./inventory.js').DiveEquipment} DiveEquipment */

/** @type {ReturnType<typeof createInventory>|null} */
let inventory = null;

/** What the screens read. */
export const gear = $state({
  ready: false,
  /** @type {Gear[]} every piece, archived ones included */
  pieces: [],
  /** @type {{ id: string, name: string, gearIds: string[] }[]} */
  kits: [],
  /** @type {(DiveEquipment & { id: string, diveKey: { start: string } })[]} */
  records: [],
  /** The inventory is read only (the OpenDives+ subscription ended). */
  readOnly: false,
  daysLeft: 30,
  until: '',
  /** Files changed on this device and not sent to the server yet. */
  pending: 0,
});

/** The store, opened once: IndexedDB in the app; memory where it does not exist. */
function open() {
  if (!inventory) {
    const backend = typeof globalThis.indexedDB === 'undefined' ? memoryBackend() : indexedDbBackend();
    inventory = createInventory(createFileStore(backend));
    requestPersistence();
  }
  return inventory;
}

/** Reads everything again from the store. */
export async function loadInventory() {
  const inv = open();
  const [pieces, kits, records, state, pending] = await Promise.all([inv.listGear(), inv.listKits(), inv.listDiveEquipment(), inv.readState(), inv.pendingPaths()]);
  gear.pieces = pieces;
  gear.kits = kits;
  gear.records = records;
  const info = readOnlyInfo(state);
  gear.readOnly = info.readOnly;
  gear.daysLeft = info.daysLeft;
  gear.until = info.until;
  gear.pending = pending.length;
  gear.ready = true;
}

/**
 * A change, then the screens read again. `ReadOnlyError` goes back to the caller.
 * @template T
 * @param {(inv: ReturnType<typeof createInventory>) => Promise<T>} work
 * @returns {Promise<T>}
 */
export async function change(work) {
  const inv = open();
  try {
    return await work(inv);
  } finally {
    await loadInventory();
  }
}

/** @returns {Map<string, Gear>} */
export const gearMap = () => new Map(gear.pieces.map((g) => [g.id, g]));

/** The pieces the screens offer: the archived ones only when asked for. @param {boolean} [archived] */
export const visibleGear = (archived = false) => gear.pieces.filter((g) => archived || !g.retired);

/** What a dive used, from the working copy; empty when nothing. @param {{ date: string }} dive @returns {DiveEquipment} */
export function equipmentOf(dive) {
  const key = diveKeyOf(dive);
  const rec = gear.records.find((r) => r.diveKey?.start === key);
  return rec ? cloneEquipment({ suitGearId: rec.suitGearId ?? '', undersuitGearId: rec.undersuitGearId ?? '', gearIds: rec.gearIds ?? [], adhoc: rec.adhoc ?? [], kitId: rec.kitId ?? '' }) : emptyEquipment();
}

/** The keys of the dives that used a piece (a computer: through its serial number, below). @param {string} gearId */
export const diveKeysOf = (gearId) =>
  gear.records.filter((r) => r.suitGearId === gearId || r.undersuitGearId === gearId || (r.gearIds ?? []).includes(gearId)).map((r) => r.diveKey.start);

/** The kits that hold a piece. @param {string} gearId */
export const kitsOf = (gearId) => gear.kits.filter((k) => k.gearIds.includes(gearId));

/** @param {Gear} g @param {Map<string, number>} [computerDives] the dives each computer recorded, by `model|serial` */
export function figuresOf(g, computerDives) {
  const figures = pieceFigures(diveKeysOf(g.id), logbook.dives);
  if (g.type === 'computer') {
    const recorded = computerDives?.get(`${g.computerModel}|${g.computerSerial ?? ''}`) ?? 0;
    figures.dives = Math.max(figures.dives, recorded);
  }
  return figures;
}

/** The dives each dive computer of the logbook recorded, by `model|serial`: « Ordinateurs du carnet ». @returns {Promise<Map<string, number>>} */
export async function computerDiveCounts() {
  try {
    const list = await OpenDivesCore.diveComputers();
    return new Map(list.map((c) => [`${c.model}|${c.serial}`, c.dives]));
  } catch {
    return new Map();
  }
}

/** Sets or lifts the read-only state: what the end of an OpenDives+ subscription will do (no billing exists yet). @param {boolean} on */
export const setReadOnly = (on) => change((inv) => inv.setReadOnly(on));

/**
 * After a download: the computer it came from enters the inventory the first time, with its serial number and
 * its firmware. The logbook's entry for it gives the serial as « Ordinateurs du carnet » writes it.
 * @param {import('opendives-core').DownloadResult} result
 */
export async function noteDownloadedComputer(result) {
  try {
    const hex = (result.serial >>> 0).toString(16).toLowerCase();
    const plain = String(result.serial);
    const same = (/** @type {string} */ s) => {
      const v = s.trim().toLowerCase().replace(/^0x/, '').replace(/^0+/, '');
      return v === hex.replace(/^0+/, '') || v === plain;
    };
    const product = (result.product || '').toLowerCase();
    const list = await OpenDivesCore.diveComputers().catch(() => []);
    const entry = list.find((c) => (!product || c.model.toLowerCase().includes(product)) && c.serial && same(c.serial));
    const model = entry?.model || [result.vendor, result.product].filter(Boolean).join(' ') || result.product;
    if (!model) return;
    const serial = entry?.serial || (result.serial ? plain : '');
    const firmware = entry?.firmware || (result.firmware ? String(result.firmware) : '');
    await change((inv) => inv.recordDownloadedComputer({ vendor: result.vendor, model, serial, firmware }));
  } catch (e) {
    console.error('Adding the downloaded computer to the inventory', e);
  }
}

if (import.meta.env?.DEV) /** @type {any} */ (globalThis).__inventory = { gear, loadInventory, change, setReadOnly };
