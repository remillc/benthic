// @ts-check
// Dives of an Apple Watch Ultra read from Apple Health (to-do #67). The watch writes depth
// (`underwaterDepth`) and water temperature samples into Health, whatever dive app it ran; the
// plugin reads them (iPhone only), and this module, in JavaScript (AGENTS.md, « JavaScript
// first »), cuts them into dives at the surface breaks and writes those dives as a Subsurface
// logbook file, which the core then imports like any file (lib/logbook.svelte.js, importData).
// Only time, depth and temperature exist there: no cylinder, gas or pressure.

/**
 * A sample as the plugin gives it: when it was measured (ms since 1970) and its value (metres
 * of depth, or degrees Celsius). `id` is HealthKit's identifier of the sample.
 * @typedef {{ id?: string, at: number, value: number }} HealthSample
 */

/**
 * @typedef {object} HealthDive
 * @property {number} startMs first sample under water
 * @property {number} endMs last sample under water
 * @property {number} maxDepthM
 * @property {string} firstId HealthKit identifier of the first depth sample: the dive's mark
 * @property {{ t: number, depthM: number, tempC?: number }[]} samples seconds from the start
 */

/** A pause at the surface longer than this ends a dive (as AWU2UDDF and AWU Divelog do). */
export const SURFACE_GAP_S = 5 * 60;
/** Shallower than this throughout: a swim or a splash, not a dive. */
export const MIN_DEPTH_M = 1;
/** Shorter than this: not a dive. */
export const MIN_DURATION_S = 60;
/** The key under which the dive keeps its HealthKit mark (extra data of its dive computer, which Subsurface keeps). */
export const HEALTH_KEY = 'Apple Health';
/** The dive computer's name in the logbook. */
export const WATCH_MODEL = 'Apple Watch Ultra';

/**
 * The depth samples cut into dives at the surface breaks, each with the temperatures measured
 * during it (the nearest earlier temperature, if any, is given to each depth sample).
 * @param {HealthSample[]} depth
 * @param {HealthSample[]} [temperature]
 * @param {{ gapS?: number, minDepthM?: number, minDurationS?: number }} [options]
 * @returns {HealthDive[]} oldest first
 */
export function splitDives(depth, temperature = [], { gapS = SURFACE_GAP_S, minDepthM = MIN_DEPTH_M, minDurationS = MIN_DURATION_S } = {}) {
  const points = depth.filter((s) => Number.isFinite(s.at) && Number.isFinite(s.value)).sort((a, b) => a.at - b.at);
  const temps = temperature.filter((s) => Number.isFinite(s.at) && Number.isFinite(s.value)).sort((a, b) => a.at - b.at);
  /** @type {HealthSample[][]} */
  const groups = [];
  for (const p of points) {
    const last = groups.at(-1)?.at(-1);
    if (!last || (p.at - last.at) / 1000 > gapS) groups.push([p]);
    else groups.at(-1)?.push(p);
  }
  /** @type {HealthDive[]} */
  const dives = [];
  for (const group of groups) {
    const startMs = group[0].at;
    const endMs = group[group.length - 1].at;
    const maxDepthM = Math.max(...group.map((s) => s.value));
    if (maxDepthM < minDepthM || (endMs - startMs) / 1000 < minDurationS) continue;
    let ti = 0;
    const samples = group.map((s) => {
      // The latest temperature measured at or before this depth sample, within the dive.
      while (ti + 1 < temps.length && temps[ti + 1].at <= s.at) ti++;
      const temp = temps[ti] && temps[ti].at <= s.at && temps[ti].at >= startMs - gapS * 1000 ? temps[ti].value : undefined;
      return { t: Math.round((s.at - startMs) / 1000), depthM: s.value, ...(temp === undefined ? {} : { tempC: temp }) };
    });
    dives.push({ startMs, endMs, maxDepthM, firstId: group[0].id ?? '', samples });
  }
  return dives;
}

/** "m:ss min", as Subsurface writes durations and sample times (core/save-xml.cpp). @param {number} seconds */
const minutes = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} min`;

/** @param {string} text */
const attr = (text) => text.replace(/&/g, '&amp;').replace(/'/g, '&apos;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Local wall-clock date and time, as the logbook keeps them. @param {number} ms */
function localParts(ms) {
  const d = new Date(ms);
  const p = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return { date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, time: `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` };
}

/** "12.34 m" with up to 3 decimals, as Subsurface writes depths. @param {number} m */
const metres = (m) => `${Number(m.toFixed(3))} m`;

/**
 * The dives as a Subsurface logbook file (the XML format of core/save-xml.cpp): one dive each,
 * its dive computer « Apple Watch Ultra » with the HealthKit mark in its extra data, the depth
 * and temperature samples.
 * @param {HealthDive[]} dives
 * @returns {string}
 */
export function divesToSsrf(dives) {
  const out = ["<divelog program='subsurface' version='3'>", '<settings>', '</settings>', '<dives>'];
  for (const dive of dives) {
    const { date, time } = localParts(dive.startMs);
    const duration = Math.max(0, Math.round((dive.endMs - dive.startMs) / 1000));
    const temps = dive.samples.map((s) => s.tempC).filter((v) => v !== undefined);
    out.push(`<dive date='${date}' time='${time}' duration='${minutes(duration)}'>`);
    out.push(`  <divecomputer model='${attr(WATCH_MODEL)}'>`);
    out.push(`  <depth max='${metres(dive.maxDepthM)}' />`);
    if (temps.length) out.push(`  <temperature water='${Math.min(.../** @type {number[]} */ (temps)).toFixed(1)} C' />`);
    if (dive.firstId) out.push(`  <extradata key='${attr(HEALTH_KEY)}' value='${attr(dive.firstId)}' />`);
    let lastTemp;
    for (const s of dive.samples) {
      // A temperature only where it changes, as Subsurface writes them.
      const temp = s.tempC !== undefined && s.tempC !== lastTemp ? ` temp='${s.tempC.toFixed(1)} C'` : '';
      if (temp) lastTemp = s.tempC;
      out.push(`  <sample time='${minutes(s.t)}' depth='${metres(s.depthM)}'${temp} />`);
    }
    out.push('  </divecomputer>');
    out.push('</dive>');
  }
  out.push('</dives>', '</divelog>', '');
  return out.join('\n');
}
