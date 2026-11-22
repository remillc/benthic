// @ts-check
// When the first screen is up (see startup.svelte.js): the rule, with no state of its own.

/** The delay after the list is loaded past which the rest starts anyway, in ms. */
export const FALLBACK_MS = 2500;
/** On a phone there is no pane: the rest starts this long after the list is loaded, so that the list is drawn first. */
export const PHONE_DELAY_MS = 150;

/**
 * Whether the first screen is up.
 * @param {{ loading: boolean, error: unknown, split: boolean, paneOpening: boolean, dive: string|null, detail: boolean, section: string, page: string }} s
 */
export function firstScreenUp(s) {
  // The diver went elsewhere (another tab, Settings, About): that screen needs its data now.
  if (s.section !== 'logbook' || s.page) return true;
  if (s.loading) return false;
  if (s.error || !s.split) return true;
  // Beside the list: the pane's dive is drawn, or no dive opens (an empty logbook, a filter without result).
  return s.detail || (!s.paneOpening && s.dive === null);
}
