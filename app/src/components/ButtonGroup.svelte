<script>
  // @ts-check
  // An exclusive choice among a few short options: Material 3 Expressive
  // connected button group on Android (2 dp gaps, 40 dp high; unselected tonal
  // with 8 dp inner corners and fully rounded outer ends; selected filled with
  // the ink and fully rounded; no check mark), iOS segmented control on iOS.
  // Option `clearable`: a tap on the selected button clears the choice (onchange
  // gets ''). Option `marked`: a check icon on the selected button, in the
  // secondary colour (the "Ce lest était" choice, docs/mockups/android-edition.dc.html).
  // Option `rail` (« Ce lest était », task 2026-11-19-302, docs/mockups/detail-ordinateurs-android.dc.html): one
  // rounded rail, 48 high, with 4 inside padding; a pill slides from one choice to the next in 300 ms (none when
  // reduced motion is on); the chosen label turns white, no check mark; with `clearable`, the pill fades out when
  // the chosen choice is touched again. The same on every platform.
  // Option `slider` (desktop Réglages, task 2026-11-24-388/392): the rail's behaviour, smaller: 4 padding, 20 corners,
  // 32 high options at 14 px, the thumb black (--bc-ink) with white 600 text, sliding in 200 ms.
  // Accessibility: a radio group, roving tabindex, arrow keys move the choice.

  import Icon from './Icon.svelte';

  /**
   * @type {{
   *   options: { value: string, label: string }[],
   *   value: string,
   *   onchange: (value: string) => void,
   *   ariaLabel?: string,
   *   ariaLabelledby?: string,
   *   class?: string,
   *   clearable?: boolean,
   *   marked?: boolean,
   *   rail?: boolean,
   *   slider?: boolean,
   * }}
   */
  let { options, value, onchange, ariaLabel, ariaLabelledby, class: extra = '', clearable = false, marked = false, rail: railProp = false, slider = false } = $props();
  const rail = $derived(railProp || slider);

  /** @type {HTMLDivElement|undefined} */
  let group = $state();

  /** The rail's pill rests on the last choice made while none is chosen, so it fades out in place. */
  let lastIndex = $state(0);
  const selectedIndex = $derived(options.findIndex((o) => o.value === value));
  $effect(() => {
    if (selectedIndex >= 0) lastIndex = selectedIndex;
  });

  /** @param {KeyboardEvent} e @param {number} index */
  function key(e, index) {
    const forward = e.key === 'ArrowRight' || e.key === 'ArrowDown';
    const backward = e.key === 'ArrowLeft' || e.key === 'ArrowUp';
    if (!forward && !backward) return;
    e.preventDefault();
    const next = (index + (forward ? 1 : -1) + options.length) % options.length;
    if (options[next].value !== value) onchange(options[next].value);
    /** @type {HTMLElement|undefined} */ (/** @type {any} */ (group?.children[next]))?.focus();
  }
</script>

