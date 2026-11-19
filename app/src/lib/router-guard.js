// @ts-check
// The one passage for every page change (docs/architecture.md, section 13). Framework7's routers own the history,
// one per view, in memory; nothing else may move a page or edit a history, and nothing is written to the browser's.
//
// Framework7 drops a `back` or a `navigate` that comes while a page change is running, and a page that moves by hand
// (a swipe that follows the finger) rewrites the history some time after the finger is lifted. A Back that came in
// that window ran against a history that was about to be rewritten: the view stayed half-way. And a page change whose
// end never comes (an animation that does not run, a touch that the system took away) left the router closed for
// good: every Back ignored, the page « no longer responds ».
//
// Every view's router gets this wrapper (`guardRouter`, once per view; App.svelte, on `viewInit`):
//  - `back()` is ignored while the view is held (`lockRouter`) or while a page change is running;
//  - `navigate()` waits for them to end, then runs (the same address twice in a row runs once; an address that is the
//    page already shown does not run; a wait that outlives the page it was asked from is dropped);
//  - a page change that does not end is ended (`animate` watchdog), a router closed for too long is reopened, a hold
//    kept too long is released: none of the three can block the view for ever;
//  - `heldNavigate`, `heldBack` and `dropPreviousPage` are for the code that holds the router (a swipe that follows
//    the finger): the only way past the hold.
// The system Back (lib/back-button.js), the navbar's arrow and the swipe back (lib/swipe-back.js) all end on
// `router.back`, so all go through here. Each decision is written to the navigation trace (lib/nav-trace.js).
import { trace, pathOf } from './nav-trace.js';

/** The longest a navigation waits before it is dropped (ms): a page change that never ends must not queue for ever. */
const MAX_WAIT = 3000;
/** How often a waiting navigation looks again (ms). */
const POLL = 40;
/** Added to the length of a page animation before it is ended by hand (ms). */
const ANIMATION_MARGIN = 500;
/** A router that has refused page changes for this long, with no page animation running, is reopened (ms). A page loaded on demand waits at most 3 s for its style sheets. */
export const BUSY_LIMIT = 5000;
/** A hold is released by itself after this long (ms): a touch whose end never came must not close the view for ever. */
export const LOCK_LIMIT = 8000;

/**
 * @typedef {{
 *   allowPageChange?: boolean, currentRoute?: { url?: string, path?: string }, odLocks?: number,
 *   back: Function, navigate: Function, animate?: Function, history?: string[], el?: Element,
 *   odRaw?: { back: Function, navigate: Function }, odBusySince?: number|null, odAnimating?: boolean, odName?: string,
 *   [key: string]: any,
 * }} GuardedRouter
 */

/** @param {GuardedRouter} router */
export const isBusy = (router) => (router.odLocks ?? 0) > 0 || router.allowPageChange === false;

/** The view of a router, for the trace. @param {GuardedRouter} router */
const nameOf = (router) => router.odName ?? (router.odName = String(router.el?.id || router.view?.name || 'view').replace(/^view-/, ''));

/**
 * Holds the router: `back` is ignored and `navigate` waits until the returned function is called, or `LOCK_LIMIT`.
 * @param {GuardedRouter} router
 * @param {string} [why] for the trace
 * @param {{ setTimeout?: typeof setTimeout, clearTimeout?: typeof clearTimeout }} [clock] for the tests
 * @returns {() => void} releases the hold (once)
 */
export function lockRouter(router, why = '', clock = {}) {
  router.odLocks = (router.odLocks ?? 0) + 1;
  trace('lock', `${nameOf(router)} ${why}`.trim());
  let released = false;
  /** @type {any} */
  let timer = 0;
  const release = (/** @type {string} */ how) => {
    if (released) return;
    released = true;
    (clock.clearTimeout ?? clearTimeout)(timer);
    router.odLocks = Math.max(0, (router.odLocks ?? 1) - 1);
    trace(how, `${nameOf(router)} ${why}`.trim());
  };
  timer = (clock.setTimeout ?? setTimeout)(() => release('lock-timeout'), LOCK_LIMIT);
  // Node (the tests): the limit must not keep the process alive.
  if (timer && typeof timer === 'object' && typeof timer.unref === 'function') timer.unref();
  return () => release('unlock');
}

