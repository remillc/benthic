<script>
  // @ts-check
  // The small map of the desktop site sheet and of « Nouveau site » (task 2026-11-15-177,
  // mock-ups bureau-sites-fiche, -modifier, -nouveau): the site's position is a crosshair (28 dp,
  // 2.5 dp blue stroke, white halo) fixed on the middle of the map. To correct the position, drag
  // the crosshair or the map under it; the previous position stays as a dashed grey crosshair
  // until the change is kept. The nearby sites are 6 dp grey dots with their names. With
  // `placeOnClick` (a new site), a click on the map brings that point under the crosshair.
  import { onMount, onDestroy } from 'svelte';
  import Icon from './Icon.svelte';
  import { t } from '../lib/i18n.js';
  import { createSiteMap, lngLatOf, positionOf } from '../lib/desktop-map.js';

  /**
   * @type {{
   *   position: { latUdeg: number, lonUdeg: number }|null,
   *   previous?: { latUdeg: number, lonUdeg: number }|null,
   *   others?: { uuid: number, name: string, latUdeg: number, lonUdeg: number }[],
   *   hint?: string,
   *   placeOnClick?: boolean,
   *   height?: number,
   *   onmove: (pos: { latUdeg: number, lonUdeg: number }) => void,
   * }}
   * position: where the crosshair is (null: not placed yet; the map frames the other sites).
   * previous: the position before an uncommitted change, drawn as a dashed crosshair.
   * onmove: the diver moved the crosshair or the map (not a move made by the code).
   */
  let { position, previous = null, others = [], hint = '', placeOnClick = false, height = 220, onmove } = $props();

  /** @type {HTMLElement|undefined} */
  let container = $state();
  let map = $state.raw(/** @type {import('maplibre-gl').Map|undefined} */ (undefined));
  /** @type {typeof import('maplibre-gl')|undefined} */
  let maplibregl;
  /** @type {import('maplibre-gl').Marker[]} */
  let dotMarkers = [];
  /** @type {import('maplibre-gl').Marker|undefined} */
  let previousMarker;

  const CROSS = 'M14 2v24M2 14h24';

  function drawOthers() {
    if (!map || !maplibregl) return;
    for (const m of dotMarkers) m.remove();
    dotMarkers = others.map((s) => {
      const node = document.createElement('div');
      node.className = 'od-desktop-pos-map--other';
      node.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.textContent = s.name || t('sites.noName');
      node.append(document.createElement('i'), label);
      return new /** @type {typeof import('maplibre-gl')} */ (maplibregl).Marker({ element: node, anchor: 'left' }).setLngLat(lngLatOf(s)).addTo(/** @type {import('maplibre-gl').Map} */ (map));
    });
  }

  function drawPrevious() {
    if (!map || !maplibregl) return;
    const shown = previous && position && (previous.latUdeg !== position.latUdeg || previous.lonUdeg !== position.lonUdeg) ? previous : null;
    if (!shown) {
      previousMarker?.remove();
      previousMarker = undefined;
      return;
    }
    if (!previousMarker) {
      const node = document.createElement('div');
      node.className = 'od-desktop-pos-map--previous';
      node.setAttribute('aria-hidden', 'true');
      node.innerHTML = `<svg width="28" height="28" viewBox="0 0 28 28"><path d="${CROSS}" /></svg>`;
      previousMarker = new maplibregl.Marker({ element: node }).setLngLat(lngLatOf(shown)).addTo(map);
    } else previousMarker.setLngLat(lngLatOf(shown));
  }

  /** The crosshair is the middle of the map: a position set by the code is brought under it. */
  function followPosition() {
    if (!map) return;
    if (!position) return;
    const c = map.getCenter();
    if (Math.round(c.lat * 1e6) === position.latUdeg && Math.round(c.lng * 1e6) === position.lonUdeg) return;
    map.jumpTo({ center: lngLatOf(position), zoom: Math.max(map.getZoom(), 13) }, { programmatic: true });
  }

  function frameOthers() {
    if (!map || !maplibregl || position || !others.length) return;
    const points = others.map(lngLatOf);
    map.fitBounds(points.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(points[0], points[0])), { padding: 30, maxZoom: 11, animate: false }, { programmatic: true });
  }

  /** Dragging the crosshair moves the map under it the other way. @param {PointerEvent} e */
  function dragCross(e) {
    if (!map) return;
    const handle = /** @type {HTMLElement} */ (e.currentTarget);
    handle.setPointerCapture(e.pointerId);
    let x = e.clientX;
    let y = e.clientY;
    const m = map;
    /** @param {PointerEvent} ev */
    const move = (ev) => {
      m.panBy([x - ev.clientX, y - ev.clientY], { duration: 0 }, { programmatic: true });
      x = ev.clientX;
      y = ev.clientY;
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      onmove(positionOf(m.getCenter()));
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  }

  onMount(async () => {
    if (!container) return;
    const made = await createSiteMap(container);
    if (!made) return;
    maplibregl = made.maplibregl;
    const m = made.map;
    map = m;
    followPosition();
    frameOthers();
    drawOthers();
    drawPrevious();
    // The map moved by the diver: the position under the crosshair, once it stops.
    m.on('moveend', (e) => {
      // Only a move the diver made (a drag, the wheel): it carries the pointer's event.
      if (/** @type {any} */ (e).programmatic || !/** @type {any} */ (e).originalEvent) return;
      onmove(positionOf(m.getCenter()));
    });
    if (placeOnClick) m.on('click', (e) => m.easeTo({ center: e.lngLat, duration: 200 }));
    const resize = new ResizeObserver(() => m.resize());
    resize.observe(container);
    m.once('remove', () => resize.disconnect());
  });

  onDestroy(() => map?.remove());

  $effect(() => {
    position;
    followPosition();
  });
  $effect(() => {
    others;
    if (map) {
      drawOthers();
      frameOthers();
    }
  });
  $effect(() => {
    previous;
    position;
    drawPrevious();
  });
</script>

<div class="od-desktop-pos-map" style:height="{height}px">
  <div class="od-desktop-pos-map--canvas" bind:this={container}></div>
  {#if hint}<p class="od-desktop-pos-map--hint">{hint}</p>{/if}
  {#if position || placeOnClick}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="od-desktop-pos-map--cross" onpointerdown={dragCross}>
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
        <path class="od-desktop-pos-map--halo" d={CROSS} />
        <path class="od-desktop-pos-map--stroke" d={CROSS} />
      </svg>
    </div>
  {/if}
  <div class="od-desktop-pos-map--zoom">
    <button type="button" aria-label={t('desktopSites.zoomIn')} onclick={() => map?.zoomIn({ duration: 150 }, { programmatic: true })}><Icon name="plus" size={18} weight={2} /></button>
    <button type="button" aria-label={t('desktopSites.zoomOut')} onclick={() => map?.zoomOut({ duration: 150 }, { programmatic: true })}>
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
    </button>
  </div>
  <p class="od-desktop-pos-map--credits">{t('sites.mapCredits')}</p>
</div>

<style>
  @layer od.components {
    .od-desktop-pos-map {
      position: relative;
      width: 100%;
      overflow: hidden;
      border-radius: 16px;
      background: var(--od-surface-2);
    }
    .od-desktop-pos-map--canvas {
      position: absolute;
      inset: 0;
    }
    .od-desktop-pos-map--hint {
      position: absolute;
      z-index: 2;
      top: 10px;
      left: 10px;
      max-width: calc(100% - 20px);
      margin: 0;
      padding: 6px 12px;
      border-radius: 16px;
      background: var(--od-surface);
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text);
      box-shadow: 0 1px 3px rgb(0 0 0 / 0.2);
      pointer-events: none;
    }
    /* The crosshair on the middle of the map: 28 dp, 2.5 dp blue stroke, white halo. */
    .od-desktop-pos-map--cross {
      position: absolute;
      z-index: 1;
      left: 50%;
      top: 50%;
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      margin: -22px 0 0 -22px;
      cursor: grab;
      touch-action: none;
    }
    .od-desktop-pos-map--halo,
    .od-desktop-pos-map--stroke {
      fill: none;
      stroke-linecap: round;
    }
    .od-desktop-pos-map--halo {
      stroke: var(--od-surface);
      stroke-width: 5.5;
    }
    .od-desktop-pos-map--stroke {
      stroke: var(--od-secondary);
      stroke-width: 2.5;
    }
    :global(.od-desktop-pos-map--previous path) {
      fill: none;
      stroke: var(--od-text-2);
      stroke-width: 1.5;
      stroke-dasharray: 3 2.5;
      stroke-linecap: round;
    }
    /* Nearby sites: 6 dp dots with their names. */
    :global(.od-desktop-pos-map--other) {
      display: flex;
      align-items: center;
      gap: 4px;
      pointer-events: none;
      white-space: nowrap;
    }
    :global(.od-desktop-pos-map--other i) {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--od-text-2);
    }
    :global(.od-desktop-pos-map--other span) {
      font-size: 11px;
      line-height: 14px;
      font-weight: 500;
      color: var(--od-text);
      -webkit-text-stroke: 3px var(--od-surface-2);
      paint-order: stroke fill;
    }
    .od-desktop-pos-map--zoom {
      position: absolute;
      z-index: 2;
      right: 8px;
      bottom: 26px;
      display: flex;
      flex-direction: column;
      border-radius: 8px;
      overflow: hidden;
      background: var(--od-surface);
      box-shadow: 0 1px 3px rgb(0 0 0 / 0.2);
    }
    .od-desktop-pos-map--zoom button {
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      padding: 0;
      border: 0;
      background: none;
      color: var(--od-on-table-selected);
      cursor: pointer;
    }
    .od-desktop-pos-map--zoom button + button {
      border-top: 1px solid var(--od-separator);
    }
    .od-desktop-pos-map--credits {
      position: absolute;
      left: 8px;
      bottom: 4px;
      margin: 0;
      font-size: 10px;
      line-height: 14px;
      color: var(--od-text-2);
      pointer-events: none;
    }
  }
</style>
