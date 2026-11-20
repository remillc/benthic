<script>
  // @ts-check
  // The map strip of a possible duplicate (« Nettoyer les sites », task 2026-11-14-148;
  // sites-nettoyer-android.dc.html): 110 dp across the card, framed on both sites. The
  // site kept is a filled ink pin, the other a white pin with an ink outline, a dashed
  // ink line between them, each with its name in ink with a white halo. Sites at the
  // same position share one pin with the count and the names under it. A picture
  // (lib/site-image.js, mapStrip): not interactive, no full-screen button; the pencils
  // of the rows open the site's map to move it.
  import { onDestroy } from 'svelte';
  import { mapStrip } from '../lib/site-image.js';
  import { t } from '../lib/i18n.js';
  import { formatNumber, depthUnit } from '../lib/format.js';
  import { distanceInDepthUnit } from '../lib/site-suggestion.js';
  import { logbook } from '../lib/logbook.svelte.js';

  /**
   * @type {{
   *   a: { uuid: number, name: string, latUdeg: number, lonUdeg: number },
   *   b: { uuid: number, name: string, latUdeg: number, lonUdeg: number },
   *   kept: number,
   *   distanceM: number,
   * }}
   */
  let { a, b, kept, distanceM } = $props();

  const HEIGHT = 110;
  /** @type {HTMLElement|undefined} */
  let box = $state();
  let url = $state('');
  /** @type {[number, number][]} */
  let xy = $state([]);
  let width = $state(0);
  let failed = $state(false);

  const same = $derived(a.latUdeg === b.latUdeg && a.lonUdeg === b.lonUdeg);
  const nameOf = (/** @type {{ name: string }} */ s) => s.name || t('sites.noName');
  const distance = $derived(
    `${formatNumber(distanceInDepthUnit(distanceM, logbook.prefs.length === 'ft' ? 'ft' : 'm'))} ${depthUnit(logbook.prefs)}`,
  );
  const label = $derived(
    same ? t('sites.stripLabelSame', { a: nameOf(a), b: nameOf(b) }) : t('sites.stripLabel', { a: nameOf(a), b: nameOf(b), distance }),
  );

  // Drawn once the card's width is known; again if it changes (rotation).
  $effect(() => {
    if (!box) return;
    const observer = new ResizeObserver(() => {
      const w = Math.round(box?.clientWidth ?? 0);
      if (w && w !== width) width = w;
    });
    observer.observe(box);
    return () => observer.disconnect();
  });

  $effect(() => {
    if (!width) return;
    const points = /** @type {[number, number][]} */ ([
      [a.lonUdeg / 1e6, a.latUdeg / 1e6],
      [b.lonUdeg / 1e6, b.latUdeg / 1e6],
    ]);
    let cancelled = false;
    // Room for the pins (36 px above their tip) and the names beside them.
    mapStrip(points, { width, height: HEIGHT }, same ? { top: 40, right: 40, bottom: 40, left: 40 } : { top: 44, right: 90, bottom: 14, left: 90 }).then(
      (picture) => {
        if (cancelled) return URL.revokeObjectURL(picture.url);
        if (url) URL.revokeObjectURL(url);
        url = picture.url;
        xy = picture.xy;
      },
      () => (failed = true),
    );
    return () => (cancelled = true);
  });

  onDestroy(() => url && URL.revokeObjectURL(url));

  const PIN = 'M0 0c-9-11-14-17-14-24a14 14 0 0 1 28 0c0 7-5 13-14 24z';
  /** Kept first, so that its pin is drawn on top. */
  const order = $derived(
    xy.length === 2
      ? [
          { site: kept === a.uuid ? b : a, at: kept === a.uuid ? xy[1] : xy[0], kept: false },
          { site: kept === a.uuid ? a : b, at: kept === a.uuid ? xy[0] : xy[1], kept: true },
        ]
      : [],
  );
</script>

<div class="bc-duplicate-strip" bind:this={box} role="img" aria-label={label}>
  {#if url}
    <img class="bc-duplicate-strip--map" src={url} alt="" />
    <svg class="bc-duplicate-strip--marks" width={width} height={HEIGHT} viewBox="0 0 {width} {HEIGHT}" aria-hidden="true">
      {#if same}
        <g transform="translate({xy[0][0]} {xy[0][1]})">
          <path d={PIN} class="bc-duplicate-strip--kept" />
          <text y="-19.5" class="bc-duplicate-strip--count">{formatNumber(2)}</text>
        </g>
        <text x={xy[0][0]} y={xy[0][1] + 16} text-anchor="middle" class="bc-duplicate-strip--name">{nameOf(a)}, {nameOf(b)}</text>
      {:else if order.length}
        <line x1={xy[0][0]} y1={xy[0][1] - 4} x2={xy[1][0]} y2={xy[1][1] - 4} class="bc-duplicate-strip--line" />
        {#each order as p (p.site.uuid)}
          {@const left = p.at[0] < (p === order[0] ? order[1].at[0] : order[0].at[0])}
          <g transform="translate({p.at[0]} {p.at[1]})">
            <path d={PIN} class={p.kept ? 'bc-duplicate-strip--kept' : 'bc-duplicate-strip--other'} />
          </g>
          <!-- The name away from the other pin. -->
          <text x={p.at[0] + (left ? -18 : 18)} y={p.at[1] - 20} text-anchor={left ? 'end' : 'start'} class="bc-duplicate-strip--name">{nameOf(p.site)}</text>
        {/each}
      {/if}
    </svg>
  {:else if !failed}
    <div class="bc-duplicate-strip--loading skeleton-block" aria-hidden="true"></div>
  {/if}
</div>

<style>
  @layer od.components {
    .bc-duplicate-strip {
      position: relative;
      height: 110px;
      overflow: hidden;
      background: var(--bc-surface-2);
    }

    .bc-duplicate-strip--map,
    .bc-duplicate-strip--marks,
    .bc-duplicate-strip--loading {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
    }

    .bc-duplicate-strip--map {
      object-fit: cover;
    }

    .bc-duplicate-strip--line {
      stroke: var(--bc-text);
      stroke-width: 1.5;
      stroke-dasharray: 4 3;
    }

    .bc-duplicate-strip--kept {
      fill: var(--bc-text);
      stroke: var(--bc-surface);
      stroke-width: 2;
    }

    .bc-duplicate-strip--other {
      fill: var(--bc-surface);
      stroke: var(--bc-text);
      stroke-width: 2;
    }


    .bc-duplicate-strip--count {
      fill: var(--bc-surface);
      font-size: 13px;
      font-weight: 700;
      text-anchor: middle;
    }

    .bc-duplicate-strip--name {
      fill: var(--bc-text);
      font-size: 13px;
      font-weight: 500;
      paint-order: stroke;
      stroke: var(--bc-surface);
      stroke-width: 4px;
      stroke-linejoin: round;
    }
  }
</style>
