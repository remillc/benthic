<script>
  // @ts-check
  // Basic dialog of Material 3, as the Settings mock-ups draw it
  // (docs/mockups/reglages-*-android.dc.html): 28 dp corners, a 24 sp headline,
  // the content, then text buttons at the bottom right. Moved under <body> so
  // that no page transform can clip it; Escape and the system Back cancel it
  // (lib/back-button.js). On iOS the same dialog with the system's corners.

  /**
   * @type {{
   *   title: string,
   *   text?: string,
   *   oncancel: () => void,
   *   children: import('svelte').Snippet,
   *   actions: import('svelte').Snippet,
   *   class?: string,
   *   role?: 'dialog'|'alertdialog',
   *   eyebrow?: string,
   *   onclose?: () => void,
   *   closeLabel?: string,
   * }}
   */
  import { fitButtons } from '../lib/dialog-fit.js';
  import Icon from './Icon.svelte';

  let { title, text = '', oncancel, children, actions, class: extraClass = '', role = 'dialog', eyebrow = '', onclose, closeLabel = '' } = $props();

  const id = `od-dialog-${Math.random().toString(36).slice(2, 9)}`;

  /**
   * The buttons stack when they do not fit on one line (task 2026-11-14-143): measured once
   * drawn, and again when the dialog changes width (rotation, font size).
   * @param {HTMLElement} surface
   */
  function fit(surface) {
    const row = /** @type {HTMLElement|null} */ (surface.querySelector('.od-md3-dialog--actions'));
    const measure = () => fitButtons(surface, row);
    requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(surface);
    return { destroy: () => observer.disconnect() };
  }

  /** @param {HTMLElement} node */
  function portal(node) {
    const previous = /** @type {HTMLElement|null} */ (document.activeElement);
    document.body.appendChild(node);
    /** @param {Event} e */
    const cancel = (e) => {
      e.stopPropagation();
      oncancel();
    };
    node.addEventListener('od-cancel', cancel);
    // The dialog takes the focus (a screen reader reads its title); Tab then
    // reaches the selected choice, without a focus ring drawn at opening.
    queueMicrotask(() => /** @type {HTMLElement|null} */ (node.querySelector('[role="dialog"], [role="alertdialog"]'))?.focus({ preventScroll: true }));
    return {
      destroy() {
        node.removeEventListener('od-cancel', cancel);
        node.remove();
        previous?.focus?.();
      },
    };
  }

  /** @param {KeyboardEvent} e */
  function keydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      oncancel();
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="od-md3-dialog modal-in {extraClass}" use:portal onkeydown={keydown}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="od-md3-dialog--scrim" onclick={oncancel}></div>
  <div class="od-md3-dialog--surface" {role} aria-modal="true" aria-labelledby={id} tabindex="-1" use:fit>
    <!-- The wizard dialogs (the CSV import): a small line above the title and a close button at the top right. -->
    {#if eyebrow}<p class="od-md3-dialog--eyebrow">{eyebrow}</p>{/if}
    {#if onclose}
      <button type="button" class="od-md3-dialog--close" aria-label={closeLabel} onclick={onclose}><Icon name="close" size={22} /></button>
    {/if}
    <h2 {id}>{title}</h2>
    {#if text}<p class="od-md3-dialog--text">{text}</p>{/if}
    <div class="od-md3-dialog--content">{@render children()}</div>
    <div class="od-md3-dialog--actions">{@render actions()}</div>
  </div>
</div>

<style>
  @layer od.components {
    .od-md3-dialog {
      position: fixed;
      inset: 0;
      z-index: 13500;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: inherit;
    }

    .od-md3-dialog--scrim {
      position: absolute;
      inset: 0;
      background: var(--od-scrim);
    }

    .od-md3-dialog--surface {
      position: relative;
      box-sizing: border-box;
      width: min(560px, calc(100% - 48px));
      max-height: calc(100% - 96px);
      display: flex;
      flex-direction: column;
      padding: 24px 0 24px;
      border-radius: 28px;
      background: var(--od-dialog);
      color: var(--od-text);
      outline: none;
    }

    /* Android: the dialog grows in from 90 % (spatial spring) while it fades in
       (effects spring); the scrim fades in. It is removed at once on closing. */
    :global(.md) .od-md3-dialog--surface {
      animation:
        od-dialog-grow var(--od-motion-spatial-fast-ms) var(--od-motion-spatial-fast) backwards,
        od-dialog-fade var(--od-motion-effects-default-ms) var(--od-motion-effects-default) backwards;
    }

    :global(.md) .od-md3-dialog--scrim {
      animation: od-dialog-fade var(--od-motion-effects-default-ms) var(--od-motion-effects-default) backwards;
    }

    @keyframes od-dialog-grow {
      from {
        transform: scale(0.9);
      }
    }

    @keyframes od-dialog-fade {
      from {
        opacity: 0;
      }
    }

    .od-md3-dialog--eyebrow {
      margin: -4px 64px 2px 24px;
      color: var(--od-release-link);
      font-size: 12px;
      line-height: 16px;
      font-weight: 500;
      letter-spacing: 0.6px;
      text-transform: uppercase;
    }

    .od-md3-dialog--close {
      position: absolute;
      top: 16px;
      right: 16px;
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      border: none;
      border-radius: 20px;
      background: none;
      color: var(--od-text);
      cursor: pointer;

      @media (hover: hover) {
        &:hover {
          background: var(--od-release-hover);
        }
      }
    }

    h2 {
      margin: 0 24px 16px;
      font-size: 24px;
      line-height: 32px;
      font-weight: 400;
    }

    .od-md3-dialog--text {
      margin: -8px 24px 16px;
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }

    .od-md3-dialog--content {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
    }

    .od-md3-dialog--actions {
      margin: 10px 12px 0 24px;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
    }

    .od-md3-dialog--actions :global(button) {
      /* Framework7 stretches buttons: text buttons keep their own width. */
      width: auto;
      flex: none;
      height: 40px;
      padding: 0 12px;
      border: none;
      border-radius: 20px;
      background: none;
      color: var(--od-action);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      letter-spacing: 0.1px;
      white-space: nowrap;
      cursor: pointer;
    }

    .od-md3-dialog--actions :global(.od-md3-dialog--start) {
      margin-right: auto;
    }

    /* Not on one line: one per line, aligned to the end, the main action (the last) on top. */
    :global(.od-dialog-stacked) .od-md3-dialog--actions {
      flex-direction: column-reverse;
      align-items: flex-end;

      :global(button) {
        max-width: 100%;
        height: auto;
        min-height: 40px;
        padding: 10px 12px;
        line-height: 20px;
        white-space: normal;
        text-align: end;
      }

      :global(.od-md3-dialog--start) {
        margin-right: 0;
      }
    }

    :global(.ios) .od-md3-dialog--surface {
      width: min(400px, calc(100% - 48px));
      border-radius: 14px;
    }

    :global(.ios) h2 {
      font-size: 17px;
      line-height: 22px;
      font-weight: 600;
      text-align: center;
    }

    :global(.ios) .od-md3-dialog--actions :global(button) {
      font-size: 17px;
      letter-spacing: 0;
    }

    /* Mouse: the Material 3 hover layer, 8 % of the content colour over the background. */
    @media (hover: hover) and (pointer: fine) {
      .od-md3-dialog--actions :global(button) {
        transition: box-shadow 120ms linear;
      }
      .od-md3-dialog--actions :global(button:not(:disabled):hover) {
        box-shadow: inset 0 0 0 100vmax color-mix(in srgb, currentColor 8%, transparent);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .od-md3-dialog--actions :global(button) {
        transition: none;
      }
    }
  }
</style>
