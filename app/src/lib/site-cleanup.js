// @ts-check
// "Clean up the sites": which duplicate groups an edit made disappear.
// A pair counts only if it was in the list before the editor opened, so a
// pair that left earlier (dismissed, merged) never gives a message.

/** @param {number} a @param {number} b */
const keyOf = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/**
 * The pairs of `before` that contain the edited site and are no longer in `after`.
 * @template {{a: {uuid: number}, b: {uuid: number}}} P
 * @param {P[]} before pairs listed when the editor opened
 * @param {P[]} after pairs listed now
 * @param {number} uuid the edited site
 * @returns {P[]}
 */
export function pairsGone(before, after, uuid) {
  const now = new Set(after.map((p) => keyOf(p.a.uuid, p.b.uuid)));
  return before.filter((p) => (p.a.uuid === uuid || p.b.uuid === uuid) && !now.has(keyOf(p.a.uuid, p.b.uuid)));
}

/**
 * The four problems « Nettoyer les sites » can list, in the order of the status page
 * (task 2026-11-24-395). Each has a route, a round icon and the text keys of its row.
 */
export const CLEANUP_PROBLEMS = /** @type {const} */ ([
  { kind: 'duplicates', route: '/sites/cleanup/duplicates/', icon: 'merge', title: 'sites.duplicatesCount', hint: 'sites.cleanupHintDuplicates' },
  { kind: 'unused', route: '/sites/cleanup/unused/', icon: 'delete', title: 'sites.unusedCount', hint: 'sites.cleanupHintUnused' },
  { kind: 'without', route: '/sites/without/', icon: 'link', title: 'sites.withoutCount', hint: 'sites.cleanupHintWithout' },
  { kind: 'unplaced', route: '/sites/unplaced/', icon: 'place', title: 'sites.unplacedCount', hint: 'sites.cleanupHintUnplaced' },
]);

/**
 * The problems that exist, in order, each with its count.
 * @param {{ duplicates: number, unused: number, without: number, unplaced: number }} counts
 */
export function cleanupProblems(counts) {
  return CLEANUP_PROBLEMS.filter((p) => counts[p.kind] > 0).map((p) => ({ ...p, count: counts[p.kind] }));
}

/**
 * « n points à régler »: how many of the four problems exist (0 hides the entry).
 * @param {{ duplicates: number, unused: number, without: number, unplaced: number }} counts
 */
export function cleanupPointCount(counts) {
  return cleanupProblems(counts).length;
}

/**
 * The sites that have dives but no position, the latest dive first.
 * @template {{ dives: number, hasLocation: boolean, lastDate: string }} S
 * @param {S[]} sites
 * @returns {S[]}
 */
export function unplacedSites(sites) {
  return sites.filter((s) => s.dives > 0 && !s.hasLocation).sort((a, b) => b.lastDate.localeCompare(a.lastDate));
}

/**
 * The sites without a dive.
 * @template {{ dives: number }} S
 * @param {S[]} sites
 * @returns {S[]}
 */
export function unusedSites(sites) {
  return sites.filter((s) => s.dives === 0);
}
