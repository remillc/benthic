<script>
  // @ts-check
  // « Où je plonge le plus » (od-stats-heatmap, task 2026-11-14-152; the card under
  // « Graphiques » in android-stats.dc.html): the dives of the Statistics filter as heat,
  // one radial spot per site (lib/heatmap.js), on the base map desaturated to about 25 %,
  // framed on the area that holds most of the dives. The map is a picture drawn off
  // screen (lib/site-image.js, mapStrip): no site names, no pins, no credit on the card
  // (it is in About). A full-screen button shows the same area over the whole screen.
  // Not shown with fewer than 2 sites with coordinates.
  import { onDestroy, tick } from 'svelte';
  import Icon from './Icon.svelte';
  import { mapStrip } from '../lib/site-image.js';
  import { busiestArea, heatSpot, siteHeat } from '../lib/heatmap.js';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   dives: { site: string }[],
   *   sites: { name: string, hasLocation: boolean, latUdeg: number, lonUdeg: number, dives: number }[],
   * }}
   */
  let { dives, sites } = $props();

  const spots = $derived(siteHeat(dives, sites));
  const area = $derived(busiestArea(spots));
  const shown = $derived(spots.length >= 2);
  const lead = $derived(spots[0]);
  const max = $derived(Math.max(1, ...area.map((s) => s.count)));
  const uid = Math.random().toString(36).slice(2, 8);

  const HEIGHT = 170;
  /** @type {HTMLElement|undefined} */
  let box = $state();
  let width = $state(0);
  /** @type {{ url: string, xy: [number, number][], w: number, h: number }|null} */
  let card = $state(null);
  /** @type {{ url: string, xy: [number, number][], w: number, h: number }|null} */
  let large = $state(null);
  let full = $state(false);
  /** @type {HTMLButtonElement|undefined} */
  let fullButton = $state();
  /** @type {HTMLElement|undefined} */
  let overlay = $state();

  $effect(() => {
    if (!box) return;
    const observer = new ResizeObserver(() => {
      const w = Math.round(box?.clientWidth ?? 0);
      if (w && w !== width) width = w;
    });
    observer.observe(box);
    return () => observer.disconnect();
  });

  /**
   * The picture of the area at a size, with where each site falls on it.
   * @param {number} w @param {number} h
   */
  async function draw(w, h) {
    const points = /** @type {[number, number][]} */ (area.map((s) => [s.lon, s.lat]));
    const margin = Math.round(Math.min(w, h) * 0.18);
    const picture = await mapStrip(points, { width: w, height: h }, { top: margin, right: margin, bottom: margin, left: margin }, 11);
    return { ...picture, w, h };
  }

  $effect(() => {
    if (!width || !shown || !area.length) return;
    let cancelled = false;
    draw(width, HEIGHT).then(
      (picture) => {
        if (cancelled) return URL.revokeObjectURL(picture.url);
        if (card) URL.revokeObjectURL(card.url);
        card = picture;
      },
      (e) => console.error('Heat map', e),
    );
    return () => (cancelled = true);
  });

  /** @param {boolean} on */
  async function setFull(on) {
    full = on;
    const app = document.getElementById('app');
    if (app) app.inert = on;
    if (on && overlay) document.body.append(overlay);
    await tick();
    fullButton?.focus(/** @type {any} */ ({ focusVisible: false }));
    if (on && !large) {
      const picture = await draw(window.innerWidth, window.innerHeight).catch(() => null);
      if (picture) large = picture;
    }
  }

  /** Back leaves full screen (lib/back-button.js sends od-cancel to .od-map-fullscreen). @param {HTMLElement} node */
  function cancelable(node) {
    const close = () => setFull(false);
    node.addEventListener('od-cancel', close);
    return { destroy: () => node.removeEventListener('od-cancel', close) };
  }

  onDestroy(() => {
    if (full) {
      const app = document.getElementById('app');
      if (app) app.inert = false;
    }
    overlay?.remove();
    for (const p of [card, large]) if (p) URL.revokeObjectURL(p.url);
  });
</script>

