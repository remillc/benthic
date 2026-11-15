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
  import Icon from '../components/Icon.svelte';
  import DesktopContextMenu from '../components/DesktopContextMenu.svelte';
  import DesktopSiteMap from '../components/DesktopSiteMap.svelte';
  import DesktopSiteSheet from '../components/DesktopSiteSheet.svelte';
  import DesktopSiteNew from '../components/DesktopSiteNew.svelte';
  import DesktopSitesWithout from '../components/DesktopSitesWithout.svelte';
  import DesktopSitesCleanup from '../components/DesktopSitesCleanup.svelte';
  import { logbook, undoLastChange } from '../lib/logbook.svelte.js';
  import { possibleDuplicates } from '../lib/sites.svelte.js';
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
  import { formatDepth, formatShortDate, locale } from '../lib/format.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { setDiveSite } from '../lib/dive-site.js';
  import { t } from '../lib/i18n.js';

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
      sites = await OpenDivesCore.siteQuery({ kind: 'list' });
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

  const selectedSite = $derived(sites.find((s) => s.uuid === sel.selected) ?? null);

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
      !document.querySelector('.dialog.modal-in, .sheet-modal.modal-in, .popup.modal-in, .od-site-chooser') &&
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
        if (sel.selected !== null) {
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
          else select({ type: 'escape' });
        }
        return;
      } else if (!typing && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && pane === 'sites' && rows.length) {
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
    return [s.country, t('sites.diveCount', { n: s.dives }), s.maxDepthMm ? t('desktopSites.deepestAt', { depth: formatDepth(s.maxDepthMm, logbook.prefs) }) : ''].filter(Boolean).join(' · ');
  }
</script>

