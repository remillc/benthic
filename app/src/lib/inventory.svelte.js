// @ts-check
// The inventory on screen (task 2026-11-17-267): the pieces, the kits and the dives' equipment read from the local
// store (lib/inventory.js over lib/file-store.js), kept in one reactive object that the screens share. Every change
// goes through the functions here: write, then read again, so the screens never show what is not saved.
// The server is not wired yet (it waits for the project owner): `pending` counts the files changed on this device.
import { BenthicCore } from 'benthic-core';
import { createFileStore, indexedDbBackend, memoryBackend, requestPersistence } from './file-store.js';
import { sameComputer } from './dc-model.js';
import { suitCountKey, computerItems, suitItems, linkFields } from './logbook-pairing.js';
import { deviceStore } from './device-store.js';
import { createInventory, diveKeyOf, recordKey, startKeyOf, readOnlyInfo, pieceFigures, emptyEquipment, cloneEquipment } from './inventory.js';
import { logbook, isSubscriber } from './logbook.svelte.js';
import { planSuitPieces, planIsEmpty } from './suit-pieces.js';
import { evaluateAll, todayIso, notificationPlan, applyNotificationPlan, sections, overdueCount } from './maintenance.js';
import { settings } from './settings.svelte.js';
import { readSnoozed } from './maintenance-snooze.js';
import { signalAccountData } from './account-sync-signal.js';
import { ensureShortIds } from './short-id-migration.js';
import { isShortId } from './short-id.js';
import { onIdsComplete } from './dive-id.js';
import { startToIdMap } from './dive-id-migration.js';
import { feedCore } from './cylinder-type-library.js';

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
  /** @type {(DiveEquipment & { id: string, diveKey: { benthicId?: string, start?: string } })[]} */
  records: [],
  /** @type {import('./cylinder-type-files.js').CylinderTypeFile[]} the cylinder types the diver added */
  cylinderTypes: [],
  /** @type {import('./maintenance.js').MaintenanceItem[]} every reminder */
  maintenance: [],
  /** The inventory is read only (the Benthic+ subscription ended). */
  readOnly: false,
  daysLeft: 30,
  until: '',
  /** Files changed on this device and not sent to the server yet. */
  pending: 0,
});

// Once the dives have their ids, the records that name a dive by its start time take its id (lib/dive-id-migration.js).
onIdsComplete(async (dives) => {
  try {
    if (await open().migrateDiveIds(startToIdMap(dives))) {
      await loadInventory();
      signalAccountData('edit');
    }
  } catch (e) {
    console.error('Moving the references of the dives to their ids', e);
  }
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
  // The UUID ids of the first builds become short ids, once, before anything reads them (to-do #149).
  try {
    await ensureShortIds(inv.store);
  } catch (e) {
    console.error('Rewriting the ids as short ids', e);
  }
  // The O₂ cells of a rebreather become a piece of their own, once (task 2026-11-24-397).
  try {
    if (await inv.migrateO2Cells()) signalAccountData('edit');
  } catch (e) {
    console.error('Moving the O₂ cells of the rebreathers to their own pieces', e);
  }
  const [pieces, kits, records, state, pending, maintenance, types] = await Promise.all([inv.listGear(), inv.listKits(), inv.listDiveEquipment(), inv.readState(), inv.pendingPaths(), inv.listMaintenance(), inv.listCylinderTypes()]);
  gear.maintenance = maintenance;
  gear.cylinderTypes = types;
  // What the core offers follows the files: after a sync too.
  feedCore(types).catch((e) => console.error('Giving the cylinder types to the core', e));
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
  if (pieces.some((g) => g.suitNames?.length || (g.type === 'computer' && g.computerModel))) refreshLinkedDives().then(scheduleNotifications);
  syncSuitPieces().catch((e) => console.error('Making the logbook suits into pieces', e));
}

let suitSyncRunning = false;
let suitSyncAgain = false;

/**
 * Every distinct suit text of the logbook is a piece of type suit (task 2026-11-26-406), for a Benthic+ account: the texts no
 * piece has become pieces, tied through `suitNames`; the texts the diver deleted stay deleted. Idempotent; run at the load of
 * the inventory and after a dive's suit changes. Nothing happens read only, without the core, or for a free account.
 */
export async function syncSuitPieces() {
  if (suitSyncRunning) {
    suitSyncAgain = true;
    return;
  }
  if (!gear.ready || gear.readOnly || !isSubscriber()) return;
  suitSyncRunning = true;
  try {
    do {
      suitSyncAgain = false;
      /** @type {{ key: string, dives: number }[]} */
      let values;
      try {
        values = await BenthicCore.statsQuery({ kind: 'values', field: 'suit' });
      } catch {
        return;
      }
      const inv = open();
      const plan = planSuitPieces(values, await inv.listGear(), await inv.dismissedSuits());
      if (planIsEmpty(plan)) continue;
      await inv.applySuitPlan(plan);
      await loadInventory();
      signalAccountData('edit');
    } while (suitSyncAgain);
  } finally {
    suitSyncRunning = false;
  }
}

/**
 * The suit piece for a text typed in a dive's Combinaison field (a new one when none has it), tied to the text.
 * @param {string} text
 * @returns {Promise<Gear|null>}
 */
export async function suitPieceFor(text) {
  const piece = await change((inv) => inv.suitPieceFor(text));
  refreshLinkedDives().then(scheduleNotifications);
  return piece;
}

/** « Associer aux plongées du carnet »: moves suit texts to a piece, away from the piece that had them. @param {string} gearId @param {string[]} names */
export async function moveSuitNames(gearId, names) {
  await change((inv) => inv.moveSuitNames(gearId, names));
  refreshLinkedDives().then(scheduleNotifications);
}

/**
 * The reminders with their due dates, today: the ones of pieces that are not archived. Reads the reactive state, so
 * a screen can use it in a $derived.
 * @returns {import('./maintenance.js').Evaluation[]}
 */
export function evaluations() {
  return evaluateAll({ items: gear.maintenance, pieces: gear.pieces, diveKeysOf: diveStartsOf, today: todayIso() });
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
    signalAccountData('edit');
  }
}

