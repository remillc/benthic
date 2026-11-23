<script>
  // @ts-check
  // « Photos et vidéos » of the dive detail, for a Benthic+ account (task 2026-11-23-359; no mock-up in the repository: built from the
  // task's text): a row of 76 dp square thumbnails that scrolls sideways (photos, then videos with a play disc and their length at
  // the bottom right), a dashed « Ajouter » tile, then under the row the green cloud line « 3 photos et 1 vidéo, sur tous vos
  // appareils » and « Tout voir », which opens the dive's gallery. The free version and the demo logbook never get this component.
  import Icon from './Icon.svelte';
  import DiveGallery from './DiveGallery.svelte';
  import { t } from '../lib/i18n.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { addDiveMedia, loadDiveMedia, mediaState, runMediaSync } from '../lib/dive-media.svelte.js';
  import { countsOf, durationText } from '../lib/dive-media.js';

  /** @type {{ diveId: string, readOnly?: boolean }} */
  let { diveId, readOnly = false } = $props();

  /** @type {import('../lib/dive-media.svelte.js').DiveMediaItem[]} */
  let items = $state([]);
  let adding = $state(false);
  let gallery = $state(false);
  /** @type {HTMLInputElement|undefined} */
  let input = $state();

  $effect(() => {
    // Read again when a sync or a download changed something.
    void mediaState.rev;
    const id = diveId;
    let current = true;
    loadDiveMedia(id).then((list) => {
      if (current) items = list;
    }, () => {});
    return () => {
      current = false;
    };
  });

  // The transfers wait for a quiet moment; opening a dive is one.
  $effect(() => {
    void diveId;
    runMediaSync();
  });

  const counts = $derived(countsOf(items));
  const summary = $derived.by(() => {
    if (!items.length) return t('detail.mediaEmpty');
    const photos = counts.photos ? t('detail.mediaPhotos', { n: counts.photos }) : '';
    const videos = counts.videos ? t('detail.mediaVideos', { n: counts.videos }) : '';
    return t('detail.mediaSynced', { counts: photos && videos ? t('detail.mediaBoth', { photos, videos }) : photos || videos });
  });
  // Photos first, then videos (the order of the row).
  const ordered = $derived([...items.filter((i) => i.kind === 'photo'), ...items.filter((i) => i.kind === 'video')]);

  /** @param {Event} event */
  async function chosen(event) {
    const target = /** @type {HTMLInputElement} */ (event.currentTarget);
    const files = [...(target.files ?? [])];
    target.value = '';
    if (!files.length) return;
    adding = true;
    try {
      await addDiveMedia(diveId, files);
    } catch (e) {
      console.error('Adding photos and videos', e);
      showSnackbar(t('detail.mediaAddFailed'));
    } finally {
      adding = false;
    }
  }

  /** @param {import('../lib/dive-media.svelte.js').DiveMediaItem} item @param {number} index */
  const labelOf = (item, index) =>
    item.kind === 'video' ? t('detail.mediaVideoLabel', { n: index + 1, duration: durationText(item.durationMs ?? 0) }) : t('detail.mediaPhotoLabel', { n: index + 1 });
</script>

