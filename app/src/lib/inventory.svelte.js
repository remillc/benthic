// @ts-check
// The inventory on screen (task 2026-11-17-267): the pieces, the kits and the dives' equipment read from the local
// store (lib/inventory.js over lib/file-store.js), kept in one reactive object that the screens share. Every change
// goes through the functions here: write, then read again, so the screens never show what is not saved.
// The server is not wired yet (it waits for the project owner): `pending` counts the files changed on this device.
import { BenthicCore } from 'benthic-core';
import { createFileStore, indexedDbBackend, memoryBackend, requestPersistence } from './file-store.js';
import { sameComputer } from './dc-model.js';
import { deviceStore } from './device-store.js';
import { createInventory, diveKeyOf, readOnlyInfo, pieceFigures, emptyEquipment, cloneEquipment } from './inventory.js';
import { logbook } from './logbook.svelte.js';
import { evaluateAll, todayIso, notificationPlan, applyNotificationPlan, sections, overdueCount } from './maintenance.js';
import { settings } from './settings.svelte.js';
import { readSnoozed } from './maintenance-snooze.js';

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
  /** @type {import('./maintenance.js').MaintenanceItem[]} every reminder */
  maintenance: [],
  /** The inventory is read only (the Benthic+ subscription ended). */
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
  await inv.migrateGearPhotos();
  const [pieces, kits, records, state, pending, maintenance] = await Promise.all([inv.listGear(), inv.listKits(), inv.listDiveEquipment(), inv.readState(), inv.pendingPaths(), inv.listMaintenance()]);
  gear.maintenance = maintenance;
  gear.pieces = pieces;
  // A retired piece has left the kits' screens (it stays in the kit file, for « Remettre en service »).
  const retiredIds = new Set(pieces.filter((g) => g.retired).map((g) => g.id));
  gear.kits = kits.map((k) => ({ ...k, gearIds: k.gearIds.filter((gid) => !retiredIds.has(gid)) }));
  gear.records = records;
  const info = readOnlyInfo(state);
  gear.readOnly = info.readOnly;
  gear.daysLeft = info.daysLeft;
  gear.until = info.until;
  gear.pending = pending.length;
  gear.ready = true;
  scheduleNotifications();
}

/**
 * The reminders with their due dates, today: the ones of pieces that are not archived. Reads the reactive state, so
 * a screen can use it in a $derived.
 * @returns {import('./maintenance.js').Evaluation[]}
 */
export function evaluations() {
  return evaluateAll({ items: gear.maintenance, pieces: gear.pieces, diveKeysOf, today: todayIso() });
}

/** Whether a non-retired piece has an active maintenance reminder. */
export const hasActiveMaintenance = () => evaluations().some((e) => e.active);

/** The number on the red badge: reminders overdue. */
export const overdueBadge = () => overdueCount(evaluations());

/** The three sections of the « Entretien » list. */
export const maintenanceSections = () => sections(evaluations());

/** Hands the notifications to come to the seam (lib/maintenance.js), with the choices of Réglages › Notifications. */
export function scheduleNotifications() {
  try {
    const options = { enabled: settings.maintenanceNotify, defaultDays: settings.maintenanceLeadDays, remindOverdue: settings.maintenanceOverdue, snoozed: readSnoozed() };
    applyNotificationPlan(notificationPlan(evaluations(), todayIso(), options)).catch((e) => console.error('Scheduling the maintenance notifications', e));
  } catch (e) {
    console.error('Planning the maintenance notifications', e);
  }
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

/** A photo kept in the inventory, as a data URL; '' when the file is gone. @param {string} photoId */
export const readPhoto = (photoId) => open().readPhoto(photoId);

/** @returns {Map<string, Gear>} */
export const gearMap = () => new Map(gear.pieces.map((g) => [g.id, g]));

/** The pieces the screens offer: the retired ones only when asked for. @param {boolean} [retired] */
export const visibleGear = (retired = false) => gear.pieces.filter((g) => retired || !g.retired);

/** « Pièces retirées »: the retired pieces, the latest retired first. */
export const retiredGear = () => gear.pieces.filter((g) => g.retired).sort((a, b) => ((b.retiredOn ?? '') > (a.retiredOn ?? '') ? 1 : (b.retiredOn ?? '') < (a.retiredOn ?? '') ? -1 : a.name.localeCompare(b.name)));

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
    // The logbook's computer with the same brand, model and serial number (task 2026-11-19-306).
    let recorded = computerDives?.get(`${g.computerModel}|${g.computerSerial ?? ''}`) ?? 0;
    for (const [key, n] of computerDives ?? []) {
      const cut = key.lastIndexOf('|');
      if (sameComputer(g, { model: key.slice(0, cut), serial: key.slice(cut + 1) })) recorded = Math.max(recorded, n);
    }
    figures.dives = Math.max(figures.dives, recorded);
  }
  return figures;
}

/** The dives each dive computer of the logbook recorded, by `model|serial`: « Ordinateurs du carnet ». @returns {Promise<Map<string, number>>} */
export async function computerDiveCounts() {
  try {
    const list = await BenthicCore.diveComputers();
    return new Map(list.map((c) => [`${c.model}|${c.serial}`, c.dives]));
  } catch {
    return new Map();
  }
}

