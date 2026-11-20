// Tissue loading display shared by the Desaturation tool and the dive profile
// (spec, section 4): the water gradient by load, the alarm colour from 90 %.

export const ALARM_PERCENT = 90;

/**
 * Bar colour for a compartment's load: --bc-water-top at 0 %, --bc-water-bottom
 * at 100 %; --bc-alarm from 90 %.
 * @param {number} percent
 */
export function tissueColor(percent) {
  if (percent >= ALARM_PERCENT) return 'var(--bc-alarm)';
  const mix = Math.max(0, Math.min(100, percent));
  return `color-mix(in srgb, var(--bc-water-bottom) ${mix}%, var(--bc-water-top))`;
}
