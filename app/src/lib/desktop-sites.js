// @ts-check
// Logic of the desktop Sites section (tasks 2026-11-15-171, 175, 177): the table, the search,
// the selection shared by the table and the map, the pins that overlap, the autocompletion of
// the country and the region, the dives without a site and the clean-up counts. Plain
// functions, no framework: tested in tests/app/desktop-sites.test.mjs. The reads and writes
// themselves go through the core (lib/sites.svelte.js).
import { normalise, highlightParts } from './site-search.js';
import { defaultKeeper } from './site-merge.js';

export { highlightParts };

/** @typedef {import('benthic-core').SiteSummary} Site */

/**
 * @typedef {'name'|'country'|'dives'|'last'} SortKey
 * @typedef {{ key: SortKey, descending: boolean }} Sort
 */

/** The table's columns, in order: the key, whether the values are numbers. */
export const SITE_COLUMNS = /** @type {const} */ ([
  { key: 'name', numeric: false, label: 'desktopSites.column.name' },
  { key: 'country', numeric: false, label: 'desktopSites.column.country' },
  { key: 'dives', numeric: true, label: 'desktopSites.column.dives' },
  { key: 'last', numeric: false, label: 'desktopSites.column.last' },
]);

export const DEFAULT_SORT = /** @type {Sort} */ ({ key: 'name', descending: false });

/**
 * The sort after a click on a column's header: a first click sorts ascending (counts and
 * dates: the largest first), a second click reverses it.
 * @param {Sort} sort @param {SortKey} key
 * @returns {Sort}
 */
export function nextSort(sort, key) {
  if (sort.key === key) return { key, descending: !sort.descending };
  return { key, descending: key === 'dives' || key === 'last' };
}

/**
 * The sites in the order of the table; a site without a name, a country or a dive comes last
 * whatever the direction.
 * @param {Site[]} sites @param {Sort} sort @param {string} locale
 * @returns {Site[]}
 */
export function sortSites(sites, sort, locale) {
  const sign = sort.descending ? -1 : 1;
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' });
  /** @param {string} a @param {string} b */
  const text = (a, b) => (!a || !b ? Number(!a) - Number(!b) : sign * collator.compare(a, b));
  if (sort.key === 'name') return [...sites].sort((a, b) => text(a.name, b.name));
  const byName = (/** @type {Site} */ a, /** @type {Site} */ b) => collator.compare(a.name, b.name);
  return [...sites].sort((a, b) => {
    if (sort.key === 'country') return text(a.country, b.country) || byName(a, b);
    if (sort.key === 'dives') return sign * (a.dives - b.dives) || byName(a, b);
    // Dates: a site without a dive has no date and goes last.
    if (!a.lastDate || !b.lastDate) return Number(!a.lastDate) - Number(!b.lastDate) || byName(a, b);
    return sign * a.lastDate.localeCompare(b.lastDate) || byName(a, b);
  });
}

/**
 * Whether the text is in the site's name, region or country, ignoring case and accents
 * (the search of task 2026-11-15-177).
 * @param {{ name: string, country?: string }} site @param {string} region @param {string} query
 */
export function matchesSiteText(site, region, query) {
  const q = normalise(query);
  if (!q) return true;
  return normalise(site.name).includes(q) || normalise(region).includes(q) || normalise(site.country ?? '').includes(q);
}

/**
 * The sites that match a search, the whole list for an empty one.
 * @param {Site[]} sites @param {Map<number, string>} regions region of each site, by uuid @param {string} query
 */
export function searchSites(sites, regions, query) {
  return normalise(query) ? sites.filter((s) => matchesSiteText(s, regions.get(s.uuid) ?? '', query)) : sites;
}

/**
 * What the selected pin and row do. `mode` is what the right pane shows: the map with the
 * site's card, or the site's sheet; the other panes (new site, dives without a site, clean
 * up) keep the selection but cover the map.
 * @typedef {{ selected: number|null, mode: 'map'|'sheet' }} Selection
 */

/**
 * The selection after an event. A row opens the sheet; a pin selects the same row and shows its
 * card on the map; « Modifier » on the card opens the sheet; Échap or the list's empty area
 * returns to the map; a site that disappears (deleted, merged, filtered out) is no longer
 * selected.
 * @param {Selection} state
 * @param {{ type: 'row'|'pin'|'edit'|'escape'|'clear' } | { type: 'visible', uuids: number[] }} event
 * @param {number} [uuid] the site of a row or a pin
 * @returns {Selection}
 */
export function reduceSelection(state, event, uuid) {
  switch (event.type) {
    case 'row':
      return uuid === undefined ? state : { selected: uuid, mode: 'sheet' };
    case 'pin':
      return uuid === undefined ? state : { selected: uuid, mode: 'map' };
    case 'edit':
      return state.selected === null ? state : { ...state, mode: 'sheet' };
    case 'escape':
      return state.mode === 'sheet' ? { ...state, mode: 'map' } : state;
    case 'clear':
      return { selected: null, mode: 'map' };
    case 'visible':
      return state.selected !== null && !event.uuids.includes(state.selected) ? { selected: null, mode: 'map' } : state;
  }
  return state;
}

