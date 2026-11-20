<script>
  // @ts-check
  // One row of a choice of one item among several (docs/system-design.md,
  // section 8, "No radio buttons on Android"). Android: no radio button; the
  // chosen row sits on the selected tint with 12 dp corners and a 24 dp check at
  // the start, the others are plain with an empty 24 dp slot so the texts line
  // up. iOS keeps its native radio row (Framework7). Put the rows in a
  // role="radiogroup" element: the arrow keys move and select, as in a radio
  // group.
  import Icon from './Icon.svelte';
  import { theme } from 'framework7-svelte';

  /**
   * `name`: group name of the native radios (iOS).
   * `tinted`: false when a parent paints the selected tint (a row followed by
   * its fields, account import).
   * `class`: extra class of the row.
   * @type {{
   *   selected: boolean,
   *   onselect: () => void,
   *   name: string,
   *   disabled?: boolean,
   *   tinted?: boolean,
   *   class?: string,
   *   children: import('svelte').Snippet,
   * }}
   */
  let { selected, onselect, name, disabled = false, tinted = true, class: extra = '', children } = $props();

  /** Arrow keys move to the next or previous row and select it. */
  function keydown(/** @type {KeyboardEvent} */ event) {
    const forward = event.key === 'ArrowDown' || event.key === 'ArrowRight';
    const backward = event.key === 'ArrowUp' || event.key === 'ArrowLeft';
    if (!forward && !backward) return;
    const row = /** @type {HTMLElement} */ (event.currentTarget);
    const rows = /** @type {HTMLElement[]} */ ([...(row.closest('[role="radiogroup"]')?.querySelectorAll('[role="radio"]') ?? [])]).filter(
      (r) => !r.hasAttribute('disabled'),
    );
    const at = rows.indexOf(row);
    if (at < 0 || rows.length < 2) return;
    event.preventDefault();
    const next = rows[(at + (forward ? 1 : rows.length - 1)) % rows.length];
    next.focus();
    next.click();
  }
</script>

{#if theme.ios}
  <label class="bc-choice-row bc-choice-row--ios {extra}">
    <span class="radio"><input type="radio" {name} checked={selected} {disabled} onchange={onselect} /><i class="icon-radio"></i></span>
    {@render children()}
  </label>
{:else}
  <button
    type="button"
    role="radio"
    aria-checked={selected}
    {disabled}
    tabindex={selected ? 0 : -1}
    class="bc-choice-row {extra}"
    class:bc-choice-row--selected={selected && tinted}
    onclick={onselect}
    onkeydown={keydown}
  >
    <span class="bc-choice-row--check" aria-hidden="true">{#if selected}<Icon name="check" size={24} weight={2} />{/if}</span>
    {@render children()}
  </button>
{/if}

<style>
  @layer od.components {
    .bc-choice-row {
      display: flex;
      align-items: center;
      gap: 16px;
      width: 100%;
      min-height: 48px;
      box-sizing: border-box;
      padding: 8px;
      border: none;
      border-radius: 12px;
      background: none;
      color: var(--bc-text);
      font: inherit;
      text-align: start;
      cursor: pointer;

      &:disabled {
        cursor: default;
        opacity: 0.7;
      }

      &:focus-visible {
        outline: 2px solid var(--bc-text);
        outline-offset: 2px;
      }

      &.bc-choice-row--ios {
        gap: 12px;
        border-radius: 0;
      }
    }

    .bc-choice-row--selected {
      background: var(--bc-surface-container-highest);
    }

    .bc-choice-row--check {
      flex: none;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--bc-text);
    }

    /* Mouse: the Material 3 hover layer, 8 % of the content colour over the background. */
    @media (hover: hover) and (pointer: fine) {
      .bc-choice-row {
        transition: box-shadow 120ms linear;
      }
      .bc-choice-row:not(:disabled):hover {
        box-shadow: inset 0 0 0 100vmax color-mix(in srgb, currentColor 8%, transparent);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .bc-choice-row {
        transition: none;
      }
    }
  }
</style>
