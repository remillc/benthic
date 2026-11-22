<script>
  // @ts-check
  // The desktop Sites section (tasks 2026-11-15-171, 175 and 177; mock-ups bureau-sites*): from
  // 1200 dp wide, the sites are a table on the left (Site, Pays, Plongées, Dernière), the offline
  // map on the right; a click on a pin selects the row and the reverse. Above the table the bars
  // that never scroll: « n plongées sans site » and « Nettoyer les sites ». The right pane also
  // shows the site's sheet (edited in place, saved at once), « Nouveau site », the dives without a
  // site and the clean-up. App.svelte picks this page for the Sites view when layout.desktop.
  import { tick, untrack } from 'svelte';
  import { Page } from 'framework7-svelte';
  import { OpenDivesCore } from 'opendives-core';
  import { cachedSites } from '../lib/core-cache.js';
  import Icon from '../components/Icon.svelte';
  import DesktopContextMenu from '../components/DesktopContextMenu.svelte';
  import DesktopSiteMap from '../components/DesktopSiteMap.svelte';
  import DesktopSiteSheet from '../components/DesktopSiteSheet.svelte';
  import DesktopSiteNew from '../components/DesktopSiteNew.svelte';
  import DesktopSitesWithout from '../components/DesktopSitesWithout.svelte';
  import DesktopSitesCleanup from '../components/DesktopSitesCleanup.svelte';
  import { logbook, undoLastChange } from '../lib/logbook.svelte.js';
  import { possibleDuplicates } from '../lib/sites.svelte.js';
  import { siteFocus } from '../lib/site-focus.svelte.js';
  import { deskSites, loadSitesChoices, setSitesSort, setSitesWidth, loadRegions, retryWaiting, showSiteDives } from '../lib/desktop-sites.svelte.js';
  import {
    SITE_COLUMNS,
    nextSort,
    sortSites,
    searchSites,
    reduceSelection,
    withoutSiteBar,
    cleanupBar,
    highlightParts,
  } from '../lib/desktop-sites.js';
  import { clampTableWidth } from '../lib/desktop-table.js';
  import { undoNameKey } from '../lib/undo-name.js';
  import { navigation, openAbout } from '../lib/navigation.svelte.js';
  import { connection } from '../lib/online.svelte.js';
  import { desktopMac, layout } from '../lib/layout.svelte.js';
  import { formatDepth, formatDate, locale } from '../lib/format.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { setDiveSite } from '../lib/dive-site.js';
  import { t } from '../lib/i18n.js';
  import { odplusAccount } from '../lib/benthic-plus-state.svelte.js';
  import { loadLinks, setSitesMode, sharedSites, withSession } from '../lib/shared-sites.svelte.js';
  import { inYourSites } from '../lib/shared-sites.js';
  import { baseCardLine, baseRowText } from '../lib/shared-sites-format.js';
  import { distanceKm } from '../lib/maps-logic.js';
  import { openOdPlus } from '../lib/open-offer.svelte.js';

  loadSitesChoices();

  const mod = desktopMac ? '⌘' : 'Ctrl+';

  // --- The data: the sites, the dives without a site, the possible duplicates. ---------------
  /** @type {import('opendives-core').SiteSummary[]} */
  let sites = $state([]);
  /** @type {{id: number, number: number, date: string, durationSeconds: number, suggestedSite: number, latUdeg?: number, lonUdeg?: number}[]} */
  let without = $state([]);
  /** @type {{a: import('opendives-core').SiteSummary, b: import('opendives-core').SiteSummary, distanceM: number}[]} */
  let pairs = $state([]);
  let loaded = $state(false);

  async function load() {
    try {
      sites = await cachedSites();
      without = await OpenDivesCore.siteQuery({ kind: 'without' });
      pairs = await possibleDuplicates();
      loaded = true;
    } catch (e) {
      console.error('Sites', e);
    }
  }

  // Read again when the logbook or a site changes (an edit, an undo, a merge, a dive's new site).
  $effect(() => {
    logbook.loading;
    logbook.sitesVersion;
    if (!logbook.loading) untrack(() => load());
  });

  const unused = $derived(sites.filter((s) => s.dives === 0));
  const diveCount = $derived(sites.reduce((n, s) => n + s.dives, 0));

  // --- Search: names, regions and countries. ------------------------------------------------
  let query = $state('');
  const typed = $derived(query.trim() !== '');
  /** @type {HTMLInputElement|undefined} */
  let searchField = $state();

  // The regions are read when they are needed: a search, an open sheet or form.
  $effect(() => {
    sites;
    logbook.sitesVersion;
    if (typed || pane !== 'sites' || sel.mode === 'sheet') untrack(() => loadRegions(sites, logbook.sitesVersion));
  });

  // A search shows the sites again: the map, not the lists of the bars.
  $effect(() => {
    if (typed && (pane === 'without' || pane === 'cleanup')) pane = 'sites';
  });

  const results = $derived(searchSites(sites, deskSites.regions, query));
  const rows = $derived(sortSites(results, deskSites.sort, locale));
  const matching = $derived(typed ? new Set(results.map((s) => s.uuid)) : null);
  const summary = $derived(
    typed
      ? results.length
        ? t('sites.searchCount', { n: results.length, text: query.trim() })
        : t('sites.noMatch')
      : sites.length
        ? [t('band.sites', { n: sites.length }), t('band.dives', { n: diveCount })].join(' · ')
        : '',
  );

  // --- The selection shared by the table and the map. ---------------------------------------
  /** @type {import('../lib/desktop-sites.js').Selection} */
  let sel = $state({ selected: null, mode: 'map' });
  /** What the right pane shows: the map or the sheet, a new site, the dives without a site, the clean-up. */
  let pane = $state(/** @type {'sites'|'new'|'without'|'cleanup'} */ ('sites'));
  /** « Nouveau site » opened from a dive without a site: that dive, and where the site starts. */
  let newFor = $state(/** @type {{ id: number, at: {latUdeg: number, lonUdeg: number}|null }|null} */ (null));

  /** @param {Parameters<typeof reduceSelection>[1]} event @param {number} [uuid] */
  function select(event, uuid) {
    sel = reduceSelection(sel, event, uuid);
    if (event.type === 'row' || event.type === 'pin' || event.type === 'edit') pane = 'sites';
  }

  // A site that goes (deleted, merged, a search that hides it) is no longer selected.
  $effect(() => {
    const uuids = rows.map((s) => s.uuid);
    const next = reduceSelection(untrack(() => sel), { type: 'visible', uuids });
    if (next !== untrack(() => sel)) sel = next;
  });

  // A dive's « Voir le site dans Sites »: its site opens in the sheet.
  $effect(() => {
    const uuid = siteFocus.uuid;
    if (uuid && sites.some((s) => s.uuid === uuid)) {
      untrack(() => select({ type: 'row' }, uuid));
      siteFocus.uuid = 0;
    }
  });

  const selectedSite = $derived(sites.find((s) => s.uuid === sel.selected) ?? null);

  const canCommon = $derived(odplusAccount.signedIn);
  const common = $derived(canCommon && sharedSites.mode === 'common');
  let mapView = $state.raw(/** @type {{ center: [number, number], bounds: [number, number, number, number], zoom: number }|null} */ (null));
  let baseBox = $state.raw(/** @type {import('../lib/shared-sites.js').BaseSite[]} */ ([]));
  let baseClusters = $state.raw(/** @type {{ lat: number, lon: number, count: number }[]} */ ([]));
  let baseList = $state.raw(/** @type {import('../lib/shared-sites.js').BaseSite[]} */ ([]));
  let baseSelectedId = $state(/** @type {string|null} */ (null));
  let baseState = $state(/** @type {'idle'|'loading'|'ready'|'offer'|'failed'} */ ('idle'));
  let baseAsk = 0;
  const baseSelected = $derived(baseBox.find((s) => s.id === baseSelectedId) ?? null);
  const baseLayer = $derived(common ? baseBox.map((s) => ({ id: s.id, name: s.name, lat: s.lat, lon: s.lon, mine: inYourSites(s.id, sharedSites.links) })) : []);

  $effect(() => {
    const view = mapView;
    const q = query.trim();
    const enabled = common && connection.online;
    const ask = ++baseAsk;
    if (!common) baseSelectedId = null;
    if (!enabled || !view) return;
    if (!sharedSites.linksLoaded) void loadLinks();
    const timer = setTimeout(async () => {
      baseState = 'loading';
      const [w, s, e, n] = view.bounds;
      const radiusM = Math.min(50000, Math.max(1, Math.round(distanceKm(view.center[0], view.center[1], e, n) * 1000)));
      try {
        const [box, nearby] = await withSession((api, token) => Promise.all([
          api.inBox(token, { bbox: [w, s, e, n], zoom: view.zoom }),
          api.nearby(token, { lat: view.center[1], lon: view.center[0], radiusM, limit: 30, q }),
        ]));
        if (ask !== baseAsk) return;
        baseBox = box.sites;
        baseClusters = box.clusters;
        baseList = nearby;
        baseState = 'ready';
      } catch (error) {
        if (ask !== baseAsk) return;
        console.error('Shared site area', error);
        baseState = /** @type {any} */ (error)?.code === 'SUBSCRIPTION_REQUIRED' ? 'offer' : 'failed';
      }
    }, 350);
    return () => { clearTimeout(timer); baseAsk++; };
  });

  /** @type {HTMLElement|undefined} */
  let scrollEl = $state();
  // The row of the selected site stays on screen (a pin was clicked).
  $effect(() => {
    const uuid = sel.selected;
    if (uuid === null) return;
    tick().then(() => scrollEl?.querySelector(`[data-site="${uuid}"]`)?.scrollIntoView({ block: 'nearest' }));
  });

  /** A click on the list's empty area returns to the map. @param {MouseEvent} e */
  function emptyAreaClick(e) {
    if (e.target === e.currentTarget) select({ type: 'escape' });
  }

  const bars = $derived({
    without: withoutSiteBar(without.length, typed),
    cleanup: cleanupBar(pairs.length, unused.length, typed),
  });

  function showWithout() {
    pane = pane === 'without' ? 'sites' : 'without';
  }
  function showCleanup() {
    pane = pane === 'cleanup' ? 'sites' : 'cleanup';
  }
  function newSite(/** @type {typeof newFor} */ from = null) {
    newFor = from;
    pane = 'new';
  }

  // --- New site: what happens after the form. ---
  /** @param {{ uuid: number, name: string }} site */
  async function created(site) {
    const dive = newFor;
    newFor = null;
    if (dive) {
      await setDiveSite(dive.id, site.uuid);
      pane = 'without';
    } else {
      pane = 'sites';
    }
    await tick();
    select({ type: 'pin' }, site.uuid);
  }
  /** @param {import('opendives-core').SiteSummary} site */
  async function useExisting(site) {
    const dive = newFor;
    newFor = null;
    if (dive) {
      await setDiveSite(dive.id, site.uuid);
      pane = 'without';
    } else {
      pane = 'sites';
      select({ type: 'row' }, site.uuid);
    }
  }
  function cancelNew() {
    pane = newFor ? 'without' : 'sites';
    newFor = null;
  }

  // --- The ⋮ of the header: Annuler and Rétablir naming the change, then the section's items. ---
  /** @type {{x: number, y: number}|null} */
  let moreAt = $state(null);
  /** @param {MouseEvent} e */
  function openMore(e) {
    const r = /** @type {HTMLElement} */ (e.currentTarget).getBoundingClientRect();
    moreAt = { x: r.right - 280, y: r.bottom + 4 };
  }
  /** « Annuler : Fusionner les sites », or plain « Annuler » when the step has no known name. @param {'undo'|'redo'} which */
  function undoEntryText(which) {
    const key = undoNameKey(which === 'undo' ? logbook.undoText : logbook.redoText);
    return key ? t(`desktop.${which}Named`, { action: t(key) }) : t(`desktop.${which}Plain`);
  }
  const moreEntries = $derived(
    /** @type {import('../lib/desktop-table.js').MenuEntry[]} */ ([
      { key: 'undo', label: '', text: undoEntryText('undo'), icon: 'undo', shortcut: desktopMac ? '⌘Z' : 'Ctrl+Z', disabled: !logbook.undoText },
      { key: 'redo', label: '', text: undoEntryText('redo'), icon: 'redo', shortcut: desktopMac ? '⇧⌘Z' : 'Ctrl+Maj+Z', disabled: !logbook.redoText },
      { key: 'separator' },
      { key: 'cleanup', label: '', text: t('sites.cleanupTitle'), icon: 'delete' },
      // Task 2026-11-15-202: « À propos d'OpenDives » ends the ⋮ menus on Windows and Linux.
      ...(desktopMac ? [] : [{ key: 'separator' }, { key: 'about', label: '', text: t('desktopSettings.about'), icon: 'info' }]),
    ]),
  );
  /** @param {string} key */
  function moreChoose(key) {
    if (key === 'undo' || key === 'redo') command(key);
    else if (key === 'cleanup') pane = 'cleanup';
    else if (key === 'about') openAbout();
  }

  // --- Keyboard and the Mac's menu bar. ------------------------------------------------------
  /** @type {HTMLElement|undefined} */
  let pageEl = $state();
  /** @type {DesktopSiteSheet|undefined} */
  let sheet = $state();

  /** Whether the Sites page is the one in use (no menu, no dialog over it). */
  function inUse() {
    return (
      layout.desktop &&
      navigation.section === 'sites' &&
      !moreAt &&
      !document.querySelector('.dialog.modal-in, .sheet-modal.modal-in, .popup.modal-in, .bc-site-chooser') &&
      !!pageEl?.closest('.page-current')
    );
  }

  /** @param {string} command a shortcut's or a menu item's command */
  function command(command) {
    switch (command) {
      case 'find':
        searchField?.focus();
        searchField?.select();
        return true;
      case 'new':
        newSite();
        return true;
      case 'edit':
        if (!common && sel.selected !== null) {
          select({ type: 'edit' });
          tick().then(() => sheet?.focusFirst());
        }
        return true;
      case 'undo':
      case 'redo':
        undoLastChange(command === 'redo').catch((/** @type {unknown} */ e) => {
          console.error('Sites undo', e);
          showSnackbar(t('desktop.changeFailed'));
        });
        return true;
    }
    return false;
  }

  $effect(() => {
    /** @param {KeyboardEvent} e */
    const keydown = (e) => {
      if (!inUse()) return;
      const typing = e.target instanceof HTMLElement && !!e.target.closest('input, textarea, select, [contenteditable="true"]');
      const modKey = desktopMac ? e.metaKey : e.ctrlKey;
      const key = e.key.toLowerCase();
      /** @type {string|null} */
      let cmd = null;
      if (modKey && key === 'f') cmd = 'find';
      else if (!typing && modKey && key === 'n') cmd = 'new';
      else if (!typing && modKey && key === 'e') cmd = 'edit';
      else if (!typing && modKey && key === 'z') cmd = e.shiftKey ? 'redo' : 'undo';
      else if (!typing && modKey && key === 'y' && !desktopMac) cmd = 'redo';
      else if (e.key === 'Escape') {
        if (typing && e.target === searchField) {
          // The first Échap clears the search, and « tout revoir ».
          query = '';
          searchField?.blur();
        } else if (!typing) {
          if (pane !== 'sites') pane = 'sites';
          else if (baseSelectedId !== null) baseSelectedId = null;
          else select({ type: 'escape' });
        }
        return;
      } else if (!typing && !common && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && pane === 'sites' && rows.length) {
        e.preventDefault();
        const at = rows.findIndex((s) => s.uuid === sel.selected);
        const next = rows[Math.max(0, Math.min(rows.length - 1, at < 0 ? 0 : at + (e.key === 'ArrowDown' ? 1 : -1)))];
        sel = { selected: next.uuid, mode: sel.mode };
        return;
      }
      if (cmd && command(cmd)) e.preventDefault();
    };
    window.addEventListener('keydown', keydown);
    const off = /** @type {any} */ (window).odDesktop?.onMenu?.((/** @type {string} */ c) => inUse() && command(c));
    return () => {
      window.removeEventListener('keydown', keydown);
      off?.();
    };
  });

  // The network is back: the sites whose country and region waited are filled.
  $effect(() => {
    if (connection.online) untrack(() => retryWaiting());
  });

  // --- The handle between the table and the right pane. ------------------------------------
  /** @type {HTMLElement|undefined} */
  let bodyEl = $state();
  /** @param {PointerEvent} e */
  function startResize(e) {
    const handle = /** @type {HTMLElement} */ (e.currentTarget);
    handle.setPointerCapture(e.pointerId);
    const box = /** @type {HTMLElement} */ (bodyEl).getBoundingClientRect();
    /** @param {PointerEvent} m */
    const move = (m) => (deskSites.width = clampTableWidth(m.clientX - box.left, box.width, { minTable: 360, minDetail: 460 }));
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      setSitesWidth(deskSites.width);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  }
  /** @param {KeyboardEvent} e */
  function resizeKey(e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const available = bodyEl?.getBoundingClientRect().width ?? innerWidth;
    setSitesWidth(clampTableWidth(deskSites.width + (e.key === 'ArrowRight' ? 16 : -16), available, { minTable: 360, minDetail: 460 }));
  }

  /** « Nouvelle-Zélande · 1 plongée · 60,4 m au plus profond » @param {import('opendives-core').SiteSummary} s */
  function cardLine(s) {
    return [s.country, common ? '' : t('sites.diveCount', { n: s.dives }), s.maxDepthMm ? t('desktopSites.deepestAt', { depth: formatDepth(s.maxDepthMm, logbook.prefs) }) : ''].filter(Boolean).join(' · ');
  }
