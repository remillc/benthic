// @ts-check
// Pure logic of the desktop Outils section (task 2026-11-15-196, 198, 199, 201): the tools
// list and its live lines, the desaturation page's figures, the blender's target taken from the best
// mix, the final pressure that follows the cylinder, and the layers of the cylinder drawing.
// No calculation of the planner or of the gas tools lives here: those stay in the phone's
// libraries (planner.svelte.js, gas-calculator.js, gas-blend.js).

/**
 * The tools, in the list's order. `group`: the heading it sits under.
 * @type {readonly { id: 'planner'|'desaturation'|'eadMod'|'bestMix'|'blender', group: 'dive'|'gas', icon: 'plan'|'desaturation'|'depthGauge'|'bestMix'|'blender', name: string, text?: string }[]}
 */
export const DESKTOP_TOOLS = [
  { id: 'planner', group: 'dive', icon: 'plan', name: 'tools.planner' },
  { id: 'desaturation', group: 'dive', icon: 'desaturation', name: 'tools.desaturation' },
  { id: 'eadMod', group: 'gas', icon: 'depthGauge', name: 'tools.eadMod', text: 'tools.eadModText' },
  { id: 'bestMix', group: 'gas', icon: 'bestMix', name: 'tools.bestMixTool', text: 'tools.bestMixText' },
  { id: 'blender', group: 'gas', icon: 'blender', name: 'tools.blender', text: 'tools.blenderText' },
];

/**
 * The page each tool has in the narrow layout (adaptive page: the same tool in both layouts).
 * The planner's page is the list of planned dives.
 * @type {readonly { id: 'planner'|'desaturation'|'eadMod'|'bestMix'|'blender', path: string }[]}
 */
export const TOOL_PAGES = [
  { id: 'planner', path: '/plans/' },
  { id: 'desaturation', path: '/tools/desaturation' },
  { id: 'eadMod', path: '/tools/ead-mod' },
  { id: 'bestMix', path: '/tools/best-mix' },
  { id: 'blender', path: '/tools/blender' },
];

/** The tool whose narrow page is at this path, or null. @param {string|undefined} path */
export function toolOfPath(path) {
  return TOOL_PAGES.find((page) => page.path === path)?.id ?? null;
}

/** The narrow page of a tool. @param {string} id */
export function pathOfTool(id) {
  return TOOL_PAGES.find((page) => page.id === id)?.path ?? null;
}

/**
 * The live line of the planner row: how many planned dives the logbook holds.
 * @param {number|null} plans null until read
 * @returns {{ key: string, params: Record<string, string|number> }|null}
 */
export function plansLine(plans) {
  if (plans === null) return null;
  return plans === 0 ? { key: 'tools.plansNone', params: {} } : { key: 'tools.plansCount', params: { n: plans } };
}

/**
 * The live line of the desaturation row, from the state of lib/tools-page.js: « Avion dans
 * 17 h 05 », « Avion permis », « Au repos », « Aucune plongée au carnet ».
 * @param {{ kind: 'waiting'|'allowed'|'rest'|'empty' }|null} state null until the logbook is read
 * @param {string} wait the remaining wait, already written (« 17 h 05 »)
 * @returns {{ key: string, params: Record<string, string> }|null}
 */
export function desaturationLine(state, wait) {
  if (!state) return null;
  if (state.kind === 'waiting') return { key: 'tools.flightIn', params: { time: wait } };
  if (state.kind === 'allowed') return { key: 'tools.flightAllowed', params: {} };
  return { key: state.kind === 'rest' ? 'tools.atRest' : 'tools.noDives', params: {} };
}

/**
 * The « Dernière plongée » figure of the desaturation page, as the phone's tile: the time since the
 * last dive the calculation used, or « Plus de 48 h » when none counts.
 * @param {number} sinceLastDive seconds, -1 when no dive counts (lib/desaturation.js surfaceSeconds)
 * @returns {{ key: string, seconds: number|null }}
 */
export function lastDiveFigure(sinceLastDive) {
  return sinceLastDive < 0 ? { key: 'desaturation.noRecentDive', seconds: null } : { key: 'desaturation.ago', seconds: sinceLastDive };
}

