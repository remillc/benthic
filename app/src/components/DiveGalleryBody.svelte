<script>
  // @ts-check
  // « Tout voir »: the gallery of a dive's photos and videos (tasks 2026-11-23-367 and 368; the mock-ups are on claude.ai
  // canvases, so this is built from the tasks' text). One component, three patterns:
  //  - Android (phone and tablet): top app bar with a back arrow, the title and « N° 5 · site · date », ⋮; a grid of square
  //    thumbnails (3 columns and 3 dp gaps on a phone, 6 columns, 4 dp gaps, 8 dp corners and 24 dp margins on a tablet); a FAB
  //    « Ajouter »; a long press selects, and the bar turns blue-tinted with ✕, the count, Partager and Retirer.
  //  - iPhone and iPad: navigation bar (back, « Sélectionner », +), a large title, the same line, 2 pt gaps; « Sélectionner »
  //    shows a circle top right and a bottom toolbar (Partager, count, trash).
  //  - Desktop: a 960 px dialog, « + Ajouter » and ✕ in the header, 5 columns, double click opens, Ctrl+click adds to the
  //    selection, Suppr removes.
  // The depth of the profile at the moment of the picture is drawn bottom left; a video has a play disc and its length.
  // Free accounts and the demo never reach it (the section is hidden). Removing asks first (the parent holds the dialog).
  import Icon from './Icon.svelte';
  import RowMenu from './RowMenu.svelte';
  import { t } from '../lib/i18n.js';
  import { ios, desktopMac, layout } from '../lib/layout.svelte.js';
  import { durationText } from '../lib/dive-media.js';
  import { cloudLine, countsText } from '../lib/dive-media-text.js';

  /**
   * @type {{
   *   items: import('../lib/dive-media.svelte.js').DiveMediaItem[],
   *   title: string,
   *   subtitle: string,
   *   depthOf: (item: import('../lib/dive-media.svelte.js').DiveMediaItem) => string,
   *   readOnly?: boolean,
   *   adding?: boolean,
   *   onclose: () => void,
   *   onopen: (index: number) => void,
   *   onadd: () => void,
   *   onshare: (hashes: string[]) => void,
   *   onremove: (hashes: string[]) => void,
   * }}
   */
  let { items, title, subtitle, depthOf, readOnly = false, adding = false, onclose, onopen, onadd, onshare, onremove } = $props();

  // The desktop pattern is the desktop app's wide window (layout.desktop); a narrow window of it follows the phone and tablet looks.
  const desk = $derived(layout.desktop);
  const variant = $derived(desk ? 'desk' : ios ? 'ios' : 'md');
  const wide = $derived(desk || !layout.phone);

  /** @type {Set<string>} */
  let selected = $state(new Set());
  let selecting = $state(false);
  /** @type {HTMLElement|undefined} */
  let more = $state();
  let menu = $state(false);
  /** @type {HTMLElement|undefined} */
  let root = $state();

  const chosen = $derived(items.filter((i) => selected.has(i.hash)));

  // Items that left (removed here or on another device) leave the selection.
  $effect(() => {
    const here = new Set(items.map((i) => i.hash));
    if ([...selected].some((h) => !here.has(h))) selected = new Set([...selected].filter((h) => here.has(h)));
    if (selecting && !desk && !items.length) selecting = false;
  });

  function stopSelecting() {
    selecting = false;
    selected = new Set();
  }

  /** @param {string} hash */
  function toggle(hash) {
    const next = new Set(selected);
    if (next.has(hash)) next.delete(hash);
    else next.add(hash);
    selected = next;
    if (!desk && !next.size && !ios) selecting = false;
  }

  /** Long press (Android, iPhone and iPad; the right click on the desktop) starts a selection. @type {ReturnType<typeof setTimeout>|undefined} */
  let timer;
  let longPressed = false;
  /** @param {string} hash */
  function press(hash) {
    longPressed = false;
    clearTimeout(timer);
    timer = setTimeout(() => {
      longPressed = true;
      selecting = true;
      if (!selected.has(hash)) selected = new Set([...selected, hash]);
    }, 450);
  }
  const release = () => clearTimeout(timer);

  /** @param {MouseEvent} event @param {number} index @param {import('../lib/dive-media.svelte.js').DiveMediaItem} item */
  function click(event, index, item) {
    if (longPressed) {
      longPressed = false;
      return;
    }
    if (desk) {
      // A click selects it alone, Ctrl (⌘) + click adds it; a double click opens (below).
      if (event.ctrlKey || event.metaKey) toggle(item.hash);
      else selected = selected.size === 1 && selected.has(item.hash) ? new Set() : new Set([item.hash]);
      return;
    }
    if (selecting) toggle(item.hash);
    else onopen(index);
  }

  /** @param {KeyboardEvent} event */
  function key(event) {
    if (!root || !root.isConnected) return;
    if (desk && (event.key === 'Delete' || event.key === 'Backspace') && selected.size && !document.querySelector('.bc-md3-dialog, .bc-media-viewer')) {
      event.preventDefault();
      onremove([...selected]);
    }
  }

  /** Back and Escape (lib/back-button.js) end a selection. @param {HTMLElement} node */
  function cancelable(node) {
    const end = () => stopSelecting();
    node.addEventListener('bc-cancel', end);
    return { destroy: () => node.removeEventListener('bc-cancel', end) };
  }

  const iosLarge = ios;
  const hint = desktopMac ? t('detail.mediaHintMac') : t('detail.mediaHint');

  /** @param {import('../lib/dive-media.svelte.js').DiveMediaItem} item @param {number} index */
  const labelOf = (item, index) => (item.kind === 'video' ? t('detail.mediaVideoLabel', { n: index + 1, duration: durationText(item.durationMs ?? 0) }) : t('detail.mediaPhotoLabel', { n: index + 1 }));

  const selectedCountText = $derived(t('detail.mediaSelectedCount', { n: selected.size }));
  const toolbarText = $derived(chosen.length ? `${countsText(chosen)} ${t('detail.mediaSelectedItems')}` : '');
