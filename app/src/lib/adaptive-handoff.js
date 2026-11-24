// @ts-check
// What an adaptive page (components/AdaptivePage.svelte) hands over when the window crosses the
// desktop breakpoint, so that the diver's selection and open item survive in both directions
// (docs/system-design.md, section 7). Each function runs once, after the new layout is in place,
// with the router of the page's view. None navigates away from the section; they move what the
// other layout shows into the shape this one shows it in.
import { desk } from './desktop-logbook.svelte.js';
import { diveUrlOfCore } from './dive-id.js';
import { openTool, desktopTools } from './desktop-tools.svelte.js';
import { pathOfTool, toolOfPath } from './desktop-tools.js';
import { encodeCriteria, myStatistics, rowHref } from './statistics.svelte.js';
import { chooseStatistic, statSelection } from './statistics-selection.svelte.js';
import { layout } from './layout.svelte.js';

/** The detail pane emptied (pages/PaneEmpty.svelte). */
const EMPTY = '/pane/empty';

/** @param {any} router */
const route = (router) => router?.currentRoute ?? null;

/** The detail pane of a list and detail pair goes: the emptied pane replaces it (pages/PaneEmpty.svelte). @param {any} router */
function emptyPane(router) {
  router.navigate(EMPTY, { reloadDetail: true, animate: false });
}

/**
 * The saved statistic a detail page shows: its result page (`saved=<id>`) or the list of its dives.
 * @param {{ path?: string, query?: Record<string, string> }|null} current
 * @returns {string} its id, or ''
 */
export function savedOfRoute(current) {
  const query = current?.query ?? {};
  if (current?.path === '/statistics/result' && query.saved) return myStatistics.list.some((s) => s.id === query.saved) ? query.saved : '';
  if (current?.path === '/statistics/dives/' && query.section === 'mine') {
    return myStatistics.list.find((s) => s.name === query.title && encodeCriteria(s.criteria) === query.c)?.id ?? '';
  }
  return '';
}

const STATISTICS_DETAIL = ['/statistics/result', '/statistics/dives/'];

/** Statistiques, narrow to wide: the saved statistic of the detail pane is the selection; the pane goes. @param {any} router */
export function statisticsToWide(router) {
  const current = route(router);
  if (!STATISTICS_DETAIL.includes(current?.path)) return;
  const saved = savedOfRoute(current);
  if (saved) chooseStatistic(`saved:${saved}`);
  emptyPane(router);
}

/** Statistiques, wide to narrow: the chosen saved statistic opens beside the list. @param {any} router */
export function statisticsToNarrow(router) {
  const saved = statSelection.key.startsWith('saved:') ? myStatistics.list.find((s) => `saved:${s.id}` === statSelection.key) : null;
  if (!saved || !layout.split) return;
  if (savedOfRoute(route(router)) === saved.id) return;
  router.navigate(rowHref('mine', saved.name, saved.criteria), { reloadDetail: true, animate: false });
}

/** Réglages, narrow to wide: the category follows the subpage (Settings.svelte); the subpage's pane goes. @param {any} router */
export function settingsToWide(router) {
  const path = route(router)?.path ?? '';
  if (path.startsWith('/settings/') && path !== '/settings/') emptyPane(router);
}

/**
 * Réglages, wide to narrow: the overview opens the subpage of the category chosen in the desktop layout
 * (Settings.svelte, openFirstSubpage, run on « page after in »). The new page is not the current one when the
 * emptied pane is, so the event is sent by hand.
 * @param {any} router
 */
export function settingsToNarrow(router) {
  const path = route(router)?.path ?? '';
  if (path.startsWith('/settings/') && path !== '/settings/') return;
  const own = /** @type {HTMLElement[]} */ ([...(router.el?.children ?? [])]).find((el) => el.classList.contains('page') && /** @type {any} */ (el).f7Page?.route?.route?.path === '/settings/');
  const f7Page = /** @type {any} */ (own)?.f7Page;
  if (f7Page && !own?.classList.contains('page-current')) router.app.emit('pageAfterIn', f7Page);
}

/** The root path of an Outils page, and whether the page below the top one is it. @param {any} router @param {string} root */
const overRoot = (router, root) => {
  const history = /** @type {string[]} */ (router.history ?? []);
  return history.length > 1 && history[history.length - 2] === root;
};

/** Outils, narrow to wide: the tool pushed as a page is the desktop pane's tool; the page goes. @param {any} router @param {string} root */
export function toolsToWide(router, root) {
  const id = toolOfPath(route(router)?.path);
  if (!id || !overRoot(router, root)) return;
  openTool(id);
  // The stack is the list and the tool page: the list's page alone replaces both, in the wide layout.
  router.navigate(root, { reloadAll: true, animate: false });
}

/** Outils, wide to narrow: the tool chosen in the desktop pane opens as a page. @param {any} router @param {string} root */
export function toolsToNarrow(router, root) {
  const path = pathOfTool(desktopTools.tool);
  if (!desktopTools.chosen || !path || route(router)?.path !== root) return;
  router.navigate(path, { animate: false });
}

/**
 * Carnet, wide to narrow: the detail pane persists, so the narrow list's own start-up (the first
 * dive, the empty pane) does not run again. A multiple selection has no pane in the narrow layout:
 * the dive in focus takes it. An empty pane is left to the list (Logbook.svelte opens the first dive).
 * @param {any} router
 */
export function logbookToNarrow(router) {
  if (!layout.split || route(router)?.path !== '/pane/selection') return;
  const { ids, focus } = desk.selection;
  const id = ids.includes(focus) ? focus : ids[0];
  if (id) router.navigate(diveUrlOfCore(id), { reloadDetail: true, animate: false });
}
