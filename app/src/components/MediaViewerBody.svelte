<script>
  // @ts-check
  // A photo or video full screen (tasks 2026-11-23-367 and 368; the mock-ups are on claude.ai canvases, so this is built from the
  // tasks' text). Black ground, the picture fitted, a swipe goes to the neighbour; touching the picture hides and shows the bars.
  // The line under it says only when it was taken and with what camera: no depth, no time in the dive, no profile.
  //  - Android: gradient top bar (back, « 2 sur 9 », Partager, ⋮), the line at 85 % white, page dots; ⋮: « Remplacer la photo du
  //    site » and « Retirer de la plongée ». On a tablet the picture is centred with round ‹ › buttons on each side, and the
  //    line and the video controls sit under it, 120 dp from the sides.
  //  - iPhone and iPad: translucent navigation bar (« ‹ Photos », « 2 sur 9 » with the date under it, « … ») and translucent
  //    toolbar (Partager, the camera, the trash); iPad adds ‹ ›.
  //  - Desktop: dark ground under the title bar, ✕, the line, Partager, Retirer, ⋮; ‹ › and the arrow keys; a strip of 64 px
  //    thumbnails; the video's controls over the bottom of the video.
  // Video: a 48 dp round Lecture/Pause button, elapsed time, seek bar, total time, mute; a play disc only while it is paused.
  import Icon from './Icon.svelte';
  import RowMenu from './RowMenu.svelte';
  import { t } from '../lib/i18n.js';
  import { ios, layout } from '../lib/layout.svelte.js';
  import { durationText, takenLocalIso } from '../lib/dive-media.js';
  import { formatWeekdayDate, formatTimeOfDay } from '../lib/format.js';

  /**
   * @type {{
   *   items: import('../lib/dive-media.svelte.js').DiveMediaItem[],
   *   start: number,
   *   readOnly?: boolean,
   *   load: (item: import('../lib/dive-media.svelte.js').DiveMediaItem) => Promise<string>,
   *   onclose: () => void,
   *   onshare: (hashes: string[]) => void,
   *   onremove: (hashes: string[]) => void,
   *   onreplace: (item: import('../lib/dive-media.svelte.js').DiveMediaItem) => void,
   * }}
   */
  let { items, start, readOnly = false, load, onclose, onshare, onremove, onreplace } = $props();

  // The desktop pattern is the desktop app's wide window (layout.desktop); a narrow window of it follows the phone and tablet looks.
  const desk = $derived(layout.desktop);
  const variant = $derived(desk ? 'desk' : ios ? 'ios' : 'md');
  const wide = $derived(desk || !layout.phone);

  // svelte-ignore state_referenced_locally
  let index = $state(Math.min(Math.max(0, start), Math.max(0, items.length - 1)));
  let chrome = $state(true);
  /** The original of each item shown or about to be: its address, or why it cannot be shown. @type {Record<string, { src?: string, error?: string }>} */
  let originals = $state({});
  /** @type {HTMLElement|undefined} */
  let track = $state();
  /** @type {HTMLVideoElement|undefined} */
  let video = $state();
  /** @type {HTMLElement|undefined} */
  let more = $state();
  let menu = $state(false);
  let playing = $state(false);
  let current = $state(0);
  let length = $state(0);
  let muted = $state(false);

  const item = $derived(items[index]);
  const hidden = $derived(!desk && !chrome);

  // The list changes (a removal here or on another device): stay on a picture that exists.
  $effect(() => {
    if (!items.length) onclose();
    else if (index > items.length - 1) index = items.length - 1;
  });

  // The originals of the picture and its neighbours (a video's only when it is the current one).
  $effect(() => {
    for (const i of [index - 1, index, index + 1]) {
      const it = items[i];
      if (!it || originals[it.hash] || (it.kind === 'video' && i !== index)) continue;
      originals[it.hash] = {};
      load(it).then(
        (src) => (originals[it.hash] = { src }),
        (e) => (originals[it.hash] = { error: String(/** @type {any} */ (e)?.message) === 'NOT_ON_SERVER' ? t('detail.mediaNotOnServer') : t('detail.mediaOffline') }),
      );
    }
  });

  // The track follows the index (buttons, keys, the strip) and the index follows the track (a swipe).
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let settle;
  function scrolled() {
    clearTimeout(settle);
    settle = setTimeout(() => {
      if (!track || !track.clientWidth) return;
      const at = Math.round(track.scrollLeft / track.clientWidth);
      if (at !== index && items[at]) index = at;
    }, 90);
  }
  /** @param {boolean} smooth */
  function align(smooth) {
    if (!track || !track.clientWidth) return;
    const left = index * track.clientWidth;
    if (Math.abs(track.scrollLeft - left) > 2) track.scrollTo({ left, behavior: smooth ? 'smooth' : 'instant' });
  }
  $effect(() => {
    void index;
    align(true);
  });
  $effect(() => {
    if (!track) return;
    const el = track;
    const observer = new ResizeObserver(() => align(false));
    observer.observe(el);
    requestAnimationFrame(() => align(false));
    return () => observer.disconnect();
  });

  // A new picture starts its own state.
  $effect(() => {
    void item?.hash;
    playing = false;
    current = 0;
    length = (item?.durationMs ?? 0) / 1000;
  });

  /** @param {number} step */
  function go(step) {
    const next = index + step;
    if (items[next]) index = next;
  }

  /** @param {KeyboardEvent} event */
  function key(event) {
    if (document.querySelector('.bc-md3-dialog, .actions-modal.modal-in, .bc-row-menu')) return;
    if (event.key === 'ArrowLeft') go(-1);
    else if (event.key === 'ArrowRight') go(1);
    else if (event.key === ' ' && video && event.target === document.body) {
      event.preventDefault();
      toggle();
    }
  }

  function toggle() {
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  }

  /** @param {Event} event */
  function seek(event) {
    if (video) video.currentTime = Number(/** @type {HTMLInputElement} */ (event.currentTarget).value);
  }

  const takenLine = $derived.by(() => {
    const iso = item ? takenLocalIso(item.takenAt) : '';
    return iso ? t('detail.mediaTaken', { date: formatWeekdayDate(iso), time: formatTimeOfDay(iso) }) : '';
  });
  const fullLine = $derived([takenLine, item?.camera].filter(Boolean).join(' · '));
  const positionText = $derived(t('detail.mediaViewerOf', { n: index + 1, total: items.length }));
  const dots = $derived.by(() => {
    const total = items.length;
    const size = Math.min(total, 9);
    const first = Math.min(Math.max(0, index - 4), total - size);
    return Array.from({ length: size }, (_, k) => first + k);
  });
  const labelOf = (/** @type {import('../lib/dive-media.svelte.js').DiveMediaItem} */ it, /** @type {number} */ n) => (it.kind === 'video' ? t('detail.mediaVideoLabel', { n: n + 1, duration: durationText(it.durationMs ?? 0) }) : t('detail.mediaPhotoLabel', { n: n + 1 }));

  const menuOptions = $derived([
    ...(item?.kind === 'photo' && !readOnly ? [{ value: 'replace', label: t('detail.mediaReplaceSite') }] : []),
    ...(variant === 'ios' || variant === 'desk' || readOnly ? [] : [{ value: 'remove', label: t('detail.mediaRemoveFromDive') }]),
  ]);
  const hasMenu = $derived(menuOptions.length > 0);
