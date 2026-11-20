<script>
  // @ts-check
  // Material 3 Expressive FAB menu (spec, section 8, "FAB menu
  // (Android)"): the Logbook's "+" on an Android phone or tablet. The button becomes a ✕,
  // the choices unfold above it as 56 dp pills, a light scrim covers the screen.
  // Sizes follow the Material library's FloatingActionButtonMenu (56 dp
  // button, 56 dp items with a 24 dp icon and 24 dp side padding); the gaps are
  // our own (16 dp between items, 24 dp above the close button).
  import Icon from './Icon.svelte';
  import { t } from '../lib/i18n.js';
  import { motionSpring } from '../lib/motion.js';

  /**
   * @type {{
   *   choices: { key: string, icon: 'download'|'file'|'edit'|'qr', text: string, sub?: string }[],
   *   onchoose: (key: string) => void,
   * }}
   */
  let { choices, onchoose } = $props();

  let open = $state(false);
  /** @type {HTMLElement|undefined} */
  let root = $state();
  /** @type {HTMLButtonElement|undefined} */
  let button = $state();

  // Expressive motion scheme (lib/motion.js): the "fast spatial" spring for
  // the shapes and the choices, the "fast effects" spring for the colours and
  // the fades.
  const spatial = motionSpring('spatial-fast');
  const effects = motionSpring('effects-fast');

  /** Pause between two choices, in ms. */
  const STAGGER = 50;
  const CLOSE_STAGGER = 25;

  /** @param {boolean} next */
  function setOpen(next) {
    if (next === open) return;
    open = next;
    if (next) {
      // The first choice takes the focus once it is visible.
      queueMicrotask(() => items()[0]?.focus({ preventScroll: true }));
    } else if (root?.contains(document.activeElement)) {
      button?.focus({ preventScroll: true });
    }
  }

  /** @returns {HTMLElement[]} */
  function items() {
    return root ? [.../** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll('[role="menuitem"]'))] : [];
  }

  /** @param {KeyboardEvent} e */
  function key(e) {
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      return;
    }
    // The choices are drawn from the bottom up: Up goes to the next, Down to the previous.
    const list = items();
    const at = list.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const step = e.key === 'ArrowUp' ? 1 : -1;
      list[(at + step + list.length) % list.length]?.focus();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      list[e.key === 'Home' ? 0 : list.length - 1]?.focus();
    } else if (e.key === 'Tab') {
      // The menu keeps the focus until it closes.
      e.preventDefault();
      const next = e.shiftKey ? at - 1 : at + 1;
      if (next < 0 || next >= list.length) setOpen(false);
      else list[next].focus();
    }
  }

  /** @param {string} choice */
  function pick(choice) {
    setOpen(false);
    onchoose(choice);
  }

  function close() {
    setOpen(false);
  }

  // The Android Back key (lib/back-button.js) asks for the close with od-cancel.
  $effect(() => {
    const el = root;
    el?.addEventListener('od-cancel', close);
    return () => el?.removeEventListener('od-cancel', close);
  });
</script>

<div
  class="bc-fab-menu"
  class:bc-fab-menu--open={open}
  bind:this={root}
  onkeydown={key}
  role="presentation"
  style:--bc-fab-spatial={spatial.css}
  style:--bc-fab-spatial-ms="{spatial.ms}ms"
  style:--bc-fab-effects={effects.css}
  style:--bc-fab-effects-ms="{effects.ms}ms"
