<script>
  // @ts-check
  // <FoldingSearch>: the search box of the Carnet and of Sites on an Android phone (task
  // 2026-11-23-339). At the top of the list it is a full-width box under the band's summary;
  // while the list scrolls it shrinks and rises to the title row, right of the title and left
  // of the avatar, and ends as the magnifier (48 dp). A search in progress ends as a pill with
  // the magnifier, the text and its × (the rule of task 113).
  //
  // How it moves: there is no timer and no spring. Each frame of a scroll, the box is placed
  // from the scroll position `s`: `p = min(1, s / T)`, where T is the distance from the box's
  // place in the band to the title row. Its left and right edges, its height and its colours
  // are interpolated with `p`; it rises with the list, then stays on the title row. Back at the
  // top, `p` is 0 again and the box is in its place. With reduced motion there is no in-between:
  // the full box until half of T, then the magnifier (or the pill).
  //
  // The box is drawn above the top bar (it must cross it), outside the scrolling area: render
  // this component in the page's `fixedContent`. The page gives it two things, found by class:
  //  - `.bc-folding-search--slot`: an empty block in the band, as high as the box, which keeps
  //    its room (its place at the top of the list);
  //  - `.bc-folding-search--target`: an empty block in the top bar's right group, left of the
  //    avatar, which keeps the room of the folded box and gives its final place. This component
  //    sets its width through `--bc-fold-final-w` on the page.
  // The band's summary fades through `--bc-summary-opacity` on the page.
  import { onMount, tick } from 'svelte';
  import Icon from './Icon.svelte';
  import { t } from '../lib/i18n.js';

  /** @type {{ value?: string, label: string, hidden?: boolean }} */
  let { value = $bindable(''), label, hidden = false } = $props();

  /** Height of the box in the band, and of its folded forms (dp). */
  const FULL_HEIGHT = 56;
  const ICON_HEIGHT = 48;
  const PILL_HEIGHT = 40;
  /** The longest text of the pill; longer text is cut with an ellipsis. */
  const PILL_TEXT_MAX = 110;
  /** Below this share of the fold the field is the real field; above, a tap reopens the box. */
  const OPEN_BELOW = 0.02;

  /** @type {HTMLElement|undefined} */
  let root = $state();
  /** @type {HTMLInputElement|undefined} */
  let input = $state();
  /** @type {HTMLElement|undefined} */
  let sizer = $state();
  /** True once the box is the magnifier or the pill. */
  let folded = $state(false);
  /** @type {() => void} */
  let refresh = () => {};
  /** @type {HTMLElement|null} */
  let scroller = null;

  const lerp = (/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ p) => a + (b - a) * p;

  // A new text changes the width of the pill.
  $effect(() => {
    value;
    folded;
    refresh();
  });
  $effect(() => {
    hidden;
    refresh();
  });

  onMount(() => {
    const page = /** @type {HTMLElement|null} */ (root?.closest('.page') ?? null);
    if (!page || !root) return;
    const box = root;
    let frame = 0;
    let wasFolded = false;
    /** @type {HTMLElement|null} */
    let content = null;
    /** @type {HTMLElement|null} */
    let slot = null;
    /** @type {HTMLElement|null} */
    let target = null;

    const update = () => {
      frame = 0;
      content = content ?? page.querySelector('.page-content');
      slot = slot ?? page.querySelector('.bc-folding-search--slot');
      target = target ?? page.querySelector('.bc-folding-search--target');
      scroller = content;
      if (!content || !slot || !target || hidden) return;
      const pageBox = page.getBoundingClientRect();
      const slotBox = slot.getBoundingClientRect();
      const targetBox = target.getBoundingClientRect();
      const s = Math.max(0, content.scrollTop);
      const filled = value !== '';
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

      const naturalCentre = slotBox.top - pageBox.top + s + slotBox.height / 2;
      const rowCentre = targetBox.top - pageBox.top + targetBox.height / 2;
      const travel = Math.max(1, naturalCentre - rowCentre);
      const p = reduced ? (s >= travel / 2 ? 1 : 0) : Math.min(1, s / travel);

      const textWidth = filled && sizer ? Math.min(sizer.offsetWidth, PILL_TEXT_MAX) : 0;
      const finalHeight = filled ? PILL_HEIGHT : ICON_HEIGHT;
      // Pill: 12 dp, magnifier, 8 dp, text, then the 40 dp ×; magnifier alone: the 48 dp square.
      const finalWidth = filled ? 12 + 24 + 8 + textWidth + 40 : ICON_HEIGHT;
      const right = targetBox.right - pageBox.left;
      const left = lerp(slotBox.left - pageBox.left, right - finalWidth, p);
      const end = lerp(slotBox.right - pageBox.left, right, p);
      const height = lerp(slotBox.height || FULL_HEIGHT, finalHeight, p);
      const centre = Math.max(naturalCentre - s, rowCentre);

      box.style.left = `${left}px`;
      box.style.top = `${centre - height / 2}px`;
      box.style.width = `${end - left}px`;
      box.style.height = `${height}px`;
      box.style.setProperty('--p', String(p));
      // The colours change over the last 40 % of the fold, so that the box stays legible while it shrinks.
      box.style.setProperty('--q', String(Math.min(1, Math.max(0, (p - 0.6) / 0.4))));
      box.style.setProperty('--bc-fold-pad', `${lerp(16, 12, p)}px`);
      box.style.setProperty('--bc-fold-gap', `${lerp(12, filled ? 8 : 0, p)}px`);
      box.style.setProperty('--bc-fold-line', `${height}px`);
      box.style.setProperty('--bc-fold-x', `${lerp(48, 40, p)}px`);
      // The room kept in the top bar: the magnifier's, growing to the pill's with the fold.
      page.style.setProperty('--bc-fold-final-w', `${lerp(ICON_HEIGHT, finalWidth, p)}px`);
      // The summary fades while the box rises; with reduced motion it goes with the fold.
      page.style.setProperty('--bc-summary-opacity', String(reduced ? 1 - p : Math.max(0, 1 - s / (travel * 0.45))));
      const now = p >= 0.999;
      if (now !== wasFolded) folded = wasFolded = now;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    refresh = schedule;
    // The scrolling area is only there once the page has drawn.
    frame = requestAnimationFrame(update);
    const attach = () => {
      content = page.querySelector('.page-content');
      content?.addEventListener('scroll', schedule, { passive: true });
    };
    attach();

    // Dragging the list with the keyboard open closes the keyboard: the field is folding away.
    let touchY = 0;
    const touchStart = (/** @type {TouchEvent} */ e) => (touchY = e.touches[0]?.clientY ?? 0);
    const touchMove = (/** @type {TouchEvent} */ e) => {
      if (document.activeElement === input && Math.abs((e.touches[0]?.clientY ?? 0) - touchY) > 8) input?.blur();
    };
    content?.addEventListener('touchstart', touchStart, { passive: true });
    content?.addEventListener('touchmove', touchMove, { passive: true });

    const sizes = new ResizeObserver(schedule);
    sizes.observe(page);
    const slotNow = page.querySelector('.bc-folding-search--slot');
    if (slotNow) sizes.observe(slotNow);
    // The band grows or shrinks around the slot (the summary arrives, a pill shows): the slot moves without resizing.
    if (slotNow?.parentElement) sizes.observe(slotNow.parentElement);
    if (content) sizes.observe(content);

    return () => {
      content?.removeEventListener('scroll', schedule);
      content?.removeEventListener('touchstart', touchStart);
      content?.removeEventListener('touchmove', touchMove);
      sizes.disconnect();
      cancelAnimationFrame(frame);
      refresh = () => {};
      page.style.removeProperty('--bc-fold-final-w');
      page.style.removeProperty('--bc-summary-opacity');
    };
  });

  /** The field is back in its place: show it (the frame that unfolds it may not have run) and give it the cursor. */
  async function focusField() {
    folded = false;
    await tick();
    input?.focus({ preventScroll: true });
  }

  /** Back to the top of the list, the cursor in the field. */
  function open() {
    if (!input) return;
    const content = scroller;
    if (!content || content.scrollTop <= 1) {
      focusField();
      return;
    }
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    content.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    // The field takes the focus once it is back in its place (no jump from focus()).
    const started = performance.now();
    const wait = () => {
      if (content.scrollTop <= 1 || performance.now() - started > 800) focusField();
      else requestAnimationFrame(wait);
    };
    requestAnimationFrame(wait);
  }

  /** @param {MouseEvent} e */
  function clear(e) {
    e.stopPropagation();
    value = '';
    // Folded, the keyboard stays closed; at the top, the cursor stays in the field.
    if (!folded) input?.focus({ preventScroll: true });
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
  class="bc-folding-search"
  class:bc-folding-search--folded={folded}
  class:bc-folding-search--filled={value !== ''}
  style:display={hidden ? 'none' : null}
  role="search"
  bind:this={root}
  onclick={open}
>
  <div class="bc-folding-search--fill"></div>
  <button type="button" class="bc-folding-search--icon" tabindex={folded ? 0 : -1} aria-label={label}>
    <Icon name="search" size={24} />
  </button>
  <div class="bc-folding-search--text">
    <input
      bind:this={input}
      bind:value
      type="search"
      class="bc-folding-search--input"
      placeholder={label}
      aria-label={label}
      enterkeyhint="search"
      autocomplete="off"
      tabindex={folded ? -1 : 0}
      onkeydown={(e) => e.key === 'Enter' && input?.blur()}
    />
    {#if value !== ''}
      <button type="button" class="bc-folding-search--value" tabindex={folded ? 0 : -1}>{value}</button>
    {/if}
  </div>
  {#if value !== ''}
    <button type="button" class="bc-folding-search--clear" onpointerdown={(e) => e.preventDefault()} onclick={clear}>
      <Icon name="close" size={24} /><span class="bc-sr-only">{t('searchField.clear')}</span>
    </button>
  {/if}
  <span class="bc-folding-search--sizer" bind:this={sizer} aria-hidden="true">{value}</span>
</div>

<style>
  @layer bc.components {
    /* Placed by the script each frame: left, top, width, height, and --p (0 at the top, 1 folded). */
    .bc-folding-search {
      --p: 0;
      --q: 0;
      --bc-fold-pad: 16px;
      --bc-fold-gap: 12px;
      --bc-fold-x: 48px;
      position: absolute;
      left: 16px;
      top: 0;
      width: calc(100% - 32px);
      height: 56px;
      z-index: 600;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      overflow: hidden;
      border-radius: 28px;
      /* Dark ink on the white box, then the band's white once folded. */
      color: color-mix(in srgb, var(--bc-on-band-control) calc((1 - var(--q)) * 100%), var(--bc-on-band));
      cursor: text;
    }

    .bc-folding-search--folded {
      cursor: pointer;
    }

    /* The box's white, then the chip's 22 % white (a search in progress), or nothing (the magnifier). */
    .bc-folding-search--fill {
      position: absolute;
      inset: 0;
      background: color-mix(in srgb, var(--bc-band-control) calc((1 - var(--q)) * 100%), var(--bc-band-chip));
      opacity: calc(1 - var(--q));
      border-radius: inherit;

      .bc-folding-search--filled & {
        opacity: 1;
      }
    }

    .bc-folding-search--icon {
      position: relative;
      flex: none;
      width: 24px;
      height: 24px;
      margin: 0 var(--bc-fold-gap) 0 var(--bc-fold-pad);
      padding: 0;
      border: none;
      background: none;
      color: inherit;
      display: flex;
    }

    .bc-folding-search--text {
      position: relative;
      flex: 1;
      min-width: 0;
      height: 100%;
      overflow: hidden;
    }

    .bc-folding-search--input {
      width: 100%;
      height: 100%;
      padding: 0;
      border: none;
      border-radius: 0;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: 16px;
      outline: none;
      appearance: none;
      /* Gone between 40 % and 80 % of the fold, as the text of the pill arrives. */
      opacity: clamp(0, calc((0.8 - var(--p)) / 0.4), 1);
      pointer-events: none;

      &::-webkit-search-cancel-button {
        display: none;
      }

      &::placeholder {
        color: var(--bc-on-band-control-2);
      }
    }

    /* At the top the field is the real field; scrolled, a tap anywhere reopens the box. */
    .bc-folding-search:not(.bc-folding-search--folded) .bc-folding-search--input {
      pointer-events: auto;
    }

    /* The text of the pill: 15 sp, weight 600. */
    .bc-folding-search--value {
      position: absolute;
      inset: 0;
      padding: 0;
      border: none;
      background: none;
      color: inherit;
      font: inherit;
      font-size: 15px;
      font-weight: 600;
      line-height: var(--bc-fold-line, 40px);
      text-align: start;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      opacity: clamp(0, calc((var(--p) - 0.4) / 0.4), 1);
      pointer-events: none;
    }

    .bc-folding-search--folded .bc-folding-search--value {
      pointer-events: auto;
    }

    .bc-folding-search--clear {
      position: relative;
      flex: none;
      width: var(--bc-fold-x);
      height: var(--bc-fold-x);
      padding: 0;
      border: none;
      border-radius: 50%;
      background: none;
      color: inherit;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }

    /* Measures the text of the pill; never seen. */
    .bc-folding-search--sizer {
      position: absolute;
      visibility: hidden;
      pointer-events: none;
      white-space: pre;
      font: inherit;
      font-size: 15px;
      font-weight: 600;
    }

    /* The room the folded box keeps in the top bar, and its place in the band. */
    :global(.bc-folding-search--target) {
      flex: none;
      width: var(--bc-fold-final-w, 48px);
      height: 48px;
    }

    :global(.bc-folding-search--slot) {
      height: 56px;
      margin-top: 8px;
    }
  }
</style>
