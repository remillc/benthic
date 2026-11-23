// @ts-check
// Dive ids across a reload of the log. The ids of the core (`listLoadedDives`, `getDive`, the routes `/dives/<id>`) are
// Subsurface's in-memory ids: every time the core reads the logbook again (a sync that brought changes from another
// device, a restore, a load) all of them are new. This module finds, for each old id, the dive it became, by the dive's
// own data, and tells whoever holds ids (the open dive page, an edit form, the selection) so that they follow.

/** @typedef {{ id: number, date: string, number?: number, durationSeconds?: number, maxDepthMm?: number }} DiveEntry */

/** The most old ids remembered (oldest dropped first): ids only grow, an old one is rarely asked again. */
const MAX_KEPT = 60000;

/** @type {Map<number, number|null>} an id read before a reload → the id it has now (null: the dive is gone) */
const chain = new Map();
/** @type {Set<() => void>} */
const listeners = new Set();

/**
 * The old dive list against the new one: the old id → the new id of the same dive (null when it is gone), or null when
 * the ids were not renumbered (an edit, an import, a deletion keep the ids of the dives that stay; a reload gives
 * every dive a new one, none of the old ids comes back).
 *
 * The same dive is the one with the same start date-time; several at the same minute are told apart by number,
 * then duration and depth, then by their order; what is left is paired by number when that is unambiguous.
 * @param {DiveEntry[]} before
 * @param {DiveEntry[]} after
 * @returns {Map<number, number|null>|null}
 */
export function matchReload(before, after) {
  if (!before.length || !after.length) return null;
  const known = new Set(before.map((d) => d.id));
  if (after.some((d) => known.has(d.id))) return null;

  /** @type {Map<number, number|null>} */
  const result = new Map(before.map((d) => [d.id, null]));
  /** @type {Map<string, DiveEntry[]>} */
  const oldByDate = new Map();
  /** @type {Map<string, DiveEntry[]>} */
  const newByDate = new Map();
  for (const [list, map] of /** @type {const} */ ([[before, oldByDate], [after, newByDate]])) {
    for (const d of list) {
      const same = map.get(d.date);
      if (same) same.push(d);
      else map.set(d.date, [d]);
    }
  }
  /** @type {DiveEntry[]} */
  const lostOld = [];
  /** @type {Set<number>} */
  const taken = new Set();
  for (const [date, olds] of oldByDate) {
    const news = newByDate.get(date) ?? [];
    /** @type {DiveEntry[]} */
    let leftOld = [...olds];
    /** @type {DiveEntry[]} */
    let leftNew = [...news];
    /** @param {(a: DiveEntry, b: DiveEntry) => boolean} same */
    const pair = (same) => {
      for (const o of [...leftOld]) {
        const found = leftNew.filter((n) => same(o, n));
        // Only an unambiguous pair: two equal candidates wait for the order rule.
        if (found.length === 1 && leftOld.filter((x) => same(x, found[0])).length === 1) {
          result.set(o.id, found[0].id);
          taken.add(found[0].id);
          leftOld = leftOld.filter((x) => x !== o);
          leftNew = leftNew.filter((x) => x !== found[0]);
        }
      }
    };
    pair((a, b) => leftOld.length === 1 && leftNew.length === 1);
    pair((a, b) => a.number === b.number && a.durationSeconds === b.durationSeconds && a.maxDepthMm === b.maxDepthMm);
    pair((a, b) => a.number === b.number);
    // What is left at this minute and has as many dives on each side: in the order of the lists.
    if (leftOld.length && leftOld.length === leftNew.length) {
      leftOld.forEach((o, i) => {
        result.set(o.id, leftNew[i].id);
        taken.add(leftNew[i].id);
      });
      leftOld = [];
    }
    lostOld.push(...leftOld);
  }
  // A dive whose start time changed on another device: paired by its number when only one of each has it.
  if (lostOld.length) {
    const freeNew = after.filter((d) => !taken.has(d.id));
    for (const o of lostOld) {
      if (!o.number) continue;
      const candidates = freeNew.filter((n) => n.number === o.number);
      if (candidates.length === 1 && lostOld.filter((x) => x.number === o.number).length === 1) {
        result.set(o.id, candidates[0].id);
        taken.add(candidates[0].id);
      }
    }
  }
  return result;
}

/**
 * Notes that the dive list was replaced: when the ids were renumbered, remembers where each went and tells the listeners.
 * @param {DiveEntry[]} before
 * @param {DiveEntry[]} after
 * @returns {Map<number, number|null>|null} the mapping of this reload, null when nothing was renumbered
 */
export function noteDiveList(before, after) {
  const mapping = matchReload(before, after);
  if (!mapping) return null;
  // An id from an earlier reload follows this one too.
  for (const [old, now] of chain) chain.set(old, now === null ? null : (mapping.get(now) ?? null));
  for (const [old, now] of mapping) chain.set(old, now);
  while (chain.size > MAX_KEPT) chain.delete(/** @type {number} */ (chain.keys().next().value));
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch (e) {
      console.warn('Following the new dive ids', e);
    }
  }
  return mapping;
}

/**
 * The id a dive has now: the same id when the log was not read again since, the new one when it was, null when the dive
 * is gone (deleted on another device).
 * @param {number} id
 * @returns {number|null}
 */
export function currentDiveId(id) {
  return chain.has(id) ? (chain.get(id) ?? null) : id;
}

/** The id to ask the core for: the current one, or the given one when the dive is gone (the core then says so). @param {number} id */
export function liveDiveId(id) {
  return currentDiveId(id) ?? id;
}

/**
 * Called after the ids were renumbered (the list is already the new one). Returns the function that stops it.
 * @param {() => void} listener
 */
export function onDiveIdsRenumbered(listener) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/**
 * The ids of a list as they are now; the ones whose dive is gone leave it.
 * @param {number[]} ids
 */
export function currentDiveIds(ids) {
  return ids.flatMap((id) => {
    const now = currentDiveId(id);
    return now === null ? [] : [now];
  });
}

/** For the tests: forgets everything remembered. */
export function resetDiveIds() {
  chain.clear();
  listeners.clear();
}
