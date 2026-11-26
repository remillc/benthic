// @ts-check
// Pure logic of the desktop detail pane's tabs (task 2026-11-16-262; mock-ups bureau-carnet-colonnes,
// -onglet-equipement, -onglet-gaz, -onglet-notes, -onglet-carte): the weight chips and their total, the
// gas cards and the consumption figures, the typed gas mix and pressures.
// What is written to the core is decided in desktop-edit.js; this file only prepares what is shown.

import { fillLevels } from './gas-summary.js';
import { gasKind, gasName, pressureUsed, typeHelper } from './cylinder-card.js';
import { formatCylinderSize, formatNumber, formatPressure, formatSac, formatWeight } from './format.js';
import { t, tIfExists } from './i18n.js';
import { cylinderTypeLabel } from './cylinder-types.js';
import { rebreatherLayout } from './rebreather-gas.js';


/** The five stars of « Visibilité »: the words read out for a value (0: « Non notée »). @param {number} n */
export const visibilityText = (n) => (n > 0 ? t('desktopDetail.starsLabel', { label: t('desktopDetail.label.visibility'), n }) : t('desktopDetail.notRated'));

/** The name of a weight's place: translated when it is one of Subsurface's, as stored otherwise, « Lest » when empty. @param {string} description */
export const weightPlaceName = (description) => (description ? (tIfExists(`detail.weightPlaces.${description}`) ?? description) : t('detail.weights'));

/**
 * The chips of the « Lest » field (several weights are allowed: « Ceinture 5 kg », « Intégré 3 kg ») and
 * the total at the right. `index` is the weight's place in the dive's list, as the edit path expects.
 * A weight of 0 is not shown. The total is empty when no weight is set.
 * @param {{ grams: number, description: string }[]|undefined} weights
 * @param {{ weight: string }} prefs
 * @returns {{ chips: { index: number, description: string, place: string, weight: string, grams: number }[], total: string, totalGrams: number }}
 */
export function weightChips(weights, prefs) {
  const chips = (weights ?? [])
    .map((w, index) => ({ index, description: w.description, place: weightPlaceName(w.description), weight: formatWeight(w.grams, prefs), grams: w.grams }))
    .filter((c) => c.grams > 0);
  const totalGrams = chips.reduce((sum, c) => sum + c.grams, 0);
  return { chips, total: totalGrams > 0 ? formatWeight(totalGrams, prefs) : '', totalGrams };
}

/** The label of the nth dive computer: « Principal », « Deuxième », « Troisième », then « Ordinateur n ». @param {number} index */
export const computerRole = (index) => (index < 3 ? t(`desktopDetail.computerRole.${index}`) : t('desktopDetail.computerRole.n', { n: index + 1 }));

/** The span the cylinder was breathed (first and last sample on it), in whole minutes; null when never. @param {{ timeSeconds: number[], cylinder: number[] }|undefined} samples @param {number} index */
export function cylinderSpan(samples, index) {
  if (!samples?.cylinder?.length) return null;
  let first = -1;
  let last = -1;
  for (let i = 0; i < samples.cylinder.length; i++) {
    if (samples.cylinder[i] !== index) continue;
    if (first < 0) first = i;
    last = i;
  }
  if (first < 0) return null;
  return { fromMin: Math.round(samples.timeSeconds[first] / 60), toMin: Math.round(samples.timeSeconds[last] / 60) };
}

/**
 * One card per cylinder of the Gaz tab: the gas, the type and size, the pressure from start to end, and the
 * levels drawn in the cylinder (the pale start band, the water gradient up to the end level).
 * @param {import('benthic-core').Cylinder[]} cylinders
 * @param {{ pressure: string, volume: string }} prefs
 */
export function gasCards(cylinders, prefs) {
  const words = { air: t('edit.gasName.air'), oxygen: t('edit.gasName.oxygen'), nitrox: t('edit.gasName.nitrox'), trimix: t('edit.gasName.trimix') };
  return cylinders.map((c, index) => {
    const levels = fillLevels(c.startMbar, c.endMbar, c.workingPressureMbar);
    const size = typeHelper(formatCylinderSize(c.sizeMl, c.workingPressureMbar, prefs), c.workingPressureMbar);
    const gas = gasName(c.o2Permille || 210, c.hePermille, words);
    const type = [cylinderTypeLabel(c.description), size].filter(Boolean).join(' · ');
    const range = c.startMbar > 0 && c.endMbar > 0 ? t('detail.pressureRange', { start: pressureNumber(c.startMbar, prefs), end: formatPressure(c.endMbar, prefs) }) : c.startMbar > 0 ? formatPressure(c.startMbar, prefs) : c.endMbar > 0 ? formatPressure(c.endMbar, prefs) : '';
    return {
      index,
      gas,
      type,
      range,
      ratio: levels.end,
      startRatio: levels.start,
      hatched: levels.hatched,
      label: t('desktopDetail.gasCardLabel', { n: index + 1, gas, type: type || '—', range: range || '—' }),
    };
  });
}

