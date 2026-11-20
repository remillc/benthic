<script>
  // @ts-check
  import { tick } from 'svelte';
  import DropdownArrow from './DropdownArrow.svelte';
  import { opensUp, moveActive } from '../lib/select-menu.js';
  // A number chosen in a list of presets or typed (tasks 71 and 72; mock-ups
  // android-planificateur-sac and -altitude): the MD3 filled field with its
  // downward chevron, but editable. A combobox: the chevron or a tap opens the
  // list, typing is allowed. The caller gives the rules (`parse` keeps and clamps
  // what is typed, null while it is not a number; `toText` and `presetText`
  // write numbers); the value need not be a preset, the preset equal to it is
  // tinted. Optional helper text while the list is open.

  /**
   * @type {{
   *   label: string,
   *   value: number,
   *   presets: number[],
   *   parse: (text: string) => number|null,
   *   toText: (value: number) => string,
   *   presetText: (value: number) => string,
   *   unit: string,
   *   ariaLabel: string,
   *   helper?: string,
   *   openLabel: string,
   *   onchange: (value: number) => void,
   * }}
   * unit: shown after the number. ariaLabel: the name with the current value.
   * openLabel: the name of the chevron button.
   */
  let { label, value, presets, parse, toText, presetText, unit, ariaLabel, helper = '', openLabel, onchange } = $props();

  const id = `od-number-combo-${Math.random().toString(36).slice(2, 9)}`;
  let open = $state(false);
  let focused = $state(false);
  let text = $state('');
  let active = $state(-1);
  let place = $state({ left: 0, width: 0, top: /** @type {number|undefined} */ (undefined), bottom: /** @type {number|undefined} */ (undefined), maxHeight: 336 });
  /** @type {HTMLDivElement|undefined} */
  let root = $state();
  /** @type {HTMLDivElement|undefined} */
  let box = $state();
  /** @type {HTMLUListElement|undefined} */
  let menu = $state();
  /** @type {HTMLInputElement|undefined} */
  let input = $state();

  // The text follows the value, except while it is being typed.
  $effect(() => {
    const current = value;
    if (!focused) text = toText(current);
  });

  async function show() {
    if (open) return;
    active = presets.indexOf(value);
    open = true;
    await tick();
    position();
    // A long list opens on the current value (task 2026-11-13-92), or on the
    // nearest preset when the value is not one.
    await tick();
    const at = active >= 0 ? active : nearest();
    /** @type {HTMLElement|undefined} */ (menu?.children[at])?.scrollIntoView({ block: 'center' });
  }

  /** The index of the preset nearest the value. */
  function nearest() {
    let best = 0;
    presets.forEach((p, i) => {
      if (Math.abs(p - value) < Math.abs(presets[best] - value)) best = i;
    });
    return best;
  }

  function position() {
    const rect = box?.getBoundingClientRect();
    if (!rect) return;
    const below = window.innerHeight - rect.bottom - 8;
    const above = rect.top - 8;
    const height = menu?.offsetHeight || presets.length * 48 + 16;
    const up = opensUp(below, above, height);
    place = {
      left: rect.left,
      width: rect.width,
      top: up ? undefined : rect.bottom + 4,
      bottom: up ? window.innerHeight - rect.top + 4 : undefined,
      maxHeight: Math.max(120, Math.min(336, (up ? above : below) - 4)),
    };
  }

  /** @param {HTMLElement} node */
  function portal(node) {
    document.body.appendChild(node);
    return { destroy: () => node.remove() };
  }

  function close() {
    open = false;
  }

  /** The typed value is kept: the text shows what was kept. */
  function commit() {
    const kept = parse(text);
    if (kept !== null && kept !== value) onchange(kept);
    text = toText(kept ?? value);
  }

  /** A valid text updates the plan as it is typed, the text itself stays as typed. */
  function typed() {
    const kept = parse(text);
    if (kept !== null && kept !== value) onchange(kept);
    if (!open) show();
  }

  /** @param {number} chosen */
  function pick(chosen) {
    close();
    if (chosen !== value) onchange(chosen);
    text = toText(chosen);
    input?.focus();
  }

  /** @param {KeyboardEvent} e */
  function keydown(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) show();
      else active = moveActive(active, e.key, presets.length);
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && active >= 0) pick(presets[active]);
      else {
        commit();
        close();
      }
    } else if (e.key === 'Tab') {
      close();
    }
  }

  /** @param {PointerEvent} e */
  function outside(e) {
    const target = /** @type {Node} */ (e.target);
    if (open && !root?.contains(target) && !menu?.contains(target)) close();
  }

  /** @param {Event} e */
  function moved(e) {
    if (open && !(e.target instanceof Node && menu?.contains(e.target))) position();
  }

  // The system Back key (lib/back-button.js) closes the list.
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

