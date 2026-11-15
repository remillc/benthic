// @ts-check
// The form of the Gas blender (task 2026-11-15-198): what the final pressure starts at and when
// it follows the cylinder, and the working pressure warning. No calculation here: the fill is
// computed by gas-blend.js.

/**
 * The final pressure after the cylinder (or the list of cylinders) changed. It follows the
 * working pressure of the cylinder until the diver types a value; a typed value stays.
 * @param {{ current: string, lastAuto: string, workingMbar: number, mbarPerUnit: number, fallback: string }} input
 *   current: the field now; lastAuto: the value the cylinder put there last (kept by the caller);
 *   fallback: used when the cylinder has no working pressure.
 * @returns {{ value: string, auto: string }} the field, and the new lastAuto
 */
export function followCylinder({ current, lastAuto, workingMbar, mbarPerUnit, fallback }) {
  const auto = workingMbar > 0 ? String(Math.round(workingMbar / mbarPerUnit)) : fallback;
  const follows = current.trim() === '' || current === lastAuto;
  return { value: follows ? auto : current, auto };
}

/**
 * Whether a final pressure is above the working pressure of the cylinder (1 mbar of rounding
 * allowed). The calculation still runs.
 * @param {number} finalMbar
 * @param {number} workingMbar 0 when unknown
 */
export function aboveWorkingPressure(finalMbar, workingMbar) {
  return workingMbar > 0 && finalMbar > workingMbar + 1;
}
