<script>
  // @ts-check
  import { deviceStore } from '../lib/device-store.js';
  // Sites section (docs/mockups/android-sites.dc.html; spec, section 4,
  // "Sites"): the section header (☰, title, search), the map of the sites
  // with a position and "centre on my position", then the list panel: the
  // count, the « Nettoyer les sites » row (« n points à régler »), a divider and the sites.
  import { onDestroy, tick, untrack } from 'svelte';
  import { Page, Navbar, NavRight, Link, List, Popover, f7, theme } from 'framework7-svelte';
  import { showSnackbar } from '../lib/snackbar.js';
  import { BenthicCore } from 'benthic-core';
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
  import { cleanupCounts, siteChange } from '../lib/sites.svelte.js';
  import { cleanupPointCount } from '../lib/site-cleanup.js';
  import { defaultKeeper, sortSitesByName, sortSitesByRecent } from '../lib/site-merge.js';
  import { offerUndo } from '../lib/undo.js';
  import { formatDepth, formatDate, locale } from '../lib/format.js';
  import { layout, ios, listWidth, desktopApp } from '../lib/layout.svelte.js';
  import { t } from '../lib/i18n.js';
import { connection } from '../lib/online.svelte.js';
import { distanceKm, inBbox, normalizeBbox } from '../lib/geo.js';
import { matchesSite, highlightParts } from '../lib/site-search.js';
import MapStackSheet from '../components/MapStackSheet.svelte';
import SharedSiteCard from '../components/SharedSiteCard.svelte';
import MapSiteCard from '../components/MapSiteCard.svelte';
import { placeAt } from '../lib/place-lookup.js';
import { language } from '../lib/i18n.js';
import { benthicPlusAccount } from '../lib/benthic-plus-state.svelte.js';
import { loadLinks, readWholeMap, setSitesMode, sharedSites } from '../lib/shared-sites.svelte.js';
import { sitesInView } from '../lib/shared-clusters.js';
import { baseCardLine, baseRowText } from '../lib/shared-sites-format.js';
import { openBenthicPlus } from '../lib/open-offer.svelte.js';
import FoldingSearch from '../components/FoldingSearch.svelte';

  /** @type {import('benthic-core').SiteSummary[]} */
  let sites = $state([]);
  /** How many of the four problems of « Nettoyer les sites » exist (task 2026-11-24-395). */
  let pointsToFix = $state(0);
  /** @type {SiteMap|undefined} */
  let siteMap = $state();

  const SORT_KEY = 'bc.sitesSort';
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

  /**
   * Android phone (task 2026-11-23-339): the search box is in the band under the summary and folds into a
   * magnifier while the page scrolls; there is no « open search » state, the box is always there.
   */
  const fold = $derived(!theme.ios && layout.phone && !desktopApp);
  /** The box itself, on « Mes sites » and on « Carte commune » (there it searches the whole shared map). */
  const folding = $derived(fold);
  const typed = $derived((folding || searching) && query.trim() !== '');
  /** The search takes the page: the list of things to do and the + button give way. */
  const finding = $derived(fold ? typed : searching);

  // Folded box: the map's view before the search comes back when the search is emptied.
  let wasTyped = false;
  $effect(() => {
    if (!fold) return;
    const now = typed;
    untrack(() => {
      if (now && !wasTyped) viewBeforeSearch = siteMap?.getView() ?? null;
      else if (!now && wasTyped) {
        siteMap?.setView(viewBeforeSearch);
        viewBeforeSearch = null;
      }
      wasTyped = now;
    });
  });
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
    el?.addEventListener('bc-cancel', closeSearch);
    return () => el?.removeEventListener('bc-cancel', closeSearch);
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

  /** @type {{ center: [number, number], bounds: [number, number, number, number], zoom: number }|undefined} */
  let view = $state.raw();

  /** @param {{ center: [number, number], bounds: [number, number, number, number], zoom: number }} v */
  function onview(v) {
    view = v;
  }

  // « Mes sites | Carte commune » (task 2026-11-19-315, docs/mockups/sites-commun-android.dc.html): a signed-in Benthic+
  // account sees the shared map over its own sites. Who may read it is the server's switch: a refusal shows the offer.
  const canCommon = $derived(benthicPlusAccount.signedIn);
  const common = $derived(canCommon && sharedSites.mode === 'common');
  /** The whole shared map, grouped on the device by the map (lib/shared-clusters.js). */
  let wholeMap = $state.raw(/** @type {import('../lib/shared-sites.js').BaseSite[]|null} */ (null));
  /** The base sites in the visible area, or matching the search anywhere, nearest the centre first. */
  const baseList = $derived(
    common && wholeMap && view
      ? (typed ? wholeMap.filter((s) => matchesSite(s, query)) : sitesInView(wholeMap, normalizeBbox(view.bounds)))
          .map((s) => ({ ...s, distanceM: distanceKm(view.center[0], view.center[1], s.lon, s.lat) * 1000 }))
          .sort((a, b) => a.distanceM - b.distanceM)
      : [],
  );
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
  let baseSelectedId = $state(/** @type {string|null} */ (null));
  const baseSelected = $derived(baseSelectedId === null ? null : (wholeMap?.find((x) => x.id === baseSelectedId) ?? null));
  let baseAsk = 0;

  /** Reads the whole shared map (kept for the session, asked again with its version when old). */
  async function loadWholeMap() {
    const ask = ++baseAsk;
    if (!wholeMap) baseState = 'loading';
    try {
      const sites = await readWholeMap();
      if (ask !== baseAsk) return;
      wholeMap = sites;
      baseState = 'ready';
    } catch (err) {
      if (ask !== baseAsk) return;
      console.error('Shared map', err);
      const code = /** @type {any} */ (err)?.code;
      baseState = code === 'SUBSCRIPTION_REQUIRED' ? 'offer' : 'failed';
    }
  }

  $effect(() => {
    if (!common || !connection.online) {
      untrack(() => baseAsk++);
      baseSelectedId = null;
      wholeMap = null;
      baseState = 'idle';
      return;
    }
    if (!sharedSites.linksLoaded) loadLinks();
    // Each stop of the map checks the copy is fresh (no request while it is).
    view;
    untrack(() => loadWholeMap());
  });

  /**
   * A row of the shared list: the site is selected on the map, which centres on it, and its card shows (task 398).
   * On the phone the page scrolls back up to the map.
   * @param {import('../lib/shared-sites.js').BaseSite} b
   */
  function pickBase(b) {
    stack = null;
    selectedUuid = null;
    baseSelectedId = b.id;
    // On the phone the card covers the bottom of the map: the site shows in the strip above it.
    siteMap?.centreOn({ latUdeg: Math.round(b.lat * 1e6), lonUdeg: Math.round(b.lon * 1e6) }, layout.phone ? 96 : 0);
    if (layout.phone) baseListEl?.closest('.page-content')?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** What the map draws of the base. */
  const baseLayer = $derived(
    common && wholeMap
      ? { sites: wholeMap.map((x) => ({ id: x.id, name: x.name, lat: x.lat, lon: x.lon, label: `${x.name}, ${baseCardLine(x, false)}` })) }
      : null,
  );

  /**
   * On « Carte commune » the map draws the shared sites only, yours among them like any other
   * (task 2026-11-24-394), and its accessible name counts them.
   */
  const commonMapLabel = $derived.by(() => {
    if (!common || !wholeMap) return undefined;
    const count = t('sharedSites.mapLabel', { n: baseList.length });
    return baseSelected ? `${count} ${t('sites.mapSelected', { name: baseSelected.name })}` : count;
  });


  async function load() {
    try {
      sites = await cachedSites();
      pointsToFix = cleanupPointCount(await cleanupCounts());
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
    <div class="bc-sites--map" class:bc-sites--card-open={!!selectedSite} class:bc-sites--shared-card-open={!selectedSite && !!baseSelected} class:bc-sites--no-fab={common}>
      <!-- Full screen keeps the pins and its own locate button. A tapped pin shows its card;
           several under the finger open a sheet. The shared map shows names from zoom 13. -->
      <SiteMap
        bind:this={siteMap}
        sites={common ? [] : located}
        label={commonMapLabel}
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
            {#key baseSelected.id}<SharedSiteCard site={baseSelected} onclose={() => (baseSelectedId = null)} />{/key}
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
    summaryKey={finding}
    tall={folding}
    summary={common ? '' : searchCount || (used.length ? [t('band.sites', { n: used.length }), t('band.dives', { n: diveCount })].join(' · ') : '')}
  >
    {#if folding}<div class="bc-folding-search--slot"></div>{/if}
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
        <button type="button" class="bc-tonal-button" onclick={() => openBenthicPlus('offer')}>{t('sharedSites.offerButton')}</button>
      </div>
    {:else if baseState === 'failed'}
      <p class="bc-sites--area-count" role="status">{t('sharedSites.failed')}</p>
    {:else if baseState === 'loading'}
      <p class="bc-sites--area-count" role="status">{t('sharedSites.loadingArea')}</p>
    {:else if baseState === 'ready' && wholeMap}
      {#if baseList.length}
        <nav class="list no-chevron bc-sites--surface bc-sites--list bc-sites--common-list" aria-label={t('sharedSites.listLabel')} bind:this={baseListEl}>
          <ul>
            {#each baseVisible.items as b, i (b.id)}
              <li data-virtual-list-index={baseVisible.from + i} aria-posinset={baseVisible.from + i + 1} aria-setsize={baseList.length} style:top="{baseVisible.top}px">
                <button type="button" class="item-link item-content bc-sites--common-row" aria-pressed={b.id === baseSelectedId} onclick={() => pickBase(b)}>
                  <span class="bc-sites--common-dot" aria-hidden="true"></span>
                  <div class="item-inner">
                    <div class="bc-sites--text">
                      <div class="item-title bc-site-name">{b.name}</div>
                      <div class="item-text">{baseRowText(b, logbook.prefs)}</div>
                    </div>
                  </div>
                </button>
              </li>
            {/each}
          </ul>
        </nav>
      {/if}
      {#if !baseList.length}
        <p class="bc-sites--area-count" role="status">{t('sharedSites.emptyArea')}</p>
      {/if}
    {/if}
  </section>
  {:else}
  <section class="bc-sites--panel" aria-label={t('sites.listLabel')}>
    {#if pointsToFix}
     <div class="bc-sites--todo" class:bc-sites--hidden={finding} bind:this={todoEl}>
      <div class="bc-sites--todo-inner">
      <!-- One row, « Nettoyer les sites » (bc-sites-todo), on every device (task 2026-11-24-395). -->
      <nav class="list bc-sites--links bc-sites--surface bc-sites-todo" aria-label={t('sites.todoLabel')}>
        <ul>
          <li><a href="/sites/cleanup/" class="item-link item-content"><div class="item-inner"><div class="bc-sites--text"><div class="item-title">{t('sites.cleanupTitle')}</div><div class="item-text">{t('sites.pointsToFix', { n: pointsToFix })}</div></div></div></a></li>
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
    <!-- MD3 FAB, 56 dp: a new site. Phone: over the list panel; tablet: at the bottom right of the map. -->
    <div class="fab fab-right-bottom bc-fab-add bc-sites--fab" class:bc-sites--hidden={finding} bind:this={fabEl}>
      <a href="/sites/new" aria-label={t('sites.newSite')}><i class="icon"><Icon name="plus" /></i></a>
    </div>
{/snippet}

<Page class="bc-sites{layout.phone ? '' : ' bc-sites--tablet'}{fold ? ' bc-sites--fold' : ''}" style="--bc-sites-pane: {listWidth + (ios ? 0 : 20)}px" onPageReinit={load}>
  {#snippet fixedContent()}
    {#if folding && !selection.length}
      <FoldingSearch bind:value={query} label={t('sites.search')} />
    {/if}
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
    {#if layout.phone && !selection.length && !common}
      {@render fab()}
    {:else if layout.phone}
      <!-- Selecting: no FAB. -->
    {:else}
      <!-- Tablet (spec, section 3): the list on the left, the map on the right. -->
      <div class="bc-sites--split" class:ios>
        <div class="bc-sites--list-pane" style="width: {listWidth + (ios ? 0 : 20)}px">
          <!-- Like the Carnet: the band tops the list pane, the map stays beside it. -->
          <div class="bc-sites--scroll" data-bc-scroll>{@render band(false)}{@render panel()}</div>
        </div>
        <div class="bc-sites--map-pane">{@render mapBlock('100%')}{#if !selection.length && !common}{@render fab()}{/if}</div>
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

  <Navbar class="bc-band-bar bc-sites--bar{searching ? ' bc-sites--searching' : ''}{folding ? ' bc-band-tall' : ''}" title={t('sites.title')}>
    {#snippet left()}<MenuButton />{/snippet}
    <NavRight>
      {#if fold}
        {#if folding}<span class="bc-folding-search--target" aria-hidden="true"></span>{/if}
      {:else}
        <Link iconOnly onClick={openSearch}><Icon name="search" /><span class="bc-sr-only">{t('sites.search')}</span></Link>
      {/if}
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
  @layer bc.components {
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

    /* Tablet: the FAB at the bottom right of the map pane (24 dp from the side, above the map credits), « Centrer sur ma position » above it;
       both move up above the site card while it is open. */
    .bc-sites--split :global(.bc-fab-add) {
      position: absolute;
      z-index: 3;
      right: 24px;
      bottom: 64px;
    }

    .bc-sites--split:not(.ios) .bc-sites--locate {
      bottom: 136px;
    }

    .bc-sites--split:has(.bc-sites--card-open) :global(.bc-fab-add) {
      bottom: 116px;
    }

    .bc-sites--split:not(.ios) .bc-sites--card-open .bc-sites--locate {
      bottom: 188px;
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

    /* The shared site's card is taller (task 398); on the tablet it sits at the bottom left and leaves the button be. */
    .bc-sites--shared-card-open .bc-sites--locate {
      bottom: 208px;
    }

    /* Tablet, « Carte commune »: no FAB, so « Centrer sur ma position » comes down above the map credits. */
    .bc-sites--split:not(.ios) .bc-sites--no-fab .bc-sites--locate {
      bottom: 64px;
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
    /* A row of the shared list is a button: it selects the site on the map. */
    .bc-sites--common-row {
      width: 100%;
      border: none;
      background: none;
      font: inherit;
      color: inherit;
      text-align: start;
      cursor: pointer;
    }

    .bc-sites--common-dot {
      flex: none;
      width: 12px;
      height: 12px;
      margin-right: 16px;
      border-radius: 6px;
      background: var(--bc-shared-site);
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
    }

    /* Android phone (task 2026-11-25-399): the full-screen button at the top right of the map and « Mes sites |
       Carte commune » level with it at the top left; a shared site's card starts under them. */
    :global(.bc-sites--fold) .bc-sites--mode,
    :global(.bc-sites--fold) .bc-sites--card-open .bc-sites--mode {
      top: 34px;
      bottom: auto;
    }

    /* The card covers « Centrer sur ma position » while it is open. */
    :global(.bc-sites--fold) .bc-sites--shared-card-open .bc-sites--locate {
      visibility: hidden;
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
