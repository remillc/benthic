// @ts-check
// One door for the router calls that must not overlap (the « half-transitioned page » bug).
//
// Framework7 drops a `back` or a `navigate` that comes while a page change is running, and nothing in
// OpenDives knew about the pages that move by hand (the dive page's side-by-side swipe edits the view's history and
// removes a page some time after the finger is lifted). A Back that came in that window ran against a history that was
// about to be rewritten: the view stayed in `router-transition-backward` with the logbook shown a few pixels to the
// left and a route that said « /dives/… ».
//
// Every view's router gets this wrapper (`guardRouter`, once per view; App.svelte, on `viewInit`):
//  - `back()` is ignored while the view is locked (`lockRouter`) or while a page change is running;
//  - `navigate()` waits for them to end, then runs (the same address twice in a row runs once; an address that is the
//    page already shown does not run);
//  - `router.odRaw.back / navigate` are the original methods, for the code that holds the lock.
// The Android Back key (lib/back-button.js) and the navbar back link both call `router.back`, so both go through it.

/** The longest a navigation waits before it is dropped (ms): a page change that never ends must not queue for ever. */
const MAX_WAIT = 3000;
/** How often a waiting navigation looks again (ms). */
const POLL = 40;

/**
 * @typedef {{
 *   allowPageChange?: boolean, currentRoute?: { url?: string, path?: string }, odLocks?: number,
 *   back: Function, navigate: Function,
 *   odRaw?: { back: Function, navigate: Function }
 * }} GuardedRouter
 */

/** @param {GuardedRouter} router */
export const isBusy = (router) => (router.odLocks ?? 0) > 0 || router.allowPageChange === false;

/**
 * Holds the router: `back` is ignored and `navigate` waits until the returned function is called.
 * @param {GuardedRouter} router
 * @returns {() => void} releases the hold (once)
 */
export function lockRouter(router) {
  router.odLocks = (router.odLocks ?? 0) + 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    router.odLocks = Math.max(0, (router.odLocks ?? 1) - 1);
  };
}

/** The address of a navigate call: `navigate('/x')` or `navigate({ url })`. @param {any} target */
const urlOf = (target) => (typeof target === 'string' ? target : (target?.url ?? target?.path ?? ''));

/**
 * @param {GuardedRouter} router
 * @param {{ setTimeout?: typeof setTimeout, now?: () => number }} [clock] for the tests
 * @returns {GuardedRouter} the same router
 */
export function guardRouter(router, clock = {}) {
  if (router.odRaw) return router;
  const wait = clock.setTimeout ?? setTimeout;
  const now = clock.now ?? Date.now;
  const raw = { back: router.back.bind(router), navigate: router.navigate.bind(router) };
  router.odRaw = raw;
  /** The address waiting to run (the latest one only: a tap sequence ends on the last tap). @type {{ args: any[], url: string }|null} */
  let queued = null;
  let polling = false;

  function drain(/** @type {number} */ since) {
    if (!queued) {
      polling = false;
      return;
    }
    if (!isBusy(router)) {
      const next = queued;
      queued = null;
      polling = false;
      if (next.url && next.url === (router.currentRoute?.url ?? router.currentRoute?.path)) return;
      raw.navigate(...next.args);
      return;
    }
    if (now() - since > MAX_WAIT) {
      queued = null;
      polling = false;
      return;
    }
    wait(() => drain(since), POLL);
  }

  router.back = function (...args) {
    // `ignorePageChange` is Framework7's own way to ask for a back during a page change (the first launch's steps).
    const forced = args.some((a) => a && typeof a === 'object' && a.ignorePageChange);
    if ((router.odLocks ?? 0) > 0 || (!forced && router.allowPageChange === false)) return router;
    return raw.back(...args);
  };
  router.navigate = function (...args) {
    if (!isBusy(router)) return raw.navigate(...args);
    const url = urlOf(args[0]);
    if (queued && queued.url === url && url) return router;
    queued = { args, url };
    if (!polling) {
      polling = true;
      const since = now();
      wait(() => drain(since), POLL);
    }
    return router;
  };
  return router;
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
