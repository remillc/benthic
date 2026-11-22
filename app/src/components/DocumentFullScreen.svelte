<script>
  // @ts-check
  // A card or a page full screen (task 2026-11-19-309, docs/mockups/doc-plein-ecran-android.dc.html): the image large on the
  // viewer's dark ground, its title and line on top, the brightness at maximum while it is open (the plugin's
  // `keepScreenAwake`, the same as the QR sending screen), and a touch on the card shows the next side (the back of a
  // card, the next page).
  import { onDestroy, onMount } from 'svelte';
  import { BenthicCore } from 'benthic-core';
  import Icon from './Icon.svelte';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   images: { url: string, label: string }[],
   *   title: string,
   *   line?: string,
   *   start?: number,
   *   onclose: () => void,
   * }}
   */
  let { images, title, line = '', start = 0, onclose } = $props();

  let index = $state(0);
  const current = $derived(images[index] ?? images[0]);

  onMount(() => {
    index = start;
    BenthicCore.keepScreenAwake({ on: true }).catch(() => {});
  });
  onDestroy(() => {
    BenthicCore.keepScreenAwake({ on: false }).catch(() => {});
  });

  function next() {
    if (images.length > 1) index = (index + 1) % images.length;
  }

  /** @param {KeyboardEvent} e */
  function key(e) {
    if (e.key === 'Escape') onclose();
  }
</script>

<svelte:window onkeydown={key} />

<div class="bc-doc-full" role="dialog" aria-modal="true" aria-label={title}>
  <div class="bc-doc-full--top">
    <span class="bc-doc-full--texts">
      <span class="bc-doc-full--title">{title}</span>
      {#if line}<span class="bc-doc-full--line">{line}</span>{/if}
    </span>
    <button type="button" class="bc-doc-full--close" onclick={onclose} aria-label={t('docs.full.close')}><Icon name="close" /></button>
  </div>
  <button type="button" class="bc-doc-full--image" onclick={next} aria-label={current?.label}>
    {#if current}<img src={current.url} alt={current.label} />{/if}
  </button>
  <p class="bc-doc-full--hint">{images.length > 1 ? t('docs.full.hint') : t('docs.full.hintOne')}</p>
</div>

<style>
  @layer od.components {
    .bc-doc-full {
      position: fixed;
      inset: 0;
      z-index: 20000;
      display: flex;
      flex-direction: column;
      background: var(--bc-viewer);
      color: var(--bc-viewer-on);
    }

    .bc-doc-full--top {
      padding: calc(12px + var(--bc-safe-top, 0px)) 8px 8px 20px;
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }

    .bc-doc-full--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .bc-doc-full--title {
      font-size: 18px;
      line-height: 24px;
      font-weight: 600;
    }

    .bc-doc-full--line {
      font-size: 14px;
      line-height: 20px;
      opacity: 0.8;
    }

    .bc-doc-full--close {
      flex: none;
      width: 48px;
      height: 48px;
      border: none;
      border-radius: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bc-viewer-control);
      color: var(--bc-viewer-on);
    }

    .bc-doc-full--image {
      flex: 1;
      min-height: 0;
      padding: 8px 16px;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      background: none;
      & img {
        max-width: 100%;
        max-height: 100%;
        border-radius: 12px;
        object-fit: contain;
      }
    }

    .bc-doc-full--hint {
      margin: 0;
      padding: 8px 24px calc(16px + var(--bc-safe-bottom, 0px));
      text-align: center;
      font-size: 13px;
      line-height: 18px;
      opacity: 0.8;
    }
  }
</style>
