// @ts-check
// From Best mix to the Gas blender (task 2026-11-15-197): "Prepare this mix" leaves the
// advised mix here, and the blender takes it when it opens. Only the mode and the wanted
// mix change; the final pressure, the cylinder and what the cylinder holds keep their values.

/** @type {{ mode: 'nitrox'|'trimix', o2: number, he: number }|null} */
let pending = null;

/**
 * @param {'nitrox'|'trimix'} mode
 * @param {number} o2 Oxygen, in tenths of a percent.
 * @param {number} he Helium, in tenths of a percent.
 */
export function requestBlend(mode, o2, he) {
  pending = { mode, o2, he };
}

/** The mix left by Best mix, once: the next call returns null. */
export function takeBlend() {
  const request = pending;
  pending = null;
  return request;
}
