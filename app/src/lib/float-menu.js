// @ts-check
// A suggestion list that floats above everything. A list drawn inside a card is cut by the card's rounded
// overflow, by the page's scroll area and by the next cards' stacking levels; near the bottom of the screen it
// is also hidden by the keyboard. The list is put in the browser's top layer (popover="manual", it never takes
// the focus) and placed with position: fixed from the field's box: below it, or above it when there is more
// room above, and always inside the visible viewport (the part not covered by the keyboard).

const GAP = 2;
const MARGIN = 8;

/**
 * Svelte action for the list element.
 * @param {HTMLElement} node
 * @param {string | undefined} [anchorSelector] the field's box, found among the list's ancestors' descendants;
 *   the list's parent when omitted
 */
export function floatMenu(node, anchorSelector) {
  const parent = node.parentElement;
  const anchor = /** @type {HTMLElement|null} */ ((anchorSelector && parent?.querySelector(anchorSelector)) || parent);
  node.setAttribute('popover', 'manual');
  // How the Back dispatcher finds an open list (lib/back-button.js): Back closes it before anything under it.
  node.setAttribute('data-bc-float-menu', '');
  try {
    node.showPopover?.();
  } catch {
    // Not supported: position: fixed alone still takes the list out of the card.
  }
  let frame = 0;

  function place() {
    frame = 0;
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const vv = window.visualViewport;
    const top = vv ? vv.offsetTop : 0;
    const bottom = top + (vv ? vv.height : window.innerHeight);
    const below = bottom - r.bottom - GAP - MARGIN;
    const above = r.top - top - GAP - MARGIN;
    node.style.maxHeight = '';
    const natural = Math.min(node.scrollHeight, 280);
    const up = natural > below && above > below;
    const room = Math.max(up ? above : below, 96);
    const height = Math.min(natural, room);
    node.style.left = `${r.left}px`;
    node.style.width = `${r.width}px`;
    node.style.maxHeight = `${room}px`;
    node.style.top = `${up ? Math.max(r.top - GAP - height, top + MARGIN) : r.bottom + GAP}px`;
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(place);
  }

  place();
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
  observer?.observe(node);
  window.addEventListener('scroll', schedule, true);
  window.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('scroll', schedule);
  return {
    destroy() {
      if (frame) cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
      try {
        node.hidePopover?.();
      } catch {
        // Already gone.
      }
    },
  };
}
