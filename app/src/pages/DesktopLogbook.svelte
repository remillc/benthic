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
  import ProfileThumbnail from '../components/ProfileThumbnail.svelte';
  import DesktopExportDialog from '../components/DesktopExportDialog.svelte';
  import DesktopEditTogetherDialog from '../components/DesktopEditTogetherDialog.svelte';
  import DesktopLogbookSelector from '../components/DesktopLogbookSelector.svelte';
  import DesktopLogbookReady from '../components/DesktopLogbookReady.svelte';
  import { ownLogbookWindow } from '../lib/window-logbook.js';
  import ChoiceDialog from '../components/ChoiceDialog.svelte';
  import DesktopContextMenu from '../components/DesktopContextMenu.svelte';
  import RenumberDialog from '../components/RenumberDialog.svelte';
  import { showSnackbar } from '../lib/snackbar.js';
  import { offerUndo } from '../lib/undo.js';
  import { confirmAction } from '../lib/dialogs.js';
  import { importErrorKey } from '../lib/deep-link.js';
  import { logbook, loadLogbook, importFile, importData, undoLastChange, deleteDives, tripChange, mergeDives } from '../lib/logbook.svelte.js';
  import { canMerge, mergeErrorKey } from '../lib/multi-dive.js';
  import { selectionText, copyDives, clipboardDives, textToBase64 } from '../lib/desktop-clipboard.js';
  import { filter } from '../lib/filter.svelte.js';
  import { navigation, openSettings, openAbout } from '../lib/navigation.svelte.js';
  import { desktopMac, layout } from '../lib/layout.svelte.js';
  import { logbookSummary } from '../lib/logbook-summary.js';
  import { undoNameKey } from '../lib/undo-name.js';
  import { desk, setSort, setColumns, setColumnWidths, setTableWidth, loadExtras, loadDesktopChoices } from '../lib/desktop-logbook.svelte.js';
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
    emptyAreaMenuEntries,
    clampTableWidth,
    tableWidthFor,
    fittingColumns,
    clampColumnWidth,
    columnWidth,
    minColumnWidth,
    COLUMN_MAX_WIDTH,
    adjacentTrips,
    moveColumn,
    dropTarget,
    DEFAULT_COLUMNS,
    rowOffsets,
    windowRange,
    scrollForRow,
    BODY_TOP,
    BODY_TOP_YEAR,
    showsYearLine,
    yearCounts,
    yearLineAt,
  } from '../lib/desktop-table.js';
  import { formatDepth, formatDate, formatTemperature, formatSac, formatMinutes, depthValue, formatWeekdayDate, formatTimeOfDay } from '../lib/format.js';
  import { t } from '../lib/i18n.js';
  import { OpenDivesCore } from 'opendives-core';

  let { f7router } = $props();

  loadDesktopChoices();

  /** The actions the right-click menu can offer today (the others wait: see the task's notes). */
  const AVAILABLE = new Set(['merge', 'addToTrip', 'edit', 'editTogether', 'copy', 'export', 'share', 'delete']);
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
  /** The room the table has, in px (read from its scroll area). */
  let tableRoom = $state(0);
  /** The shown columns that fit in that room; the others stay chosen and come back in a wider pane. */
  const columnsNow = $derived(fittingColumns(columns, tableRoom, desk.columnWidths));
  /**
   * Site is the column that takes the room the others leave. Once the diver gave it a width, nothing takes the room
   * any more: every column gets its width as it is (the table is then as wide as they add up to, never stretched).
   */
  const exactWidths = $derived(columnsNow.some((c) => c.key === 'site') && desk.columnWidths.site != null);
  const tableStyle = $derived(exactWidths ? `width: ${columnsNow.reduce((sum, c) => sum + columnWidth(c.key, desk.columnWidths), 0)}px` : undefined);
  $effect(() => {
    if (!tableEl) return;
    const element = tableEl;
    const measure = () => {
      tableRoom = element.clientWidth - 9;
      viewHeight = element.clientHeight;
    };
    measure();
    scrollTop = element.scrollTop;
    // Arriving with a dive selected (a resize across the layout switch): it is put in view.
    untrack(() => scrollToDive(desk.selection.focus));
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  });
  const sorted = $derived(sortDives(listed, desk.extras, desk.sort));
  const rows = $derived(tableRows(sorted, desk.sort, desk.collapsed));
  const order = $derived(rowDiveIds(rows));
  const selected = $derived(new Set(desk.selection.ids));
  const summary = $derived(logbookSummary(logbook.dives));

  // --- Windowing: only the rows in view (plus a margin) are in the DOM; two spacer rows hold the rest's height. ---
  let scrollTop = $state(0);
  let viewHeight = $state(0);
  const offsets = $derived(rowOffsets(rows));
  // The sticky year line sits under the header when the rows follow the dates (task 2026-11-18-279).
  const yearLineShown = $derived(showsYearLine(desk.sort));
  const bodyTop = $derived(yearLineShown ? BODY_TOP_YEAR : BODY_TOP);
  const counts = $derived(yearCounts(sorted));
  const yearLine = $derived(yearLineShown ? yearLineAt(rows, offsets, scrollTop, counts) : null);
  const win = $derived(windowRange(offsets, scrollTop, viewHeight, bodyTop));
  const windowStart = $derived(win.start);
  const windowEnd = $derived(win.end);
  const visibleRows = $derived(rows.slice(windowStart, windowEnd));
  const padTop = $derived(win.padTop);
  const padBottom = $derived(win.padBottom);

  /** Scrolls the table so the row of dive `id` is fully in view; computed from the row heights, so it works for rows not drawn. */
  function scrollToDive(/** @type {number|null} */ id) {
    if (!tableEl || id == null) return;
    const i = rows.findIndex((r) => r.type === 'dive' && r.dive.id === id);
    tableEl.scrollTop = scrollForRow(offsets, i, tableEl.scrollTop, tableEl.clientHeight, bodyTop);
    scrollTop = tableEl.scrollTop;
  }

  // The columns' extra values follow the logbook, when a shown column or the sort reads them.
  const NO_EXTRAS = new Set(['number', 'date', 'site', 'maxDepth', 'duration', 'profile']);
  const needsExtras = $derived(columnsNow.some((c) => !NO_EXTRAS.has(c.key)) || !NO_EXTRAS.has(desk.sort.key));
  $effect(() => {
    if (logbook.loading || logbook.error || !needsExtras) return;
    logbook.dives;
    untrack(() => loadExtras());
  });

  // Adaptive page: arriving from the tablet layout, the dive its detail pane shows is the selection.
  {
    const shown = /^\/dives\/(\d+)$/.exec(untrack(() => f7router.currentRoute?.url) ?? '');
    const id = shown ? Number(shown[1]) : 0;
    if (id && !desk.selection.ids.includes(id)) desk.selection = { ids: [id], anchor: id, focus: id };
  }

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

  /** The selection the pane last followed: another one (a click on a dive, the keyboard) leaves the trip page. */
  let followed = desk.selection;
  $effect(() => {
    if (!layout.desktop || navigation.section !== 'logbook' || logbook.loading) return;
    const selection = desk.selection;
    if (selection !== followed) {
      followed = selection;
      untrack(() => (desk.trip = null));
    }
    // A trip row chosen: the trip's page replaces the pane.
    if (desk.trip !== null && order.length) {
      showDetail(`/trips/${desk.trip}`);
      return;
    }
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
        return t('desktop.dateTime', { date: formatWeekdayDate(dive.date), time: formatTimeOfDay(dive.date) });
      case 'site':
        return dive.site || t('desktop.noSite');
      case 'maxDepth':
        return dive.maxDepthMm ? formatDepth(dive.maxDepthMm, p) : '';
      case 'profile':
        return '';
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
    const title = row.location || t('trip.startingOn', { date: formatDate(dives.reduce((a, d) => (d.date < a ? d.date : a), dives[0].date)) });
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

  const mergeable = $derived(canMerge(logbook.dives, desk.selection.ids).ok);
  const menuEntries = $derived(contextMenuEntries(desk.selection.ids.length, { mac: desktopMac, available: AVAILABLE, mergeable }));

  // The right-click menu of the table's empty area: « Coller » (task 2026-11-15-178).
  /** @type {{x: number, y: number, canPaste: boolean}|null} */
  let emptyMenuAt = $state(null);
  const emptyMenuEntries = $derived(emptyMenuAt ? emptyAreaMenuEntries({ mac: desktopMac, canPaste: emptyMenuAt.canPaste }) : []);

  /** @param {MouseEvent} e */
  async function areaMenu(e) {
    // A row, a header or a control has its own menu or none.
    if (e.defaultPrevented || /** @type {HTMLElement} */ (e.target).closest('tr, thead, button, input, a, header, .bc-desktop-logbook--handle')) return;
    e.preventDefault();
    const { clientX: x, clientY: y } = e;
    emptyMenuAt = { x, y, canPaste: !!(await clipboardDives()) };
  }
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
    scrollToDive(desk.selection.focus);
  }

  // --- Actions. ------------------------------------------------------------------------
  /** @param {unknown} e */
  function changeFailed(e) {
    console.error('Desktop logbook change', e);
    showSnackbar(t('desktop.changeFailed'));
  }

  /** Task 172: the detail pane is the editor; its first editable field gets the cursor. Several dives: the dialog. */
  function editSelected() {
    if (desk.selection.ids.length === 1) window.dispatchEvent(new Event('od-detail-focus-first'));
    else if (desk.selection.ids.length > 1) editingTogether = true;
  }

  // --- Several dives (task 2026-11-15-178): merge, edit together, copy, paste. ----------------------
  let editingTogether = $state(false);

  async function mergeSelected() {
    const ids = [...desk.selection.ids];
    const n = ids.length;
    if (!canMerge(logbook.dives, ids).ok) return;
    try {
      const id = await mergeDives(ids);
      // The list was read again: the merged dive becomes the selection.
      if (id) desk.selection = { ids: [id], anchor: id, focus: id };
      offerUndo(t('multiDive.merged', { n }));
    } catch (e) {
      console.error('Merge dives', e);
      const code = String(/** @type {any} */ (e)?.message ?? '');
      showSnackbar(t(mergeErrorKey(code)));
    }
  }

  /** The selected rows as the table shows them, in its order: a header line, then a line per dive. */
  function copiedText() {
    const chosen = order.filter((id) => selected.has(id));
    const byId = new Map(logbook.dives.map((d) => [d.id, d]));
    return selectionText(
      columns.map((c) => t(c.label)),
      chosen.flatMap((id) => {
        const dive = byId.get(id);
        return dive ? [columns.map((c) => cell(c.key, dive))] : [];
      }),
    );
  }

  async function copySelected() {
    const ids = order.filter((id) => selected.has(id));
    if (!ids.length) return;
    try {
      await copyDives(ids, copiedText());
      showSnackbar(t('desktopMultiDive.copied', { n: ids.length }));
    } catch (e) {
      console.error('Copy dives', e);
      showSnackbar(t('desktopMultiDive.copyFailed'));
    }
  }

  /** Adds the dives of the clipboard with the import's duplicate check; nothing when it holds none. */
  async function pasteDives() {
    const xml = await clipboardDives();
    if (!xml) return false;
    try {
      const n = await importData('clipboard.ssrf', textToBase64(xml));
      offerUndo(t('desktopMultiDive.pasted', { n }));
    } catch (e) {
      const code = String(/** @type {any} */ (e)?.message ?? '');
      console.error('Paste dives', code);
      showSnackbar(t(importErrorKey(code)));
    }
    return true;
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
  let exportWhole = $state(false);

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
    else if (key === 'editTogether') editingTogether = true;
    else if (key === 'merge') mergeSelected();
    else if (key === 'copy') copySelected();
    else if (key === 'export' || key === 'share') exporting = true;
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
      { key: 'filter', label: '', text: t(filter.ids ? 'desktop.filterOn' : 'desktop.filter'), icon: 'filter', shortcut: desktopMac ? '⇧⌘F' : 'Ctrl+Maj+F' },
      { key: 'renumber', label: 'desktop.renumberDives', icon: 'renumber' },
      { key: 'computers', label: 'settings.logbookComputers.title', icon: 'computer' },
      { key: 'exportWhole', label: '', text: t('welcomeSteps.menuExport'), icon: 'upload', disabled: logbook.loading || !!logbook.error || !logbook.dives.length },
      // Only when the selection touches a trip on that side (task 2026-11-15-194).
      ...(nearTrips.previous || nearTrips.next ? [{ key: 'separator' }] : []),
      ...(nearTrips.previous ? [{ key: 'mergePrevious', label: 'desktop.mergePreviousTrip', icon: 'merge' }] : []),
      ...(nearTrips.next ? [{ key: 'mergeNext', label: 'desktop.mergeNextTrip', icon: 'merge' }] : []),
      // The last item, after a divider (task 2026-11-15-202).
      { key: 'separator' },
      { key: 'about', label: '', text: t('desktopSettings.about'), icon: 'info' },
    ]),
  );
  const nearTrips = $derived(adjacentTrips(logbook.dives, desk.selection.ids));
  let renumbering = $state(false);
  /** @param {string} key */
  async function moreChoose(key) {
    if (key === 'undo' || key === 'redo') command(key);
    else if (key === 'filter') command('filter');
    else if (key === 'renumber') renumbering = true;
    else if (key === 'computers') f7router.navigate('/settings/computers/');
    else if (key === 'exportWhole') {
      exportWhole = true;
      exporting = true;
    }
    else if (key === 'about') openAbout();
    else if (key === 'mergePrevious' || key === 'mergeNext') {
      const trip = key === 'mergePrevious' ? nearTrips.previous : nearTrips.next;
      if (!trip) return;
      const ids = [...desk.selection.ids];
      try {
        await tripChange({ action: 'add', tripId: trip.id, diveIds: ids });
        desk.collapsed = { ...desk.collapsed, [trip.id]: false };
        offerUndo(t('logbook.addedToTrip', { n: ids.length }));
      } catch (e) {
        changeFailed(e);
      }
    }
  }

  // --- Moving a column by its header (tasks 2026-11-15-181 and 195). ----------------------------
  /** @type {{key: string, label: string, x: number, y: number, dx: number, width: number, barX: number, top: number, height: number}|null} */
  let dragging = $state(null);
  let dropAt = 0;
  let movedByDrag = false;
  /** Said to screen readers only (no tooltip on screen, task 195). */
  let announce = $state('');

  /** @param {string|null} key */
  const columnName = (key) => (key ? t(COLUMNS.find((c) => c.key === key)?.label ?? '') : '');

  /** @param {PointerEvent} e @param {string} key */
  function headDown(e, key) {
    if (key === 'number' || e.button !== 0) return;
    const th = /** @type {HTMLElement} */ (e.currentTarget);
    const startX = e.clientX;
    const rect = th.getBoundingClientRect();
    const table = /** @type {HTMLElement} */ (th.closest('table'));
    const scroller = /** @type {HTMLElement} */ (th.closest('.bc-desktop-logbook--scroll'));
    /** @param {PointerEvent} m */
    const move = (m) => {
      if (!dragging && Math.abs(m.clientX - startX) < 5) return;
      const heads = [...table.querySelectorAll('th[data-col]')].map((h) => {
        const r = h.getBoundingClientRect();
        return { key: /** @type {string} */ (h.dataset.col), left: r.left, right: r.right };
      });
      const target = dropTarget(heads, key, m.clientX);
      dropAt = target.index;
      const rest = heads.filter((h) => h.key !== key);
      const barX = target.after ? (rest[target.index]?.left ?? 0) : (rest[rest.length - 1]?.right ?? 0);
      const box = scroller.getBoundingClientRect();
      announce = target.after
        ? t('desktop.columnWillMove', { column: columnName(key), before: columnName(target.before), after: columnName(target.after) })
        : t('desktop.columnWillMoveLast', { column: columnName(key) });
      dragging = { key, label: columnName(key), x: m.clientX, y: m.clientY, dx: startX - rect.left, width: rect.width, barX, top: box.top, height: box.height };
    };
    /** @param {boolean} keep */
    const end = (keep) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('keydown', esc, true);
      if (dragging && keep) {
        movedByDrag = true;
        setColumns(moveColumn(columns.map((c) => c.key), key, dropAt));
      }
      dragging = null;
      announce = '';
    };
    const up = () => end(true);
    /** @param {KeyboardEvent} k */
    const esc = (k) => {
      if (k.key !== 'Escape' || !dragging) return;
      k.preventDefault();
      k.stopPropagation();
      end(false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('keydown', esc, true);
  }

  /** A click that was not a drag sorts, as before. @param {string} key */
  function headClick(key) {
    if (movedByDrag) {
      movedByDrag = false;
      return;
    }
    if (COLUMNS.find((c) => c.key === key)?.sortable === false) return;
    setSort(nextSort(desk.sort, key));
  }

  /** Alt+Maj+← → move the focused column one place. @param {KeyboardEvent} e @param {string} key */
  function headKey(e, key) {
    if (!e.altKey || !e.shiftKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || key === 'number') return;
    e.preventDefault();
    const keys = columns.map((c) => c.key);
    const at = keys.indexOf(key);
    // moveColumn counts in the list without the column: right is at + 1 there, left at - 1.
    setColumns(moveColumn(keys, key, e.key === 'ArrowRight' ? at + 1 : at - 1));
    tick().then(() => /** @type {HTMLElement|null} */ (tableEl?.querySelector(`th[data-col="${key}"] button`))?.focus());
  }

  /** « Rétablir l'ordre des colonnes »: the default order, then the other shown columns in the table's order. */
  function resetColumnOrder() {
    const shown = new Set(columns.map((c) => c.key));
    setColumns([
      ...DEFAULT_COLUMNS.filter((k) => shown.has(k)),
      ...COLUMNS.map((c) => c.key).filter((k) => shown.has(k) && !DEFAULT_COLUMNS.includes(k)),
    ]);
    columnsOpen = false;
  }

  // --- Resizing a column by the edge of its header (task 2026-11-15-181). ------------------------
  /** The width a column has now: the diver's, or the one the stylesheet gives it. @param {string} key */
  const widthOf = (key) => desk.columnWidths[key] ?? Math.round(tableEl?.querySelector(`th[data-col="${key}"]`)?.getBoundingClientRect().width ?? minColumnWidth(key));

  /** @param {string} key @param {number} width @param {boolean} [keep] */
  function giveWidth(key, width, keep = true) {
    setColumnWidths({ ...desk.columnWidths, [key]: clampColumnWidth(key, width) }, keep);
  }

  /** The handle on a header's edge: drag to resize; the header's own drag and sort stay out of it. @param {PointerEvent} e @param {string} key */
  function edgeDown(e, key) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = widthOf(key);
    /** @param {PointerEvent} m */
    const move = (m) => giveWidth(key, startWidth + (m.clientX - startX), false);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setColumnWidths(desk.columnWidths);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  /** Arrow keys on the focused edge: 8 px a step, 32 with Maj; Entrée fits the column to its content. @param {KeyboardEvent} e @param {string} key */
  function edgeKey(e, key) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const step = (e.shiftKey ? 32 : 8) * (e.key === 'ArrowRight' ? 1 : -1);
      giveWidth(key, widthOf(key) + step);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      fitColumn(key);
    }
  }

  /** Double click on the edge: the width the widest value (or the header) needs. @param {string} key */
  function fitColumn(key) {
    const column = COLUMNS.find((c) => c.key === key);
    if (!column || !tableEl) return;
    const context = document.createElement('canvas').getContext('2d');
    if (!context) return;
    const family = getComputedStyle(tableEl).fontFamily;
    context.font = `14px ${family}`;
    let widest = 0;
    const sample = logbook.dives.length > 3000 ? logbook.dives.filter((_, i) => i % Math.ceil(logbook.dives.length / 3000) === 0) : logbook.dives;
    for (const dive of sample) widest = Math.max(widest, context.measureText(cell(key, dive)).width);
    context.font = `500 13px ${family}`;
    widest = Math.max(widest, context.measureText(t(column.label)).width + 16);
    // 20 px of padding and a little room for the cell's own marks (a deep value, the sort arrow).
    giveWidth(key, Math.ceil(widest) + 24);
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
      offerUndo(t('logbook.importedFrom', { n, name: file.name }));
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
      !emptyMenuAt &&
      !editingTogether &&
      !exporting &&
      !choosingTrip &&
      !document.querySelector('.dialog.modal-in, .sheet-modal.modal-in, .popup.modal-in') &&
      !!pageEl?.closest('.page-current, .page-master')
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
      case 'merge':
        if (desk.selection.ids.length > 1 && mergeable) mergeSelected();
        return true;
      case 'copy':
        // Text selected in a field copies as text; otherwise the selected dives.
        if (document.activeElement?.closest('input, textarea, select, [contenteditable="true"]') || window.getSelection()?.toString()) {
          document.execCommand('copy');
        } else copySelected();
        return true;
      case 'paste':
        pasteDives();
        return true;
      case 'export':
        // The dialog offers the selection, the filtered dives or the whole logbook (task 189).
        exporting = true;
        return true;
      case 'addToTrip':
        if (desk.selection.ids.length) choosingTrip = true;
        return true;
      case 'share':
        // Task 194: the system's share sheet on Windows and macOS once the bridge has one; until
        // then, and on Linux, the export dialog.
        exporting = true;
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
      case 'filter':
        f7router.navigate('/filter');
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
      if (modKey && key === 'f' && e.shiftKey) cmd = 'filter';
      else if (modKey && key === 'f') cmd = 'find';
      else if (modKey && key === ',') cmd = 'settings';
      else if (!typing && modKey && key === 'n') cmd = 'new';
      else if (!typing && modKey && key === 'm') cmd = 'merge';
      else if (!typing && modKey && key === 'c' && !e.shiftKey && !window.getSelection()?.toString()) cmd = 'copy';
      else if (!typing && modKey && key === 'v' && !e.shiftKey) cmd = 'paste';
      else if (!typing && modKey && key === 'e' && e.shiftKey) cmd = 'export';
      else if (!typing && modKey && key === 'e') cmd = 'edit';
      else if (!typing && modKey && key === 'z') cmd = e.shiftKey ? 'redo' : 'undo';
      else if (!typing && modKey && key === 'y' && !desktopMac) cmd = 'redo';
      else if (!typing && modKey && key === 'a') cmd = 'selectAll';
      else if (!typing && (e.key === 'Delete' || (desktopMac && e.key === 'Backspace' && e.metaKey))) cmd = 'delete';
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
    // The Mac's Edit menu pastes through the system (a paste event, no key): the dives of the clipboard,
    // unless the focus is in a text field.
    /** @param {ClipboardEvent} e */
    const paste = (e) => {
      if (!inUse() || (e.target instanceof HTMLElement && e.target.closest('input, textarea, select, [contenteditable="true"]'))) return;
      e.preventDefault();
      pasteDives();
    };
    window.addEventListener('paste', paste);
    // The detail pane's ⋮ (DiveDetail.svelte) acts through the same commands, on the dive it shows.
    /** @param {Event} e */
    const fromDetail = (e) => command(/** @type {CustomEvent<string>} */ (e).detail);
    window.addEventListener('od-desktop-command', fromDetail);
    const off = /** @type {any} */ (window).odDesktop?.onMenu?.((/** @type {string} */ c) => inUse() && command(c));
    return () => {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('paste', paste);
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
      if (desk.tableWidth !== null) setTableWidth(desk.tableWidth);
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
    setTableWidth(clampTableWidth(tableNow + (e.key === 'ArrowRight' ? 16 : -16), available));
  }

  /** The width the table has now, in px (the pane follows the window while the diver has not moved the handle). */
  let tableNow = $state(760);
  // The view gives the table its width (Framework7's master-detail), again each time the window changes size.
  $effect(() => {
    const view = /** @type {HTMLElement|null} */ (pageEl?.closest('.view') ?? null);
    if (!view) return;
    const stored = desk.tableWidth;
    const place = () => {
      const available = view.getBoundingClientRect().width;
      tableNow = clampTableWidth(tableWidthFor(stored, available), available);
      view.style.setProperty('--f7-page-master-width', `${tableNow}px`);
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(view);
    return () => {
      observer.disconnect();
      view.style.removeProperty('--f7-page-master-width');
    };
  });
</script>

<Page class="bc-desktop-logbook" pageContent={false}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="bc-desktop-logbook--frame" bind:this={pageEl} oncontextmenu={areaMenu}>
    <header class="bc-desktop-logbook--bar">
      <!-- The list column's own header (task 2026-11-15-192): the title, the count on one line under it. -->
      <div class="bc-desktop-logbook--titles">
        {#if desktopMac}<h1 class="bc-desktop-logbook--title">{t('logbook.title')}</h1>{:else}<DesktopLogbookSelector onexport={() => ((exportWhole = true), (exporting = true))} />{/if}
        {#if summary}<p class="bc-desktop-logbook--summary bc-value" title={summary}>{summary}</p>{/if}
      </div>
      <label class="bc-desktop-logbook--search">
        <Icon name="search" size={20} />
        <input type="search" bind:this={searchField} bind:value={query} placeholder={t('logbook.search')} aria-keyshortcuts={desktopMac ? 'Meta+F' : 'Control+F'} />
        {#if !query}<kbd class="bc-desktop-logbook--hint">{mod}F</kbd>{/if}
      </label>
      <div class="bc-desktop-logbook--columns-anchor">
        <button type="button" class="bc-desktop-logbook--icon-button" aria-label={t('desktop.columnsShown')} title={t('desktop.columnsShown')} aria-expanded={columnsOpen} onclick={() => (columnsOpen = !columnsOpen)}>
          <Icon name="columns" size={22} />
        </button>
        {#if columnsOpen}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="bc-desktop-logbook--columns-scrim" onpointerdown={() => (columnsOpen = false)}></div>
          <div class="bc-desktop-logbook--columns" role="menu" aria-label={t('desktop.columns')}>
            {#each COLUMNS as column (column.key)}
              {@const fixed = column.key === 'number' || column.key === 'date'}
              <label class="bc-desktop-logbook--column-choice" class:bc-desktop-logbook--fixed={fixed}>
                <input type="checkbox" role="menuitemcheckbox" checked={columns.some((c) => c.key === column.key)} disabled={fixed} onchange={() => setColumns(toggleColumn(columns.map((c) => c.key), column.key))} />
                {t(column.label)}
              </label>
            {/each}
            <div class="bc-desktop-logbook--columns-divider" role="separator"></div>
            <button type="button" role="menuitem" class="bc-desktop-logbook--column-choice bc-desktop-logbook--columns-reset" onclick={resetColumnOrder}>{t('desktop.resetColumns')}</button>
          </div>
        {/if}
      </div>
      <button type="button" class="bc-desktop-logbook--icon-button" aria-label={t('desktop.moreLogbook')} title={t('desktop.moreLogbook')} aria-haspopup="menu" onclick={openMore}>
        <Icon name="more" size={22} />
      </button>
    </header>

    {#if logbook.loading}
      <p class="bc-desktop-logbook--state" role="status" aria-busy="true">{t('logbook.loading')}</p>
    {:else if logbook.error}
      <div class="bc-desktop-logbook--state" role="alert">
        <h2 class="bc-state-title">{t('logbook.errorTitle')}</h2>
        <p>{t('logbook.errorNothingChanged')}</p>
        <button type="button" class="bc-desktop-logbook--filled" onclick={() => loadLogbook({ force: true })}>{t('logbook.retry')}</button>
      </div>
    {:else if !logbook.dives.length && ownLogbookWindow()}
      <DesktopLogbookReady ondownload={() => choose('download')} onimport={() => choose('import')} onmanual={() => choose('manual')} />
    {:else if !logbook.dives.length}
      <div class="bc-desktop-logbook--state">
        <h2 class="bc-state-title">{t('logbook.emptyTitle')}</h2>
        <p>{t('logbook.emptyText')}</p>
        <p class="bc-desktop-logbook--drop-note">{t('desktop.dropNote')}</p>
      </div>
    {:else}
      <div class="bc-desktop-logbook--scroll" data-od-scroll bind:this={tableEl} onscroll={(e) => (scrollTop = e.currentTarget.scrollTop)}>
        <table class="bc-desktop-logbook--table" style={tableStyle} aria-multiselectable="true" aria-rowcount={rows.length + 1}>
          <thead>
            <tr aria-rowindex="1">
              {#each columnsNow as column (column.key)}
                {@const sortedHere = desk.sort.key === column.key}
                <th
                  scope="col"
                  class="bc-desktop-logbook--head"
                  class:bc-desktop-logbook--numeric={column.numeric}
                  data-col={column.key}
                  class:bc-desktop-logbook--slot={dragging?.key === column.key}
                  aria-sort={sortedHere ? (desk.sort.descending ? 'descending' : 'ascending') : 'none'}
                  class:bc-desktop-logbook--plain={column.sortable === false}
                  style:width={desk.columnWidths[column.key] || exactWidths ? `${columnWidth(column.key, desk.columnWidths)}px` : undefined}
                  onpointerdown={(e) => headDown(e, column.key)}
                >
                  <button type="button" onclick={() => headClick(column.key)} onkeydown={(e) => headKey(e, column.key)}>
                    {t(column.label)}{#if sortedHere}<span class="bc-desktop-logbook--arrow" aria-hidden="true">{desk.sort.descending ? '▾' : '▴'}</span>{/if}
                  </button>
                  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
                  <span
                    class="bc-desktop-logbook--edge"
                    role="separator"
                    tabindex="0"
                    aria-orientation="vertical"
                    aria-label={t('desktop.resizeColumn', { column: t(column.label) })}
                    aria-valuemin={minColumnWidth(column.key)}
                    aria-valuemax={COLUMN_MAX_WIDTH}
                    aria-valuenow={desk.columnWidths[column.key] ?? undefined}
                    onpointerdown={(e) => edgeDown(e, column.key)}
                    ondblclick={() => fitColumn(column.key)}
                    onkeydown={(e) => edgeKey(e, column.key)}
                    onclick={(e) => e.stopPropagation()}
                  ></span>
                </th>
              {/each}
            </tr>
            {#if yearLineShown}
              <!-- The year and dive count of the first visible dive; sticky under the header. Decorative: the rows say the rest. -->
              <tr class="bc-desktop-logbook--year-row" aria-hidden="true">
                <th class="bc-desktop-logbook--year" colspan={columnsNow.length}>
                  {#if yearLine}<span class="bc-desktop-logbook--year-title">{t('desktop.yearLine', { year: yearLine.year, dives: t('trip.dives', { n: yearLine.count }) })}</span>{/if}
                </th>
              </tr>
            {/if}
          </thead>
          <tbody>
            {#if padTop}<tr class="bc-desktop-logbook--pad" aria-hidden="true"><td colspan={columnsNow.length} style:height="{padTop}px"></td></tr>{/if}
            {#each visibleRows as row, at (row.type === 'trip' ? `t${row.id}` : `d${row.dive.id}`)}
              {#if row.type === 'trip'}
                {@const text = tripText(row)}
                <tr class="bc-desktop-logbook--trip" class:bc-desktop-logbook--folded={!row.expanded} class:bc-desktop-logbook--trip-selected={desk.trip === row.id} aria-rowindex={windowStart + at + 2}>
                  <td colspan={columnsNow.length}>
                    <button
                      type="button"
                      aria-expanded={row.expanded}
                      onclick={(e) => {
                        // The chevron folds the trip; the rest of the row opens its page beside the table (task 2026-11-19-297).
                        if (/** @type {HTMLElement} */ (e.target).closest('.bc-desktop-logbook--chevron')) desk.collapsed = { ...desk.collapsed, [row.id]: row.expanded };
                        else desk.trip = row.id;
                      }}
                      onkeydown={(e) => {
                        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                          e.preventDefault();
                          desk.collapsed = { ...desk.collapsed, [row.id]: e.key === 'ArrowLeft' };
                        }
                      }}
                    >
                      <span class="bc-desktop-logbook--chevron" class:bc-desktop-logbook--open={row.expanded} aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg></span>
                      <span class="bc-desktop-logbook--trip-icon" aria-hidden="true"><Icon name="trip" size={16} /></span>
                      <span class="bc-desktop-logbook--trip-title">{text.title}</span>
                      <span class="bc-desktop-logbook--trip-range"> · {text.range}</span>
                    </button>
                  </td>
                </tr>
              {:else}
                {@const dive = row.dive}
                <tr
                  class="bc-desktop-logbook--row"
                  class:bc-desktop-logbook--in-trip={row.inTrip}
                  class:bc-desktop-logbook--trip-end={row.inTrip && row.last}
                  class:bc-desktop-logbook--selected={selected.has(dive.id)}
                  class:bc-desktop-logbook--focus={desk.selection.focus === dive.id}
                  aria-selected={selected.has(dive.id)}
                  aria-rowindex={windowStart + at + 2}
                  data-dive={dive.id}
                  onclick={(e) => rowClick(e, dive.id)}
                  ondblclick={() => editSelected()}
                  oncontextmenu={(e) => rowMenu(e, dive.id)}
                >
                  {#each columnsNow as column (column.key)}
                    <td
                      data-col={column.key}
                      class:bc-desktop-logbook--numeric={column.numeric}
                      class:bc-desktop-logbook--strong={column.key === 'maxDepth' || column.key === 'number'}
                    >
                      {#if column.key === 'site'}
                        {#if dive.site}<span class="bc-desktop-logbook--pin" aria-hidden="true"><Icon name="place" size={14} /></span>{dive.site}{:else}<span class="bc-desktop-logbook--no-site"><span class="bc-desktop-logbook--pin" aria-hidden="true"><Icon name="pinOff" size={14} /></span>{t('desktop.noSite')}</span>{/if}
                      {:else if column.key === 'date'}
                        {formatWeekdayDate(dive.date)}<span class="bc-desktop-logbook--time">{' · ' + formatTimeOfDay(dive.date)}</span>
                      {:else if column.key === 'profile'}
                        <span class="bc-desktop-logbook--profile"><ProfileThumbnail profile={dive.profile ?? []} maxDepthMm={dive.maxDepthMm} prefs={logbook.prefs} wide /></span>
                      {:else if column.key === 'buddies'}
                        {#each desk.extras.get(dive.id)?.buddies ?? [] as name, i (i)}<span class="bc-desktop-logbook--buddy"><span class="bc-desktop-logbook--initial" aria-hidden="true">{name.charAt(0).toLocaleUpperCase()}</span>{name}</span>{/each}
                      {:else}{cell(column.key, dive)}{/if}
                    </td>
                  {/each}
                </tr>
              {/if}
            {/each}
            {#if padBottom}<tr class="bc-desktop-logbook--pad" aria-hidden="true"><td colspan={columnsNow.length} style:height="{padBottom}px"></td></tr>{/if}
          </tbody>
        </table>
        {#if !rows.length}<p class="bc-desktop-logbook--state" role="status">{t('desktop.noMatch')}</p>{/if}
      </div>
    {/if}

    <div
      class="bc-desktop-logbook--handle"
      role="separator"
      aria-orientation="vertical"
      aria-label={t('desktop.resize')}
      aria-valuenow={tableNow}
      tabindex="0"
      onpointerdown={startResize}
      onkeydown={resizeKey}
    >
      <span class="bc-desktop-logbook--grip"></span>
    </div>

    {#if dropping}<div class="bc-desktop-logbook--drop" aria-hidden="true"><p>{t('desktop.dropHere')}</p></div>{/if}
    {#if dragging}
      <div class="bc-desktop-logbook--ghost" aria-hidden="true" style:left="{dragging.x - dragging.dx}px" style:top="{dragging.y - 18}px" style:width="{dragging.width}px">
        <span class="bc-desktop-logbook--grip-dots">⠿</span>{dragging.label}
      </div>
      <div class="bc-desktop-logbook--insert" aria-hidden="true" style:left="{dragging.barX - 1.5}px" style:top="{dragging.top}px" style:height="{dragging.height}px"></div>
    {/if}
    <p class="bc-sr-only" aria-live="polite">{announce}</p>
  </div>

  <input type="file" class="bc-sr-only" tabindex="-1" aria-hidden="true" bind:this={fileInput} onchange={fileChosen} />
  {#if logbook.dives.length && !navigation.over}<FabMenu choices={addChoices} onchoose={choose} />{/if}
  {#if moreAt}
    <DesktopContextMenu x={moreAt.x} y={moreAt.y} heading="" entries={moreEntries} onchoose={moreChoose} onclose={() => (moreAt = null)} />
  {/if}
  {#if renumbering}
    <RenumberDialog oncancel={() => (renumbering = false)} ondone={() => (renumbering = false)} />
  {/if}
  {#if menuAt}
    <DesktopContextMenu x={menuAt.x} y={menuAt.y} heading={menuHeading} entries={menuEntries} onchoose={act} onclose={() => (menuAt = null)} />
  {/if}
  {#if emptyMenuAt}
    <DesktopContextMenu x={emptyMenuAt.x} y={emptyMenuAt.y} heading="" entries={emptyMenuEntries} onchoose={(key) => key === 'paste' && pasteDives()} onclose={() => (emptyMenuAt = null)} />
  {/if}
  {#if editingTogether}
    <DesktopEditTogetherDialog ids={[...desk.selection.ids]} openId={null} onclose={() => (editingTogether = false)} />
  {/if}
  {#if exporting}
    <DesktopExportDialog
      selected={logbook.dives.filter((d) => selected.has(d.id))}
      filtered={filter.ids ? [...filter.ids] : null}
      all={logbook.dives.map((d) => d.id)}
      prefs={logbook.prefs}
      whole={exportWhole}
      onclose={() => ((exporting = false), (exportWhole = false))}
    />
  {/if}
  {#if choosingTrip}
    <ChoiceDialog title={t('desktop.menu.addToTrip')} options={tripOptions} value="new" onselect={addToTrip} oncancel={() => (choosingTrip = false)} />
  {/if}
</Page>

<style>
  @layer od.components {
    .bc-desktop-logbook--frame {
      position: relative;
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--bc-background);
    }
    .bc-desktop-logbook--bar {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 64px;
      padding: 8px 8px 8px 12px;
    }
    .bc-desktop-logbook--titles {
      /* Fluid layout: in a narrow pane the search field gives way first, then the title. */
      flex: 1 0.2 auto;
      min-width: 0;
    }
    .bc-desktop-logbook--title {
      margin: 0;
      font-family: var(--bc-title-font);
      font-size: 22px;
      font-weight: 500;
      color: var(--bc-text);
    }
    .bc-desktop-logbook--summary {
      margin: 2px 0 0;
      font-size: 13px;
      color: var(--bc-text-2);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .bc-desktop-logbook--search {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: 0 1 300px;
      min-width: 150px;
      height: 44px;
      padding: 0 12px 0 16px;
      border-radius: 22px;
      background: var(--bc-surface-container);
      color: var(--bc-text-2);
    }
    .bc-desktop-logbook--search input {
      flex: 1;
      min-width: 0;
      border: 0;
      background: none;
      font: inherit;
      font-size: 15px;
      color: var(--bc-text);
      outline: none;
    }
    .bc-desktop-logbook--hint {
      padding: 1px 6px;
      border: 1px solid var(--bc-separator);
      border-radius: 4px;
      font: inherit;
      font-size: 11px;
      color: var(--bc-text-2);
    }
    .bc-desktop-logbook--icon-button {
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
    .bc-desktop-logbook--icon-button:hover {
      background: color-mix(in srgb, var(--bc-text) 8%, transparent);
    }
    .bc-desktop-logbook--columns-anchor {
      position: relative;
    }
    .bc-desktop-logbook--columns-scrim {
      position: fixed;
      inset: 0;
      z-index: 12999;
    }
    .bc-desktop-logbook--columns {
      position: absolute;
      top: 48px;
      right: 0;
      z-index: 13000;
      min-width: 240px;
      padding: 8px 0;
      border-radius: 12px;
      background: var(--bc-surface);
      box-shadow:
        0 2px 6px 2px rgb(0 0 0 / 0.15),
        0 1px 2px rgb(0 0 0 / 0.3);
    }
    .bc-desktop-logbook--column-choice {
      display: flex;
      align-items: center;
      gap: 12px;
      height: 40px;
      padding: 0 16px;
      font-size: 15px;
      color: var(--bc-text);
      cursor: pointer;
    }
    .bc-desktop-logbook--column-choice:hover {
      background: color-mix(in srgb, var(--bc-text) 8%, transparent);
    }
    .bc-desktop-logbook--fixed {
      color: var(--bc-text-2);
      cursor: default;
    }
    .bc-desktop-logbook--scroll {
      flex: 1;
      overflow: auto;
      /* The spacer rows change height as the window moves: the browser must not shift the scroll to follow them. */
      overflow-anchor: none;
      padding-right: 9px;
    }
    /* The table (task 2026-11-15-193): no lines, 48 dp rows 2 dp apart, the selected row a pill. */
    .bc-desktop-logbook--table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0 2px;
      table-layout: fixed;
      font-size: 14px;
      color: var(--bc-text);
    }
    .bc-desktop-logbook--head {
      position: sticky;
      top: 0;
      z-index: 1;
      height: 36px;
      padding: 0;
      background: var(--bc-background);
      /* The 2 px between the header and the year line (or the first row) hides the rows passing under. */
      box-shadow: 0 2px 0 var(--bc-background);
      font-size: 13px;
      font-weight: 500;
      text-align: start;
      color: var(--bc-text-2);
    }
    /* The sticky year line (task 2026-11-18-279): under the header, on the list's background; the rows pass under both. */
    .bc-desktop-logbook--year {
      position: sticky;
      top: 38px;
      z-index: 1;
      height: 30px;
      padding: 0 10px;
      background: var(--bc-background);
      box-shadow: 0 2px 0 var(--bc-background);
      font-size: 13px;
      font-weight: 600;
      text-align: start;
      color: var(--bc-text-2);
    }
    .bc-desktop-logbook--plain button {
      cursor: default;
    }
    .bc-desktop-logbook--head button {
      width: 100%;
      height: 100%;
      padding: 0 10px;
      border: 0;
      background: none;
      font: inherit;
      color: inherit;
      text-align: inherit;
      white-space: nowrap;
      cursor: pointer;
    }
    .bc-desktop-logbook--head button:hover {
      color: var(--bc-text);
    }
    /* The edge to drag (task 181): 8 px wide on the header's right side, a thin line on hover and focus. */
    .bc-desktop-logbook--edge {
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      width: 8px;
      cursor: col-resize;
      outline: none;
    }
    .bc-desktop-logbook--edge::after {
      content: '';
      position: absolute;
      top: 8px;
      bottom: 8px;
      left: 3px;
      width: 2px;
      border-radius: 1px;
      background: transparent;
    }
    .bc-desktop-logbook--edge:hover::after,
    .bc-desktop-logbook--edge:focus-visible::after {
      background: var(--bc-outline);
    }
    .bc-desktop-logbook--arrow {
      margin-inline-start: 4px;
    }
    [data-col='number'] {
      width: 56px;
    }
    [data-col='date'] {
      width: 188px;
    }
    [data-col='profile'] {
      width: 96px;
    }
    [data-col='maxDepth'] {
      width: 84px;
    }
    [data-col='duration'] {
      width: 76px;
    }
    [data-col='buddies'] {
      width: 116px;
    }
    [data-col='waterTemp'],
    [data-col='airTemp'],
    [data-col='meanDepth'],
    [data-col='rating'] {
      width: 84px;
    }
    .bc-desktop-logbook--numeric {
      text-align: end;
      font-variant-numeric: tabular-nums;
    }
    .bc-desktop-logbook--row {
      height: 48px;
      cursor: pointer;
    }
    .bc-desktop-logbook--row td {
      padding: 0 10px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .bc-desktop-logbook--row td:first-child {
      border-radius: 12px 0 0 12px;
    }
    .bc-desktop-logbook--row td:last-child {
      border-radius: 0 12px 12px 0;
    }
    .bc-desktop-logbook--row td[data-col='number'] {
      font-weight: 600;
    }
    .bc-desktop-logbook--row td[data-col='site'] {
      font-weight: 500;
    }
    .bc-desktop-logbook--time {
      font-size: 12px;
      color: var(--bc-text-2);
    }
    .bc-desktop-logbook--profile {
      display: inline-flex;
      vertical-align: middle;
    }
    .bc-desktop-logbook--row:hover td {
      background: color-mix(in srgb, var(--bc-text) 4%, transparent);
    }
    /* Selection (task 2026-11-18-279): pale blue, with the number and the site in blue. */
    .bc-desktop-logbook--selected td,
    .bc-desktop-logbook--selected:hover td {
      background: var(--bc-table-selected);
    }
    .bc-desktop-logbook--selected td[data-col='number'],
    .bc-desktop-logbook--selected td[data-col='site'] {
      color: var(--bc-on-table-selected);
    }
    @media (hover: hover) and (pointer: fine) {
      .bc-desktop-logbook--selected:hover td {
        box-shadow: inset 0 0 0 100vmax color-mix(in srgb, var(--bc-on-table-selected) 8%, transparent);
      }
      .bc-desktop-logbook--in-trip.bc-desktop-logbook--selected:hover td {
        box-shadow:
          inset 0 0 0 100vmax color-mix(in srgb, var(--bc-on-table-selected) 8%, transparent),
          0 2px 0 var(--bc-surface);
      }
    }
    .bc-desktop-logbook--pin {
      display: inline-flex;
      vertical-align: -2px;
      margin-inline-end: 6px;
      color: var(--bc-text-2);
    }
    .bc-desktop-logbook--no-site {
      font-style: italic;
      font-weight: 400;
      color: var(--bc-text-2);
    }
    .bc-desktop-logbook--strong {
      font-weight: 700;
    }
    /* A trip is a white card of 20 px corners: its header, then its dives (their gaps filled in white). */
    .bc-desktop-logbook--in-trip:not(.bc-desktop-logbook--selected) td {
      background: var(--bc-surface);
    }
    .bc-desktop-logbook--in-trip td {
      box-shadow: 0 2px 0 var(--bc-surface);
    }
    .bc-desktop-logbook--in-trip td:first-child,
    .bc-desktop-logbook--in-trip td:last-child {
      border-radius: 0;
    }
    .bc-desktop-logbook--trip-end td {
      box-shadow: none;
    }
    .bc-desktop-logbook--trip-end td:first-child {
      border-radius: 0 0 0 20px;
    }
    .bc-desktop-logbook--trip-end td:last-child {
      border-radius: 0 0 20px 0;
    }
    .bc-desktop-logbook--in-trip:not(.bc-desktop-logbook--selected):hover td {
      background: color-mix(in srgb, var(--bc-text) 4%, var(--bc-surface));
    }
    .bc-desktop-logbook--buddy {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-inline-end: 8px;
    }
    .bc-desktop-logbook--initial {
      display: inline-grid;
      place-items: center;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: var(--bc-buddy-badge);
      color: var(--bc-text);
      font-size: 11px;
      font-weight: 600;
    }
    /* The windowing counts on these heights (ROW_HEIGHT and TRIP_HEIGHT in the script). */
    .bc-desktop-logbook--trip {
      height: 44px;
    }
    .bc-desktop-logbook--trip td {
      padding: 0;
      background: var(--bc-surface);
      border-radius: 20px 20px 0 0;
      box-shadow: 0 2px 0 var(--bc-surface);
    }
    .bc-desktop-logbook--trip-selected td {
      background: var(--bc-selected-container);
      box-shadow: 0 2px 0 var(--bc-selected-container);
    }
    .bc-desktop-logbook--folded td {
      border-radius: 20px;
      box-shadow: none;
    }
    .bc-desktop-logbook--pad td {
      padding: 0;
    }
    .bc-desktop-logbook--trip button {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      height: 44px;
      padding: 0 16px;
      border: 0;
      border-radius: inherit;
      background: none;
      font: inherit;
      color: var(--bc-text);
      text-align: start;
      cursor: pointer;
    }
    .bc-desktop-logbook--trip-icon {
      display: inline-flex;
      color: var(--bc-text-2);
    }
    .bc-desktop-logbook--chevron {
      display: inline-flex;
      color: var(--bc-text-2);
      transform: rotate(-90deg);
      transition: transform 150ms;
    }
    .bc-desktop-logbook--open {
      transform: none;
    }
    .bc-desktop-logbook--trip-title {
      font-weight: 500;
    }
    .bc-desktop-logbook--trip-range {
      color: var(--bc-text-2);
    }
    .bc-desktop-logbook--state {
      padding: 48px 24px;
      text-align: center;
      color: var(--bc-text-2);
    }
    .bc-desktop-logbook--filled {
      height: 40px;
      padding: 0 24px;
      border: 0;
      border-radius: 20px;
      background: var(--bc-primary-action);
      color: var(--bc-on-primary-action);
      font: inherit;
      cursor: pointer;
    }
    /* 9 dp handle, a 1 dp line, a 4 × 32 dp grip (task 2026-11-15-169). */
    .bc-desktop-logbook--handle {
      position: absolute;
      top: 64px;
      right: 0;
      bottom: 0;
      width: 9px;
      cursor: col-resize;
      outline: none;
    }
    .bc-desktop-logbook--handle::before {
      content: '';
      position: absolute;
      inset: 0 4px;
      background: var(--bc-separator);
    }
    .bc-desktop-logbook--grip {
      position: absolute;
      top: 50%;
      left: 2.5px;
      width: 4px;
      height: 32px;
      margin-top: -16px;
      border-radius: 2px;
      background: var(--bc-outline);
    }
    .bc-desktop-logbook--handle:focus-visible .bc-desktop-logbook--grip,
    .bc-desktop-logbook--handle:hover .bc-desktop-logbook--grip {
      background: var(--bc-text);
    }
    /* Moving a column (task 181): the slot it leaves, the floating header, the insertion bar. */
    .bc-desktop-logbook--head {
      user-select: none;
    }
    .bc-desktop-logbook--slot {
      background: var(--bc-trip-band);
      color: transparent;
    }
    .bc-desktop-logbook--ghost {
      position: fixed;
      z-index: 14000;
      display: flex;
      align-items: center;
      gap: 6px;
      height: 36px;
      padding: 0 10px;
      border-radius: 8px;
      background: var(--bc-surface);
      box-shadow: 0 4px 12px rgb(0 0 0 / 0.2);
      transform: rotate(-2deg);
      font-size: 13px;
      font-weight: 500;
      color: var(--bc-text);
      pointer-events: none;
    }
    .bc-desktop-logbook--grip-dots {
      color: var(--bc-text-2);
    }
    .bc-desktop-logbook--insert {
      position: fixed;
      z-index: 13999;
      width: 3px;
      background: var(--bc-on-table-selected);
      pointer-events: none;
    }
    .bc-desktop-logbook--insert::before {
      content: '';
      position: absolute;
      top: 0;
      left: -3.5px;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--bc-on-table-selected);
    }
    .bc-desktop-logbook--columns-divider {
      height: 1px;
      margin: 8px 0;
      background: var(--bc-separator);
    }
    .bc-desktop-logbook--columns-reset {
      width: 100%;
      border: 0;
      background: none;
      font: inherit;
      text-align: start;
    }
    .bc-desktop-logbook--drop {
      position: fixed;
      inset: 0;
      z-index: 12000;
      display: grid;
      place-items: center;
      background: color-mix(in srgb, var(--bc-background) 85%, transparent);
      border: 3px dashed var(--bc-selected);
      font-size: 20px;
      color: var(--bc-text);
      pointer-events: none;
    }
    .bc-desktop-logbook--drop-note {
      font-size: 14px;
    }

    /* Mouse: the Material 3 hover layer, 8 % of the content colour over the background. */
    @media (hover: hover) and (pointer: fine) {
      .bc-desktop-logbook--trip button {
        transition: box-shadow 120ms linear;
      }
      .bc-desktop-logbook--trip button:not(:disabled):hover {
        box-shadow: inset 0 0 0 100vmax color-mix(in srgb, currentColor 8%, transparent);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .bc-desktop-logbook--trip button {
        transition: none;
      }
    }
  }
</style>
