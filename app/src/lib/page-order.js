// @ts-check
// The pages of a view stay in the order of its history, in the component list as in the document
// (docs/architecture.md, section 13.3, point 8).
//
// When Framework7 goes back to a page that is no longer in the document, or loads the page under the current one
// ahead of time, Framework7-Svelte adds that page's component at the START of the view's list, so Svelte draws it
// first in the view. That is right when the view holds nothing else. But the Logbook view (and every view whose
// first page is a list kept beside or under its detail) keeps its first page in the document for good: the new page
// then lands before the list, and Framework7 moves its element down to just before the current page, into the part
// of the document that Svelte counts as the current page's own. When the current page is removed (Back), Svelte
// removes everything it counts as that page: the page just shown goes with it. The view is left with no page on
// screen and a route that says otherwise. Any stack four pages deep in the Logbook view ended that way on the second
// Back (a dive, its planner, the plans, a new plan; Réglages, a subpage, a page under it).
//
// (The same file makes `removePage` remove every page it is given: see `keepPageOrder`.)
//
// The fix is the order: the new component is put just before the current page's in the list. Svelte then draws it
// where Framework7 wants it, nothing is moved by hand, and each page stays inside its own part of the document.
import { app as f7Shared } from 'framework7-svelte/shared/f7.js';

/**
 * Moves the entry Framework7-Svelte has just put first to its place in the history: right before the current page.
 * @template {{ el?: Element|null }} T
 * @param {T[]} pages the view's component list (changed in place)
 * @param {Element|null|undefined} currentEl the current page of the view (the detail, beside a list)
 * @returns {boolean} whether the list changed
 */
export function placeBeforeCurrent(pages, currentEl) {
  if (pages.length < 3 || !currentEl) return false;
  const at = pages.findIndex((p) => p.el === currentEl);
  // Not found, or the new entry already is right before it.
  if (at <= 1) return false;
  const [entry] = pages.splice(0, 1);
  pages.splice(at - 1, 0, entry);
  return true;
}

/**
 * Puts the order on a view's router.
 * @param {any} router a Framework7 router whose pages are Svelte components
 */
export function keepPageOrder(router) {
  const load = router?.pageComponentLoader;
  if (typeof load !== 'function' || router.odPageOrder) return;
  router.odPageOrder = true;
  // Framework7 hands over several pages at once when a row of the list replaces a detail pane that holds more than
  // one page (a tablet: a dive, then its planner opened in the pane, then another dive tapped in the list).
  // Framework7-Svelte's `removePage` only removes the first of them: the others stayed in the pane, under the new
  // page, still « current ». Each one is removed.
  const remove = router.removePage;
  if (typeof remove === 'function') {
    router.removePage = function (/** @type {any} */ pages) {
      const list = /** @type {Element[]} */ (pages && typeof pages === 'object' && !pages.nodeType && typeof pages.length === 'number' ? [...pages] : pages ? [pages] : []);
      if (list.length > 1) for (const el of list) remove.call(this, el);
      else remove.call(this, pages);
      // Svelte removes a page's part of the document at the next tick. When Framework7 has moved pages around it
      // (a pane replaced), that part no longer holds the page's element, which would stay under the new page: it
      // goes just after.
      setTimeout(() => {
        for (const el of list) if (el?.isConnected && el.classList?.contains('page')) el.remove();
      }, 0);
    };
  }
  router.pageComponentLoader = function (/** @type {any} */ request) {
    const result = load.call(this, request);
    if (request?.direction !== 'backward') return result;
    const views = /** @type {any[]} */ (/** @type {any} */ (f7Shared).f7routers?.views ?? []);
    const data = views.find((v) => (v.el && v.el === router.el) || (v.routerId && v.routerId === router.id));
    const current = /** @type {Element[]} */ ([...(router.el?.children ?? [])]).filter((el) => el.classList.contains('page-current')).pop();
    // The list is read by Framework7-Svelte at the next tick: put in order now, it is drawn once, in order.
    if (data?.pages && placeBeforeCurrent(data.pages, current)) data.setPages?.(data.pages);
    return result;
  };
}

/**
 * Puts the order on every view's router, the ones that exist and the ones that start later.
 * @param {any} f7 the Framework7 app
 */
export function enablePageOrder(f7) {
  /** @param {any} view */
  const keep = (view) => view?.router && keepPageOrder(view.router);
  for (const id of ['logbook', 'sites', 'statistics', 'tools', 'account']) keep(f7.views.get(`#view-${id}`));
  keep(f7.views.main);
  f7.on('viewInit', keep);
}