>
  <!-- A tap outside closes the menu; the keyboard has the close button and Escape. -->
  <div class="bc-fab-menu--scrim" onclick={() => setOpen(false)} role="presentation"></div>
  <div class="bc-fab-menu--items" id="od-fab-menu-items" role="menu" aria-label={t('logbook.add')}>
    {#each choices as choice, i (choice.key)}
      <button
        type="button"
        role="menuitem"
        class="bc-fab-menu--item"
        class:bc-fab-menu--primary={i === 0}
        style:--bc-fab-open-delay="{i * STAGGER}ms"
        style:--bc-fab-close-delay="{(choices.length - 1 - i) * CLOSE_STAGGER}ms"
        tabindex={open ? 0 : -1}
        onclick={() => pick(choice.key)}
      >
        <Icon name={choice.icon} size={24} />
        {#if choice.sub}
          <!-- A second line (task 2026-11-14-126): the formats « Importer un fichier » reads. -->
          <span class="bc-fab-menu--texts">
            <span class="bc-fab-menu--label">{choice.text}</span>
            <span class="bc-fab-menu--sub">{choice.sub}</span>
          </span>
        {:else}
          <span class="bc-fab-menu--label">{choice.text}</span>
        {/if}
      </button>
    {/each}
  </div>
  <button
    type="button"
    class="bc-fab-menu--button"
    aria-haspopup="menu"
    aria-expanded={open}
    aria-controls="od-fab-menu-items"
    bind:this={button}
    onclick={() => setOpen(!open)}
  >
    <span class="bc-fab-menu--icon"><Icon name="plus" size={24} /></span>
    <span class="bc-sr-only">{t('logbook.add')}</span>
  </button>
</div>

<style>
  @layer od.components {
    .bc-fab-menu {
      /* 24 dp from the screen's edges; from the bottom, 16 dp above the bottom navigation bar when
         it shows (task 2026-11-14-120). The bar only moves it up, never away from the right edge. */
      --bc-fab-edge: 24px;
      --bc-fab-bottom: calc(24px + var(--bc-bottom-nav-room, 0px));
      --bc-fab-size: 56px;
    }

    /* Over the whole screen, under the button and the choices. */
    .bc-fab-menu--scrim {
      position: fixed;
      inset: 0;
      z-index: 6500;
      background: var(--bc-fab-scrim);
      opacity: 0;
      visibility: hidden;
      transition:
        opacity var(--bc-fab-effects-ms) var(--bc-fab-effects),
        visibility 0s linear var(--bc-fab-effects-ms);
    }

    .bc-fab-menu--open .bc-fab-menu--scrim {
      opacity: 1;
      visibility: visible;
      transition-delay: 0s;
    }

    /* Right edge of the button; the choices rise from it, from the bottom up. */
    .bc-fab-menu--items {
      position: fixed;
      z-index: 6501;
      right: calc(var(--bc-fab-edge) + var(--f7-safe-area-right, 0px));
      /* 24 dp above the button, itself 24 dp above the bottom edge. */
      bottom: calc(var(--bc-fab-bottom) + var(--bc-fab-size) + 24px + var(--f7-safe-area-bottom, 0px));
      display: flex;
      flex-direction: column-reverse;
      align-items: flex-end;
      gap: 16px;
      visibility: hidden;
      transition: visibility 0s linear calc(var(--bc-fab-spatial-ms) + 100ms);
    }

    .bc-fab-menu--open .bc-fab-menu--items {
      visibility: visible;
      transition-delay: 0s;
    }

    /* The navigation rail is outside the page: it gets its own veil. */
    :global(.bc-nav-rail--rail)::after {
      content: '';
      position: absolute;
      inset: 0;
      background: var(--bc-fab-scrim);
      opacity: 0;
      pointer-events: none;
      transition: opacity var(--bc-fab-effects-ms, 150ms) ease-out;
    }

    :global(html:has(.bc-fab-menu--open) .bc-nav-rail--rail)::after {
      opacity: 1;
    }

    .bc-fab-menu--item {
      width: max-content;
      min-height: 56px;
      padding: 0 24px;
      box-sizing: border-box;
      border: 0;
      border-radius: 28px;
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--bc-fab-tonal);
      color: var(--bc-text);
      font: inherit;
      font-size: 16px;
      font-weight: 500;
      line-height: 24px;
      white-space: nowrap;
      box-shadow: 0 1px 3px rgb(0 0 0 / 0.3), 0 4px 8px 3px rgb(0 0 0 / 0.15);
      /* Closed: small, at the button, faded; it grows from the right edge. */
      opacity: 0;
      transform: translateY(24px) scale(0.5);
      transform-origin: right bottom;
      transition:
        transform var(--bc-fab-spatial-ms) var(--bc-fab-spatial) var(--bc-fab-close-delay),
        opacity var(--bc-fab-effects-ms) var(--bc-fab-effects) var(--bc-fab-close-delay);
    }

    .bc-fab-menu--texts {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      padding: 6px 0;
    }

    .bc-fab-menu--sub {
      font-size: 12px;
      line-height: 16px;
      font-weight: 400;
      letter-spacing: 0.2px;
      color: var(--bc-text-2);
    }

    .bc-fab-menu--primary {
      background: var(--bc-text);
      color: var(--bc-background);
    }

    .bc-fab-menu--open .bc-fab-menu--item {
      opacity: 1;
      transform: none;
      transition-delay: var(--bc-fab-open-delay);
    }

    .bc-fab-menu--item:focus-visible,
    .bc-fab-menu--button:focus-visible {
      outline: 2px solid var(--bc-text);
      outline-offset: 3px;
    }

    .bc-fab-menu--primary:focus-visible {
      outline-color: var(--bc-text);
      outline-offset: 3px;
    }

    /* The "+" button: a rounded square, a circle in ink once open. */
    .bc-fab-menu--button {
      position: fixed;
      z-index: 6502;
      right: calc(var(--bc-fab-edge) + var(--f7-safe-area-right, 0px));
      bottom: calc(var(--bc-fab-bottom) + var(--f7-safe-area-bottom, 0px));
      width: var(--bc-fab-size);
      height: var(--bc-fab-size);
      padding: 0;
      border: 0;
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bc-primary-container);
      color: var(--bc-on-primary-container);
      box-shadow: 0 1px 3px rgb(0 0 0 / 0.3), 0 4px 8px 3px rgb(0 0 0 / 0.15);
      transition:
        border-radius var(--bc-fab-spatial-ms) var(--bc-fab-spatial),
        background-color var(--bc-fab-effects-ms) var(--bc-fab-effects),
        color var(--bc-fab-effects-ms) var(--bc-fab-effects),
        box-shadow 120ms linear;
    }

    /* Mouse: the Material 3 hover layer, 8 % of the content colour, over the elevation shadow. */
    @media (hover: hover) and (pointer: fine) {
      .bc-fab-menu--item:hover {
        box-shadow:
          inset 0 0 0 100vmax color-mix(in srgb, currentColor 8%, transparent),
          0 1px 3px rgb(0 0 0 / 0.3),
          0 4px 8px 3px rgb(0 0 0 / 0.15);
      }
      .bc-fab-menu--button:hover {
        box-shadow:
          inset 0 0 0 100vmax color-mix(in srgb, currentColor 8%, transparent),
          0 1px 3px rgb(0 0 0 / 0.3),
          0 4px 8px 3px rgb(0 0 0 / 0.15);
      }
    }

    .bc-fab-menu--open .bc-fab-menu--button {
      border-radius: 28px;
      background: var(--bc-text);
      color: var(--bc-background);
    }

    .bc-fab-menu--icon {
      display: flex;
      transition: transform var(--bc-fab-spatial-ms) var(--bc-fab-spatial);
    }

    /* The + turned 45 degrees is a ✕. */
    .bc-fab-menu--open .bc-fab-menu--icon {
      transform: rotate(45deg);
    }

    /* "Remove animations": it appears and disappears at once. */
    @media (prefers-reduced-motion: reduce) {
      :global(.bc-nav-rail--rail)::after,
      .bc-fab-menu--scrim,
      .bc-fab-menu--items,
      .bc-fab-menu--item,
      .bc-fab-menu--button,
      .bc-fab-menu--icon {
        transition: none;
      }
    }
  }
</style>