</script>

<svelte:window onkeydown={key} />

  <div class="bc-dive-gallery--page" class:bc-dive-gallery--selecting={selecting || (desk && selected.size > 0)} bind:this={root} use:cancelable>
    {#if variant === 'md'}
      <header class="bc-dive-gallery--bar" class:bc-dive-gallery--bar-selecting={selecting}>
        {#if selecting}
          <button type="button" class="bc-dive-gallery--icon" aria-label={t('detail.mediaCancelSelection')} onclick={stopSelecting}><Icon name="close" size={24} weight={2} /></button>
          <h2 class="bc-dive-gallery--bar-title bc-dive-gallery--bar-count">{selectedCountText}</h2>
          <button type="button" class="bc-dive-gallery--icon" aria-label={t('detail.mediaShare')} disabled={!selected.size} onclick={() => onshare([...selected])}><Icon name="share" size={24} weight={2} /></button>
          {#if !readOnly}<button type="button" class="bc-dive-gallery--icon" aria-label={t('detail.mediaRemove')} disabled={!selected.size} onclick={() => onremove([...selected])}><Icon name="trash" size={24} weight={2} /></button>{/if}
        {:else}
          <button type="button" class="bc-dive-gallery--icon" aria-label={t('detail.mediaClose')} onclick={onclose}><Icon name="arrowBack" size={24} weight={2} /></button>
          <span class="bc-dive-gallery--bar-texts">
            <h2 class="bc-dive-gallery--bar-title">{title}</h2>
            <span class="bc-dive-gallery--bar-subtitle bc-value">{subtitle}</span>
          </span>
          <button type="button" class="bc-dive-gallery--icon" aria-label={t('detail.mediaMore')} bind:this={more} onclick={() => (menu = true)}><Icon name="more" size={24} /></button>
        {/if}
      </header>
    {:else if variant === 'ios'}
      <header class="bc-dive-gallery--nav">
        {#if selecting}
          <button type="button" class="bc-dive-gallery--nav-text" onclick={stopSelecting}>{t('dialog.cancel')}</button>
          <h2 class="bc-dive-gallery--nav-title">{selectedCountText}</h2>
          <span class="bc-dive-gallery--nav-right"></span>
        {:else}
          <button type="button" class="bc-dive-gallery--nav-back" onclick={onclose}>
            <span class="bc-dive-gallery--chevron"><Icon name="chevron" size={22} weight={2.4} /></span>
            {wide ? t('detail.mediaBackDive') : t('detail.mediaClose')}
          </button>
          <span class="bc-dive-gallery--nav-right">
            {#if items.length}<button type="button" class="bc-dive-gallery--nav-text" onclick={() => (selecting = true)}>{t('detail.mediaSelect')}</button>{/if}
            {#if !readOnly}<button type="button" class="bc-dive-gallery--nav-plus" aria-label={t('detail.mediaAddLabel')} disabled={adding} onclick={onadd}><Icon name="plus" size={24} weight={2.2} /></button>{/if}
          </span>
        {/if}
      </header>
    {:else}
      <header class="bc-dive-gallery--head">
        <span class="bc-dive-gallery--bar-texts">
          <h2 class="bc-dive-gallery--bar-title">{title}</h2>
          <span class="bc-dive-gallery--bar-subtitle bc-value">{subtitle}</span>
        </span>
        {#if selected.size}
          <button type="button" class="bc-dive-gallery--action" onclick={() => onshare([...selected])}><Icon name="share" size={20} weight={2} />{t('detail.mediaShare')}</button>
          {#if !readOnly}<button type="button" class="bc-dive-gallery--action bc-dive-gallery--action-danger" onclick={() => onremove([...selected])}><Icon name="trash" size={20} weight={2} />{t('detail.mediaRemove')}</button>{/if}
        {:else if !readOnly}
          <button type="button" class="bc-dive-gallery--add" disabled={adding} onclick={onadd}><Icon name="plus" size={20} weight={2.2} />{t('detail.mediaAdd')}</button>
        {/if}
        <button type="button" class="bc-dive-gallery--icon" aria-label={t('detail.mediaCloseEsc')} title={t('detail.mediaCloseEsc')} onclick={onclose}><Icon name="close" size={22} weight={2} /></button>
      </header>
    {/if}

    <div class="bc-dive-gallery--scroll">
      {#if iosLarge}
        <h1 class="bc-dive-gallery--large">{title}</h1>
        <p class="bc-dive-gallery--subtitle bc-value">{subtitle}</p>
      {/if}
      <p class="bc-dive-gallery--line">
        <span class="bc-dive-gallery--cloud" aria-hidden="true"><Icon name="cloudCheck" size={variant === 'ios' ? 18 : 20} weight={2} /></span>
        <span class="bc-dive-gallery--summary">{cloudLine(items)}</span>
      </p>
      <div class="bc-dive-gallery--grid" role="list">
        {#each items as item, index (item.hash)}
          {@const depth = depthOf(item)}
          {@const on = selected.has(item.hash)}
          <button
            type="button"
            class="bc-dive-gallery--cell"
            class:bc-dive-gallery--cell-on={on}
            role="listitem"
            aria-label={labelOf(item, index)}
            aria-pressed={selecting || desk ? on : undefined}
            onpointerdown={() => press(item.hash)}
            onpointerup={release}
            onpointerleave={release}
            onpointercancel={release}
            onclick={(e) => click(e, index, item)}
            ondblclick={() => desk && onopen(index)}
            oncontextmenu={(e) => {
              e.preventDefault();
              if (!selecting && !desk) {
                selecting = true;
                selected = new Set([...selected, item.hash]);
              } else if (desk && !selected.has(item.hash)) selected = new Set([item.hash]);
            }}
          >
            <span class="bc-dive-gallery--frame">
              {#if item.thumbSrc}<img class="bc-dive-gallery--thumb" src={item.thumbSrc} alt="" draggable="false" loading="lazy" />{:else}<span class="bc-dive-gallery--none"><Icon name="image" size={28} weight={2} /></span>{/if}
              {#if item.kind === 'video'}
                <span class="bc-dive-gallery--play" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg></span>
                {#if item.durationMs}<span class="bc-dive-gallery--duration">{durationText(item.durationMs)}</span>{/if}
              {/if}
              {#if depth}<span class="bc-dive-gallery--depth bc-value" aria-label={t('detail.mediaDepthAt', { depth })}>{depth}</span>{/if}
            </span>
            {#if selecting || (desk && on)}
              <span class="bc-dive-gallery--mark" class:bc-dive-gallery--mark-on={on} aria-hidden="true">{#if on}<Icon name="check" size={16} weight={3} />{/if}</span>
            {/if}
          </button>
        {/each}
      </div>
      {#if desk}<p class="bc-dive-gallery--hint">{hint}</p>{/if}
      <div class="bc-dive-gallery--room" aria-hidden="true"></div>
    </div>

    {#if variant === 'md' && !selecting && !readOnly}
      <button type="button" class="bc-dive-gallery--fab" aria-label={t('detail.mediaAddLabel')} disabled={adding} onclick={onadd}><Icon name="plus" size={24} weight={2} /></button>
    {/if}

    {#if variant === 'ios' && selecting}
      <footer class="bc-dive-gallery--toolbar">
        <button type="button" class="bc-dive-gallery--tool" aria-label={t('detail.mediaShare')} disabled={!selected.size} onclick={() => onshare([...selected])}><Icon name="share" size={24} weight={1.8} /></button>
        <span class="bc-dive-gallery--tool-text">{toolbarText}</span>
        {#if !readOnly}<button type="button" class="bc-dive-gallery--tool" aria-label={t('detail.mediaRemove')} disabled={!selected.size} onclick={() => onremove([...selected])}><Icon name="trash" size={24} weight={1.8} /></button>{:else}<span class="bc-dive-gallery--tool"></span>{/if}
      </footer>
    {/if}
  </div>

{#if menu && more}
  <RowMenu
    anchor={more}
    label={t('detail.mediaMore')}
    options={[
      { value: 'select', label: t('detail.mediaSelect') },
      ...(readOnly ? [] : [{ value: 'add', label: t('detail.mediaAddLabel') }]),
    ]}
    value=""
    onselect={(value) => {
      if (value === 'select') selecting = true;
      else onadd();
    }}
    onclose={() => (menu = false)}
  />
{/if}

<style>
  @layer bc.components {
    :global(.bc-dive-gallery) {
      background: var(--bc-background);
      color: var(--bc-text);
    }

    .bc-dive-gallery--page {
      position: relative;
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      --gallery-columns: 3;
      --gallery-gap: 3px;
      --gallery-margin: 0px;
      --gallery-radius: 0px;
    }

    .bc-dive-gallery--scroll {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
    }

    /* ---------- Android bar ---------- */
    .bc-dive-gallery--bar {
      display: flex;
      align-items: center;
      gap: 4px;
      min-height: 64px;
      padding: var(--f7-safe-area-top, 0px) 4px 0 4px;
      box-sizing: content-box;
      background: var(--bc-background);
      color: var(--bc-text);
    }

    .bc-dive-gallery--bar-selecting {
      background: var(--bc-media-select-bar);
    }

    .bc-dive-gallery--icon {
      flex: none;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      border: 0;
      border-radius: 50%;
      background: none;
      color: inherit;
      padding: 0;
    }

    .bc-dive-gallery--icon:disabled {
      opacity: 0.4;
    }

    .bc-dive-gallery--bar-texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .bc-dive-gallery--bar-title {
      margin: 0;
      font-family: var(--bc-title-font);
      font-size: 22px;
      line-height: 28px;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .bc-dive-gallery--bar-count {
      flex: 1;
      font-size: 20px;
    }

    .bc-dive-gallery--bar-subtitle {
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* ---------- iOS navigation bar and large title ---------- */
    .bc-dive-gallery--nav {
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 44px;
      padding: var(--f7-safe-area-top, 0px) 8px 0 8px;
      box-sizing: content-box;
      color: var(--bc-text);
    }

    .bc-dive-gallery--nav-title {
      margin: 0;
      font-size: 17px;
      font-weight: 600;
    }

    .bc-dive-gallery--nav-back,
    .bc-dive-gallery--nav-text,
    .bc-dive-gallery--nav-plus {
      display: inline-flex;
      align-items: center;
      min-height: 44px;
      border: 0;
      background: none;
      padding: 0 8px;
      color: var(--bc-secondary);
      font-size: 17px;
    }

    .bc-dive-gallery--chevron {
      display: flex;
      transform: scaleX(-1);
      margin-right: 2px;
    }

    .bc-dive-gallery--nav-right {
      display: flex;
      align-items: center;
    }

    .bc-dive-gallery--large {
      margin: 0;
      padding: 4px 16px 0;
      font-size: 34px;
      line-height: 41px;
      font-weight: 700;
    }

    .bc-dive-gallery--subtitle {
      margin: 0;
      padding: 0 16px;
      font-size: 15px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    /* ---------- Desktop dialog ---------- */
    /* 960 px over the window, 28 px corners. Framework7 centres a tablet popup with half-size margins and animates its transform,
       so the size is set with the margins that follow it (the transform is left alone: the popup's closing waits for it). */
    :global(.bc-dive-gallery--dialog.popup) {
      --bc-gallery-width: min(960px, calc(100vw - 48px));
      --bc-gallery-height: min(720px, calc(100vh - 64px));
      width: var(--bc-gallery-width);
      height: var(--bc-gallery-height);
      margin-left: calc(var(--bc-gallery-width) / -2);
      margin-top: calc(var(--bc-gallery-height) / -2);
      border-radius: 28px;
      overflow: hidden;
    }

    .bc-dive-gallery--head {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 20px 20px 8px 28px;
    }

    .bc-dive-gallery--add,
    .bc-dive-gallery--action {
      display: inline-flex;
      flex: none;
      width: auto;
      align-items: center;
      gap: 8px;
      height: 40px;
      padding: 0 20px 0 16px;
      border: 0;
      border-radius: 20px;
      font: inherit;
      font-weight: 500;
    }

    .bc-dive-gallery--add {
      background: var(--bc-primary);
      color: var(--bc-on-primary, #fff);
    }

    .bc-dive-gallery--action {
      background: var(--bc-surface-2);
      color: var(--bc-text);
    }

    .bc-dive-gallery--action-danger {
      color: var(--bc-alarm);
    }

    .bc-dive-gallery--hint {
      margin: 12px 28px 0;
      font-size: 13px;
      color: var(--bc-text-2);
    }

    /* ---------- The cloud line and the grid ---------- */
    .bc-dive-gallery--line {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
      padding: 12px 16px;
      font-size: 14px;
      line-height: 20px;
    }

    :global(.bc-dive-gallery--ios) .bc-dive-gallery--line {
      font-size: 13px;
    }

    :global(.bc-dive-gallery--dialog) .bc-dive-gallery--line {
      padding: 4px 28px 12px;
    }

    .bc-dive-gallery--cloud {
      display: flex;
      color: var(--bc-release-ok);
    }

    .bc-dive-gallery--summary {
      min-width: 0;
    }

    .bc-dive-gallery--grid {
      display: grid;
      grid-template-columns: repeat(var(--gallery-columns), minmax(0, 1fr));
      gap: var(--gallery-gap);
      padding: 0 var(--gallery-margin);
    }

    :global(.bc-dive-gallery--ios) .bc-dive-gallery--page {
      --gallery-gap: 2px;
    }

    :global(.bc-dive-gallery--dialog) .bc-dive-gallery--page {
      --gallery-columns: 5;
      --gallery-gap: 6px;
      --gallery-margin: 28px;
      --gallery-radius: 8px;
    }

    @media (min-width: 768px) {
      :global(.bc-dive-gallery--md) .bc-dive-gallery--page,
      :global(.bc-dive-gallery--ios) .bc-dive-gallery--page {
        --gallery-columns: 6;
      }

      :global(.bc-dive-gallery--md) .bc-dive-gallery--page {
        --gallery-gap: 4px;
        --gallery-margin: 24px;
        --gallery-radius: 8px;
      }

      :global(.bc-dive-gallery--md) .bc-dive-gallery--line {
        padding-left: 24px;
        padding-right: 24px;
      }
    }

    .bc-dive-gallery--cell {
      position: relative;
      display: block;
      aspect-ratio: 1;
      border: 0;
      padding: 0;
      background: none;
      color: var(--bc-text-2);
      touch-action: manipulation;
      -webkit-touch-callout: none;
      user-select: none;
    }

    .bc-dive-gallery--frame {
      position: absolute;
      inset: 0;
      overflow: hidden;
      border-radius: var(--gallery-radius);
      background: var(--bc-surface-2);
      transition:
        transform 200ms cubic-bezier(0.2, 0, 0, 1),
        border-radius 200ms cubic-bezier(0.2, 0, 0, 1);
    }

    .bc-dive-gallery--cell-on .bc-dive-gallery--frame {
      transform: scale(0.86);
      border-radius: 12px;
    }

    :global(.bc-dive-gallery--ios) .bc-dive-gallery--cell-on .bc-dive-gallery--frame {
      transform: none;
      border-radius: 0;
      outline: 3px solid var(--bc-secondary);
      outline-offset: -3px;
    }

    .bc-dive-gallery--thumb {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      pointer-events: none;
    }

    .bc-dive-gallery--none {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
    }

    /* Drawn over the picture: white on a shadow, in both themes. */
    .bc-dive-gallery--depth {
      position: absolute;
      left: 6px;
      bottom: 4px;
      color: #fff;
      font-size: 12px;
      line-height: 16px;
      font-weight: 600;
      text-shadow: 0 1px 3px rgb(0 0 0 / 70%);
    }

    .bc-dive-gallery--play {
      position: absolute;
      top: 50%;
      left: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      margin: -16px 0 0 -16px;
      border-radius: 50%;
      background: rgb(0 0 0 / 55%);
      color: #fff;
    }

    .bc-dive-gallery--duration {
      position: absolute;
      right: 5px;
      bottom: 4px;
      padding: 0 5px;
      border-radius: 6px;
      background: rgb(0 0 0 / 60%);
      color: #fff;
      font-size: 11px;
      line-height: 16px;
      font-variant-numeric: tabular-nums;
    }

    /* The circle of a selection, top left (top right on iOS); filled with a check once chosen. */
    .bc-dive-gallery--mark {
      position: absolute;
      top: 6px;
      left: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      box-sizing: border-box;
      border: 2px solid #fff;
      border-radius: 50%;
      background: rgb(0 0 0 / 22%);
      color: #fff;
      box-shadow: 0 0 2px rgb(0 0 0 / 50%);
    }

    :global(.bc-dive-gallery--ios) .bc-dive-gallery--mark {
      left: auto;
      right: 6px;
    }

    .bc-dive-gallery--mark-on {
      border-color: #fff;
      background: var(--bc-media-check);
    }

    :global(.bc-dive-gallery--ios) .bc-dive-gallery--mark-on {
      background: var(--bc-secondary);
    }

    .bc-dive-gallery--room {
      height: 96px;
    }

    :global(.bc-dive-gallery--ios) .bc-dive-gallery--room,
    :global(.bc-dive-gallery--dialog) .bc-dive-gallery--room {
      height: calc(24px + var(--f7-safe-area-bottom, 0px));
    }

    /* ---------- The FAB ---------- */
    .bc-dive-gallery--fab {
      position: absolute;
      right: calc(16px + var(--f7-safe-area-right, 0px));
      bottom: calc(16px + var(--f7-safe-area-bottom, 0px));
      display: flex;
      align-items: center;
      justify-content: center;
      width: 56px;
      height: 56px;
      border: 0;
      border-radius: 16px;
      background: var(--bc-media-fab);
      color: var(--bc-text);
      box-shadow:
        0 1px 3px rgb(0 0 0 / 30%),
        0 4px 8px 3px rgb(0 0 0 / 15%);
    }

    @media (min-width: 768px) {
      .bc-dive-gallery--fab {
        right: calc(24px + var(--f7-safe-area-right, 0px));
        bottom: calc(24px + var(--f7-safe-area-bottom, 0px));
      }
    }

    .bc-dive-gallery--fab:disabled {
      opacity: 0.5;
    }

    /* ---------- iOS bottom toolbar ---------- */
    .bc-dive-gallery--toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 44px;
      padding: 0 8px calc(var(--f7-safe-area-bottom, 0px));
      box-sizing: content-box;
      border-top: 0.5px solid var(--bc-outline);
      background: var(--bc-surface);
    }

    .bc-dive-gallery--tool {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      border: 0;
      background: none;
      color: var(--bc-secondary);
    }

    .bc-dive-gallery--tool:disabled {
      opacity: 0.4;
    }

    .bc-dive-gallery--tool-text {
      font-size: 13px;
      font-weight: 600;
    }
  }
</style>
