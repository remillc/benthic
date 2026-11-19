// @ts-check
// The navigation's health (docs/architecture.md, section 13): after each navigation has settled the invariants of
// lib/nav-invariants.js are checked on the real page. A broken state is written to the trace, repaired at once (the
// diver gets a working screen back) and offered as an error report that carries the trace (lib/error-reports.svelte.js),
// so that what led to it can be read afterwards. Nothing here runs while the pages move.
import { readApp, readView, checkApp, appIsMoving, checkView, isMoving } from './nav-invariants.js';
import { onTrace, trace, pathOf } from './nav-trace.js';

/** How long after the last navigation event the page is looked at (ms). */
const SETTLE_MS = 700;
/** While the pages still move, how often it looks again (ms). */
const RETRY_MS = 500;
/** Pages that have been moving for this long are stuck (ms): past the guard's own limits (lib/router-guard.js). */
export const STUCK_MS = 10000;
/** At most this many repairs a minute: a fault that comes back at once must not loop. */
const MAX_REPAIRS = 3;

/** Events of this module, which must not start a new check by themselves. */
const OWN = new Set(['broken', 'repair']);

/**
 * Puts a view back in a sound state without leaving its page: the classes and styles a page change or a swipe left
 * behind go, the router is reopened, a page that waits as « next » is removed.
 * @param {any} router a Framework7 router
 */
export function tidyView(router) {
  const el = /** @type {HTMLElement|undefined} */ (router?.el);
  if (!el) return;
  el.classList.remove(...[...el.classList].filter((c) => c.startsWith('router-transition')), 'od-pushing', 'od-pushing-back', 'od-push-settle');
  for (const p of ['--od-push-dx', '--od-push-ease', '--od-push-ms']) el.style.removeProperty(p);
  for (const page of /** @type {HTMLElement[]} */ ([...el.children])) {
    if (!page.classList.contains('page')) continue;
    page.classList.remove('page-transitioning', 'page-transitioning-swipeback', 'page-swipeback-active', 'od-push-from');
    page.style.transform = '';
    page.style.transition = '';
    for (const effect of page.querySelectorAll(':scope > .page-shadow-effect, :scope > .page-opacity-effect')) effect.remove();
    if (page.classList.contains('page-next')) router.removePage?.(page);
  }
  router.odLocks = 0;
  router.swipeBackActive = false;
  router.odAnimating = false;
  router.allowPageChange = true;
}

/**
 * The last resort for a view whose pages and history no longer agree: the view is loaded again on its first screen.
 * @param {any} router a Framework7 router
 */
export function reloadView(router) {
  const first = router?.view?.params?.url || router?.history?.[0] || '/';
  tidyView(router);
  (router.odRaw ?? router).navigate(first, { reloadAll: true, animate: false });
}

/**
 * Starts the checks.
 * @param {object} options
 * @param {Document} [options.doc]
 * @param {(message: string) => void} [options.report] offers an error report (the trace is added to every report)
 * @param {{ setTimeout?: typeof setTimeout, clearTimeout?: typeof clearTimeout, now?: () => number }} [options.clock] for the tests
 * @returns {{ check: () => string[], stop: () => void }} `check` looks now and returns what it found (and repaired)
 */
export function startNavHealth({ doc = document, report = () => {}, clock = {} } = {}) {
  const wait = clock.setTimeout ?? setTimeout;
  const unwait = clock.clearTimeout ?? clearTimeout;
  const now = clock.now ?? Date.now;
  /** @type {any} */
  let timer = 0;
  /** Since when the pages have been moving without a rest; 0 when they were last seen at rest. */
  let movingSince = 0;
  /** @type {number[]} */
  const repairs = [];

  const schedule = (/** @type {number} */ ms) => {
    unwait(timer);
    timer = wait(run, ms);
  };

  /** @param {string[]} problems */
  function broken(problems) {
    trace('broken', problems.join('; '));
    const t = now();
    while (repairs.length && t - repairs[0] > 60000) repairs.shift();
    if (repairs.length >= MAX_REPAIRS) return;
    repairs.push(t);
    /** @type {string[]} */
    const done = [];
    for (const viewEl of doc.querySelectorAll('.view')) {
      const router = /** @type {any} */ (viewEl).f7View?.router;
      const before = router && readViewSafe(viewEl);
      if (!before || (!checkView(before).length && !isMoving(before))) continue;
      tidyView(router);
      const after = readViewSafe(viewEl);
      if (after && checkView(after).length) {
        reloadView(router);
        done.push(`${before.id} reloaded`);
      } else done.push(`${before.id} tidied`);
    }
    // A scrim with nothing above it takes every tap.
    if (!doc.querySelector('.modal-in:not(.toast), .modal-out')) for (const b of doc.querySelectorAll('.backdrop-in:not(.panel-backdrop)')) b.classList.remove('backdrop-in');
    trace('repair', done.join(', ') || 'nothing to do');
    report(`Navigation left in a broken state (repaired): ${problems.join('; ')}`.slice(0, 600));
  }

  function run() {
    timer = 0;
    if (doc.hidden) return [];
    const app = readApp(doc);
    if (appIsMoving(app)) {
      movingSince ||= now();
      if (now() - movingSince < STUCK_MS) {
        schedule(RETRY_MS);
        return [];
      }
      movingSince = 0;
      const stuck = app.views.filter(isMoving).map((v) => `${v.id}: still moving after ${STUCK_MS / 1000} s on ${pathOf(v.current)} (${v.allow ? '' : 'closed '}${v.locks ? 'held ' : ''}${v.classes.split(/\s+/).filter((c) => /transition|push/.test(c)).join(' ')})`.replace(/\s+\)/, ')'));
      broken(stuck);
      return stuck;
    }
    movingSince = 0;
    const problems = checkApp(app);
    if (problems.length) broken(problems);
    return problems;
  }

  const stopTrace = onTrace((event) => {
    if (!OWN.has(event.type)) schedule(SETTLE_MS);
  });
  const onVisible = () => !doc.hidden && schedule(SETTLE_MS);
  doc.addEventListener?.('visibilitychange', onVisible);
  return {
    check: run,
    stop() {
      unwait(timer);
      stopTrace();
      doc.removeEventListener?.('visibilitychange', onVisible);
    },
  };
}

