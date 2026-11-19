// @ts-check
// « Compléter la plongée » (task 2026-11-14-151): which dives of a download the quick entry opens for.

/**
 * The new dives without a site, the oldest first: not in the logbook before the download, not merged into
 * a dive that was, with no site yet.
 * @param {{ id: number, date: string, site: string }[]} dives the logbook after the download
 * @param {Set<number>} before the dive ids before it
 * @param {number[]} [mergedIds] the dives the core merged into dives already there
 * @returns {number[]}
 */
export function newDivesWithoutSite(dives, before, mergedIds = []) {
  const merged = new Set(mergedIds);
  return dives
    .filter((d) => !before.has(d.id) && !merged.has(d.id) && !d.site)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((d) => d.id);
}

/** The address of the quick entry for these dives, in the order they are completed. @param {number[]} ids */
export const quickEntryUrl = (ids) => `/dives/${ids[0]}/complete${ids.length > 1 ? `?next=${ids.slice(1).join(',')}` : ''}`;
