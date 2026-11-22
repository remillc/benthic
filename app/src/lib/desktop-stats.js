// @ts-check
// The desktop Statistiques screen (tasks 2026-11-15-171 and 176, mock-up bureau-stats): the
// data of its six built-in statistics, drawn from the dives the core counted (lib/statistics),
// the previews of the list, the key figures, the round steps of the chart's axis, and the
// selection a click on a bar leaves in the Carnet. Pure functions: the page formats the texts.

/** @typedef {{id: number, date: string, site: string, maxDepthMm: number, durationSeconds: number}} StatDive */
/** @typedef {{id: number, sacMlMin?: number}} StatExtra */
/** @typedef {{lonUdeg: number, latUdeg: number, name: string, hasLocation: boolean, dives: number}} StatSite */

/**
 * The built-in statistics, in the order of the list, with the icon of each (the icons are
 * drawn by components/DesktopStatIcon.svelte).
 */
export const STAT_KINDS = /** @type {const} */ ([
  { key: 'byYear', icon: 'bars' },
  { key: 'maxDepth', icon: 'depth' },
  { key: 'time', icon: 'stopwatch' },
  { key: 'sac', icon: 'cylinder' },
  { key: 'bySite', icon: 'pin' },
  { key: 'heat', icon: 'grid' },
]);

/** @typedef {typeof STAT_KINDS[number]['key']} StatKind */

/** The values a preview shows at most (« the last 7 values »). */
export const PREVIEW_VALUES = 7;

/**
 * A bar of the chart.
 * @typedef {Object} StatBar
 * @property {string} key stable key: the year, the dive's id, the site's name
 * @property {string} label the text under the bar
 * @property {number} value millimetres, seconds, ml/min or a count
 * @property {number[]} diveIds the dives a click on the bar opens in the Carnet
 * @property {string} [year] set for a year bar
 * @property {string} [date] set for a per-dive bar
 * @property {string} [site] set for a per-site bar ('' for the dives without a site)
 */

/** @param {StatDive[]} dives the oldest first */
const byDate = (dives) => [...dives].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);

/**
 * The dives the filter keeps (all when there is no filter).
 * @template {{id: number}} D
 * @param {D[]} dives
 * @param {Set<number>|null|undefined} ids
 * @returns {D[]}
 */
export function visibleDives(dives, ids) {
  return ids ? dives.filter((d) => ids.has(d.id)) : dives;
}

/**
 * Dives per year, from the first year to the last, the years without a dive included.
 * @param {StatDive[]} dives
 * @returns {StatBar[]}
 */
export function yearBars(dives) {
  if (!dives.length) return [];
  /** @type {Map<number, number[]>} */
  const ids = new Map();
  for (const d of byDate(dives)) {
    const year = Number(d.date.slice(0, 4));
    ids.set(year, [...(ids.get(year) ?? []), d.id]);
  }
  const years = [...ids.keys()];
  const first = Math.min(...years);
  const last = Math.max(...years);
  /** @type {StatBar[]} */
  const bars = [];
  for (let year = first; year <= last; year++) {
    const list = ids.get(year) ?? [];
    bars.push({ key: String(year), label: String(year), value: list.length, diveIds: list, year: String(year) });
  }
  return bars;
}

/**
 * Time under water per year, in seconds, from the first year to the last.
 * @param {StatDive[]} dives
 * @returns {StatBar[]}
 */
export function timeBars(dives) {
  return yearBars(dives).map((bar) => {
    const seconds = dives.filter((d) => bar.diveIds.includes(d.id)).reduce((sum, d) => sum + d.durationSeconds, 0);
    return { ...bar, value: seconds };
  });
}

/**
 * Maximum depth of each dive, the oldest first (one bar per dive).
 * @param {StatDive[]} dives
 * @returns {StatBar[]}
 */
export function depthBars(dives) {
  return byDate(dives)
    .filter((d) => d.maxDepthMm > 0)
    .map((d) => ({ key: String(d.id), label: d.date.slice(0, 4), value: d.maxDepthMm, diveIds: [d.id], date: d.date }));
}

