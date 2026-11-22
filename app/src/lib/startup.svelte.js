// @ts-check
// What waits for the first screen. At start the core handles one call at a time, in the order they
// come, so every read the first screen does not draw (the statistics, the sites, the saved plans,
// the filter's values) is sent only once the first screen is up: beside the list the dive in the
// pane, else the list. `startup.ready` says so; the data of those screens reads when it turns true
// (it never turns back). It also turns true when the diver leaves the logbook, and after a short
// delay in any case, so that nothing waits for ever.
import { logbook } from './logbook.svelte.js';
import { layout } from './layout.svelte.js';
import { navigation } from './navigation.svelte.js';
import { FALLBACK_MS, PHONE_DELAY_MS, firstScreenUp } from './startup-gate.js';

export const startup = $state({
  ready: false,
  /** The pane's first dive was read from the core and is drawn (DiveDetail.svelte). */
  detail: false,
});

/** Called once, by App.svelte. */
export function watchStartup() {
  $effect(() => {
    if (startup.ready) return;
    const up = firstScreenUp({
      loading: logbook.loading,
      error: logbook.error,
      split: layout.split,
      paneOpening: navigation.paneOpening,
      dive: navigation.dive,
      detail: startup.detail,
      section: navigation.section,
      page: navigation.page,
    });
    if (up) {
      // The phone's list is drawn in the frame that follows its load.
      const timer = setTimeout(() => (startup.ready = true), layout.split || navigation.section !== 'logbook' || navigation.page ? 0 : PHONE_DELAY_MS);
      return () => clearTimeout(timer);
    }
    if (logbook.loading) return;
    const fallback = setTimeout(() => (startup.ready = true), FALLBACK_MS);
    return () => clearTimeout(fallback);
  });
}