/** The address of a navigate call: `navigate('/x')` or `navigate({ url })`. @param {any} target */
const urlOf = (target) => (typeof target === 'string' ? target : (target?.url ?? target?.path ?? ''));

/** @param {GuardedRouter} router */
const currentUrl = (router) => router.currentRoute?.url ?? router.currentRoute?.path ?? '';

/**
 * The length of the CSS animations of some elements, in ms (the longest; delay included).
 * @param {(Element|undefined)[]} els
 */
function animationMs(els) {
  let longest = 0;
  for (const el of els) {
    if (!el || typeof getComputedStyle !== 'function') continue;
    const style = getComputedStyle(el);
    const seconds = (/** @type {string} */ list) => list.split(',').map((s) => (s.trim().endsWith('ms') ? parseFloat(s) / 1000 : parseFloat(s) || 0));
    const durations = seconds(style.animationDuration || '0s');
    const delays = seconds(style.animationDelay || '0s');
    durations.forEach((d, i) => (longest = Math.max(longest, (d + (delays[i % delays.length] || 0)) * 1000)));
  }
  return longest;
}

/**
 * @param {GuardedRouter} router
 * @param {{ setTimeout?: typeof setTimeout, clearTimeout?: typeof clearTimeout, now?: () => number }} [clock] for the tests
 * @returns {GuardedRouter} the same router
 */
export function guardRouter(router, clock = {}) {
  if (router.odRaw) return router;
  const wait = clock.setTimeout ?? setTimeout;
  const unwait = clock.clearTimeout ?? clearTimeout;
  const now = clock.now ?? Date.now;
  const raw = { back: router.back.bind(router), navigate: router.navigate.bind(router) };
  router.odRaw = raw;
  /** The address waiting to run (the latest one only: a tap sequence ends on the last tap). @type {{ args: any[], url: string, from: string }|null} */
  let queued = null;
  let polling = false;

  // Since when the router refuses page changes: Framework7 only writes `allowPageChange`, this notes the time it closes.
  let allow = router.allowPageChange !== false;
  router.odBusySince = allow ? null : now();
  Object.defineProperty(router, 'allowPageChange', {
    configurable: true,
    enumerable: true,
    get: () => allow,
    set(value) {
      const next = value !== false;
      if (next !== allow) router.odBusySince = next ? null : now();
      allow = next;
    },
  });

  /** Reopens a router closed for too long with no page animation running: its page change was lost. */
  function reopenIfStuck() {
    if (allow || router.odAnimating || router.odBusySince == null || now() - router.odBusySince < BUSY_LIMIT) return;
    trace('busy-forced', nameOf(router));
    router.allowPageChange = true;
  }

  function drain(/** @type {number} */ since) {
    if (!queued) {
      polling = false;
      return;
    }
    reopenIfStuck();
    if (!isBusy(router)) {
      const next = queued;
      queued = null;
      polling = false;
      if (next.url && next.url === currentUrl(router)) return;
      // The page changed while it waited (another page change went through first): what was asked from the old page is dropped.
      if (next.from !== currentUrl(router)) {
        trace('nav-dropped', `${nameOf(router)} ${pathOf(next.url)} stale`);
        return;
      }
      trace('nav', `${nameOf(router)} ${pathOf(next.url)} after wait`);
      raw.navigate(...next.args);
      return;
    }
    if (now() - since > MAX_WAIT) {
      trace('nav-dropped', `${nameOf(router)} ${pathOf(queued.url)} timeout`);
      queued = null;
      polling = false;
      return;
    }
    wait(() => drain(since), POLL);
  }

  router.back = function (...args) {
    reopenIfStuck();
    // `ignorePageChange` is Framework7's own way to ask for a back during a page change (the first launch's steps).
    const forced = args.some((a) => a && typeof a === 'object' && a.ignorePageChange);
    // Framework7 itself calls `back` to load the page under the current one ahead of time: not a Back.
    const preload = args.some((a) => a && typeof a === 'object' && a.preload);
    if (preload) return raw.back(...args);
    if ((router.odLocks ?? 0) > 0 || (!forced && router.allowPageChange === false)) {
      trace('back-ignored', `${nameOf(router)} ${(router.odLocks ?? 0) > 0 ? 'held' : 'changing'}`);
      return router;
    }
    trace('back', `${nameOf(router)} from ${pathOf(currentUrl(router))}`);
    return raw.back(...args);
  };
  router.navigate = function (...args) {
    reopenIfStuck();
    const url = urlOf(args[0]);
    if (!isBusy(router)) {
      trace('nav', `${nameOf(router)} ${pathOf(url)}`);
      return raw.navigate(...args);
    }
    if (queued && queued.url === url && url) return router;
    trace('nav-queued', `${nameOf(router)} ${pathOf(url)}`);
    queued = { args, url, from: currentUrl(router) };
    if (!polling) {
      polling = true;
      const since = now();
      wait(() => drain(since), POLL);
    }
    return router;
  };

  // A page animation that does not end: Framework7 waits for the `animationend` of one page, which never comes when
  // the animation does not run (a hidden page, a style that removes it). The watchdog ends it in its place.
  const rawAnimate = router.animate?.bind(router);
  if (rawAnimate) {
    router.animate = function (/** @type {any} */ $old, /** @type {any} */ $new, /** @type {string} */ direction, /** @type {any} */ transition, /** @type {Function|undefined} */ callback) {
      let done = false;
      /** @type {any} */
      let timer = 0;
      const finish = () => {
        if (done) return;
        done = true;
        unwait(timer);
        router.odAnimating = false;
        trace('anim-end', `${nameOf(router)} ${direction}`);
        callback?.();
      };
      router.odAnimating = true;
      trace('anim', `${nameOf(router)} ${direction}`);
      rawAnimate($old, $new, direction, transition, finish);
      const pages = [$old?.[0], $new?.[0]];
      timer = wait(() => {
        if (done) return;
        trace('anim-forced', `${nameOf(router)} ${direction}`);
        // Framework7's own listener ends the change when the page it waits on says its animation is over.
        for (const el of pages) if (!done && el) el.dispatchEvent(new Event('animationend'));
        if (!done) {
          const classes = [...(router.el?.classList ?? [])].filter((c) => c.startsWith('router-transition'));
          router.el?.classList.remove(...classes);
          finish();
        }
      }, Math.max(animationMs(pages), 300) + ANIMATION_MARGIN);
    };
  }
  return router;
}