/**
 * The bar above the table: « 5 plongées sans site » (task 175). Null when no dive lacks a site,
 * and while a search is typed.
 * @param {number} withoutSite @param {boolean} searching
 * @returns {{ count: number }|null}
 */
export function withoutSiteBar(withoutSite, searching) {
  return withoutSite > 0 && !searching ? { count: withoutSite } : null;
}

/**
 * The second bar: possible duplicates and sites without a dive (task 177, 8). Null when there
 * are none of either, and while a search is typed.
 * @param {number} duplicates @param {number} unused @param {boolean} searching
 * @returns {{ duplicates: number, unused: number }|null}
 */
export function cleanupBar(duplicates, unused, searching) {
  return (duplicates > 0 || unused > 0) && !searching ? { duplicates, unused } : null;
}

/**
 * Pins that overlap at the current zoom, merged into one that carries their count. A pin joins
 * the first group whose first pin is within `radius` px of it (the pins are taken in the order
 * given: the busiest first, so that a group is centred on its busiest site).
 * @param {{ uuid: number, x: number, y: number }[]} pins positions on the screen, px
 * @param {number} radius
 * @returns {{ uuids: number[], x: number, y: number }[]}
 */
export function stackPins(pins, radius) {
  /** @type {{ uuids: number[], x: number, y: number }[]} */
  const groups = [];
  for (const pin of pins) {
    const group = groups.find((g) => Math.hypot(g.x - pin.x, g.y - pin.y) <= radius);
    if (group) group.uuids.push(pin.uuid);
    else groups.push({ uuids: [pin.uuid], x: pin.x, y: pin.y });
  }
  return groups;
}

/**
 * How many sites use each value (country, region) in the logbook, most used first, then by name.
 * @param {string[]} values one per site; empty values do not count
 * @param {string} locale
 * @returns {{ value: string, count: number }[]}
 */
export function countValues(values, locale) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  const collator = new Intl.Collator(locale, { sensitivity: 'base' });
  return [...counts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || collator.compare(a.value, b.value));
}

/**
 * The completions of what is typed in Country or Region: the values already used in the logbook
 * come first, with their count; then the others (the countries of the world), those that start
 * with the text before those that only contain it.
 * @param {string} text
 * @param {{ value: string, count: number }[]} inLogbook
 * @param {string[]} others
 * @param {number} [limit]
 * @returns {{ value: string, count: number }[]} count 0: not in the logbook
 */
export function completions(text, inLogbook, others, limit = 6) {
  const q = normalise(text);
  if (!q) return [];
  const starts = (/** @type {string} */ v) => normalise(v).startsWith(q);
  const has = (/** @type {string} */ v) => normalise(v).includes(q);
  const mine = inLogbook.filter((x) => has(x.value)).sort((a, b) => Number(starts(b.value)) - Number(starts(a.value)) || b.count - a.count || a.value.localeCompare(b.value));
  const known = new Set(inLogbook.map((x) => normalise(x.value)));
  const rest = others.filter((v) => !known.has(normalise(v)) && has(v));
  const list = [...mine, ...[...rest.filter(starts), ...rest.filter((v) => !starts(v))].map((value) => ({ value, count: 0 }))];
  return list.slice(0, limit);
}

/**
 * The grey completion shown inside the field: what remains of the first proposal after the
 * typed text, when the proposal starts with it (« Nouv|elle-Zélande »). The typed text keeps
 * its case. Empty when there is nothing to complete.
 * @param {string} text @param {{ value: string }[]} proposals
 * @returns {string}
 */
export function inlineCompletion(text, proposals) {
  const first = proposals[0]?.value;
  if (!text || !first) return '';
  const q = normalise(text);
  if (!normalise(first).startsWith(q) || normalise(first) === q) return '';
  // Whole characters of the proposal, as many as the typed text has.
  const chars = [...first];
  let folded = '';
  let used = 0;
  while (used < chars.length && folded.length < q.length) folded += normalise(chars[used++]);
  return chars.slice(used).join('');
}

/**
 * The names of the countries of the world in a language, from the system's region names.
 * @param {string} locale
 * @param {(locale: string) => { of: (code: string) => string|undefined }} [displayNames]
 * @returns {string[]} sorted
 */
export function worldCountries(locale, displayNames = (l) => new Intl.DisplayNames([l], { type: 'region' })) {
  const names = displayNames(locale);
  /** @type {Set<string>} */
  const out = new Set();
  const A = 65;
  for (let i = 0; i < 26; i++) {
    for (let j = 0; j < 26; j++) {
      const code = String.fromCharCode(A + i, A + j);
      try {
        const name = names.of(code);
        // An unknown code comes back as itself.
        if (name && name !== code && !/^[A-Z]{2}$/.test(name)) out.add(name);
      } catch {
        // Not a region.
      }
    }
  }
  return [...out].sort(new Intl.Collator(locale).compare);
}