<Page class="od-desktop-sites" pageContent={false}>
  <div class="od-desktop-sites--frame" bind:this={pageEl}>
    <header class="od-desktop-sites--bar">
      <div class="od-desktop-sites--titles">
        <h1 class="od-desktop-sites--title">{t('sites.title')}</h1>
        {#if summary}<p class="od-desktop-sites--summary od-value" title={summary} role="status">{summary}</p>{/if}
      </div>
      <label class="od-desktop-sites--search">
        <Icon name="search" size={20} />
        <input type="search" bind:this={searchField} bind:value={query} placeholder={t('sites.search')} spellcheck="false" aria-keyshortcuts={desktopMac ? 'Meta+F' : 'Control+F'} autocomplete="off" />
        {#if !query}<kbd class="od-desktop-sites--hint">{mod}F</kbd>{/if}
      </label>
      <button type="button" class="od-desktop-sites--outlined" aria-keyshortcuts={desktopMac ? 'Meta+N' : 'Control+N'} onclick={() => newSite()}>
        <Icon name="plus" size={20} />{t('sites.newSite')}
      </button>
      <button type="button" class="od-desktop-sites--icon-button" aria-label={t('desktopSites.moreSites')} title={t('desktopSites.moreSites')} aria-haspopup="menu" onclick={openMore}>
        <Icon name="more" size={22} />
      </button>
    </header>

    <div class="od-desktop-sites--body" bind:this={bodyEl}>
      <div class="od-desktop-sites--list" style:width="{deskSites.width}px">
        <!-- The bars never scroll: the list below is the only part that does (task 175). -->
        {#if bars.without}
          <div class="od-desktop-sites--todo" class:od-desktop-sites--active={pane === 'without'} role="status">
            <svg class="od-desktop-sites--todo-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10zM10 9l4 4M14 9l-4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
            <span class="od-desktop-sites--todo-text">{t('desktopSites.withoutBar', { n: bars.without.count })}</span>
            <button type="button" class="od-desktop-sites--link" aria-pressed={pane === 'without'} onclick={showWithout}>{t('desktopSites.findThem')}</button>
          </div>
        {/if}
        {#if bars.cleanup}
          <div class="od-desktop-sites--todo" class:od-desktop-sites--active={pane === 'cleanup'} role="status">
            <Icon name="delete" size={18} />
            <span class="od-desktop-sites--todo-text">{[bars.cleanup.duplicates ? t('sites.duplicatesCount', { n: bars.cleanup.duplicates }) : '', bars.cleanup.unused ? t('sites.unusedCount', { n: bars.cleanup.unused }) : ''].filter(Boolean).join(' · ')}</span>
            <button type="button" class="od-desktop-sites--link" aria-pressed={pane === 'cleanup'} onclick={showCleanup}>{t('desktopSites.cleanUp')}</button>
          </div>
        {/if}
        {#if typed}<p class="od-desktop-sites--search-note">{t('desktopSites.searchNote')}</p>{/if}

        {#if !loaded}
          <p class="od-desktop-sites--state" role="status" aria-busy="true">{t('logbook.loading')}</p>
        {:else if !sites.length}
          <div class="od-desktop-sites--state">
            <h2 class="od-state-title">{t('desktopSites.emptyTitle')}</h2>
            <p>{t('desktopSites.emptyText')}</p>
          </div>
        {:else}
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <div class="od-desktop-sites--scroll" bind:this={scrollEl} onclick={emptyAreaClick}>
            <table class="od-desktop-sites--table" aria-rowcount={rows.length} aria-label={t('sites.listLabel')}>
              <thead>
                <tr>
                  {#each SITE_COLUMNS as column (column.key)}
                    {@const sortedHere = deskSites.sort.key === column.key}
                    <th scope="col" class="od-desktop-sites--head" class:od-desktop-sites--numeric={column.numeric} aria-sort={sortedHere ? (deskSites.sort.descending ? 'descending' : 'ascending') : 'none'}>
                      <button type="button" onclick={() => setSitesSort(nextSort(deskSites.sort, column.key))}>
                        {t(column.label)}{#if sortedHere}<span class="od-desktop-sites--arrow" aria-hidden="true">{deskSites.sort.descending ? '▴' : '▾'}</span>{/if}
                      </button>
                    </th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                {#each rows as site (site.uuid)}
                  <tr
                    class="od-desktop-sites--row"
                    class:od-desktop-sites--selected={sel.selected === site.uuid}
                    aria-selected={sel.selected === site.uuid}
                    data-site={site.uuid}
                    onclick={() => select({ type: 'row' }, site.uuid)}
                  >
                    <td class="od-desktop-sites--site">{#if site.name}{#each highlightParts(site.name, typed ? query : '') as part}{#if part.match}<mark class="od-desktop-sites--match">{part.text}</mark>{:else}{part.text}{/if}{/each}{:else}<span class="od-desktop-sites--muted">{t('sites.noName')}</span>{/if}</td>
                    <td class="od-desktop-sites--country">{#each highlightParts(site.country, typed ? query : '') as part}{#if part.match}<mark class="od-desktop-sites--match">{part.text}</mark>{:else}{part.text}{/if}{/each}</td>
                    <td class="od-desktop-sites--numeric od-value">{site.dives}</td>
                    <td class="od-desktop-sites--last od-value">{site.lastDate ? formatShortDate(site.lastDate) : '—'}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
            {#if !rows.length}<p class="od-desktop-sites--state" role="status">{t('sites.noMatch')}</p>{/if}
          </div>
        {/if}
      </div>

      <div class="od-desktop-sites--handle" role="separator" aria-orientation="vertical" aria-label={t('desktopSites.resize')} aria-valuenow={deskSites.width} tabindex="0" onpointerdown={startResize} onkeydown={resizeKey}>
        <span class="od-desktop-sites--grip"></span>
      </div>

      <div class="od-desktop-sites--right">
        <!-- The map stays mounted under the other panes, so that its view is kept. -->
        <div class="od-desktop-sites--pane" hidden={pane !== 'sites' || sel.mode === 'sheet'}>
          <DesktopSiteMap sites={sites.filter((s) => s.hasLocation)} selected={sel.selected} {matching} onselect={(uuid) => select({ type: 'pin' }, uuid)} onclear={() => select({ type: 'clear' })}>
            {#snippet overlay()}
              {#if selectedSite}
                <div class="od-desktop-sites--card">
                  <div class="od-desktop-sites--card-text">
                    <h2 class="od-desktop-sites--card-title">{selectedSite.name || t('sites.noName')}</h2>
                    <p class="od-desktop-sites--card-line od-value">{cardLine(selectedSite)}</p>
                  </div>
                  <button type="button" class="od-desktop-sites--outlined" onclick={() => select({ type: 'edit' })}>{t('desktopSites.modify')}</button>
                  <button type="button" class="od-desktop-sites--filled" onclick={() => showSiteDives(selectedSite?.name ?? '')}>{t('desktopSites.seeDives')}</button>
                </div>
              {/if}
            {/snippet}
          </DesktopSiteMap>
        </div>
        {#if pane === 'sites' && sel.mode === 'sheet' && sel.selected !== null}
          <div class="od-desktop-sites--pane">
            {#key sel.selected}
              <DesktopSiteSheet bind:this={sheet} uuid={sel.selected} {sites} ondeleted={() => select({ type: 'clear' })} />
            {/key}
          </div>
        {:else if pane === 'new'}
          <div class="od-desktop-sites--pane">
            <DesktopSiteNew {sites} at={newFor?.at ?? null} oncreated={created} onuse={useExisting} oncancel={cancelNew} />
          </div>
        {:else if pane === 'without'}
          <div class="od-desktop-sites--pane">
            <DesktopSitesWithout dives={without} {sites} onnew={(d) => newSite({ id: d.id, at: d.latUdeg !== undefined && d.lonUdeg !== undefined ? { latUdeg: d.latUdeg, lonUdeg: d.lonUdeg } : null })} />
          </div>
        {:else if pane === 'cleanup'}
          <div class="od-desktop-sites--pane">
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
    .od-desktop-sites--frame {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--od-background);
    }
    .od-desktop-sites--bar {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 64px;
      padding: 8px 8px 8px 12px;
    }
    .od-desktop-sites--titles {
      flex: 1 1 auto;
      min-width: 140px;
      display: flex;
      align-items: baseline;
      gap: 16px;
    }
    .od-desktop-sites--title {
      margin: 0;
      font-family: var(--od-title-font);
      font-size: 22px;
      font-weight: 500;
      color: var(--od-text);
    }
    .od-desktop-sites--summary {
      margin: 0;
      font-size: 14px;
      color: var(--od-text-2);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .od-desktop-sites--title {
      flex: none;
    }
    .od-desktop-sites--search {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: 0 1 300px;
      min-width: 200px;
      height: 44px;
      padding: 0 12px 0 16px;
      border: 2px solid transparent;
      border-radius: 22px;
      background: var(--od-surface-container);
      color: var(--od-text-2);
    }
    .od-desktop-sites--search:focus-within {
      border-color: var(--od-secondary);
      background: var(--od-surface);
    }
    .od-desktop-sites--search input {
      flex: 1;
      min-width: 0;
      border: 0;
      background: none;
      font: inherit;
      font-size: 15px;
      color: var(--od-text);
      outline: none;
    }
    .od-desktop-sites--hint {
      padding: 1px 6px;
      border: 1px solid var(--od-separator);
      border-radius: 4px;
      font: inherit;
      font-size: 11px;
      color: var(--od-text-2);
    }
    .od-desktop-sites--icon-button {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      border: 0;
      border-radius: 50%;
      background: none;
      color: var(--od-text);
      cursor: pointer;
    }
    .od-desktop-sites--icon-button:hover {
      background: color-mix(in srgb, var(--od-text) 8%, transparent);
    }
    .od-desktop-sites--outlined,
    .od-desktop-sites--filled {
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
    .od-desktop-sites--outlined {
      border: 1px solid var(--od-outline);
      background: none;
      color: var(--od-text);
    }
    .od-desktop-sites--outlined:hover {
      background: color-mix(in srgb, var(--od-text) 6%, transparent);
    }
    .od-desktop-sites--filled {
      border: 0;
      background: var(--od-primary-action);
      color: var(--od-on-primary-action);
    }
    .od-desktop-sites--body {
      position: relative;
      display: flex;
      flex: 1;
      min-height: 0;
    }
    /* The list pane is a column: the bars on top never scroll, the table area alone does. */
    .od-desktop-sites--list {
      flex: none;
      display: flex;
      flex-direction: column;
      min-height: 0;
      min-width: 360px;
      max-width: calc(100% - 469px);
      padding: 0 8px 0 12px;
    }
    .od-desktop-sites--todo {
      flex: none;
      display: flex;
      align-items: center;
      gap: 10px;
      height: 40px;
      margin-bottom: 8px;
      padding: 0 8px 0 12px;
      border-radius: 12px;
      background: var(--od-surface-container-high);
      font-size: 14px;
      color: var(--od-text-2);
    }
    .od-desktop-sites--active {
      background: var(--od-table-selected);
      color: var(--od-on-table-selected);
    }
    .od-desktop-sites--todo-icon {
      flex: none;
    }
    .od-desktop-sites--todo-text {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .od-desktop-sites--link {
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
      color: var(--od-on-table-selected);
      cursor: pointer;
    }
    .od-desktop-sites--link:hover {
      background: color-mix(in srgb, var(--od-secondary) 10%, transparent);
    }
    .od-desktop-sites--search-note {
      flex: none;
      margin: 0 0 4px;
      padding: 0 4px;
      font-size: 13px;
      color: var(--od-text-2);
    }
    .od-desktop-sites--scroll {
      flex: 1;
      min-height: 0;
      overflow: auto;
    }
    .od-desktop-sites--table {
      width: 100%;
      table-layout: fixed;
      border-collapse: collapse;
      font-size: 15px;
      color: var(--od-text);
    }
    .od-desktop-sites--head {
      position: sticky;
      top: 0;
      z-index: 1;
      height: 40px;
      padding: 0;
      background: var(--od-background);
      border-bottom: 1px solid var(--od-separator);
      font-size: 13px;
      font-weight: 500;
      text-align: start;
      color: var(--od-text-2);
    }
    .od-desktop-sites--head button {
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
    .od-desktop-sites--head button:hover {
      color: var(--od-text);
    }
    .od-desktop-sites--head:nth-child(2) {
      width: 27%;
    }
    .od-desktop-sites--head:nth-child(3) {
      width: 96px;
    }
    .od-desktop-sites--head:nth-child(4) {
      width: 124px;
    }
    .od-desktop-sites--arrow {
      margin-inline-start: 4px;
    }
    .od-desktop-sites--numeric {
      text-align: end;
      font-variant-numeric: tabular-nums;
    }
    .od-desktop-sites--row {
      height: 44px;
      border-bottom: 1px solid var(--od-row-divider);
      cursor: default;
    }
    .od-desktop-sites--row td {
      padding: 0 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 240px;
    }
    .od-desktop-sites--row:hover {
      background: color-mix(in srgb, var(--od-text) 4%, transparent);
    }
    .od-desktop-sites--selected,
    .od-desktop-sites--selected:hover {
      background: var(--od-table-selected);
      color: var(--od-on-table-selected);
    }
    .od-desktop-sites--selected .od-desktop-sites--site {
      font-weight: 500;
    }
    .od-desktop-sites--muted {
      color: var(--od-text-2);
    }
    /* The matching text: #FBE3B2 behind it. */
    .od-desktop-sites--match {
      border-radius: 2px;
      background: var(--od-tertiary-container);
      color: inherit;
    }
    .od-desktop-sites--state {
      padding: 32px 16px;
      text-align: center;
      color: var(--od-text-2);
    }
    /* 9 dp handle, a 1 dp line, a 4 × 32 dp grip, as the Carnet's. */
    .od-desktop-sites--handle {
      position: relative;
      flex: none;
      width: 9px;
      cursor: col-resize;
      outline: none;
    }
    .od-desktop-sites--handle::before {
      content: '';
      position: absolute;
      inset: 0 4px;
      background: var(--od-separator);
    }
    .od-desktop-sites--grip {
      position: absolute;
      top: 50%;
      left: 2.5px;
      width: 4px;
      height: 32px;
      margin-top: -16px;
      border-radius: 2px;
      background: var(--od-outline);
    }
    .od-desktop-sites--handle:focus-visible .od-desktop-sites--grip,
    .od-desktop-sites--handle:hover .od-desktop-sites--grip {
      background: var(--od-text);
    }
    .od-desktop-sites--right {
      position: relative;
      flex: 1;
      min-width: 0;
      padding: 0 16px 16px 8px;
    }
    .od-desktop-sites--pane {
      position: absolute;
      inset: 0 16px 16px 8px;
    }
    .od-desktop-sites--pane[hidden] {
      display: none;
    }
    /* The selected site's card at the bottom of the map: white, 16 dp corners. */
    .od-desktop-sites--card {
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
      background: var(--od-surface);
      box-shadow: 0 1px 3px rgb(0 0 0 / 0.2);
    }
    .od-desktop-sites--card-text {
      flex: 1;
      min-width: 0;
    }
    .od-desktop-sites--card-title {
      margin: 0;
      font-family: var(--od-title-font);
      font-size: 20px;
      line-height: 26px;
      font-weight: 500;
    }
    .od-desktop-sites--card-line {
      margin: 0;
      font-size: 14px;
      color: var(--od-text-2);
    }
  }
</style>