/**
 * The line that says which rule gave the wait before flying, as the phone's caption.
 * @param {{ hours: number, several: boolean }|null} wait lib/tools.js flightWait; null at rest
 * @param {string} mode the setting: 'auto' or a fixed number of hours
 * @returns {{ key: string, params: Record<string, number> }}
 */
export function flightRule(wait, mode) {
  if (!wait) return { key: 'desaturation.atRest', params: {} };
  if (mode !== 'auto') return { key: 'desaturation.ruleFixed', params: { hours: wait.hours } };
  return { key: wait.several ? 'desaturation.ruleSeveral' : 'desaturation.ruleSingle', params: { hours: wait.hours } };
}

/**
 * « Préparer ce mélange »: what the gas blender takes from the advised mix (task 197's rule,
 * on the desktop first). The mode follows the mix (trimix when it holds helium); the final
 * pressure, the cylinder and what the cylinder holds keep their values.
 * @param {number} bestO2 oxygen in permille, as the gas calculator returns it
 * @param {number} bestHe helium in permille
 * @returns {{ mode: 'nitrox'|'trimix', o2: string, he: string }}
 */
export function blenderTarget(bestO2, bestHe) {
  const percent = (/** @type {number} */ permille) => String(Math.round(permille) / 10).replace('.', ',');
  return { mode: bestHe > 0 ? 'trimix' : 'nitrox', o2: percent(bestO2), he: percent(bestHe) };
}

/**
 * The final pressure that follows the cylinder (task 198): the cylinder's working pressure in
 * the display unit, as typed text, whole units.
 * @param {number} workingPressureMbar
 * @param {number} mbarPerUnit 1000 for bar, 68.947572932 for psi
 * @returns {string}
 */
export function suggestedFinalPressure(workingPressureMbar, mbarPerUnit) {
  return workingPressureMbar > 0 ? String(Math.round(workingPressureMbar / mbarPerUnit)) : '';
}

/**
 * The final pressure to show after the cylinder changed: the new suggestion, unless the diver
 * typed a value of his own (it differs from the suggestion the field was last given).
 * @param {string} current what the field holds
 * @param {string} lastSuggested the suggestion the field was last given ('' when none)
 * @param {string} nextSuggested the new cylinder's suggestion
 * @returns {string}
 */
export function followCylinder(current, lastSuggested, nextSuggested) {
  return current.trim() === '' || current === lastSuggested ? nextSuggested : current;
}

/**
 * Whether a typed final pressure is above the cylinder's working pressure.
 * @param {number} finalValue in the display unit
 * @param {string} suggested the working pressure in the display unit, from suggestedFinalPressure
 * @returns {boolean}
 */
export function aboveWorkingPressure(finalValue, suggested) {
  const working = Number(suggested);
  return working > 0 && finalValue > working;
}

/**
 * The layers of the cylinder drawing, bottom to top in fill order (task 199): helium, oxygen
 * and the top-up gas, never a layer for what was already in the cylinder. A layer's height is
 * the share of that gas in the final pressure, the residual included: the residual's helium
 * counts as helium, its oxygen as oxygen, the rest as top-up gas. Nitrox mode: oxygen and
 * the top-up gas only. The heights add up to the final pressure.
 * @param {{ steps: { gas: 'he'|'o2'|'topup', addedMbar: number }[], startMbar: number, bleedToMbar?: number }} blend the result of gasBlend()
 * @param {{ finalMbar: number, residualO2: number, residualHe: number, trimix: boolean, oxygenFirst: boolean }} options
 *   residualO2 and residualHe: fractions (0 to 1) of the gas that was in the cylinder
 * @returns {{ gas: 'he'|'o2'|'topup', mbar: number, step: number }[]} `step` is the number of its step badge (0: none)
 */