/**
 * Consumption (SAC, ml/min) of each dive that has one, the oldest first.
 * @param {StatDive[]} dives
 * @param {Map<number, StatExtra>} extras the core's per-dive columns
 * @returns {StatBar[]}
 */
export function sacBars(dives, extras) {
  return byDate(dives)
    .filter((d) => (extras.get(d.id)?.sacMlMin ?? 0) > 0)
    .map((d) => ({ key: String(d.id), label: d.date.slice(0, 4), value: extras.get(d.id)?.sacMlMin ?? 0, diveIds: [d.id], date: d.date }));
}

/**
 * Dives per site, the busiest first; the dives without a site come last, under the name ''.
 * @param {StatDive[]} dives
 * @returns {StatBar[]}
 */
export function siteBars(dives) {
  /** @type {Map<string, number[]>} */
  const ids = new Map();
  for (const d of byDate(dives)) ids.set(d.site, [...(ids.get(d.site) ?? []), d.id]);
  return [...ids]
    .map(([site, list]) => ({ key: site || '-', label: site, value: list.length, diveIds: list, site }))
    .sort((a, b) => (!a.site ? 1 : !b.site ? -1 : b.value - a.value || a.site.localeCompare(b.site)));
}

/**
 * The bars of a built-in statistic (the heat map has none: it is a map).
 * @param {StatKind} kind
 * @param {StatDive[]} dives
 * @param {Map<number, StatExtra>} extras
 * @returns {StatBar[]}
 */
export function barsOf(kind, dives, extras) {
  switch (kind) {
    case 'byYear':
      return yearBars(dives);
    case 'maxDepth':
      return depthBars(dives);
    case 'time':
      return timeBars(dives);
    case 'sac':
      return sacBars(dives, extras);
    case 'bySite':
      return siteBars(dives);
    default:
      return [];
  }
}

/**
 * The key figures of a statistic, in raw units; the page writes them.
 * @param {StatKind} kind
 * @param {StatBar[]} bars
 * @param {number} diveCount
 */
export function keyFigures(kind, bars, diveCount) {
  const values = bars.map((b) => b.value);
  const sum = values.reduce((a, b) => a + b, 0);
  const best = bars.reduce((a, b) => (b.value > (a?.value ?? -1) ? b : a), /** @type {StatBar|undefined} */ (undefined));
  const lowest = bars.reduce((a, b) => (b.value < (a?.value ?? Infinity) ? b : a), /** @type {StatBar|undefined} */ (undefined));
  switch (kind) {
    case 'byYear':
      // The mean counts every year of the range, those without a dive too.
      return { total: diveCount, best: best?.year ?? '', bestValue: best?.value ?? 0, mean: bars.length ? diveCount / bars.length : 0 };
    case 'time':
      return { total: sum, best: best?.year ?? '', bestValue: best?.value ?? 0, mean: diveCount ? sum / diveCount : 0 };
    case 'maxDepth':
    case 'sac':
      return { max: best?.value ?? 0, mean: values.length ? sum / values.length : 0, min: lowest?.value ?? 0 };
    case 'bySite':
      return {
        sites: bars.filter((b) => b.site).length,
        best: best?.site ?? '',
        bestValue: best?.value ?? 0,
        withoutSite: bars.find((b) => !b.site)?.value ?? 0,
      };
    default:
      return {};
  }
}

/**
 * The round steps of a value axis: 0 and steps of 1, 2 or 5 × 10ⁿ (in the axis unit), about
 * three of them; the top step is at or above the highest value.
 * @param {number} top the highest value, in the axis unit
 * @param {number} [wanted] the number of steps wanted, about
 * @returns {{max: number, ticks: number[]}}
 */
export function niceTicks(top, wanted = 4) {
  if (!(top > 0)) return { max: 1, ticks: [0, 1] };
  const rough = top / wanted;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? 10 * magnitude;
  const count = Math.ceil(top / step - 1e-9);
  const ticks = Array.from({ length: count + 1 }, (_, i) => Math.round(i * step * 1e6) / 1e6);
  return { max: ticks[ticks.length - 1], ticks };
}

