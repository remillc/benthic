// @ts-check
// What a file to import holds, for the summary card of « Nouveau carnet » (task 2026-11-15-218):
// the sites and the years, read from the text of a Subsurface .ssrf or .xml file. Other formats
// (UDDF, FIT, the divelogs.de archive) give the dive count only: the core reports nothing more
// before the import.

/**
 * @typedef {{ dives: number, sites: number|null, firstYear: number|null, lastYear: number|null }} ImportSummary
 */

/**
 * @param {number} dives the core's count (importCount)
 * @param {string} [text] the file's text, when it is Subsurface XML
 * @returns {ImportSummary}
 */
export function summariseImport(dives, text = '') {
  if (!/<divelog\b|<dives\b/.test(text)) return { dives, sites: null, firstYear: null, lastYear: null };
  const sites = (text.match(/<site\s/g) ?? []).length;
  let first = Infinity;
  let last = -Infinity;
  for (const m of text.matchAll(/<dive\b[^>]*?\sdate=['"](\d{4})-/g)) {
    const year = Number(m[1]);
    if (year < first) first = year;
    if (year > last) last = year;
  }
  return { dives, sites, firstYear: Number.isFinite(first) ? first : null, lastYear: Number.isFinite(last) ? last : null };
}

/**
 * The summary from a streaming scan of the file (lib/staged-file.js), for a file too big to read as text.
 * @param {number} dives the core's count (importCount)
 * @param {{ hasDivelog: boolean, hasDives: boolean, sites: number, firstYear: number|null, lastYear: number|null }} scan
 * @returns {ImportSummary}
 */
export function summariseScan(dives, scan) {
  if (!scan.hasDivelog && !scan.hasDives) return { dives, sites: null, firstYear: null, lastYear: null };
  return { dives, sites: scan.sites, firstYear: scan.firstYear, lastYear: scan.lastYear };
}

/**
 * « 312 plongées et 48 sites, de 2009 à 2026 » for the summary card; what is not known is left out.
 * @param {ImportSummary} summary
 * @param {(key: string, params?: Record<string, string|number>) => string} t
 * @returns {string}
 */
export function summaryText(summary, t) {
  const dives = t('welcomeSteps.summaryDives', { n: summary.dives });
  let text = summary.sites ? t('welcomeSteps.summaryWith', { dives, sites: t('welcomeSteps.summarySites', { n: summary.sites }) }) : dives;
  if (summary.firstYear != null && summary.lastYear != null) {
    text =
      summary.firstYear === summary.lastYear
        ? t('welcomeSteps.summaryYear', { text, year: String(summary.firstYear) })
        : t('welcomeSteps.summaryYears', { text, from: String(summary.firstYear), to: String(summary.lastYear) });
  }
  return text;
}
