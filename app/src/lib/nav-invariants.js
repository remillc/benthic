// @ts-check
// What must hold once a navigation has settled (docs/architecture.md, section 13, « Invariants »). `readView` and
// `readApp` take a snapshot of the document; `checkView` and `checkApp` are pure and say what is wrong with one.
// The app runs them after each navigation (lib/nav-health.js) and the navigation e2e suite runs the very same
// functions after each of its steps (tests/e2e/navigation.mjs), so that both agree on what « broken » means.

/**
 * @typedef {object} PageSnapshot
 * @property {string} classes
 * @property {string} route the url of the page's own route ('' when Framework7 does not know the page)
 * @property {string} transform the computed transform ('none' when there is none)
 * @property {number} dx how far the page is from its view's left edge, in px
 */
/**
 * @typedef {object} ViewSnapshot
 * @property {string} id
 * @property {string} classes
 * @property {boolean} visible the view is on screen (the active section, an open popup)
 * @property {string} current the router's current route
 * @property {boolean} [modalRoute] the current route is a popup or a sheet opened by the router (Edit dive on a tablet): the page under it stays the current page
 * @property {string[]} history
 * @property {boolean} allow the router accepts a page change
 * @property {number} locks holds taken on the router (lib/router-guard.js)
 * @property {boolean} swiping a swipe back is being followed
 * @property {PageSnapshot[]} pages
 */
/**
 * @typedef {object} AppSnapshot
 * @property {string} hash the fragment of the address
 * @property {number} activeTabs main sections shown
 * @property {boolean} orphanBackdrop a scrim is shown with no sheet, popup or dialog above it
 * @property {ViewSnapshot[]} views
 */

/** The kinds of route Framework7 opens as a modal over the view's pages. */
const MODAL_ROUTES = ['popup', 'popover', 'sheet', 'loginScreen', 'actions', 'customModal', 'panel'];