/**
 * Regions proposed for a country: the regions of the logbook's sites in that country.
 * @param {Site[]} sites @param {Map<number, string>} regions @param {string} country
 * @param {string} locale
 */
export function regionsOfCountry(sites, regions, country, locale) {
  const c = normalise(country);
  return countValues(
    sites.filter((s) => !c || normalise(s.country) === c).map((s) => regions.get(s.uuid) ?? ''),
    locale,
  );
}

/**
 * The dives without a site, grouped for the list: the dives of a trip under the trip, the
 * others one by one. A group shows its latest dive and says how many others it holds. The
 * groups are in the order of the latest dive, newest first.
 * @template {{ id: number, date: string }} D
 * @param {D[]} dives the dives without a site
 * @param {(id: number) => { id: number, location: string }|undefined} tripOf
 * @returns {{ trip: { id: number, location: string }|null, first: D, others: D[] }[]}
 */
export function groupWithout(dives, tripOf) {
  const sorted = [...dives].sort((a, b) => b.date.localeCompare(a.date));
  /** @type {Map<number, { trip: { id: number, location: string }|null, first: D, others: D[] }>} */
  const trips = new Map();
  /** @type {{ trip: { id: number, location: string }|null, first: D, others: D[] }[]} */
  const out = [];
  for (const d of sorted) {
    const trip = tripOf(d.id) ?? null;
    const group = trip ? trips.get(trip.id) : undefined;
    if (group) group.others.push(d);
    else {
      const g = { trip, first: d, others: /** @type {D[]} */ ([]) };
      if (trip) trips.set(trip.id, g);
      out.push(g);
    }
  }
  return out;
}

/**
 * The count of the « plongées sans site » bar after a dive got a site: the dives still without
 * one.
 * @param {{ id: number }[]} without @param {number[]} assigned
 */
export function withoutAfter(without, assigned) {
  const done = new Set(assigned);
  return without.filter((d) => !done.has(d.id)).length;
}

/**
 * The sites of the « Choisir un site… » list for a typed text: matching the name, region or
 * country, in the order given (by distance from the dive).
 * @template {{ site: Site, metres: number|null }} R
 * @param {R[]} rows @param {Map<number, string>} regions @param {string} query
 * @returns {R[]}
 */
export function filterChoice(rows, regions, query) {
  return normalise(query) ? rows.filter((r) => matchesSiteText(r.site, regions.get(r.site.uuid) ?? '', query)) : rows;
}

/**
 * Whether the sites without a dive are deleted: the uuids checked that are really without a dive.
 * @param {Site[]} unused @param {Record<number, boolean>} checked
 */
export function checkedUnused(unused, checked) {
  return unused.filter((s) => checked[s.uuid]).map((s) => s.uuid);
}

/**
 * « Tout sélectionner » toggles: all checked unless they already are.
 * @param {Site[]} unused @param {Record<number, boolean>} checked
 * @returns {Record<number, boolean>}
 */
export function toggleAllUnused(unused, checked) {
  const all = unused.length > 0 && unused.every((s) => checked[s.uuid]);
  return Object.fromEntries(unused.map((s) => [s.uuid, !all]));
}

/**
 * The two sites of a duplicate pair for the merge dialog, as the phone's clean-up lists them: the one
 * kept by default first (more dives, then a position), and the site kept and the one that goes for the
 * choice made (`keptUuid`; the first when none or unknown).
 * @param {Site} a @param {Site} b @param {number|null|undefined} keptUuid
 * @returns {{ first: Site, second: Site, keep: Site, other: Site }}
 */
export function mergeSides(a, b, keptUuid) {
  const first = defaultKeeper([a, b]);
  const second = first === a ? b : a;
  return keptUuid === second.uuid ? { first, second, keep: second, other: first } : { first, second, keep: first, other: second };
}

/** Region reads in flight together: the core answers each in about a millisecond, so a few at a time hide the round trips. */
export const REGION_READS_AT_ONCE = 16;

/**
 * The region of each site, read with `read(uuid)` a few sites at a time instead of one after the other
 * (300 sites made 300 round trips in a row). A site whose read fails has no region.
 * @param {{ uuid: number }[]} sites
 * @param {(uuid: number) => Promise<string>} read
 * @param {number} [atOnce]
 * @returns {Promise<Map<number, string>>}
 */
export async function readRegions(sites, read, atOnce = REGION_READS_AT_ONCE) {
  /** @type {Map<number, string>} */
  const found = new Map();
  let next = 0;
  const worker = async () => {
    while (next < sites.length) {
      const { uuid } = sites[next++];
      try {
        found.set(uuid, await read(uuid));
      } catch {
        found.set(uuid, '');
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(atOnce, sites.length) }, worker));
  return found;
}
