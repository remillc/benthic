// @ts-check
// The logbook's summary line, under its title: « 9 plongées · 4 sites · dernière plongée
// il y a 9 mois » (the phone's band, the tablet's, the desktop's top bar).
import { t } from './i18n.js';
import { formatTimeAgo, localNowIso } from './format.js';

/**
 * « dernière plongée il y a 9 mois » is one unbreakable block, and a « · » never starts a
 * line: a long summary moves the whole block to the second row (docs/ui-writing.md, 8).
 * @param {import('opendives-core').Dive[]} dives
 * @returns {string} empty for an empty logbook
 */
export function logbookSummary(dives) {
  if (!dives.length) return '';
  const sites = new Set(dives.map((d) => d.site).filter(Boolean)).size;
  // A dive dated in the future (a dive computer's clock) is not the last one done.
  const now = localNowIso();
  const latest = dives.reduce((a, d) => (d.date <= now && d.date > a ? d.date : a), '');
  const last = latest ? t('band.lastDive', { ago: formatTimeAgo(latest) }).replace(/ /g, ' ') : '';
  return [t('band.dives', { n: dives.length }), t('band.sites', { n: sites }), last].filter(Boolean).join(' · ');
}