/** A route without its query. @param {string} url */
const path = (url) => String(url ?? '').replace(/[?#].*$/, '');

const has = (/** @type {string} */ classes, /** @type {string} */ name) => new RegExp(`(^|\\s)${name}(\\s|$)`).test(classes);

/** The classes a view only carries while a page change or a swipe is running. */
const MOVING = /router-transition|bc-pushing|bc-push-settle/;

/**
 * @param {ViewSnapshot} view
 * @returns {boolean} a page change, a swipe or a hold is running: the view cannot be judged yet
 */
export function isMoving(view) {
  return MOVING.test(view.classes) || !view.allow || view.locks > 0 || view.swiping || view.pages.some((p) => /page-transitioning|page-swipeback-active/.test(p.classes));
}

/**
 * What is wrong with a view that should be at rest.
 * @param {ViewSnapshot} view
 * @returns {string[]} nothing when the view is sound
 */
export function checkView(view) {
  /** @type {string[]} */
  const problems = [];
  if (view.locks > 0) problems.push(`the router is still held (${view.locks})`);
  if (!view.allow) problems.push('the router refuses page changes');
  if (view.swiping) problems.push('a swipe back never ended');
  if (MOVING.test(view.classes)) problems.push(`the view keeps ${view.classes.split(/\s+/).filter((c) => MOVING.test(c)).join(' ')}`);
  const current = view.pages.filter((p) => has(p.classes, 'page-current'));
  const split = has(view.classes, 'view-master-detail');
  if (!split && current.length !== 1) problems.push(`${current.length} current pages`);
  if (split && (current.length < 1 || current.length > 2)) problems.push(`${current.length} current pages (list and detail)`);
  const top = current[current.length - 1];
  // A route shown as a popup or a sheet has no page of its own in the view: the page under it is still the current one.
  if (top && !view.modalRoute && path(top.route) !== path(view.current)) problems.push(`the current page is ${path(top.route) || '?'}, the router says ${path(view.current)}`);
  const last = view.history[view.history.length - 1] ?? '';
  if (path(last) !== path(view.current)) problems.push(`the history ends on ${path(last) || '?'}, the router says ${path(view.current)}`);
  for (const p of view.pages) {
    const name = path(p.route) || '?';
    if (has(p.classes, 'page-next')) problems.push(`${name} waits as page-next`);
    if (has(p.classes, 'page-transitioning')) problems.push(`${name} keeps page-transitioning`);
    if (has(p.classes, 'page-swipeback-active')) problems.push(`${name} keeps page-swipeback-active`);
    if (has(p.classes, 'bc-push-from')) problems.push(`${name} keeps bc-push-from`);
    if (has(p.classes, 'page-current') && view.visible) {
      if (p.transform !== 'none') problems.push(`the current page ${name} keeps a transform`);
      // A list beside its detail starts at the view's edge too; the detail starts after the list.
      else if (!split && Math.abs(p.dx) > 1) problems.push(`the current page ${name} is ${Math.round(p.dx)} px off its place`);
    }
  }
  return problems;
}

/**
 * What is wrong with the app as a whole: each view, then what belongs to none.
 * @param {AppSnapshot} app
 * @returns {string[]}
 */
export function checkApp(app) {
  /** @type {string[]} */
  const problems = [];
  for (const view of app.views) for (const p of checkView(view)) problems.push(`${view.id || 'view'}: ${p}`);
  // The app's routers own the history: nothing is ever written to the browser's (no fragment, no entry).
  if (app.hash) problems.push(`the address has a fragment (${app.hash.slice(0, 20)})`);
  if (app.activeTabs > 1) problems.push(`${app.activeTabs} sections shown at once`);
  if (app.orphanBackdrop) problems.push('a scrim is left with nothing above it');
  return problems;
}

/** @param {AppSnapshot} app @returns {boolean} some view is still moving */
export const appIsMoving = (app) => app.views.some(isMoving);

/**
 * @param {Element} viewEl a Framework7 view
 * @returns {ViewSnapshot|null} null when the view has no router or no page yet
 */
export function readView(viewEl) {
  const router = /** @type {any} */ (viewEl).f7View?.router;
  if (!router || !Array.isArray(router.history) || !router.history.length) return null;
  const box = viewEl.getBoundingClientRect();
  const visible = box.width > 0 && box.height > 0 && getComputedStyle(viewEl).visibility !== 'hidden' && (!viewEl.classList.contains('tab') || viewEl.classList.contains('tab-active'));
  const pages = [...viewEl.children].filter((el) => el.classList.contains('page')).map((el) => ({
    classes: el.className,
    route: /** @type {any} */ (el).f7Page?.route?.url ?? '',
    transform: visible ? getComputedStyle(el).transform : 'none',
    dx: visible ? el.getBoundingClientRect().left - box.left : 0,
  }));
  return {
    id: viewEl.id || /** @type {any} */ (viewEl).f7View?.name || '',
    classes: viewEl.className,
    visible,
    current: router.currentRoute?.url ?? '',
    modalRoute: !!router.currentRoute?.modal || MODAL_ROUTES.some((kind) => !!router.currentRoute?.route?.[kind]),
    history: [...router.history],
    allow: router.allowPageChange !== false,
    locks: router.bcLocks ?? 0,
    swiping: !!router.swipeBackActive,
    pages,
  };
}

/**
 * @param {Document} [doc]
 * @returns {AppSnapshot}
 */
export function readApp(doc = document) {
  const views = /** @type {ViewSnapshot[]} */ ([...doc.querySelectorAll('.view')].map(readView).filter(Boolean));
  const backdrop = doc.querySelector('.sheet-backdrop.backdrop-in, .popup-backdrop.backdrop-in, .dialog-backdrop.backdrop-in, .actions-backdrop.backdrop-in, .popover-backdrop.backdrop-in');
  return {
    hash: doc.defaultView?.location?.hash ?? '',
    activeTabs: doc.querySelectorAll('.views > .view.tab.tab-active').length,
    orphanBackdrop: !!backdrop && !doc.querySelector('.modal-in:not(.toast), .modal-out'),
    views,
  };
}
