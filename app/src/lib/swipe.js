// @ts-check
// A horizontal swipe that follows the finger: once the finger has moved more
// sideways than up or down, the vertical scroll is held and `move` receives
// the distance at each step; `end` receives the distance and the speed when
// the finger is lifted. `settle` gives the transition that finishes the move
// from there.
//
// A touch does not always end with the finger lifted (docs/architecture.md, section 13). The system takes it away
// (`touchcancel`) when it recognises its own gesture: on Android with gesture navigation, a swipe from the edge of
// the screen is the system's Back. `cancel` is then called: the swipe must put everything back at once, without an
// animation, because the system's Back can follow in the same instant. A touch that starts inside the system's
// gesture zone is not followed at all when the zone is known (lib/safe-area.js). The moves and the end of a touch are
// listened to on the element it started on, where they are always sent, even when that element has left the document
// meanwhile; and a new touch ends whatever was still followed.

import { springEasing } from './spring.js';
import { SPRINGS } from './motion.js';
import { systemGestureZone } from './safe-area.js';

/**
 * @param {EventTarget} target where the touches are listened to
 * @param {{
 *   accept: (e: TouchEvent) => boolean,
 *   move: (dx: number) => boolean|void,
 *   end: (dx: number, velocity: number) => void,
 *   cancel?: () => void,
 * }} handlers `velocity` in px/ms, negative towards the left. `move` returning false on the first sideways move
 *   declines the swipe (it is not followed and the page keeps its own scroll). `cancel`: the system took the
 *   touch; without it, `end(0, 0)` is called.
 */
export function horizontalSwipe(target, { accept, move, end, cancel }) {
  /** idle: not followed; pending: direction not known yet; h: sideways; v: vertical scroll. */
  let state = 'idle';
  let x0 = 0;
  let y0 = 0;
  let lastX = 0;
  let lastT = 0;
  let velocity = 0;
  let dx = 0;
  /** The element the touch started on: its moves and its end are listened to there (see `follow`). @type {EventTarget|null} */
  let touched = null;

  /** @param {Event} event */
  function onMove(event) {
    const e = /** @type {TouchEvent} */ (event);
    if (state === 'idle' || state === 'v') return;
    const touch = e.touches[0];
    if (!touch) return;
    dx = touch.clientX - x0;
    const dy = touch.clientY - y0;
    const first = state === 'pending';
    if (first) {
      // Decided early, and a slightly slanted move still counts as sideways.
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      state = Math.abs(dx) > Math.abs(dy) * 0.8 ? 'h' : 'v';
      if (state === 'v') return;
    }
    // Speed over the last moves, smoothed: one late event does not hide a flick.
    const dt = e.timeStamp - lastT;
    if (dt > 0) velocity = velocity * 0.4 + ((touch.clientX - lastX) / dt) * 0.6;
    lastX = touch.clientX;
    lastT = e.timeStamp;
    if (move(dx) === false && first) {
      state = 'idle';
      return;
    }
    if (e.cancelable) e.preventDefault();
  }

  /** @param {Event} event */
  function onEnd(event) {
    const was = state;
    state = 'idle';
    unfollow();
    // A finger held still before it is lifted has no speed left: it fades after 40 ms, gone at 100 ms.
    const still = event.timeStamp - lastT;
    if (still > 40) velocity *= Math.max(0, 1 - (still - 40) / 60);
    if (was === 'h') end(dx, velocity);
  }

  /** The touch is gone without the finger lifted. */
  function lost() {
    const was = state;
    state = 'idle';
    unfollow();
    if (was !== 'h') return;
    if (cancel) cancel();
    else end(0, 0);
  }

  /**
   * The moves and the end of a touch are always sent to the element it started on, even after that element has left
   * the document (a list drawn again under the finger); they then no longer reach its old ancestors. So they are
   * listened to on that element, not on `target`: a swipe always ends.
   * @param {EventTarget} el
   */
  function follow(el) {
    touched = el;
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', lost);
  }

  function unfollow() {
    if (!touched) return;
    touched.removeEventListener('touchmove', onMove);
    touched.removeEventListener('touchend', onEnd);
    touched.removeEventListener('touchcancel', lost);
    touched = null;
  }

  // The browser decides when a touch starts whether its moves can be held back (preventDefault): only where a
  // listener that may do so already exists. The real listener is put on the touched element once the touch has
  // started, too late for that decision: this one, on the container, makes the decision for it.
  target.addEventListener('touchmove', () => {}, { passive: false });

  target.addEventListener(
    'touchstart',
    (event) => {
      const e = /** @type {TouchEvent} */ (event);
      // A swipe was being followed and a new touch starts (a second finger, or an end that never came): it is over.
      if (state !== 'idle' || touched) lost();
      if (e.touches.length !== 1 || !e.target || inSystemGestureZone(e.touches[0].clientX) || !accept(e)) {
        state = 'idle';
        return;
      }
      x0 = lastX = e.touches[0].clientX;
      y0 = e.touches[0].clientY;
      lastT = e.timeStamp;
      velocity = 0;
      dx = 0;
      state = 'pending';
      follow(e.target);
    },
    { passive: true },
  );
}

/**
 * Whether a touch starts where the system reads its own Back gesture (Android, gesture navigation).
 * @param {number} x the touch's clientX
 */
function inSystemGestureZone(x) {
  const zone = systemGestureZone();
  if (!zone.left && !zone.right) return false;
  const width = typeof window === 'undefined' ? 0 : window.innerWidth;
  return x < zone.left || (width > 0 && x > width - zone.right);
}

/**
 * Whether a swipe of `dx` px at `velocity` px/ms goes through: a fifth of the
 * width, or a quick flick in the same direction.
 * @param {number} dx
 * @param {number} velocity
 * @param {number} width
 */
export function swipeGoesThrough(dx, velocity, width) {
  return Math.abs(dx) > width / 5 || (Math.abs(velocity) > 0.25 && Math.sign(velocity) === Math.sign(dx) && Math.abs(dx) > 16);
}

/**
 * The transition that takes a screen released at `from` px, moving at
 * `velocity` px/ms, to `to` px: Material's anchored fast spring (no overshoot,
 * so nothing shows past the screen's edge) starting at the finger's speed, so
 * the screen goes on as the finger left it instead of restarting on a fixed
 * curve. Its speed is capped where the spring would overshoot.
 * @param {number} from
 * @param {number} to
 * @param {number} velocity px/ms, negative towards the left
 * @returns {{ easing: string, ms: number }}
 */
export function settle(from, to, velocity) {
  const { stiffness, damping } = SPRINGS['anchored-fast'];
  const distance = to - from;
  if (Math.abs(distance) < 1) return { easing: 'linear', ms: 0 };
  // In distances to the target per second; beyond √stiffness a critically damped spring overshoots.
  const speed = Math.min((velocity * 1000) / distance, Math.sqrt(stiffness));
  const { css, ms } = springEasing(stiffness, damping, 0.005, 32, speed);
  return { easing: css, ms };
}