/** A pressure without its unit. @param {number} mbar @param {{ pressure: string }} prefs */
export const pressureNumber = (mbar, prefs) => formatNumber(mbar / (prefs.pressure === 'psi' ? 68.947572932 : 1000), 0);

/**
 * The Consommation card: the SAC, what was breathed (litres or cubic feet, the core's `gasUsedMl` summed over
 * the cylinders), and for the selected cylinder the pressure used and the bar with the reserve mark.
 * A figure that is not known is empty. The bar runs from 0 to the start pressure; the coloured part is what
 * was used (from the end pressure to the start), the red mark is the reserve.
 * @param {import('benthic-core').DiveDetail} dive
 * @param {number} index the selected cylinder
 * @param {{ pressure: string, volume: string }} prefs
 * @param {number} reserveMbar the reserve of the planner's settings (0: none)
 */
export function consumption(dive, index, prefs, reserveMbar) {
  const c = dive.cylinders[index];
  const gasMl = dive.cylinders.reduce((sum, x) => sum + (x.gasUsedMl > 0 ? x.gasUsedMl : 0), 0);
  const sac = dive.sacMlMin > 0 && dive.divemode !== 'CCR' && dive.divemode !== 'PSCR' ? formatSac(dive.sacMlMin, prefs) : '';
  const breathed = gasMl > 0 ? (prefs.volume === 'cuft' ? `${formatNumber(gasMl / 28316.8466, 1)} ${t('units.cubicFeet')}` : `${formatNumber(gasMl / 1000, 0)} ${t('units.liters')}`) : '';
  const used = c ? pressureUsed(c.startMbar, c.endMbar) : 0;
  const barKnown = !!c && c.startMbar > 0 && c.endMbar > 0 && c.startMbar >= c.endMbar;
  const start = c?.startMbar ?? 0;
  const end = c?.endMbar ?? 0;
  const reserve = barKnown && reserveMbar > 0 && reserveMbar <= start ? reserveMbar : 0;
  const marginMbar = reserve ? end - reserve : 0;
  return {
    sac,
    breathed,
    used: used > 0 ? formatPressure(used, prefs) : '',
    usedOf: used > 0 ? pressureNumber(start, prefs) : '',
    barKnown,
    /** The used part starts at this share of the bar, 0..1 (end over start). */
    usedFrom: barKnown ? end / start : 0,
    /** The reserve mark, 0..1; null without a reserve. */
    reserveAt: reserve ? reserve / start : null,
    reserveText: reserve ? formatPressure(reserve, prefs) : '',
    startText: barKnown ? formatPressure(start, prefs) : '',
    endText: barKnown ? formatPressure(end, prefs) : '',
    marginMbar,
    margin: reserve ? formatPressure(Math.abs(marginMbar), prefs) : '',
    any: !!(sac || breathed || used),
  };
}

/**
 * The mix as typed in the Mélange field: « 21 » or « 32 » (oxygen), « 18/45 » (oxygen/helium, « Tx 18/45 »,
 * « EAN32 » and the words « air » and « oxygen » also work). Null when it is not a mix.
 * @param {string} text
 * @returns {{ o2Permille: number, hePermille: number }|null}
 */
export function parseGas(text) {
  const s = text.trim().toLowerCase().replace(',', '.').replace(/^(ean|nx|nitrox|tx|trimix)\s*/, '');
  if (!s) return null;
  if (s === 'air') return { o2Permille: 210, hePermille: 0 };
  if (s === 'o2' || s === 'oxygen' || s === 'oxygène') return { o2Permille: 1000, hePermille: 0 };
  const m = /^(\d+(?:\.\d+)?)\s*(?:\/\s*(\d+(?:\.\d+)?))?\s*%?$/.exec(s);
  if (!m) return null;
  const o2 = Math.round(Number(m[1]) * 10);
  const he = Math.round(Number(m[2] ?? 0) * 10);
  if (!(o2 >= 10 && o2 <= 1000) || !(he >= 0 && he <= 990) || o2 + he > 1000) return null;
  return { o2Permille: o2, hePermille: he };
}