<div bind:this={group} class="bc-button-group {extra}" class:bc-button-group--marked={marked && !rail} class:bc-button-group--rail={rail} class:bc-button-group--slider={slider} role="radiogroup" aria-label={ariaLabel} aria-labelledby={ariaLabelledby}>
  {#if rail}
    <span class="bc-button-group--pill" class:bc-button-group--pill-hidden={selectedIndex < 0} style:width="calc((100% - 8px) / {options.length})" style:transform="translateX({lastIndex * 100}%)" aria-hidden="true"></span>
  {/if}
  {#each options as option, i (option.value)}
    <button
      type="button"
      role="radio"
      class="bc-button-group--button"
      class:bc-button-group--selected={value === option.value}
      aria-checked={value === option.value}
      tabindex={value === option.value || (!options.some((o) => o.value === value) && i === 0) ? 0 : -1}
      onclick={() => (value !== option.value ? onchange(option.value) : clearable && onchange(''))}
      onkeydown={(e) => key(e, i)}
    >
      {#if marked && !rail && value === option.value}<Icon name="check" size={18} weight={2.4} />{/if}
      {option.label}
    </button>
  {/each}
</div>

<style>
  @layer bc.components {
    .bc-button-group {
      display: flex;
      gap: 2px;
    }

    .bc-button-group--button {
      flex: 1 1 0;
      min-width: 0;
      min-height: 40px;
      padding: 4px 12px;
      box-sizing: border-box;
      border: none;
      border-radius: 8px;
      background: var(--bc-surface-container-high);
      color: var(--bc-text);
      font: inherit;
      font-size: 14px;
      line-height: 20px;
      font-weight: 500;
      letter-spacing: 0.1px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      text-align: center;
      cursor: pointer;

      &:first-child {
        border-start-start-radius: 20px;
        border-end-start-radius: 20px;
      }

      &:last-child {
        border-start-end-radius: 20px;
        border-end-end-radius: 20px;
      }

      &.bc-button-group--selected {
        border-radius: 20px;
        background: var(--bc-primary-action);
        color: var(--bc-on-primary-action);
      }

      &:focus-visible {
        outline: 2px solid var(--bc-primary-action);
        outline-offset: 2px;
      }
    }

    /* The rail (« Ce lest était »): the pill is the selection, the buttons are transparent labels over it. */
    .bc-button-group--rail {
      position: relative;
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: 1fr;
      gap: 0;
      height: 48px;
      padding: 4px;
      box-sizing: border-box;
      border-radius: 24px;
      background: var(--bc-surface-container-high);

      .bc-button-group--pill {
        position: absolute;
        top: 4px;
        left: 4px;
        height: 40px;
        border-radius: 20px;
        background: var(--bc-secondary);
        transition:
          transform 300ms cubic-bezier(0.2, 0, 0, 1),
          opacity 200ms linear;
      }

      .bc-button-group--pill-hidden {
        opacity: 0;
      }

      .bc-button-group--button,
      .bc-button-group--button.bc-button-group--selected {
        position: relative;
        z-index: 1;
        min-height: 40px;
        height: 40px;
        padding: 0 4px;
        border-radius: 20px;
        background: none;
        color: var(--bc-text);
        transition: color 200ms linear;
      }

      .bc-button-group--button.bc-button-group--selected {
        color: var(--bc-on-secondary);
      }

      @media (prefers-reduced-motion: reduce) {
        .bc-button-group--pill,
        .bc-button-group--button {
          transition: none;
        }
      }
    }

    /* The marked variant: secondary colour, with the check icon. */
    .bc-button-group--marked .bc-button-group--button.bc-button-group--selected {
      background: var(--bc-secondary);
      color: var(--bc-on-secondary);
    }

    /* Mouse: the Material 3 hover layer, 8 % of the content colour over the background. */
    @media (hover: hover) and (pointer: fine) {
      .bc-button-group--button {
        transition: box-shadow 120ms linear;
      }
      .bc-button-group:not(.bc-button-group--rail) .bc-button-group--button:not(:disabled):hover {
        box-shadow: inset 0 0 0 100vmax color-mix(in srgb, currentColor 8%, transparent);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .bc-button-group--button {
        transition: none;
      }
    }
    /* The slider selector: a smaller rail with a black thumb. */
    .bc-button-group--slider {
      height: auto;
      border-radius: 20px;
      background: var(--bc-desktop-field);

      .bc-button-group--pill {
        height: 32px;
        border-radius: 16px;
        background: var(--bc-primary);
        transition: transform 200ms cubic-bezier(0.2, 0, 0, 1);
      }
      .bc-button-group--button,
      .bc-button-group--button.bc-button-group--selected {
        min-height: 32px;
        height: 32px;
        padding: 0 14px;
        border-radius: 16px;
        font-size: 14px;
        white-space: nowrap;
      }
      .bc-button-group--button.bc-button-group--selected {
        color: var(--bc-on-primary);
        font-weight: 600;
      }
    }

    /* iOS: a segmented control. */
    :global(.ios) .bc-button-group:not(.bc-button-group--rail) {
      gap: 2px;
      padding: 2px;
      border-radius: 9px;
      background: var(--bc-surface-2);

      .bc-button-group--button {
        min-height: 32px;
        border-radius: 7px;
        background: none;
        font-size: 14px;
        font-weight: 400;
        letter-spacing: 0;

        &.bc-button-group--selected {
          border-radius: 7px;
          background: var(--bc-surface);
          color: var(--bc-text);
          font-weight: 600;
          box-shadow: 0 1px 2px rgb(0 0 0 / 0.12);
        }
      }
    }
  }
</style>
