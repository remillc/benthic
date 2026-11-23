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
  import { loadMapLibre } from '../lib/maplibre.js';
  import { onMount, onDestroy, tick } from 'svelte';
  import { t } from '../lib/i18n.js';
  import { mapLabel } from '../lib/map-label.js';
  import { createHeatScale, rgb, SPOT_GRADIENTS, SPOT_OPACITY, spotKind, spotRadius } from '../lib/heat-density.js';
  import Icon from './Icon.svelte';
  import { buildMapStyle, showLabelsInLanguage } from '../lib/map-style.js';
  import { stackPins } from '../lib/desktop-sites.js';

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
   *   ratio?: number,
   *   matching?: Set<number>|null,
   *   onlocate?: () => void,
   *   overlay?: import('svelte').Snippet<[boolean]>,
   *   points?: { n: number, latUdeg: number, lonUdeg: number }[],
   *   muted?: boolean,
   *   label?: string,
   *   names?: 'always'|'fewInFullScreen'|'never'|'atZoom'|'atZoomOrFewInFullScreen',
   *   namesFromZoom?: number,
   *   hideDiveCounts?: boolean,
   *   groupSites?: boolean,
   *   selected?: number|null,
   *   onstack?: (uuids: number[], at: { latUdeg: number, lonUdeg: number }) => void,
   *   onmapclick?: () => void,
   *   stackAt?: { latUdeg: number, lonUdeg: number }|null,
   *   heat?: { lon: number, lat: number, count: number }[]|null,
   *   frame?: [number, number][]|null,
   *   credits?: boolean,
   *   desaturated?: boolean,
   *   fullscreenLabel?: string,
   *   closerInFullScreen?: boolean,
   *   pinsFromZoom?: number,
   *   base?: { sites: { id: string, name: string, lat: number, lon: number, mine: boolean, label: string }[], clusters: { lat: number, lon: number, count: number }[] }|null,
   *   baseSelected?: string|null,
   *   onbaseselect?: (id: string) => void,
   * }}
   * base: the shared map of dive sites (task 2026-11-19-315): its sites as teal dots (a base site the diver already has is
   *   not drawn: the diver's own pin is there) and its crowded cells as numbered teal clusters; a tap on a cluster zooms in.
   * baseSelected: the base site whose dot is selected; onbaseselect: a tap on a dot.
   * pinsFromZoom: the pins show only from this zoom, and the heat fades out over the zoom
   *   level before it (the heat map up close, task 2026-11-14-155); 0: always.
   * heat: the dives per site drawn as a density over the map (« Où je plonge le plus »,
   *   task 2026-11-14-154; lib/heat-density.js), on its own layer: the base map can be
   *   desaturated without the heat.
   * frame: the points the map opens on (lon, lat), in place of the sites.
   * credits: the OpenStreetMap line (not on the heat map: it is in About).
   * desaturated: the base map at about 25 % saturation.
   * fullscreenLabel: the full-screen button's name, when not « Afficher la carte en plein écran ».
   * closerInFullScreen: full screen opens on the same area, slightly closer.
   * names: « fewInFullScreen » (Sites, task 2026-11-14-150): the names show only in full
   *   screen, with 8 pins or fewer in view and no two names overlapping.
   *   « atZoom » shows site names from namesFromZoom, including shared sites;
   *   « atZoomOrFewInFullScreen » also keeps the full-screen overlap rule.
   * hideDiveCounts: omit dive counts from pins and the map's accessible name.
   * groupSites: group nearby personal sites into a marker that opens their list.
   * selected: the site whose pin is selected (1.3×, a halo in the secondary colour, in front).
   * onstack: a tap that touches several pins (within the 48 dp target) gives them all.
   * onmapclick: a tap on the map, not on a pin.
   * stackAt: where the touched pins are, marked by a blue disc.
   * points: numbered round markers (the dives without a site, task 2026-11-14-148); when
   *   given, the map is framed on them, and the sites are only the places around.
   * muted: the sites as grey pins with their name, not buttons (the places around).
   * label: the map's accessible name, in place of the list of the sites.
   * onlocate: « Centrer sur ma position » in full screen (the screen has its own outside it).
   * overlay: drawn over the map, in and out of full screen (gets whether it is full screen).
   */
  let {
    sites = [],
    pin = null,
    editable = false,
    onmove,
    onselect,
    onview,
    height = '240px',
    ratio = 0,
    matching = null,
    onlocate,
    overlay,
    points = [],
    muted = false,
    label: givenLabel,
    names = 'always',
    namesFromZoom = 13,
    hideDiveCounts = false,
    groupSites = false,
    selected = null,
    onstack,
    onmapclick,
    stackAt = null,
    heat = null,
    frame = null,
    credits = true,
    desaturated = false,
    fullscreenLabel = '',
    closerInFullScreen = false,
    pinsFromZoom = 0,
    base = null,
    baseSelected = null,
    onbaseselect,
  } = $props();

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
  const selectedName = $derived(selected === null ? '' : (sites.find((x) => x.uuid === selected)?.name ?? ''));
  const sitesLabel = $derived(
    mapLabel(
      sites.map((s) => ({ name: s.name || t('sites.noName'), lonDeg: s.lonUdeg / 1e6, latDeg: s.latUdeg / 1e6, dives: s.dives ?? 0 })),
      bounds,
      {
        map: mapName,
        withSites: (list) => t('sites.mapWithSites', { map: mapName, list }),
        item: (name, place, dives) => hideDiveCounts
          ? t('sites.mapSiteWithoutDives', { name, place: t('sites.mapPlace' + PLACE[place]) })
          : t('sites.mapSite', { name, place: t('sites.mapPlace' + PLACE[place]), dives: divesText(dives) }),
        join: '. ',
      },
    ),
  );
  /** The map's accessible name, with the selected pin (task 2026-11-14-150). */
  const label = $derived(givenLabel ?? (selectedName ? `${sitesLabel}. ${t('sites.mapSelected', { name: selectedName })}` : sitesLabel));

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
      if (closerInFullScreen && map) map.zoomTo(map.getZoom() + (on ? 0.6 : -0.6), { duration: 0 }, { programmatic: true });
      drawHeat();
      fullButton?.focus(/** @type {any} */ ({ focusVisible: false }));
    });
  }

  /** @type {HTMLCanvasElement|undefined} */
  let heatCanvas = $state();
  let heatFrame = 0;
  /** The colour scale: the densest value of the filter at the opening framing, fixed while exploring (tasks 155, 162). */
  const heatScale = createHeatScale();

  /** The density of the dives over the visible map, on the heat's own layer. */
  function drawHeat() {
    if (!map || !heatCanvas || !heat?.length) return;
    const w = container?.clientWidth ?? 0;
    const h = container?.clientHeight ?? 0;
    if (!w || !h) return;
    const zoom = map.getZoom();
    const m = map;
    // D: the busiest site's dives in the filter, set once per filter (tasks 155, 162).
    const scale = heatScale.measure(Math.max(...heat.map((p) => p.count)));
    const styles = getComputedStyle(heatCanvas);
    /** @type {Record<string, [number, number, number]>} */
    const colours = {};
    const colour = (/** @type {string} */ v) => (colours[v] ??= rgb(styles.getPropertyValue(v) || '#000000'));
    const dpr = window.devicePixelRatio || 1;
    heatCanvas.width = Math.round(w * dpr);
    heatCanvas.height = Math.round(h * dpr);
    const ctx = /** @type {CanvasRenderingContext2D} */ (heatCanvas.getContext('2d'));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = SPOT_OPACITY;
    // One spot per site, as the mock-up draws them: the busiest painted last, on top; spots
    // cover one another rather than adding up (heat-density.js, SPOT_GRADIENTS).
    for (const p of [...heat].sort((a, b) => a.count - b.count)) {
      const r = spotRadius(p.count, scale, zoom);
      const { x, y } = m.project([p.lon, p.lat]);
      if (x < -r || y < -r || x > w + r || y > h + r) continue;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
      for (const stop of SPOT_GRADIENTS[spotKind(p.count, scale)]) {
        const [cr, cg, cb] = colour(stop.colour);
        gradient.addColorStop(stop.offset, `rgba(${cr}, ${cg}, ${cb}, ${stop.alpha})`);
      }
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function scheduleHeat() {
    if (!heat?.length || heatFrame) return;
    heatFrame = requestAnimationFrame(() => {
      heatFrame = 0;
      drawHeat();
    });
  }

  /** Leaves full screen (a site opened from the card of a selected pin). */
  export function exitFullScreen() {
    setFull(false);
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
  /** @type {{ uuid: number, uuids: number[], marker: import('maplibre-gl').Marker }[]} */
  let markers = [];
  /** @type {import('maplibre-gl').Marker|undefined} */
  let pinMarker;
  /** @type {import('maplibre-gl').Marker[]} */
  let pointMarkers = [];
  /** @type {import('maplibre-gl').Marker|undefined} */
  let stackMarker;
  /** Whether names controlled by the map's display mode are shown. */
  let namesOn = $state(false);

  const numbers = new Intl.NumberFormat(typeof document === 'undefined' ? undefined : document.documentElement.lang || undefined);

  /** @param {{latUdeg: number, lonUdeg: number}} p */
  const lngLat = (p) => /** @type {[number, number]} */ ([p.lonUdeg / 1e6, p.latUdeg / 1e6]);

  function drawSites() {
    if (!map) return;
    for (const m of markers) m.marker.remove();
    // The most dived on top (drawn last), so that the busy sites stay visible.
    const ordered = [...sites].sort((a, b) => (a.dives ?? 0) - (b.dives ?? 0));
    const m = map;
    const groups = groupSites
      ? stackPins(ordered.map((site) => ({ uuid: site.uuid, ...m.project(lngLat(site)) })), 16)
      : ordered.map((site) => ({ uuids: [site.uuid] }));
    markers = groups.map((group) => {
      const site = /** @type {typeof sites[number]} */ (ordered.find((s) => s.uuid === group.uuids[0]));
      if (group.uuids.length > 1) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'bc-site-map--personal-cluster';
        el.textContent = numbers.format(group.uuids.length);
        el.setAttribute('aria-label', t('sites.stackTitle', { n: group.uuids.length }));
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          onstack?.(group.uuids, { latUdeg: site.latUdeg, lonUdeg: site.lonUdeg });
        });
        const marker = new maplibregl.Marker({ element: el }).setLngLat(lngLat(site)).addTo(m);
        return { uuid: site.uuid, uuids: group.uuids, marker };
      }
      // The pin with the number of dives in its head, and the site's name beside it.
      const name = site.name || t('sites.noName');
      // Muted: a grey pin with a white dot and the name on its left, for the eye only
      // (the page says the places in words).
      const el = document.createElement(muted ? 'div' : 'button');
      if (muted) el.setAttribute('aria-hidden', 'true');
      else {
        /** @type {HTMLButtonElement} */ (el).type = 'button';
        el.setAttribute('aria-label', !hideDiveCounts && site.dives ? t('sites.mapPin', { name, dives: divesText(site.dives) }) : name);
      }
      el.className = muted ? 'bc-site-map--site-marker bc-site-map--muted' : 'bc-site-map--site-marker';
      const svg = 'http://www.w3.org/2000/svg';
      const drawing = document.createElementNS(svg, 'svg');
      drawing.setAttribute('class', 'bc-site-map--pin');
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
      } else if (!hideDiveCounts && site.dives) {
        const count = document.createElementNS(svg, 'text');
        count.setAttribute('x', '0');
        count.setAttribute('y', '-19.5');
        count.textContent = numbers.format(site.dives);
        drawing.append(count);
      }
      const text = document.createElement('span');
      text.className = 'bc-site-map--pin-name';
      text.setAttribute('aria-hidden', 'true');
      text.textContent = name;
      el.append(drawing, text);
      el.dataset.uuid = String(site.uuid);
      if (!muted) el.addEventListener('click', (e) => pick(site.uuid, /** @type {MouseEvent} */ (e)));
      // The drawing's tip (x 16, 2 px above its bottom) on the site.
      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, 2] })
        .setLngLat(lngLat(site))
        .addTo(/** @type {import('maplibre-gl').Map} */ (map));
      return { uuid: site.uuid, uuids: group.uuids, marker };
    });
    dim();
    mark();
    if (names !== 'always') queueMicrotask(updateNames);
  }

  /**
   * A tap on a pin: the pins whose head is within the 48 dp target around the tap.
   * One: it is selected; several: they are given together (bc-map-stack-sheet).
   * @param {number} uuid the pin that took the tap
   * @param {MouseEvent} e
   */
  function pick(uuid, e) {
    e.stopPropagation();
    const near = [];
    for (const m of markers) {
      const box = m.marker.getElement().getBoundingClientRect();
      if (!box.width || m.uuids.length > 1) continue;
      // The head's centre: 16 px from the left and the top of the 32 × 42 drawing.
      const dx = box.left + box.width / 2 - e.clientX;
      const dy = box.top + (16 * box.height) / 42 - e.clientY;
      if (Math.hypot(dx, dy) <= 24) near.push(m.uuid);
    }
    if (near.length > 1 && onstack && map) {
      const at = map.unproject([e.clientX - map.getContainer().getBoundingClientRect().left, e.clientY - map.getContainer().getBoundingClientRect().top]);
      onstack(near, { latUdeg: Math.round(at.lat * 1e6), lonUdeg: Math.round(at.lng * 1e6) });
    } else onselect?.(uuid);
  }

  /** The selected pin: larger, with a halo, in front. */
  function mark() {
    for (const { uuids, marker } of markers) {
      const on = selected !== null && uuids.includes(selected);
      const el = marker.getElement();
      el.classList.toggle('bc-site-map--selected', on);
      el.style.zIndex = on ? '2' : '';
    }
  }

  $effect(() => {
    selected;
    mark();
  });

  // The blue disc where several pins were touched.
  $effect(() => {
    if (!map) return;
    if (!stackAt) {
      stackMarker?.remove();
      stackMarker = undefined;
      return;
    }
    if (!stackMarker) {
      const el = document.createElement('div');
      el.className = 'bc-site-map--stack-disc';
      el.setAttribute('aria-hidden', 'true');
      stackMarker = new maplibregl.Marker({ element: el }).setLngLat(lngLat(stackAt)).addTo(map);
    } else stackMarker.setLngLat(lngLat(stackAt));
  });

  /**
   * Names follow the zoom in shared mode, or the full-screen overlap rule in personal mode.
   */
  function updateNames() {
    if (names === 'always' || !map) return;
    let on = false;
    if (names === 'atZoom' || names === 'atZoomOrFewInFullScreen') {
      on = map.getZoom() >= Math.min(namesFromZoom, map.getMaxZoom());
    }
    if (!on && full && (names === 'fewInFullScreen' || names === 'atZoomOrFewInFullScreen')) {
      const b = map.getBounds();
      const inView = markers.filter((m) => m.uuids.length === 1 && b.contains(m.marker.getLngLat()));
      if (inView.length <= 8) {
        // Measured with the names shown.
        root?.classList.add('bc-site-map--names-on');
        const boxes = inView.map((m) => /** @type {HTMLElement} */ (m.marker.getElement().querySelector('.bc-site-map--pin-name')).getBoundingClientRect());
        on = !boxes.some((a, i) => boxes.some((c, j) => j > i && a.left < c.right && c.left < a.right && a.top < c.bottom && c.top < a.bottom));
      }
    }
    // The state draws the class (Svelte rewrites the class attribute); the class set by hand above was for the measure.
    root?.classList.toggle('bc-site-map--names-on', on);
    namesOn = on;
  }

  $effect(() => {
    full;
    names;
    namesFromZoom;
    if (map?.loaded()) tick().then(updateNames);
  });

  /** The numbered markers: a 22 dp ink circle, white number, 2 dp white ring. */
  function drawPoints() {
    if (!map) return;
    for (const m of pointMarkers) m.remove();
    pointMarkers = points.map((p) => {
      const el = document.createElement('div');
      el.className = 'bc-site-map--point';
      el.setAttribute('aria-hidden', 'true');
      el.textContent = numbers.format(p.n);
      return new maplibregl.Marker({ element: el }).setLngLat(lngLat(p)).addTo(/** @type {import('maplibre-gl').Map} */ (map));
    });
  }

  /** @type {import('maplibre-gl').Marker[]} */
  let baseMarkers = [];

  /** The shared map's dots (16 dp) and clusters (32 dp, the count inside), teal with a white ring. */
  function drawBase() {
    if (!map) return;
    for (const m of baseMarkers) m.remove();
    baseMarkers = [];
    if (!base) return;
    const m = map;
    for (const c of base.clusters) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'bc-site-map--base bc-site-map--base-cluster';
      el.textContent = numbers.format(c.count);
      el.setAttribute('aria-label', t('sharedSites.clusterLabel', { n: c.count }));
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        m.easeTo({ center: [c.lon, c.lat], zoom: Math.min(m.getZoom() + 2, 16) });
      });
      baseMarkers.push(new maplibregl.Marker({ element: el }).setLngLat([c.lon, c.lat]).addTo(m));
    }
    for (const s of base.sites) {
      if (s.mine) continue;
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'bc-site-map--base bc-site-map--base-site';
      el.classList.toggle('bc-site-map--base-selected', s.id === baseSelected);
      el.dataset.baseId = s.id;
      el.setAttribute('aria-label', s.label);
      const text = document.createElement('span');
      text.className = 'bc-site-map--base-name';
      text.setAttribute('aria-hidden', 'true');
      text.textContent = s.name;
      el.append(text);
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onbaseselect?.(s.id);
      });
      baseMarkers.push(new maplibregl.Marker({ element: el }).setLngLat([s.lon, s.lat]).addTo(m));
    }
  }

  $effect(() => {
    base;
    if (map?.loaded()) drawBase();
  });

  $effect(() => {
    const id = baseSelected;
    for (const m of baseMarkers) {
      const el = m.getElement();
      el.classList.toggle('bc-site-map--base-selected', !!id && el.dataset.baseId === id);
    }
  });

  /** During a search, the markers that do not match fade to 30 %. */
  function dim() {
    for (const { uuids, marker } of markers) marker.getElement().classList.toggle('bc-site-map--dim', !!matching && !uuids.some((uuid) => matching.has(uuid)));
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
    // A given frame first; numbered points frame the map; the sites are then only what lies around.
    const framed = frame?.length ? frame : points.length ? points.map(lngLat) : [...sites.map(lngLat), ...(pin ? [lngLat(pin)] : [])];
    if (framed.length === 1) {
      map.jumpTo({ center: framed[0], zoom: 13 }, { programmatic: true });
    } else if (framed.length > 1) {
      const bounds = framed.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(framed[0], framed[0]));
      map.fitBounds(bounds, { padding: 40, maxZoom: points.length || frame?.length ? 14 : 12, animate: false }, { programmatic: true });
    }
    heatScale.reset();
    zoomLayers();
  }

  let pinsHidden = $state(false);

  /** Up close (pinsFromZoom): the heat fades out over the zoom level before, the pins show from it. */
  function zoomLayers() {
    if (!pinsFromZoom || !map) return;
    const z = map.getZoom();
    if (heatCanvas) heatCanvas.style.opacity = String(Math.max(0, Math.min(1, pinsFromZoom - z)));
    // A state, not a class set by hand: Svelte rewrites the root's class attribute.
    pinsHidden = z < pinsFromZoom;
  }

  onMount(async () => {
    if (!container) return;
    const module = await loadMapLibre();
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
      drawBase();
      fit();
      readBounds();
      drawHeat();
    });
    // The heat follows the map as it moves.
    m.on('move', scheduleHeat);
    m.on('zoom', () => {
      zoomLayers();
      if (names === 'atZoom' || names === 'atZoomOrFewInFullScreen') updateNames();
    });
    m.on('resize', scheduleHeat);
    // Where the map looks (Sites).
    m.on('moveend', () => {
      readBounds();
      if (groupSites) drawSites();
      updateNames();
      const b = m.getBounds();
      const c = m.getCenter();
      onview?.({ center: [c.lng, c.lat], bounds: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], zoom: m.getZoom() });
    });
    // A tap on the map, not on a pin (a pin's tap stops at the pin).
    m.on('click', (e) => {
      if (/** @type {HTMLElement|null} */ (e.originalEvent?.target)?.closest?.('.bc-site-map--site-marker, .bc-site-map--base')) return;
      onmapclick?.();
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
      pinMarker = new maplibregl.Marker({ color: getComputedStyle(container).getPropertyValue('--bc-text').trim() || '#1F2124' })
        .setLngLat(lngLat(pin))
        .addTo(map);
    // It shows a position and does nothing: the arrow, not the hand that maplibre's button role gives it.
    pinMarker.getElement().style.cursor = 'default';
  });

  $effect(() => {
    sites;
    hideDiveCounts;
    groupSites;
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

  // Another filter: the heat and its framing follow.
  $effect(() => {
    heat;
    frame;
    if (heat && map?.loaded()) {
      fit();
      drawHeat();
    }
  });

  onDestroy(() => {
    if (heatFrame) cancelAnimationFrame(heatFrame);
    if (full) setFull(false);
    map?.remove();
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="bc-site-map no-swipeback"
  class:bc-map-fullscreen={full}
  class:bc-site-map--quiet={names !== 'always'}
  class:bc-site-map--desaturated={desaturated}
  class:bc-site-map--pins-hidden={pinsHidden}
  class:bc-site-map--names-on={namesOn}
  style:height={full ? '100%' : ratio ? 'auto' : height}
  style:aspect-ratio={!full && ratio ? `${ratio} / 1` : null}
  role="region"
  aria-label={label}
  bind:this={root}
  use:lift={full}
  onbc-cancel={() => setFull(false)}
  onkeydown={(e) => {
    if (full && e.key === 'Escape') setFull(false);
  }}
>
  <div class="bc-site-map--canvas" bind:this={container}></div>
  {#if heat?.length}<canvas class="bc-site-map--heat" bind:this={heatCanvas} aria-hidden="true"></canvas>{/if}
  {#if editable}
    <!-- The tip of the pin is the centre of the map. -->
    <svg class="bc-site-map--center-pin" width="32" height="42" viewBox="-16 -40 32 42" aria-hidden="true">
      <path d="M0 0c-9-11-14-17-14-24a14 14 0 0 1 28 0c0 7-5 13-14 24z" />
      <circle cx="0" cy="-24" r="5" />
    </svg>
  {/if}
  {@render overlay?.(full)}
  <!-- Credits asked by OpenStreetMap's licence and the tile provider. -->
  {#if credits}<p class="bc-site-map--credits">{#if base}{t('sharedSites.mapCredits')}<br />{/if}{t('sites.mapCredits')}</p>{/if}
  <button type="button" class="bc-map-fullscreen-button" bind:this={fullButton} onclick={() => setFull(!full)}>
    <Icon name={full ? 'exitFullscreen' : 'fullscreen'} size={22} weight={2} />
    <span class="bc-sr-only">{full ? t('sites.exitFullscreen') : fullscreenLabel || t('sites.fullscreen')}</span>
  </button>
  {#if full && onlocate}
    <button type="button" class="bc-map-fullscreen-button bc-map-fullscreen--locate" onclick={onlocate}>
      <Icon name="locate" size={22} />
      <span class="bc-sr-only">{t('sites.centreOnMe')}</span>
    </button>
  {/if}
</div>

<style>
  @layer bc.components {
    .bc-site-map {
      position: relative;
      width: 100%;
      background: var(--bc-surface-2);
    }

    .bc-site-map--canvas {
      position: absolute;
      inset: 0;
    }

    /* Full screen (bc-map-fullscreen, sites-carte-plein-ecran-android): edge to edge,
       under the status bar, over every bar of the app. */
    .bc-site-map.bc-map-fullscreen {
      position: fixed;
      inset: 0;
      z-index: 12000;
    }

    /* The full-screen button (bc-map-fullscreen-button): a white square, 40 dp (44 pt on
       iOS), 12 dp corners, light shadow, 22 dp icon in ink. Where it sits is the
       screen's choice (--bc-map-button-top, --bc-map-button-right): by default 8 dp
       from the top right of the map. */
    .bc-map-fullscreen-button {
      position: absolute;
      z-index: 2;
      top: var(--bc-map-button-top, 8px);
      right: var(--bc-map-button-right, 8px);
      bottom: var(--bc-map-button-bottom, auto);
      width: 40px;
      height: 40px;
      padding: 0;
      border: none;
      border-radius: 12px;
      background: var(--bc-surface);
      color: var(--bc-text);
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

      .bc-map-fullscreen & {
        top: calc(var(--f7-safe-area-top, var(--bc-safe-top)) + 8px);
        right: 16px;
        bottom: auto;
      }

      /* Mouse: the Material 3 hover layer, 8 % of the content colour over the background. */
      @media (hover: hover) and (pointer: fine) {
        transition: box-shadow 120ms linear;
        &:not(:disabled):hover {
          box-shadow:
          inset 0 0 0 100vmax color-mix(in srgb, currentColor 8%, transparent),
          0 1px 3px rgb(0 0 0 / 0.2);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        transition: none;
      }
    }
    /* Full screen: « Centrer sur ma position » at the bottom right, above the credits. */
    .bc-map-fullscreen .bc-map-fullscreen-button.bc-map-fullscreen--locate {
      top: auto;
      bottom: calc(var(--bc-safe-bottom) + 56px);
    }

    /* The heat: its own layer over the map, taps go through to the map. */
    .bc-site-map--heat {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }

    /* The base map at about 25 % saturation, so the heat stands out (the heat is not affected). */
    .bc-site-map--desaturated .bc-site-map--canvas :global(canvas) {
      filter: saturate(0.25);
    }

    .bc-site-map--credits {
      position: absolute;
      z-index: 1;
      top: var(--bc-map-credits-top, auto);
      right: var(--bc-map-credits-right, 8px);
      bottom: var(--bc-map-credits-bottom, 4px);
      max-width: calc(100% - 16px);
      margin: 0;
      padding: 2px 6px;
      border-radius: 4px;
      background: color-mix(in srgb, var(--bc-surface) 85%, transparent);

      :global(html.bc-high-contrast) & {
        background: var(--bc-surface);
      }
      color: var(--bc-text-2);
      font-size: 11px;
      line-height: 14px;
      pointer-events: none;

      .bc-map-fullscreen & {
        top: auto;
        right: 8px;
        bottom: calc(var(--bc-safe-bottom) + 24px);
      }
    }

    /* Sites: no names on the map, but in full screen with few pins (updateNames). */
    .bc-site-map--quiet:not(:global(.bc-site-map--names-on)) :global(.bc-site-map--pin-name) {
      display: none;
    }

    /* The heat map from afar: no pins (pinsFromZoom). */
    .bc-site-map--pins-hidden :global(.bc-site-map--site-marker) {
      display: none;
    }

    /* Where several pins were touched: a blue disc, 2 dp outline (bc-map-stack-sheet). */
    :global(.bc-site-map--stack-disc) {
      width: 48px;
      height: 48px;
      box-sizing: border-box;
      border: 2px solid var(--bc-secondary);
      border-radius: 50%;
      background: color-mix(in srgb, var(--bc-secondary) 16%, transparent);
      pointer-events: none;
    }

    /* The shared map (task 2026-11-19-315): a dot per base site, a numbered disc per crowded cell. */
    :global(.bc-site-map--base) {
      box-sizing: border-box;
      padding: 0;
      border: 2px solid var(--bc-on-shared-site);
      border-radius: 50%;
      background: var(--bc-shared-site);
      color: var(--bc-on-shared-site);
      box-shadow: 0 1px 2px rgb(0 0 0 / 0.3);
      cursor: pointer;
    }
    :global(.bc-site-map--base-site) {
      width: 16px;
      height: 16px;
    }
    :global(.bc-site-map--base-name) {
      position: absolute;
      left: 22px;
      top: -3px;
      max-width: 180px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 14px;
      line-height: 18px;
      font-weight: 500;
      color: var(--bc-text);
      -webkit-text-stroke: 4px var(--bc-surface);
      paint-order: stroke fill;
      pointer-events: none;
    }
    .bc-site-map:not(:global(.bc-site-map--names-on)) :global(.bc-site-map--base-name) {
      display: none;
    }
    /* A 48 dp target around the 16 dp dot (the marker is positioned by MapLibre). */
    :global(.bc-site-map--base-site)::before {
      content: '';
      position: absolute;
      inset: -16px;
      border-radius: 50%;
    }
    :global(.bc-site-map--base-selected) {
      transform: scale(1.4);
      box-shadow: 0 0 0 4px color-mix(in srgb, var(--bc-shared-site) 35%, transparent);
    }
    :global(.bc-site-map--base-cluster) {
      min-width: 32px;
      width: auto;
      height: 32px;
      padding: 0 6px;
      font: inherit;
      font-size: 13px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    :global(.bc-site-map--personal-cluster) {
      display: grid;
      place-items: center;
      min-width: 32px;
      width: auto;
      height: 32px;
      padding: 0 6px;
      border: 2px solid var(--bc-surface);
      border-radius: 16px;
      background: var(--bc-text);
      color: var(--bc-surface);
      font: inherit;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
    }
    :global(.bc-site-map--personal-cluster)::after,
    :global(.bc-site-map--base-cluster)::after {
      content: '';
      position: absolute;
      inset: -8px;
    }
    :global(.bc-site-map--point) {
      box-sizing: border-box;
      width: 22px;
      height: 22px;
      border: 2px solid var(--bc-surface);
      border-radius: 50%;
      background: var(--bc-text);
      color: var(--bc-surface);
      font-size: 13px;
      font-weight: 700;
      line-height: 18px;
      text-align: center;
      font-variant-numeric: tabular-nums;
      box-shadow: 0 1px 2px rgb(0 0 0 / 0.3);
    }

    .bc-site-map--center-pin {
      position: absolute;
      left: 50%;
      top: 50%;
      /* The tip (y = 0 of the drawing, 2 px above its bottom) on the centre. */
      transform: translate(-50%, calc(-100% + 2px));
      pointer-events: none;
      filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.35));

      path {
        fill: var(--bc-text);
        stroke: var(--bc-surface);
        stroke-width: 2;
      }

      circle {
        fill: var(--bc-surface);
      }
    }

    /* A pin per site (no grouping, even when pins overlap): ink, with the number of
       dives, white, 13 sp, bold, in its head; the name beside it, ink with a 4 dp
       white halo. */
    :global(.bc-site-map--site-marker) {
      width: 32px;
      height: 42px;
      padding: 0;
      border: none;
      background: none;
      cursor: pointer;
      transition: opacity 150ms linear;

      :global(.bc-site-map--pin) {
        display: block;
        overflow: visible;
        filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.3));
      }

      :global(.bc-site-map--pin path) {
        fill: var(--bc-text);
        stroke: var(--bc-surface);
        stroke-width: 2;
      }

      :global(.bc-site-map--pin text) {
        fill: var(--bc-surface);
        font-size: 13px;
        font-weight: 700;
        text-anchor: middle;
        font-variant-numeric: tabular-nums;
      }

      /* Selected (task 2026-11-14-150): 1.3×, a halo in the secondary colour at 18 %. */
      &:global(.bc-site-map--selected) :global(.bc-site-map--pin) {
        transform: scale(1.3);
        transform-origin: 50% 95%;
        filter: drop-shadow(0 0 0 transparent) drop-shadow(0 1px 2px rgb(0 0 0 / 0.3));
      }

      &:global(.bc-site-map--selected)::before {
        content: '';
        position: absolute;
        left: 50%;
        top: 16px;
        width: 52px;
        height: 52px;
        border-radius: 50%;
        background: color-mix(in srgb, var(--bc-secondary) 18%, transparent);
        transform: translate(-50%, -50%) translateY(-6px);
        pointer-events: none;
      }

      /* Baseline 20 px above the tip, 18 px right of it, as drawn. */
      :global(.bc-site-map--pin-name) {
        position: absolute;
        left: 34px;
        top: 6px;
        white-space: nowrap;
        font-size: 14px;
        line-height: 18px;
        font-weight: 500;
        color: var(--bc-text);
        -webkit-text-stroke: 4px var(--bc-surface);
        paint-order: stroke fill;
        pointer-events: none;
      }

      /* !important: MapLibre sets an inline opacity on every marker. */
      &.bc-site-map--dim {
        opacity: 0.3 !important;
      }

      /* The places around: a smaller grey pin, white dot, name on its left in
         the secondary text colour, 13 sp. */
      &:global(.bc-site-map--muted) {
        width: 28px;
        height: 36px;
        cursor: default;

        :global(.bc-site-map--pin) {
          width: 28px;
          height: 36px;
        }

        :global(.bc-site-map--pin path) {
          fill: var(--bc-map-pin-muted);
        }

        :global(.bc-site-map--pin circle) {
          fill: var(--bc-surface);
        }

        :global(.bc-site-map--pin-name) {
          left: auto;
          right: 32px;
          top: 2px;
          font-size: 13px;
          color: var(--bc-text-2);
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
