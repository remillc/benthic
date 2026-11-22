<script>
  // @ts-check
  import { t } from '../lib/i18n.js';
  import CylinderIcon from './CylinderIcon.svelte';
  // One cylinder of "Edit dive" as a card (docs/ui-specification.md, "Modifier une plongée",
  // Équipement): a small cylinder drawing (filled to the end pressure), "Cylinder N" with its
  // gas in plain words under it in the variant colour, and the drag handle on the
  // right; a text button at the bottom right deletes it; the fields are the card's content. The handle moves the card:
  // a drag with a finger or the mouse (the page runs it, see EditDive), the arrow keys, or
  // the two "Move up" and "Move down" buttons for TalkBack and keyboards.

  /**
   * @type {{
   *   n: number,
   *   gas: string,
   *   ratio?: number,
   *   removeLabel?: string,
   *   onremove?: () => void,
   *   canUp?: boolean,
   *   canDown?: boolean,
   *   dragging?: boolean,
   *   offset?: number,
   *   el?: HTMLElement,
   *   onhandledown?: (event: PointerEvent) => void,
   *   onmove?: (direction: -1|1) => void,
   *   children: import('svelte').Snippet,
   * }}
   * offset: the card's shift in px while a card is dragged (its own, or making room).
   */
  let { n, gas, ratio = 0, removeLabel = '', onremove, canUp = false, canDown = false, dragging = false, offset = 0, el = $bindable(), onhandledown, onmove, children } = $props();

  /** @param {KeyboardEvent} event */
  function key(event) {
    const direction = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
    if (!direction || (direction < 0 ? !canUp : !canDown)) return;
    event.preventDefault();
    onmove?.(direction);
  }
</script>

<div
  class="bc-cylinder-card"
  class:bc-cylinder-card--dragging={dragging}
  class:bc-cylinder-card--shifted={offset !== 0 && !dragging}
  style:transform={offset ? `translateY(${offset}px)` : undefined}
  bind:this={el}
>
  <div class="bc-cylinder-card--head">
    <CylinderIcon />
    <span class="bc-cylinder-card--titles">
      <h4 class="bc-cylinder-card--title">{t('edit.cylinderTitle', { n })}</h4>
      <span class="bc-cylinder-card--gas bc-value">{gas}</span>
    </span>
    <button
      type="button"
      class="bc-cylinder-card--handle"
      aria-label={t('edit.moveCylinder', { n })}
      onpointerdown={onhandledown}
      onkeydown={key}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
        <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
        <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
      </svg>
    </button>
    <span class="bc-sr-only">
      <button type="button" disabled={!canUp} onclick={() => onmove?.(-1)}>{t('edit.moveCylinderUp', { n })}</button>
      <button type="button" disabled={!canDown} onclick={() => onmove?.(1)}>{t('edit.moveCylinderDown', { n })}</button>
    </span>
  </div>
  <div class="bc-cylinder-card--fields">{@render children()}</div>
  {#if onremove}
    <div class="bc-cylinder-card--footer">
      <button type="button" class="bc-cylinder-card--remove" onclick={onremove}>{removeLabel}</button>
    </div>
  {/if}
</div>

<style>
  @layer bc.components {
    .bc-cylinder-card {
      position: relative;
      margin: 16px 16px 0;
      padding: 12px;
      border-radius: 16px;
      background: var(--bc-background);
      --bc-field-margin: 0;
      /* Not split between the columns of the tablet sheet. */
      break-inside: avoid;

      &.bc-cylinder-card--shifted {
        transition: transform 150ms ease;
      }

      &.bc-cylinder-card--dragging {
        z-index: 3;
        box-shadow: 0 4px 16px rgb(0 0 0 / 0.24);
        pointer-events: none;
      }

      @media (prefers-reduced-motion: reduce) {
        &.bc-cylinder-card--shifted {
          transition: none;
        }
      }
    }

    .bc-cylinder-card--head {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .bc-cylinder-card--titles {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .bc-cylinder-card--title {
      margin: 0;
      color: var(--bc-text);
      font-size: 16px;
      line-height: 24px;
      font-weight: 600;
    }

    .bc-cylinder-card--gas {
      color: var(--bc-text-2);
      font-size: 14px;
      line-height: 20px;
      white-space: nowrap;
    }

    .bc-cylinder-card--handle {
      flex: none;
      width: 40px;
      height: 40px;
      margin: -8px -8px -8px 0;
      padding: 0;
      border: none;
      background: none;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--bc-text-2);
      cursor: grab;
      touch-action: none;
      user-select: none;

      svg {
        fill: currentColor;
      }
    }

    .bc-cylinder-card--footer {
      margin-top: 8px;
      display: flex;
      justify-content: flex-end;
    }

    .bc-cylinder-card--remove {
      width: auto;
      min-height: 40px;
      padding: 0 12px;
      border: none;
      border-radius: 20px;
      background: none;
      color: var(--bc-alarm);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
    }

    .bc-cylinder-card--fields {
      margin-top: 12px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
  }
</style>
