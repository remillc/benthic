// @ts-check
// The words of the shared map (task 2026-11-19-315), the same on every screen: « 214 plongées » or « Moins de 5
// plongées », « à 1,1 mi », a row of the list (« 214 plongées · à 1,1 mi », « Dans vos sites · 31 plongées ») and the
// line of the map's card (« Nouvelle-Zélande · carte commune · 214 plongées »).
import { t } from './i18n.js';
import { formatNumber } from './format.js';
import { distanceParts } from './site-distance.js';
import { diveCountOf, inYourSites } from './shared-sites.js';

/** @param {{ dives: number|null, fewDives: boolean }} site */
export function baseDivesText(site) {
  const c = diveCountOf(site);
  return c.key === 'few' ? t('sharedSites.fewDives') : t('sites.diveCount', { n: c.n });
}

/**
 * « 160 pi », « 1,1 mi », « 300 m », « 12 km »: the unit follows the depth setting.
 * @param {number} metres @param {{ length?: string }} prefs
 */
export function distanceValue(metres, prefs) {
  const d = distanceParts(metres, prefs.length === 'ft' ? 'ft' : 'm');
  const names = { m: t('units.meters'), ft: t('units.feet'), km: t('units.kilometers'), mi: t('units.miles') };
  return `${formatNumber(d.value, d.decimals)} ${names[d.unit]}`;
}

/** « à 1,1 mi ». @param {number} metres @param {{ length?: string }} prefs */
export const distanceText = (metres, prefs) => t('sites.chooseAway', { distance: distanceValue(metres, prefs) });

/**
 * The second line of a base site in a list.
 * @param {import('./shared-sites.js').BaseSite} site
 * @param {Record<string, string>} links
 * @param {{ length?: string }} prefs
 */
export function baseRowText(site, links, prefs) {
  if (inYourSites(site.id, links)) return [t('sharedSites.inYourSites'), baseDivesText(site)].join(' · ');
  return [baseDivesText(site), site.distanceM !== undefined ? distanceText(site.distanceM, prefs) : ''].filter(Boolean).join(' · ');
}

/** « Nouvelle-Zélande · carte commune · 214 plongées ». @param {import('./shared-sites.js').BaseSite} site */
export function baseCardLine(site) {
  return [site.country, t('sharedSites.commonMap'), baseDivesText(site)].filter(Boolean).join(' · ');
}
