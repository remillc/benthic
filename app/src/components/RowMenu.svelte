<script>
  // @ts-check
  import { onMount, tick } from 'svelte';
  import Icon from './Icon.svelte';
  import { ios } from '../lib/layout.svelte.js';
  import { moveActive } from '../lib/select-menu.js';
  import { menuHeight, placeRowMenu } from '../lib/row-menu.js';
  // Menu on a Settings row (docs/system-design.md, section 8, "Settings choice menu";
  // docs/mockups/reglages-choix-android.dc.html): one value chosen in a short list.
  // Anchored to the touched row, which takes the selected tint while the menu is open.
  // No title, no intro, no Annuler/OK: a tap picks and closes, a tap outside, Escape or
  // the system Back key (lib/back-button.js sends "bc-cancel") closes without change.
  // The menu is drawn in the page's root (position: fixed), so no card clips it.
  // iOS: same anchored menu in the look of a UIMenu (13 px corners, check at the start).

  /**
   * @type {{
   *   anchor: HTMLElement,
   *   label: string,
   *   options: { value: string, label: string, example?: string, heading?: string, icon?: string, divider?: boolean }[],
   *   value: string,
   *   onselect: (value: string) => void,
   *   onclose: () => void,
   *   width?: number,
   *   above?: boolean,
   * }}
   * anchor: the row that opened the menu. label: its accessible name (the row's label). width and above: see
   * placeRowMenu (the desktop first-launch language menu).
   */
  let { anchor, label, options, value, onselect, onclose, width, above } = $props();

  // svelte-ignore state_referenced_locally
  let place = $state(placeRowMenu(anchor.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight }, menuHeight(options), { width, above }));
  // svelte-ignore state_referenced_locally
  let active = $state(Math.max(0, options.findIndex((o) => o.value === value)));
  /** @type {HTMLDivElement|undefined} */
  let menu = $state();
  const id = `bc-row-menu-${Math.random().toString(36).slice(2, 9)}`;
  let closed = false;

  function position() {
    if (closed) return;
    const height = menu?.scrollHeight ?? menuHeight(options);
    place = placeRowMenu(anchor.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight }, height, { width, above });
  }

  /** The menu lives in the page's root. @param {HTMLElement} node */
  function portal(node) {
    document.body.appendChild(node);
    return { destroy: () => node.remove() };
  }

  /** @param {boolean} [refocus] */
  function close(refocus = true) {
    if (closed) return;
    closed = true;
    const target = anchor;
    onclose();
    if (refocus) target.focus();
  }

  /** @param {string} chosen */
  function pick(chosen) {
    if (closed) return;
    closed = true;
    const target = anchor;
    // The choice is applied first: the page forgets the row when the menu closes.
    if (chosen !== value) onselect(chosen);
    onclose();
    target.focus();
  }

  function focusActive() {
    /** @type {HTMLElement|null|undefined} */ (menu?.querySelector(`#${id}-o${active}`))?.focus();
  }

  /** @param {KeyboardEvent} e */
  function keydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') {
      close(false);
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      active = moveActive(active, e.key, options.length);
      focusActive();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (active >= 0) pick(options[active].value);
    }
  }

  onMount(() => {
    const target = anchor;
    target.classList.add('bc-row-menu--anchored');
    target.setAttribute('aria-expanded', 'true');
    tick().then(() => {
      position();
      focusActive();
    });
    const cancel = () => close();
    const el = menu;
    el?.addEventListener('bc-cancel', cancel);
    const moved = () => position();
    window.addEventListener('resize', moved);
    return () => {
      target.classList.remove('bc-row-menu--anchored');
      target.removeAttribute('aria-expanded');
      el?.removeEventListener('bc-cancel', cancel);
      window.removeEventListener('resize', moved);
    };
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="bc-row-menu--scrim" use:portal onpointerdown={() => close()}></div>
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="bc-row-menu"
  class:bc-row-menu--ios={ios}
  class:bc-row-menu--up={place.up}
  use:portal
  bind:this={menu}
  onkeydown={keydown}
  style:left="{place.left}px"
  style:width="{place.width}px"
  style:top={place.top === undefined ? 'auto' : place.top + 'px'}
  style:bottom={place.bottom === undefined ? 'auto' : place.bottom + 'px'}
  style:max-height="{place.maxHeight}px"
>
  <ul class="bc-row-menu--options" role="listbox" aria-label={label}>
    {#each options as option, i (option.value)}
      {#if option.heading}<li class="bc-row-menu--heading" role="presentation">{option.heading}</li>{/if}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <li
        id="{id}-o{i}"
        role="option"
        tabindex={i === active ? 0 : -1}
        aria-selected={option.value === value}
        class="bc-row-menu--option"
        class:bc-row-menu--help={!!option.example}
        class:bc-row-menu--selected={option.value === value}
        class:bc-row-menu--divided={option.divider}
        onclick={() => pick(option.value)}
      >
        {#if option.icon}<span class="bc-row-menu--icon"><Icon name={/** @type {any} */ (option.icon)} size={22} /></span>{/if}
        {#if ios}<span class="bc-row-menu--check">{#if option.value === value}<Icon name="check" size={18} />{/if}</span>{/if}
        <span class="bc-row-menu--texts">
          <span class="bc-row-menu--label">{option.label}</span>
          {#if option.example}<span class="bc-row-menu--example">{option.example}</span>{/if}
        </span>
        {#if !ios && option.value === value}<span class="bc-row-menu--check"><Icon name="check" size={24} /></span>{/if}
      </li>
    {/each}
  </ul>
</div>

<style>
  @layer bc.components {
    /* The touched row while its menu is open: selected tint, 12 dp corners. */
    :global(.bc-row-menu--anchored) {
      background: var(--bc-surface-container-highest) !important;
      border-radius: 12px !important;
    }

    .bc-row-menu--scrim {
      position: fixed;
      inset: 0;
      /* Under the menu, above the dialogs (13500). */
      z-index: 13990;
      background: transparent;
    }

    /* 16 dp corners, surface #F5F4F0 (the page background), elevation level 2. */
    .bc-row-menu {
      position: fixed;
      z-index: 14000;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      border-radius: 16px;
      background: var(--bc-background);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 2px 6px 2px rgba(0, 0, 0, 0.15);
      overflow: hidden;

      :global(html.dark) & {
        background: var(--bc-surface-container-highest);
      }
    }

    .bc-row-menu--options {
      margin: 0;
      padding: 8px 0;
      list-style: none;
      overflow-y: auto;
      overscroll-behavior: contain;
    }

    /* A divider with a title between two groups of options (the default cylinder's « Tailles courantes »). */
    .bc-row-menu--heading {
      margin-top: 8px;
      padding: 12px 16px 4px;
      border-top: var(--bc-outline-width) solid var(--bc-separator);
      font-size: 12px;
      line-height: 16px;
      font-weight: 500;
      color: var(--bc-text-2);
    }

    .bc-row-menu--option {
      min-height: 48px;
      padding: 0 16px;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 12px;
      color: var(--bc-text);
      cursor: pointer;
      outline: none;

      &.bc-row-menu--help {
        min-height: 56px;
      }

      &:focus-visible {
        outline: 2px solid var(--bc-text);
        outline-offset: -2px;
        border-radius: 8px;
      }

      &.bc-row-menu--selected {
        background: var(--bc-surface-container-highest);

        :global(html.dark) & {
          background: var(--bc-surface-2);
        }
      }
    }

    /* A line above the option (the kit menu's « Gérer les kits »), and an icon before its label. */
    .bc-row-menu--divided {
      margin-top: 8px;
      position: relative;
      &::before {
        content: '';
        position: absolute;
        top: -5px;
        left: 0;
        right: 0;
        border-top: var(--bc-outline-width) solid var(--bc-separator);
      }
    }

    .bc-row-menu--icon {
      flex: none;
      display: flex;
      color: var(--bc-text-2);
    }

    .bc-row-menu--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .bc-row-menu--label {
      font-size: 16px;
      line-height: 24px;
      font-variant-numeric: tabular-nums;
    }

    .bc-row-menu--selected .bc-row-menu--label {
      font-weight: 600;
    }

    .bc-row-menu--example {
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
      font-variant-numeric: tabular-nums;
    }

    .bc-row-menu--check {
      flex: none;
      display: flex;
      justify-content: center;
      align-items: center;
    }

    /* iOS: the look of a UIMenu, check at the start, no tint on the current value. */
    .bc-row-menu--ios {
      border-radius: 13px;
      background: var(--bc-surface);

      .bc-row-menu--options {
        padding: 0;
      }

      .bc-row-menu--option {
        min-height: 44px;
        gap: 8px;
        padding: 0 14px 0 10px;
        border-bottom: 0.5px solid var(--bc-separator);

        &:last-child {
          border-bottom: none;
        }

        &.bc-row-menu--help {
          min-height: 52px;
        }

        &.bc-row-menu--selected {
          background: none;
        }
      }

      .bc-row-menu--check {
        width: 20px;
      }

      .bc-row-menu--selected .bc-row-menu--label {
        font-weight: 400;
      }
    }


    /* Mouse: the Material 3 hover layer, 8 % of the content colour over the background. */
    @media (hover: hover) and (pointer: fine) {
      .bc-row-menu--option {
        transition: box-shadow 120ms linear;
        &:hover {
          box-shadow: inset 0 0 0 100vmax color-mix(in srgb, currentColor 8%, transparent);
        }
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .bc-row-menu--option {
        transition: none;
      }
    }
  }
</style>
