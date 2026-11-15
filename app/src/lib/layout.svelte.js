// @ts-check
// Width decides the layout, not the type of device (spec, section 3): below
// 768 px, phone layout. A foldable therefore changes layout without restarting.

/** Debug override of the platform look: `?theme=ios` or `?theme=md`. */
const forced = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('theme') : null;

/** The iOS look is used on iPhone and iPad, the Material look elsewhere. */
export const ios =
  forced === 'ios' ||
  (forced !== 'md' &&
    typeof navigator !== 'undefined' &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)));

/**
 * The desktop app (Electron, task 2026-11-15-169): its preload script gives the interface
 * `window.odDesktop`. Material 3 Expressive on every system (docs/system-design.md, section 7).
 */
export const desktopApp = typeof window !== 'undefined' && !!(/** @type {any} */ (window).odDesktop);

/** The Mac's desktop app: its menu bar, ⌘ in shortcuts, no Réglages in the rail. */
export const desktopMac = desktopApp && /** @type {any} */ (window).odDesktop.platform === 'darwin';

/** From this width the desktop app shows the logbook as a table beside the detail; below, the tablet layout. */
export const desktopBreakpoint = 1200;

/** Width of the tablet navigation, in px: the iPad sidebar, the Android rail (spec, section 3). */
export const navWidth = ios ? 220 : 96;

// Read by the rail and by the views (App.svelte).
if (typeof document !== 'undefined') document.documentElement.style.setProperty('--od-nav-width', `${navWidth}px`);

/** Width of the list pane of a list and detail pair (spec, section 3). */
export const listWidth = 340;

/**
 * Both panes of a list and detail pair show from 768 px, as soon as the
 * tablet layout starts (Christian's choice, 7 November 2026): iPad in
 * portrait included, the detail then narrower beside the navigation and the
 * list. Below, the phone layout: the detail replaces the list.
 */
export const splitBreakpoint = 768;

/**
 * The navigation rail (Android) and the sidebar (iPad) show with the tablet layout, from 768 dp,
 * in portrait too (task 2026-11-14-126, replacing the « no rail in portrait » rule of 10
 * November 2026).
 */
export const railBreakpoint = splitBreakpoint;

const query = typeof matchMedia === 'function' ? matchMedia('(max-width: 767.98px)') : null;
const railQuery = typeof matchMedia === 'function' ? matchMedia(`(min-width: ${railBreakpoint}px)`) : null;
const splitQuery = typeof matchMedia === 'function' ? matchMedia(`(min-width: ${splitBreakpoint}px)`) : null;
const desktopQuery = desktopApp && typeof matchMedia === 'function' ? matchMedia(`(min-width: ${desktopBreakpoint}px)`) : null;

export const layout = $state({
  phone: query ? query.matches : true,
  /** Rail (Android) or sidebar (iPad) on screen; otherwise the ☰ button and the side menu. */
  rail: railQuery ? railQuery.matches : false,
  /** Tablet layout with room for the list and the detail side by side. */
  split: splitQuery ? splitQuery.matches : false,
  /** Desktop app, wide enough for the logbook's table and the detail pane. */
  desktop: desktopQuery ? desktopQuery.matches : false,
});

query?.addEventListener('change', (e) => {
  layout.phone = e.matches;
});

/**
 * Phones: the four sections are reached from the bottom navigation (Android: the Material bar,
 * task 2026-11-14-120; iPhone: the tab bar, task 2026-11-14-127), and the top bars of the
 * sections have no ☰. Tablets keep their sidebar (iPad) or rail (Android).
 * @returns {boolean}
 */
export const bottomNav = () => layout.phone;
railQuery?.addEventListener('change', (e) => {
  layout.rail = e.matches;
});
splitQuery?.addEventListener('change', (e) => {
  layout.split = e.matches;
});
desktopQuery?.addEventListener('change', (e) => {
  layout.desktop = e.matches;
});
