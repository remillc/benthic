<script>
  // @ts-check
  import { deviceStore } from '../lib/device-store.js';
  // Sites section (docs/mockups/android-sites.dc.html; spec, section 4,
  // "Sites"): the section header (☰, title, search), the map of the sites
  // with a position and "centre on my position", then the list panel: the
  // count, the list items that apply (dives without a site, sites without
  // coordinates, possible duplicates), a divider and the sites.
  import { onDestroy, tick, untrack } from 'svelte';
  import { Page, Navbar, NavRight, Link, List, Popover, f7, theme } from 'framework7-svelte';
  import { showSnackbar } from '../lib/snackbar.js';
  import { OpenDivesCore } from 'opendives-core';
  import { cachedSites } from '../lib/core-cache.js';
  import Icon from '../components/Icon.svelte';
  import MenuButton from '../components/MenuButton.svelte';
  import AccountAvatar from '../components/AccountAvatar.svelte';
  import SectionBand from '../components/SectionBand.svelte';
  import SiteMap from '../components/SiteMap.svelte';
  import MenuItem from '../components/MenuItem.svelte';
  import ChoiceDialog from '../components/ChoiceDialog.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { startup } from '../lib/startup.svelte.js';
  import { possibleDuplicates, siteChange } from '../lib/sites.svelte.js';
  import { defaultKeeper, sortSitesByName, sortSitesByRecent } from '../lib/site-merge.js';
  import { offerUndo } from '../lib/undo.js';
  import { formatDepth, formatDate, locale } from '../lib/format.js';
  import { layout, ios, listWidth } from '../lib/layout.svelte.js';
  import { t } from '../lib/i18n.js';