export function cylinderLayers(blend, options) {
  const residual = blend.bleedToMbar ?? blend.startMbar;
  const he = options.trimix ? options.residualHe : 0;
  /** @type {Record<'he'|'o2'|'topup', number>} */
  const total = { he: residual * he, o2: residual * options.residualO2, topup: residual * Math.max(0, 1 - he - options.residualO2) };
  for (const step of blend.steps) total[step.gas] += step.addedMbar;
  const order = options.trimix ? (options.oxygenFirst ? ['o2', 'he', 'topup'] : ['he', 'o2', 'topup']) : ['o2', 'topup'
];
  const sum = order.reduce((s, g) => s + total[/** @type {'he'|'o2'|'topup'} */ (g)], 0);
  const scale = sum > 0 ? options.finalMbar / sum : 0;
  let number = 0;
  return order
    .map((gas) => {
      const g = /** @type {'he'|'o2'|'topup'} */ (gas);
      const added = blend.steps.some((s) => s.gas === g && s.addedMbar > 0);
      return { gas: g, mbar: total[g] * scale, step: added ? ++number : 0 };
    })
    .filter((layer) => layer.mbar > 0);
}

/**
 * The ppO2 of a mix at a depth, in mbar, with the ambient pressure of gas-calculator.js
 * (1013 mbar at the surface plus the water column at the water type's density).
 * @param {number} o2Permille
 * @param {number} depthMm
 * @param {number} salinity kg per 10000 l
 * @returns {number}
 */
export function po2AtDepth(o2Permille, depthMm, salinity) {
  const ambient = Math.round(1013 + depthMm * ((salinity * 0.981) / 100000.0));
  return Math.round((ambient * o2Permille) / 1000);
}

/**
 * What the Facteurs de gradient field holds, « 30 / 75 »: low and high, in the ranges of the phone's
 * planner (low 10 to 150, high 40 to 150). null when it is not valid yet.
 * @param {string} text
 * @returns {{ low: number, high: number }|null}
 */
export function parseGradientFactors(text) {
  const match = /^\s*(\d{1,3})\s*\/\s*(\d{1,3})\s*$/.exec(text);
  if (!match) return null;
  const low = Number(match[1]);
  const high = Number(match[2]);
  return low >= 10 && low <= 150 && high >= 40 && high <= 150 ? { low, high } : null;
}

/** The mixes the planner's gas dropdowns offer, as { o2, he } in permille (the diver may also enter another mix). */
export const GAS_PRESETS = [
  { o2: 209, he: 0 },
  { o2: 320, he: 0 },
  { o2: 360, he: 0 },
  { o2: 400, he: 0 },
  { o2: 500, he: 0 },
  { o2: 800, he: 0 },
  { o2: 1000, he: 0 },
  { o2: 210, he: 350 },
  { o2: 180, he: 450 },
  { o2: 150, he: 550 },
  { o2: 120, he: 650 },
  { o2: 100, he: 700 },
];

/**
 * The dropdown value of a mix: its preset when it is one, else 'custom'.
 * @param {number} o2Permille
 * @param {number} hePermille
 * @returns {string} « 209/0 » or 'custom'
 */
export function gasChoiceValue(o2Permille, hePermille) {
  return GAS_PRESETS.some((g) => g.o2 === o2Permille && g.he === hePermille) ? `${o2Permille}/${hePermille}` : 'custom';
}

/**
 * Runs of the same gas along a plan, for the band under the profile: each run from the start
 * of its first row to the end of its last row, in minutes, with the index of the plan's gas.
 * @param {{ startMinutes: number, endMinutes: number, breathed: { o2Permille: number, hePermille: number }|null }[]} rows the rows of lib/plan-rows.js
 * @param {{ o2Permille: number, hePermille: number }[]} gases the plan's gases
 * @returns {{ gas: number, start: number, end: number }[]}
 */
export function gasRuns(rows, gases) {
  /** @type {{ gas: number, start: number, end: number }[]} */
  const runs = [];
  for (const row of rows) {
    if (!row.breathed) continue;
    const gas = gases.findIndex((g) => g.o2Permille === row.breathed?.o2Permille && g.hePermille === row.breathed?.hePermille);
    if (gas < 0) continue;
    const last = runs[runs.length - 1];
    if (last && last.gas === gas) last.end = row.endMinutes;
    else runs.push({ gas, start: row.startMinutes, end: row.endMinutes });
  }
  return runs;
}