<section class="bc-dive-media">
  <h2 class="bc-dive-media--title">{t('detail.photos')}</h2>
  <div class="bc-dive-media--card">
    <div class="bc-dive-media--row" role="list">
      {#each ordered as item, index (item.hash)}
        <button type="button" class="bc-dive-media--tile" role="listitem" aria-label={labelOf(item, index)} onclick={() => (gallery = true)}>
          {#if item.thumbSrc}
            <img class="bc-dive-media--image" src={item.thumbSrc} alt="" loading="lazy" />
          {:else}
            <span class="bc-dive-media--placeholder" aria-hidden="true"><Icon name="image" size={24} weight={2} /></span>
          {/if}
          {#if item.kind === 'video'}
            <span class="bc-dive-media--play" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            </span>
            {#if item.durationMs}<span class="bc-dive-media--duration">{durationText(item.durationMs)}</span>{/if}
          {/if}
        </button>
      {/each}
      {#if !readOnly}
        <button type="button" class="bc-dive-media--add" role="listitem" aria-label={t('detail.mediaAddLabel')} disabled={adding} onclick={() => input?.click()}>
          <Icon name="plus" size={22} weight={2} />
          <span>{t('detail.mediaAdd')}</span>
        </button>
      {/if}
    </div>
    <input bind:this={input} class="bc-dive-media--file" type="file" accept="image/*,video/*" multiple tabindex="-1" aria-hidden="true" onchange={chosen} />
    <div class="bc-dive-media--line">
      <span class="bc-dive-media--cloud" aria-hidden="true"><Icon name="cloudCheck" size={20} weight={2} /></span>
      <span class="bc-dive-media--summary">
        {summary}
        {#if mediaState.quotaFull}<span class="bc-dive-media--note">{t('detail.mediaFull')}</span>
        {:else if mediaState.pending > 0}<span class="bc-dive-media--note">{t('detail.mediaPending', { n: mediaState.pending })}</span>{/if}
      </span>
      {#if items.length}
        <button type="button" class="bc-dive-media--all" onclick={() => (gallery = true)}>{t('detail.mediaSeeAll')}</button>
      {/if}
    </div>
  </div>
</section>

{#if gallery}
  <DiveGallery {items} onclose={() => (gallery = false)} />
{/if}

<style>
  @layer bc.components {
    .bc-dive-media {
      margin: 22px 16px 0;
    }

    .bc-dive-media--title {
      margin: 0 0 8px;
      font-family: var(--bc-title-font);
      font-size: 14px;
      font-weight: 500;
      color: var(--bc-text-2);
    }

    .bc-dive-media--card {
      border-radius: 16px;
      background: var(--bc-surface);
      color: var(--bc-text);
      padding: 12px 0 8px;
      overflow: hidden;
    }

    .bc-dive-media--row {
      display: flex;
      gap: 8px;
      padding: 0 12px 4px;
      overflow-x: auto;
      scrollbar-width: none;
    }

    .bc-dive-media--row::-webkit-scrollbar {
      display: none;
    }

    .bc-dive-media--tile,
    .bc-dive-media--add {
      position: relative;
      flex: none;
      box-sizing: border-box;
      width: 76px;
      height: 76px;
      border-radius: 12px;
      padding: 0;
      overflow: hidden;
    }

    .bc-dive-media--tile {
      border: 0;
      background: var(--bc-surface-2);
      color: var(--bc-text-2);
    }

    .bc-dive-media--image {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .bc-dive-media--placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
    }

    /* The play disc and the length are drawn over the picture: white on a dark disc, in both modes. */
    .bc-dive-media--play {
      position: absolute;
      top: 50%;
      left: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      margin: -14px 0 0 -14px;
      border-radius: 50%;
      background: rgb(0 0 0 / 55%);
      color: #fff;
    }

    .bc-dive-media--duration {
      position: absolute;
      right: 4px;
      bottom: 4px;
      padding: 1px 5px;
      border-radius: 6px;
      background: rgb(0 0 0 / 60%);
      color: #fff;
      font-size: 11px;
      line-height: 16px;
      font-variant-numeric: tabular-nums;
    }

    .bc-dive-media--add {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      border: 1.5px dashed var(--bc-outline);
      background: transparent;
      color: var(--bc-text-2);
      font-size: 12px;
    }

    .bc-dive-media--add:disabled {
      opacity: 0.5;
    }

    .bc-dive-media--file {
      display: none;
    }

    .bc-dive-media--line {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px 4px;
      font-size: 14px;
      line-height: 20px;
    }

    .bc-dive-media--cloud {
      display: flex;
      color: var(--bc-release-ok);
    }

    .bc-dive-media--summary {
      flex: 1;
      min-width: 0;
      color: var(--bc-text);
    }

    .bc-dive-media--note {
      display: block;
      font-size: 13px;
      color: var(--bc-text-2);
    }

    .bc-dive-media--all {
      flex: none;
      padding: 4px 0 4px 8px;
      border: 0;
      background: none;
      color: var(--bc-release-link);
      font: inherit;
      font-weight: 500;
    }
  }
</style>