/** A mix as the Mélange field holds it when editing: « 21 », « 18/45 ». @param {number} o2Permille @param {number} hePermille */
export const gasText = (o2Permille, hePermille) => {
  const pct = (/** @type {number} */ p) => String(Number((p / 10).toFixed(1))).replace('.', ',');
  return hePermille > 0 ? `${pct(o2Permille || 210)}/${pct(hePermille)}` : pct(o2Permille || 210);
};

/**
 * The pressures as typed in the Pression field of a dive logged by hand: « 232 → 70 », « 232-70 », « 232 70 ».
 * One number is the start pressure. Null when it is not a pair of pressures (the end never above the start).
 * @param {string} text
 * @returns {{ start: number, end: number }|null} in the diver's unit; end is 0 when not typed
 */
export function parsePressurePair(text) {
  const parts = text.trim().replace(/,/g, '.').split(/\s*(?:→|->|-|\/|\s)\s*/).filter(Boolean);
  if (parts.length < 1 || parts.length > 2) return null;
  const numbers = parts.map((p) => (/^\d+(?:\.\d+)?$/.test(p) ? Number(p) : NaN));
  if (numbers.some((n) => Number.isNaN(n))) return null;
  const [start, end = 0] = numbers;
  if (end > start) return null;
  return { start, end };
}

// --- Gaz tab: the dive type and the cards that follow it (task 2026-11-24-382) ------------------------------------


/** The dive modes in the order of the « Type de plongée » selector (the core's `divemode` values). */
export const DIVE_MODES = /** @type {const} */ (['OC', 'CCR', 'PSCR', 'Freedive']);

/**
 * The options of the « Type de plongée » segmented button. `short` is for the narrow layouts (portrait tablet, phone):
 * « Ouvert, CCR, pSCR, Apnée ».
 * @param {boolean} [short]
 */
export const diveTypeOptions = (short = false) => DIVE_MODES.map((value) => ({ value, label: t(`desktopDetail.diveType.${short ? 'short' : 'long'}.${value}`) }));

/** The core's mode of a dive, one of DIVE_MODES (an unknown value reads as open circuit). @param {string} mode */
export const knownMode = (mode) => (/** @type {readonly string[]} */ (DIVE_MODES).includes(mode) ? /** @type {typeof DIVE_MODES[number]} */ (mode) : 'OC');

/**
 * The tiles of the Gaz tab for the dive's mode.
 * - open circuit: one tile per cylinder (`kind: 'cylinder'`), titled with its gas;
 * - CCR: one wide tile (`kind: 'ccr'`) holding the diluent and the oxygen, then the other cylinders as ordinary tiles
 *   titled « Secours »;
 * - pSCR: one tile (`kind: 'pscr'`) with the mix, then the others as bailout tiles;
 * - freedive: none (the cylinders stay in the dive, they are only not shown).
 * `key` is `unit` for the rebreather tile and `c<index>` for a cylinder; `indexes` are the cylinders a tile stands for.
 * @param {import('benthic-core').Cylinder[]} cylinders
 * @param {string} mode
 * @param {{ pressure: string, volume: string }} prefs
 * @returns {{ key: string, kind: 'cylinder'|'ccr'|'pscr', indexes: number[], title: string, lines: string[], label: string, card: ReturnType<typeof gasCards>[number]|null, parts: { role: 'diluent'|'oxygen'|'mix', title: string, lines: string[], card: ReturnType<typeof gasCards>[number] }[] }[]}
 */