import { connection } from '../lib/online.svelte.js';
import { offlineMaps, downloadRegionAt } from '../lib/offline-maps.svelte.js';
import { distanceKm, inBbox, normalizeBbox } from '../lib/maps-logic.js';
import { matchesSite, highlightParts } from '../lib/site-search.js';
import MapStackSheet from '../components/MapStackSheet.svelte';
import MapSiteCard from '../components/MapSiteCard.svelte';
import { placeAt } from '../lib/place-lookup.js';
import { language } from '../lib/i18n.js';
import { odplusAccount } from '../lib/benthic-plus-state.svelte.js';
import { loadLinks, setSitesMode, sharedSites, withSession } from '../lib/shared-sites.svelte.js';
import { inYourSites, readAreaSites } from '../lib/shared-sites.js';
import { baseCardLine, baseRowText } from '../lib/shared-sites-format.js';
import { openOdPlus } from '../lib/open-offer.svelte.js';

  /** @type {import('opendives-core').SiteSummary[]} */
  let sites = $state([]);
  let withoutSite = $state(0);
  let duplicates = $state(0);
  /** Sites without a dive, which « Nettoyer les sites » also deletes (task 2026-11-14-148). */
  const unused = $derived(sites.filter((s) => s.dives === 0).length);
  /** The clean-up row: « 2 doublons possibles, 3 sites sans plongée : nettoyer les sites ». */
  const cleanupText = $derived(
    t('sites.cleanupLink', {
      what: [duplicates ? t('sites.duplicatesCount', { n: duplicates }) : '', unused ? t('sites.unusedCount', { n: unused }) : ''].filter(Boolean).join(', '),
    }),
  );
  /** @type {SiteMap|undefined} */
  let siteMap = $state();

  // "Voir sur la carte" of the offline maps screen.
  $effect(() => {
    if (!offlineMaps.viewBbox || !siteMap) return;
    siteMap.fitBbox(offlineMaps.viewBbox);
    offlineMaps.viewBbox = null;
  });

  const SORT_KEY = 'od.sitesSort';
  /** The order of the list, a setting of this device. */
  let sortBy = $state(/** @type {'name'|'recent'} */ (deviceStore.getItem(SORT_KEY) === 'recent' ? 'recent' : 'name'));

  /** @param {'name'|'recent'} order */
  function setSort(order) {
    sortBy = order;
    deviceStore.setItem(SORT_KEY, order);
  }

  /** Sites used by dives, in the chosen order. */
  const used = $derived.by(() => {
    const list = sites.filter((s) => s.dives > 0);
    return sortBy === 'recent' ? sortSitesByRecent(list) : sortSitesByName(list, locale);
  });
  const located = $derived(used.filter((s) => s.hasLocation));
  const unplaced = $derived(used.length - located.length);
  const diveCount = $derived(used.reduce((n, s) => n + s.dives, 0));

  // The search (spec, "Sites, search open and its animation"): open, it takes
  // the top bar; the sites that match stay on the map and in the list.
  let searching = $state(false);
  let query = $state('');
  /** @type {HTMLElement|undefined} */
  let searchEl = $state();
  /** @type {HTMLInputElement|undefined} */
  let searchInput = $state();
  /** @type {HTMLElement|undefined} */
  let todoEl = $state();
  /** @type {HTMLElement|undefined} */
  let fabEl = $state();
  /** The map's view before the search, which Close brings back. @type {{ center: import('maplibre-gl').LngLat, zoom: number }|null} */
  let viewBeforeSearch = null;
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let focusTimer;
  const GROW_MS = 300;
  const FADE_MS = 150;

  const typed = $derived(searching && query.trim() !== '');
  const results = $derived(typed ? used.filter((s) => matchesSite(s, query)) : used);

  // The list follows the map (task 2026-11-14-150): the sites inside the visible
  // area, once the map has stopped; a search looks through the whole logbook.
  const inArea = $derived(
    typed || !view || !located.length ? null : results.filter((s) => s.hasLocation && inBbox(s.lonUdeg / 1e6, s.latUdeg / 1e6, normalizeBbox(view.bounds))),
  );
  const listed = $derived(inArea ?? results);

  // A pin tapped (bc-map-site-card), or several pins under the finger (bc-map-stack-sheet).
  let selectedUuid = $state(/** @type {number|null} */ (null));
  const selectedSite = $derived(selectedUuid === null ? null : (located.find((s) => s.uuid === selectedUuid) ?? null));
  let stack = $state(/** @type {{ uuids: number[], at: { latUdeg: number, lonUdeg: number } }|null} */ (null));
  let stackPlace = $state('');
  const stackSites = $derived(stack ? located.filter((s) => stack?.uuids.includes(s.uuid)) : []);

  let stackAsk = 0;
  /** @param {number[]} uuids @param {{ latUdeg: number, lonUdeg: number }} at */
  function showStack(uuids, at) {
    const ask = ++stackAsk;
    selectedUuid = null;
    stack = { uuids, at };
    stackPlace = '';
    // The place under the title (« Morrisburg, Ontario »), when it can be found.
    placeAt(at.latUdeg, at.lonUdeg, language).then(
      (p) => {
        if (ask !== stackAsk || !stack || !p) return;
        stackPlace = [p.city, p.region].filter(Boolean).join(', ') || p.country;
      },
      () => {},
    );
  }

  /** @param {number} uuid */
  function openFromMap(uuid) {
    selectedUuid = null;
    stack = null;
    siteMap?.exitFullScreen();
    open(uuid);
  }

  const matching = $derived(typed ? new Set(results.map((s) => s.uuid)) : null);
  const searchCount = $derived(
    !typed ? '' : results.length ? t('sites.searchCount', { n: results.length, text: query.trim() }) : t('sites.noMatch'),
  );

  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  /**
   * Reduced motion: the states change at once, with a 150 ms cross-fade in.
   * (The global rule of theme.css stops every CSS transition; this is not one.)
   * @param {(HTMLElement|null|undefined)[]} els
   */
  async function fadeIn(els) {
    if (!reducedMotion()) return;
    await tick();
    for (const el of els) el?.animate?.({ opacity: [0, 1] }, { duration: FADE_MS });
  }

  function openSearch() {
    if (searching) return;
    viewBeforeSearch = siteMap?.getView() ?? null;
    searching = true;
    fadeIn([searchEl]);
    // The keyboard opens when the field has grown.
    clearTimeout(focusTimer);
    focusTimer = setTimeout(() => searchInput?.focus(), reducedMotion() ? FADE_MS : GROW_MS);
  }

  function closeSearch() {
    if (!searching) return;
    clearTimeout(focusTimer);
    // The keyboard goes first.
    searchInput?.blur();
    searching = false;
    query = '';
    siteMap?.setView(viewBeforeSearch);
    viewBeforeSearch = null;
    fadeIn([searchEl?.closest('.view')?.querySelector('.bc-sites--bar .navbar-inner') ?? null, todoEl, fabEl]);
  }

  function clearSearch() {
    query = '';
    searchInput?.focus();
  }

  // The system Back (lib/back-button.js) asks the open search to close.
  $effect(() => {
    const el = searchEl;
    el?.addEventListener('od-cancel', closeSearch);
    return () => el?.removeEventListener('od-cancel', closeSearch);
  });

  /** The sites checked, by uuid. */
  /** @type {Record<number, boolean>} */
  let checked = $state({});
  const selection = $derived(used.filter((s) => checked[s.uuid]));
  let choosingKeeper = $state(false);

  const LONG_PRESS_MS = 500;
  /** How far the finger may move before a press becomes a scroll, px. */
  const PRESS_SLOP = 10;

  /**
   * The list's selection: a long press on a site checks it and shows the boxes;
   * while sites are checked, touching a site checks or unchecks it.
   * @param {HTMLElement} el
   */
  function selectable(el) {
    /** @type {ReturnType<typeof setTimeout>|undefined} */
    let timer;
    let startX = 0;
    let startY = 0;
    let pressed = false;
    /** @param {Event} e */
    const rowOf = (e) => /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('.bc-sites--site-row'));
    const cancel = () => clearTimeout(timer);

    /** @param {PointerEvent} e */
    function down(e) {
      const row = rowOf(e);
      pressed = false;
      if (!row || /** @type {HTMLElement} */ (e.target).closest('.bc-sites--site-check')) return;
      startX = e.clientX;
      startY = e.clientY;
      timer = setTimeout(() => {
        pressed = true;
        checked[Number(row.dataset.uuid)] = true;
      }, LONG_PRESS_MS);
    }
    /** @param {PointerEvent} e */
    function move(e) {
      if (Math.abs(e.clientX - startX) > PRESS_SLOP || Math.abs(e.clientY - startY) > PRESS_SLOP) cancel();
    }
    /**
     * On the window, in the capture phase: Framework7 follows the links from
     * the document's own capture phase, which would open the site.
     * @param {MouseEvent} e
     */
    function click(e) {
      if (!el.contains(/** @type {Node} */ (e.target))) return;
      const row = rowOf(e);
      if (!row || /** @type {HTMLElement} */ (e.target).closest('.bc-sites--site-check')) return;
      if (pressed) {
        pressed = false;
      } else if (selection.length) {
        const uuid = Number(row.dataset.uuid);
        checked[uuid] = !checked[uuid];
      } else {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
    }
    /** @param {Event} e The WebView's own long-press menu is not wanted. */
    const menu = (e) => rowOf(e) && e.preventDefault();

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', cancel);
    el.addEventListener('pointercancel', cancel);
    window.addEventListener('click', click, true);
    el.addEventListener('contextmenu', menu);
    return {
      destroy() {
        cancel();
        el.removeEventListener('pointerdown', down);
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', cancel);
        el.removeEventListener('pointercancel', cancel);
        window.removeEventListener('click', click, true);
        el.removeEventListener('contextmenu', menu);
      },
    };
  }

  /** Merges every other selected site into the one kept: one undoable step each. @param {string} value */
  async function mergeSelection(value) {
    choosingKeeper = false;
    const keep = Number(value);
    const others = selection.filter((s) => s.uuid !== keep);
    let done = 0;
    try {
      for (const other of others) {
        await siteChange({ action: 'merge', uuid: keep, other: other.uuid });
        done++;
      }
      checked = {};
    } catch (e) {
      console.error('Merge sites', e);
      showSnackbar(t('edit.failed'));
    }
    if (done) offerUndo(t('sites.done'), undefined, 6000, done);
  }

  // Offline, a hint when the map looks mostly outside the downloaded regions
  // (spec, "Sites map offline"): once per area, an area being a tile of zoom 7.
  const HINT_MIN_ZOOM = 7;
  const HINT_AREA_ZOOM = 7;
  /** @type {{ center: [number, number], bounds: [number, number, number, number], zoom: number }|undefined} */
  let view = $state.raw();
  const hinted = new Set();

  /** Share (0 to 1) of the visible area inside a downloaded region, by sampling. */
  function coveredShare(/** @type {[number, number, number, number]} */ [w, s, e, n]) {
    const regions = offlineMaps.regions.filter((r) => r.status === 'ready' || r.status === 'updating');
    const N = 8;
    let inside = 0;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const lng = w + ((e - w) * (i + 0.5)) / N;
        const lat = s + ((n - s) * (j + 0.5)) / N;
        if (regions.some((r) => inBbox(lng, lat, r.bbox))) inside++;
      }
    }
    return inside / (N * N);
  }

  function hintIfNotDownloaded() {
    if (connection.online || !view || view.zoom < HINT_MIN_ZOOM || coveredShare(view.bounds) >= 0.5) return;
    const [lng, lat] = view.center;
    const n = 2 ** HINT_AREA_ZOOM;
    const x = Math.floor(((lng + 180) / 360) * n);
    const y = Math.floor(((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n);
    const area = `${x}/${y}`;
    if (hinted.has(area)) return;
    hinted.add(area);
    showSnackbar(t('sites.areaNotDownloaded'), {
      action: t('sites.downloadArea'),
      timeout: 6000,
      onAction: () => downloadRegionAt(lng, lat),
    });
  }

  /** @param {{ center: [number, number], bounds: [number, number, number, number], zoom: number }} v */
  function onview(v) {
    view = v;
    hintIfNotDownloaded();
  }

  // « Mes sites | Carte commune » (task 2026-11-19-315, docs/mockups/sites-commun-android.dc.html): a signed-in Benthic+
  // account sees the shared map over its own sites. Who may read it is the server's switch: a refusal shows the offer.
  const canCommon = $derived(odplusAccount.signedIn);
  const common = $derived(canCommon && sharedSites.mode === 'common');
  let baseBox = $state.raw(/** @type {{ mode: string, total: number, sites: import('../lib/shared-sites.js').BaseSite[], clusters: { lat: number, lon: number, count: number }[] }|null} */ (null));
  /** The base sites in the visible area, including those grouped into clusters. */
  let baseList = $state.raw(/** @type {import('../lib/shared-sites.js').BaseSite[]} */ ([]));
  /** @type {HTMLElement|undefined} */
  let baseListEl = $state();
  /** @type {any} */
  let baseVirtualList = null;
  let baseVisible = $state({ items: /** @type {import('../lib/shared-sites.js').BaseSite[]} */ ([]), from: 0, top: 0 });
  /** @type {Map<string, number>} */
  const baseHeights = new Map();
  let baseTypicalHeight = 72;
  /** @type {ResizeObserver|undefined} */
  let baseResize;

  /** @param {import('../lib/shared-sites.js').BaseSite} site */
  const baseRowHeight = (site) => baseHeights.get(site.id) ?? baseTypicalHeight;

  async function measureBaseRows() {
    const list = baseVirtualList;
    await tick();
    if (!list || list !== baseVirtualList || !baseListEl) return;
    let changed = false;
    for (const row of baseListEl.querySelectorAll('li[data-virtual-list-index]')) {
      const site = list.items[Number(row.getAttribute('data-virtual-list-index'))];
      const height = /** @type {HTMLElement} */ (row).offsetHeight;
      if (!site || !height || baseRowHeight(site) === height) continue;
      baseHeights.set(site.id, height);
      baseTypicalHeight = height;
      changed = true;
    }
    if (changed) list.update();
  }

  $effect(() => {
    const items = baseList;
    const el = baseListEl;
    if (baseVirtualList && baseVirtualList.el !== el) {
      baseResize?.disconnect();
      baseVirtualList.destroy();
      baseVirtualList = null;
      baseHeights.clear();
    }
    if (!el) return;
    if (!baseVirtualList) {
      const scrollable = el.closest('.bc-sites--scroll') ?? el.closest('.page-content');
      if (!scrollable) throw new Error('Shared site list has no scroll container');
      baseVirtualList = f7.virtualList.create({
        el,
        items,
        scrollableParentEl: scrollable,
        height: baseRowHeight,
        renderExternal: (/** @type {any} */ _list, /** @type {{ items: import('../lib/shared-sites.js').BaseSite[], fromIndex: number, topPosition: number }} */ data) => {
          baseVisible = { items: data.items, from: data.fromIndex, top: data.topPosition };
          void measureBaseRows();
        },
      });
      let width = el.getBoundingClientRect().width;
      baseResize = new ResizeObserver((entries) => {
        const nextWidth = entries[0].contentRect.width;
        if (nextWidth === width) return;
        width = nextWidth;
        baseHeights.clear();
        baseVirtualList?.update();
      });
      baseResize.observe(el);
    } else {
      baseVirtualList.replaceAllItems(items);
    }
  });

  onDestroy(() => {
    baseResize?.disconnect();
    baseVirtualList?.destroy();
    baseVirtualList = null;
  });
  /** @type {'idle'|'loading'|'ready'|'offer'|'failed'} */
  let baseState = $state('idle');
  let baseLoadingMore = $state(false);
  let baseSelectedId = $state(/** @type {string|null} */ (null));
  const baseSelected = $derived(baseSelectedId === null ? null : (baseBox?.sites.find((x) => x.id === baseSelectedId) ?? baseList.find((x) => x.id === baseSelectedId) ?? null));
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let baseTimer;
  let baseAsk = 0;

  /** Reads the base in the view once the map has stopped. @param {{ center: [number, number], bounds: [number, number, number, number], zoom: number }} v */
  function loadBase(v) {
    clearTimeout(baseTimer);
    const ask = ++baseAsk;
    baseState = 'loading';
    baseLoadingMore = true;
    baseBox = null;
    baseList = [];
    baseTimer = setTimeout(async () => {
      if (!connection.online) return;
      try {
        await withSession(async (api, token) => {
          const bbox = normalizeBbox(v.bounds);
          const box = await api.inBox(token, { bbox, zoom: v.zoom });
          if (ask !== baseAsk) return;
          baseBox = box;
          await readAreaSites(
            (after) => api.inBoxPage(token, { bbox, after, limit: 500 }),
            () => ask === baseAsk && common,
            (sites) => {
              baseList = sites.map((s) => ({ ...s, distanceM: distanceKm(v.center[0], v.center[1], s.lon, s.lat) * 1000 }))
                .sort((a, b) => a.distanceM - b.distanceM);
              baseState = 'ready';
            },
          );
          if (ask === baseAsk) baseLoadingMore = false;
        });
      } catch (err) {
        if (ask !== baseAsk) return;
        console.error('Shared site area', err);
        const code = /** @type {any} */ (err)?.code;
        baseState = code === 'SUBSCRIPTION_REQUIRED' ? 'offer' : 'failed';
      }
    }, 350);
  }

  $effect(() => {
    if (!common || !connection.online) {
      clearTimeout(baseTimer);
      untrack(() => baseAsk++);
      baseSelectedId = null;
      baseBox = null;
      baseList = [];
      return;
    }
    if (!sharedSites.linksLoaded) loadLinks();
    const currentView = view;
    if (currentView) untrack(() => loadBase(currentView));
  });

  /** What the map draws of the base. */
  const baseLayer = $derived(
    common && baseBox
      ? {
          sites: baseBox.sites.map((x) => ({ id: x.id, name: x.name, lat: x.lat, lon: x.lon, mine: inYourSites(x.id, sharedSites.links), label: `${x.name}, ${baseCardLine(x, false)}` })),
          clusters: baseBox.clusters,
        }
      : null,
  );

  /** @param {string} id */
  const openBase = (id) => f7.views.current?.router.navigate(`/sites/base/${encodeURIComponent(id)}`);

  // The device goes offline with the map already in view.
  $effect(() => {
    if (!connection.online) hintIfNotDownloaded();
  });

  async function load() {
    try {
      sites = await cachedSites();
      withoutSite = (await OpenDivesCore.siteQuery({ kind: 'without' })).length;
      duplicates = (await possibleDuplicates()).length;
    } catch (e) {
      console.error('Sites', e);
    }
  }

  // Read again when the logbook or a site changes.
  $effect(() => {
    logbook.loading;
    logbook.sitesVersion;
    if (!logbook.loading && startup.ready) load();
  });

  /** @param {number} uuid */
  const open = (uuid) => f7.views.current?.router.navigate(`/sites/${uuid}`);

  function centreOnDevice() {
    const failed = () => showSnackbar(t('sites.noDevicePosition'));
    if (!navigator.geolocation) return failed();
    navigator.geolocation.getCurrentPosition(
      (pos) => siteMap?.centreOn({ latUdeg: Math.round(pos.coords.latitude * 1e6), lonUdeg: Math.round(pos.coords.longitude * 1e6) }),
      failed,
      { timeout: 15000 },
    );
  }
</script>

{#snippet mapBlock(/** @type {string} */ height)}
  {#if located.length || canCommon}
    <div class="bc-sites--map" class:bc-sites--map-offline={!connection.online} class:bc-sites--card-open={!!selectedSite || !!baseSelected}>
      <!-- Full screen keeps the pins and its own locate button. A tapped pin shows its card;
           several under the finger open a sheet. The shared map shows names from zoom 13. -->
      <SiteMap
        bind:this={siteMap}
        sites={located}
        names={common ? 'atZoom' : 'atZoomOrFewInFullScreen'}
        hideDiveCounts={common}
        groupSites
        selected={selectedUuid}
        onselect={(uuid) => ((stack = null), (baseSelectedId = null), (selectedUuid = uuid))}
        onstack={showStack}
        onmapclick={() => ((selectedUuid = null), (baseSelectedId = null))}
        base={baseLayer}
        baseSelected={baseSelectedId}
        onbaseselect={(id) => ((stack = null), (selectedUuid = null), (baseSelectedId = id))}
        stackAt={stack?.at ?? null}
        {onview}
        {height}
        {matching}
        onlocate={centreOnDevice}
      >
        {#snippet overlay()}
          {#if selectedSite}
            <MapSiteCard site={selectedSite} hideDiveCounts={common} onopen={() => openFromMap(selectedSite.uuid)} onclose={() => (selectedUuid = null)} />
          {:else if baseSelected}
            <MapSiteCard
              site={{ name: baseSelected.name, country: baseSelected.country, dives: baseSelected.dives ?? 0, lastDate: '', maxDepthMm: 0 }}
              line={baseCardLine(baseSelected, false)}
              onopen={() => baseSelected && openBase(baseSelected.id)}
              onclose={() => (baseSelectedId = null)}
            />
          {/if}
        {/snippet}
      </SiteMap>
      {#if canCommon}
        <!-- MD3 segmented button over the map (sites-commun-android.dc.html): the selected side has a check mark. -->
        <div class="bc-sites--mode" role="group" aria-label={t('sharedSites.show')}>
          <button type="button" class="bc-sites--mode-button" aria-pressed={!common} onclick={() => setSitesMode('mine')}>
            {#if !common}<Icon name="check" size={18} weight={2} />{/if}{t('sharedSites.mine')}
          </button>
          <button type="button" class="bc-sites--mode-button bc-sites--mode-common" aria-pressed={common} onclick={() => setSitesMode('common')}>
            {#if common}<Icon name="check" size={18} weight={2} />{/if}{t('sharedSites.commonMapButton')}
          </button>
        </div>
      {/if}
      <button type="button" class="bc-sites--locate" onclick={centreOnDevice}>
        <Icon name="locate" size={20} />
        <span class="bc-sr-only">{t('sites.centreOnMe')}</span>
      </button>
    </div>
  {/if}
{/snippet}

{#snippet band(/** @type {boolean} */ overMap)}
  <SectionBand
    {overMap}
    chip={!connection.online}
    summaryKey={searching}
    summary={common ? '' : searchCount || (used.length ? [t('band.sites', { n: used.length }), t('band.dives', { n: diveCount })].join(' · ') : '')}
  >
    {#if !connection.online}
      <p class="bc-sites--offline-chip" role="status"><Icon name="offline" size={16} weight={2} />{t('sites.offline')}</p>
    {/if}
  </SectionBand>
{/snippet}

{#snippet panel()}
  {#if common}
  <section class="bc-sites--panel" aria-label={t('sharedSites.listLabel')}>
    {#if !connection.online}
      <div class="bc-sites--common-offline" role="status">
        <Icon name="offline" size={24} />
        <div><h2>{t('sharedSites.offlineTitle')}</h2><p>{t('sharedSites.offline')}</p></div>
      </div>
    {:else if baseState === 'offer'}
      <div class="bc-sites--common-offer">
        <p>{t('sharedSites.offerText')}</p>
        <button type="button" class="bc-tonal-button" onclick={() => openOdPlus('offer')}>{t('sharedSites.offerButton')}</button>
      </div>
    {:else if baseState === 'failed'}
      <p class="bc-sites--area-count" role="status">{t('sharedSites.failed')}</p>
    {:else if baseState === 'loading'}
      <p class="bc-sites--area-count" role="status">{t('sharedSites.loadingArea')}</p>
    {:else if baseState === 'ready' && baseBox}
      {#if baseList.length}
        <nav class="list no-chevron bc-sites--surface bc-sites--list bc-sites--common-list" aria-label={t('sharedSites.listLabel')} bind:this={baseListEl}>
          <ul>
            {#each baseVisible.items as b, i (b.id)}
              <li data-virtual-list-index={baseVisible.from + i} aria-posinset={baseVisible.from + i + 1} aria-setsize={baseList.length} style:top="{baseVisible.top}px">
                <a href="/sites/base/{encodeURIComponent(b.id)}" class="item-link item-content">
                  <span class="bc-sites--common-dot" class:bc-sites--common-mine={inYourSites(b.id, sharedSites.links)} aria-hidden="true"></span>
                  <div class="item-inner">
                    <div class="bc-sites--text">
                      <div class="item-title bc-site-name">{b.name}</div>
                      <div class="item-text">{baseRowText(b, sharedSites.links, logbook.prefs)}</div>
                    </div>
                  </div>
                </a>
              </li>
            {/each}
          </ul>
        </nav>
      {/if}
      {#if baseLoadingMore}
        <p class="bc-sites--area-count" role="status">{t('sharedSites.loadingArea')}</p>
      {:else if !baseList.length}
        <p class="bc-sites--area-count" role="status">{t('sharedSites.emptyArea')}</p>
      {/if}
    {/if}
  </section>
  {:else}
  <section class="bc-sites--panel" aria-label={t('sites.listLabel')}>
    {#if withoutSite || unplaced || duplicates || unused}
     <div class="bc-sites--todo" class:bc-sites--hidden={searching} bind:this={todoEl}>
      <div class="bc-sites--todo-inner">
      <!-- « À faire » (bc-sites-todo), on every device: iPhone and iPad too since task 2026-11-14-148. -->
      <nav class="list bc-sites--links bc-sites--surface bc-sites-todo" aria-label={t('sites.todoLabel')}>
        <ul>
          {#if withoutSite}
            <li><a href="/sites/without/" class="item-link item-content"><div class="item-inner"><div class="item-title">{t('sites.withoutLink', { n: withoutSite })}</div></div></a></li>
          {/if}
          {#if unplaced}
            <li><a href="/sites/unplaced/" class="item-link item-content"><div class="item-inner"><div class="item-title">{t('sites.unplacedLink', { n: unplaced })}</div></div></a></li>
          {/if}
          {#if duplicates || unused}
            <li><a href="/sites/cleanup" class="item-link item-content"><div class="item-inner"><div class="item-title">{cleanupText}</div></div></a></li>
          {/if}
        </ul>
      </nav>
      </div>
     </div>
    {/if}

    {#if inArea}
      <p class="bc-sites--area-count" role="status">{t('sites.areaCount', { n: inArea.length })}</p>
    {/if}
    {#if listed.length}
      <!-- No chevron on the site rows (android-sites.dc.html). -->
      <div class="list no-chevron bc-sites--surface bc-sites--list" use:selectable>
        <ul>
          {#each listed as site (site.uuid)}
            <li class="bc-sites--site-row" data-uuid={site.uuid}>
              {#if selection.length}
                <label class="checkbox bc-sites--site-check">
                  <input type="checkbox" bind:checked={checked[site.uuid]} aria-label={t('sites.selectSite', { name: site.name || t('sites.noName') })} />
                  <i class="icon-checkbox"></i>
                </label>
              {/if}
              <a href="/sites/{site.uuid}" class="item-link item-content">
                <div class="item-inner">
                  <div class="bc-sites--text">
                    <div class="item-title bc-site-name">{#if site.name}{#each highlightParts(site.name, typed ? query : '') as part}{#if part.match}<mark class="bc-sites--match">{part.text}</mark>{:else}{part.text}{/if}{/each}{:else}{t('sites.noName')}{/if}</div>
                    <div class="item-text">
                      {site.hasLocation
                        ? t('sites.rowDives', { n: site.dives, date: formatDate(site.lastDate) })
                        : t('sites.rowNoGps', { n: site.dives })}
                    </div>
                  </div>
                  {#if site.maxDepthMm}<div class="bc-sites--depth bc-value">{formatDepth(site.maxDepthMm, logbook.prefs)}</div>{/if}
                </div>
              </a>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
    {#if typed && !results.length}
      <div class="list"><ul><li class="item-content"><div class="item-inner">{t('sites.noMatch')}</div></li></ul></div>
    {/if}
  </section>
  {/if}
{/snippet}

{#snippet fab()}
    <!-- MD3 FAB, 56 dp, over the list panel: a new site. -->
    <div class="fab fab-right-bottom bc-fab-add bc-sites--fab" class:bc-sites--hidden={searching} bind:this={fabEl}>
      <a href="/sites/new" aria-label={t('sites.newSite')}><i class="icon"><Icon name="plus" /></i></a>
    </div>
{/snippet}

<Page class="bc-sites{layout.phone ? '' : ' bc-sites--tablet'}" style="--bc-sites-pane: {listWidth + (ios ? 0 : 20)}px" onPageReinit={load}>
  {#snippet fixedContent()}
    <!-- The open search: ← and the field take the place of the top bar's items. -->
    <div class="bc-sites--search" class:bc-sites--open={searching} inert={!searching} bind:this={searchEl} role="search">
      <button type="button" class="bc-icon-button bc-sites--search-back" onclick={closeSearch}>
        <Icon name="arrowBack" /><span class="bc-sr-only">{t('sites.closeSearch')}</span>
      </button>
      <div class="bc-sites--search-field">
        <input
          bind:this={searchInput}
          bind:value={query}
          type="search"
          class="bc-sites--search-input"
          placeholder={t('sites.searchPlaceholder')}
          aria-label={t('sites.search')}
          enterkeyhint="search"
          autocomplete="off"
          onkeydown={(e) => e.key === 'Enter' && searchInput?.blur()}
        />
        {#if query}
          <button type="button" class="bc-sites--search-clear" onpointerdown={(e) => e.preventDefault()} onclick={clearSearch}>
            <Icon name="close" /><span class="bc-sr-only">{t('sites.clearSearch')}</span>
          </button>
        {/if}
      </div>
    </div>
    {#if selection.length}
      <!-- While sites are checked, the top bar gives way to their number. -->
      <div class="bc-sites--selection">
        <button type="button" class="bc-icon-button" onclick={() => (checked = {})}>
          <Icon name="close" /><span class="bc-sr-only">{t('logbook.selectionClose')}</span>
        </button>
        <span class="bc-sites--selection-count bc-value" role="status">{t('sites.selected', { n: selection.length })}</span>
        {#if selection.length >= 2}
          <a href="#menu" class="link icon-only bc-sites--popover-open bc-sites--selection-more" data-popover=".bc-sites-menu" role="button">
            {#if theme.ios}<Icon name="moreCircle" />{:else}<Icon name="more" weight={4} />{/if}
            <span class="bc-sr-only">{t('detail.moreOptions')}</span>
          </a>
        {/if}
      </div>
    {/if}
    {#if layout.phone && !selection.length}
      {@render fab()}
    {:else if layout.phone}
      <!-- Selecting: no FAB. -->
    {:else}
      <!-- Tablet (spec, section 3): the list on the left, the map on the right. -->
      <div class="bc-sites--split" class:ios>
        <div class="bc-sites--list-pane" style="width: {listWidth + (ios ? 0 : 20)}px">
          <!-- Like the Carnet: the band tops the list pane, the map stays beside it. -->
          <div class="bc-sites--scroll" data-od-scroll>{@render band(false)}{@render panel()}</div>
          {@render fab()}
        </div>
        <div class="bc-sites--map-pane">{@render mapBlock('100%')}</div>
      </div>
    {/if}
  {/snippet}
  <Popover class="bc-menu bc-sites-sort-menu" backdrop={false}>
    <List noChevron>
      <MenuItem icon={sortBy === 'name' ? 'check' : 'blank'} text={t('sites.sortName')} onclick={() => setSort('name')} />
      <MenuItem icon={sortBy === 'recent' ? 'check' : 'blank'} text={t('sites.sortRecent')} onclick={() => setSort('recent')} />
    </List>
  </Popover>

  <Popover class="bc-menu bc-sites-menu" backdrop={false}>
    <List noChevron>
      <MenuItem icon="merge" text={t('sites.mergeSites')} onclick={() => (choosingKeeper = true)} />
    </List>
  </Popover>

  <!-- A new sheet for each tap (MapStackSheet.svelte says why), removed once closed. -->
  {#if stack}
    {#key stack}
      <MapStackSheet sites={stackSites} place={stackPlace} hideDiveCounts={common} onclose={() => (stack = null)} onopen={openFromMap} />
    {/key}
  {/if}

  {#if choosingKeeper && selection.length >= 2}
    <ChoiceDialog
      title={t('sites.keepTitle')}
      note={t('sites.keepNote')}
      options={selection.map((s) => ({ value: String(s.uuid), label: s.name || t('sites.noName'), example: t('sites.diveCount', { n: s.dives }) }))}
      value={String(defaultKeeper(selection).uuid)}
      onselect={mergeSelection}
      oncancel={() => (choosingKeeper = false)}
    />
  {/if}

  <Navbar class="bc-band-bar bc-sites--bar{searching ? ' bc-sites--searching' : ''}" title={t('sites.title')}>
    {#snippet left()}<MenuButton />{/snippet}
    <NavRight>
      <Link iconOnly onClick={openSearch}><Icon name="search" /><span class="bc-sr-only">{t('sites.search')}</span></Link>
      {#if !theme.ios}<AccountAvatar />{/if}
      <Link iconOnly popoverOpen=".bc-sites-sort-menu">
        {#if theme.ios}<Icon name="moreCircle" />{:else}<Icon name="more" weight={4} />{/if}
        <span class="bc-sr-only">{t('detail.moreOptions')}</span>
      </Link>
      <!-- iPhone: the account initial after the other buttons (task 2026-11-14-127). -->
      {#if theme.ios}<AccountAvatar />{/if}
    </NavRight>
  </Navbar>

  {#if layout.phone}
    {@render band(true)}
    {@render mapBlock('calc(100vw * 4 / 5)')}
    {@render panel()}
  {/if}
</Page>

<style>
  @layer od.components {
    /* Keep the map width stable when the shared list appears or disappears. */
    :global(.bc-sites:not(.bc-sites--tablet) > .page-content) {
      scrollbar-gutter: stable;
    }

    /* Tablet: below the navigation bar, two panes side by side. */
    .bc-sites--split {
      position: absolute;
      inset: 0;
      display: flex;
    }

    /* Framework7's otherwise empty page content sits above the tablet panes. */
    :global(.bc-sites--tablet > .page-content) {
      pointer-events: none;
    }
    :global(.bc-sites--tablet > .page-content > *) {
      pointer-events: auto;
    }

    /* The top bar and the open search or selection belong to the list pane only:
       the map runs up to the top, beside them. */
    :global(.bc-sites--tablet .navbar.bc-sites--bar),
    :global(.bc-sites--tablet .bc-sites--search),
    :global(.bc-sites--tablet .bc-sites--selection) {
      right: auto;
      width: var(--bc-sites-pane);
    }

    .bc-sites--list-pane {
      position: relative;
      flex: none;
      display: flex;
      flex-direction: column;
      border-right: 0.5px solid var(--bc-separator);
    }

    .bc-sites--scroll {
      flex: 1;
      padding-top: calc(var(--f7-navbar-height) + var(--f7-safe-area-top));
      overflow-y: auto;
    }

    .bc-sites--map-pane {
      position: relative;
      flex: 1;
      min-width: 0;
    }

    /* Android: the rounded map pane stays 16 dp clear of the safe area. */
    .bc-sites--split:not(.ios) .bc-sites--map-pane {
      margin: 16px 16px calc(16px + var(--bc-safe-bottom)) 0;
      border-radius: 28px;
      overflow: hidden;
    }

    /* iPad: 44 pt button at the top right of the map. */
    .bc-sites--split.ios .bc-sites--locate {
      top: 76px;
      bottom: auto;
      width: 44px;
      height: 44px;
    }

    .bc-sites--split :global(.bc-fab-add) {
      position: absolute;
    }

    /* "Offline" (android-sites-hors-ligne.dc.html): 28 dp, translucent white, under the summary. */
    .bc-sites--offline-chip {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 28px;
      margin: 6px 0 0 12px;
      padding: 0 12px 0 8px;
      border-radius: 14px;
      background: var(--bc-band-control);
      color: var(--bc-on-band-control);
      font-size: 13px;
      font-weight: 600;
    }

    /* The open search, in the top bar's place (spec, "Sites, search open and its
       animation"). Closed, the field is clipped to the size of the magnifier
       button, at its place on the right: opening grows it to full width from
       there, closing shrinks it back. Closing is quicker and accelerates. */
    .bc-sites--search {
      --bc-search-from-right: 44px;
      --bc-search-open-ease: cubic-bezier(0.05, 0.7, 0.1, 1);
      --bc-search-close-ease: cubic-bezier(0.3, 0, 0.8, 0.15);
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      z-index: 600;
      height: calc(var(--f7-navbar-height) + var(--f7-safe-area-top));
      padding: var(--f7-safe-area-top) 12px 0 4px;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 4px;
      pointer-events: none;
      color: var(--bc-on-band);

      &.bc-sites--open > * {
        pointer-events: auto;
      }
    }

    .bc-sites--search-back {
      flex: none;
      color: inherit;
      opacity: 0;
      transition: opacity 100ms linear 100ms;

      .bc-sites--open & {
        opacity: 1;
        transition-delay: 0s;
      }
    }

    .bc-sites--search-field {
      flex: 1;
      min-width: 0;
      height: 48px;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 4px 0 16px;
      border-radius: 24px;
      background: transparent;
      clip-path: inset(0 var(--bc-search-from-right) 0 calc(100% - var(--bc-search-from-right) - 48px) round 24px);
      transition:
        clip-path 200ms var(--bc-search-close-ease),
        background-color 200ms var(--bc-search-close-ease);

      .bc-sites--open & {
        background: var(--bc-band-control);
        color: var(--bc-on-band-control);
        clip-path: inset(0 0 0 0 round 24px);
        transition-duration: 300ms;
        transition-timing-function: var(--bc-search-open-ease);
      }
    }

    .bc-sites--search-input {
      flex: 1;
      min-width: 0;
      height: 100%;
      padding: 0;
      border: none;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: 16px;
      outline: none;
      appearance: none;
      opacity: 0;
      transition: opacity 100ms linear;

      .bc-sites--open & {
        opacity: 1;
        transition-delay: 100ms;
      }

      &::-webkit-search-cancel-button {
        display: none;
      }

      &::placeholder {
        color: var(--bc-on-band-control-2);
      }
    }

    .bc-sites--search-clear {
      flex: none;
      width: 48px;
      height: 48px;
      padding: 0;
      border: none;
      border-radius: 50%;
      background: none;
      color: var(--bc-on-band-control-2);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* The top bar's own items give way: out in the first 100 ms of opening,
       back in the last 100 ms of closing. */
    :global(.navbar.bc-sites--bar .navbar-inner > *) {
      transition: opacity 100ms linear 100ms;
    }

    :global(.navbar.bc-sites--searching .navbar-inner > *) {
      opacity: 0;
      visibility: hidden;
      transition:
        opacity 100ms linear,
        visibility 0s linear 100ms;
    }

    /* The "à faire" card and the + button: fade and slide, 150 ms, and the
       card's room closes so the results rise under the map. */
    .bc-sites--todo {
      display: grid;
      grid-template-rows: 1fr;
      transition:
        grid-template-rows 150ms linear,
        opacity 150ms linear,
        transform 150ms linear,
        visibility 0s;

      &.bc-sites--hidden {
        grid-template-rows: 0fr;
        opacity: 0;
        transform: translateY(8px);
        visibility: hidden;
        transition:
          grid-template-rows 150ms linear,
          opacity 150ms linear,
          transform 150ms linear,
          visibility 0s linear 150ms;
      }
    }

    .bc-sites--todo-inner {
      min-height: 0;
      overflow: hidden;
    }

    .bc-sites--fab {
      transition:
        opacity 150ms linear,
        transform 150ms linear,
        visibility 0s;

      &.bc-sites--hidden {
        opacity: 0;
        transform: translateY(8px);
        visibility: hidden;
        transition:
          opacity 150ms linear,
          transform 150ms linear,
          visibility 0s linear 150ms;
      }
    }

    /* The matched part of a name. */
    .bc-sites--match {
      background: var(--bc-secondary-container);
      color: inherit;
      border-radius: 2px;
    }

    .bc-sites--map-pane .bc-sites--map {
      height: 100%;
    }


    /* « Centrer sur ma position » moves up above the card while it is open. */
    .bc-sites--card-open .bc-sites--locate {
      bottom: 116px;
    }

    /* « Mes sites | Carte commune »: MD3 segmented button, 40 dp, over the bottom left of the map. */
    .bc-sites--mode {
      position: absolute;
      z-index: 3;
      left: 16px;
      bottom: 32px;
      display: flex;
      height: 40px;
      max-width: calc(100% - 88px);
      border-radius: 20px;
      background: var(--bc-surface);
      box-shadow: 0 1px 3px rgb(0 0 0 / 0.2);
    }
    .bc-sites--mode-button {
      position: relative;
      display: flex;
      flex: none;
      align-items: center;
      justify-content: center;
      gap: 6px;
      width: auto;
      min-width: 48px;
      height: 40px;
      padding: 0 12px;
      border: none;
      background: transparent;
      font: inherit;
      font-size: 14px;
      line-height: 20px;
      font-weight: 500;
      white-space: nowrap;
      color: var(--bc-text);
      cursor: pointer;
      &:first-child {
        border-radius: 20px 0 0 20px;
      }
      &:last-child {
        border-radius: 0 20px 20px 0;
      }
      &::after {
        content: '';
        position: absolute;
        inset: -4px 0;
      }
      :global(.bc-icon) {
        flex: none;
      }
      &[aria-pressed='true'] {
        padding-left: 12px;
        font-weight: 600;
        background: var(--bc-secondary-container);
        color: var(--bc-on-secondary-container);
      }
    }
    .bc-sites--mode-common[aria-pressed='true'] {
      background: var(--bc-shared-site-container);
      color: var(--bc-on-shared-site-container);
    }
    .bc-sites--card-open .bc-sites--mode {
      bottom: 116px;
    }
    .bc-sites--common-dot {
      flex: none;
      width: 12px;
      height: 12px;
      margin-right: 16px;
      border-radius: 6px;
      background: var(--bc-shared-site);
    }
    .bc-sites--common-mine {
      background: var(--bc-text);
    }
    .bc-sites--common-offer {
      margin: 16px 24px;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 12px;
      color: var(--bc-text-2);
      & p {
        margin: 0;
      }
    }

    .bc-sites--common-offline {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin: 16px 24px;
      color: var(--bc-text-2);

      h2 {
        margin: 0;
        color: var(--bc-text);
        font-size: 16px;
        line-height: 24px;
      }

      p {
        margin: 4px 0 0;
        font-size: 14px;
        line-height: 20px;
      }
    }

    .bc-sites--area-count {
      margin: 8px 24px 4px;
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    /* The full-screen button (task 2026-11-14-147): phone, top right of the visible
       map, 16 dp from the edge, under the band (whose wave runs 18 px over the map). */
    .bc-sites--map {
      position: relative;
      --bc-map-button-top: 34px;
      --bc-map-button-right: 16px;

      /* Offline (android-sites-hors-ligne): the credits at the top, the button under them. */
      &.bc-sites--map-offline {
        --bc-map-credits-top: 34px;
        --bc-map-credits-bottom: auto;
        --bc-map-button-top: 62px;
      }
    }

    /* Tablets: the map is its own pane, the button 16 dp from its top right; the
       credits stay at the bottom. */
    .bc-sites--map-pane .bc-sites--map {
      --bc-map-button-top: 16px;
      --bc-map-credits-top: auto;
      --bc-map-credits-bottom: 4px;
    }

    /* iPad: 24 pt from the top, « Centrer sur ma position » right under it. */
    .bc-sites--split.ios .bc-sites--map {
      --bc-map-button-top: 24px;
    }

    /* 40 dp, white surface, 12 dp corners, elevation 1, 16 dp from the right
       of the map, above its credits. */
    .bc-sites--locate {
      position: absolute;
      right: 16px;
      bottom: 32px;
      width: 40px;
      height: 40px;
      border: none;
      border-radius: 12px;
      background: var(--bc-surface);
      color: var(--bc-text);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 1px 2px rgb(0 0 0 / 0.3), 0 1px 3px 1px rgb(0 0 0 / 0.15);
    }

    .bc-sites--selection {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      z-index: 600;
      height: calc(var(--f7-navbar-height) + var(--f7-safe-area-top));
      padding: var(--f7-safe-area-top) 8px 0 4px;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--bc-surface-2);
    }

    .bc-sites--selection-count {
      font-size: 22px;
      line-height: 28px;
      color: var(--bc-text);
    }

    .bc-sites--selection-more {
      margin-left: auto;
    }

    /* The box sits beside the row's link: touching it never opens the site. */
    .bc-sites--site-row {
      display: flex;
      align-items: center;
      user-select: none;
      -webkit-touch-callout: none;

      > a {
        flex: 1;
        min-width: 0;
      }
    }

    .bc-sites--site-check {
      flex: none;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      margin-left: 4px;
    }

    .bc-sites--panel {
      border-top: 1px solid var(--bc-separator);
      /* On a phone, the first group sits under the map without the count line. */
      padding-top: 12px;
      /* Room for the FAB under the last site. */
      padding-bottom: 88px;
    }

    /* Tablet: the band's wave already ends the header, no line under it. */
    .bc-sites--list-pane .bc-sites--panel {
      border-top: 0;
    }

    /* White surfaces, 20 dp corners, 16 dp side margins, 12 dp apart, light
       dividers between the rows (task 2026-11-07-24). */
    .bc-sites--surface {
      margin: 0 16px 12px;
      border-radius: 20px;
      overflow: hidden;
      background: var(--bc-surface);

      ul {
        background: none;
      }

      li + li {
        border-top: 1px solid var(--bc-row-divider);
      }
    }

    /* Maintenance rows: 48 dp, 14/20 ink, 24 dp chevron. */
    .bc-sites--links {
      .item-content,
      .item-inner {
        min-height: 48px;
      }

      /* A long row (« 2 doublons possibles, 3 sites sans plongée : … ») wraps, never cut. */
      .item-inner {
        padding-top: 12px;
        padding-bottom: 12px;
      }

      .item-title {
        font-size: 14px;
        line-height: 20px;
        letter-spacing: 0.25px;
        color: var(--bc-text);
        white-space: normal;
      }

      /* iPhone and iPad (ios-sites): 17 pt rows, 44 pt high at least. */
      :global(.ios) & {
        .item-content,
        .item-inner {
          min-height: 44px;
        }

        .item-inner {
          padding-top: 10px;
          padding-bottom: 10px;
        }

        .item-title {
          font-size: 17px;
          line-height: 22px;
          letter-spacing: normal;
        }
      }
    }

    /* Site rows: 72 dp, name 16/24, supporting 14/20, trailing depth 16/24
       medium ink, no chevron. */
    .bc-sites--list {
      .item-inner {
        min-height: 72px;
        padding: 8px 20px 8px 0;
        gap: 16px;
      }

      .bc-sites--text {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }

      .item-title {
        font-size: 16px;
        line-height: 24px;
        font-weight: 400;
        letter-spacing: 0.15px;
        color: var(--bc-text);
      }

      .item-text {
        font-size: 14px;
        line-height: 20px;
        letter-spacing: 0.25px;
        color: var(--bc-text-2);
      }

      .bc-sites--depth {
        flex: none;
        font-size: 16px;
        line-height: 24px;
        font-weight: 500;
        color: var(--bc-text);
      }
    }
  }
</style>
