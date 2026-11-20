<script>
  // @ts-check
  // Material 3 Expressive vibrant floating toolbar (spec, section 8): the
  // actions of the dive detail and of the Logbook's selection mode, at the
  // bottom centre of the page. The first action is the primary pill (icon and
  // label), the others are 48 dp icon buttons; an action with `menu` opens a
  // Framework7 popover (the ⋮ menu): it opens just above the toolbar, right-aligned
  // with the button, which shows its pressed state while the menu is open. Each
  // button has a plain tooltip with its name (long press, or mouse hover). It hides while the page scrolls down and
  // comes back when it scrolls up. Android only: the caller does not draw it on iOS.
  // `clearFab`: the Logbook's "+" is on screen at the right (a tablet in portrait):
  // the toolbar stays on the left of it.
  import { f7 } from 'framework7-svelte';
  import Icon from './Icon.svelte';
  import { motionSpring } from '../lib/motion.js';

  /**
   * `menu`: selector of the popover this action opens (the button is its target).
   * @type {{
   *   label: string,
   *   actions: {
   *     key: string,
   *     icon: import('svelte').ComponentProps<typeof Icon>['name'],
   *     label: string,
   *     text?: string,
   *     menu?: string,
   *     onclick?: () => void,
   *   }[],
   *   clearFab?: boolean,
   * }}
   */
  let { label, actions, clearFab = false } = $props();

  /** @type {HTMLElement|undefined} */
  let root = $state();
  let hidden = $state(false);
  let current = $state(0);
  /** Key of the action whose menu is open. */
  let openKey = $state('');
  /** The tooltip: the button's name and where it sits in the toolbar. @type {{ text: string, x: number }|null} */
  let tip = $state(null);
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let tipTimer;
  /** A long press just showed the tooltip: the click that ends it does nothing. */
  let swallowClick = false;

  // Expressive "fast spatial" spring, as the FAB menu.
  const spatial = motionSpring('spatial-fast');

  // The page's scroll area: down hides the toolbar, up shows it again.
  $effect(() => {
    const scroller = root?.closest('.page')?.querySelector('.page-content');
    if (!scroller) return;
    let last = scroller.scrollTop;
    const onScroll = () => {
      const top = scroller.scrollTop;
      const delta = top - last;
      if (Math.abs(delta) < 8) return;
      last = top;
      // Near the top, or at the very bottom (nothing more to scroll to), it shows.
      const atEnd = top + scroller.clientHeight >= scroller.scrollHeight - 2;
      hidden = delta > 0 && top > 48 && !atEnd;
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
  });

  /** Stops watching for a press outside the open menu. */
  let stopOutside = () => {};

  /** The menu that closed last, and when: a press on its button that closed it does not reopen it. */
  let justClosed = { key: '', at: 0 };

  // The menu closed: the button is no longer pressed.
  $effect(() => {
    const closed = () => {
      openKey = '';
      stopOutside();
    };
    f7.on('popoverClosed', closed);
    return () => f7.off('popoverClosed', closed);
  });

  /** @returns {HTMLElement[]} */
  function buttons() {
    return root ? [.../** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll('button'))] : [];
  }

  // One tab stop; the arrow keys move inside (WAI-ARIA toolbar pattern).
  /** @param {KeyboardEvent} e */
  function key(e) {
    const list = buttons();
    const at = list.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    if (at < 0) return;
    let next = -1;
    if (e.key === 'ArrowRight') next = (at + 1) % list.length;
    else if (e.key === 'ArrowLeft') next = (at - 1 + list.length) % list.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = list.length - 1;
    if (next < 0) return;
    e.preventDefault();
    current = next;
    list[next].focus();
  }

  /**
   * @param {{ key: string, menu?: string, onclick?: () => void }} action
   * @param {MouseEvent} e
   */
  function run(action, e) {
    if (swallowClick) {
      swallowClick = false;
      return;
    }
    hideTip();
    if (!action.menu) return action.onclick?.();
    const button = /** @type {HTMLElement} */ (e.currentTarget);
    // A second press on ⋮ closes its menu (read from the menu itself: Framework7's
    // "popoverClosed" does not always reach this toolbar).
    // On a touch screen Framework7 closes the menu on this same press, just before this
    // runs: a menu closed a moment ago by a press on its own button stays closed.
    if (document.querySelector(action.menu)?.classList.contains('modal-in')) {
      f7.popover.close(action.menu);
      return;
    }
    if (justClosed.key === action.key && performance.now() - justClosed.at < 400) return;
    openKey = action.key;
    const popover = f7.popover.open(action.menu, button);
    const key = action.key;
    // "close" as soon as it starts closing: on a touch screen that is the touchend, before the click.
    popover?.once?.('close', () => (justClosed = { key, at: performance.now() }));
    popover?.once?.('closed', () => {
      openKey = '';
      stopOutside();
    });
    // A press anywhere else closes it. Framework7's own outside click is not enough: the
    // popover is moved to the app's root, and in the tablet and desktop detail pane its
    // handler was lost once the pane showed another dive.
    stopOutside();
    const selector = action.menu;
    /** @param {PointerEvent} p */
    const outside = (p) => {
      const target = /** @type {Node} */ (p.target);
      if (document.querySelector(selector)?.contains(target) || button.contains(target)) return;
      f7.popover.close(selector);
    };
    document.addEventListener('pointerdown', outside, true);
    stopOutside = () => {
      document.removeEventListener('pointerdown', outside, true);
      stopOutside = () => {};
    };
    // Above the toolbar, its right edge on the button's.
    requestAnimationFrame(() => {
      const menu = /** @type {HTMLElement|null} */ (document.querySelector(action.menu ?? ''));
      if (!menu || !root) return;
      const anchor = button.getBoundingClientRect();
      const bar = root.getBoundingClientRect();
      const host = /** @type {HTMLElement} */ (menu.offsetParent ?? document.body).getBoundingClientRect();
      const left = Math.max(8, anchor.right - menu.offsetWidth);
      menu.style.left = `${left - host.left}px`;
      menu.style.top = `${bar.top - 8 - menu.offsetHeight - host.top}px`;
      menu.querySelector('.popover-angle')?.remove();
    });
  }

  /**
   * Plain tooltip (MD3): shown on long press and, with a mouse, on hover or
   * keyboard focus; it goes away a moment after the finger lifts.
   * @param {HTMLElement} button
   * @param {string} text
   */
  function showTip(button, text) {
    tip = { text, x: button.offsetLeft + button.offsetWidth / 2 };
  }

  function hideTip() {
    clearTimeout(tipTimer);
    tip = null;
  }

  /**
   * @param {PointerEvent} e
   * @param {string} text
   */
  function pressStart(e, text) {
    const button = /** @type {HTMLElement} */ (e.currentTarget);
    clearTimeout(tipTimer);
    tipTimer = setTimeout(
      () => {
        showTip(button, text);
        if (e.pointerType !== 'mouse') swallowClick = true;
      },
      e.pointerType === 'mouse' ? 700 : 450,
    );
  }

  /** @param {PointerEvent} e */
  function pressEnd(e) {
    clearTimeout(tipTimer);
    if (tip && e.pointerType !== 'mouse') tipTimer = setTimeout(hideTip, 1500);
    else if (e.type === 'pointerleave') hideTip();
  }
</script>

<div
  class="bc-floating-toolbar"
  class:bc-floating-toolbar--hidden={hidden}
  class:bc-floating-toolbar--clear-fab={clearFab}
  role="toolbar"
  aria-label={label}
  aria-orientation="horizontal"
  bind:this={root}
  onkeydown={key}
  inert={hidden}
  style:--bc-toolbar-spatial={spatial.css}
  style:--bc-toolbar-spatial-ms="{spatial.ms}ms"
>
  {#each actions as action, i (action.key)}
    <button
      type="button"
      class="bc-floating-toolbar--button"
      class:bc-floating-toolbar--primary={i === 0}
      class:bc-floating-toolbar--pressed={openKey === action.key}
      aria-label={action.label}
      aria-expanded={action.menu ? openKey === action.key : undefined}
      aria-haspopup={action.menu ? 'menu' : undefined}
      tabindex={i === current ? 0 : -1}
      onclick={(e) => run(action, e)}
      onpointerdown={(e) => pressStart(e, action.label)}
      onpointerup={pressEnd}
      onpointercancel={pressEnd}
      onpointerleave={pressEnd}
      oncontextmenu={(e) => e.preventDefault()}
      onblur={hideTip}
      onfocus={(e) => {
        current = i;
        if (e.currentTarget.matches(':focus-visible')) showTip(e.currentTarget, action.label);
      }}
    >
      <Icon name={action.icon} size={i === 0 ? 22 : 24} weight={action.icon === 'more' ? 4 : 2} />
      {#if i === 0 && action.text}<span class="bc-floating-toolbar--text">{action.text}</span>{/if}
    </button>
  {/each}
  {#if tip}
    <!-- The buttons carry their own accessible names: hidden from screen readers. -->
    <div class="bc-floating-toolbar--tooltip" aria-hidden="true" style:left="{tip.x}px">{tip.text}</div>
  {/if}
</div>

<style>
  @layer od.components {
    /* 64 dp high, 24 dp above the bottom edge; fixed to the page, centred. */
    .bc-floating-toolbar {
      position: absolute;
      z-index: 50;
      left: 0;
      right: 0;
      bottom: calc(24px + var(--bc-bottom-nav-room, 0px) + var(--f7-safe-area-bottom, 0px));
      width: max-content;
      max-width: calc(100% - 16px);
      margin: 0 auto;
      height: 64px;
      padding: 0 8px;
      box-sizing: border-box;
      border-radius: 32px;
      display: flex;
      align-items: center;
      gap: 4px;
      background: var(--bc-toolbar-container);
      color: var(--bc-toolbar-on-container);
      box-shadow: 0 3px 8px rgb(0 0 0 / 0.25);
      transition:
        transform var(--bc-toolbar-spatial-ms) var(--bc-toolbar-spatial),
        opacity 150ms ease-out,
        visibility 0s;
    }

    /* The "+" is 56 dp wide, 24 dp from the edge: 8 dp between it and the toolbar. */
    .bc-floating-toolbar--clear-fab {
      right: calc(88px + var(--f7-safe-area-right, 0px));
      max-width: calc(100% - 96px);
    }

    .bc-floating-toolbar--hidden {
      transform: translateY(calc(100% + 24px + var(--bc-bottom-nav-room, 0px) + var(--f7-safe-area-bottom, 0px)));
      opacity: 0;
      visibility: hidden;
      transition:
        transform var(--bc-toolbar-spatial-ms) var(--bc-toolbar-spatial),
        opacity 150ms ease-out,
        visibility 0s linear var(--bc-toolbar-spatial-ms);
    }

    .bc-floating-toolbar--button {
      flex: none;
      /* Framework7 gives every button a width of 100 %. */
      width: auto;
      min-width: 48px;
      height: 48px;
      padding: 0;
      border: 0;
      border-radius: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      white-space: nowrap;
      -webkit-tap-highlight-color: transparent;
    }

    .bc-floating-toolbar--primary {
      padding: 0 20px 0 16px;
      background: var(--bc-toolbar-primary);
      color: var(--bc-toolbar-on-primary);
    }

    .bc-floating-toolbar--text {
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .bc-floating-toolbar--button:focus-visible {
      outline: 2px solid var(--bc-toolbar-on-container);
      outline-offset: 2px;
    }

    /* The ⋮ while its menu is open: a state layer. */
    .bc-floating-toolbar--button.bc-floating-toolbar--pressed:not(.bc-floating-toolbar--primary) {
      background: color-mix(in srgb, var(--bc-toolbar-on-container) 16%, transparent);
    }

    /* MD3 plain tooltip: inverse surface, 12 sp, 4 dp corners, 4 dp above the toolbar. */
    .bc-floating-toolbar--tooltip {
      position: absolute;
      bottom: calc(100% + 4px);
      transform: translateX(-50%);
      max-width: 200px;
      padding: 4px 8px;
      border-radius: 4px;
      background: var(--bc-inverse-surface);
      color: var(--bc-inverse-on-surface);
      font-size: 12px;
      line-height: 16px;
      text-align: center;
      white-space: nowrap;
      pointer-events: none;
    }

    .bc-floating-toolbar--primary:focus-visible {
      outline-offset: 3px;
    }

    /* The content never ends under the toolbar. */
    :global(.page:has(.bc-floating-toolbar) .page-content) {
      padding-bottom: calc(104px + var(--bc-bottom-nav-room, 0px) + var(--f7-safe-area-bottom, 0px));
    }

    /* "Remove animations": it appears and disappears at once. */
    @media (prefers-reduced-motion: reduce) {
      .bc-floating-toolbar,
      .bc-floating-toolbar--hidden {
        transition: none;
      }
    }


    /* Mouse: the Material 3 hover layer, 8 % of the content colour over the background. */
    @media (hover: hover) and (pointer: fine) {
      .bc-floating-toolbar--button {
        transition: box-shadow 120ms linear;
      }
      .bc-floating-toolbar--button:not(:disabled):hover {
        box-shadow: inset 0 0 0 100vmax color-mix(in srgb, currentColor 8%, transparent);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .bc-floating-toolbar--button {
        transition: none;
      }
    }
  }
</style>
