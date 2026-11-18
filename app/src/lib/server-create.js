// @ts-check
// « Aucun carnet sur votre compte » (task 2026-11-17-266): which choices the screen offers. Pure.

/**
 * The choices, in the order of the screen: an empty logbook, a Subsurface file, and the logbook already on this
 * device when there is one (« Envoyer le carnet de … » appears only then).
 * @param {{ name: string, dives: number }|null|undefined} deviceLogbook
 * @returns {('blank'|'import'|'device')[]}
 */
export function createChoices(deviceLogbook) {
  return deviceLogbook ? ['blank', 'import', 'device'] : ['blank', 'import'];
}