/** How long a sheet, a popup or a dialog may take to close before its end is given by hand (ms). */
const MODAL_CLOSE_MS = 2000;

/** A sheet, popup or dialog in a few words, for the trace. @param {any} modal */
function modalName(modal) {
  const classes = String(modal?.el?.className ?? '').split(/\s+/);
  return classes.find((c) => c.startsWith('od-')) ?? classes.find((c) => /^(sheet-modal|popup|dialog|popover|actions-modal|toast|login-screen)$/.test(c)) ?? 'modal';
}

/**
 * Writes what moves the app to the navigation trace (lib/nav-trace.js): each route reached, each section shown, each
 * sheet, popup or dialog opened and closed, the app hidden and shown, a touch the system took away, and what must
 * never happen (an entry of the browser's history popped). Also ends a sheet whose closing never ends.
 * @param {any} f7 the Framework7 app
 * @param {Document} [doc]
 */
export function watchNavigation(f7, doc = document) {
  const view = (/** @type {any} */ router) => String(router?.el?.id || router?.view?.name || 'view').replace(/^view-/, '');
  f7.on('routeChanged', (/** @type {any} */ to, /** @type {any} */ _from, /** @type {any} */ router) => trace('route', `${view(router)} ${pathOf(to?.url)} (${router?.history?.length ?? '?'})`));
  f7.on('tabShow', (/** @type {HTMLElement} */ el) => el?.classList?.contains('view') && trace('tab', el.id.replace(/^view-/, '')));
  f7.on('modalOpen', (/** @type {any} */ modal) => trace('modal', `open ${modalName(modal)}`));
  f7.on('modalClosed', (/** @type {any} */ modal) => trace('modal', `closed ${modalName(modal)}`));
  f7.on('modalClose', (/** @type {any} */ modal) => {
    trace('modal', `close ${modalName(modal)}`);
    const el = /** @type {HTMLElement|undefined} */ (modal?.el);
    // Framework7 waits for the end of the closing transition, which never comes when nothing moves (the sheet was
    // already dragged out, the element is not drawn): the modal then stays « closing » for good.
    if (el) setTimeout(() => {
      if (!el.isConnected || !el.classList.contains('modal-out')) return;
      trace('modal-forced', modalName(modal));
      el.dispatchEvent(new Event('transitionend'));
    }, MODAL_CLOSE_MS);
  });
  f7.on('panelOpen', () => trace('panel', 'open'));
  f7.on('panelClose', () => trace('panel', 'close'));
  doc.addEventListener('visibilitychange', () => trace('app', doc.hidden ? 'hidden' : 'shown'));
  doc.addEventListener(
    'touchcancel',
    (e) => {
      trace('touchcancel', '');
      // Framework7's own gestures (a sheet or a popup dragged down, the side menu, a swipeout, a toggle) only end on
      // `touchend`: a touch the system takes away left them half-way until the next touch. They get the cancelled
      // touch as their end. (The app's own swipes hear `touchcancel` themselves: lib/swipe.js.)
      try {
        f7.emit('touchend:passive', e);
      } catch (error) {
        console.error('Ending a cancelled touch', error);
      }
    },
    { capture: true, passive: true },
  );
  // Nothing in the app writes to the browser's history: an entry popped is a fault to find.
  doc.defaultView?.addEventListener('popstate', () => trace('popstate', doc.defaultView?.location?.hash ?? ''));
}

/** @param {Element} viewEl */
function readViewSafe(viewEl) {
  try {
    return readView(viewEl);
  } catch {
    return null;
  }
}
