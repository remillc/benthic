// @ts-check
// « Site de la plongée » (task 2026-11-27-412): what the dive's site chooser lists and how it reads the dive's position.
// Pure functions, tested in tests/app/dive-site-choice.test.mjs.
import { matchesSiteText } from './desktop-sites.js';

/**
 * @typedef {{ uuid: number, name: string, country?: string, dives?: number, hasLocation?: boolean, latUdeg?: number, lonUdeg?: number }} ChoiceSite
 */

/**
 * The sites of « Dans votre carnet »: the logbook's own sites only, matching the typed text on the name, the region or
 * the country, in alphabetical order (accents and case ignored, numbers in order). A site with neither a name nor a
 * dive is left out, as the choice screens always did. The shared map's sites are never in this list.
 * @template {ChoiceSite} S
 * @param {S[]} sites
 * @param {Map<number, string>} regions region of each site, by uuid (empty until read)
 * @param {string} query
 * @param {string} locale
 * @returns {S[]}
 */
export function logbookChoice(sites, regions, query, locale) {
  const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true });
  return sites
    .filter((s) => (s.name || s.dives) && matchesSiteText({ name: s.name, country: s.country }, regions.get(s.uuid) ?? '', query))
    .sort((a, b) => {
      // A site without a name goes last.
      if (!a.name !== !b.name) return a.name ? -1 : 1;
      return collator.compare(a.name, b.name) || a.uuid - b.uuid;
    });
}

/**
 * The uuid of the dive's current site, found by its name (the detail carries the name): 0 for a dive without a site.
 * @param {ChoiceSite[]} sites @param {string} siteName
 */
export function currentSiteUuid(sites, siteName) {
  return siteName ? (sites.find((s) => s.name === siteName)?.uuid ?? 0) : 0;
}

/**
 * Where the dive was recorded, from what the core already gives: a dive without a site is in the « without a site »
 * list with the computer's GPS; a dive whose site has no coordinates has it in that site's dive list; a dive whose site
 * has coordinates falls back on them (the core does not hand the computer's position of such a dive).
 * @param {number} diveId
 * @param {{ id: number, latUdeg?: number, lonUdeg?: number }[]} without the dives without a site
 * @param {{ diveList?: { id: number, recordedLatUdeg?: number, recordedLonUdeg?: number }[] }|null} siteDetail
 * @param {{ latUdeg: number, lonUdeg: number }|null} siteCoordinates
 * @returns {{ latUdeg: number, lonUdeg: number }|null}
 */
export function recordedPosition(diveId, without, siteDetail, siteCoordinates) {
  const free = without.find((d) => d.id === diveId);
  if (free && Number.isFinite(free.latUdeg) && Number.isFinite(free.lonUdeg) && !(free.latUdeg === 0 && free.lonUdeg === 0)) {
    return { latUdeg: /** @type {number} */ (free.latUdeg), lonUdeg: /** @type {number} */ (free.lonUdeg) };
  }
  const own = siteDetail?.diveList?.find((d) => d.id === diveId);
  if (own && Number.isFinite(own.recordedLatUdeg) && Number.isFinite(own.recordedLonUdeg) && !(own.recordedLatUdeg === 0 && own.recordedLonUdeg === 0)) {
    return { latUdeg: /** @type {number} */ (own.recordedLatUdeg), lonUdeg: /** @type {number} */ (own.recordedLonUdeg) };
  }
  return siteCoordinates ?? null;
}

/**
 * The address of the site form opened from a dive: the dive, the name typed in the search and the dive's position.
 * @param {number} diveId @param {string} name @param {{ latUdeg: number, lonUdeg: number }|null} position
 */
export function newSiteUrl(diveId, name, position) {
  const query = [`dive=${diveId}`];
  if (name.trim()) query.push(`name=${encodeURIComponent(name.trim())}`);
  if (position) query.push(`lat=${position.latUdeg}`, `lon=${position.lonUdeg}`);
  return `/sites/new?${query.join('&')}`;
}