/** The cylinder types the diver added, read from the store. */
export const readCylinderTypes = () => open().listCylinderTypes();

/**
 * Adds, changes and removes added cylinder types in one step: the screens, the core and the sync follow. Not refused when
 * the subscription ended.
 * @param {import('./cylinder-type-files.js').CylinderTypeFile[]} files
 * @param {string[]} [removeIds]
 */
export async function changeCylinderTypes(files, removeIds = []) {
  const inv = open();
  await inv.changeCylinderTypes(files, removeIds);
  gear.cylinderTypes = await inv.listCylinderTypes();
  await feedCore(gear.cylinderTypes, true);
  signalAccountData('edit');
}

/** The weight type files of the diver (Settings › Types de lest). */
export const readWeightTypes = () => open().listWeightTypes();

/**
 * Adds, changes and removes weight type files in one step; the sync follows. Not refused when the subscription ended.
 * @param {import('./weight-type-files.js').WeightTypeFile[]} files
 * @param {string[]} [removeIds]
 */
export async function changeWeightTypes(files, removeIds = []) {
  await open().changeWeightTypes(files, removeIds);
  signalAccountData('edit');
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
  const rec = gear.records.find((r) => recordKey(r.diveKey) === key);
  return rec ? cloneEquipment({ suitGearId: rec.suitGearId ?? '', undersuitGearId: rec.undersuitGearId ?? '', gearIds: rec.gearIds ?? [], adhoc: rec.adhoc ?? [], kitId: rec.kitId ?? '' }) : emptyEquipment();
}

/** The keys of the dives that used a piece (a computer: through its serial number, below). @param {string} gearId */
export const diveKeysOf = (gearId) =>
  gear.records.filter((r) => r.suitGearId === gearId || r.undersuitGearId === gearId || (r.gearIds ?? []).includes(gearId)).map((r) => recordKey(r.diveKey));

/**
 * The start times of the dives where a piece was used (the reminders count dives by their day): a record holds the dive's
 * Benthic id, read here as the dive's start; one whose dive is not in the logbook is left out.
 * @param {string} gearId
 * @returns {string[]}
 */
export function diveStartsOf(gearId) {
  const starts = new Map(logbook.dives.map((d) => [diveKeyOf(d), startKeyOf(d)]));
  const own = diveKeysOf(gearId).map((k) => (isShortId(k) ? starts.get(k) ?? '' : k)).filter(Boolean);
  return [...new Set([...own, ...(linked.starts[gearId] ?? [])])];
}

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
  if (g.suitNames?.length) {
    // The dives whose « Combinaison » text is one of those tied to the piece (task 2026-11-26-405); a dive holds one text.
    let tied = 0;
    // Spellings of one text (case, accents) share one count.
    for (const key of new Set(g.suitNames.map(suitCountKey))) tied += computerDives?.get(key) ?? 0;
    figures.dives = Math.max(figures.dives, tied);
  }
  return figures;
}

/**
 * The dives each dive computer of the logbook recorded, by `model|serial`: « Ordinateurs du carnet ». The dives of each suit
 * text are counted in the same map under `suitCountKey(text)`, for the suits tied to a piece.
 * @returns {Promise<Map<string, number>>}
 */
