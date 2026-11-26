// @ts-check
// Reading the earlier dives for the suggested weight (lib/weight-suggestion.js holds the rule): the dives that can match are
// read, most recent first, until one does. Used by the dive detail's Lest section (task 2026-11-26-403), as the old editor did.
import { BenthicCore } from 'benthic-core';
import { matches, mostRecentFirst } from './weight-suggestion.js';

/** How many dives are looked at at most. */
export const SCAN_LIMIT = 300;

/**
 * The earlier dives, read, that the rule can use.
 * @param {{
 *   current: { id: number, suit: string, waterType: string, cylinders: { sizeMl: number }[] },
 *   dives: { id: number, date: string, number?: number }[],
 *   cache: Map<number, import('./weight-suggestion.js').WeightSource>,
 *   isStale?: () => boolean,
 * }} options
 * `dives`: the logbook's list; `cache`: the dives read already, by id (kept by the caller); `isStale`: true once a newer scan
 * replaced this one (the scan then stops and returns null).
 * @returns {Promise<import('./weight-suggestion.js').WeightSource[]|null>}
 */
export async function scanWeightSources({ current, dives, cache, isStale = () => false }) {
  /** @type {Set<number>|null} */
  let ids = null;
  if (current.suit.trim()) {
    try {
      ids = new Set(await BenthicCore.filterQuery({ kind: 'dives', rules: [{ type: 'suit', stringMode: 'exact', data: `${current.suit}\n` }] }));
    } catch (e) {
      console.error('Weight suggestion', e);
    }
  }
  const list = dives.filter((d) => d.id !== current.id && (!ids || ids.has(d.id))).sort(mostRecentFirst).slice(0, SCAN_LIMIT);
  /** @type {import('./weight-suggestion.js').WeightSource[]} */
  const read = [];
  for (let i = 0; i < list.length; i += 6) {
    const chunk = await Promise.all(
      list.slice(i, i + 6).map(async (d) => {
        let source = cache.get(d.id);
        if (!source) {
          try {
            const detail = await BenthicCore.getDive({ id: d.id });
            source = { id: d.id, number: d.number, date: detail.date, suit: detail.suit ?? '', waterType: detail.waterType ?? '', cylinders: detail.cylinders, tags: detail.tags, weights: detail.weights };
            cache.set(d.id, source);
          } catch (e) {
            console.error('Weight suggestion', e);
          }
        }
        return source;
      }),
    );
    for (const source of chunk) if (source) read.push(source);
    if (isStale()) return null;
    if (read.some((d) => matches(d, current))) break;
  }
  return read;
}
