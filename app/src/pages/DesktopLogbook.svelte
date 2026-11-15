<script>
  // @ts-check
  // The desktop logbook (task 2026-11-15-169, mock-ups bureau-carnet-profil-droite,
  // bureau-carnet-macos, bureau-carnet-menu-contextuel): from 1200 dp wide, the logbook is a
  // table on the left, the selected dive's detail on the right (the detail route, as on a
  // tablet), with a handle between them. Columns sortable and chosen with the columns
  // button; trips as expandable rows; selection with Shift and Ctrl/⌘; right-click menu;
  // keyboard shortcuts; a file dropped on the window is imported. Below 1200 dp the
  // tablet's Logbook.svelte shows instead (App.svelte).
  import { tick, untrack } from 'svelte';
  import { Page, f7 } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import FabMenu from '../components/FabMenu.svelte';
  import ExportSheet from '../components/ExportSheet.svelte';
  import ChoiceDialog from '../components/ChoiceDialog.svelte';
  import DesktopContextMenu from '../components/DesktopContextMenu.svelte';
  import { showSnackbar } from '../lib/snackbar.js';
  import { offerUndo } from '../lib/undo.js';
  import { confirmAction } from '../lib/dialogs.js';
  import { exportDives } from '../lib/share.js';
  import { importErrorKey } from '../lib/deep-link.js';
  import { logbook, loadLogbook, importFile, undoLastChange, deleteDives, tripChange } from '../lib/logbook.svelte.js';
  import { filter } from '../lib/filter.svelte.js';
  import { navigation, openSettings } from '../lib/navigation.svelte.js';
  import { desktopMac, layout } from '../lib/layout.svelte.js';
  import { logbookSummary } from '../lib/logbook-summary.js';
  import { undoNameKey } from '../lib/undo-name.js';
  import { desk, setSort, setColumns, setTableWidth, loadExtras, loadDesktopChoices } from '../lib/desktop-logbook.svelte.js';
  import {
    COLUMNS,
    shownColumns,
    toggleColumn,
    nextSort,
    sortDives,
    tableRows,
    rowDiveIds,
    clickSelect,
    stepSelect,
    keepSelection,
    contextMenuEntries,
    clampTableWidth,
  } from '../lib/desktop-table.js';
  import { formatDepth, formatLongDate, formatTemperature, formatSac, formatMinutes, depthValue, formatShortDate, formatTimeOfDay } from '../lib/format.js';
  import { t } from '../lib/i18n.js';
  import { OpenDivesCore } from 'opendives-core';

  let { f7router } = $props();

  loadDesktopChoices();

  /** The actions the right-click menu can offer today (the others wait: see the task's notes). */
  const AVAILABLE = new Set(['addToTrip', 'edit', 'export', 'delete']);
  const mod = desktopMac ? '⌘' : 'Ctrl+';

  // --- Search: the core's fulltext index, as on the phone (Logbook.svelte). ---------------
  let query = $state('');
  let searchIds = $state(/** @type {Set<number>|null} */ (null));
  $effect(() => {
    const q = query.trim();
    logbook.dives;
    if (!q) {
      searchIds = null;
      return;
    }
    const timer = setTimeout(async () => {
      try {
        /** @type {number[]} */
        const ids = await OpenDivesCore.filterQuery({ kind: 'search', fulltext: q });
        searchIds = new Set(ids);
      } catch (e) {
        console.error('Search the logbook', e);
      }
    }, 150);
    return () => clearTimeout(timer);
  });

  // --- The rows. -------------------------------------------------------------------------
  const listed = $derived(
    logbook.dives.filter((d) => (!filter.ids || filter.ids.has(d.id)) && (!searchIds || searchIds.has(d.id))),
  );
  const columns = $derived(shownColumns(desk.columns));
  const sorted = $derived(sortDives(listed, desk.extras, desk.sort));
  const rows = $derived(tableRows(sorted, desk.sort, desk.collapsed));
  const order = $derived(rowDiveIds(rows));
  const selected = $derived(new Set(desk.selection.ids));
  const summary = $derived(logbookSummary(logbook.dives));

  // The columns' extra values follow the logbook.
  $effect(() => {
    if (logbook.loading || logbook.error) return;
    logbook.dives;
    untrack(() => loadExtras());
  });

  // The selection keeps the dives still listed; the detail pane follows it.
  $effect(() => {
    const kept = keepSelection(
      untrack(() => desk.selection),
      order,
    );
    untrack(() => {
      if (kept.ids.length !== desk.selection.ids.length) desk.selection = kept;
    });
  });

  $effect(() => {
    if (!layout.desktop || navigation.section !== 'logbook' || logbook.loading) return;
    const ids = desk.selection.ids;
    // Nothing selected yet: the first dive of the table, as the tablet does.
    if (!ids.length) {
      if (order.length) untrack(() => (desk.selection = { ids: [order[0]], anchor: order[0], focus: order[0] }));
      else showDetail('/pane/empty');
      return;
    }
    showDetail(ids.length === 1 ? `/dives/${ids[0]}` : '/pane/selection');
  });

  /** @param {string} url */
  function showDetail(url) {
    // What the pane really shows: another screen opened there (Filtrer) is replaced too.
    const current = untrack(() => f7router.currentRoute?.url);
    if (url === current && url !== '/pane/selection') return;
    untrack(() => f7router.navigate(url, { reloadDetail: true, animate: false }));
  }

  // --- Cells. ----------------------------------------------------------------------------
  /**
   * @param {string} key
   * @param {import('opendives-core').Dive} dive
   * @returns {string}
   */
  function cell(key, dive) {
    const x = desk.extras.get(dive.id);
    const p = logbook.prefs;
    switch (key) {
      case 'number':
        return dive.number ? String(dive.number) : '';
      case 'date':
        return t('desktop.dateTime', { date: formatShortDate(dive.date), time: formatTimeOfDay(dive.date) });
      case 'site':
        return dive.site || t('desktop.noSite');
      case 'maxDepth':
        return dive.maxDepthMm ? formatDepth(dive.maxDepthMm, p) : '';
      case 'duration':
        return dive.durationSeconds ? formatMinutes(dive.durationSeconds) : '';
      case 'waterTemp':
        return x?.waterTempMk ? formatTemperature(x.waterTempMk, p) : '';
      case 'airTemp':
        return x?.airTempMk ? formatTemperature(x.airTempMk, p) : '';
      case 'meanDepth':
        return x?.meanDepthMm ? formatDepth(x.meanDepthMm, p) : '';
      case 'sac':
        return x?.sacMlMin ? formatSac(x.sacMlMin, p) : '';
      case 'rating':
        return x?.rating ? '★'.repeat(x.rating) : '';
      case 'buddies':
        return (x?.buddies ?? []).join(', ');
      case 'guides':
        return (x?.guides ?? []).join(', ');
      case 'gases':
        return (x?.gases ?? []).join(', ');
      case 'tags':
        return (x?.tags ?? []).join(', ');
      default:
        return String(/** @type {any} */ (x)?.[key] ?? '');
    }
  }

  /** « Voyage du 2 février 2013 · 4 plongées, de 21 à 29 m » */
  function tripText(/** @type {{location: string, dives: import('opendives-core').Dive[]}} */ row) {
    const dives = row.dives;
    const title = row.location || t('trip.startingOn', { date: formatLongDate(dives.reduce((a, d) => (d.date < a ? d.date : a), dives[0].date)) });
    const depths = dives.map((d) => d.maxDepthMm).filter(Boolean);
    const diveCount = t('trip.dives', { n: dives.length });
    const p = logbook.prefs;
    const range = !depths.length
      ? diveCount
      : Math.min(...depths) === Math.max(...depths) || dives.length === 1
        ? t('trip.summarySingle', { dives: diveCount, depth: formatDepth(Math.max(...depths), p) })
        : t('trip.summaryRange', { dives: diveCount, min: depthValue(Math.min(...depths), p), max: formatDepth(Math.max(...depths), p) });
    return { title, range };
  }

  // --- Selection with the mouse and the keyboard. -----------------------------------------
  /** @param {MouseEvent} e @param {number} id */
  function rowClick(e, id) {
    desk.selection = clickSelect(desk.selection, id, { shift: e.shiftKey, toggle: desktopMac ? e.metaKey : e.ctrlKey }, order);
  }

  /** @type {{x: number, y: number}|null} */
  let menuAt = $state(null);

  /** @param {MouseEvent} e @param {number} id */
  function rowMenu(e, id) {
    e.preventDefault();
    if (!selected.has(id)) desk.selection = clickSelect(desk.selection, id, {}, order);
    menuAt = { x: e.clientX, y: e.clientY };
  }

  const menuEntries = $derived(contextMenuEntries(desk.selection.ids.length, { mac: desktopMac, available: AVAILABLE }));
  const menuHeading = $derived.by(() => {
    const ids = desk.selection.ids;
    if (ids.length !== 1) return t('desktop.selected', { n: ids.length });
    const dive = logbook.dives.find((d) => d.id === ids[0]);
    return dive ? t('desktop.diveTitle', { number: dive.number, site: dive.site || t('desktop.noSite') }) : '';
  });

  /** @type {HTMLElement|undefined} */
  let tableEl = $state();

  /** Keeps the focused row on screen after ↑ ↓. */
  async function revealFocus() {
    await tick();
    tableEl?.querySelector(`[data-dive="${desk.selection.focus}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  // --- Actions. ------------------------------------------------------------------------
  /** @param {unknown} e */
  function changeFailed(e) {
    console.error('Desktop logbook change', e);
    showSnackbar(t('desktop.changeFailed'));
  }

  function editSelected() {
    const id = desk.selection.ids[0];
    if (desk.selection.ids.length === 1 && id !== undefined) f7router.navigate(`/dives/${id}/edit`);
  }

  function deleteSelected() {
    const ids = [...desk.selection.ids];
    const n = ids.length;
    if (!n) return;
    confirmAction({
      title: t('logbook.deleteTitle', { n }),
      text: t(logbook.mode === 'git' ? 'logbook.deleteTextGit' : 'logbook.deleteText', { n }),
      action: t('logbook.deleteAction'),
      onConfirm: async () => {
        try {
          await deleteDives(ids);
          offerUndo(t('logbook.deleted', { n }));
        } catch (e) {
          changeFailed(e);
        }
      },
    });
  }

  let exporting = $state(false);
  /** @param {string} format @param {boolean} anonymize */
  async function exportSelected(format, anonymize) {
    try {
      await exportDives(desk.selection.ids, /** @type {any} */ (format), anonymize, logbook.prefs);
    } catch (e) {
      if (/cancel/i.test(String(/** @type {any} */ (e)?.message ?? ''))) return;
      console.error('Export dives', e);
      showSnackbar(t('export.failed'));
    }
  }

  // « Ajouter à un voyage… »: the logbook's trips, newest first, or a new trip.
  let choosingTrip = $state(false);
  const tripOptions = $derived.by(() => {
    /** @type {Map<number, {location: string, dives: import('opendives-core').Dive[]}>} */
    const trips = new Map();
    for (const d of logbook.dives) {
      if (!d.trip) continue;
      const trip = trips.get(d.trip.id);
      if (trip) trip.dives.push(d);
      else trips.set(d.trip.id, { location: d.trip.location, dives: [d] });
    }
    const list = [...trips.entries()]
      .map(([id, trip]) => ({ id, start: trip.dives.reduce((a, d) => (d.date < a ? d.date : a), trip.dives[0].date), ...tripText(trip) }))
      .sort((a, b) => b.start.localeCompare(a.start));
    return [{ value: 'new', label: t('desktop.newTrip') }, ...list.map((x) => ({ value: String(x.id), label: x.title, example: x.range }))];
  });

  /** @param {string} value */
  async function addToTrip(value) {
    choosingTrip = false;
    const ids = [...desk.selection.ids];
    try {
      if (value === 'new') {
        await tripChange({ action: 'create', diveIds: ids });
        offerUndo(t('logbook.tripCreated'));
      } else {
        await tripChange({ action: 'add', tripId: Number(value), diveIds: ids });
        offerUndo(t('logbook.addedToTrip', { n: ids.length }));
      }
    } catch (e) {
      changeFailed(e);
    }
  }

  /** @param {string} key */
  function act(key) {
    if (key === 'edit') editSelected();
    else if (key === 'delete') deleteSelected();
    else if (key === 'export') exporting = true;
    else if (key === 'addToTrip') choosingTrip = true;
  }

  // --- The ⋮ of the list header: Annuler and Rétablir naming the change, then Filtrer (task 192). --
  /** @type {{x: number, y: number}|null} */
  let moreAt = $state(null);
  /** @param {MouseEvent} e */
  function openMore(e) {
    const r = /** @type {HTMLElement} */ (e.currentTarget).getBoundingClientRect();
    moreAt = { x: r.right - 280, y: r.bottom + 4 };
  }
  /** « Annuler : Ajouter au voyage », or plain « Annuler » when the step has no known name. */
  function undoEntryText(/** @type {'undo'|'redo'} */ which) {
    const key = undoNameKey(which === 'undo' ? logbook.undoText : logbook.redoText);
    return key ? t(`desktop.${which}Named`, { action: t(key) }) : t(`desktop.${which}Plain`);
  }
  const moreEntries = $derived(
    /** @type {import('../lib/desktop-table.js').MenuEntry[]} */ ([
      { key: 'undo', label: '', text: undoEntryText('undo'), icon: 'undo', shortcut: desktopMac ? '⌘Z' : 'Ctrl+Z', disabled: !logbook.undoText },
      { key: 'redo', label: '', text: undoEntryText('redo'), icon: 'redo', shortcut: desktopMac ? '⇧⌘Z' : 'Ctrl+Maj+Z', disabled: !logbook.redoText },
      { key: 'separator' },
      { key: 'filter', label: filter.ids ? 'logbook.menuFilterOn' : 'logbook.menuFilter', icon: 'filter' },
    ]),
  );
  /** @param {string} key */
  function moreChoose(key) {
    if (key === 'undo' || key === 'redo') command(key);
    else if (key === 'filter') f7router.navigate('/filter');
  }

  // --- The columns button. ----------------------------------------------------------------
  let columnsOpen = $state(false);

  // --- Adding dives: the floating button's choices, as on the tablet. ------------------------
  const addChoices = [
    { key: 'download', icon: /** @type {const} */ ('download'), text: t('logbook.addDownload') },
    { key: 'import', icon: /** @type {const} */ ('file'), text: t('logbook.addImport'), sub: t('logbook.addImportFormats') },
    { key: 'manual', icon: /** @type {const} */ ('edit'), text: t('logbook.addManual') },
  ];
  /** @type {HTMLInputElement|undefined} */
  let fileInput = $state();

  /** @param {string} key */
  function choose(key) {
    if (key === 'import') fileInput?.click();
    else if (key === 'manual') f7router.navigate('/dives/new');
    else f7router.navigate('/add/download');
  }

  /** @param {File} file */
  async function importOne(file) {
    try {
      const n = await importFile(file);
      offerUndo(t('logbook.imported', { n }));
    } catch (e) {
      const code = String(/** @type {any} */ (e)?.message ?? '');
      console.error('Import a file', code);
      f7.dialog.create({ title: t('logbook.importTitle'), text: t(importErrorKey(code)), buttons: [{ text: t('dialog.ok') }] }).open();
    }
  }

  async function fileChosen() {
    const file = fileInput?.files?.[0];
    if (!file || !fileInput) return;
    fileInput.value = '';
    await importOne(file);
  }

  // A file dropped on the window is imported, as « Importer un fichier ».
  let dropping = $state(false);
  $effect(() => {
    if (!layout.desktop) return;
    /** @param {DragEvent} e */
    const over = (e) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      dropping = true;
    };
    const leave = (/** @type {DragEvent} */ e) => {
      if (!e.relatedTarget) dropping = false;
    };
    /** @param {DragEvent} e */
    const drop = async (e) => {
      if (!e.dataTransfer?.files.length) return;
      e.preventDefault();
      dropping = false;
      for (const file of e.dataTransfer.files) await importOne(file);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  });

  // --- Keyboard and the Mac's menu bar. ------------------------------------------------------
  /** @type {HTMLInputElement|undefined} */
  let searchField = $state();

  /** Whether the logbook's page is the one in use (no dialog, no page over it). */
  function inUse() {
    return (
      layout.desktop &&
      navigation.section === 'logbook' &&
      !menuAt &&
      !moreAt &&
      !exporting &&
      !choosingTrip &&
      !document.querySelector('.dialog.modal-in, .sheet-modal.modal-in, .popup.modal-in') &&
      !!tableEl?.closest('.page-current, .page-master')
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
        f7router.navigate('/dives/new');
        return true;
      case 'import':
        fileInput?.click();
        return true;
      case 'download':
        choose('download');
        return true;
      case 'edit':
        editSelected();
        return true;
      case 'delete':
        deleteSelected();
        return true;
      case 'export':
        if (desk.selection.ids.length) exporting = true;
        return true;
      case 'addToTrip':
        if (desk.selection.ids.length) choosingTrip = true;
        return true;
      case 'undo':
      case 'redo':
        undoLastChange(command === 'redo').catch(changeFailed);
        return true;
      case 'selectAll':
        desk.selection = { ids: [...order], anchor: order[0] ?? null, focus: order.at(-1) ?? null };
        return true;
      case 'settings':
        openSettings();
        return true;
      case 'columns':
        columnsOpen = true;
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
      else if (modKey && key === ',') cmd = 'settings';
      else if (!typing && modKey && key === 'n') cmd = 'new';
      else if (!typing && modKey && key === 'e' && e.shiftKey) cmd = 'export';
      else if (!typing && modKey && key === 'e') cmd = 'edit';
      else if (!typing && modKey && key === 'z') cmd = e.shiftKey ? 'redo' : 'undo';
      else if (!typing && modKey && key === 'y' && !desktopMac) cmd = 'redo';
      else if (!typing && modKey && key === 'a') cmd = 'selectAll';
      else if (!typing && (e.key === 'Delete' || (desktopMac && e.key === 'Backspace' && e.metaKey))) cmd = 'delete';
      else if (!typing && e.key === 'Enter' && desk.selection.ids.length === 1) cmd = 'edit';
      else if (!typing && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        desk.selection = stepSelect(desk.selection, e.key === 'ArrowDown' ? 1 : -1, order, e.shiftKey);
        revealFocus();
        return;
      } else if (typing && e.key === 'Escape' && e.target === searchField) {
        query = '';
        searchField?.blur();
        return;
      }
      if (cmd && command(cmd)) e.preventDefault();
    };
    window.addEventListener('keydown', keydown);
    // The detail pane's ⋮ (DiveDetail.svelte) acts through the same commands, on the dive it shows.
    /** @param {Event} e */
    const fromDetail = (e) => command(/** @type {CustomEvent<string>} */ (e).detail);
    window.addEventListener('od-desktop-command', fromDetail);
    const off = /** @type {any} */ (window).odDesktop?.onMenu?.((/** @type {string} */ c) => inUse() && command(c));
    return () => {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('od-desktop-command', fromDetail);
      off?.();
    };
  });

  // --- The handle between the table and the detail. ---------------------------------------
  /** @type {HTMLElement|undefined} */
  let pageEl = $state();
  /** @param {PointerEvent} e */
  function startResize(e) {
    const handle = /** @type {HTMLElement} */ (e.currentTarget);
    handle.setPointerCapture(e.pointerId);
    const view = handle.closest('.view');
    const left = view?.getBoundingClientRect().left ?? 0;
    const available = (view?.getBoundingClientRect().width ?? innerWidth);
    /** @param {PointerEvent} m */
    const move = (m) => (desk.tableWidth = clampTableWidth(m.clientX - left, available));
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      setTableWidth(desk.tableWidth);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  }
  /** @param {KeyboardEvent} e */
  function resizeKey(e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const view = /** @type {HTMLElement} */ (e.currentTarget).closest('.view');
    const available = view?.getBoundingClientRect().width ?? innerWidth;
    setTableWidth(clampTableWidth(desk.tableWidth + (e.key === 'ArrowRight' ? 16 : -16), available));
  }

  // The view gives the table its width (Framework7's master-detail).
  $effect(() => {
    const view = /** @type {HTMLElement|null} */ (pageEl?.closest('.view') ?? null);
    if (!view) return;
    const available = view.getBoundingClientRect().width;
    view.style.setProperty('--f7-page-master-width', `${clampTableWidth(desk.tableWidth, available)}px`);
    return () => view.style.removeProperty('--f7-page-master-width');
  });
</script>

<Page class="od-desktop-logbook" pageContent={false}>
  <div class="od-desktop-logbook--frame" bind:this={pageEl}>
    <header class="od-desktop-logbook--bar">
      <!-- The list column's own header (task 2026-11-15-192): the title, the count on one line under it. -->
      <div class="od-desktop-logbook--titles">
        <h1 class="od-desktop-logbook--title">{t('logbook.title')}</h1>
        {#if summary}<p class="od-desktop-logbook--summary od-value" title={summary}>{summary}</p>{/if}
      </div>
      <label class="od-desktop-logbook--search">
        <Icon name="search" size={20} />
        <input type="search" bind:this={searchField} bind:value={query} placeholder={t('logbook.search')} aria-keyshortcuts={desktopMac ? 'Meta+F' : 'Control+F'} />
        {#if !query}<kbd class="od-desktop-logbook--hint">{mod}F</kbd>{/if}
      </label>
      <div class="od-desktop-logbook--columns-anchor">
        <button type="button" class="od-desktop-logbook--icon-button" aria-label={t('desktop.columnsShown')} title={t('desktop.columnsShown')} aria-expanded={columnsOpen} onclick={() => (columnsOpen = !columnsOpen)}>
          <Icon name="columns" size={22} />
        </button>
        {#if columnsOpen}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="od-desktop-logbook--columns-scrim" onpointerdown={() => (columnsOpen = false)}></div>
          <div class="od-desktop-logbook--columns" role="menu" aria-label={t('desktop.columns')}>
            {#each COLUMNS as column (column.key)}
              {@const fixed = column.key === 'number' || column.key === 'date'}
              <label class="od-desktop-logbook--column-choice" class:od-desktop-logbook--fixed={fixed}>
                <input type="checkbox" role="menuitemcheckbox" checked={columns.some((c) => c.key === column.key)} disabled={fixed} onchange={() => setColumns(toggleColumn(columns.map((c) => c.key), column.key))} />
                {t(column.label)}
              </label>
            {/each}
          </div>
        {/if}
      </div>
      <button type="button" class="od-desktop-logbook--icon-button" aria-label={t('desktop.moreLogbook')} title={t('desktop.moreLogbook')} aria-haspopup="menu" onclick={openMore}>
        <Icon name="more" size={22} />
      </button>
    </header>

    {#if logbook.loading}
      <p class="od-desktop-logbook--state" role="status" aria-busy="true">{t('logbook.loading')}</p>
    {:else if logbook.error}
      <div class="od-desktop-logbook--state" role="alert">
        <h2 class="od-state-title">{t('logbook.errorTitle')}</h2>
        <p>{t('logbook.errorNothingChanged')}</p>
        <button type="button" class="od-desktop-logbook--filled" onclick={() => loadLogbook({ force: true })}>{t('logbook.retry')}</button>
      </div>
    {:else if !logbook.dives.length}
      <div class="od-desktop-logbook--state">
        <h2 class="od-state-title">{t('logbook.emptyTitle')}</h2>
        <p>{t('logbook.emptyText')}</p>
        <p class="od-desktop-logbook--drop-note">{t('desktop.dropNote')}</p>
      </div>
    {:else}
      <div class="od-desktop-logbook--scroll" bind:this={tableEl}>
        <table class="od-desktop-logbook--table" aria-multiselectable="true" aria-rowcount={order.length}>
          <thead>
            <tr>
              {#each columns as column (column.key)}
                {@const sortedHere = desk.sort.key === column.key}
                <th
                  scope="col"
                  class="od-desktop-logbook--head"
                  class:od-desktop-logbook--numeric={column.numeric}
                  aria-sort={sortedHere ? (desk.sort.descending ? 'descending' : 'ascending') : 'none'}
                >
                  <button type="button" onclick={() => setSort(nextSort(desk.sort, column.key))}>
                    {t(column.label)}{#if sortedHere}<span class="od-desktop-logbook--arrow" aria-hidden="true">{desk.sort.descending ? '▾' : '▴'}</span>{/if}
                  </button>
                </th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each rows as row (row.type === 'trip' ? `t${row.id}` : `d${row.dive.id}`)}
              {#if row.type === 'trip'}
                {@const text = tripText(row)}
                <tr class="od-desktop-logbook--trip">
                  <td colspan={columns.length}>
                    <button
                      type="button"
                      aria-expanded={row.expanded}
                      onclick={() => (desk.collapsed = { ...desk.collapsed, [row.id]: row.expanded })}
                    >
                      <span class="od-desktop-logbook--chevron" class:od-desktop-logbook--open={row.expanded} aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg></span>
                      <span class="od-desktop-logbook--trip-title">{text.title}</span>
                      <span class="od-desktop-logbook--trip-range"> · {text.range}</span>
                    </button>
                  </td>
                </tr>
              {:else}
                {@const dive = row.dive}
                <tr
                  class="od-desktop-logbook--row"
                  class:od-desktop-logbook--selected={selected.has(dive.id)}
                  class:od-desktop-logbook--focus={desk.selection.focus === dive.id}
                  aria-selected={selected.has(dive.id)}
                  data-dive={dive.id}
                  onclick={(e) => rowClick(e, dive.id)}
                  ondblclick={() => editSelected()}
                  oncontextmenu={(e) => rowMenu(e, dive.id)}
                >
                  {#each columns as column (column.key)}
                    <td
                      class:od-desktop-logbook--numeric={column.numeric}
                      class:od-desktop-logbook--muted={(column.key === 'site' && !dive.site) || column.key === 'buddies'}
                      class:od-desktop-logbook--buddies={column.key === 'buddies'}
                      class:od-desktop-logbook--first={column.key === 'number' && row.inTrip}
                    >{cell(column.key, dive)}</td>
                  {/each}
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
        {#if !rows.length}<p class="od-desktop-logbook--state" role="status">{t('desktop.noMatch')}</p>{/if}
      </div>
    {/if}

    <div
      class="od-desktop-logbook--handle"
      role="separator"
      aria-orientation="vertical"
      aria-label={t('desktop.resize')}
      aria-valuenow={desk.tableWidth}
      tabindex="0"
      onpointerdown={startResize}
      onkeydown={resizeKey}
    >
      <span class="od-desktop-logbook--grip"></span>
    </div>

    {#if dropping}<div class="od-desktop-logbook--drop" aria-hidden="true"><p>{t('desktop.dropHere')}</p></div>{/if}
  </div>

  <input type="file" class="od-sr-only" tabindex="-1" aria-hidden="true" bind:this={fileInput} onchange={fileChosen} />
  {#if logbook.dives.length}<FabMenu choices={addChoices} onchoose={choose} />{/if}
  {#if moreAt}
    <DesktopContextMenu x={moreAt.x} y={moreAt.y} heading="" entries={moreEntries} onchoose={moreChoose} onclose={() => (moreAt = null)} />
  {/if}
  {#if menuAt}
    <DesktopContextMenu x={menuAt.x} y={menuAt.y} heading={menuHeading} entries={menuEntries} onchoose={act} onclose={() => (menuAt = null)} />
  {/if}
  {#if exporting}
    <ExportSheet count={desk.selection.ids.length} onexport={exportSelected} onclose={() => (exporting = false)} />
  {/if}
  {#if choosingTrip}
    <ChoiceDialog title={t('desktop.menu.addToTrip')} options={tripOptions} value="new" onselect={addToTrip} oncancel={() => (choosingTrip = false)} />
  {/if}
</Page>

<style>
  @layer od.components {
    .od-desktop-logbook--frame {
      position: relative;
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--od-background);
    }
    .od-desktop-logbook--bar {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 64px;
      padding: 8px 8px 8px 12px;
    }
    .od-desktop-logbook--titles {
      flex: 1;
      min-width: 0;
    }
    .od-desktop-logbook--title {
      margin: 0;
      font-family: var(--od-title-font);
      font-size: 22px;
      font-weight: 500;
      color: var(--od-text);
    }
    .od-desktop-logbook--summary {
      margin: 2px 0 0;
      font-size: 13px;
      color: var(--od-text-2);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .od-desktop-logbook--spacer {
      flex: 1;
    }
    .od-desktop-logbook--search {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: 0 1 300px;
      min-width: 220px;
      height: 44px;
      padding: 0 12px 0 16px;
      border-radius: 22px;
      background: var(--od-surface-container);
      color: var(--od-text-2);
    }
    .od-desktop-logbook--search input {
      flex: 1;
      min-width: 0;
      border: 0;
      background: none;
      font: inherit;
      font-size: 15px;
      color: var(--od-text);
      outline: none;
    }
    .od-desktop-logbook--hint {
      padding: 1px 6px;
      border: 1px solid var(--od-separator);
      border-radius: 4px;
      font: inherit;
      font-size: 11px;
      color: var(--od-text-2);
    }
    .od-desktop-logbook--icon-button {
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
    .od-desktop-logbook--icon-button:hover {
      background: color-mix(in srgb, var(--od-text) 8%, transparent);
    }
    .od-desktop-logbook--columns-anchor {
      position: relative;
    }
    .od-desktop-logbook--columns-scrim {
      position: fixed;
      inset: 0;
      z-index: 12999;
    }
    .od-desktop-logbook--columns {
      position: absolute;
      top: 48px;
      right: 0;
      z-index: 13000;
      min-width: 240px;
      padding: 8px 0;
      border-radius: 12px;
      background: var(--od-surface);
      box-shadow:
        0 2px 6px 2px rgb(0 0 0 / 0.15),
        0 1px 2px rgb(0 0 0 / 0.3);
    }
    .od-desktop-logbook--column-choice {
      display: flex;
      align-items: center;
      gap: 12px;
      height: 40px;
      padding: 0 16px;
      font-size: 15px;
      color: var(--od-text);
      cursor: pointer;
    }
    .od-desktop-logbook--column-choice:hover {
      background: color-mix(in srgb, var(--od-text) 8%, transparent);
    }
    .od-desktop-logbook--fixed {
      color: var(--od-text-2);
      cursor: default;
    }
    .od-desktop-logbook--scroll {
      flex: 1;
      overflow: auto;
      padding-right: 9px;
    }
    .od-desktop-logbook--table {
      width: 100%;
      border-collapse: collapse;
      font-size: 15px;
      color: var(--od-text);
    }
    .od-desktop-logbook--head {
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
    .od-desktop-logbook--head button {
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
    .od-desktop-logbook--head button:hover {
      color: var(--od-text);
    }
    .od-desktop-logbook--arrow {
      margin-inline-start: 4px;
    }
    .od-desktop-logbook--numeric {
      text-align: end;
      font-variant-numeric: tabular-nums;
    }
    .od-desktop-logbook--row {
      height: 44px;
      border-bottom: 1px solid var(--od-row-divider);
      cursor: default;
    }
    .od-desktop-logbook--row td {
      padding: 0 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 280px;
    }
    .od-desktop-logbook--row:hover {
      background: color-mix(in srgb, var(--od-text) 4%, transparent);
    }
    .od-desktop-logbook--selected,
    .od-desktop-logbook--selected:hover {
      background: var(--od-table-selected);
      color: var(--od-on-table-selected);
    }
    .od-desktop-logbook--muted {
      color: var(--od-text-2);
    }
    /* Compagnons: about 124 dp, the rest ellipsised (task 2026-11-15-182). */
    .od-desktop-logbook--row .od-desktop-logbook--buddies {
      max-width: 124px;
    }
    .od-desktop-logbook--selected .od-desktop-logbook--muted {
      color: inherit;
    }
    .od-desktop-logbook--trip {
      height: 44px;
      border-bottom: 1px solid var(--od-row-divider);
    }
    .od-desktop-logbook--trip td {
      padding: 0;
    }
    .od-desktop-logbook--trip button {
      display: flex;
      align-items: center;
      gap: 6px;
      width: 100%;
      height: 44px;
      padding: 0 12px;
      border: 0;
      background: none;
      font: inherit;
      color: var(--od-text);
      text-align: start;
      cursor: pointer;
    }
    .od-desktop-logbook--chevron {
      display: inline-flex;
      color: var(--od-text-2);
      transform: rotate(-90deg);
      transition: transform 150ms;
    }
    .od-desktop-logbook--open {
      transform: none;
    }
    .od-desktop-logbook--trip-title {
      font-weight: 500;
    }
    .od-desktop-logbook--trip-range {
      color: var(--od-text-2);
    }
    .od-desktop-logbook--state {
      padding: 48px 24px;
      text-align: center;
      color: var(--od-text-2);
    }
    .od-desktop-logbook--filled {
      height: 40px;
      padding: 0 24px;
      border: 0;
      border-radius: 20px;
      background: var(--od-primary-action);
      color: var(--od-on-primary-action);
      font: inherit;
      cursor: pointer;
    }
    /* 9 dp handle, a 1 dp line, a 4 × 32 dp grip (task 2026-11-15-169). */
    .od-desktop-logbook--handle {
      position: absolute;
      top: 64px;
      right: 0;
      bottom: 0;
      width: 9px;
      cursor: col-resize;
      outline: none;
    }
    .od-desktop-logbook--handle::before {
      content: '';
      position: absolute;
      inset: 0 4px;
      background: var(--od-separator);
    }
    .od-desktop-logbook--grip {
      position: absolute;
      top: 50%;
      left: 2.5px;
      width: 4px;
      height: 32px;
      margin-top: -16px;
      border-radius: 2px;
      background: var(--od-outline);
    }
    .od-desktop-logbook--handle:focus-visible .od-desktop-logbook--grip,
    .od-desktop-logbook--handle:hover .od-desktop-logbook--grip {
      background: var(--od-text);
    }
    .od-desktop-logbook--drop {
      position: fixed;
      inset: 0;
      z-index: 12000;
      display: grid;
      place-items: center;
      background: color-mix(in srgb, var(--od-background) 85%, transparent);
      border: 3px dashed var(--od-selected);
      font-size: 20px;
      color: var(--od-text);
      pointer-events: none;
    }
    .od-desktop-logbook--drop-note {
      font-size: 14px;
    }
  }
</style>
