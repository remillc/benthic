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
   * }}
   */
  let { options, value, onchange, ariaLabel, ariaLabelledby, class: extra = '', clearable = false, marked = false, rail = false } = $props();

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

<div bind:this={group} class="od-button-group {extra}" class:od-button-group--marked={marked && !rail} class:od-button-group--rail={rail} role="radiogroup" aria-label={ariaLabel} aria-labelledby={ariaLabelledby}>
  {#if rail}
    <span class="od-button-group--pill" class:od-button-group--pill-hidden={selectedIndex < 0} style:width="calc((100% - 8px) / {options.length})" style:transform="translateX({lastIndex * 100}%)" aria-hidden="true"></span>
  {/if}
  {#each options as option, i (option.value)}
    <button
      type="button"
      role="radio"
      class="od-button-group--button"
      class:od-button-group--selected={value === option.value}
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
  @layer od.components {
    .od-button-group {
      display: flex;
      gap: 2px;
    }

    .od-button-group--button {
      flex: 1 1 0;
      min-width: 0;
      min-height: 40px;
      padding: 4px 12px;
      box-sizing: border-box;
      border: none;
      border-radius: 8px;
      background: var(--od-surface-container-high);
      color: var(--od-text);
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

      &.od-button-group--selected {
        border-radius: 20px;
        background: var(--od-primary-action);
        color: var(--od-on-primary-action);
      }

      &:focus-visible {
        outline: 2px solid var(--od-primary-action);
        outline-offset: 2px;
      }
    }

    /* The rail (« Ce lest était »): the pill is the selection, the buttons are transparent labels over it. */
    .od-button-group--rail {
      position: relative;
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: 1fr;
      gap: 0;
      height: 48px;
      padding: 4px;
      box-sizing: border-box;
      border-radius: 24px;
      background: var(--od-surface-container-high);

      .od-button-group--pill {
        position: absolute;
        top: 4px;
        left: 4px;
        height: 40px;
        border-radius: 20px;
        background: var(--od-secondary);
        transition:
          transform 300ms cubic-bezier(0.2, 0, 0, 1),
          opacity 200ms linear;
      }

      .od-button-group--pill-hidden {
        opacity: 0;
      }

      .od-button-group--button,
      .od-button-group--button.od-button-group--selected {
        position: relative;
        z-index: 1;
        min-height: 40px;
        height: 40px;
        padding: 0 4px;
        border-radius: 20px;
        background: none;
        color: var(--od-text);
        transition: color 200ms linear;
      }

      .od-button-group--button.od-button-group--selected {
        color: var(--od-on-secondary);
      }

      @media (prefers-reduced-motion: reduce) {
        .od-button-group--pill,
        .od-button-group--button {
          transition: none;
        }
      }
    }

    /* The marked variant: secondary colour, with the check icon. */
    .od-button-group--marked .od-button-group--button.od-button-group--selected {
      background: var(--od-secondary);
      color: var(--od-on-secondary);
    }

    /* Mouse: the Material 3 hover layer, 8 % of the content colour over the background. */
    @media (hover: hover) and (pointer: fine) {
      .od-button-group--button {
        transition: box-shadow 120ms linear;
      }
      .od-button-group:not(.od-button-group--rail) .od-button-group--button:not(:disabled):hover {
        box-shadow: inset 0 0 0 100vmax color-mix(in srgb, currentColor 8%, transparent);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .od-button-group--button {
        transition: none;
      }
    }
    /* iOS: a segmented control. */
    :global(.ios) .od-button-group:not(.od-button-group--rail) {
      gap: 2px;
      padding: 2px;
      border-radius: 9px;
      background: var(--od-surface-2);

      .od-button-group--button {
        min-height: 32px;
        border-radius: 7px;
        background: none;
        font-size: 14px;
        font-weight: 400;
        letter-spacing: 0;

        &.od-button-group--selected {
          border-radius: 7px;
          background: var(--od-surface);
          color: var(--od-text);
          font-weight: 600;
          box-shadow: 0 1px 2px rgb(0 0 0 / 0.12);
        }
      }
    }
  }
</style>