<div class="bc-number-combo bc-number-combo--field" class:bc-number-combo--open={open} class:bc-number-combo--focused={focused} bind:this={root}>
  <div class="bc-number-combo--box" bind:this={box}>
    <label class="bc-number-combo--label" for={id}>{label}</label>
    <input
      {id}
      bind:this={input}
      bind:value={text}
      class="bc-number-combo--input"
      type="text"
      inputmode="decimal"
      autocomplete="off"
      role="combobox"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls="{id}-list"
      aria-autocomplete="none"
      aria-label={ariaLabel}
      onfocus={() => (focused = true)}
      onblur={() => {
        focused = false;
        commit();
      }}
      onclick={show}
      oninput={typed}
      onkeydown={keydown}
    />
    <span class="bc-number-combo--unit" aria-hidden="true">{unit}</span>
    <button type="button" class="bc-number-combo--chevron" tabindex="-1" aria-label={openLabel} onmousedown={(e) => e.preventDefault()} onclick={() => (open ? close() : (input?.focus(), show()))}>
      <span class="bc-number-combo--arrow"><DropdownArrow /></span>
    </button>
    {#if open}
      <ul
        class="bc-number-combo--menu"
        id="{id}-list"
        role="listbox"
        aria-label={ariaLabel}
        use:portal
        bind:this={menu}
        style:left="{place.left}px"
        style:width="{place.width}px"
        style:top={place.top === undefined ? 'auto' : place.top + 'px'}
        style:bottom={place.bottom === undefined ? 'auto' : place.bottom + 'px'}
        style:max-height="{place.maxHeight}px"
      >
        {#each presets as preset, i (preset)}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <li
            role="option"
            aria-selected={preset === value}
            class="bc-number-combo--option"
            class:bc-number-combo--active={i === active}
            onmousedown={(e) => e.preventDefault()}
            onclick={() => pick(preset)}
          >{presetText(preset)}&nbsp;{unit}</li>
        {/each}
      </ul>
    {/if}
  </div>
  {#if open && helper}<p class="bc-number-combo--helper">{helper}</p>{/if}
</div>

<style>
  @layer od.components {
    .bc-number-combo--field {
      margin: 18px var(--bc-field-margin, 16px) 0;
      min-width: 0;
    }

    .bc-number-combo--box {
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

      .bc-number-combo--open &::after,
      &:focus-within::after {
        height: 2px;
        background: var(--bc-primary-action);
      }

      :global(.ios) & {
        border-radius: 10px;
        background: var(--bc-surface);

        &::after {
          display: none;
        }
      }
    }

    .bc-number-combo--label {
      position: absolute;
      left: 16px;
      top: 8px;
      font-size: 12px;
      line-height: 16px;
      color: var(--bc-text-2);
      pointer-events: none;
    }

    .bc-number-combo--open .bc-number-combo--label,
    .bc-number-combo--focused .bc-number-combo--label {
      color: var(--bc-primary-action);
    }

    .bc-number-combo--input {
      display: block;
      width: 100%;
      height: 100%;
      /* Room at the end for the unit and the chevron. */
      padding: 24px 110px 6px 16px;
      box-sizing: border-box;
      border: none;
      border-radius: inherit;
      outline: none;
      background: none;
      color: var(--bc-text);
      font: inherit;
      font-size: 16px;
      line-height: 24px;
    }

    .bc-number-combo--unit {
      position: absolute;
      right: 52px;
      bottom: 6px;
      font-size: 14px;
      line-height: 24px;
      color: var(--bc-text-2);
      pointer-events: none;
    }

    .bc-number-combo--chevron {
      position: absolute;
      right: 0;
      top: 4px;
      width: 48px;
      height: 48px;
      padding: 0;
      border: none;
      background: none;
      color: var(--bc-text-2);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* Mouse: the 8 % layer of the content colour on a round state area. */
    @media (hover: hover) and (pointer: fine) {
      .bc-number-combo--chevron:hover {
        background: radial-gradient(circle closest-side, color-mix(in srgb, var(--bc-text) 8%, transparent) 99%, transparent) center / 40px 40px no-repeat;
      }
    }

    .bc-number-combo--arrow {
      display: flex;
      transition: transform 150ms;

      .bc-number-combo--open & {
        transform: rotate(180deg);
      }
    }

    /* The exposed dropdown menu, as SelectField draws it (spec, section 8). */
    .bc-number-combo--menu {
      position: fixed;
      z-index: 14000;
      box-sizing: border-box;
      margin: 0;
      padding: 8px 0;
      list-style: none;
      overflow-y: auto;
      overscroll-behavior: contain;
      border-radius: 4px;
      background: var(--bc-surface);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 2px 6px 2px rgba(0, 0, 0, 0.15);
    }

    .bc-number-combo--option {
      min-height: 48px;
      padding: 0 16px;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      font-size: 16px;
      line-height: 24px;
      color: var(--bc-text);
      cursor: pointer;

      &.bc-number-combo--active {
        background: var(--bc-surface-2);
      }

      &[aria-selected='true'] {
        background: var(--bc-surface-container-highest);
      }
    }

    .bc-number-combo--helper {
      margin: 4px 16px 0;
      font-size: 12px;
      line-height: 16px;
      letter-spacing: 0.4px;
      color: var(--bc-text-2);
    }
  }
</style>
