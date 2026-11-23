// @ts-check
// The stable identifier of a dive (decided on 23 November 2026): the extra data `Benthic id` of the dive, 10 characters of
// lowercase Crockford base32 (lib/short-id.js). The core's own ids (`dive.id`) change at every read of the log; the Benthic id is
// written once, kept by Subsurface's git round trip and shared by every device.
//
// What is here is pure, so that tests read it:
//  - `planBenthicIds`: from the core's audit of every dive, which dives get an id (none, or a repeat: the later one by start time);
//  - the map between the two ids, `coreIdOf` and `benthicIdOf`, built from the dive list the app holds. It is the one place that
//    turns a Benthic id into the id the core's calls take; a route, a link or a stored reference holds a Benthic id;
//  - `diveUrl`, the address of a dive, and `coreIdOfParam`, which reads the address back (an old numeric address is still read,
//    as a core id of the running session: links in flight).
//
// docs/architecture.md, section 11 ("What goes in the dive's extra data").

import { isShortId, newId } from './short-id.js';

/**
 * @typedef {{ id: number, benthicId: string, when: number, plan?: boolean }} AuditedDive one dive of the core's audit
 *   (`BenthicCore.benthicIds({ action: 'audit' })`): the core's id, its Benthic id ('' when none), its start time (seconds)
 */

/**
 * Which dives need an id, and the id to give. A dive needs one when it has none (or a value that is not a Benthic id), or when
 * another dive has the same one: of the dives that share an id, the earliest by start time keeps it (the table order breaks a
 * tie), the others get a new one. An id that is made never repeats one in the log or one already made in this call.
 * @param {AuditedDive[]} audit every dive of the log, in table order
 * @param {() => string} [makeId] the generator of ids (tests pass their own)
 * @returns {Record<string, string>} core id -> new Benthic id; empty when every dive has its own
 */
export function planBenthicIds(audit, makeId = newId) {
  const taken = new Set(audit.map((d) => d.benthicId).filter(isShortId));
  /** @type {Map<string, AuditedDive[]>} */
  const byId = new Map();
  /** @type {AuditedDive[]} */
  const needing = [];
  for (const d of audit) {
    if (!isShortId(d.benthicId)) {
      needing.push(d);
      continue;
    }
    const same = byId.get(d.benthicId);
    if (same) same.push(d);
    else byId.set(d.benthicId, [d]);
  }
  for (const same of byId.values()) {
    if (same.length < 2) continue;
    // The earliest keeps it; `sort` is stable, so the table order breaks a tie.
    const [, ...later] = [...same].sort((a, b) => a.when - b.when);
    needing.push(...later);
  }
  /** @type {Record<string, string>} */
  const out = {};
  for (const d of needing) {
    let id = makeId();
    while (taken.has(id)) id = makeId();
    taken.add(id);
    out[String(d.id)] = id;
  }
  return out;
}

/** Whether a dive list has a dive with no id or two dives with the same one (the quick test before the audit). @param {{ benthicId?: string }[]} dives */
export function idsLookIncomplete(dives) {
  const seen = new Set();
  for (const d of dives) {
    if (!isShortId(d.benthicId) || seen.has(d.benthicId)) return true;
    seen.add(d.benthicId);
  }
  return false;
}

/**
 * The pass that gives every dive its id: audits the log, assigns what `planBenthicIds` plans. Never throws for a log that
 * cannot be written (a locked cloud log, a version opened read only): it answers 0 and the pass runs again at the next load.
 * @param {{ benthicIds: (o: { action: 'audit'|'assign', assignments?: string }) => Promise<any> }} core
 * @param {() => string} [makeId]
 * @returns {Promise<number>} how many dives got an id
 */
export async function assignMissingIds(core, makeId = newId) {
  const audit = /** @type {AuditedDive[]} */ (await core.benthicIds({ action: 'audit' }));
  const plan = planBenthicIds(audit, makeId);
  if (!Object.keys(plan).length) return 0;
  try {
    const result = await core.benthicIds({ action: 'assign', assignments: JSON.stringify(plan) });
    return Number(result?.assigned ?? 0);
  } catch (e) {
    console.error('Giving the dives their ids', e);
    return 0;
  }
}