/**
 * A preview of the list (56 × 24 dp, decorative): bars, a line or a 4 × 2 grid, values from 0 to 1.
 * @typedef {{type: 'bars', values: number[]}|{type: 'line', values: number[]}|{type: 'grid', levels: number[]}} Preview
 */

/**
 * The last values of a series, scaled so that the largest is 1.
 * @param {number[]} values
 */
function lastScaled(values) {
  const last = values.slice(-PREVIEW_VALUES);
  const max = Math.max(...last, 0);
  return max > 0 ? last.map((v) => v / max) : [];
}

/**
 * The preview of a statistic the diver created (its chart is a bar per dive): the last bars.
 * @param {StatBar[]} bars
 * @returns {Preview|null}
 */
export function barsPreview(bars) {
  const values = lastScaled(bars.map((b) => b.value));
  return values.length ? { type: 'bars', values } : null;
}

/** The heat levels of the grid, 0 (none) to 4. */
export const HEAT_LEVELS = 4;

/**
 * The preview of a built-in statistic, drawn from the dives (already filtered), or null when
 * there is nothing to draw (an empty logbook, no consumption recorded, fewer than 2 sites
 * with a position for the heat map: the slot stays empty).
 * @param {StatKind} kind
 * @param {StatDive[]} dives
 * @param {Map<number, StatExtra>} extras
 * @param {StatSite[]} sites
 * @returns {Preview|null}
 */
export function previewOf(kind, dives, extras, sites) {
  if (!dives.length) return null;
  if (kind === 'heat') {
    const named = new Map(sites.filter((s) => s.hasLocation && s.name).map((s) => [s.name, s]));
    /** @type {Map<string, number>} */
    const counts = new Map();
    for (const d of dives) if (named.has(d.site)) counts.set(d.site, (counts.get(d.site) ?? 0) + 1);
    if (counts.size < 2) return null;
    const list = [...counts.values()].sort((a, b) => b - a).slice(0, 8);
    const max = list[0];
    const levels = Array.from({ length: 8 }, (_, i) => (i < list.length ? Math.max(1, Math.round((list[i] / max) * HEAT_LEVELS)) : 0));
    return { type: 'grid', levels };
  }
  const bars = barsOf(kind, dives, extras);
  const values = lastScaled(bars.map((b) => b.value));
  if (!values.length) return null;
  if (kind === 'byYear' || kind === 'bySite') return { type: 'bars', values: kind === 'bySite' ? lastScaled(bars.slice(0, PREVIEW_VALUES).map((b) => b.value)) : values };
  return { type: 'line', values };
}

/**
 * Points of a line preview in a 56 × 24 box: 2 dp of margin all round; the depth is drawn
 * downward (deeper is lower), the other measures upward.
 * @param {number[]} values 0 to 1
 * @param {boolean} downward
 * @param {number} [width]
 * @param {number} [height]
 * @returns {string} the points of an SVG polyline
 */
export function linePoints(values, downward, width = 56, height = 24) {
  const pts = values.length === 1 ? [values[0], values[0]] : values;
  const step = (width - 2) / (pts.length - 1);
  return pts
    .map((v, i) => {
      const y = downward ? 2 + v * (height - 4) : height - 2 - v * (height - 4);
      return `${(1 + i * step).toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

/**
 * What a click on a bar leaves in the Carnet: the bar's dives selected (the Carnet's own
 * selection: its detail pane sums several dives up).
 * @param {StatBar|undefined} bar
 * @returns {{ids: number[], anchor: number|null, focus: number|null}|null} null when the bar has no dive
 */
export function selectionOfBar(bar) {
  if (!bar?.diveIds.length) return null;
  const ids = [...bar.diveIds];
  return { ids, anchor: ids[0], focus: ids[ids.length - 1] };
}

/**
 * The name of an image file for a chart: « Benthic-<statistic>-2026-11-15.png ».
 * @param {string} prefix
 * @param {string} title
 * @param {string} day
 */
export function chartFileName(prefix, title, day) {
  const slug = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${prefix}-${slug || 'chart'}-${day}.png`;
}