export async function computerDiveCounts() {
  /** @type {Map<string, number>} */
  const counts = new Map();
  try {
    const list = await BenthicCore.diveComputers();
    for (const c of list) counts.set(`${c.model}|${c.serial}`, c.dives);
  } catch {
    // no computer figures
  }
  try {
    if (gear.pieces.some((g) => g.suitNames?.length)) {
      /** @type {{ key: string, dives: number }[]} */
      const values = await BenthicCore.statsQuery({ kind: 'values', field: 'suit' });
      for (const v of values) if (v.key) counts.set(suitCountKey(v.key), (counts.get(suitCountKey(v.key)) ?? 0) + v.dives);
    }
  } catch {
    // no suit figures
  }
  return counts;
}

/** The years of the first and the latest dive among the dives of the rows that the filter keeps. @param {Set<number>} ids */
function yearsOf(ids) {
  let first = 0;
  let last = 0;
  for (const d of logbook.dives) {
    if (!ids.has(d.id)) continue;
    const y = Number(d.date.slice(0, 4));
    if (!first || y < first) first = y;
    if (y > last) last = y;
  }
  return { first, last };
}

/** The dives a filter rule keeps, as ids. @param {string} type @param {string[]} names */
async function divesOfRule(type, names) {
  const data = names.map((n) => `${n}
`).join('');
  return new Set(/** @type {number[]} */ (await BenthicCore.filterQuery({ kind: 'dives', rules: [{ type, stringMode: 'exact', data }] })));
}

/**
 * What the logbook holds that a piece can be paired with (task 2026-11-26-405): its dive computers (model, serial, dives,
 * first and latest year) and the texts of the suits, each with the piece that already has it. The years of a computer are
 * those of its model (the core's filter knows computers by name). Empty lists when the core cannot answer.
 * @param {string} [exceptId] a piece whose own links are not counted as taken
 * @returns {Promise<{ computers: import('./logbook-pairing.js').LogbookComputerItem[], suits: import('./logbook-pairing.js').LogbookSuitItem[] }>}
 */
export async function logbookPairing(exceptId = '') {
  await loadInventory();
  const [computers, suits] = await Promise.all([
    BenthicCore.diveComputers().then((list) => computerItems(list, gear.pieces, exceptId)).catch(() => []),
    BenthicCore.statsQuery({ kind: 'values', field: 'suit' }).then((values) => suitItems(values, gear.pieces, exceptId)).catch(() => []),
  ]);
  const options = await BenthicCore.filterQuery({ kind: 'options' }).catch(() => ({ computers: [] }));
  const names = /** @type {string[]} */ (options.computers ?? []);
  await Promise.all([
    ...computers.map(async (c) => {
      try {
        const matching = names.filter((n) => n.toLowerCase().includes(c.model.toLowerCase()));
        if (matching.length) Object.assign(c, yearsOf(await divesOfRule('dive_computer', matching)));
      } catch {
        // no years
      }
    }),
    ...suits.map(async (s) => {
      try {
        Object.assign(s, yearsOf(await divesOfRule('suit', [s.name])));
      } catch {
        // no years
      }
    }),
  ]);
  return { computers, suits };
}

/**
 * « Associer aux plongées du carnet »: ties an existing piece to computers or suit texts of the logbook. The piece's file
 * holds the links, so they are synced; the dives count for it at once. Throws `LINKED_ELSEWHERE:…` when a value is tied to another piece.
 * @param {string} gearId
 * @param {{ computer?: { model: string, serial: string }, suitNames?: string[] }} link
 */
export async function pairWithLogbook(gearId, link) {
  const piece = gear.pieces.find((g) => g.id === gearId);
  if (!piece) return;
  await change((inv) => inv.saveGear({ ...piece, ...linkFields(piece, link) }));
}

/** The start of each dive tied to a piece through the logbook's values (computer model, suit texts), by piece id: they count for its reminders. @type {{ starts: Record<string, string[]> }} */
const linked = $state({ starts: {} });

/** Reads again which dives the tied pieces have; the reminders follow. */
export async function refreshLinkedDives() {
  /** @type {Record<string, string[]>} */
  const starts = {};
  try {
    const startOf = new Map(logbook.dives.map((d) => [d.id, startKeyOf(d)]));
    for (const g of gear.pieces) {
      let rule = null;
      if (g.type === 'computer' && g.computerModel) {
        const options = await BenthicCore.filterQuery({ kind: 'options' });
        const model = g.computerModel.toLowerCase();
        const names = /** @type {string[]} */ ((options.computers ?? []).filter((n) => n.toLowerCase().includes(model)));
        if (names.length) rule = { type: 'dive_computer', names };
      } else if (g.suitNames?.length) rule = { type: 'suit', names: g.suitNames };
      if (!rule) continue;
      const ids = await divesOfRule(rule.type, rule.names);
      starts[g.id] = [...ids].map((i) => startOf.get(i) ?? '').filter(Boolean);
    }
  } catch (e) {
    console.error('Reading the dives tied to the pieces', e);
    return;
  }
  linked.starts = starts;
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
