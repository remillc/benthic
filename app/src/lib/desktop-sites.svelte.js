// @ts-check
// State of the desktop Sites section (tasks 2026-11-15-171 and 177): the table's sort and the
// list pane's width (remembered on the device), the regions of the sites (read from the core on
// demand: the sites' list does not carry them), and the position lookups that waited for the
// network. The reads and writes of the sites themselves stay in lib/sites.svelte.js.
import { BenthicCore } from 'benthic-core';
import { deviceStore } from './device-store.js';
import { DEFAULT_SORT, readRegions } from './desktop-sites.js';
import { geocodeSite } from './sites.svelte.js';
import { logbook } from './logbook.svelte.js';
import { filter, applyFilter, clearFilter, emptyCriteria } from './filter.svelte.js';
import { goToSection } from './navigation.svelte.js';
import { desk } from './desktop-logbook.svelte.js';

const SORT_KEY = 'od.desktopSitesSort';
const WIDTH_KEY = 'od.desktopSitesWidth';

/** @template T @param {string} key @param {T} fallback @returns {T} */
function remembered(key, fallback) {
  try {
    const text = deviceStore.getItem(key);
    return text ? JSON.parse(text) : fallback;
  } catch {
    return fallback;
  }
}

export const deskSites = $state({
  /** @type {import('./desktop-sites.js').Sort} */
  sort: DEFAULT_SORT,
  /** The list pane's width, px (the map takes the rest). */
  width: 560,
  /** Region of each site, by uuid; filled by loadRegions. */
  regions: /** @type {Map<number, string>} */ (new Map()),
  /** Sites whose country and region wait for the network. */
  waiting: /** @type {Set<number>} */ (new Set()),
});

/** Reads the remembered choices: called when the page opens. */
export function loadSitesChoices() {
  deskSites.sort = remembered(SORT_KEY, DEFAULT_SORT);
  deskSites.width = remembered(WIDTH_KEY, 560);
}

/** @param {import('./desktop-sites.js').Sort} sort */
export function setSitesSort(sort) {
  deskSites.sort = sort;
  deviceStore.setItem(SORT_KEY, JSON.stringify(sort));
}

/** @param {number} width */
export function setSitesWidth(width) {
  deskSites.width = width;
  deviceStore.setItem(WIDTH_KEY, JSON.stringify(width));
}

let regionsFor = -1;
let loading = false;

/**
 * Reads the region of every site (a SiteDetail each), for the search and the Region field's
 * completions; once per version of the sites. The reads run side by side (readRegions).
 * @param {import('benthic-core').SiteSummary[]} sites @param {number} version logbook.sitesVersion
 */
export async function loadRegions(sites, version) {
  if (regionsFor === version || loading) return;
  loading = true;
  try {
    deskSites.regions = await readRegions(sites, async (uuid) => (await BenthicCore.siteQuery({ kind: 'site', uuid }))?.region?.value ?? '');
    regionsFor = version;
  } finally {
    loading = false;
  }
}

/**
 * Fills a site's country and region from its position (the core keeps what the diver corrected).
 * Offline, or when nothing is found, the site waits and is filled when the network is back.
 * @param {number} uuid
 * @returns {Promise<boolean>} whether the place was found
 */
export async function fillPlace(uuid) {
  const done = await geocodeSite(uuid);
  if (done) deskSites.waiting.delete(uuid);
  else deskSites.waiting.add(uuid);
  return done;
}

/** The network is back: the sites that waited are filled now. */
export async function retryWaiting() {
  for (const uuid of [...deskSites.waiting]) {
    deskSites.waiting.delete(uuid);
    // A failed lookup puts the site back in the queue, to wait for the next time.
    await fillPlace(uuid);
  }
}

/**
 * Opens a dive in the Carnet: the section shows, with that dive selected (the filter is lifted
 * when it hides the dive).
 * @param {number} id
 */
export async function openDiveInCarnet(id) {
  if (filter.ids && !filter.ids.has(id)) await clearFilter(logbook.prefs);
  desk.selection = { ids: [id], anchor: id, focus: id };
  goToSection('logbook');
}

/**
 * « Voir les plongées »: the Carnet filtered on the site.
 * @param {string} name the site's name
 */
export async function showSiteDives(name) {
  await applyFilter({ ...emptyCriteria(), sites: [name] }, logbook.prefs);
  goToSection('logbook');
}
