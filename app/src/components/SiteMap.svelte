<script>
  // @ts-check
  // Map of dive sites, with MapLibre GL JS (BSD-3-Clause). Tiles: a downloaded
  // region first, else OpenFreeMap's vector tiles (OpenStreetMap data)
  // online, else the simplified world map (see map-style.js). Markers for the sites;
  // with `editable`, a pin fixed at the centre: the diver moves the map under
  // it, and onmove gets the centre (micro-degrees) when the map stops.
  // Every map has the full-screen button (task 2026-11-14-147): the same map,
  // moved over the whole screen, keeps its position, zoom, pins and sources;
  // the system Back, Escape or the button leave it.
  import { onMount, onDestroy, tick } from 'svelte';
  import { t } from '../lib/i18n.js';
  import { mapLabel } from '../lib/map-label.js';
  import Icon from './Icon.svelte';
  import { buildMapStyle, showLabelsInLanguage } from '../lib/map-style.js';
  import { applyZoomCap } from '../lib/offline-tiles.js';
  import { offlineMaps } from '../lib/offline-maps.svelte.js';

  // Loaded when a map is first shown: about 800 KB the start-up does not need.
  /** @type {typeof import('maplibre-gl')} */
  let maplibregl;

  /**
   * @type {{
   *   sites?: { uuid: number, name: string, latUdeg: number, lonUdeg: number, dives?: number }[],
   *   pin?: { latUdeg: number, lonUdeg: number } | null,
   *   editable?: boolean,
   *   onmove?: (pos: { latUdeg: number, lonUdeg: number }) => void,
   *   onselect?: (uuid: number) => void,
   *   onview?: (view: { center: [number, number], bounds: [number, number, number, number], zoom: number }) => void,
   *   height?: string,
   *   matching?: Set<number>|null,
   *   onlocate?: () => void,
   *   overlay?: import('svelte').Snippet<[boolean]>,
   *   points?: { n: number, latUdeg: number, lonUdeg: number }[],
   *   muted?: boolean,
   *   label?: string,
   * }}
   * points: numbered round markers (the dives without a site, task 2026-11-14-148); when
   *   given, the map is framed on them, and the sites are only the places around.
   * muted: the sites as grey pins with their name, not buttons (the places around).
   * label: the map's accessible name, in place of the list of the sites.
   * onlocate: « Centrer sur ma position » in full screen (the screen has its own outside it).
   * overlay: drawn over the map, in and out of full screen (gets whether it is full screen).
   */
  let { sites = [], pin = null, editable = false, onmove, onselect, onview, height = '240px', matching = null, onlocate, overlay, points = [], muted = false, label: givenLabel } = $props();

  /** Full screen: the map is moved to the end of <body>, over everything. */
  let full = $state(false);
  /** @type {HTMLElement|undefined} */
  let root = $state();
  /** @type {HTMLButtonElement|undefined} */
  let fullButton = $state();
  /** The visible map, for the accessible name. @type {[number, number, number, number]|null} */
  let bounds = $state(null);

  /** @param {number} n */
  const divesText = (n) => t('sites.diveCount', { n });
  const PLACE = { centre: 'Centre', north: 'North', northEast: 'NorthEast', east: 'East', southEast: 'SouthEast', south: 'South', southWest: 'SouthWest', west: 'West', northWest: 'NorthWest' };
  const mapName = $derived(t(full ? 'sites.mapFullscreen' : 'sites.map'));
  const label = $derived(
    givenLabel ??
    mapLabel(
      sites.map((s) => ({ name: s.name || t('sites.noName'), lonDeg: s.lonUdeg / 1e6, latDeg: s.latUdeg / 1e6, dives: s.dives ?? 0 })),
      bounds,
      {
        map: mapName,
        withSites: (list) => t('sites.mapWithSites', { map: mapName, list }),
        item: (name, place, dives) => t('sites.mapSite', { name, place: t('sites.mapPlace' + PLACE[place]), dives: divesText(dives) }),
        join: '. ',
      },
    ),
  );

  /** @param {boolean} on */
  function setFull(on) {
    if (full === on) return;
    full = on;
    // The rest of the app is out of reach while the map covers it.
    const app = document.getElementById('app');
    if (app) app.inert = on;
    // The canvas takes its new size at once, and focus follows the button, which
    // changes into its opposite.
    tick().then(() => {
      map?.resize();
      fullButton?.focus(/** @type {any} */ ({ focusVisible: false }));
    });
  }

  /** Moves the map to <body> in full screen and back to its place after. @param {HTMLElement} node @param {boolean} on */
  function lift(node, on) {
    const home = document.createComment('map');
    node.before(home);
    const place = (/** @type {boolean} */ up) => (up ? document.body.append(node) : home.after(node));
    place(on);
    return {
      update: place,
      destroy() {
        home.remove();
        node.remove();
      },
    };
  }

  /** @type {HTMLElement|undefined} */
  let container = $state();
  /** Reactive (not deeply): the pin's effect runs again once it exists. */
  let map = $state.raw(/** @type {import('maplibre-gl').Map|undefined} */ (undefined));
  /** @type {{ uuid: number, marker: import('maplibre-gl').Marker }[]} */
  let markers = [];
  /** @type {import('maplibre-gl').Marker|undefined} */
  let pinMarker;
  /** @type {import('maplibre-gl').Marker[]} */
  let pointMarkers = [];

  const numbers = new Intl.NumberFormat(typeof document === 'undefined' ? undefined : document.documentElement.lang || undefined);

  /** @param {{latUdeg: number, lonUdeg: number}} p */
  const lngLat = (p) => /** @type {[number, number]} */ ([p.lonUdeg / 1e6, p.latUdeg / 1e6]);

  function drawSites() {
    if (!map) return;
    for (const m of markers) m.marker.remove();
    markers = sites.map((site) => {
      // The pin with the number of dives in its head, and the site's name beside it.
      const name = site.name || t('sites.noName');
      // Muted: a grey pin with a white dot and the name on its left, for the eye only
      // (the page says the places in words).
      const el = document.createElement(muted ? 'div' : 'button');
      if (muted) el.setAttribute('aria-hidden', 'true');
      else {
        /** @type {HTMLButtonElement} */ (el).type = 'button';
        el.setAttribute('aria-label', site.dives ? t('sites.mapPin', { name, dives: divesText(site.dives) }) : name);
      }
      el.className = muted ? 'od-site-map--site-marker od-site-map--muted' : 'od-site-map--site-marker';
      const svg = 'http://www.w3.org/2000/svg';
      const drawing = document.createElementNS(svg, 'svg');
      drawing.setAttribute('class', 'od-site-map--pin');
      drawing.setAttribute('width', '32');
      drawing.setAttribute('height', '42');
      drawing.setAttribute('viewBox', '-16 -40 32 42');
      drawing.setAttribute('aria-hidden', 'true');
      const head = document.createElementNS(svg, 'path');
      head.setAttribute('d', 'M0 0c-9-11-14-17-14-24a14 14 0 0 1 28 0c0 7-5 13-14 24z');
      drawing.append(head);
      if (muted) {
        const dot = document.createElementNS(svg, 'circle');
        dot.setAttribute('cy', '-24');
        dot.setAttribute('r', '5');
        drawing.append(dot);
      } else if (site.dives) {
        const count = document.createElementNS(svg, 'text');
        count.setAttribute('x', '0');
        count.setAttribute('y', '-19.5');
        count.textContent = numbers.format(site.dives);
        drawing.append(count);
      }
      const text = document.createElement('span');
      text.className = 'od-site-map--pin-name';
      text.setAttribute('aria-hidden', 'true');
      text.textContent = name;
      el.append(drawing, text);
      if (!muted) el.addEventListener('click', () => onselect?.(site.uuid));
      // The drawing's tip (x 16, 2 px above its bottom) on the site.
      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, 2] })
        .setLngLat(lngLat(site))
        .addTo(/** @type {import('maplibre-gl').Map} */ (map));
      return { uuid: site.uuid, marker };
    });
    dim();
  }

  /** The numbered markers: a 22 dp ink circle, white number, 2 dp white ring. */
  function drawPoints() {
    if (!map) return;
    for (const m of pointMarkers) m.remove();
    pointMarkers = points.map((p) => {
      const el = document.createElement('div');
      el.className = 'od-site-map--point';
      el.setAttribute('aria-hidden', 'true');
      el.textContent = numbers.format(p.n);
      return new maplibregl.Marker({ element: el }).setLngLat(lngLat(p)).addTo(/** @type {import('maplibre-gl').Map} */ (map));
    });
  }

  /** During a search, the markers that do not match fade to 30 %. */
  function dim() {
    for (const { uuid, marker } of markers) marker.getElement().classList.toggle('od-site-map--dim', !!matching && !matching.has(uuid));
  }

  $effect(() => {
    matching;
    dim();
  });

  /** The place the map looks at, to come back to it. */
  export function getView() {
    return map ? { center: map.getCenter(), zoom: map.getZoom() } : null;
  }

  /** @param {{ center: import('maplibre-gl').LngLat, zoom: number }|null} v */
  export function setView(v) {
    if (map && v) map.easeTo({ center: v.center, zoom: v.zoom, duration: 200 }, { programmatic: true });
  }

  function fit() {
    if (!map) return;
    // Numbered points frame the map; the sites are then only what lies around.
    const framed = points.length ? points.map(lngLat) : [...sites.map(lngLat), ...(pin ? [lngLat(pin)] : [])];
    if (framed.length === 1) {
      map.jumpTo({ center: framed[0], zoom: 13 }, { programmatic: true });
    } else if (framed.length > 1) {
      const bounds = framed.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(framed[0], framed[0]));
      map.fitBounds(bounds, { padding: 40, maxZoom: points.length ? 14 : 12, animate: false }, { programmatic: true });
    }
  }

  onMount(async () => {
    if (!container) return;
    const module = await import('maplibre-gl');
    maplibregl = /** @type {any} */ (module).default ?? module;
    const { style } = await buildMapStyle(maplibregl);
    if (!container?.isConnected) return;
    const m = new maplibregl.Map({
      container,
      style,
      center: [0, 20],
      zoom: 1,
      // The credits are a short line of text at the bottom right (below).
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    map = m;
    m.touchZoomRotate.disableRotation();
    // Follow the size of the container (full screen on the edit screen).
    const resize = new ResizeObserver(() => map?.resize({ programmatic: true }));
    resize.observe(container);
    m.once('remove', () => resize.disconnect());
    m.on('load', () => {
      showLabelsInLanguage(m);
      drawSites();
      drawPoints();
      fit();
      readBounds();
    });
    // Where the map looks, for the offline hint (Sites).
    m.on('moveend', () => {
      // Offline over a region of less detail (zoom 12), the map does not zoom further.
      applyZoomCap(m);
      readBounds();
      const b = m.getBounds();
      const c = m.getCenter();
      onview?.({ center: [c.lng, c.lat], bounds: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], zoom: m.getZoom() });
    });
    if (editable) {
      // The position under the pin, once the map stops; moves made by the
      // code (typed coordinates, device position) are not sent back.
      m.on('moveend', (e) => {
        if (/** @type {any} */ (e).programmatic) return;
        const c = m.getCenter();
        onmove?.({ latUdeg: Math.round(c.lat * 1e6), lonUdeg: Math.round(c.lng * 1e6) });
      });
      // A tap brings that point under the pin.
      m.on('click', (e) => m.easeTo({ center: e.lngLat }));
    }
  });

  function readBounds() {
    if (!map) return;
    const b = map.getBounds();
    bounds = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
  }

  // The connection or the regions change: the zoom cap follows.
  $effect(() => {
    offlineMaps.online;
    offlineMaps.regions.map((r) => `${r.status}${r.maxZoom}`);
    if (map) applyZoomCap(map);
  });

  /**
   * Centres the map on a position ("centre on my position" of the Sites map).
   * @param {{latUdeg: number, lonUdeg: number}} p
   */
  export function centreOn(p) {
    map?.easeTo({ center: lngLat(p), zoom: Math.max(map.getZoom(), 11) }, { programmatic: true });
  }

  /** Frames a region. @param {[number, number, number, number]} bbox west, south, east, north */
  export function fitBbox([west, south, east, north]) {
    map?.fitBounds([[west, south], [east, north]], { padding: 24, animate: false }, { programmatic: true });
  }

  // Editable: the map brings a position set by the code (typed, from the
  // device, the site's own) under the fixed pin; one the diver chose by moving
  // the map is already there.
  $effect(() => {
    if (!map || !editable || !pin) return;
    const c = map.getCenter();
    if (Math.round(c.lat * 1e6) === pin.latUdeg && Math.round(c.lng * 1e6) === pin.lonUdeg) return;
    map.easeTo({ center: lngLat(pin), zoom: Math.max(map.getZoom(), 12) }, { programmatic: true });
  });

  // Read-only: a marker at the position.
  $effect(() => {
    if (!map || !container || editable) return;
    if (!pin) {
      pinMarker?.remove();
      pinMarker = undefined;
      return;
    }
    // A marker needs its position before it is added to the map.
    if (pinMarker) pinMarker.setLngLat(lngLat(pin));
    else
      pinMarker = new maplibregl.Marker({ color: getComputedStyle(container).getPropertyValue('--od-text').trim() || '#1F2124' })
        .setLngLat(lngLat(pin))
        .addTo(map);
  });

  $effect(() => {
    sites;
    if (map?.loaded()) {
      drawSites();
    }
  });

  $effect(() => {
    points;
    if (map?.loaded()) {
      drawPoints();
      fit();
    }
  });

  onDestroy(() => {
    if (full) setFull(false);
    map?.remove();
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="od-site-map no-swipeback"
  class:od-map-fullscreen={full}
  style:height={full ? '100%' : height}
  role="region"
  aria-label={label}
  bind:this={root}
  use:lift={full}
  onod-cancel={() => setFull(false)}
  onkeydown={(e) => {
    if (full && e.key === 'Escape') setFull(false);
  }}
>
  <div class="od-site-map--canvas" bind:this={container}></div>
  {#if editable}
    <!-- The tip of the pin is the centre of the map. -->
    <svg class="od-site-map--center-pin" width="32" height="42" viewBox="-16 -40 32 42" aria-hidden="true">
      <path d="M0 0c-9-11-14-17-14-24a14 14 0 0 1 28 0c0 7-5 13-14 24z" />
      <circle cx="0" cy="-24" r="5" />
    </svg>
  {/if}
  {@render overlay?.(full)}
  <!-- Credits asked by OpenStreetMap's licence and the tile provider. -->
  <p class="od-site-map--credits">{t('sites.mapCredits')}</p>
  <button type="button" class="od-map-fullscreen-button" bind:this={fullButton} onclick={() => setFull(!full)}>
    <Icon name={full ? 'exitFullscreen' : 'fullscreen'} size={22} weight={2} />
    <span class="od-sr-only">{t(full ? 'sites.exitFullscreen' : 'sites.fullscreen')}</span>
  </button>
  {#if full && onlocate}
    <button type="button" class="od-map-fullscreen-button od-map-fullscreen--locate" onclick={onlocate}>
      <Icon name="locate" size={22} />
      <span class="od-sr-only">{t('sites.centreOnMe')}</span>
    </button>
  {/if}
</div>

<style>
  @layer od.components {
    .od-site-map {
      position: relative;
      width: 100%;
      background: var(--od-surface-2);
    }

    .od-site-map--canvas {
      position: absolute;
      inset: 0;
    }

    /* Full screen (od-map-fullscreen, sites-carte-plein-ecran-android): edge to edge,
       under the status bar, over every bar of the app. */
    .od-site-map.od-map-fullscreen {
      position: fixed;
      inset: 0;
      z-index: 12000;
    }

    /* The full-screen button (od-map-fullscreen-button): a white square, 40 dp (44 pt on
       iOS), 12 dp corners, light shadow, 22 dp icon in ink. Where it sits is the
       screen's choice (--od-map-button-top, --od-map-button-right): by default 8 dp
       from the top right of the map. */
    .od-map-fullscreen-button {
      position: absolute;
      z-index: 2;
      top: var(--od-map-button-top, 8px);
      right: var(--od-map-button-right, 8px);
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

      /* A 48 dp target around the 40 dp square. */
      &::after {
        content: '';
        position: absolute;
        inset: -4px;
      }

      .od-map-fullscreen & {
        top: calc(var(--f7-safe-area-top, env(safe-area-inset-top)) + 8px);
        right: 16px;
      }
    }

    /* Full screen: « Centrer sur ma position » at the bottom right, above the credits. */
    .od-map-fullscreen .od-map-fullscreen-button.od-map-fullscreen--locate {
      top: auto;
      bottom: calc(env(safe-area-inset-bottom) + 56px);
    }

    .od-site-map--credits {
      position: absolute;
      z-index: 1;
      top: var(--od-map-credits-top, auto);
      right: var(--od-map-credits-right, 8px);
      bottom: var(--od-map-credits-bottom, 4px);
      max-width: calc(100% - 16px);
      margin: 0;
      padding: 2px 6px;
      border-radius: 4px;
      background: color-mix(in srgb, var(--od-surface) 85%, transparent);

      :global(html.od-high-contrast) & {
        background: var(--od-surface);
      }
      color: var(--od-text-2);
      font-size: 11px;
      line-height: 14px;
      pointer-events: none;

      .od-map-fullscreen & {
        top: auto;
        right: 8px;
        bottom: calc(env(safe-area-inset-bottom) + 24px);
      }
    }

    :global(.od-site-map--point) {
      box-sizing: border-box;
      width: 22px;
      height: 22px;
      border: 2px solid var(--od-surface);
      border-radius: 50%;
      background: var(--od-text);
      color: var(--od-surface);
      font-size: 13px;
      font-weight: 700;
      line-height: 18px;
      text-align: center;
      font-variant-numeric: tabular-nums;
      box-shadow: 0 1px 2px rgb(0 0 0 / 0.3);
    }

    .od-site-map--center-pin {
      position: absolute;
      left: 50%;
      top: 50%;
      /* The tip (y = 0 of the drawing, 2 px above its bottom) on the centre. */
      transform: translate(-50%, calc(-100% + 2px));
      pointer-events: none;
      filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.35));

      path {
        fill: var(--od-text);
        stroke: var(--od-surface);
        stroke-width: 2;
      }

      circle {
        fill: var(--od-surface);
      }
    }

    /* A pin per site (no grouping, even when pins overlap): ink, with the number of
       dives, white, 13 sp, bold, in its head; the name beside it, ink with a 4 dp
       white halo. */
    :global(.od-site-map--site-marker) {
      width: 32px;
      height: 42px;
      padding: 0;
      border: none;
      background: none;
      cursor: pointer;
      transition: opacity 150ms linear;

      :global(.od-site-map--pin) {
        display: block;
        overflow: visible;
        filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.3));
      }

      :global(.od-site-map--pin path) {
        fill: var(--od-text);
        stroke: var(--od-surface);
        stroke-width: 2;
      }

      :global(.od-site-map--pin text) {
        fill: var(--od-surface);
        font-size: 13px;
        font-weight: 700;
        text-anchor: middle;
        font-variant-numeric: tabular-nums;
      }

      /* Baseline 20 px above the tip, 18 px right of it, as drawn. */
      :global(.od-site-map--pin-name) {
        position: absolute;
        left: 34px;
        top: 6px;
        white-space: nowrap;
        font-size: 14px;
        line-height: 18px;
        font-weight: 500;
        color: var(--od-text);
        -webkit-text-stroke: 4px var(--od-surface);
        paint-order: stroke fill;
        pointer-events: none;
      }

      /* !important: MapLibre sets an inline opacity on every marker. */
      &.od-site-map--dim {
        opacity: 0.3 !important;
      }

      /* The places around: a smaller grey pin, white dot, name on its left in
         the secondary text colour, 13 sp. */
      &:global(.od-site-map--muted) {
        width: 28px;
        height: 36px;
        cursor: default;

        :global(.od-site-map--pin) {
          width: 28px;
          height: 36px;
        }

        :global(.od-site-map--pin path) {
          fill: var(--od-map-pin-muted);
        }

        :global(.od-site-map--pin circle) {
          fill: var(--od-surface);
        }

        :global(.od-site-map--pin-name) {
          left: auto;
          right: 32px;
          top: 2px;
          font-size: 13px;
          color: var(--od-text-2);
        }

        &::after {
          content: none;
        }
      }

      /* A 48 dp touch target around the pin: MapLibre places the marker with
         position: absolute, which also holds the target (no position here,
         which would win over MapLibre's layer). */
      &::after {
        content: '';
        position: absolute;
        inset: -3px -8px;
      }
    }
  }
</style>