/**
 * For the code that holds the router (lockRouter): a navigation that does not wait for the hold.
 * @param {GuardedRouter} router
 * @param {...any} args as `router.navigate`
 */
export function heldNavigate(router, ...args) {
  trace('nav', `${nameOf(router)} ${pathOf(urlOf(args[0]))} held`);
  return (router.odRaw ?? router).navigate(...args);
}

/**
 * For the code that holds the router: a Back that is not ignored for the hold.
 * @param {GuardedRouter} router
 * @param {...any} args as `router.back`
 */
export function heldBack(router, ...args) {
  trace('back', `${nameOf(router)} from ${pathOf(currentUrl(router))} held`);
  return (router.odRaw ?? router).back(...args);
}

/**
 * For the code that holds the router: the page under the current one leaves the history and the document, so that
 * Back skips it (the dive page's side-by-side swipe replaces a dive by its neighbour).
 * @param {GuardedRouter} router
 * @param {HTMLElement} pageEl the page under the current one
 * @returns {boolean} false when the history is not what it should be (nothing is changed then)
 */
export function dropPreviousPage(router, pageEl) {
  const history = router.history;
  if (!history || history.length < 2 || !pageEl.isConnected) return false;
  trace('drop', `${nameOf(router)} ${pathOf(history[history.length - 2])}`);
  history.splice(history.length - 2, 1);
  if (Array.isArray(router.propsHistory) && router.propsHistory.length >= 2) router.propsHistory.splice(router.propsHistory.length - 2, 1);
  if (router.view) router.view.history = [...history];
  router.saveHistory?.();
  const $ = router.app?.$;
  if ($) router.pageCallback?.('beforeRemove', $(pageEl), 'previous', undefined, {});
  router.removePage?.(pageEl);
  return true;
}

/**
 * Puts the guard on every view's router, the ones that exist and the ones that start later (popups, the first launch).
 * @param {any} f7 the Framework7 app
 */
export function enableRouterGuard(f7) {
  /** @param {any} view */
  const guard = (view) => view?.router && guardRouter(view.router);
  for (const id of ['logbook', 'sites', 'statistics', 'tools', 'account']) guard(f7.views.get(`#view-${id}`));
  guard(f7.views.main);
  f7.on('viewInit', guard);
}
