// @ts-check
// The swipe back: a page with a page under it follows a finger moving to the right, from anywhere on it, and goes
// back when the finger is lifted far or fast enough (docs/architecture.md, section 13).
//
// It replaces Framework7's own swipe back (`mdSwipeBack` and `iosSwipeBack` are off, App.svelte), which was the
// source of the pages left half-way: it does not listen to `touchcancel`, so when Android takes the touch for its own
// back gesture the pages stayed where the finger had put them, the router refused every Back and every navigation
// (`swipeBackActive`), and the next touch anywhere went on with the old swipe. It also changed the history by hand,
// outside `router.back`.
//
// Here the gesture only moves the two pages. It holds the router while it runs (lib/router-guard.js), a touch the
// system takes away puts the pages back at once, the release animation has a time limit, and going back is one call
// to the router's own `back`, without animation, once the pages are where that leaves them. The rules are
// Framework7's: not on a page or an element marked `no-swipeback`, not on the list or the detail of a master-detail
// pair, not on a range slider or an open swipeout, through when lifted within 300 ms after 10 px or past half of the
// width.
import { horizontalSwipe } from './swipe.js';
import { heldBack, isBusy, lockRouter } from './router-guard.js';
import { trace } from './nav-trace.js';
import { TAP_SLOP } from './tap.js';

/** Framework7's `--f7-page-swipeback-transition-duration` when the page does not say. */
const RELEASE_MS = 300;
/** Added to the release animation before it is ended by hand (ms). */
const RELEASE_MARGIN = 250;

/**
 * Whether a released swipe goes back: Framework7's rule.
 * @param {{ ms: number, distance: number, width: number }} swipe how long the finger was down, how far the page moved, the view's width
 */
export function swipeGoesBack({ ms, distance, width }) {
  return (ms < 300 && distance > 10) || (ms >= 300 && distance > width / 2);
}

/**
 * Where the two pages are for a finger `dx` px to the right of where it started.
 * Android: the page underneath comes in beside the one leaving, over the full width, as the sections do. iPhone:
 * it moves a fifth of the way, under the leaving page, as iOS does.
 * @param {{ dx: number, width: number, ios: boolean }} at
 * @returns {{ distance: number, progress: number, current: number, previous: number }} px
 */
export function swipeBackPlaces({ dx, width, ios }) {
  const distance = Math.min(Math.max(dx - TAP_SLOP, 0), width);
  const progress = width > 0 ? distance / width : 0;
  return { distance, progress, current: distance, previous: ios ? Math.min(distance / 5 - width / 5, 0) : distance - width };
}

/**
 * Whether a swipe back may start from this touch.
 * @param {{ target: Element|null, viewEl: Element, busy: boolean, split: boolean, swipeoutOpen: boolean }} touch
 * @returns {{ current: HTMLElement, previous: HTMLElement }|null} the two pages, or null
 */
export function swipeBackPages({ target, viewEl, busy, split, swipeoutOpen }) {
  if (busy || swipeoutOpen || !target) return null;
  if (target.closest('.range-slider, .calendar-months, .no-swipeback, .card-opened')) return null;
  if (split && target.closest('.page-master, .page-master-detail')) return null;
  const swipeout = target.closest('.swipeout');
  if (swipeout?.querySelector('.swipeout-actions-left')) return null;
  const current = /** @type {HTMLElement|null} */ (target.closest('.page'));
  // The page of this view, on screen: a view inside a popup has its own swipe back.
  if (!current || current.parentElement !== viewEl || !current.classList.contains('page-current')) return null;
  const before = /** @type {HTMLElement[]} */ ([...viewEl.children]).filter((el) => el.classList.contains('page-previous') && !!(el.compareDocumentPosition(current) & 4));
  const previous = before[before.length - 1];
  return previous ? { current, previous } : null;
}

/**
 * Puts the swipe back on a view's router.
 * @param {any} f7 the Framework7 app
 * @param {any} router a guarded router
 */