export function gasTiles(cylinders, mode, prefs) {
  const cards = gasCards(cylinders, prefs);
  /**
   * The gas and the cylinder type, « Air · ALU 3L »; the size when the cylinder has no type name. Pure oxygen is « O₂ », short
   * enough under a rebreather (« O₂ · Faber FX15 (2 L) », 26 November 2026). @param {number} i
   */
  const gasLine = (i) => [gasKind(cylinders[i].o2Permille || 210, cylinders[i].hePermille).kind === 'oxygen' ? t('desktopDetail.cylinderDialog.badgeOxygen') : cards[i].gas, cylinderTypeLabel(cylinders[i].description) || formatCylinderSize(cylinders[i].sizeMl, cylinders[i].workingPressureMbar, prefs)].filter(Boolean).join(' · ');
  /** @param {number} i */
  const tile = (i) => ({ key: `c${i}`, kind: /** @type {const} */ ('cylinder'), indexes: [i], title: cards[i].gas, lines: [cards[i].type, cards[i].range].filter(Boolean), label: cards[i].label, card: cards[i], parts: [] });
  /** @param {number} i */
  const bailout = (i) => ({ ...tile(i), title: t('detail.cylinderUseNames.bailout'), lines: [gasLine(i), cards[i].range].filter(Boolean) });
  if (mode === 'Freedive') return [];
  if (mode === 'CCR' || mode === 'PSCR') {
    const layout = rebreatherLayout(cylinders);
    const pscr = mode === 'PSCR';
    // A semi-closed dive has one mix: the diluent, else the first cylinder; the oxygen is only for a closed circuit.
    const diluent = layout.diluent >= 0 ? layout.diluent : pscr && cylinders.length ? 0 : -1;
    const oxygen = pscr ? -1 : layout.oxygen;
    const others = cylinders.map((_, i) => i).filter((i) => i !== diluent && i !== oxygen);
    /** @type {ReturnType<typeof gasTiles>} */
    const out = [];
    if (diluent >= 0 || oxygen >= 0) {
      // Oxygen first (task 2026-11-26-403): the unit is drawn with the oxygen cylinder on the left and every list names it first.
      const used = [oxygen, diluent].filter((i) => i >= 0);
      const named = (/** @type {string} */ role, /** @type {number} */ i) => (i >= 0 ? `${role} ${gasLine(i)}${cards[i].range ? `, ${cards[i].range}` : ''}` : '');
      out.push({
        key: 'unit',
        kind: pscr ? 'pscr' : 'ccr',
        indexes: used,
        title: t(pscr ? 'desktopDetail.mixTile' : 'desktopDetail.rebreatherTile'),
        lines: [],
        label: pscr ? t('desktopDetail.pscrTileLabel', { mix: named('', diluent).trim() }) : t('desktopDetail.ccrTileLabel', { oxygen: named(t('desktopDetail.role.oxygen').toLocaleLowerCase(), oxygen), diluent: named(t('desktopDetail.role.diluent').toLocaleLowerCase(), diluent) }),
        card: null,
        parts: [
          ...(oxygen >= 0 ? [{ role: /** @type {const} */ ('oxygen'), title: t('desktopDetail.role.oxygen'), lines: [gasLine(oxygen), cards[oxygen].range].filter(Boolean), card: cards[oxygen] }] : []),
          ...(diluent >= 0 ? [{ role: /** @type {const} */ (pscr ? 'mix' : 'diluent'), title: t(pscr ? 'desktopDetail.mixTile' : 'desktopDetail.role.diluent'), lines: [gasLine(diluent), cards[diluent].range].filter(Boolean), card: cards[diluent] }] : []),
        ],
      });
    }
    for (const i of others) out.push(bailout(i));
    return out;
  }
  return cylinders.map((_, i) => tile(i));
}

/**
 * The dive's low and high setpoints (bar) read from the ppO₂ trace of a closed-circuit dive: the controller holds the
 * ppO₂ at a setpoint, so the values the trace stays at (rounded to 0.1 bar, at least 5 % of the samples once below the
 * surface, between 0.4 and 1.7 bar) are the setpoints: the lowest is the low one, the highest the high one. Null when
 * the dive has no trace; one value alone is both.
 * @param {{ ppo2Mbar?: number[]|null, depthMm?: number[] }|null|undefined} samples
 * @returns {{ low: number, high: number }|null}
 */
export function setpointsOf(samples) {
  const trace = samples?.ppo2Mbar;
  if (!trace?.length) return null;
  /** @type {Map<number, number>} */
  const counts = new Map();
  let total = 0;
  trace.forEach((v, i) => {
    if (!(v >= 400 && v <= 1700) || (samples?.depthMm?.[i] ?? 1e9) < 3000) return;
    const bar = Math.round(v / 100) / 10;
    counts.set(bar, (counts.get(bar) ?? 0) + 1);
    total++;
  });
  const plateaus = [...counts].filter(([, n]) => n >= Math.max(3, total * 0.05)).map(([bar]) => bar);
  if (!plateaus.length) return null;
  return { low: Math.min(...plateaus), high: Math.max(...plateaus) };
}
