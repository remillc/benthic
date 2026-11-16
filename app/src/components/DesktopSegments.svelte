<script>
  // @ts-check
  // A connected button group of the desktop tools (task 2026-11-15-196): the selected segment is
  // pale blue with a check, not a radio button. Arrow keys move the choice.
  import Icon from './Icon.svelte';
  /** `block`: the group takes the width of its column (40 dp high), as in the dive detail's Informations tab. @type {{ options: { value: string, label: string }[], value: string, onchange: (value: string) => void, ariaLabel: string, block?: boolean }} */
  let { options, value, onchange, ariaLabel, block = false } = $props();
  /** @type {HTMLDivElement|undefined} */
  let group = $state();

  /** @param {KeyboardEvent} e @param {number} index */
  function key(e, index) {
    const forward = e.key === 'ArrowRight' || e.key === 'ArrowDown';
    if (!forward && e.key !== 'ArrowLeft' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const next = (index + (forward ? 1 : -1) + options.length) % options.length;
    onchange(options[next].value);
    /** @type {HTMLElement|undefined} */ (/** @type {any} */ (group?.children[next]))?.focus();
  }
</script>

<div bind:this={group} class="od-desktop-segments" class:od-desktop-segments--block={block} role="radiogroup" aria-label={ariaLabel}>
  {#each options as option, i (option.value)}
    <button
      type="button"
      role="radio"
      class="od-desktop-segments--segment"
      class:od-desktop-segments--selected={value === option.value}
      aria-checked={value === option.value}
      tabindex={value === option.value ? 0 : -1}
      onclick={() => value !== option.value && onchange(option.value)}
      onkeydown={(e) => key(e, i)}
    >
      {#if value === option.value}<Icon name="check" size={18} weight={2.4} />{/if}
      {option.label}
    </button>
  {/each}
</div>

<style>
  @layer od.components {
    .od-desktop-segments {
      display: inline-flex;
      height: 42px;
      border: 1px solid var(--od-text-2);
      border-radius: 21px;
      overflow: hidden;
    }
    .od-desktop-segments--block {
      display: flex;
      height: 40px;
      border-radius: 20px;
    }
    .od-desktop-segments--block .od-desktop-segments--segment {
      flex: 1;
      justify-content: center;
      padding: 0 12px;
    }
    .od-desktop-segments--segment {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 20px;
      border: 0;
      background: none;
      font: inherit;
      font-size: 15px;
      white-space: nowrap;
      color: var(--od-text);
      cursor: pointer;
    }
    .od-desktop-segments--segment + .od-desktop-segments--segment {
      border-left: 1px solid var(--od-text-2);
    }
    .od-desktop-segments--segment:hover {
      background: color-mix(in srgb, var(--od-text) 8%, transparent);
    }
    .od-desktop-segments--selected,
    .od-desktop-segments--selected:hover {
      background: var(--od-desktop-selected);
      color: var(--od-desktop-selected-ink);
    }
    .od-desktop-segments--segment:focus-visible {
      outline: 2px solid var(--od-text);
      outline-offset: -3px;
    }


    /* Mouse: the selected segment takes the 8 % layer of its text colour too. */
    @media (hover: hover) and (pointer: fine) {
      .od-desktop-segments--selected:hover {
        box-shadow: inset 0 0 0 100vmax color-mix(in srgb, currentColor 8%, transparent);
      }
    }
  }
</style>
