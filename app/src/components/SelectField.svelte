<script>
  // @ts-check
  import { tick } from 'svelte';
  import DropdownArrow from './DropdownArrow.svelte';
  import Icon from './Icon.svelte';
  import SearchClear from './SearchClear.svelte';
  import { ios } from '../lib/layout.svelte.js';
  import { menuOptions, filterOptions, moveActive, opensUp } from '../lib/select-menu.js';
  // One value chosen in a short list: the MD3 filled field with a downward chevron at the end
  // (spec, section 1, "Text fields"). On Android a tap opens the exposed dropdown menu
  // (spec, section 8, "Text fields and menus"): right under the field, at its width, the
  // current value highlighted; it closes on a choice, a tap outside, Escape or the system
  // Back key. iOS keeps its own pattern, the system's choice list. The label is always small
  // above the value. A value outside the list shows in the field and heads the menu.

  /**
   * @type {{
   *   label: string,
   *   value: string,
   *   options: { value: string, label: string }[],
   *   supporting?: string,
   *   disabled?: boolean,
   *   onchange?: (value: string) => void,
   *   clearLabel?: string,
   *   ariaLabel?: string,
   *   invalid?: boolean,
   *   searchLabel?: string,
   *   newLabel?: string,
   *   noResultsLabel?: string,
   *   onnew?: (query: string) => void,
   *   outlined?: boolean,
   *   icon?: import('svelte').Snippet<[string]>,
   * }}
   * ariaLabel: the accessible name when the label alone is not enough (the
   * full label and the unit).
   * invalid: the label and a 2 dp indicator in the alarm colour.
   * searchLabel: a search field at the top of the menu (long lists, such as
   * the sites). newLabel: a last choice, "New site…", that calls onnew with
   * what was searched. outlined: the outlined field of the alpha first launch (52 dp, 12 dp corners, the label
   * on the border), as AccountField's.
   * icon: a drawing before each option, in the field and in the menu (the chosen option gets a check), as the type of a
   * piece of equipment (task 2026-11-19-310); the iPhone's system list shows the drawing in the field only.
   */
  let {
    label,
    value = $bindable(),
    options,
    supporting = '',
    disabled = false,
    onchange,
    clearLabel = '',
    ariaLabel,
    invalid = false,
    searchLabel = '',
    newLabel = '',
    noResultsLabel = '',
    onnew,
    outlined = false,
    icon,
  } = $props();

  /** With `clearLabel` and a value: a ✕ sets the field back to the empty choice. */
  function clear() {
    value = '';
    onchange?.(value);
  }

  const id = `od-select-${Math.random().toString(36).slice(2, 9)}`;

  let open = $state(false);
  /** Where the menu is drawn: fixed on the screen, outside every card that could clip it. */
  let place = $state({ left: 0, width: 0, top: /** @type {number|undefined} */ (undefined), bottom: /** @type {number|undefined} */ (undefined), maxHeight: 336 });
  let query = $state('');
  let active = $state(-1);
  /** @type {HTMLDivElement|undefined} */
  let root = $state();
  /** @type {HTMLDivElement|undefined} */
  let box = $state();
  /** @type {HTMLDivElement|undefined} */
  let menu = $state();
  /** @type {HTMLButtonElement|undefined} */
  let trigger = $state();
  /** @type {HTMLInputElement|undefined} */
  let search = $state();

  const all = $derived(menuOptions(options, value));
  const shown = $derived(searchLabel ? filterOptions(all, query) : all);
  /** What the keyboard moves over: the shown options, then "New …". */
  const count = $derived(shown.length + (newLabel ? 1 : 0));
  const shownLabel = $derived(all.find((o) => o.value === value)?.label ?? '');

  async function show() {
    if (disabled || open) return;
    query = '';
    active = all.findIndex((o) => o.value === value);
    open = true;
    await tick();
    position();
    if (searchLabel) search?.focus();
    // The list opens on the chosen value, centred (Christian, 13 November 2026).
    await tick();
    scrollToActive('center');
  }

  /** Puts the menu under the field (above it when there is no room below), at the field's width. */
  function position() {
    const rect = box?.getBoundingClientRect();
    if (!rect) return;
    const below = window.innerHeight - rect.bottom - 8;
    const above = rect.top - 8;
    const height = menu?.offsetHeight || Math.min(336, all.length * 48 + 16 + (searchLabel ? 56 : 0));
    const up = opensUp(below, above, height);
    place = {
      left: rect.left,
      width: rect.width,
      top: up ? undefined : rect.bottom + 4,
      bottom: up ? window.innerHeight - rect.top + 4 : undefined,
      maxHeight: Math.max(120, Math.min(336, (up ? above : below) - 4)),
    };
  }

  /** The menu lives in the page's root, so no card, dialog or scroller clips it. @param {HTMLElement} node */
  function portal(node) {
    document.body.appendChild(node);
    return { destroy: () => node.remove() };
  }

  /** @param {boolean} [refocus] */
  function close(refocus = true) {
    if (!open) return;
    open = false;
    if (refocus) trigger?.focus();
  }

  /**
   * Brings the active option into view. The menu is portalled to the page's
   * root, so it is looked up by id, not inside the field.
   * @param {ScrollLogicalPosition} [block]
   */
  function scrollToActive(block = 'nearest') {
    if (active < 0) return;
    document.getElementById(`${id}-o${active}`)?.scrollIntoView({ block });
  }

  /** @param {string} chosen */
  function pick(chosen) {
    close();
    if (chosen === value) return;
    value = chosen;
    onchange?.(chosen);
  }

  /** @param {number} index */
  function activate(index) {
    if (index < shown.length) pick(shown[index].value);
    else if (index === shown.length && newLabel) {
      const typed = query.trim();
      close(false);
      onnew?.(typed);
    }
  }

  /** @param {KeyboardEvent} e */
  function keydown(e) {
    const inSearch = e.target === search;
    if (e.target instanceof HTMLButtonElement && e.target.classList.contains('bc-search-clear') && e.key !== 'Escape' && e.key !== 'Tab') return;
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        show();
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab' && query && ((inSearch && !e.shiftKey) || (e.target instanceof HTMLButtonElement && e.target.classList.contains('bc-search-clear') && e.shiftKey))) {
      return;
    } else if (e.key === 'Tab') {
      close(false);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || (!inSearch && (e.key === 'Home' || e.key === 'End'))) {
      e.preventDefault();
      active = moveActive(active, e.key, count);
      scrollToActive();
    } else if (e.key === 'Enter' || (e.key === ' ' && !inSearch)) {
      e.preventDefault();
      if (active >= 0) activate(active);
    }
  }

  /** The search narrows the list: the first match is the one Enter takes. */
  function searched() {
    active = shown.length > 0 ? 0 : newLabel ? 0 : -1;
  }

  /** @param {PointerEvent} e */
  function outside(e) {
    const target = /** @type {Node} */ (e.target);
    if (open && !root?.contains(target) && !menu?.contains(target)) close(false);
  }

  /** The page scrolled or the window changed: the menu follows its field. @param {Event} e */
  function moved(e) {
    if (open && !(e.target instanceof Node && menu?.contains(e.target))) position();
  }

  // The system Back key (lib/back-button.js) closes the menu.
  $effect(() => {
    const el = root;
    if (!el) return;
    const cancel = () => close();
    el.addEventListener('od-cancel', cancel);
    return () => el.removeEventListener('od-cancel', cancel);
  });
