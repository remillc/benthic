// @ts-check
// Actions on several dives (task 2026-11-15-178, parts 1 and 2; docs/system-design.md,
// section 7, « Actions on several dives »): the pure rules, shared by the phone, the
// tablet and the desktop. The actions themselves are `mergeDives` and
// `editDivesTogether` of lib/logbook.svelte.js, which call the core.

/** @typedef {import('opendives-core').Dive} Dive */
/** @typedef {import('opendives-core').DiveDetail} DiveDetail */

/** The longest surface interval between two dives that can be merged, in seconds. */
export const MERGE_MAX_GAP_SECONDS = 60 * 60;

/**
 * « 2012-11-05T10:15:00 » (local time of the dive) as seconds on a common scale.
 * @param {string} date
 */
function seconds(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(date);
  if (!m) return NaN;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0)) / 1000;
}

/**
 * Whether the selected dives can be merged: at least two, following one another in the
 * logbook (no other dive between them), each starting at most 60 minutes after the previous
 * one ends; overlapping dives (two dive computers) qualify.
 * @param {Dive[]} dives every dive of the logbook, in the order of the log
 * @param {number[]} ids the selected dives
 * @returns {{ ok: boolean, reason: ''|'count'|'notConsecutive'|'gap' }}
 *   reason: count (fewer than two known dives), notConsecutive (another dive lies between
 *   them), gap (more than an hour between the end of one and the start of the next)
 */
export function canMerge(dives, ids) {
  const wanted = new Set(ids);
  /** @type {number[]} */
  const positions = [];
  dives.forEach((d, i) => {
    if (wanted.has(d.id)) positions.push(i);
  });
  if (wanted.size < 2 || positions.length !== wanted.size) return { ok: false, reason: 'count' };
  for (let i = 1; i < positions.length; i++) {
    if (positions[i] !== positions[i - 1] + 1) return { ok: false, reason: 'notConsecutive' };
  }
  const chosen = positions.map((p) => dives[p]);
  // The latest end so far: a dive that began before an earlier one ended overlaps it.
  let end = seconds(chosen[0].date) + chosen[0].durationSeconds;
  for (let i = 1; i < chosen.length; i++) {
    const start = seconds(chosen[i].date);
    if (Number.isNaN(start) || Number.isNaN(end)) return { ok: false, reason: 'gap' };
    if (start - end > MERGE_MAX_GAP_SECONDS) return { ok: false, reason: 'gap' };
    end = Math.max(end, start + chosen[i].durationSeconds);
  }
  return { ok: true, reason: '' };
}

/**
 * A chip of Compagnons, Guides or Étiquettes in « Modifier ensemble ».
 * @typedef {Object} MultiChip
 * @property {string} name
 * @property {number} count the dives that have it
 * @property {boolean} common every selected dive has it
 */

/**
 * A text or choice field: one value shared by every dive, or « Plusieurs valeurs ».
 * @template T
 * @typedef {Object} MultiField
 * @property {boolean} mixed the dives have different values: the field shows « Plusieurs valeurs »
 * @property {T} value the shared value; the first dive's when mixed
 */

/**
 * @typedef {Object} MultiEditState
 * @property {number} count
 * @property {MultiField<string>} site the site's name
 * @property {MultiField<string>} notes
 * @property {MultiField<string>} suit
 * @property {MultiField<number>} salinity the water type chosen by the diver (kg per 10000 L; 0: none)
 * @property {MultiChip[]} buddies
 * @property {MultiChip[]} guides
 * @property {MultiChip[]} tags
 */

/**
 * @template T
 * @param {T[]} values
 * @returns {MultiField<T>}
 */
function field(values) {
  return { mixed: values.some((v) => v !== values[0]), value: values[0] };
}

/**
 * The chips common to all the dives first, then those of only some, each group by the
 * number of dives (most first) then by name.
 * @param {string[][]} lists the names of each dive
 * @returns {MultiChip[]}
 */
export function chipsOf(lists) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const list of lists) for (const name of new Set(list)) counts.set(name, (counts.get(name) ?? 0) + 1);
  const chips = [...counts].map(([name, count]) => ({ name, count, common: count === lists.length }));
  return chips.sort((a, b) => Number(b.common) - Number(a.common) || b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * What « Modifier ensemble » shows for the selected dives: each field's value or
 * « Plusieurs valeurs », and the chips of Compagnons, Guides and Étiquettes.
 * @param {DiveDetail[]} details the selected dives, as the core's getDive gives them
 * @returns {MultiEditState}
 */
export function multiEditState(details) {
  return {
    count: details.length,
    site: field(details.map((d) => d.site)),
    notes: field(details.map((d) => d.notes)),
    suit: field(details.map((d) => d.suit)),
    salinity: field(details.map((d) => d.userSalinity)),
    buddies: chipsOf(details.map((d) => d.buddies)),
    guides: chipsOf(details.map((d) => d.guides)),
    tags: chipsOf(details.map((d) => d.tags)),
  };
}

/**
 * What the diver changed in « Modifier ensemble ». A field left out (undefined) is left as it
 * is on every dive; a chip list is the list of names the diver sees after their changes.
 * @typedef {Object} MultiEdits
 * @property {number} [site] the chosen site's uuid (0: no site)
 * @property {string} [notes]
 * @property {string} [suit]
 * @property {number} [salinity] the water type (0: none)
 * @property {string[]} [buddies]
 * @property {string[]} [guides]
 * @property {string[]} [tags]
 */

/**
 * The `changes` of the core's editDives for what the diver edited. A text or choice field is
 * sent when it was edited and, if every dive had the same value, when it differs from it.
 * Chips are sent as the names added and the names removed, never as a replacement: a chip
 * shown (common or not) that is still there is left alone.
 * @param {MultiEditState} state
 * @param {MultiEdits} edits
 * @returns {Record<string, string|number|string[]>}
 */
export function multiEditChanges(state, edits) {
  /** @type {Record<string, string|number|string[]>} */
  const changes = {};
  if (edits.site !== undefined) changes.site = edits.site;
  for (const key of /** @type {const} */ (['notes', 'suit'])) {
    const value = edits[key];
    if (value === undefined) continue;
    if (state[key].mixed || value !== state[key].value) changes[key] = value;
  }
  if (edits.salinity !== undefined && (state.salinity.mixed || edits.salinity !== state.salinity.value)) {
    changes.userSalinity = edits.salinity;
  }
  for (const [key, prefix] of /** @type {const} */ ([
    ['buddies', 'buddies'],
    ['guides', 'diveguide'],
    ['tags', 'tags'],
  ])) {
    const wanted = edits[key];
    if (wanted === undefined) continue;
    const before = state[key].map((c) => c.name);
    const added = wanted.filter((n) => !before.includes(n));
    const removed = before.filter((n) => !wanted.includes(n));
    if (added.length) changes[`${prefix}Add`] = added;
    if (removed.length) changes[`${prefix}Remove`] = removed;
  }
  return changes;
}