</script>

<Page class="bc-desktop-sites" pageContent={false}>
  <div class="bc-desktop-sites--frame" bind:this={pageEl}>
    <header class="bc-desktop-sites--bar">
      <div class="bc-desktop-sites--titles">
        <h1 class="bc-desktop-sites--title">{t('sites.title')}</h1>
        {#if !common && summary}<p class="bc-desktop-sites--summary bc-value" title={summary} role="status">{summary}</p>{/if}
      </div>
      <label class="bc-desktop-sites--search">
        <Icon name="search" size={20} />
        <input type="search" bind:this={searchField} bind:value={query} placeholder={t('sites.search')} spellcheck="false" aria-keyshortcuts={desktopMac ? 'Meta+F' : 'Control+F'} autocomplete="off" />
        {#if !query}<kbd class="bc-desktop-sites--hint">{mod}F</kbd>{/if}
      </label>
      <button type="button" class="bc-desktop-sites--outlined" aria-keyshortcuts={desktopMac ? 'Meta+N' : 'Control+N'} onclick={() => newSite()}>
        <Icon name="plus" size={20} />{t('sites.newSite')}
      </button>
      <button type="button" class="bc-desktop-sites--icon-button" aria-label={t('desktopSites.moreSites')} title={t('desktopSites.moreSites')} aria-haspopup="menu" onclick={openMore}>
        <Icon name="more" size={22} />
      </button>
    </header>

    <div class="bc-desktop-sites--body" bind:this={bodyEl}>
      <div class="bc-desktop-sites--list" style:width="{deskSites.width}px">
        <!-- The bars never scroll: the list below is the only part that does (task 175). -->
        {#if !common && bars.without}
          <div class="bc-desktop-sites--todo" class:bc-desktop-sites--active={pane === 'without'} role="status">
            <svg class="bc-desktop-sites--todo-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10zM10 9l4 4M14 9l-4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
            <span class="bc-desktop-sites--todo-text">{t('desktopSites.withoutBar', { n: bars.without.count })}</span>
            <button type="button" class="bc-desktop-sites--link" aria-pressed={pane === 'without'} onclick={showWithout}>{t('desktopSites.findThem')}</button>
          </div>
        {/if}
        {#if !common && bars.cleanup}
          <div class="bc-desktop-sites--todo" class:bc-desktop-sites--active={pane === 'cleanup'} role="status">
            <Icon name="delete" size={18} />
            <span class="bc-desktop-sites--todo-text">{[bars.cleanup.duplicates ? t('sites.duplicatesCount', { n: bars.cleanup.duplicates }) : '', bars.cleanup.unused ? t('sites.unusedCount', { n: bars.cleanup.unused }) : ''].filter(Boolean).join(' · ')}</span>
            <button type="button" class="bc-desktop-sites--link" aria-pressed={pane === 'cleanup'} onclick={showCleanup}>{t('desktopSites.cleanUp')}</button>
          </div>
        {/if}
        {#if typed && !common}<p class="bc-desktop-sites--search-note">{t('desktopSites.searchNote')}</p>{/if}

        {#if common}
          {#if !connection.online}
            <p class="bc-desktop-sites--state" role="status">{t('sharedSites.offline')}</p>
          {:else if baseState === 'offer'}
            <div class="bc-desktop-sites--state"><p>{t('sharedSites.offerText')}</p><button type="button" class="bc-tonal-button" onclick={() => openOdPlus('offer')}>{t('sharedSites.offerButton')}</button></div>
          {:else if baseState === 'failed'}
            <p class="bc-desktop-sites--state" role="status">{t('sharedSites.failed')}</p>
          {:else if baseState !== 'ready'}
            <p class="bc-desktop-sites--state" role="status" aria-busy="true">{t('logbook.loading')}</p>
          {:else}
            <div class="bc-desktop-sites--scroll" aria-label={t('sharedSites.listLabel')}>
              {#each baseList as site (site.id)}
                <a class="bc-desktop-sites--shared-row" href="/sites/base/{encodeURIComponent(site.id)}">
                  <span>{site.name}</span>
                  <span class="bc-desktop-sites--muted">{baseRowText(site, sharedSites.links, logbook.prefs)}</span>
                </a>
              {:else}
                <p class="bc-desktop-sites--state">{t('sites.noMatch')}</p>
              {/each}
            </div>
          {/if}
        {:else if !loaded}
          <p class="bc-desktop-sites--state" role="status" aria-busy="true">{t('logbook.loading')}</p>
        {:else if !sites.length}
          <div class="bc-desktop-sites--state">
            <h2 class="bc-state-title">{t('desktopSites.emptyTitle')}</h2>
            <p>{t('desktopSites.emptyText')}</p>
          </div>
        {:else}
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <div class="bc-desktop-sites--scroll" data-od-scroll bind:this={scrollEl} onclick={emptyAreaClick}>
            <table class="bc-desktop-sites--table" aria-rowcount={rows.length} aria-label={t('sites.listLabel')}>
              <thead>
                <tr>
                  {#each SITE_COLUMNS as column (column.key)}
                    {@const sortedHere = deskSites.sort.key === column.key}
                    <th scope="col" class="bc-desktop-sites--head" class:bc-desktop-sites--numeric={column.numeric} aria-sort={sortedHere ? (deskSites.sort.descending ? 'descending' : 'ascending') : 'none'}>
                      <button type="button" onclick={() => setSitesSort(nextSort(deskSites.sort, column.key))}>
                        {t(column.label)}{#if sortedHere}<span class="bc-desktop-sites--arrow" aria-hidden="true">{deskSites.sort.descending ? '▴' : '▾'}</span>{/if}
                      </button>
                    </th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                {#each rows as site (site.uuid)}
                  <tr
                    class="bc-desktop-sites--row"
                    class:bc-desktop-sites--selected={sel.selected === site.uuid}
                    aria-selected={sel.selected === site.uuid}
                    data-site={site.uuid}
                    onclick={() => select({ type: 'row' }, site.uuid)}
                  >
                    <td class="bc-desktop-sites--site">{#if site.name}{#each highlightParts(site.name, typed ? query : '') as part}{#if part.match}<mark class="bc-desktop-sites--match">{part.text}</mark>{:else}{part.text}{/if}{/each}{:else}<span class="bc-desktop-sites--muted">{t('sites.noName')}</span>{/if}</td>
                    <td class="bc-desktop-sites--country">{#each highlightParts(site.country, typed ? query : '') as part}{#if part.match}<mark class="bc-desktop-sites--match">{part.text}</mark>{:else}{part.text}{/if}{/each}</td>
                    <td class="bc-desktop-sites--numeric bc-value">{site.dives}</td>
                    <td class="bc-desktop-sites--last bc-value">{site.lastDate ? formatDate(site.lastDate) : '—'}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
            {#if !rows.length}<p class="bc-desktop-sites--state" role="status">{t('sites.noMatch')}</p>{/if}
          </div>
        {/if}
      </div>

      <div class="bc-desktop-sites--handle" role="separator" aria-orientation="vertical" aria-label={t('desktopSites.resize')} aria-valuenow={deskSites.width} tabindex="0" onpointerdown={startResize} onkeydown={resizeKey}>
        <span class="bc-desktop-sites--grip"></span>
      </div>

      <div class="bc-desktop-sites--right">
        <!-- The map stays mounted under the other panes, so that its view is kept. -->
        <div class="bc-desktop-sites--pane" hidden={pane !== 'sites' || sel.mode === 'sheet'}>
          <DesktopSiteMap sites={sites.filter((s) => s.hasLocation)} selected={sel.selected} {matching} base={baseLayer} clusters={common ? baseClusters : []} {common} onview={(view) => mapView = view} onbaseselect={(id) => { select({ type: 'clear' }); baseSelectedId = id; }} onselect={(uuid) => { baseSelectedId = null; select({ type: 'pin' }, uuid); }} onclear={() => { baseSelectedId = null; select({ type: 'clear' }); }}>
            {#snippet overlay()}
              {#if canCommon}
                <div class="bc-desktop-sites--mode" role="group" aria-label={t('sharedSites.show')}>
                  <button type="button" aria-pressed={!common} onclick={() => setSitesMode('mine')}>{t('sharedSites.mine')}</button>
                  <button type="button" aria-pressed={common} onclick={() => setSitesMode('common')}>{t('sharedSites.commonMapButton')}</button>
                </div>
              {/if}
              {#if selectedSite}
                <div class="bc-desktop-sites--card">
                  <div class="bc-desktop-sites--card-text">
                    <h2 class="bc-desktop-sites--card-title">{selectedSite.name || t('sites.noName')}</h2>
                    <p class="bc-desktop-sites--card-line bc-value">{cardLine(selectedSite)}</p>
                  </div>
                  <button type="button" class="bc-desktop-sites--outlined" onclick={() => select({ type: 'edit' })}>{t('desktopSites.modify')}</button>
                  <button type="button" class="bc-desktop-sites--filled" onclick={() => showSiteDives(selectedSite?.name ?? '')}>{t('desktopSites.seeDives')}</button>
                </div>
              {:else if baseSelected}
                <div class="bc-desktop-sites--card">
                  <div class="bc-desktop-sites--card-text">
                    <h2 class="bc-desktop-sites--card-title">{baseSelected.name}</h2>
                    <p class="bc-desktop-sites--card-line">{baseCardLine(baseSelected, false)}</p>
                  </div>
                  <a class="bc-desktop-sites--filled" href="/sites/base/{encodeURIComponent(baseSelected.id)}">{t('sites.openSiteSheet')}</a>
                </div>
              {/if}
            {/snippet}
          </DesktopSiteMap>
        </div>
        {#if pane === 'sites' && sel.mode === 'sheet' && sel.selected !== null}
          <div class="bc-desktop-sites--pane">
            {#key sel.selected}
              <DesktopSiteSheet bind:this={sheet} uuid={sel.selected} {sites} ondeleted={() => select({ type: 'clear' })} />
            {/key}
          </div>
        {:else if pane === 'new'}
          <div class="bc-desktop-sites--pane">
            <DesktopSiteNew {sites} at={newFor?.at ?? null} oncreated={created} onuse={useExisting} oncancel={cancelNew} />
          </div>
        {:else if pane === 'without'}
          <div class="bc-desktop-sites--pane">
            <DesktopSitesWithout dives={without} {sites} onnew={(d) => newSite({ id: d.id, at: d.latUdeg !== undefined && d.lonUdeg !== undefined ? { latUdeg: d.latUdeg, lonUdeg: d.lonUdeg } : null })} />
          </div>
        {:else if pane === 'cleanup'}
          <div class="bc-desktop-sites--pane">
            <DesktopSitesCleanup {pairs} {unused} />
          </div>
        {/if}
      </div>
    </div>
  </div>

  {#if moreAt}
    <DesktopContextMenu x={moreAt.x} y={moreAt.y} heading="" entries={moreEntries} onchoose={moreChoose} onclose={() => (moreAt = null)} />
  {/if}
</Page>

<style>
  @layer od.components {
    .bc-desktop-sites--frame {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--bc-background);
    }
    .bc-desktop-sites--bar {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 64px;
      padding: 8px 8px 8px 12px;
    }
    .bc-desktop-sites--titles {
      flex: 1 1 auto;
      min-width: 140px;
      display: flex;
      align-items: baseline;
      gap: 16px;
    }
    .bc-desktop-sites--title {
      margin: 0;
      font-family: var(--bc-title-font);
      font-size: 22px;
      font-weight: 500;
      color: var(--bc-text);
    }
    .bc-desktop-sites--summary {
      margin: 0;
      font-size: 14px;
      color: var(--bc-text-2);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .bc-desktop-sites--title {
      flex: none;
    }
    .bc-desktop-sites--search {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: 0 1 300px;
      min-width: 200px;
      height: 44px;
      padding: 0 12px 0 16px;
      border: 2px solid transparent;
      border-radius: 22px;
      background: var(--bc-surface-container);
      color: var(--bc-text-2);
    }
    .bc-desktop-sites--search:focus-within {
      border-color: var(--bc-secondary);
      background: var(--bc-surface);
    }
    .bc-desktop-sites--search input {
      flex: 1;
      min-width: 0;
      border: 0;
      background: none;
      font: inherit;
      font-size: 15px;
      color: var(--bc-text);
      outline: none;
    }
    .bc-desktop-sites--hint {
      padding: 1px 6px;
      border: 1px solid var(--bc-separator);
      border-radius: 4px;
      font: inherit;
      font-size: 11px;
      color: var(--bc-text-2);
    }
    .bc-desktop-sites--icon-button {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      border: 0;
      border-radius: 50%;
      background: none;
      color: var(--bc-text);
      cursor: pointer;
    }
    .bc-desktop-sites--icon-button:hover {
      background: color-mix(in srgb, var(--bc-text) 8%, transparent);
    }
    .bc-desktop-sites--outlined,
    .bc-desktop-sites--filled {
      flex: none;
      width: auto;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      height: 44px;
      padding: 0 20px;
      border-radius: 22px;
      font: inherit;
      font-size: 15px;
      cursor: pointer;
    }
    .bc-desktop-sites--outlined {
      border: 1px solid var(--bc-outline);
      background: none;
      color: var(--bc-text);
    }
    .bc-desktop-sites--outlined:hover {
      background: color-mix(in srgb, var(--bc-text) 6%, transparent);
    }
    .bc-desktop-sites--filled {
      border: 0;
      background: var(--bc-primary-action);
      color: var(--bc-on-primary-action);
    }
    .bc-desktop-sites--body {
      position: relative;
      display: flex;
      flex: 1;
      min-height: 0;
    }
    /* The list pane is a column: the bars on top never scroll, the table area alone does. */
    .bc-desktop-sites--list {
      flex: none;
      display: flex;
      flex-direction: column;
      min-height: 0;
      min-width: 360px;
      max-width: calc(100% - 469px);
      padding: 0 8px 0 12px;
    }
    .bc-desktop-sites--todo {
      flex: none;
      display: flex;
      align-items: center;
      gap: 10px;
      height: 40px;
      margin-bottom: 8px;
      padding: 0 8px 0 12px;
      border-radius: 12px;
      background: var(--bc-surface-container-high);
      font-size: 14px;
      color: var(--bc-text-2);
    }
    .bc-desktop-sites--active {
      background: var(--bc-table-selected);
      color: var(--bc-on-table-selected);
    }
    .bc-desktop-sites--todo-icon {
      flex: none;
    }
    .bc-desktop-sites--todo-text {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .bc-desktop-sites--link {
      flex: none;
      width: auto;
      height: 32px;
      padding: 0 8px;
      border: 0;
      border-radius: 16px;
      background: none;
      font: inherit;
      font-size: 14px;
      font-weight: 600;
      color: var(--bc-on-table-selected);
      cursor: pointer;
    }
    .bc-desktop-sites--link:hover {
      background: color-mix(in srgb, var(--bc-secondary) 10%, transparent);
    }
    .bc-desktop-sites--search-note {
      flex: none;
      margin: 0 0 4px;
      padding: 0 4px;
      font-size: 13px;
      color: var(--bc-text-2);
    }
    .bc-desktop-sites--scroll {
      flex: 1;
      min-height: 0;
      overflow: auto;
    }
    .bc-desktop-sites--shared-row {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 12px 16px;
      border-bottom: 1px solid var(--bc-separator);
      color: var(--bc-text);
      text-decoration: none;
    }
    .bc-desktop-sites--shared-row:hover {
      background: color-mix(in srgb, var(--bc-text) 4%, transparent);
    }
    .bc-desktop-sites--table {
      width: 100%;
      table-layout: fixed;
      border-collapse: collapse;
      font-size: 15px;
      color: var(--bc-text);
    }
    .bc-desktop-sites--head {
      position: sticky;
      top: 0;
      z-index: 1;
      height: 40px;
      padding: 0;
      background: var(--bc-background);
      border-bottom: 1px solid var(--bc-separator);
      font-size: 13px;
      font-weight: 500;
      text-align: start;
      color: var(--bc-text-2);
    }
    .bc-desktop-sites--head button {
      width: 100%;
      height: 100%;
      padding: 0 12px;
      border: 0;
      background: none;
      font: inherit;
      color: inherit;
      text-align: inherit;
      white-space: nowrap;
      cursor: pointer;
    }
    .bc-desktop-sites--head button:hover {
      color: var(--bc-text);
    }
    .bc-desktop-sites--head:nth-child(2) {
      width: 27%;
    }
    .bc-desktop-sites--head:nth-child(3) {
      width: 96px;
    }
    .bc-desktop-sites--head:nth-child(4) {
      width: 124px;
    }
    .bc-desktop-sites--arrow {
      margin-inline-start: 4px;
    }
    .bc-desktop-sites--numeric {
      text-align: end;
      font-variant-numeric: tabular-nums;
    }
    .bc-desktop-sites--row {
      height: 44px;
      border-bottom: 1px solid var(--bc-row-divider);
      cursor: pointer;
    }
    .bc-desktop-sites--row td {
      padding: 0 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 240px;
    }
    .bc-desktop-sites--row:hover {
      background: color-mix(in srgb, var(--bc-text) 4%, transparent);
    }
    .bc-desktop-sites--selected,
    .bc-desktop-sites--selected:hover {
      background: var(--bc-table-selected);
      color: var(--bc-on-table-selected);
    }
    .bc-desktop-sites--selected .bc-desktop-sites--site {
      font-weight: 500;
    }
    .bc-desktop-sites--muted {
      color: var(--bc-text-2);
    }
    /* The matching text: #FBE3B2 behind it. */
    .bc-desktop-sites--match {
      border-radius: 2px;
      background: var(--bc-tertiary-container);
      color: inherit;
    }
    .bc-desktop-sites--state {
      padding: 32px 16px;
      text-align: center;
      color: var(--bc-text-2);
    }
    /* 9 dp handle, a 1 dp line, a 4 × 32 dp grip, as the Carnet's. */
    .bc-desktop-sites--handle {
      position: relative;
      flex: none;
      width: 9px;
      cursor: col-resize;
      outline: none;
    }
    .bc-desktop-sites--handle::before {
      content: '';
      position: absolute;
      inset: 0 4px;
      background: var(--bc-separator);
    }
    .bc-desktop-sites--grip {
      position: absolute;
      top: 50%;
      left: 2.5px;
      width: 4px;
      height: 32px;
      margin-top: -16px;
      border-radius: 2px;
      background: var(--bc-outline);
    }
    .bc-desktop-sites--handle:focus-visible .bc-desktop-sites--grip,
    .bc-desktop-sites--handle:hover .bc-desktop-sites--grip {
      background: var(--bc-text);
    }
    .bc-desktop-sites--right {
      position: relative;
      flex: 1;
      min-width: 0;
      padding: 0 16px 16px 8px;
    }
    .bc-desktop-sites--pane {
      position: absolute;
      inset: 0 16px 16px 8px;
    }
    .bc-desktop-sites--pane[hidden] {
      display: none;
    }
    .bc-desktop-sites--mode {
      position: absolute;
      z-index: 4;
      top: 16px;
      left: 16px;
      display: flex;
      border-radius: 20px;
      background: var(--bc-surface);
      box-shadow: 0 1px 3px rgb(0 0 0 / 0.2);
      overflow: hidden;
    }
    .bc-desktop-sites--mode button {
      width: auto;
      min-height: 40px;
      padding: 0 16px;
      border: 0;
      background: transparent;
      color: var(--bc-text);
      font: inherit;
      white-space: nowrap;
      cursor: pointer;
    }
    .bc-desktop-sites--mode button[aria-pressed='true'] {
      background: var(--bc-secondary-container);
      color: var(--bc-on-secondary-container);
      font-weight: 600;
    }
    /* The selected site's card at the bottom of the map: white, 16 dp corners. */
    .bc-desktop-sites--card {
      position: absolute;
      z-index: 4;
      left: 12px;
      right: 12px;
      bottom: 24px;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      border-radius: 16px;
      background: var(--bc-surface);
      box-shadow: 0 1px 3px rgb(0 0 0 / 0.2);
    }
    .bc-desktop-sites--card-text {
      flex: 1;
      min-width: 0;
    }
    .bc-desktop-sites--card-title {
      margin: 0;
      font-family: var(--bc-title-font);
      font-size: 20px;
      line-height: 26px;
      font-weight: 500;
    }
    .bc-desktop-sites--card-line {
      margin: 0;
      font-size: 14px;
      color: var(--bc-text-2);
    }


    /* Mouse: the Material 3 hover layer, 8 % of the content colour over the background. */
    @media (hover: hover) and (pointer: fine) {
      .bc-desktop-sites--filled {
        transition: box-shadow 120ms linear;
      }
      .bc-desktop-sites--filled:not(:disabled):hover {
        box-shadow: inset 0 0 0 100vmax color-mix(in srgb, currentColor 8%, transparent);
      }
      .bc-desktop-sites--selected:hover td {
        box-shadow: inset 0 0 0 100vmax color-mix(in srgb, currentColor 8%, transparent);
      }
    }
  }
</style>