</script>

<svelte:window onkeydown={key} />

  <div class="bc-media-viewer--root" class:bc-media-viewer--hidden={hidden}>
    <div
      class="bc-media-viewer--track"
      bind:this={track}
      onscroll={scrolled}
      role="group"
      aria-roledescription="carousel"
      aria-label={t('detail.mediaGallery')}
    >
      {#each items as it, n (it.hash)}
        {@const shown = Math.abs(n - index) <= 1}
        {@const original = originals[it.hash]}
        <div class="bc-media-viewer--slide" role="group" aria-roledescription="slide" aria-label={labelOf(it, n)}>
          {#if shown}
            {#if it.kind === 'video' && n === index && original?.src}
              <!-- svelte-ignore a11y_media_has_caption -->
              <video
                class="bc-media-viewer--media"
                src={original.src}
                playsinline
                bind:this={video}
                bind:muted
                onclick={() => (chrome = !chrome)}
                onplay={() => (playing = true)}
                onpause={() => (playing = false)}
                onended={() => (playing = false)}
                ontimeupdate={() => (current = video?.currentTime ?? 0)}
                onloadedmetadata={() => {
                  if (video && Number.isFinite(video.duration)) length = video.duration;
                }}
              ></video>
              {#if !playing}
                <button type="button" class="bc-media-viewer--disc" aria-label={t('detail.mediaPlayBig')} onclick={toggle}>
                  <svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
                </button>
              {/if}
            {:else if original?.src && it.kind === 'photo'}
              <button type="button" class="bc-media-viewer--tap" aria-label={labelOf(it, n)} onclick={() => (chrome = !chrome)}>
                <img class="bc-media-viewer--media" src={original.src} alt="" draggable="false" />
              </button>
            {:else}
              <button type="button" class="bc-media-viewer--tap" onclick={() => (chrome = !chrome)}>
                {#if it.thumbSrc}<img class="bc-media-viewer--media bc-media-viewer--preview" src={it.thumbSrc} alt="" draggable="false" />{/if}
                {#if original?.error}<span class="bc-media-viewer--problem" role="alert">{original.error}</span>{/if}
              </button>
            {/if}
          {/if}
        </div>
      {/each}
    </div>

    {#if wide && items.length > 1}
      <button type="button" class="bc-media-viewer--step bc-media-viewer--prev" aria-label={t('detail.mediaPrevious')} disabled={index === 0} onclick={() => go(-1)}>
        <span class="bc-media-viewer--flip"><Icon name="chevron" size={28} weight={2.4} /></span>
      </button>
      <button type="button" class="bc-media-viewer--step bc-media-viewer--next" aria-label={t('detail.mediaNext')} disabled={index === items.length - 1} onclick={() => go(1)}>
        <Icon name="chevron" size={28} weight={2.4} />
      </button>
    {/if}

    <header class="bc-media-viewer--top">
      {#if variant === 'ios'}
        <button type="button" class="bc-media-viewer--back" onclick={onclose}>
          <span class="bc-media-viewer--flip"><Icon name="chevron" size={22} weight={2.4} /></span>{wide ? t('detail.mediaBackDive') : t('detail.mediaBackPhotos')}
        </button>
        <span class="bc-media-viewer--ios-title">
          <span class="bc-media-viewer--ios-count">{positionText}</span>
          <span class="bc-media-viewer--ios-date bc-value">{takenLine}</span>
        </span>
        {#if hasMenu}<button type="button" class="bc-media-viewer--icon" aria-label={t('detail.mediaMore')} bind:this={more} onclick={() => (menu = true)}><Icon name="moreCircle" size={26} weight={1.8} /></button>{:else}<span class="bc-media-viewer--icon"></span>{/if}
      {:else if variant === 'desk'}
        <button type="button" class="bc-media-viewer--icon" aria-label={t('detail.mediaCloseEsc')} title={t('detail.mediaCloseEsc')} onclick={onclose}><Icon name="close" size={22} weight={2} /></button>
        <span class="bc-media-viewer--desk-title bc-value">{[positionText, takenLine, item?.camera].filter(Boolean).join(' · ')}</span>
        <button type="button" class="bc-media-viewer--icon" aria-label={t('detail.mediaShare')} title={t('detail.mediaShare')} onclick={() => item && onshare([item.hash])}><Icon name="share" size={22} weight={2} /></button>
        {#if !readOnly}<button type="button" class="bc-media-viewer--icon" aria-label={t('detail.mediaRemoveFromDive')} title={t('detail.mediaRemoveFromDive')} onclick={() => item && onremove([item.hash])}><Icon name="trash" size={22} weight={2} /></button>{/if}
        {#if hasMenu}<button type="button" class="bc-media-viewer--icon" aria-label={t('detail.mediaMore')} bind:this={more} onclick={() => (menu = true)}><Icon name="more" size={22} /></button>{/if}
      {:else}
        <button type="button" class="bc-media-viewer--icon" aria-label={t('detail.mediaClose')} onclick={onclose}><Icon name="arrowBack" size={24} weight={2} /></button>
        <span class="bc-media-viewer--count">{positionText}</span>
        <button type="button" class="bc-media-viewer--icon" aria-label={t('detail.mediaShare')} onclick={() => item && onshare([item.hash])}><Icon name="share" size={24} weight={2} /></button>
        {#if hasMenu}<button type="button" class="bc-media-viewer--icon" aria-label={t('detail.mediaMore')} bind:this={more} onclick={() => (menu = true)}><Icon name="more" size={24} /></button>{/if}
      {/if}
    </header>

    <footer class="bc-media-viewer--bottom">
      {#if item?.kind === 'video'}
        <div class="bc-media-viewer--controls" role="group" aria-label={t('detail.mediaVideoLabel', { n: index + 1, duration: durationText(length * 1000) })}>
          <button type="button" class="bc-media-viewer--play" aria-label={playing ? t('detail.mediaPause') : t('detail.mediaPlay')} onclick={toggle}>
            {#if playing}
              <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" /></svg>
            {:else}
              <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
            {/if}
          </button>
          <span class="bc-media-viewer--time" aria-label={t('detail.mediaElapsed')}>{durationText(current * 1000)}</span>
          <input class="bc-media-viewer--seek" type="range" min="0" max={length || 1} step="0.05" value={current} aria-label={t('detail.mediaSeek')} oninput={seek} />
          <span class="bc-media-viewer--time" aria-label={t('detail.mediaTotal')}>{durationText(length * 1000)}</span>
          <button type="button" class="bc-media-viewer--mute" aria-label={muted ? t('detail.mediaUnmute') : t('detail.mediaMute')} aria-pressed={muted} onclick={() => (muted = !muted)}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor" />
              {#if muted}<path d="M16 9.5l5 5M21 9.5l-5 5" />{:else}<path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" />{/if}
            </svg>
          </button>
        </div>
      {/if}
      {#if variant === 'md'}
        <p class="bc-media-viewer--line bc-value">{fullLine}</p>
        {#if items.length > 1}
          <div class="bc-media-viewer--dots" aria-hidden="true">
            {#each dots as d (d)}<span class="bc-media-viewer--dot" class:bc-media-viewer--dot-on={d === index}></span>{/each}
          </div>
        {/if}
      {:else if variant === 'ios'}
        <div class="bc-media-viewer--toolbar">
          <button type="button" class="bc-media-viewer--tool" aria-label={t('detail.mediaShare')} onclick={() => item && onshare([item.hash])}><Icon name="share" size={24} weight={1.8} /></button>
          <span class="bc-media-viewer--camera bc-value">{item?.camera ?? ''}</span>
          {#if !readOnly}<button type="button" class="bc-media-viewer--tool" aria-label={t('detail.mediaRemoveFromDive')} onclick={() => item && onremove([item.hash])}><Icon name="trash" size={24} weight={1.8} /></button>{:else}<span class="bc-media-viewer--tool"></span>{/if}
        </div>
      {:else}
        {#if items.length > 1}
          <div class="bc-media-viewer--strip" role="list">
            {#each items as it, n (it.hash)}
              <button type="button" class="bc-media-viewer--thumb" class:bc-media-viewer--thumb-on={n === index} role="listitem" aria-label={t('detail.mediaStripItem', { label: labelOf(it, n) })} aria-current={n === index} onclick={() => (index = n)}>
                {#if it.thumbSrc}<img src={it.thumbSrc} alt="" draggable="false" />{/if}
              </button>
            {/each}
          </div>
        {/if}
      {/if}
    </footer>
  </div>

{#if menu && more}
  <RowMenu
    anchor={more}
    label={t('detail.mediaMore')}
    options={menuOptions}
    value=""
    onselect={(value) => {
      if (!item) return;
      if (value === 'replace') onreplace(item);
      else onremove([item.hash]);
    }}
    onclose={() => (menu = false)}
  />
{/if}

<style>
  @layer bc.components {
    :global(.bc-media-viewer) {
      background: var(--bc-viewer);
      color: var(--bc-viewer-on);
    }

    :global(.bc-media-viewer--desk) {
      background: #0b0b0c;
    }

    .bc-media-viewer--root {
      position: relative;
      height: 100%;
      overflow: hidden;
    }

    .bc-media-viewer--track {
      position: absolute;
      inset: 0;
      display: flex;
      overflow-x: auto;
      overflow-y: hidden;
      scroll-snap-type: x mandatory;
      scrollbar-width: none;
      overscroll-behavior: contain;
    }

    .bc-media-viewer--track::-webkit-scrollbar {
      display: none;
    }

    .bc-media-viewer--slide {
      position: relative;
      flex: none;
      width: 100%;
      height: 100%;
      scroll-snap-align: center;
      scroll-snap-stop: always;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .bc-media-viewer--tap {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      border: 0;
      background: none;
      padding: 0;
      color: inherit;
    }

    .bc-media-viewer--media {
      display: block;
      max-width: 100%;
      max-height: 100%;
      width: 100%;
      height: 100%;
      object-fit: contain;
      background: #000;
    }

    .bc-media-viewer--preview {
      opacity: 0.55;
    }

    .bc-media-viewer--problem {
      position: absolute;
      left: 24px;
      right: 24px;
      top: 50%;
      transform: translateY(-50%);
      text-align: center;
      font-size: 14px;
      color: rgb(255 255 255 / 85%);
      text-shadow: 0 1px 3px rgb(0 0 0 / 80%);
    }

    .bc-media-viewer--disc {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 72px;
      height: 72px;
      margin: -36px 0 0 -36px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 0;
      border-radius: 50%;
      background: rgb(0 0 0 / 55%);
      color: #fff;
    }

    /* ---------- The bars ---------- */
    .bc-media-viewer--top,
    .bc-media-viewer--bottom {
      position: absolute;
      left: 0;
      right: 0;
      transition: opacity 180ms ease;
    }

    .bc-media-viewer--hidden .bc-media-viewer--top,
    .bc-media-viewer--hidden .bc-media-viewer--bottom,
    .bc-media-viewer--hidden .bc-media-viewer--step {
      opacity: 0;
      pointer-events: none;
    }

    .bc-media-viewer--top {
      top: 0;
      display: flex;
      align-items: center;
      gap: 4px;
      padding: calc(var(--f7-safe-area-top, 0px) + 4px) 4px 24px;
      background: linear-gradient(rgb(0 0 0 / 65%), rgb(0 0 0 / 0%));
    }

    .bc-media-viewer--bottom {
      bottom: 0;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      padding: 28px 16px calc(var(--f7-safe-area-bottom, 0px) + 14px);
      background: linear-gradient(rgb(0 0 0 / 0%), rgb(0 0 0 / 65%));
      pointer-events: none;
    }

    .bc-media-viewer--bottom > * {
      pointer-events: auto;
    }

    .bc-media-viewer--icon {
      flex: none;
      justify-self: end;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      border: 0;
      border-radius: 50%;
      background: none;
      color: #fff;
      padding: 0;
    }

    .bc-media-viewer--count {
      flex: 1;
      font-size: 18px;
      font-weight: 500;
    }

    .bc-media-viewer--line {
      margin: 0 0 8px;
      text-align: center;
      font-size: 14px;
      line-height: 20px;
      color: rgb(255 255 255 / 85%);
    }

    .bc-media-viewer--dots {
      display: flex;
      justify-content: center;
      gap: 6px;
      padding: 4px 0;
    }

    .bc-media-viewer--dot {
      width: 6px;
      height: 6px;
      border-radius: 3px;
      background: rgb(255 255 255 / 45%);
      transition: width 200ms cubic-bezier(0.2, 0, 0, 1);
    }

    .bc-media-viewer--dot-on {
      width: 16px;
      background: #fff;
    }

    /* ---------- Video controls ---------- */
    .bc-media-viewer--controls {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 10px;
    }

    .bc-media-viewer--play {
      flex: none;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      border: 0;
      border-radius: 50%;
      background: #fff;
      color: #111;
    }

    .bc-media-viewer--mute {
      flex: none;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      border: 0;
      border-radius: 50%;
      background: none;
      color: #fff;
    }

    .bc-media-viewer--time {
      flex: none;
      min-width: 36px;
      font-size: 13px;
      font-variant-numeric: tabular-nums;
      color: #fff;
      text-align: center;
    }

    .bc-media-viewer--seek {
      flex: 1;
      min-width: 0;
      accent-color: #fff;
    }

    /* ---------- Tablet and iPad: the buttons on each side, the line and controls under the picture ---------- */
    .bc-media-viewer--step {
      position: absolute;
      top: 50%;
      width: 56px;
      height: 56px;
      margin-top: -28px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 0;
      border-radius: 50%;
      background: rgb(255 255 255 / 20%);
      color: #fff;
      transition: opacity 180ms ease;
    }

    .bc-media-viewer--step:disabled {
      opacity: 0.3;
    }

    .bc-media-viewer--prev {
      left: 24px;
    }

    .bc-media-viewer--next {
      right: 24px;
    }

    .bc-media-viewer--flip {
      display: flex;
      transform: scaleX(-1);
    }

    :global(.bc-media-viewer--wide.bc-media-viewer--md) .bc-media-viewer--bottom {
      padding-left: 120px;
      padding-right: 120px;
    }

    /* ---------- iPhone and iPad ---------- */
    :global(.bc-media-viewer--ios) .bc-media-viewer--top {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
      align-items: center;
      padding: var(--f7-safe-area-top, 0px) 8px 0;
      min-height: 52px;
      box-sizing: content-box;
      background: rgb(30 30 32 / 55%);
      backdrop-filter: blur(20px);
    }

    :global(.bc-media-viewer--ios) .bc-media-viewer--bottom {
      padding: 0;
      background: none;
    }

    .bc-media-viewer--back {
      justify-self: start;
      display: inline-flex;
      align-items: center;
      min-height: 44px;
      border: 0;
      background: none;
      color: #fff;
      font-size: 17px;
      padding: 0 6px;
    }

    .bc-media-viewer--ios-title {
      white-space: nowrap;
      display: flex;
      flex-direction: column;
      align-items: center;
      min-width: 0;
    }

    .bc-media-viewer--ios-count {
      font-size: 16px;
      font-weight: 600;
    }

    .bc-media-viewer--ios-date {
      white-space: nowrap;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 11px;
      color: rgb(255 255 255 / 75%);
    }

    :global(.bc-media-viewer--ios) .bc-media-viewer--controls {
      margin: 0 16px 8px;
      padding: 8px 0;
    }

    .bc-media-viewer--toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 44px;
      padding: 0 8px var(--f7-safe-area-bottom, 0px);
      box-sizing: content-box;
      background: rgb(30 30 32 / 55%);
      backdrop-filter: blur(20px);
    }

    .bc-media-viewer--tool {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      border: 0;
      background: none;
      color: #fff;
    }

    .bc-media-viewer--camera {
      font-size: 13px;
      color: rgb(255 255 255 / 85%);
    }

    /* ---------- Desktop ---------- */
    :global(.bc-media-viewer--desk) .bc-media-viewer--top {
      background: #0b0b0c;
      padding: 8px 12px 8px;
      gap: 8px;
    }

    .bc-media-viewer--desk-title {
      flex: 1;
      min-width: 0;
      padding-left: 8px;
      font-size: 15px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    :global(.bc-media-viewer--desk) .bc-media-viewer--track {
      top: 64px;
      bottom: 104px;
    }

    :global(.bc-media-viewer--desk) .bc-media-viewer--bottom {
      padding: 12px 16px;
      background: #0b0b0c;
    }

    :global(.bc-media-viewer--desk) .bc-media-viewer--controls {
      position: absolute;
      left: 50%;
      width: min(720px, calc(100% - 192px));
      transform: translateX(-50%);
      box-sizing: border-box;
      bottom: 124px;
      margin: 0;
      padding: 6px 12px;
      border-radius: 28px;
      background: rgb(0 0 0 / 60%);
    }

    .bc-media-viewer--strip {
      display: flex;
      justify-content: center;
      gap: 8px;
      overflow-x: auto;
      padding: 2px;
    }

    .bc-media-viewer--thumb {
      flex: none;
      width: 64px;
      height: 64px;
      border: 2px solid transparent;
      border-radius: 8px;
      padding: 0;
      overflow: hidden;
      background: #2a2b2e;
      opacity: 0.75;
    }

    .bc-media-viewer--thumb-on {
      border-color: #fff;
      opacity: 1;
    }

    .bc-media-viewer--thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
  }
</style>