/**
 * The figures of a dive computer from the dives it recorded: the logbook's filter on the computer (its name in the
 * logbook's list of computers), then the rows of those dives. Null when the core cannot answer.
 * @param {Gear} g
 * @returns {Promise<{ dives: number, seconds: number, deepestMm: number, last: string }|null>}
 */
export async function computerFigures(g) {
  try {
    const options = await BenthicCore.filterQuery({ kind: 'options' });
    const model = (g.computerModel ?? g.name).toLowerCase();
    const names = /** @type {string[]} */ (options.computers ?? []).filter((n) => n.toLowerCase().includes(model));
    if (!names.length) return null;
    // One value per line, as the filter screen sends them.
    const data = names.map((n) => `${n}\n`).join('');
    const ids = new Set(/** @type {number[]} */ (await BenthicCore.filterQuery({ kind: 'dives', rules: [{ type: 'dive_computer', stringMode: 'exact', data }] })));
    let seconds = 0;
    let deepestMm = 0;
    let last = '';
    let dives = 0;
    for (const d of logbook.dives) {
      if (!ids.has(d.id)) continue;
      dives++;
      seconds += d.durationSeconds;
      deepestMm = Math.max(deepestMm, d.maxDepthMm);
      if (d.date > last) last = d.date;
    }
    return { dives, seconds, deepestMm, last };
  } catch {
    return null;
  }
}

/** Sets or lifts the read-only state: what the end of a Benthic+ subscription will do (no billing exists yet). @param {boolean} on */
export const setReadOnly = (on) => change((inv) => inv.setReadOnly(on));

/**
 * After a download: the computer it came from enters the inventory the first time, with its serial number and
 * its firmware. The logbook's entry for it gives the serial as « Ordinateurs du carnet » writes it.
 * @param {import('benthic-core').DownloadResult} result
 * @param {boolean} [subscriber] a Benthic+ account: the end of the download offers to add the computer
 */
export async function noteDownloadedComputer(result, subscriber = false) {
  computerOffer.computer = null;
  try {
    const hex = (result.serial >>> 0).toString(16).toLowerCase();
    const plain = String(result.serial);
    const same = (/** @type {string} */ s) => {
      const v = s.trim().toLowerCase().replace(/^0x/, '').replace(/^0+/, '');
      return v === hex.replace(/^0+/, '') || v === plain;
    };
    const product = (result.product || '').toLowerCase();
    const list = await BenthicCore.diveComputers().catch(() => []);
    const entry = list.find((c) => (!product || c.model.toLowerCase().includes(product)) && c.serial && same(c.serial));
    const model = entry?.model || [result.vendor, result.product].filter(Boolean).join(' ') || result.product;
    if (!model) return;
    const serial = entry?.serial || (result.serial ? plain : '');
    const firmware = entry?.firmware || (result.firmware ? String(result.firmware) : '');
    const computer = { vendor: result.vendor, model, serial, firmware };
    // A computer already in the equipment (brand, model and serial number) gets its firmware refreshed. One that is not
    // is offered at the end of the download (Benthic+ only); « Plus tard » hides the offer for that computer.
    const known = await change((inv) => inv.recordDownloadedComputer(computer, { add: false }));
    const key = offerKey(computer);
    if (!known?.gear && subscriber && !hiddenOffers().includes(key)) computerOffer.computer = computer;
  } catch (e) {
    console.error('Offering the downloaded computer for the inventory', e);
  }
}

/** The card « Ajouter le Petrel 3 à votre équipement ? » at the end of a download: the computer it is about, or null. @type {{ computer: { vendor?: string, model: string, serial: string, firmware: string }|null }} */
export const computerOffer = $state({ computer: null });

/** @param {{ model: string, serial: string }} c */
const offerKey = (c) => `${c.model}|${c.serial}`;
const HIDDEN_KEY = 'bc.computerOfferHidden';
/** The computers whose offer was put off with « Plus tard », on this device. @returns {string[]} */
function hiddenOffers() {
  try {
    return JSON.parse(deviceStore.getItem(HIDDEN_KEY) ?? '[]');
  } catch {
    return [];
  }
}

/** « Ajouter »: the piece is created with brand, model, serial number and firmware; its photo is the model's. */
export async function addOfferedComputer() {
  const c = computerOffer.computer;
  if (!c) return null;
  computerOffer.computer = null;
  const done = await change((inv) => inv.recordDownloadedComputer(c));
  return done?.gear ?? null;
}

/** « Plus tard »: the offer is hidden for that computer. */
export function putOffComputer() {
  const c = computerOffer.computer;
  computerOffer.computer = null;
  if (!c) return;
  const list = hiddenOffers();
  const key = offerKey(c);
  if (!list.includes(key)) deviceStore.setItem(HIDDEN_KEY, JSON.stringify([...list, key]));
}

if (import.meta.env?.DEV) /** @type {any} */ (globalThis).__inventory = { gear, loadInventory, change, setReadOnly };

/** The inventory's store and writes, for the other Benthic data of a dive (lib/validation.svelte.js). */
export const inventoryApi = () => open();
