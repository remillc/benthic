<script>
  // @ts-check
  // « Tout voir »: the gallery of a dive's photos and videos (task 2026-11-23-359; no mock-up in the repository). A grid of the
  // thumbnails; a tap opens the original, downloaded first when this device does not hold it (« À la demande »), with its
  // own reason when it cannot be (offline, not yet on the server).
  import { Popup } from 'framework7-svelte';
  import Icon from './Icon.svelte';
  import { t } from '../lib/i18n.js';
  import { openOriginal } from '../lib/dive-media.svelte.js';
  import { durationText } from '../lib/dive-media.js';

  /** @type {{ items: import('../lib/dive-media.svelte.js').DiveMediaItem[], onclose: () => void }} */
  let { items, onclose } = $props();

  /** @type {{ item: import('../lib/dive-media.svelte.js').DiveMediaItem, src: string }|null} */
  let open = $state(null);
  let loading = $state('');
  let problem = $state('');

  /** @param {import('../lib/dive-media.svelte.js').DiveMediaItem} item */
  async function show(item) {
    problem = '';
    loading = item.hash;
    try {
      open = { item, src: await openOriginal(item) };
    } catch (e) {
      problem = String(/** @type {any} */ (e)?.message) === 'NOT_ON_SERVER' ? t('detail.mediaNotOnServer') : t('detail.mediaOffline');
    } finally {
      loading = '';
    }
  }
</script>

<Popup class="bc-dive-gallery" opened onPopupClosed={onclose} closeByBackdropClick aria-label={t('detail.mediaGallery')}>
  <div class="bc-dive-gallery--page">
    <header class="bc-dive-gallery--bar">
      <h2 class="bc-dive-gallery--title">{t('detail.mediaGallery')}</h2>
      <button type="button" class="bc-dive-gallery--close" aria-label={t('detail.mediaClose')} onclick={() => (open ? (open = null) : onclose())}>
        <Icon name="close" size={22} weight={2} />
      </button>
    </header>
    {#if problem}<p class="bc-dive-gallery--problem" role="alert">{problem}</p>{/if}
    {#if open}
      <div class="bc-dive-gallery--viewer">
        {#if open.item.kind === 'video'}
          <!-- svelte-ignore a11y_media_has_caption -->
          <video class="bc-dive-gallery--original" src={open.src} controls playsinline></video>
        {:else}
          <img class="bc-dive-gallery--original" src={open.src} alt="" />
        {/if}
      </div>
    {:else}
      <div class="bc-dive-gallery--grid">
        {#each items as item (item.hash)}
          <button type="button" class="bc-dive-gallery--cell" class:bc-dive-gallery--loading={loading === item.hash} onclick={() => show(item)}>
            {#if item.thumbSrc}<img class="bc-dive-gallery--thumb" src={item.thumbSrc} alt="" />{:else}<span class="bc-dive-gallery--none"><Icon name="image" size={28} weight={2} /></span>{/if}
            {#if item.kind === 'video' && item.durationMs}<span class="bc-dive-gallery--duration">{durationText(item.durationMs)}</span>{/if}
            <span class="bc-dive-gallery--where">{item.hasOriginal ? t('detail.mediaOnDevice') : t('detail.mediaInCloud')}</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</Popup>

<style>
  @layer bc.components {
    :global(.bc-dive-gallery) {
      background: var(--bc-background);
      color: var(--bc-text);
    }

    .bc-dive-gallery--page {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .bc-dive-gallery--bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: calc(var(--f7-safe-area-top, 0px) + 12px) 16px 12px;
    }

    .bc-dive-gallery--title {
      margin: 0;
      font-family: var(--bc-title-font);
      font-size: 18px;
      font-weight: 600;
    }

    .bc-dive-gallery--close {
      width: 44px;
      height: 44px;
      border: 0;
      border-radius: 50%;
      background: none;
      color: inherit;
    }

    .bc-dive-gallery--problem {
      margin: 0 16px 8px;
      color: var(--bc-text-2);
    }

    .bc-dive-gallery--grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
      gap: 6px;
      padding: 0 12px calc(var(--f7-safe-area-bottom, 0px) + 12px);
      overflow-y: auto;
    }

    .bc-dive-gallery--cell {
      position: relative;
      aspect-ratio: 1;
      border: 0;
      border-radius: 12px;
      padding: 0;
      overflow: hidden;
      background: var(--bc-surface-2);
      color: var(--bc-text-2);
    }

    .bc-dive-gallery--loading {
      opacity: 0.5;
    }

    .bc-dive-gallery--thumb {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .bc-dive-gallery--none {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
    }

    .bc-dive-gallery--duration,
    .bc-dive-gallery--where {
      position: absolute;
      padding: 1px 6px;
      border-radius: 6px;
      background: rgb(0 0 0 / 60%);
      color: #fff;
      font-size: 11px;
      line-height: 16px;
    }

    .bc-dive-gallery--duration {
      right: 4px;
      bottom: 4px;
    }

    .bc-dive-gallery--where {
      left: 4px;
      top: 4px;
    }

    .bc-dive-gallery--viewer {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 0;
      padding: 0 12px calc(var(--f7-safe-area-bottom, 0px) + 12px);
    }

    .bc-dive-gallery--original {
      max-width: 100%;
      max-height: 100%;
      border-radius: 12px;
    }
  }
</style>
