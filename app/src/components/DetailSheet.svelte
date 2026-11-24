<script>
  // @ts-check
  // The sheet a grey field of the phone's dive detail opens (tasks 2026-11-24-386 and 387; mock-up
  // detail-onglets-feuille-site-android): an MD3 modal bottom sheet (a page sheet on iPhone) with a drag handle, its
  // title and « Annuler », a search field when the list is long, the list with the current value checked and
  // highlighted, and « Nouveau … » at the bottom when one can be created. Choosing a row calls `onselect` and closes
  // the sheet: a field of the detail saves at once, so there is no OK button. Moved under <body> like the other
  // sheets; Escape, the scrim and the system Back close it (lib/back-button.js).
  import Icon from './Icon.svelte';
  import { ios } from '../lib/layout.svelte.js';
  import { t } from '../lib/i18n.js';
  import { reducedMotion } from '../lib/reduced-motion.js';
  import { dismissesSheet, sheetOffset } from '../lib/sheet-drag.js';
  import { filterSheetOptions } from '../lib/detail-pick.js';

  /**
   * `options`: the rows (`example` is a second line, `icon` an icon name, `divider` a line above the row). `value`: the
   * current one. `search`: show the search field (the caller decides: the list is long). `newLabel`: « Ajouter « {name} »
   * comme nouveau… », or empty when nothing can be created; the search text becomes the new value.
   * @type {{
   *   title: string,
   *   options: { value: string, label: string, example?: string, icon?: string, divider?: boolean }[],
   *   value: string,
   *   search?: boolean,
   *   newLabel?: string,
   *   onselect: (value: string) => void,
   *   onclose: () => void,
   * }}
   */
  let { title, options, value, search = false, newLabel = '', onselect, onclose } = $props();

  const id = `bc-detail-sheet-${Math.random().toString(36).slice(2, 9)}`;
  let query = $state('');
  const shown = $derived(filterSheetOptions(options, query));
  const typedNew = $derived(query.trim() && newLabel && !options.some((o) => o.label.toLocaleLowerCase() === query.trim().toLocaleLowerCase()) ? query.trim() : '');

  /** @param {HTMLElement} node */
  function portal(node) {
    const previous = /** @type {HTMLElement|null} */ (document.activeElement);
    document.body.appendChild(node);
    /** @param {Event} e */
    const cancel = (e) => {
      e.stopPropagation();
      dismiss();
    };
    node.addEventListener('bc-cancel', cancel);
    queueMicrotask(() => /** @type {HTMLElement|null} */ (node.querySelector('[role="dialog"]'))?.focus({ preventScroll: true }));
    return {
      destroy() {
        node.removeEventListener('bc-cancel', cancel);
        node.remove();
        previous?.focus?.();
      },
    };
  }

  /** @param {KeyboardEvent} e */
  function keydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      dismiss();
    }
  }

  /** @type {HTMLElement|undefined} */
  let surface = $state();
  let surfaceHeight = $state(0);
  let offset = $state(0);
  let dragging = $state(false);
  let leaving = $state(false);
  let moved = false;
  let startY = 0;
  let lastY = 0;
  let lastT = 0;
  let velocity = 0;

  function dismiss() {
    if (leaving) return;
    if (reducedMotion() || !surface) {
      onclose();
      return;
    }
    leaving = true;
    offset = surface.offsetHeight;
    setTimeout(onclose, 200);
  }

  /** @param {string} v */
  function choose(v) {
    onselect(v);
    onclose();
  }

  /** The handle's touches stay its own (see CylinderSheet). @param {HTMLElement} node */
  function ownTouches(node) {
    /** @param {TouchEvent} e */
    const stop = (e) => e.stopPropagation();
    const kinds = /** @type {const} */ (['touchstart', 'touchmove', 'touchend', 'touchcancel']);
    for (const kind of kinds) node.addEventListener(kind, stop, { passive: true });
    return {
      destroy() {
        for (const kind of kinds) node.removeEventListener(kind, stop);
      },
    };
  }

  /** @param {PointerEvent} e */
  function dragStart(e) {
    if (leaving) return;
    /** @type {HTMLElement} */ (e.currentTarget).setPointerCapture(e.pointerId);
    dragging = true;
    moved = false;
    surfaceHeight = surface?.offsetHeight ?? 0;
    startY = lastY = e.clientY;
    lastT = e.timeStamp;
    velocity = 0;
  }

  /** @param {PointerEvent} e */
  function dragMove(e) {
    if (!dragging) return;
    const dy = e.clientY - startY;
    if (Math.abs(dy) > 6) moved = true;
    const dt = e.timeStamp - lastT;
    if (dt > 0) velocity = (e.clientY - lastY) / dt;
    lastY = e.clientY;
    lastT = e.timeStamp;
    offset = sheetOffset(dy);
  }

  /** @param {PointerEvent} e */
  function dragEnd(e) {
    if (!dragging) return;
    dragging = false;
    if (moved && dismissesSheet(e.clientY - startY, velocity, surfaceHeight)) dismiss();
    else offset = 0;
    setTimeout(() => (moved = false), 0);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="bc-detail-sheet modal-in" class:bc-detail-sheet--ios={ios} use:portal onkeydown={keydown}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="bc-detail-sheet--scrim" onclick={dismiss} style:opacity={dragging ? 1 - Math.min(1, Math.max(0, offset) / (surfaceHeight || 1)) : undefined}></div>
  <div
    class="bc-detail-sheet--surface"
    class:bc-detail-sheet--dragging={dragging}
    role="dialog"
    aria-modal="true"
    aria-labelledby={id}
    tabindex="-1"
    bind:this={surface}
    style:transform={offset ? `translateY(${offset}px)` : undefined}
  >
    <button type="button" class="bc-detail-sheet--grab" aria-label={t('dialog.close')} onclick={() => !moved && dismiss()} onpointerdown={dragStart} onpointermove={dragMove} onpointerup={dragEnd} onpointercancel={dragEnd} use:ownTouches>
      <span class="bc-detail-sheet--handle" aria-hidden="true"></span>
    </button>
    <div class="bc-detail-sheet--head">
      <h2 {id} class="bc-detail-sheet--title">{title}</h2>
      <button type="button" class="bc-detail-sheet--cancel" onclick={dismiss}>{t('dialog.cancel')}</button>
    </div>
    {#if search}
      <div class="bc-detail-sheet--search">
        <Icon name="search" size={20} />
        <input type="search" class="bc-detail-sheet--search-input" placeholder={t('desktopDetail.sheetSearch')} aria-label={t('desktopDetail.sheetSearch')} bind:value={query} />
      </div>
    {/if}
    <ul class="bc-detail-sheet--list" role="listbox" aria-label={title}>
      {#each shown as option (option.value)}
        {#if option.divider}<li class="bc-detail-sheet--divider" role="separator"></li>{/if}
        <li role="option" aria-selected={option.value === value}>
          <button type="button" class="bc-detail-sheet--row" class:bc-detail-sheet--current={option.value === value} data-value={option.value} onclick={() => choose(option.value)}>
            {#if option.icon}<Icon name={/** @type {any} */ (option.icon)} size={22} />{/if}
            <span class="bc-detail-sheet--texts">
              <span class="bc-detail-sheet--label">{option.label}</span>
              {#if option.example}<span class="bc-detail-sheet--example">{option.example}</span>{/if}
            </span>
            {#if option.value === value}<Icon name="check" size={22} />{/if}
          </button>
        </li>
      {/each}
      {#if !shown.length && !typedNew}<li class="bc-detail-sheet--empty">{t('desktopDetail.sheetNone')}</li>{/if}
    </ul>
    {#if typedNew}
      <button type="button" class="bc-detail-sheet--new" onclick={() => choose(typedNew)}><Icon name="plus" size={20} />{newLabel.replace('{name}', typedNew)}</button>
    {/if}
  </div>
</div>

<style>
  @layer bc.components {
    .bc-detail-sheet {
      position: fixed;
      inset: 0;
      z-index: 13400;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      font-family: inherit;
    }

    .bc-detail-sheet--scrim {
      position: absolute;
      inset: 0;
      background: var(--bc-scrim);
    }

    .bc-detail-sheet--surface {
      position: relative;
      box-sizing: border-box;
      width: min(640px, 100%);
      max-height: calc(100% - 48px);
      display: flex;
      flex-direction: column;
      padding: 8px 0 calc(16px + var(--f7-safe-area-bottom, 0px));
      border-radius: 28px 28px 0 0;
      background: var(--bc-dialog);
      color: var(--bc-text);
      outline: none;
      transition: transform 0.2s var(--bc-motion-spatial-fast, ease-out);
      animation: bc-detail-sheet-rise var(--bc-motion-spatial-default-ms, 300ms) var(--bc-motion-spatial-default, ease-out) backwards;

      &.bc-detail-sheet--dragging {
        transition: none;
      }
    }

    @keyframes bc-detail-sheet-rise {
      from {
        transform: translateY(100%);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .bc-detail-sheet--surface {
        transition: none;
        animation: none;
      }
    }

    .bc-detail-sheet--ios .bc-detail-sheet--surface {
      border-radius: 14px 14px 0 0;
      background: var(--bc-background);
    }

    .bc-detail-sheet--grab {
      flex: none;
      align-self: center;
      width: 96px;
      height: 36px;
      margin: -8px 0 0;
      padding: 0;
      border: none;
      background: none;
      display: flex;
      align-items: center;
      justify-content: center;
      touch-action: none;
      cursor: grab;
    }

    .bc-detail-sheet--handle {
      width: 32px;
      height: 4px;
      border-radius: 2px;
      background: var(--bc-text-2);
      opacity: 0.4;
    }

    .bc-detail-sheet--head {
      flex: none;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0 24px;
    }

    .bc-detail-sheet--title {
      flex: 1;
      min-width: 0;
      margin: 0;
      font-size: 22px;
      line-height: 28px;
      font-weight: 500;
    }

    .bc-detail-sheet--cancel {
      width: auto;
      flex: none;
      height: 40px;
      padding: 0 12px;
      border: none;
      border-radius: 20px;
      background: none;
      color: var(--bc-text);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
    }

    .bc-detail-sheet--search {
      flex: none;
      margin: 12px 16px 0;
      height: 48px;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0 16px;
      border-radius: 24px;
      background: var(--bc-surface-container-highest);
      color: var(--bc-text-2);
    }

    .bc-detail-sheet--search-input {
      flex: 1;
      min-width: 0;
      height: 100%;
      border: 0;
      outline: 0;
      background: none;
      color: var(--bc-text);
      font: inherit;
      font-size: 16px;
    }

    .bc-detail-sheet--list {
      flex: 1;
      min-height: 0;
      margin: 8px 0 0;
      padding: 0 8px;
      list-style: none;
      overflow-y: auto;
      overscroll-behavior: contain;
    }

    .bc-detail-sheet--divider {
      height: 1px;
      margin: 8px 16px;
      background: var(--bc-separator);
    }

    .bc-detail-sheet--row {
      box-sizing: border-box;
      width: 100%;
      min-height: 56px;
      padding: 8px 16px;
      border: 0;
      border-radius: 16px;
      background: none;
      color: var(--bc-text);
      font: inherit;
      text-align: start;
      display: flex;
      align-items: center;
      gap: 12px;
      cursor: pointer;

      &.bc-detail-sheet--current {
        background: var(--bc-surface-container-highest);
      }
    }

    .bc-detail-sheet--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .bc-detail-sheet--label {
      font-size: 16px;
      line-height: 24px;
    }

    .bc-detail-sheet--current .bc-detail-sheet--label {
      font-weight: 600;
    }

    .bc-detail-sheet--example {
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    .bc-detail-sheet--empty {
      padding: 16px;
      color: var(--bc-text-2);
    }

    .bc-detail-sheet--new {
      flex: none;
      width: auto;
      margin: 4px 16px 0;
      min-height: 48px;
      padding: 0 16px;
      border: 0;
      border-radius: 24px;
      background: none;
      color: var(--bc-on-table-selected);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
    }
  }
</style>
