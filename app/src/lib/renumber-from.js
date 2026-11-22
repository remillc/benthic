// @ts-check

/**
 * Dives are in the core's chronological order, including hidden invalid dives.
 * @param {{id: number, number: number}[]} dives
 * @param {number} id
 * @param {number} [start]
 * @returns {{ids: number[], suggested: number, conflict: number|null}|null}
 */
export function renumberFromPlan(dives, id, start) {
  const index = dives.findIndex((d) => d.id === id);
  if (index < 0) return null;
  const ids = dives.slice(index).map((d) => d.id);
  const suggested = (dives[index - 1]?.number ?? 0) + 1;
  const end = start === undefined ? 0 : start + ids.length - 1;
  const conflict = start === undefined ? null : dives.slice(0, index).find((d) => d.number >= start && d.number <= end)?.number ?? null;
  return { ids, suggested, conflict };
}
