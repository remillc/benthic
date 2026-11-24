// @ts-check
// The O₂ cells of a rebreather become a piece of their own (task 2026-11-24-397, to-do #199). Until then a rebreather kept the
// date its cells were made and the date they were installed in its `details` (`o2CellsMadeOn`, `o2CellsOn`) and a reminder
// of task `o2Cells`. This plans, as pure data, the move of those dates into a piece of type `o2Cells` (brand left empty) and of
// the reminder with them. `ensureO2Cells` in lib/inventory.js writes the plan.
//
// Rules, because the files are synchronised between devices and an older app may still read them:
//  - Idempotent and the same on every device. The new piece's id is derived from the rebreather's id (`cellsPieceId`) and all
//    its fields from the rebreather's file (no clock, no language, no random), so two devices that migrate before they sync write
//    the same bytes and nothing is created twice. Run again, the plan is empty.
//  - No date is lost. A date leaves the rebreather only once the cells piece holds it. If the cells piece already holds another
//    date for the same field (edited meanwhile), both stay: the piece's, and the rebreather's key, which is not shown but kept.
//  - The rebreather's other keys, `updatedAt` and every unknown key of its file are left as they are; the reminder keeps its
//    history and its id, only its `gearId` changes.
//  - An older app that reads the new piece sees a piece of a type it does not know: it lists it under « Autres » and keeps its
//    fields (unknown keys of `details` are kept when it saves). It does not delete it.

import { deriveId } from './short-id.js';

/** @typedef {import('./inventory.js').Gear} Gear */
/** @typedef {import('./maintenance.js').MaintenanceItem} MaintenanceItem */

/** The keys of a rebreather's `details` that move, and the key they take in the cells piece. */
export const MOVED_KEYS = /** @type {const} */ ({ o2CellsMadeOn: 'cellsMadeOn', o2CellsOn: 'cellsInstalledOn' });

/** The id of the cells piece made from a rebreather: the same on every device. @param {string} rebreatherId */
export const cellsPieceId = (rebreatherId) => deriveId(`o2-cells|${rebreatherId}`);

/**
 * A reminder that holds something of the diver's: a history, a date, a rule or a choice other than what a rebreather got
 * when it was added (12 months, no dive count, the default lead time, the warning on).
 * @param {MaintenanceItem} item
 */
export const isMeaningful = (item) =>
  (item.history?.length ?? 0) > 0 || !!item.dueOn || !!item.lastDoneOn || item.intervalMonths !== 12 || item.intervalDives != null || item.notifyDays != null || item.warnInDive === false;

/**
 * @typedef {Object} Plan
 * @property {[string, unknown][]} writes
 * @property {string[]} removes
 */

/**
 * What to write so that every rebreather's cell dates and reminder move to its cells piece.
 * @param {{ gear: Gear[], maintenance: MaintenanceItem[] }} files
 * @returns {Plan}
 */
export function planO2Cells({ gear, maintenance }) {
  /** @type {[string, unknown][]} */
  const writes = [];
  /** @type {string[]} */
  const removes = [];
  const byId = new Map(gear.map((g) => [g.id, g]));
  /** The ids of the pieces whose reminder of the cells is already settled (one per piece). */
  const hasCellsItem = new Set(maintenance.filter((m) => m.task === 'o2Cells').map((m) => m.gearId));

  for (const g of gear) {
    if (g.type !== 'rebreather') continue;
    const details = g.details ?? {};
    /** @type {Record<string, string>} */
    const moving = {};
    for (const [from, to] of Object.entries(MOVED_KEYS)) {
      const v = typeof details[from] === 'string' ? details[from].trim() : '';
      if (v) moving[to] = v;
    }
    const items = maintenance.filter((m) => m.gearId === g.id && m.task === 'o2Cells');
    const kept = items.filter(isMeaningful);
    // A reminder that only has what a new rebreather got holds nothing: it goes, the rule is no longer the rebreather's.
    for (const m of items) if (!isMeaningful(m)) removes.push(`maintenance/${m.id}.json`);
    if (!Object.keys(moving).length && !kept.length && !Object.keys(details).some((k) => k in MOVED_KEYS)) continue;

    const id = cellsPieceId(g.id);
    const existing = byId.get(id);
    if (existing && existing.type !== 'o2Cells') continue; // never overwrite another piece

    /** The cells piece's dates after the move, and the rebreather's keys that can leave. @type {Record<string, string>} */
    const cellDetails = { ...(existing?.details ?? {}) };
    /** @type {string[]} */
    const leaving = [];
    for (const [from, to] of Object.entries(MOVED_KEYS)) {
      if (!(from in details)) continue;
      const v = moving[to];
      if (!v) {
        leaving.push(from); // an empty value holds nothing
      } else if (!cellDetails[to]) {
        cellDetails[to] = v;
        leaving.push(from);
      } else if (cellDetails[to] === v) {
        leaving.push(from);
      } // else: the piece holds another date: the rebreather keeps its own
    }

    const moveReminder = kept.length > 0 && !hasCellsItem.has(id);
    const needsPiece = Object.keys(cellDetails).length > 0 || moveReminder;
    if (needsPiece) {
      const changed = !existing || JSON.stringify(existing.details ?? {}) !== JSON.stringify(cellDetails);
      if (changed) {
        const stamp = g.updatedAt ?? g.createdAt ?? '';
        /** @type {Gear} */
        const piece = existing
          ? { ...existing, details: cellDetails }
          : {
              format: 1,
              id,
              createdAt: g.createdAt ?? stamp,
              updatedAt: stamp,
              type: 'o2Cells',
              // No word of any language: the name is the same on every device (the diver may rename it).
              name: `O₂ · ${g.name}`,
              retired: g.retired === true,
              ...(g.retired === true && g.retiredOn ? { retiredOn: g.retiredOn } : {}),
              ...(g.retired === true && g.retiredReason ? { retiredReason: g.retiredReason } : {}),
              details: cellDetails,
            };
        writes.push([`gear/${id}.json`, piece]);
      }
    }
    if (moveReminder) {
      const [first] = kept;
      writes.push([`maintenance/${first.id}.json`, { ...first, gearId: id }]);
      hasCellsItem.add(id);
    }
    if (leaving.length && (needsPiece || !Object.keys(moving).length)) {
      const rest = { ...details };
      for (const k of leaving) delete rest[k];
      /** @type {Record<string, any>} */
      const next = { ...g };
      if (Object.keys(rest).length) next.details = rest;
      else delete next.details;
      writes.push([`gear/${g.id}.json`, next]);
    }
  }
  return { writes, removes };
}