{#snippet heat(/** @type {{ url: string, xy: [number, number][], w: number, h: number }} */ p)}
  <img class="od-stats-heatmap--base" src={p.url} alt="" />
  <svg class="od-stats-heatmap--heat" width={p.w} height={p.h} viewBox="0 0 {p.w} {p.h}" aria-hidden="true">
    <defs>
      <radialGradient id="od-heat-{uid}">
        <stop offset="0" class="od-stats-heatmap--stop-1" />
        <stop offset="0.45" class="od-stats-heatmap--stop-2" />
        <stop offset="0.75" class="od-stats-heatmap--stop-3" />
        <stop offset="1" class="od-stats-heatmap--stop-4" />
      </radialGradient>
    </defs>
    {#each area as s, i (s.name)}
      {@const spot = heatSpot(s.count, max)}
      {#if p.xy[i]}
        <circle cx={p.xy[i][0]} cy={p.xy[i][1]} r={spot.radius * Math.min(p.w, p.h) * 0.3} fill="url(#od-heat-{uid})" opacity={spot.opacity} />
      {/if}
    {/each}
  </svg>
{/snippet}

{#snippet legend()}
  <div class="od-stats-heatmap--legend" aria-hidden="true">
    <span>{t('stats.heatLess')}</span><span class="od-stats-heatmap--ramp"></span><span>{t('stats.heatMore')}</span>
  </div>
{/snippet}

{#if shown}
  <section class="od-stats-heatmap" aria-label={t('stats.heatTitle')}>
    <h3 class="od-stats-heatmap--title">{t('stats.heatTitle')}</h3>
    <p class="od-stats-heatmap--lead">{t('stats.heatLead', { site: lead.name, dives: t('trip.dives', { n: lead.count }) })}</p>
    <div class="od-stats-heatmap--map" bind:this={box}>
      {#if card}{@render heat(card)}{:else}<div class="skeleton-block od-stats-heatmap--loading" aria-hidden="true"></div>{/if}
      <button type="button" class="od-stats-heatmap--full-button" aria-label={t('stats.heatFullscreen')} onclick={() => setFull(true)}>
        <Icon name="fullscreen" size={22} weight={2} />
      </button>
    </div>
    {@render legend()}
  </section>
{/if}

<!-- Full screen (od-map-fullscreen, as the maps of task 147): the same area, the heat, the legend. -->
<!-- The class od-map-fullscreen only while open: Back looks for it (lib/back-button.js). -->
<div class="od-stats-heatmap--full" class:od-map-fullscreen={full} bind:this={overlay} use:cancelable role="dialog" aria-label={t('stats.heatTitle')} hidden={!full}>
  {#if full && large}{@render heat(large)}{/if}
  {#if full}
    <button type="button" class="od-stats-heatmap--full-button od-stats-heatmap--exit" bind:this={fullButton} aria-label={t('sites.exitFullscreen')} onclick={() => setFull(false)}>
      <Icon name="exitFullscreen" size={22} weight={2} />
    </button>
    <div class="od-stats-heatmap--full-legend">{@render legend()}</div>
  {/if}
</div>

<style>
  @layer od.components {
    .od-stats-heatmap {
      margin: 0 16px;
      padding: 16px;
      border-radius: 12px;
      background: var(--od-surface);
    }

    .od-stats-heatmap--title {
      margin: 0;
      font-size: 16px;
      line-height: 24px;
      font-weight: 500;
      color: var(--od-text);
    }

    .od-stats-heatmap--lead {
      margin: 0 0 12px;
      font-size: 12px;
      line-height: 16px;
      color: var(--od-text-2);
    }

    .od-stats-heatmap--map {
      position: relative;
      height: 170px;
      border-radius: 8px;
      overflow: hidden;
      background: var(--od-surface-2);
    }

    .od-stats-heatmap--base,
    .od-stats-heatmap--heat,
    .od-stats-heatmap--loading {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
    }

    /* The base map desaturated, so the heat stands out. */
    .od-stats-heatmap--base {
      object-fit: cover;
      filter: saturate(0.25);
    }

    .od-stats-heatmap--stop-1 {
      stop-color: var(--od-heat-1);
    }

    .od-stats-heatmap--stop-2 {
      stop-color: var(--od-heat-2);
    }

    .od-stats-heatmap--stop-3 {
      stop-color: var(--od-heat-3);
      stop-opacity: 0.7;
    }

    .od-stats-heatmap--stop-4 {
      stop-color: var(--od-heat-3);
      stop-opacity: 0;
    }

    /* The full-screen button of task 147: a white square, 40 dp (44 pt on iOS), 8 dp from the edges. */
    .od-stats-heatmap--full-button {
      position: absolute;
      z-index: 2;
      top: 8px;
      right: 8px;
      width: 40px;
      height: 40px;
      padding: 0;
      border: none;
      border-radius: 12px;
      background: var(--od-surface);
      color: var(--od-text);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 1px 3px rgb(0 0 0 / 0.2);

      :global(.ios) & {
        width: 44px;
        height: 44px;
      }

      &::after {
        content: '';
        position: absolute;
        inset: -4px;
      }
    }

    .od-stats-heatmap--legend {
      margin-top: 8px;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      line-height: 16px;
      color: var(--od-text-2);
    }

    .od-stats-heatmap--ramp {
      width: 96px;
      height: 8px;
      border-radius: 4px;
      background: linear-gradient(to right, var(--od-heat-3), var(--od-heat-2), var(--od-heat-1));
    }

    .od-stats-heatmap--full {
      position: fixed;
      inset: 0;
      z-index: 12000;
      background: var(--od-surface-2);

      &[hidden] {
        display: none;
      }
    }

    .od-stats-heatmap--exit {
      top: calc(var(--f7-safe-area-top, env(safe-area-inset-top)) + 8px);
      right: 16px;
    }

    .od-stats-heatmap--full-legend {
      position: absolute;
      left: 16px;
      bottom: calc(env(safe-area-inset-bottom) + 24px);
      padding: 4px 10px 8px;
      border-radius: 8px;
      background: var(--od-surface);
    }
  }
</style>
