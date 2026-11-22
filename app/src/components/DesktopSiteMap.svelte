<script>
  // @ts-check
  // The desktop Sites map (tasks 2026-11-15-171 and 177, mock-ups bureau-sites, bureau-sites-
  // recherche, bureau-sites-superposes): every site is a dot with its name, the selected one
  // blue with a halo; pins that overlap at the zoom merge into one with their count, and a click
  // on it opens the list of those sites; a search dims the sites that do not match. A click on
  // a dot selects the site (the table's row follows), a click on the empty map clears it.
  import { onMount, onDestroy } from 'svelte';
  import { t, language } from '../lib/i18n.js';
  import { formatDepth, formatNumber } from '../lib/format.js';
  import { logbook } from '../lib/logbook.svelte.js';
  import { placeAt } from '../lib/place-lookup.js';
  import { createSiteMap, lngLatOf } from '../lib/desktop-map.js';
  import { stackPins } from '../lib/desktop-sites.js';

  /**
   * @type {{
   *   sites: import('opendives-core').SiteSummary[],
   *   selected: number|null,
   *   matching: Set<number>|null,
   *   onselect: (uuid: number) => void,
   *   onclear: () => void,
   *   overlay?: import('svelte').Snippet,
   * }}
   */
  let { sites, selected, matching, onselect, onclear, overlay } = $props();

  /** The pins closer than this at the zoom merge, px. */
  const STACK_RADIUS = 16;

  /** @type {HTMLElement|undefined} */
  let container = $state();
  /** @type {HTMLElement|undefined} */
  let root = $state();
  let map = $state.raw(/** @type {import('maplibre-gl').Map|undefined} */ (undefined));
  /** @type {typeof import('maplibre-gl')|undefined} */
  let maplibregl;
  /** @type {import('maplibre-gl').Marker[]} */
  let markers = [];
  /** @type {Map<number, HTMLElement>} */
  let dots = new Map();
  let framed = false;

  /** The list opened by a merged pin: the sites, and where it opens (px in the pane). @type {{ uuids: number[], x: number, y: number, at: {latUdeg: number, lonUdeg: number}, place: string }|null} */
  let stack = $state(null);
  const stackSites = $derived(stack ? stack.uuids.map((u) => sites.find((s) => s.uuid === u)).filter((s) => !!s) : []);

  /** @param {string} text */
  const el = (text) => {
    const d = document.createElement('span');
    d.textContent = text;
    return d;
  };

  function render() {
    if (!map || !maplibregl) return;
    const m = map;
    for (const marker of markers) marker.remove();
    markers = [];
    dots = new Map();
    // The busiest first, so that a merged pin is centred on its busiest site.
    const ordered = [...sites].sort((a, b) => b.dives - a.dives);
    const pins = ordered.map((s) => {
      const p = m.project(lngLatOf(s));
      return { uuid: s.uuid, x: p.x, y: p.y };
    });
    for (const group of stackPins(pins, STACK_RADIUS)) {
      const first = /** @type {import('opendives-core').SiteSummary} */ (sites.find((s) => s.uuid === group.uuids[0]));
      /** @type {HTMLElement} */
      let node;
      if (group.uuids.length > 1) {
        node = document.createElement('button');
        node.type = 'button';
        node.className = 'bc-desktop-site-map--stack';
        node.setAttribute('aria-label', t('sites.stackTitle', { n: group.uuids.length }));
        node.append(el(formatNumber(group.uuids.length)));
        node.addEventListener('click', (e) => {
          e.stopPropagation();
          openStack(group.uuids, first, node);
        });
      } else {
        node = document.createElement('button');
        node.type = 'button';
        node.className = 'bc-desktop-site-map--dot';
        node.dataset.uuid = String(first.uuid);
        const name = first.name || t('sites.noName');
        node.setAttribute('aria-label', first.dives ? t('sites.mapPin', { name, dives: t('sites.diveCount', { n: first.dives }) }) : name);
        const label = el(name);
        label.className = 'bc-desktop-site-map--name';
        label.setAttribute('aria-hidden', 'true');
        const dot = document.createElement('i');
        dot.className = 'bc-desktop-site-map--disc';
        node.append(dot, label);
        node.addEventListener('click', (e) => {
          e.stopPropagation();
          stack = null;
          onselect(first.uuid);
        });
        dots.set(first.uuid, node);
      }
      markers.push(new maplibregl.Marker({ element: node, anchor: 'center' }).setLngLat(lngLatOf(first)).addTo(m));
    }
    mark();
  }

  /** Selected and dimmed pins. */
  function mark() {
    for (const [uuid, node] of dots) {
      node.classList.toggle('bc-desktop-site-map--selected', uuid === selected);
      node.classList.toggle('bc-desktop-site-map--dim', !!matching && !matching.has(uuid));
      node.style.zIndex = uuid === selected ? '2' : '';
    }
  }

  let stackAsk = 0;
  /** @param {number[]} uuids @param {import('opendives-core').SiteSummary} first @param {HTMLElement} node */
  function openStack(uuids, first, node) {
    const ask = ++stackAsk;
    const box = node.getBoundingClientRect();
    const rootBox = /** @type {HTMLElement} */ (root).getBoundingClientRect();
    const at = { latUdeg: first.latUdeg, lonUdeg: first.lonUdeg };
    stack = { uuids, x: box.right - rootBox.left + 12, y: box.top - rootBox.top, at, place: '' };
    // The place under the title (« Morrisburg, Ontario »), when it can be found.
    placeAt(at.latUdeg, at.lonUdeg, language).then(
      (p) => {
        if (ask !== stackAsk || !stack || !p) return;
        stack.place = [p.city, p.region].filter(Boolean).join(', ') || p.country;
      },
      () => {},
    );
  }

  function zoomHere() {
    if (!stack || !map) return;
    map.easeTo({ center: lngLatOf(stack.at), zoom: map.getZoom() + 2.5 });
    stack = null;
  }

  /** @param {number} uuid */
  function pickFromStack(uuid) {
    stack = null;
    onselect(uuid);
  }

  /** Frames every site, once. */
  function frame() {
    if (!map || !maplibregl || !sites.length) return;
    framed = true;
    const points = sites.map(lngLatOf);
    if (points.length === 1) map.jumpTo({ center: points[0], zoom: 11 });
    else map.fitBounds(points.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(points[0], points[0])), { padding: 80, maxZoom: 12, animate: false });
  }

  onMount(async () => {
    if (!container) return;
    const made = await createSiteMap(container);
    if (!made) return;
    maplibregl = made.maplibregl;
    const m = made.map;
    // The pins are HTML: they do not wait for the style to load (the tiles may be slow or offline).
    map = m;
    frame();
    render();
    m.on('moveend', render);
    m.on('click', () => {
      stack = null;
      onclear();
    });
    const resize = new ResizeObserver(() => m.resize());
    resize.observe(container);
    m.once('remove', () => resize.disconnect());
  });

  onDestroy(() => map?.remove());

  $effect(() => {
    sites;
    if (map) {
      if (!framed) frame();
      render();
    }
  });
  $effect(() => {
    selected;
    matching;
    mark();
  });
  // A site chosen in the table comes into view.
  $effect(() => {
    const uuid = selected;
    if (!map || uuid === null) return;
    const s = sites.find((x) => x.uuid === uuid);
    if (s && !map.getBounds().contains(lngLatOf(s))) map.easeTo({ center: lngLatOf(s) });
  });
  $effect(() => {
    if (selected !== null) stack = null;
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="bc-desktop-site-map" role="region" aria-label={t('sites.map')} bind:this={root}>
  <div class="bc-desktop-site-map--canvas" bind:this={container}></div>
  <p class="bc-desktop-site-map--credits">{t('sites.mapCredits')}</p>
  {#if stack}
    <div class="bc-desktop-site-map--stack-list" style:left="{Math.min(stack.x, (root?.clientWidth ?? 900) - 372)}px" style:top="{Math.max(8, Math.min(stack.y - 40, (root?.clientHeight ?? 700) - 440))}px" role="dialog" aria-label={t('sites.stackTitle', { n: stack.uuids.length })}>
      <h2 class="bc-desktop-site-map--stack-title">{t('sites.stackTitle', { n: stack.uuids.length })}</h2>
      <p class="bc-desktop-site-map--stack-note">{stack.place ? `${stack.place}. ` : ''}{t('sites.stackNote')}</p>
      <ul>
        {#each stackSites as s (s.uuid)}
          <li>
            <button type="button" class="bc-desktop-site-map--stack-row" onclick={() => pickFromStack(s.uuid)}>
              <span class="bc-desktop-site-map--stack-count bc-value">{formatNumber(s.dives)}</span>
              <span class="bc-desktop-site-map--stack-site">{s.name || t('sites.noName')}</span>
              {#if s.maxDepthMm}<span class="bc-desktop-site-map--stack-depth bc-value">{formatDepth(s.maxDepthMm, logbook.prefs)}</span>{/if}
            </button>
          </li>
        {/each}
      </ul>
      <button type="button" class="bc-desktop-site-map--zoom-here" onclick={zoomHere}>{t('desktopSites.zoomHere')}</button>
    </div>
  {/if}
  {@render overlay?.()}
</div>

<style>
  @layer od.components {
    .bc-desktop-site-map {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      border-radius: 16px;
      background: var(--bc-surface-2);
    }
    .bc-desktop-site-map--canvas {
      position: absolute;
      inset: 0;
    }
    .bc-desktop-site-map--credits {
      position: absolute;
      left: 12px;
      bottom: 4px;
      margin: 0;
      font-size: 11px;
      line-height: 14px;
      color: var(--bc-text-2);
      pointer-events: none;
    }
    /* A site: a 16 dp dot with its name; ink-grey, the selected one blue with a halo (task 171). */
    :global(.bc-desktop-site-map--dot) {
      display: flex;
      align-items: center;
      width: 16px;
      height: 16px;
      padding: 0;
      border: 0;
      background: none;
      cursor: pointer;
      transition: opacity 150ms linear;
    }
    :global(.bc-desktop-site-map--disc) {
      position: relative;
      flex: none;
      width: 16px;
      height: 16px;
      box-sizing: border-box;
      border-radius: 50%;
      background: var(--bc-text-2);
    }
    :global(.bc-desktop-site-map--name) {
      position: absolute;
      left: 22px;
      top: -1px;
      white-space: nowrap;
      font-size: 14px;
      line-height: 18px;
      color: var(--bc-text);
      -webkit-text-stroke: 3px var(--bc-surface-2);
      paint-order: stroke fill;
      pointer-events: none;
    }
    :global(.bc-desktop-site-map--selected .bc-desktop-site-map--disc) {
      background: var(--bc-secondary);
      box-shadow: 0 0 0 8px color-mix(in srgb, var(--bc-secondary) 18%, transparent);
    }
    :global(.bc-desktop-site-map--selected .bc-desktop-site-map--name) {
      font-weight: 600;
    }
    /* !important: MapLibre sets an inline opacity on every marker. A search dims what does not match to 35 %. */
    :global(.bc-desktop-site-map--dim) {
      opacity: 0.35 !important;
    }
    /* Pins that overlap: one blue pin with the count, a halo. */
    :global(.bc-desktop-site-map--stack) {
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      padding: 0;
      border: 2px solid var(--bc-surface);
      border-radius: 50%;
      background: var(--bc-secondary);
      color: var(--bc-on-secondary);
      font: inherit;
      font-size: 14px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      box-shadow: 0 0 0 7px color-mix(in srgb, var(--bc-secondary) 22%, transparent);
      cursor: pointer;
    }
    .bc-desktop-site-map--stack-list {
      position: absolute;
      z-index: 5;
      width: 360px;
      padding: 12px 0 8px;
      border-radius: 16px;
      background: var(--bc-surface);
      box-shadow:
        0 2px 6px 2px rgb(0 0 0 / 0.15),
        0 1px 2px rgb(0 0 0 / 0.3);
    }
    .bc-desktop-site-map--stack-title {
      margin: 0;
      padding: 0 16px;
      font-size: 17px;
      font-weight: 600;
    }
    .bc-desktop-site-map--stack-note {
      margin: 2px 0 8px;
      padding: 0 16px;
      font-size: 13px;
      color: var(--bc-text-2);
    }
    .bc-desktop-site-map--stack-list ul {
      margin: 0;
      padding: 0;
      list-style: none;
      max-height: 320px;
      overflow: auto;
    }
    .bc-desktop-site-map--stack-row {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      height: 48px;
      padding: 0 16px;
      border: 0;
      background: none;
      font: inherit;
      font-size: 15px;
      color: var(--bc-text);
      text-align: start;
      cursor: pointer;
    }
    .bc-desktop-site-map--stack-row:hover,
    .bc-desktop-site-map--stack-row:focus-visible {
      background: color-mix(in srgb, var(--bc-text) 8%, transparent);
      outline: none;
    }
    .bc-desktop-site-map--stack-count {
      flex: none;
      min-width: 32px;
      padding: 2px 8px;
      border-radius: 12px;
      background: var(--bc-table-selected);
      color: var(--bc-on-table-selected);
      font-size: 13px;
      font-weight: 600;
      text-align: center;
    }
    .bc-desktop-site-map--stack-site {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .bc-desktop-site-map--stack-depth {
      flex: none;
      font-size: 13px;
      color: var(--bc-text-2);
    }
    .bc-desktop-site-map--zoom-here {
      display: block;
      margin: 4px 8px 0 auto;
      height: 40px;
      padding: 0 12px;
      border: 0;
      border-radius: 20px;
      background: none;
      font: inherit;
      font-size: 14px;
      font-weight: 600;
      color: var(--bc-on-table-selected);
      cursor: pointer;
      &:hover {
        background: color-mix(in srgb, var(--bc-secondary) 8%, transparent);
      }
    }


    /* Mouse: the Material 3 hover layer, 8 % of the content colour over the background. */
    @media (hover: hover) and (pointer: fine) {
      :global(.bc-desktop-site-map--dot:hover .bc-desktop-site-map--disc) {
        box-shadow: 0 0 0 6px color-mix(in srgb, var(--bc-text) 12%, transparent);
      }
      :global(.bc-desktop-site-map--stack:hover) {
        box-shadow: 0 0 0 9px color-mix(in srgb, var(--bc-secondary) 30%, transparent);
      }
    }
  }
</style>