</script>

<svelte:window onpointerdown={outside} onresize={moved} />
<svelte:document onscrollcapture={moved} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="bc-select-field bc-select-field--field"
  class:disabled
  class:bc-select-field--invalid={invalid}
  class:bc-select-field--open={open}
  class:bc-select-field--outlined={outlined}
  bind:this={root}
  onkeydown={keydown}
>
  <div class="bc-select-field--box" bind:this={box}>
    {#if ios}
      <label class="bc-select-field--label" for={id}>{label}</label>
      {#if icon}<span class="bc-select-field--lead" aria-hidden="true">{@render icon(value)}</span>{/if}
      <select {id} {disabled} class:bc-select-field--with-icon={!!icon} aria-label={ariaLabel} aria-invalid={invalid} class:bc-select-field--clearable={clearLabel && value} bind:value onchange={() => onchange?.(value)}>
        {#each all as option (option.value)}<option value={option.value}>{option.label}</option>{/each}
      </select>
    {:else}
      <button
        type="button"
        {id}
        bind:this={trigger}
        class="bc-select-field--trigger"
        class:bc-select-field--clearable={clearLabel && value}
        class:bc-select-field--with-icon={!!icon}
        {disabled}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="{id}-list"
        aria-label={ariaLabel}
        aria-invalid={invalid}
        onclick={() => (open ? close(false) : show())}
      >
        <span class="bc-select-field--label">{label}</span>
        <span class="bc-select-field--value">{shownLabel}</span>
      </button>
      {#if icon}<span class="bc-select-field--lead" aria-hidden="true">{@render icon(value)}</span>{/if}
    {/if}
    {#if clearLabel && value}
      <button type="button" class="bc-select-field--clear" aria-label={clearLabel} onclick={clear}><Icon name="close" size={20} /></button>
    {/if}
    <span class="bc-select-field--arrow"><DropdownArrow /></span>
    {#if open}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="bc-select-field--menu"
        use:portal
        bind:this={menu}
        onkeydown={keydown}
        style:left="{place.left}px"
        style:width="{place.width}px"
        style:top={place.top === undefined ? 'auto' : place.top + 'px'}
        style:bottom={place.bottom === undefined ? 'auto' : place.bottom + 'px'}
        style:max-height="{place.maxHeight}px"
      >
        {#if searchLabel}
          <div class="bc-select-field--search">
            <Icon name="search" size={20} />
            <input
              type="text"
              bind:this={search}
              bind:value={query}
              oninput={searched}
              placeholder={searchLabel}
              aria-label={searchLabel}
              aria-controls="{id}-list"
              aria-activedescendant={active >= 0 ? `${id}-o${active}` : undefined}
              autocomplete="off"
              enterkeyhint="search"
            />
            {#if query}<SearchClear onclear={() => ((query = ''), searched())} />{/if}
          </div>
        {/if}
        <ul class="bc-select-field--options" id="{id}-list" role="listbox" aria-label={ariaLabel ?? label}>
          {#each shown as option, i (option.value)}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <li
              id="{id}-o{i}"
              role="option"
              data-value={option.value}
              aria-selected={option.value === value}
              class="bc-select-field--option"
              class:bc-select-field--active={i === active}
              onmousedown={(e) => e.preventDefault()}
              onclick={() => pick(option.value)}
            >{#if icon}<span class="bc-select-field--option-icon" aria-hidden="true">{@render icon(option.value)}</span><span class="bc-select-field--option-text">{option.label}</span>{#if option.value === value}<span class="bc-select-field--check" aria-hidden="true"><Icon name="check" size={20} /></span>{/if}{:else}{option.label}{/if}</li>
          {/each}
          {#if searchLabel && shown.length === 0 && noResultsLabel}<li class="bc-select-field--none" role="presentation">{noResultsLabel}</li>{/if}
          {#if newLabel}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <li
              id="{id}-o{shown.length}"
              role="option"
              aria-selected="false"
              class="bc-select-field--option bc-select-field--new"
              class:bc-select-field--active={active === shown.length}
              onmousedown={(e) => e.preventDefault()}
              onclick={() => activate(shown.length)}
            >{newLabel}</li>
          {/if}
        </ul>
      </div>
    {/if}
  </div>
  {#if supporting}<p class="bc-select-field--supporting">{supporting}</p>{/if}
</div>

<style>
  @layer od.components {
    .bc-select-field--field {
      margin: 18px var(--bc-field-margin, 16px) 0;
    }

    .bc-select-field--field.disabled {
      opacity: 0.38;
    }

    .bc-select-field--box {
      position: relative;
      height: 56px;
      box-sizing: border-box;
      border-radius: 4px 4px 0 0;
      background: var(--bc-surface-2);

      &::after {
        content: '';
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 1px;
        background: var(--bc-text-2);
      }

      &:focus-within::after,
      .bc-select-field--open &::after {
        height: 2px;
        background: var(--bc-primary-action);
      }

      .bc-select-field--invalid &::after {
        height: 2px;
        background: var(--bc-alarm);
      }

      :global(.ios) & {
        border-radius: 10px;
        background: var(--bc-surface);

        &::after {
          display: none;
        }
      }
    }

    .bc-select-field--label {
      position: absolute;
      left: 16px;
      top: 8px;
      font-size: 12px;
      line-height: 16px;
      color: var(--bc-text-2);
      pointer-events: none;
    }

    .bc-select-field--open .bc-select-field--label {
      color: var(--bc-primary-action);
    }

    .bc-select-field--invalid .bc-select-field--label {
      color: var(--bc-alarm);
    }

    .bc-select-field--trigger {
      display: block;
      width: 100%;
      height: 100%;
      padding: 24px 48px 6px 16px;
      box-sizing: border-box;
      border: none;
      border-radius: inherit;
      outline: none;
      background: none;
      color: var(--bc-text);
      font: inherit;
      font-size: 16px;
      line-height: 24px;
      text-align: start;

      &.bc-select-field--clearable {
        padding-right: 92px;
      }
    }

    .bc-select-field--value {
      display: block;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* The drawing of the chosen option, before its name (task 2026-11-19-310). */
    .bc-select-field--lead {
      position: absolute;
      left: 16px;
      bottom: 6px;
      height: 24px;
      display: flex;
      align-items: center;
      color: var(--bc-text-2);
      pointer-events: none;
    }

    .bc-select-field--trigger.bc-select-field--with-icon,
    select.bc-select-field--with-icon {
      padding-left: 52px;
    }

    .bc-select-field--option-icon {
      flex: none;
      margin-right: 16px;
      display: flex;
      color: var(--bc-text-2);
    }

    .bc-select-field--option-text {
      flex: 1;
      min-width: 0;
    }

    .bc-select-field--check {
      flex: none;
      display: flex;
      color: var(--bc-text);
    }

    select {
      width: 100%;
      height: 100%;
      padding: 24px 48px 6px 16px;
      box-sizing: border-box;
      border: none;
      outline: none;
      background: none;
      appearance: none;
      color: var(--bc-text);
      font: inherit;
      font-size: 16px;
      line-height: 24px;

      &.bc-select-field--clearable {
        padding-right: 92px;
      }
    }

    /* 48 dp target, 20 dp icon, before the arrow. */
    .bc-select-field--clear {
      position: absolute;
      right: 40px;
      top: 4px;
      width: 48px;
      height: 48px;
      padding: 0;
      border: none;
      border-radius: 24px;
      background: none;
      color: var(--bc-text-2);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .bc-select-field--arrow {
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      display: flex;
      pointer-events: none;
      color: var(--bc-text-2);
      transition: transform 150ms;

      .bc-select-field--open & {
        transform: translateY(-50%) rotate(180deg);
      }
    }

    /* Outlined (docs/mockups/android-premier-lancement-alpha-git.dc.html): the box is 52 dp with a border, no
       underline; the label sits on the border over the page colour. */
    .bc-select-field--outlined {
      margin: var(--bc-outlined-gap, 14px) 0 0;

      .bc-select-field--box {
        height: 52px;
        border: var(--bc-outline-width) solid var(--bc-outlined-field-border);
        border-radius: 12px;
        background: var(--bc-surface);

        &::after {
          display: none;
        }
      }

      &.bc-select-field--open .bc-select-field--box {
        border: 2px solid var(--bc-outlined-field-active);
      }

      .bc-select-field--label {
        left: 12px;
        top: -9px;
        padding: 0 4px;
        background: var(--bc-background);
        font-weight: 600;
      }

      &.bc-select-field--open .bc-select-field--label {
        color: var(--bc-outlined-field-active);
      }

      .bc-select-field--trigger {
        padding: 0 48px 0 16px;
        line-height: 50px;
      }

      .bc-select-field--supporting {
        margin: 4px 0 0 16px;
      }
    }

    /* Exposed dropdown menu (spec, section 8): the field's width, 4 dp corners, 8 dp
       above and below, 48 dp items at 16 sp, the current value on surface-container-highest. */
    .bc-select-field--menu {
      position: fixed;
      /* Above the dialogs (13500). */
      z-index: 14000;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      border-radius: 4px;
      background: var(--bc-surface);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 2px 6px 2px rgba(0, 0, 0, 0.15);
    }

    .bc-select-field--options {
      margin: 0;
      padding: 8px 0;
      list-style: none;
      overflow-y: auto;
      overscroll-behavior: contain;
    }

    .bc-select-field--option {
      min-height: 48px;
      padding: 0 16px;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      font-size: 16px;
      line-height: 24px;
      color: var(--bc-text);
      cursor: pointer;

      &.bc-select-field--active {
        background: var(--bc-surface-2);
      }

      &[aria-selected='true'] {
        background: var(--bc-surface-container-highest);
      }

      &.bc-select-field--new {
        color: var(--bc-text-2);
      }
    }

    .bc-select-field--none {
      padding: 12px 16px;
      font-size: 14px;
      color: var(--bc-text-2);
    }

    .bc-select-field--search {
      flex: none;
      height: 56px;
      padding: 0 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      border-bottom: 1px solid var(--bc-separator);
      color: var(--bc-text-2);

      input {
        flex: 1;
        min-width: 0;
        border: none;
        outline: none;
        background: none;
        color: var(--bc-text);
        font: inherit;
        font-size: 16px;
      }
    }

    .bc-select-field--supporting {
      margin: 4px 16px 0;
      font-size: 12px;
      line-height: 16px;
      letter-spacing: 0.4px;
      color: var(--bc-text-2);
    }


    /* Mouse: the 8 % layer of the text colour over the field. */
    @media (hover: hover) and (pointer: fine) {
      .bc-select-field--trigger:hover {
        background: color-mix(in srgb, var(--bc-text) 8%, transparent);
      }
    }
  }
</style>