export function attachSwipeBack(f7, router) {
  const viewEl = /** @type {HTMLElement|undefined} */ (router.el);
  if (!viewEl || router.bcSwipeBack) return;
  router.bcSwipeBack = true;
  const ios = f7.theme === 'ios';
  /** @type {Element|null} */
  let target = null;
  /**
   * The swipe being followed.
   * @type {null|{ current: HTMLElement, previous: HTMLElement, width: number, since: number, distance: number, unlock: () => void, shadow: HTMLElement|null, shade: HTMLElement|null }}
   */
  let swipe = null;
  /** The release animation runs: no new swipe until it has ended. */
  let releasing = false;

  /** Puts the pages back in Framework7's hands: no inline style, no effect element. */
  function clear(/** @type {NonNullable<typeof swipe>} */ s) {
    for (const el of [s.current, s.previous]) {
      el.classList.remove('page-swipeback-active');
      el.style.transform = '';
      el.style.transition = '';
    }
    s.shadow?.remove();
    s.shade?.remove();
  }

  function begin() {
    const split = router.params?.masterDetailBreakpoint > 0 && f7.width >= router.params.masterDetailBreakpoint;
    const pages = swipeBackPages({ target, viewEl: /** @type {HTMLElement} */ (viewEl), busy: isBusy(router) || releasing, split, swipeoutOpen: !!f7.swipeout?.el });
    if (!pages || f7.preventSwipeBack) return null;
    let shadow = null;
    let shade = null;
    if (ios) {
      shadow = document.createElement('div');
      shadow.className = 'page-shadow-effect';
      pages.current.append(shadow);
      shade = document.createElement('div');
      shade.className = 'page-opacity-effect';
      pages.previous.append(shade);
    }
    for (const el of [pages.current, pages.previous]) el.classList.add('page-swipeback-active');
    trace('swipe', `${viewEl?.id.replace(/^view-/, '') || 'view'} back`);
    return { ...pages, width: /** @type {HTMLElement} */ (viewEl).clientWidth, since: Date.now(), distance: 0, unlock: lockRouter(router, 'swipe-back'), shadow, shade };
  }

  /** @param {number} dx */
  function place(dx) {
    if (!swipe) return;
    const at = swipeBackPlaces({ dx, width: swipe.width, ios });
    swipe.distance = at.distance;
    swipe.current.style.transform = `translate3d(${at.current}px,0,0)`;
    swipe.previous.style.transform = `translate3d(${at.previous}px,0,0)`;
    if (swipe.shadow) swipe.shadow.style.opacity = String(1 - at.progress);
    if (swipe.shade) swipe.shade.style.opacity = String(1 - at.progress);
  }

  /** The system took the touch (its own back gesture, a call): the pages are back at once, so that a Back that follows finds the view at rest. */
  function cancel() {
    const s = swipe;
    swipe = null;
    if (!s) return;
    clear(s);
    s.unlock();
    trace('swipe-end', 'cancelled');
  }

  function release() {
    const s = swipe;
    swipe = null;
    if (!s) return;
    const through = swipeGoesBack({ ms: Date.now() - s.since, distance: s.distance, width: s.width });
    const settle = () => {
      releasing = false;
      // Going back is the router's own Back, without animation: the pages already are where it leaves them.
      if (through && s.current.isConnected) heldBack(router, { animate: false });
      clear(s);
      s.unlock();
      trace('swipe-end', through ? 'back' : 'reset');
    };
    if (s.distance === 0) {
      settle();
      return;
    }
    releasing = true;
    const ms = parseFloat(getComputedStyle(s.current).getPropertyValue('--f7-page-swipeback-transition-duration')) || RELEASE_MS;
    for (const el of [s.current, s.previous]) el.style.transition = `transform ${ms}ms`;
    for (const el of [s.shadow, s.shade]) if (el) el.style.transition = `opacity ${ms}ms`;
    // The resting places Framework7's style sheet gives a page under another one: 20% to the left on iPhone; on
    // Android the page is beside the screen while it follows the finger, and hidden under the current one at rest.
    const under = ios ? -s.width / 5 : -s.width;
    s.current.style.transform = `translate3d(${through ? s.width : 0}px,0,0)`;
    s.previous.style.transform = `translate3d(${through ? 0 : under}px,0,0)`;
    for (const el of [s.shadow, s.shade]) if (el) el.style.opacity = through ? '0' : '1';
    let ended = false;
    const end = () => {
      if (ended) return;
      ended = true;
      clearTimeout(timer);
      s.current.removeEventListener('transitionend', onEnd);
      settle();
    };
    const onEnd = (/** @type {TransitionEvent} */ e) => e.target === s.current && e.propertyName === 'transform' && end();
    s.current.addEventListener('transitionend', onEnd);
    // The transition's end does not come when nothing moved or the page is not drawn: the limit ends it.
    const timer = setTimeout(end, ms + RELEASE_MARGIN);
  }

  horizontalSwipe(viewEl, {
    accept(e) {
      target = /** @type {Element|null} */ (e.target);
      return !releasing && !isBusy(router);
    },
    move(dx) {
      if (!swipe) {
        // To the left: not a swipe back (the scroll, another swipe).
        if (dx <= 0) return false;
        swipe = begin();
        if (!swipe) return false;
      }
      place(dx);
      return true;
    },
    end: release,
    cancel,
  });
}

/**
 * Puts the swipe back on every view's router, the ones that exist and the ones that start later.
 * @param {any} f7 the Framework7 app
 */
export function enableSwipeBack(f7) {
  /** @param {any} view */
  const attach = (view) => view?.router && attachSwipeBack(f7, view.router);
  for (const id of ['logbook', 'sites', 'statistics', 'tools', 'account']) attach(f7.views.get(`#view-${id}`));
  attach(f7.views.main);
  f7.on('viewInit', attach);
}