// --- Who waits for the ids ------------------------------------------------------------------------------------------------------

/** @type {((dives: readonly { date: string, benthicId?: string }[]) => void)[]} */
const idListeners = [];
let notifiedCount = -1;

/** Registers what runs when a loaded list has an id on every dive (the move of the references, lib/dive-id-migration.js). @param {(dives: readonly { date: string, benthicId?: string }[]) => void} fn */
export function onIdsComplete(fn) {
  idListeners.push(fn);
}

/** Called by the logbook for each list it holds; the listeners run when a complete list has a number of dives they have not seen (not at every edit). @param {readonly { date: string, benthicId?: string }[]} dives */
export function noteIdsList(dives) {
  if (!dives.length || notifiedCount === dives.length || idsLookIncomplete(dives)) return;
  notifiedCount = dives.length;
  for (const fn of idListeners) fn(dives);
}

// --- The map between the core's id and the Benthic id -----------------------------------------------------------------------

/** @type {{ dives: readonly { id: number, benthicId?: string }[] | null, core: Map<string, number>, benthic: Map<number, string> }} */
const map = { dives: null, core: new Map(), benthic: new Map() };

/** Reads the map from the dives the app holds, once per list (the list is replaced whole, never edited). @param {readonly { id: number, benthicId?: string }[]} dives */
function readMap(dives) {
  if (map.dives === dives) return;
  map.dives = dives;
  map.core = new Map();
  map.benthic = new Map();
  for (const d of dives) {
    if (!isShortId(d.benthicId)) continue;
    if (!map.core.has(d.benthicId)) map.core.set(d.benthicId, d.id);
    map.benthic.set(d.id, d.benthicId);
  }
}

/** @type {() => readonly { id: number, benthicId?: string }[]} where the dives are read from; `useDives` sets it */
let source = () => [];

/** Tells the map where the app's dive list is (logbook.svelte.js). @param {() => readonly { id: number, benthicId?: string }[]} read */
export function useDives(read) {
  source = read;
  map.dives = null;
}

/**
 * The core's id of a dive, from its Benthic id; 0 when no dive has it.
 * @param {string} benthicId
 * @param {readonly { id: number, benthicId?: string }[]} [dives] the list to read (the app's own by default)
 */
export function coreIdOf(benthicId, dives = source()) {
  readMap(dives);
  return map.core.get(benthicId) ?? 0;
}

/**
 * The Benthic id of a dive, from the core's id; '' when it has none yet.
 * @param {number} coreId
 * @param {readonly { id: number, benthicId?: string }[]} [dives]
 */
export function benthicIdOf(coreId, dives = source()) {
  readMap(dives);
  return map.benthic.get(coreId) ?? '';
}

/**
 * The address of a dive: its Benthic id, or the core's id while it has none (a dive just made, before the id pass). @param {{ id: number, benthicId?: string }} dive
 */
export const diveUrl = (dive) => `/dives/${isShortId(dive.benthicId) ? dive.benthicId : benthicIdOf(dive.id) || dive.id}`;

/** The address of a dive known by its core's id. @param {number} coreId */
export const diveUrlOfCore = (coreId) => diveUrl({ id: coreId, benthicId: benthicIdOf(coreId) });

/** The dive part of an address, from the core's id: the Benthic id, or the core's id while the dive has none. @param {number} coreId */
export const diveParamOf = (coreId) => benthicIdOf(coreId) || String(coreId);

/**
 * The core's id that an address stands for. A Benthic id is looked up in the map; a number is an address from before the Benthic
 * ids, read as a core id of the running session (a link still in flight). 0 when the address stands for no dive.
 * @param {string|undefined} param
 * @param {readonly { id: number, benthicId?: string }[]} [dives]
 */
export function coreIdOfParam(param, dives = source()) {
  if (!param) return 0;
  if (isShortId(param)) return coreIdOf(param, dives);
  return /^\d+$/.test(param) ? Number(param) : 0;
}
