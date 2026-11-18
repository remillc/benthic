// @ts-check
// State of the desktop Outils section (task 2026-11-15-196), kept while the app runs so that a
// tool shows its last values again when the list brings it back.
import { deviceStore } from './device-store.js';
import { blenderTarget } from './desktop-tools.js';

/** @typedef {'planner'|'desaturation'|'eadMod'|'bestMix'|'blender'} DesktopToolId */

export const BLENDER_MODE_KEY = 'od.blenderMode';
export const BLENDER_ORDER_KEY = 'od.blenderOrder';

/** @returns {'nitrox'|'trimix'} */
function readMode() {
  try {
    return deviceStore.getItem(BLENDER_MODE_KEY) === 'trimix' ? 'trimix' : 'nitrox';
  } catch {
    return 'nitrox';
  }
}

/** @returns {'helium'|'oxygen'} */
function readOrder() {
  try {
    return deviceStore.getItem(BLENDER_ORDER_KEY) === 'oxygen' ? 'oxygen' : 'helium';
  } catch {
    return 'helium';
  }
}

export const desktopTools = $state({
  /** The tool shown in the right pane. */
  tool: /** @type {DesktopToolId} */ ('planner'),
  /** A tool was opened on purpose (a click, a narrow page): narrowing the window opens it as a page. */
  chosen: false,
  /** A start the planner has not taken yet: a new dive (null: keep the plan in progress), or a logbook dive. */
  plannerStart: /** @type {{ kind: 'new' }|{ kind: 'dive', id: number }|{ kind: 'plan', id: number }|null} */ (null),
  /** The planner has taken its first start: later visits keep the plan in progress. */
  plannerStarted: false,
  blender: {
    mode: readMode(),
    order: readOrder(),
    o2: '32',
    he: '35',
    finalPressure: '',
    /** The suggestion the final pressure field was last given by the cylinder. */
    suggested: '',
    cylinder: '',
    insidePressure: '',
    insideO2: '21',
    insideHe: '0',
    topUp: 'air',
    topUpO2: '32',
  },
});

/** @param {DesktopToolId} id */
export function openTool(id) {
  desktopTools.tool = id;
  desktopTools.chosen = true;
}

/** @param {'nitrox'|'trimix'} mode */
export function setBlenderMode(mode) {
  desktopTools.blender.mode = mode;
  try {
    deviceStore.setItem(BLENDER_MODE_KEY, mode);
  } catch {
    // The mode is only a convenience.
  }
}

/** @param {'helium'|'oxygen'} order */
export function setBlenderOrder(order) {
  desktopTools.blender.order = order;
  try {
    deviceStore.setItem(BLENDER_ORDER_KEY, order);
  } catch {
    // The order is only a convenience.
  }
}

/**
 * « Préparer ce mélange »: opens the gas blender with the advised mix as its target.
 * @param {number} bestO2 permille
 * @param {number} bestHe permille
 */
export function prepareBlend(bestO2, bestHe) {
  const target = blenderTarget(bestO2, bestHe);
  setBlenderMode(target.mode);
  desktopTools.blender.o2 = target.o2;
  desktopTools.blender.he = target.he;
  openTool('blender');
}

/** The planner for a new dive, or from a logbook dive (the Carnet's « Planifier à partir de cette plongée »). @param {number} [diveId] */
export function planFromDive(diveId) {
  desktopTools.plannerStart = diveId ? { kind: 'dive', id: diveId } : { kind: 'new' };
  openTool('planner');
}
