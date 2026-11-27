// @ts-check
// The thin scrollbar of phones and tablets (docs/system-design.md, section 7, « Scrollbar when content overflows »),
// drawn over the content instead of beside it, for a scrolling area that starts with a section band.
//
// Why: a styled `::-webkit-scrollbar` always takes its width from the scrolling area (Chromium has no overlay mode for
// it), and nothing inside the area can draw in that gutter. A header band therefore stopped 4 px before the right edge
// and the gutter showed the page beside it. Painting the gutter to look like the band (a background on the bar's
// track) cannot hold: the band is a gradient, a grain, a faint profile and a wave, it scrolls or folds with the list,
// and a copy of it moved from JavaScript is always a frame late. So the area gets no gutter at all (the native bar has
// no width, theme.css `bc-overlay-scrollbar`) and the band is the band up to the edge; the bar's thumb is this element,
// laid over the right edge, with the same look and the same rule: there only while the content overflows.

/** The shortest thumb (px): a very long list would otherwise shrink it to nothing. */
const MIN_THUMB = 24;

/** @type {boolean|undefined} */
let classic;

/** True where a styled scrollbar takes room from the area (Android's WebView); false where bars already overlay (iOS). */
function takesRoom() {
  if (classic !== undefined) return classic;
  const probe = document.createElement('div');
  probe.setAttribute('data-bc-scroll', '');
  probe.style.cssText = 'position:absolute;top:-200px;left:0;width:100px;height:100px;overflow-y:scroll;visibility:hidden';
  document.body.appendChild(probe);
  classic = probe.offsetWidth - probe.clientWidth > 0;
  probe.remove();
  return classic;
}

/**
 * Replaces the bar of `scroller` by a thumb laid over its right edge. The thumb lives in the scroller's parent, which
 * must be positioned (a Framework7 page, a positioned pane); otherwise, and on the desktop app (its own thin
 * bars) and where bars already overlay, nothing changes.
 * @param {HTMLElement} scroller
 * @returns {() => void} undoes it
 */
export function overlayScrollbar(scroller) {
  const parent = scroller.parentElement;
  // Not `offsetParent`: the page of a tab that is not shown has none.
  if (!parent || getComputedStyle(parent).position === 'static') return () => {};
  if (document.documentElement.classList.contains('bc-desktop-app') || !takesRoom()) return () => {};
  // Several bands may share one scrolling area: one thumb, removed with the last of them.
  const shared = /** @type {any} */ (scroller).bcOverlayScrollbar;
  if (shared) {
    shared.users++;
    return () => shared.release();
  }

  const thumb = document.createElement('div');
  thumb.className = 'bc-overlay-scrollbar--thumb';
  thumb.setAttribute('aria-hidden', 'true');
  thumb.hidden = true;
  parent.appendChild(thumb);
  scroller.classList.add('bc-overlay-scrollbar');

  let frame = 0;
  const draw = () => {
    frame = 0;
    const view = scroller.clientHeight;
    const full = scroller.scrollHeight;
    if (!view || full <= view) {
      thumb.hidden = true;
      return;
    }
    const length = Math.max(MIN_THUMB, (view * view) / full);
    const top = (Math.min(Math.max(0, scroller.scrollTop), full - view) / (full - view)) * (view - length);
    thumb.hidden = false;
    thumb.style.height = `${length}px`;
    thumb.style.right = `${parent.clientWidth - scroller.offsetLeft - scroller.offsetWidth}px`;
    thumb.style.transform = `translate3d(0, ${scroller.offsetTop + top}px, 0)`;
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(draw);
  };

  // The content's height is not observable as such: the area and each of its children are, and so is their list.
  const sizes = new ResizeObserver(schedule);
  const watch = () => {
    sizes.disconnect();
    sizes.observe(scroller);
    for (const child of scroller.children) sizes.observe(child);
    schedule();
  };
  const children = new MutationObserver(watch);
  children.observe(scroller, { childList: true });
  watch();
  scroller.addEventListener('scroll', schedule, { passive: true });
  draw();

  const state = {
    users: 1,
    release() {
      if (--state.users > 0) return;
      delete (/** @type {any} */ (scroller).bcOverlayScrollbar);
      scroller.removeEventListener('scroll', schedule);
      sizes.disconnect();
      children.disconnect();
      cancelAnimationFrame(frame);
      scroller.classList.remove('bc-overlay-scrollbar');
      thumb.remove();
    },
  };
  /** @type {any} */ (scroller).bcOverlayScrollbar = state;
  return () => state.release();
}
