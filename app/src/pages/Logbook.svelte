<script>
  // @ts-check
  // Logbook screen (spec, sections 3 to 6, "Carnet"): list by trip, search,
  // free filter, dive count, sync status, "+" button, and the states: loading,
  // error, empty logbook, offline with pending changes, sync conflict. A log can hold thousands of dives:
  // the list is virtual, only the rows near the screen are in the document.
  import { onDestroy, tick, untrack } from 'svelte';
  import { diveUrl } from '../lib/dive-id.js';
  import { currentDiveId, currentDiveIds, onDiveIdsRenumbered } from '../lib/dive-ids.js';
  import { Page, Navbar, NavRight, Link, Searchbar, List, ListItem, Block, Button, Popover, f7, theme } from 'framework7-svelte';
  import { showSnackbar } from '../lib/snackbar.js';
  import SyncStatus from '../components/SyncStatus.svelte';
  import SyncFailureRow from '../components/SyncFailureRow.svelte';
  import SyncPill from '../components/SyncPill.svelte';
  import DiveRow from '../components/DiveRow.svelte';
  import TripRow from '../components/TripRow.svelte';
  import BandBackdrop from '../components/BandBackdrop.svelte';
  import Icon from '../components/Icon.svelte';
  import DecorativeProfile from '../components/DecorativeProfile.svelte';
  import FabMenu from '../components/FabMenu.svelte';
  import { scanQr } from '../lib/qr-receive.svelte.js';
  import { benthicPlusSubscriber } from '../lib/benthic-plus-state.svelte.js';
  import FloatingToolbar from '../components/FloatingToolbar.svelte';
  import MenuItem from '../components/MenuItem.svelte';
  import { enterFromMenu } from '../lib/first-launch.svelte.js';
  import MenuButton from '../components/MenuButton.svelte';
  import AccountAvatar from '../components/AccountAvatar.svelte';
  import SectionBand from '../components/SectionBand.svelte';
  import ReleaseEmptyLogbook from '../components/ReleaseEmptyLogbook.svelte';
  import { isRelease } from '../lib/edition.js';
  import { deviceStore } from '../lib/device-store.js';
  import FlightBanner from '../components/FlightBanner.svelte';
  import ActiveFilter from '../components/ActiveFilter.svelte';
  import RenumberDialog from '../components/RenumberDialog.svelte';
  import RenumberFromDialog from '../components/RenumberFromDialog.svelte';
  import RenameLogbook from '../components/RenameLogbook.svelte';
  import ExportSheet from '../components/ExportSheet.svelte';
  import { exportDives } from '../lib/share.js';
  import { replaceEligibility, replacementFromFile } from '../lib/replace-logbook.js';
  import { startReplace } from '../lib/replace-logbook-ui.js';
  import { importErrorKey } from '../lib/deep-link.js';
  import CsvImportDialog from '../components/CsvImportDialog.svelte';
  import { pickCsvFiles } from '../lib/csv-import.js';
  import { guardedAdd } from '../lib/demo.svelte.js';
  import { logbook, loadLogbook, importFiles, importCsvFile, undoLastChange, reopenConflict, deleteDives, mergeDives, tripChange } from '../lib/logbook.svelte.js';
  import { canMerge, mergeErrorKey } from '../lib/multi-dive.js';
  import { conflictDiveCount } from '../lib/conflict-choices.js';
  import { confirmAction } from '../lib/dialogs.js';
  import { shownTrip } from '../lib/trip-shown.js';
  import { filter, loadOptions, applyFilter, isEmpty } from '../lib/filter.svelte.js';
  import ValidationDialog from '../components/ValidationDialog.svelte';
  import { layout, deviceKind, desktopApp } from '../lib/layout.svelte.js';
  import FoldingSearch from '../components/FoldingSearch.svelte';
  import { deviceKey } from '../lib/first-launch.js';
  import { navigation } from '../lib/navigation.svelte.js';
  import { startup } from '../lib/startup.svelte.js';
  import { formatDateTime, formatDate } from '../lib/format.js';
  import { t } from '../lib/i18n.js';
  import { groupByMonth, stickyMonth } from '../lib/carnet-months.js';
  import { buildRows } from '../lib/logbook-cards.js';
  import { logbookSummary } from '../lib/logbook-summary.js';
  import { mark } from '../lib/perf.js';
  import { buildSnapshot, saveSnapshot } from '../lib/snapshot.js';
  import { firstDiveOf, orderOf, rememberFirstDetail, seedStartDetail } from '../lib/detail-snapshot.js';
  import { keepDive, loadDive } from '../lib/dive-preload.js';
  import { offerUndo } from '../lib/undo.js';
  import { importProgress } from '../lib/import-progress.svelte.js';
  import { isCancelled } from '../lib/import-progress.js';
  import { longPressFeedback } from '../lib/haptics.js';
  import { Capacitor } from '@capacitor/core';
  import { BenthicCore } from 'benthic-core';

  /** @typedef {import('benthic-core').Dive} Dive */
  /**
   * @typedef {{ type: 'dive', key: string, dive: Dive }
   *   | { type: 'trip', key: string, location: string, dives: Dive[] }} Entry
   */
  /**
   * A row of the virtual list. `kind` groups rows of the same layout, hence of
   * the same probable height.
   * @typedef {{ kind: 'dive'|'inTrip', key: string, index: number, month: string, dive: Dive, tripFirst?: boolean, tripLast?: boolean, cardFirst?: boolean, cardLast?: boolean, gapBefore?: boolean }
   *   | { kind: 'trip', key: string, index: number, month: string, id: number, location: string, dives: Dive[], cardFirst?: boolean, cardLast?: boolean, gapBefore?: boolean }
   *   | { kind: 'year', key: string, index: number, month: string, year: number }} Row
   */

  /** @type {{ f7router: any }} */
  let { f7router } = $props();

  /** Download from the dive computer: Android only for now (Bluetooth). */
  const downloadRoute = Capacitor.getPlatform() === 'android' ? '/download' : '/add/download';

  let query = $state('');
  /** Expanded trips, by trip identifier of the current load. */
  let expanded = $state(/** @type {Record<number, boolean>} */ ({}));
  /** The trip just expanded: its dives slide into place (DiveRow `appear`). */
  let appearing = $state(0);
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let appearTimer;

  /** @param {number} id */
  function toggleTrip(id) {
    if (!id) return;
    if (!isOpen(id)) {
      appearing = id;
      clearTimeout(appearTimer);
      // Only while it opens: rows scrolled into view later do not slide.
      appearTimer = setTimeout(() => (appearing = 0), 400);
    }
    expanded[id] = !isOpen(id);
  }

  const all = $derived([...logbook.dives].sort((a, b) => b.date.localeCompare(a.date)));
  /** The dives that match the free filter (all of them without one). */
  const sorted = $derived(filter.ids ? all.filter((d) => filter.ids?.has(d.id)) : all);
  const filtered = $derived(!!filter.ids);

  // The top of the list is kept for the next start (lib/snapshot.js), once the
  // dives are loaded and the screen is at rest.
  $effect(() => {
    if (logbook.loading || logbook.error) return;
    const list = all;
    const prefs = logbook.prefs;
    const timer = setTimeout(() => {
      saveSnapshot(list.length ? buildSnapshot(list, $state.snapshot(prefs)) : null);
      // Beside the list, the pane shows the first dive: its detail is kept too (lib/detail-snapshot.js).
      const first = layout.split ? firstDiveOf(list) : null;
      if (first && navigation.dive === String(first.id)) rememberFirstDetail(first, orderOf(false), loadDive).catch((e) => console.warn('Keeping the detail', e));
    }, 1500);
    return () => clearTimeout(timer);
  });

  /**
   * A tap on the start snapshot, kept until the real list is there: the
   * snapshot's dive identifiers are of the previous load, so the dive is
   * found again by its date and number.
   * @type {{ date: string, number: number, expand: boolean }|null}
   */
  let heldTap = null;

  /** @param {MouseEvent} e */
  function holdTap(e) {
    e.preventDefault();
    e.stopPropagation();
    const target = /** @type {HTMLElement} */ (e.target);
    const preview = logbook.preview;
    if (!preview) return;
    const flat = preview.entries.flatMap((entry) => (entry.type === 'trip' ? entry.dives : [entry.dive]));
    const tripRow = /** @type {HTMLElement|null} */ (target.closest('li.bc-trip-row'));
    const diveLink = /** @type {HTMLElement|null} */ (target.closest('a[data-dive]'));
    const dive = tripRow ? flat.find((d) => d.trip?.id === Number(tripRow.dataset.trip)) : flat.find((d) => String(d.id) === diveLink?.dataset.dive);
    if (!dive) return;
    heldTap = { date: dive.date, number: dive.number, expand: !!tripRow && !!target.closest('.bc-trip-row--expand') };
  }

  // The held tap is replayed on the real row once the dives are loaded.
  $effect(() => {
    if (logbook.loading || !heldTap) return;
    const tap = heldTap;
    heldTap = null;
    const dive = logbook.dives.find((d) => d.date === tap.date && d.number === tap.number);
    if (!dive) return;
    tick().then(() => {
      // At start, only the logbook holds links to dives and trips.
      const href = dive.trip ? `/trips/${dive.trip.id}` : diveUrl(dive);
      const link = /** @type {HTMLElement|null} */ (document.querySelector(`a[href="${href}"]`));
      /** @type {HTMLElement|null} */ (tap.expand ? link?.querySelector('.bc-trip-row--expand') : link)?.click();
    });
  });

  /**
   * The Logbook is the master route of a master-detail view: framework7-svelte
   * does not render it as the view's first page but loads it through the
   * router, and Framework7 then appends it after the end anchor of the
   * view's page list. Every later page, rendered by Svelte before that anchor,
   * then no longer follows the Logbook: Framework7 moves it to the end too,
   * out of Svelte's reach, and going back leaves it in the view (a frozen
   * page, a second Logbook). Put back before the anchor, the Logbook is
   * followed by the pages Svelte adds, which stay where Svelte put them.
   * @param {any} page Framework7's page
   */
  function keepInSvelteRange(page) {
    /** @type {HTMLElement} */
    const el = page.el;
    let anchor = el.previousSibling;
    while (anchor && anchor.nodeType === Node.TEXT_NODE) anchor = anchor.previousSibling;
    if (anchor && anchor.nodeType === Node.COMMENT_NODE && el.nextSibling === null) el.parentNode?.insertBefore(el, anchor);
  }

  // --- Selection mode: a long press on a dive shows a check box before every
  // dive, the pressed one checked. A tap then checks or unchecks a dive; the
  // ✕ of the top bar, Android's Back or unchecking the last dive leaves it.

  let selecting = $state(false);
  /** Checked dives, by identifier of the current load. */
  let checked = $state(/** @type {Record<number, boolean>} */ ({}));
  // The core read the log again (a change from another device): the checked dives keep their new ids, the ones deleted leave.
  $effect(() =>
    onDiveIdsRenumbered(() => {
      /** @type {Record<number, boolean>} */
      const moved = {};
      for (const [id, on] of Object.entries(untrack(() => checked))) {
        const now = on ? currentDiveId(Number(id)) : null;
        if (now !== null) moved[now] = true;
      }
      checked = moved;
      if (selecting && !Object.keys(moved).length) endSelection();
    }),
  );
  const checkedCount = $derived(Object.values(checked).filter(Boolean).length);
  const LONG_PRESS_MS = 500;

  /** @param {number} id */
  function startSelection(id) {
    checked = { [id]: true };
    selecting = true;
    logbook.checkedDiveIds = [id];
    closeMenu();
  }

  function endSelection() {
    if (selecting) closeMenu();
    selecting = false;
    checked = {};
    logbook.checkedDiveIds = [];
  }

  /** The ⋮ menu is placed for its items when it opens: it closes when the selection starts or ends. */
  function closeMenu() {
    f7.popover.close('.bc-logbook-menu', false);
  }

  /** @param {number} id */
  function toggleChecked(id) {
    checked[id] = !checked[id];
    if (!Object.values(checked).some(Boolean)) endSelection();
    else logbook.checkedDiveIds = checkedIds;
  }

  const checkedIds = $derived(Object.keys(checked).filter((id) => checked[Number(id)]).map(Number));

  /** The dives of a trip. @param {number} tripId */
  const diveIdsOfTrip = (tripId) => logbook.dives.filter((d) => d.trip?.id === tripId).map((d) => d.id);

  /** The trips all of whose dives are checked: selecting a trip checks its dives. */
  const checkedTrips = $derived.by(() => {
    /** @type {Set<number>} */
    const whole = new Set(logbook.dives.flatMap((d) => (d.trip && checked[d.id] ? [d.trip.id] : [])));
    for (const d of logbook.dives) if (d.trip && !checked[d.id]) whole.delete(d.trip.id);
    return [...whole];
  });

  /** A long press on a trip, or a tap on it while selecting. @param {number} tripId */
  function selectTrip(tripId) {
    const ids = diveIdsOfTrip(tripId);
    if (!ids.length) return;
    if (!selecting) startSelection(ids[0]);
    for (const id of ids) checked[id] = true;
    logbook.checkedDiveIds = checkedIds;
  }

  /** @param {number} tripId */
  function toggleTripChecked(tripId) {
    const ids = diveIdsOfTrip(tripId);
    const all = ids.every((id) => checked[id]);
    for (const id of ids) checked[id] = !all;
    if (!Object.values(checked).some(Boolean)) endSelection();
    else logbook.checkedDiveIds = checkedIds;
  }

  /** "Supprimer ce voyage": the trip goes, its dives stay in the logbook. One undoable step. */
  function deleteCheckedTrips() {
    const n = checkedTrips.length;
    const diveIds = checkedTrips.flatMap(diveIdsOfTrip);
    confirmAction({
      title: t('logbook.deleteTripTitle', { n }),
      text: t('logbook.deleteTripText', { n }),
      action: t('logbook.deleteTripAction'),
      onConfirm: async () => {
        try {
          await tripChange({ action: 'remove', diveIds });
          endSelection();
          offerUndo(t('logbook.tripDeleted', { n }));
        } catch (e) {
          changeFailed(e);
        }
      },
    });
  }

  /**
   * The trips just above and below the checked dives, when these are dives
   * outside trips that follow one another in the list: "Add to the trip
   * above / below" (the list goes from the most recent to the oldest).
   */
  const neighbourTrips = $derived.by(() => {
    /** @type {{ above: number|null, below: number|null }} */
    const none = { above: null, below: null };
    if (!checkedIds.length) return none;
    const positions = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (e.type === 'trip') {
        if (e.dives.some((d) => checked[d.id])) return none;
      } else if (checked[e.dive.id]) positions.push(i);
    }
    if (positions.length !== checkedIds.length) return none;
    const first = positions[0];
    const last = positions[positions.length - 1];
    if (last - first + 1 !== positions.length) return none;
    /** @param {Entry|undefined} e */
    const tripOf = (e) => (e?.type === 'trip' ? (e.dives[0].trip?.id ?? null) : null);
    return { above: tripOf(entries[first - 1]), below: tripOf(entries[last + 1]) };
  });

  /** @param {unknown} e */
  function changeFailed(e) {
    const code = String(/** @type {any} */ (e)?.message ?? '');
    console.error('Logbook selection', code);
    f7.dialog
      .create({
        text: code.startsWith('WRITE_LOCKED') ? t('edit.writeLocked') : t('logbook.selectionFailed'),
        buttons: [{ text: t('dialog.ok') }],
      })
      .open();
  }

  function deleteChecked() {
    const ids = checkedIds;
    const n = ids.length;
    confirmAction({
      title: t('logbook.deleteTitle', { n }),
      text: t(logbook.mode === 'git' ? 'logbook.deleteTextGit' : 'logbook.deleteText', { n }),
      action: t('logbook.deleteAction'),
      onConfirm: async () => {
        try {
          await deleteDives(ids);
          endSelection();
          offerUndo(t('logbook.deleted', { n }));
        } catch (e) {
          changeFailed(e);
        }
      },
    });
  }

  async function createTrip() {
    try {
      const result = await tripChange({ action: 'create', diveIds: checkedIds });
      endSelection();
      const id = result.trip?.tripId;
      if (id) expanded[id] = true;
      offerUndo(t('logbook.tripCreated'));
    } catch (e) {
      changeFailed(e);
    }
  }

  /** Checked dives that belong to a trip: "Remove from the trip". */
  /** Checked dives in a trip the logbook shows (lib/trip-shown.js): a trip of one dive is no trip. */
  const checkedInTrip = $derived(logbook.dives.filter((d) => checked[d.id] && shownTrip(d, logbook.dives)).map((d) => d.id));

  async function removeFromTrip() {
    const n = checkedInTrip.length;
    try {
      await tripChange({ action: 'remove', diveIds: checkedInTrip });
      endSelection();
      offerUndo(t('logbook.removedFromTrip', { n }));
    } catch (e) {
      changeFailed(e);
    }
  }

  /** "Fusionner en une plongée": whether the checked dives follow one another, less than an hour apart. */
  const mergeable = $derived(canMerge(logbook.dives, checkedIds).ok);

  /** The checked dives become one dive, which stays checked; no confirmation, « Annuler » undoes it. */
  async function mergeChecked() {
    const n = checkedIds.length;
    if (!mergeable) return;
    try {
      const id = await mergeDives(checkedIds);
      // The list was read again, which left the selection: the merged dive becomes the selection.
      if (id) startSelection(id);
      offerUndo(t('multiDive.merged', { n }));
    } catch (e) {
      console.error('Merge dives', e);
      const code = String(/** @type {any} */ (e)?.message ?? '');
      showSnackbar(t(mergeErrorKey(code)));
    }
  }

  /** "Modifier ensemble…": a full-screen sheet for the checked dives (pages/EditDivesTogether.svelte). */
  function editChecked() {
    f7router.navigate(`/dives/edit-together?ids=${checkedIds.join(',')}`);
  }

  /**
   * "Faire signer les plongées": the checked dives, one validation. A dialog on a tablet and on the desktop (as from one
   * dive), the full screen (pages/Validate.svelte) on the phone.
   */
  let validating = $state(/** @type {number[]|null} */ (null));
  function validateChecked() {
    if (layout.split || layout.desktop) validating = [...checkedIds];
    else f7router.navigate(`/validate?ids=${checkedIds.join(',')}`);
  }

  /** "Renumber the dives" of the menu: Subsurface's Renumber dialog, all the dives. */
  let renumbering = $state(false);
  let renumberFrom = $state(/** @type {number|null} */ (null));

  /**
   * Undo or Redo from the menu, one step each time: the history of this
   * session's changes, as Subsurface's Edit menu.
   * @param {boolean} redo
   */
  async function undoRedo(redo) {
    try {
      await undoLastChange(redo);
      showSnackbar(t(redo ? 'edit.redone' : 'edit.undone'));
    } catch (e) {
      changeFailed(e);
    }
  }

  /** The status row of a conflict left for later. */
  const conflictWaits = $derived(!!logbook.conflict && logbook.conflictLater);
  const offlineWaits = $derived(logbook.sync === 'offline' && logbook.pending > 0);
  /** Not simply up to date: the state goes in a pill of the header band. */
  const showPill = $derived(!logbook.loading && !logbook.error && (conflictWaits || !!logbook.syncFailure || offlineWaits));

  const stoppedText = $derived.by(() => {
    const dives = conflictDiveCount(logbook.conflict);
    return dives ? t('conflict.stoppedDives', { n: dives }) : t('conflict.stopped');
  });

  let exporting = $state(false);
  let exportWhole = $state(false);

  /**
   * Export the whole logbook or the checked dives, then open the system's share sheet.
   * @param {'benthic'|'uddf'|'ssrf'|'csv'|'csvProfiles'|'pdf'} format @param {boolean} anonymize @param {boolean} [showName] « Mon nom dans l’en-tête » (PDF) @param {boolean} [withMedia] « Inclure les photos et vidéos » (.benthic)
   */
  async function exportFromSheet(format, anonymize, showName = true, withMedia = true) {
    try {
      if (format === 'benthic') {
        // The archive of « Télécharger mes données » (lib/full-export.js), through the share sheet.
        const { buildExport, deliverExport } = await import('../lib/full-export.js');
        const { file } = await buildExport({ withMedia, logbookName: deviceStore.getItem('bc.logbookName') || t('welcomeSteps.defaultName') });
        await deliverExport(file);
        return;
      }
      const ids = exportWhole ? logbook.dives.map((d) => d.id) : checkedIds;
      await exportDives(ids, format, anonymize, logbook.prefs, ids.length > 0 && ids.length === logbook.dives.length, showName);
    } catch (e) {
      // Closing the system's share sheet without choosing is not an error.
      if (/cancel/i.test(String(/** @type {any} */ (e)?.message ?? ''))) return;
      console.error('Export dives', e);
      showSnackbar(t('export.failed'));
    }
  }

  /** @param {number} tripId */
  async function addToTrip(tripId) {
    const n = checkedIds.length;
    try {
      await tripChange({ action: 'add', tripId, diveIds: checkedIds });
      endSelection();
      expanded[tripId] = true;
      offerUndo(t('logbook.addedToTrip', { n }));
    } catch (e) {
      changeFailed(e);
    }
  }

  // Items of the open menu come and go with the dives checked (Add to the
  // trip above or below): it is placed again for its new size.
  $effect(() => {
    neighbourTrips;
    checkedInTrip.length;
    tick().then(() => /** @type {any} */ (f7.popover.get('.bc-logbook-menu'))?.resize());
  });

  // A new load gives new identifiers: the selection is left.
  $effect(() => {
    logbook.dives;
    untrack(endSelection);
  });

  // The long press and the taps of the selection mode, on the list itself
  // (its rows come and go with the scrolling).
  $effect(() => {
    const el = listEl;
    if (!el) return;
    /** @type {ReturnType<typeof setTimeout>|undefined} */
    let timer;
    let startX = 0;
    let startY = 0;
    /** The press became a long press: the click that follows is dropped. */
    let pressed = false;
    const cancel = () => clearTimeout(timer);
    /** After a long press on a dive: the dives a move of the finger would drag. */
    /** @type {number[]|null} */
    let dragIds = null;
    /** @type {HTMLElement|null} */
    let dragRow = null;

    /** @param {Event} e */
    const diveOf = (e) => /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('a.bc-dive-row--link'));

    /** The trip a long press is on: let go, it is selected. */
    let pressedTrip = 0;

    /** @param {PointerEvent} e */
    function down(e) {
      pressed = false;
      dragIds = null;
      pressedTrip = 0;
      const target = /** @type {HTMLElement} */ (e.target);
      const tripRow = /** @type {HTMLElement|null} */ (target.closest('li.bc-trip-row'));
      if (tripRow && !target.closest('.bc-trip-row--expand')) {
        startX = e.clientX;
        startY = e.clientY;
        timer = setTimeout(() => {
          // Selection mode starts here, finger still down; the lift is dropped by `pressed`.
          pressed = true;
          pressedTrip = Number(tripRow.dataset.trip) || 0;
          if (pressedTrip) {
            selectTrip(pressedTrip);
            longPressFeedback();
          }
        }, LONG_PRESS_MS);
        return;
      }
      const row = diveOf(e);
      if (!row) return;
      startX = e.clientX;
      startY = e.clientY;
      const id = Number(row.dataset.dive);
      timer = setTimeout(() => {
        // A long press lifts the row and selects the dive at once, finger still
        // down (selection mode, or one more check in it); the lift is dropped
        // (`pressed`: no toggle, no click). The finger moving afterwards drags
        // it to a trip or out of its own, as on Android's home screen. A checked
        // dive takes the other checked dives with it, as in Gmail.
        pressed = true;
        dragIds = checked[id] ? Object.keys(checked).filter((k) => checked[Number(k)]).map(Number) : [id];
        dragRow = row.closest('li');
        if (!selecting) startSelection(id);
        else {
          checked[id] = true;
          logbook.checkedDiveIds = checkedIds;
        }
        dragRow?.classList.add('bc-logbook--drag-lift');
        longPressFeedback();
      }, LONG_PRESS_MS);
    }
    /** @param {PointerEvent} e */
    function move(e) {
      if (Math.hypot(e.clientX - startX, e.clientY - startY) > 10) cancel();
    }
    /**
     * On the window, in the capture phase: Framework7 follows the links from
     * the document's own capture phase, which would open the dive.
     * @param {MouseEvent} e
     */
    function click(e) {
      if (!el?.contains(/** @type {Node} */ (e.target))) return;
      // While another screen slides in over the Logbook, its rows are still
      // visible: a tap then would open a dive from that screen, which
      // Framework7's master-detail routing turns into a second Logbook.
      // Beside a detail (tablet), the list stays in use while it is not "current".
      const listPage = el.closest('.page');
      if (!listPage?.classList.contains('page-current') && !listPage?.parentElement?.querySelector(':scope > .page-current.page-master-detail')) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (pressed) {
        pressed = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      // A trip's arrow expands it in place (accordion), without opening it:
      // its button sits in the row's link, which Framework7 would follow.
      const arrow = /** @type {HTMLElement} */ (e.target).closest('.bc-trip-row .bc-trip-row--expand');
      if (arrow) {
        e.preventDefault();
        e.stopPropagation();
        toggleTrip(Number(/** @type {HTMLElement|null} */ (arrow.closest('li'))?.dataset.trip));
        return;
      }
      if (!selecting) return;
      // In selection mode a dive or a trip is checked, not opened.
      const trip = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('li.bc-trip-row'));
      if (trip) {
        toggleTripChecked(Number(trip.dataset.trip));
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const row = diveOf(e);
      if (!row) return;
      toggleChecked(Number(row.dataset.dive));
      e.preventDefault();
      e.stopPropagation();
    }
    /** @param {Event} e The WebView's own long-press menu is not wanted. */
    const menu = (e) => diveOf(e) && e.preventDefault();

    // --- Dragging dives after a long press: dropped on a trip (its row or one
    // of its dives), they join it; dropped on a dive in no trip, they leave
    // theirs. A floating copy of the row follows the finger with what the
    // drop would do; the list scrolls near its top and bottom.
    let dragging = false;
    let touchX = 0;
    let touchY = 0;
    /** @type {HTMLElement|null} */
    let ghost = null;
    /** @type {HTMLElement|null} */
    let label = null;
    /** @type {{ action: 'add', tripId: number } | { action: 'remove' } | null} */
    let target = null;
    let scrolling = 0;

    /** @param {number} id */
    const diveById = (id) => logbook.dives.find((d) => d.id === id);

    /**
     * As Gmail's drag: a small raised chip follows the finger, above it so the
     * row under it stays visible; it names the dive's site (or says how many
     * dives when the checked ones move together), then what the drop would do.
     */
    function beginDrag() {
      if (!dragRow) return;
      dragging = true;
      ghost = document.createElement('div');
      ghost.className = 'bc-logbook--drag-chip';
      ghost.innerHTML =
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5.5C6.5 4.5 9.5 4.5 12 6c2.5-1.5 5.5-1.5 8-.5v13c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5zM12 6v13.5"/></svg>';
      label = document.createElement('span');
      ghost.append(label);
      document.body.append(ghost);
      dragRow.classList.add('bc-logbook--drag-source');
      updateTarget();
      placeGhost();
      autoScroll();
    }

    function placeGhost() {
      if (!ghost) return;
      const width = ghost.offsetWidth;
      const left = Math.min(Math.max(8, touchX - width / 2), innerWidth - width - 8);
      ghost.style.left = `${left}px`;
      ghost.style.top = `${touchY - 72}px`;
    }

    /**
     * A horizontal bar on the edge of the row under the finger, the nearest
     * one, while a drop there would do something.
     * @param {HTMLElement|null} row
     */
    function placeDropLine(row) {
      let line = /** @type {HTMLElement|null} */ (document.querySelector('.bc-logbook--drop-line'));
      if (!row) {
        line?.remove();
        return;
      }
      if (!line) {
        line = document.createElement('div');
        line.className = 'bc-logbook--drop-line';
        document.body.append(line);
      }
      const rect = (row.querySelector('.item-content') ?? row).getBoundingClientRect();
      line.style.left = `${rect.left + 8}px`;
      line.style.width = `${rect.width - 16}px`;
      line.style.top = `${touchY < rect.top + rect.height / 2 ? rect.top : rect.bottom}px`;
    }

    function updateTarget() {
      el?.querySelectorAll('.bc-logbook--drop-target').forEach((n) => n.classList.remove('bc-logbook--drop-target'));
      target = null;
      const under = document.elementFromPoint(touchX, touchY);
      const li = /** @type {HTMLElement|null} */ (under?.closest('li'));
      const dragged = currentDiveIds(dragIds ?? []).map(diveById).filter((d) => d !== undefined);
      // The dive of the row under the finger, if that row is a dive (not a trip or a year header).
      const underDive = li ? diveById(Number(/** @type {HTMLElement|null} */ (li.querySelector('[data-dive]'))?.dataset.dive)) : undefined;
      // Back on one of the dragged rows: the dives stay where they are, nothing to do.
      const onItself = !!underDive && dragged.some((d) => d.id === underDive.id);
      if (li && el?.contains(li) && dragged.length && !onItself) {
        // A trip row, or a dive of a trip (its trip read from the dive, as a row does not always carry it).
        const tripId = Number(li.dataset.trip) || underDive?.trip?.id || 0;
        if (tripId && dragged.some((d) => d.trip?.id !== tripId)) {
          target = { action: 'add', tripId };
          el.querySelectorAll(`li[data-trip="${tripId}"]`).forEach((n) => n.classList.add('bc-logbook--drop-target'));
        } else if (!tripId && underDive && dragged.some((d) => d.trip)) {
          // Only on a dive that is in no trip: a year header or an empty spot does nothing.
          target = { action: 'remove' };
        }
      }
      placeDropLine(target ? li : null);
      if (!label) return;
      if (!target) {
        label.textContent = dragged.length > 1 ? t('logbook.dragCount', { n: dragged.length }) : dragged[0]?.site || t('dive.siteNotSet');
      } else if (target.action === 'add') {
        const id = target.tripId;
        const inTrip = logbook.dives.filter((d) => d.trip?.id === id).sort((a, b) => a.date.localeCompare(b.date));
        const name = inTrip[0]?.trip?.location || (inTrip[0] ? t('trip.startingOn', { date: formatDate(inTrip[0].date) }) : '');
        label.textContent = t('logbook.dragAdd', { trip: name });
      } else {
        label.textContent = t('logbook.dragRemove');
      }
      ghost?.classList.toggle('bc-logbook--drag-chip-target', !!target);
      placeGhost();
    }

    /** Near the top or the bottom of the screen, the list scrolls under the finger. */
    function autoScroll() {
      const content = /** @type {HTMLElement|null} */ (el?.closest('.page-content'));
      const step = () => {
        if (!dragging || !content) return;
        const rect = content.getBoundingClientRect();
        const edge = 80;
        let speed = 0;
        if (touchY < rect.top + edge + 120) speed = -Math.ceil((rect.top + edge + 120 - touchY) / 6);
        else if (touchY > rect.bottom - edge) speed = Math.ceil((touchY - (rect.bottom - edge)) / 6);
        if (speed) {
          content.scrollTop += speed;
          updateTarget();
        }
        scrolling = requestAnimationFrame(step);
      };
      scrolling = requestAnimationFrame(step);
    }

    function endDrag() {
      dragging = false;
      cancelAnimationFrame(scrolling);
      // Every chip, also one left by a drag the list reload cut short.
      document.querySelectorAll('.bc-logbook--drag-chip, .bc-logbook--drop-line').forEach((n) => n.remove());
      ghost = null;
      label = null;
      dragRow?.classList.remove('bc-logbook--drag-source', 'bc-logbook--drag-lift');
      el?.querySelectorAll('.bc-logbook--drop-target').forEach((n) => n.classList.remove('bc-logbook--drop-target'));
    }

    async function drop() {
      // The log may have been read again during the drag: the ids follow (lib/dive-ids.js).
      const ids = currentDiveIds(dragIds ?? []);
      const what = target;
      endDrag();
      if (!what || !ids.length) return;
      const n = ids.length;
      try {
        if (what.action === 'add') {
          await tripChange({ action: 'add', tripId: what.tripId, diveIds: ids });
          expanded[what.tripId] = true;
          offerUndo(t('logbook.addedToTrip', { n }));
        } else {
          const inTrip = ids.filter((id) => diveById(id)?.trip);
          await tripChange({ action: 'remove', diveIds: inTrip });
          offerUndo(t('logbook.removedFromTrip', { n: inTrip.length }));
        }
      } catch (e) {
        changeFailed(e);
      }
    }

    /** @param {TouchEvent} e */
    function touchMove(e) {
      if (!dragIds) return;
      touchX = e.touches[0].clientX;
      touchY = e.touches[0].clientY;
      if (!dragging) {
        if (Math.hypot(touchX - startX, touchY - startY) < 8) return;
        beginDrag();
      }
      // The list does not scroll and the sections do not slide under a drag.
      e.preventDefault();
      e.stopPropagation();
      placeGhost();
      updateTarget();
    }

    /** @param {TouchEvent} e */
    function touchEnd(e) {
      if (dragging) {
        e.stopPropagation();
        drop();
      } else {
        if (document.querySelector('.bc-logbook--drag-chip')) endDrag();
        // A long press let go without moving: the selection already started when the press was recognised.
        if (dragIds) dragRow?.classList.remove('bc-logbook--drag-lift');
      }
      dragIds = null;
      pressedTrip = 0;
    }

    function touchCancel() {
      if (dragging) endDrag();
      dragRow?.classList.remove('bc-logbook--drag-lift');
      dragIds = null;
      pressedTrip = 0;
    }

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', cancel);
    el.addEventListener('pointercancel', cancel);
    window.addEventListener('click', click, true);
    el.addEventListener('contextmenu', menu);
    // On the document: the row the finger started on may leave the list while
    // it scrolls or re-renders, and its touches would no longer reach it.
    document.addEventListener('touchmove', touchMove, { capture: true, passive: false });
    document.addEventListener('touchend', touchEnd, true);
    document.addEventListener('touchcancel', touchCancel, true);
    return () => {
      cancel();
      endDrag();
      document.removeEventListener('touchmove', touchMove, true);
      document.removeEventListener('touchend', touchEnd, true);
      document.removeEventListener('touchcancel', touchCancel, true);
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', cancel);
      el.removeEventListener('pointercancel', cancel);
      window.removeEventListener('click', click, true);
      el.removeEventListener('contextmenu', menu);
    };
  });

  // Android's Back leaves the selection (lib/back-button.js).
  /** @type {HTMLElement|undefined} */
  let selectionBar = $state();
  $effect(() => {
    const el = selectionBar;
    if (!el) return;
    el.addEventListener('bc-cancel', endSelection);
    return () => el.removeEventListener('bc-cancel', endSelection);
  });

  // Each load gives new dive identifiers and maybe new values: the criteria
  // are read again and the filter applied again.
  $effect(() => {
    logbook.dives;
    if (logbook.loading || logbook.error) return;
    untrack(() => {
      if (!isEmpty(filter.applied)) applyFilter(filter.applied, logbook.prefs);
    });
  });
  // The filter's values only serve the filter sheet: read once the first screen is up (lib/startup.svelte.js).
  $effect(() => {
    logbook.dives;
    if (logbook.loading || logbook.error || !startup.ready) return;
    untrack(() => loadOptions());
  });

  // "Changes not sent": the list follows the pending edits; once everything is
  // sent, the criterion goes and the whole logbook is back.
  $effect(() => {
    const pending = logbook.pendingByDive;
    untrack(() => {
      if (!filter.applied.unsent) return;
      const c = Object.keys(pending).length ? filter.applied : { ...filter.applied, unsent: false };
      applyFilter(c, logbook.prefs);
    });
  });

  /** The dives by month, newest first; a trip is one group under the month of its first dive. */
  const groups = $derived(groupByMonth(sorted));
  /** Dives outside trips and trips, month after month. */
  const entries = $derived(groups.flatMap((g) => g.entries));

  // Tablet: with nothing in the detail pane, the first dive of the list. Not
  // over another screen shown there (a trip, the filter).
  let autoOpening = false;
  $effect(() => {
    if (navigation.dive !== null) {
      autoOpening = false;
      navigation.paneOpening = false;
      return;
    }
    // A logbook that could not be read: no dive comes, the pane says so.
    if (logbook.error) navigation.paneOpening = false;
    if (!layout.split || navigation.section !== 'logbook' || logbook.loading || logbook.error || selecting || !listEl) return;
    const first = entries[0];
    const dive = first?.type === 'trip' ? first.dives[0] : first?.dive;
    // The emptied pane (PaneEmpty) is not a screen to keep: the desktop layout leaves it when the window narrows.
    const pane = listEl.closest('.view')?.querySelector('.page-master-detail');
    // Nothing to open (an empty logbook, a filter with no result): the skeleton of the start leaves the pane.
    if (!dive) navigation.paneOpening = false;
    if (!dive || autoOpening || (pane && !pane.classList.contains('bc-pane-empty'))) return;
    autoOpening = true;
    // The detail kept at the last start, if it is of this dive: the page draws it from its first frame, then reads the dive.
    seedStartDetail(dive, keepDive);
    f7router.navigate(diveUrl(dive), { reloadDetail: true });
  });

  // Tablet: a logbook emptied (signed out, data of this device deleted) keeps
  // no dive beside the list; the dive of the account that left must not stay.
  $effect(() => {
    if (!layout.split || logbook.loading || logbook.dives.length || navigation.dive === null) return;
    // In the list-detail pair Framework7 does not go back to the list alone: the empty pane.
    f7router.navigate('/pane/empty', { reloadDetail: true, animate: false });
  });

  /**
   * Search, in the core: Subsurface's fulltext index (notes, buddies, dive
   * guide, suit, tags, cylinder and weight types, site name and country, trip
   * name) and the site's region and city. Asked a moment after the last key.
   */
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
        const ids = await BenthicCore.filterQuery({ kind: 'search', fulltext: q });
        if (query.trim() === q) searchIds = new Set(ids);
      } catch (e) {
        console.error('Search', e);
      }
    }, 150);
    return () => clearTimeout(timer);
  });

  /** Search: what the core finds, and the site, trip, number or date as shown; flat result. */
  const results = $derived.by(() => {
    const q = query.trim().toLocaleLowerCase();
    if (!q) return null;
    return sorted.filter(
      (d) =>
        searchIds?.has(d.id) ||
        d.site.toLocaleLowerCase().includes(q) ||
        (d.trip?.location ?? '').toLocaleLowerCase().includes(q) ||
        String(d.number) === q ||
        formatDateTime(d.date).toLocaleLowerCase().includes(q),
    );
  });
  /** The months of the list on screen; the search results are flat, without trip rows. */
  const monthGroups = $derived(results ? groupByMonth(results, true) : groups);

  /**
   * The dives are grouped by year, in white cards, on the phone (task 2026-11-18-278) and on the tablet's list pane
   * (task 2026-11-18-279). The desktop has its own table (DesktopLogbook).
   */
  const cards = true;

  /** Tablet: the trips are open in portrait and folded in landscape, until the diver folds or unfolds one. */
  const openByDefault = $derived(layout.split && layout.portrait);
  /** @param {number} id */
  const isOpen = (id) => expanded[id] ?? openByDefault;

  /** Rows shown: the search results, or the dives and trips with the expanded trips' dives, under their year on a phone. */
  const rows = $derived(/** @type {Row[]} */ (buildRows(monthGroups, isOpen, cards)));

  /** The start snapshot (the top of the list at the last load) in the same cards, every trip folded. */
  const previewRows = $derived.by(() => {
    const preview = logbook.preview;
    if (!cards || !preview) return [];
    return /** @type {Row[]} */ (buildRows(groupByMonth(preview.entries.flatMap((entry) => (entry.type === 'trip' ? entry.dives : [entry.dive]))), {}, true));
  });

  /**
   * The release edition's empty logbook on a tablet (task 2026-11-15-220): the list pane only shows the band, the
   * detail pane holds the empty column (components/ReleaseEmptyLogbook.svelte).
   */
  /** The logbook's menu on a tablet: its name and the logbook-level commands (not the desktop's, which has its own menus). */
  const tabletMenu = $derived(!layout.phone && !desktopApp);
  const releaseEmpty = $derived(isRelease && layout.split && !logbook.loading && !logbook.error && logbook.dives.length === 0);

  let renaming = $state(false);
  let logbookName = $state(deviceStore.getItem('bc.logbookName') || '');
  $effect(() => {
    logbook.welcome;
    logbook.dives;
    logbookName = deviceStore.getItem('bc.logbookName') || '';
  });

  /** @param {string} name */
  async function rename(name) {
    await deviceStore.setItemConfirmed('bc.logbookName', name);
    logbookName = name;
  }

  /**
   * « Ouvrir un autre carnet » and « Nouveau carnet »: the first launch opens at its step; « Retour » on its first
   * screen leaves it.
   * @param {'open'|'new'} first
   */
  function openFirstLaunch(first) {
    enterFromMenu(first);
    logbook.welcome = true;
  }

  /** « Mon carnet · Dépôt git » then « Aucune plongée »: the logbook's name and where it is kept. */
  const emptyBand = $derived.by(() => {
    const name = logbookName || t('welcomeSteps.defaultName');
    const where = logbook.email || logbook.repository ? (logbook.mode === 'git' ? t(logbook.benthicPlus ? 'welcomeSteps.keptServer' : 'welcomeSteps.keptGit') : t('welcomeSteps.keptCloud')) : t('welcomeSteps.keptDevice');
    return `${name} · ${where}\n${t('welcomeSteps.bandNoDives')}`;
  });

  /** "9 plongées · 4 sites · dernière plongée il y a 9 mois" (the band). */
  const bandSummary = $derived(releaseEmpty ? emptyBand : logbookSummary(logbook.dives));

  /** Number of dives shown: follows the search (the filter row counts the filter). */
  const count = $derived(
    results
      ? t('logbook.countFiltered', { n: results.length, total: all.length })
      : t('logbook.count', { n: sorted.length }),
  );

  // --- Virtual list (Framework7). Row heights depend on the text size and on
  // long site names that wrap: each rendered row is measured and its height
  // kept by key, so that expanding a trip does not lose what was measured.

  /** @type {HTMLElement|undefined} */
  let listEl = $state();
  /** @type {any} */
  let vl = null;
  let rowsMarked = false;
  let visible = $state({ items: /** @type {Row[]} */ ([]), topPosition: 0 });
  /** @type {Map<string, number>} */
  const measured = new Map();
  /** Height of a row not measured yet: the last one measured of the same kind. */
  const typical = { dive: 72, inTrip: 72, trip: 96, year: 44 };
  /** The same on a phone (cards): a trip's header is a row like the others. */
  const typicalCards = { dive: 72, inTrip: 72, trip: 72, year: 44 };
  /** The space between two cards, in the padding of the row that opens the second one. */
  const CARD_GAP = 12;

  /** @param {Row} row */
  const gapOf = (row) => (/** @type {any} */ (row).gapBefore ? CARD_GAP : 0);

  /** @param {Row} row */
  function rowHeight(row) {
    return measured.get(row.key) ?? (cards ? typicalCards : typical)[row.kind] + gapOf(row);
  }

  async function measure() {
    await tick();
    if (!vl || !listEl) return;
    let changed = false;
    for (const li of listEl.querySelectorAll('ul > li[data-virtual-list-index]')) {
      const row = vl.items[Number(li.getAttribute('data-virtual-list-index'))];
      const height = /** @type {HTMLElement} */ (li).offsetHeight;
      if (!row || !height || rowHeight(row) === height) continue;
      measured.set(row.key, height);
      (cards ? typicalCards : typical)[/** @type {Row} */ (row).kind] = height - gapOf(row);
      changed = true;
    }
    if (changed) vl.update();
    scheduleSticky();
  }

  // --- The month at the top of the list, shown under the top bar only: the
  // list has no month rows. The header is a single element outside the
  // scrolling area (<BandBackdrop>). On each frame of a scroll, the rows in the
  // document (about twenty) are read to find the month at the top: no reflow
  // of the list, the cost does not grow with the size of the logbook.

  /** Height of the collapsed band (px), as in <BandBackdrop>. */
  const STICKY_HEIGHT = 64;
  /** The month shown under the top bar, null while the band is fully visible. */
  let sticky = $state(/** @type {string|null} */ (null));
  let stickyFrame = 0;
  /** Android phone: the search box folds into a magnifier while the list scrolls (task 2026-11-23-339). */
  const foldSearch = $derived(!theme.ios && layout.phone && !desktopApp);
  /** The search box is there while the logbook has dives or is loading. */
  const hasSearch = $derived(logbook.dives.length > 0 || logbook.loading);
  const stickyGroup = $derived(sticky ? monthGroups.find((g) => g.key === sticky) : undefined);

  function scheduleSticky() {
    if (!stickyFrame) stickyFrame = requestAnimationFrame(updateSticky);
  }

  function updateSticky() {
    stickyFrame = 0;
    if (theme.ios || !vl || !listEl) return;
    const bar = listEl.closest('.page')?.querySelector('.navbar');
    if (!bar) return;
    const edge = bar.getBoundingClientRect().bottom;
    /** @type {{ month: string, top: number, bottom: number }[]} */
    const seen = [];
    for (const li of listEl.querySelectorAll('ul > li[data-virtual-list-index]')) {
      const row = /** @type {Row|undefined} */ (vl.items[Number(li.getAttribute('data-virtual-list-index'))]);
      if (!row) continue;
      const rect = li.getBoundingClientRect();
      seen.push({ month: row.month, top: rect.top, bottom: rect.bottom });
    }
    // Rows not drawn yet after a fast scroll: the header stays as it was.
    if (!seen.some((r) => r.bottom > edge)) return;
    const month = stickyMonth(seen, edge, STICKY_HEIGHT);
    if (month !== sticky) sticky = month;
  }

  $effect(() => {
    const content = listEl?.closest('.page-content');
    if (!content) return;
    content.addEventListener('scroll', scheduleSticky, { passive: true });
    scheduleSticky();
    return () => {
      content.removeEventListener('scroll', scheduleSticky);
      cancelAnimationFrame(stickyFrame);
      stickyFrame = 0;
    };
  });

  function forgetHeights() {
    measured.clear();
    vl?.update();
  }

  $effect(() => {
    const items = rows;
    // The list leaves the document with an empty search: its instance goes with it.
    if (vl && vl.el !== listEl) {
      vl.destroy();
      vl = null;
    }
    if (!listEl) return;
    if (!vl) {
      vl = f7.virtualList.create({
        el: listEl,
        items,
        height: rowHeight,
        renderExternal: (/** @type {any} */ _vl, /** @type {{items: Row[], topPosition: number}} */ data) => {
          visible = { items: data.items, topPosition: data.topPosition };
          if (data.items.length && !rowsMarked) {
            rowsMarked = true;
            mark('rowsRender');
            requestAnimationFrame(() => requestAnimationFrame(() => mark('rowsPainted')));
          }
          measure();
        },
      });
    } else {
      vl.replaceAllItems(items);
    }
  });

  // The text size or the width changed: every height is to be measured again.
  if (typeof window !== 'undefined') window.addEventListener('resize', forgetHeights);
  onDestroy(() => {
    window.removeEventListener('resize', forgetHeights);
    logbook.checkedDiveIds = [];
    vl?.destroy();
    vl = null;
  });

  /**
   * The choices of the "+" button (spec, section 3). The Android menu unfolds upwards, so the
   * first of the list is the lowest: "Scanner un code QR" is last, at the top.
   * @type {{ key: string, icon: 'download'|'file'|'edit'|'qr', text: string }[]}
   */
  const addChoices = [
    { key: 'download', icon: 'download', text: t('logbook.addDownload') },
    { key: 'import', icon: 'file', text: t('logbook.addImport'), sub: t('logbook.addImportFormats') },
    { key: 'manual', icon: 'edit', text: t('logbook.addManual') },
    { key: 'scan', icon: 'qr', text: t('logbook.addScan') },
    // iPhone only: the dives of an Apple Watch Ultra, from Apple Health (to-do #67).
    ...(theme.ios && layout.phone ? [{ key: 'health', icon: /** @type {'download'} */ ('download'), text: t('logbook.addHealth') }] : []),
  ];

  /**
   * The empty logbook (task 2026-11-15-204): the dive computer has its own
   * large button; these are the other ways to add dives.
   * @type {{ key: string, icon: 'download'|'cloud'|'edit', text: string, note: string }[]}
   */
  const emptyChoices = [
    { key: 'import', icon: 'download', text: t('logbook.emptyImport'), note: t('logbook.emptyImportNote') },
    { key: 'divelogs', icon: 'cloud', text: t('logbook.emptyDivelogs'), note: t('logbook.emptyDivelogsNote') },
    { key: 'manual', icon: 'edit', text: t('logbook.emptyManual'), note: t('logbook.emptyManualNote') },
  ];

  /**
   * Where each choice leads. The download from the dive computer is built
   * for Android only: elsewhere it still says it is not available.
   */
  const routes = /** @type {Record<string, string>} */ ({
    download: downloadRoute,
    manual: '/dives/new',
    divelogs: '/welcome/import',
    health: '/health',
  });

  /**
   * @param {string} key download, import, manual, divelogs
   * In the demo logbook every one of them opens « Vous êtes dans le carnet d’exemple » instead (task 2026-11-16-224).
   */
  function choose(key) {
    guardedAdd(() => {
      if (key === 'import') fileInput?.click();
      else if (key === 'scan') scanQr();
      else f7router.navigate(routes[key]);
    });
  }

  // Import a file: the WebView's own file picker, no native code; the core
  // reads the file and merges it into the logbook as one undoable step.
  /** @type {HTMLInputElement|undefined} */
  let fileInput = $state();
  let importing = $state(false);

  /** @param {string} text */
  function toast(text) {
    showSnackbar(text);
  }

  /** The CSV file being mapped (the dialog of task 2026-11-16-224), with its companion .txt (Poseidon MkVI). */
  let csv = $state(/** @type {{ file: File, companion: File|null }|null} */ (null));

  /** « Importer un fichier » is a .csv: its column mapping first, then the core's CSV import. */
  async function csvConfirmed(/** @type {{ params: import('benthic-core').CsvParams, companion: File|null }} */ result) {
    const chosen = csv;
    if (!chosen) return;
    const n = await importCsvFile(chosen.file, result.params, result.companion);
    csv = null;
    offerUndo(t('logbook.imported', { n }));
  }

  /** @param {unknown} e */
  function csvFailed(e) {
    const code = String(/** @type {any} */ (e)?.message ?? '');
    console.error('Import a CSV file', code);
    csv = null;
    f7.dialog.create({ title: t('logbook.importTitle'), text: t(importErrorKey(code)), buttons: [{ text: t('dialog.ok') }] }).open();
  }

  /**
   * « Remplacer ce carnet » for a logbook file picked in « Importer un fichier » (lib/replace-logbook-ui.js).
   * @param {File} file
   * @returns {Promise<boolean>} true when the file was dealt with here (replaced, or the diver cancelled)
   */
  async function offerReplace(file) {
    let what;
    try {
      what = await replacementFromFile(BenthicCore, file);
    } catch {
      return false;
    }
    if (!what) return false;
    const eligibility = replaceEligibility(logbook);
    /** @type {'merge'|'replace'|'cancel'} */
    const answer = await new Promise((resolve) => {
      const buttons = [{ text: t('dialog.cancel'), onClick: () => resolve('cancel') }];
      if (eligibility === 'ok') buttons.push({ text: t('link.fileReplace'), onClick: () => resolve('replace') });
      buttons.push({ text: t('link.fileMerge'), onClick: () => resolve('merge') });
      const text = [
        t(eligibility === 'ok' ? 'link.fileChooseReplace' : 'link.fileChooseOne', { name: file.name }),
        eligibility === 'ok' ? '' : t(`link.replace_${eligibility}`),
        what.several ? t('replace.several', what.several) : '',
      ]
        .filter(Boolean)
        .join('\n\n');
      f7.dialog.create({ title: t('link.fileTitle'), text, buttons, verticalButtons: buttons.length > 2 }).open();
    });
    if (answer === 'merge') return false;
    if (answer === 'replace') {
      try {
        // Only now is the logbook written to the app's cache (in pieces); the replacement deletes it afterwards.
        // One progress line: the copy here, then the import and the save once the diver confirmed (lib/import-progress.js).
        await importProgress.session(['copy', 'import', 'save'], file.name, async () => {
          const data = await what.stage(importProgress.reporter('copy'));
          importProgress.pause();
          await startReplace({ file: file.name, fileName: what.name, data, several: what.several });
        });
      } catch (e) {
        if (isCancelled(e)) {
          showSnackbar(t('importFlow.cancelled'));
          return true;
        }
        const code = String(/** @type {any} */ (e)?.message ?? '');
        console.error('Replace from a file', code);
        f7.dialog.create({ title: t('replace.failedTitle'), text: t('replace.failed'), buttons: [{ text: t('dialog.ok') }] }).open();
      }
    }
    return true;
  }

  async function fileChosen() {
    // Several files at once (a Suunto .json and its .fit are read as one dive); a .csv opens the CSV dialog.
    const files = Array.from(fileInput?.files ?? []);
    if (!files.length || !fileInput) return;
    const picked = pickCsvFiles(files);
    fileInput.value = '';
    if (picked) {
      csv = { file: picked.csv, companion: picked.companion };
      return;
    }
    // A phone or a tablet keeps one logbook: a Subsurface logbook file can also replace the open one.
    if (files.length === 1 && logbook.dives.length && (await offerReplace(files[0]))) return;
    importing = true;
    try {
      const n = await importFiles(files);
      offerUndo(t('logbook.imported', { n }));
    } catch (e) {
      if (isCancelled(e)) {
        showSnackbar(t('importFlow.cancelled'));
        return;
      }
      const code = String(/** @type {any} */ (e)?.message ?? '');
      console.error('Import a file', code);
      f7.dialog.create({ title: t('logbook.importTitle'), text: t(importErrorKey(code)), buttons: [{ text: t('dialog.ok') }] }).open();
    } finally {
      importing = false;
    }
  }

  /**
   * The scrolled bar's search button: back to the top of the list, the cursor in the search field.
   * @param {MouseEvent} e
   */
  function openSearch(e) {
    const page = /** @type {HTMLElement} */ (e.currentTarget).closest('.page');
    const content = /** @type {HTMLElement|null} */ (page?.querySelector('.page-content') ?? null);
    const field = /** @type {HTMLInputElement|null} */ (page?.querySelector('.bc-band-search input') ?? null);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    content?.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    // The field is focused once it is back on screen (no scroll jump from focus()).
    setTimeout(() => field?.focus({ preventScroll: true }), reduced ? 0 : 350);
  }

  /** iOS "+": the choices in an action sheet. */
  function add() {
    f7.actions
      .create({
        buttons: [
          [
            { text: t('logbook.add'), label: true },
            // "Scanner un code QR" first on iOS, where the list reads from the top.
            ...[...addChoices].sort((a, b) => Number(b.key === 'scan') - Number(a.key === 'scan')).map((c) => ({ text: c.text, onClick: () => choose(c.key) })),
          ],
          [{ text: t('logbook.cancel'), bold: true }],
        ],
      })
      .open();
  }
</script>

<Page data-bc-scroll class="bc-logbook" onPageInit={keepInSvelteRange}>
  <Navbar large={theme.ios} class="{theme.ios ? 'bc-ios-bar' : 'bc-band-bar bc-band-tall bc-band-titled'} {showPill && !theme.ios ? 'bc-band-pill' : ''}" title={!desktopApp && logbookName ? logbookName : t('logbook.title')}>
    {#snippet left()}<MenuButton />{/snippet}
    <NavRight>
      <!-- Scrolled, with the month headers in the band (Android, task 2026-11-14-125): the search
           field has left the screen, a search button takes its place. Then the avatar, and the
           page ⋮ always last. -->
      {#if foldSearch}
        <!-- Android phone (task 2026-11-23-339): the search box folds into the room kept here. -->
        {#if hasSearch}<span class="bc-folding-search--target" aria-hidden="true"></span>{/if}
      {:else if !theme.ios && stickyGroup}
        <Link iconOnly class="bc-logbook--search-button" onClick={openSearch}>
          <Icon name="search" />
          <span class="bc-sr-only">{t('logbook.search')}</span>
        </Link>
      {/if}
      <!-- Android phone: the account, sync, Réglages and À propos (task 2026-11-14-120); iPhone: last. -->
      {#if !theme.ios}<AccountAvatar />{/if}
      {#if releaseEmpty}
        <!-- The empty logbook of the release edition on a tablet: the logbook's own menu (task 224). -->
        <Link iconOnly popoverOpen=".bc-logbook-empty-menu">
          <Icon name="more" weight={4} />
          <span class="bc-sr-only">{t('detail.moreOptions')}</span>
        </Link>
      {:else if !desktopApp || logbook.dives.length || logbook.preview}
        <Link iconOnly popoverOpen=".bc-logbook-menu" class={desktopApp && !logbook.dives.length ? 'disabled' : ''}>
          {#if theme.ios}<Icon name="moreCircle" />{:else}<Icon name="more" weight={4} />{/if}
          <span class="bc-sr-only">{t('detail.moreOptions')}</span>
        </Link>
      {/if}
      {#if theme.ios}
        <Link iconOnly onClick={add}><Icon name="plus" /><span class="bc-sr-only">{t('logbook.add')}</span></Link>
        <!-- iPhone: the account initial after the other buttons (task 2026-11-14-127). -->
        <AccountAvatar />
      {/if}
    </NavRight>
  </Navbar>

  {#if !theme.ios}<BandBackdrop pill={showPill} group={stickyGroup} syncLine />{/if}
  <SectionBand tall pill={showPill} bare={!theme.ios} syncLine={theme.ios} summary={bandSummary}>
    {#if showPill}
      {#if conflictWaits}
        <SyncPill icon="sync" text={stoppedText} onclick={reopenConflict} />
      {:else if logbook.syncFailure}
        <SyncFailureRow pill />
      {:else}
        <SyncPill icon="offline" text={t('sync.offlinePending', { n: logbook.pending })} />
      {/if}
    {/if}
    {#if hasSearch && foldSearch}
      <!-- Its place under the summary; the box itself is drawn above the top bar (<FoldingSearch>, below). -->
      <div class="bc-folding-search--slot"></div>
    {:else if hasSearch}
      <!-- No backdrop: the list filters as you type, and Framework7's veil stayed over the band
           after the field lost the focus (bug of 13 November 2026). -->
      <Searchbar
        inline
        customSearch
        backdrop={false}
        class={theme.ios ? 'bc-ios-search' : 'bc-band-search'}
        placeholder={t('logbook.search')}
        onSearchbarSearch={(/** @type {any} */ _sb, /** @type {string} */ q) => (query = q)}
        onSearchbarClear={() => (query = '')}
      />
    {/if}
  </SectionBand>

  <!-- A wait before flying is running (task 2026-11-13-98): under the search field. -->
  <FlightBanner />

  <!-- While loading, the count and the status are not known yet: nothing is shown. -->
  {#if !logbook.loading && !logbook.error}
    {#if filtered}
      <ActiveFilter prefs={logbook.prefs} dives={logbook.dives} shown={results ? results.length : sorted.length} />
    {:else if sorted.length && (results || selecting)}
      <p class="bc-logbook--count bc-value" role="status">{count}{#if selecting}<span class="bc-logbook--separator" aria-hidden="true">·</span><span class="bc-logbook--count-selected">{t('logbook.selected', { n: checkedCount })}</span>{/if}</p>
    {/if}
    {#if filter.failed}<p class="bc-logbook--count bc-logbook--failed" role="status">{t('logbook.filterFailed')}</p>{/if}
    <!--
      Only offline, when the logbook may be out of date: the line stays, only
      its text and bar change (to-do #2). The side menu shows every state.
    -->
    {#if !showPill && logbook.sync === 'offline'}
      <SyncStatus sync={logbook.sync} pending={logbook.pending} progress={logbook.syncProgress} />
    {/if}
  {/if}

  {#if logbook.loading && logbook.preview}
    <!--
      Start: the top of the list as it was at the last load, drawn while the
      core reads the log. A tap is held and replayed on the real row when
      the list replaces them (their identifiers are of the previous load).
    -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="bc-logbook--preview" aria-busy="true" aria-label={t('logbook.loading')} role="status" onclickcapture={holdTap}>
      <div aria-hidden="true">
        <p class="bc-logbook--count bc-value">{t('logbook.count', { n: logbook.preview.total })}</p>
        <div class="list media-list {theme.ios && !cards ? 'chevron-center bc-logbook--dividers' : ''} bc-dive-list" class:bc-logbook--cards={cards}>
          <ul>
            {#if cards}
              {#each previewRows as row (row.key)}
                {#if row.kind === 'year'}
                  <li class="bc-logbook--year"><h2 class="bc-logbook--year-title">{theme.ios ? t('logbook.yearHeader', { year: row.year, n: row.count }) : row.year}</h2></li>
                {:else if row.kind === 'trip'}
                  <TripRow dives={row.dives} location={row.location} prefs={logbook.preview.prefs} expanded={false} ontoggle={() => {}} card cardFirst={row.cardFirst} cardLast={row.cardLast} gapBefore={row.gapBefore} />
                {:else}
                  <DiveRow dive={row.dive} prefs={logbook.preview.prefs} card cardFirst={row.cardFirst} cardLast={row.cardLast} gapBefore={row.gapBefore} />
                {/if}
              {/each}
            {:else}
              {#each logbook.preview.entries as entry, i (i)}
                {#if entry.type === 'trip'}
                  <TripRow dives={entry.dives} location={entry.location} prefs={logbook.preview.prefs} expanded={false} ontoggle={() => {}} />
                {:else}
                  <DiveRow dive={entry.dive} prefs={logbook.preview.prefs} />
                {/if}
              {/each}
            {/if}
          </ul>
        </div>
      </div>
    </div>
  {:else if logbook.loading}
    <!--
      Loading (spec, section 6): greyed bars in the place and the layout of the
      real rows, with no spinner in the middle; screen readers hear "Loading
      the logbook". Each bar is one line of text high, so that the rows keep
      their height when the dives arrive.
    -->
    <div class="bc-logbook--loading skeleton-effect-wave" aria-busy="true" aria-label={t('logbook.loading')} role="status">
      <div aria-hidden="true">
        <p class="bc-logbook--count"><span class="skeleton-block bc-logbook--bar" style:width="7.5em"></span></p>
        <List mediaList dividers={theme.ios} class="{theme.ios ? 'chevron-center' : ''} bc-dive-list">
          {#each Array(14) as _, i (i)}
            <li>
              <!-- item-link: the same chevron space as the real rows. -->
              <div class="item-content item-link">
                <div class="item-media"><div class="skeleton-block bc-logbook--skeleton-thumbnail"></div></div>
                <div class="item-inner bc-row">
                  <div class="bc-row-text">
                    <div class="item-title"><span class="skeleton-block bc-logbook--bar" style:width="{40 + ((i * 17) % 35)}%"></span></div>
                    <div class="item-text"><span class="skeleton-block bc-logbook--bar" style:width="9em"></span></div>
                  </div>
                  <div class="bc-logbook--skeleton-values">
                    <span class="bc-logbook--value"><span class="skeleton-block bc-logbook--bar" style:width="3em"></span></span>
                    <span class="bc-logbook--duration"><span class="skeleton-block bc-logbook--bar" style:width="2.5em"></span></span>
                  </div>
                </div>
              </div>
            </li>
          {/each}
        </List>
      </div>
    </div>
  {:else if logbook.error}
    <Block>
      <h2 class="bc-state-title">{t('logbook.errorTitle')}</h2>
      <p>{t('logbook.errorNothingChanged')}</p>
      <p>{t('logbook.errorCheck')}</p>
      <ol>
        <li>{t('logbook.errorInternet')}</li>
        <li>{t('logbook.errorStorage')}</li>
      </ol>
      <Button fill class="bc-primary-action" onClick={() => loadLogbook()}>{t('logbook.retry')}</Button>
    </Block>
  {:else if logbook.dives.length === 0}
    <!-- Empty logbook (docs/mockups/*-etat-vide): the choices of "+" directly. -->
    {#if releaseEmpty}
      <ReleaseEmptyLogbook downloadRoute={downloadRoute} choices={emptyChoices} {routes} onchoose={choose} />
    {:else}
    {#if logbook.email}<p class="bc-logbook--count">{t(logbook.mode === 'git' ? (logbook.benthicPlus ? 'logbook.emptyServer' : 'logbook.emptyGit') : 'logbook.emptyCloud')}</p>
    {:else if !theme.ios}<!-- Without an account, on Android (tasks 2026-11-16-233 and 239): where the logbook is. -->
      <p class="bc-logbook--count">{t(deviceKey('logbook.emptyLocal', deviceKind()))}</p>{/if}
    <div class="bc-logbook--empty">
      <div class="bc-logbook--empty-illustration" aria-hidden="true">
        <DecorativeProfile trace class="bc-logbook--empty-profile" />
        <span class="bc-logbook--empty-bubble bc-logbook--empty-bubble-1"></span>
        <span class="bc-logbook--empty-bubble bc-logbook--empty-bubble-2"></span>
        <span class="bc-logbook--empty-bubble bc-logbook--empty-bubble-3"></span>
      </div>
      <h2 class="bc-state-title bc-logbook--empty-title">{t('logbook.emptyTitle')}</h2>
      <p class="bc-logbook--empty-text">{t(theme.ios ? 'logbook.emptyTextIos' : 'logbook.emptyText')}</p>
      <a href={downloadRoute} class="bc-logbook--empty-pair">
        <Icon name="diveComputer" size={20} weight={2} />{t('logbook.emptyDownload')}
      </a>
      <nav class="bc-logbook--empty-options" aria-label={t('logbook.emptyOthers')}>
        {#each emptyChoices as c (c.key)}
          <a href={routes[c.key] ?? '#'} class="bc-logbook--empty-option" onclick={(e) => { e.preventDefault(); choose(c.key); }}>
            <span class="bc-logbook--empty-option-icon"><Icon name={c.icon} size={22} weight={2} /></span>
            <span class="bc-logbook--empty-option-texts">
              <span class="bc-logbook--empty-option-title">{c.text}</span>
              <span class="bc-logbook--empty-option-note">{c.note}</span>
            </span>
            <span class="bc-logbook--empty-option-chevron"><Icon name="chevron" size={20} weight={2} /></span>
          </a>
        {/each}
      </nav>
    </div>
    {/if}
  {:else if results && results.length === 0}
    <Block><p>{t('logbook.noResults', { query })}</p></Block>
  {:else if filtered && sorted.length === 0}
    <Block><p>{t('logbook.noFilterResults')}</p></Block>
  {/if}

  <!--
    The menu of the empty logbook on a release tablet (mock-up android-tablette-carnet-vide-menu-paysage): the
    logbook's name and where it is kept, then what can be done with the logbook itself.
  -->
  {#if releaseEmpty}
    <Popover class="bc-menu bc-logbook-empty-menu" backdrop={false}>
      <List noChevron mediaList>
        <li class="bc-menu-label">{emptyBand.split('\n')[0]}</li>
        <MenuItem icon="edit" text={t('welcomeSteps.menuRename')} onclick={() => (renaming = true)} />
        <li class="bc-menu-divider" role="separator"></li>
        <MenuItem icon="notebook" text={t('welcomeSteps.menuOpenOther')} onclick={() => openFirstLaunch('open')} />
        <MenuItem icon="plus" text={t('welcomeSteps.menuNew')} onclick={() => openFirstLaunch('new')} />
        <li class="bc-menu-divider" role="separator"></li>
        <MenuItem icon="upload" text={t('welcomeSteps.menuExport')} supporting={t('welcomeSteps.menuExportNone')} disabled />
      </List>
    </Popover>
  {/if}

  <!--
    Overflow menu: Filter, and with a selection Delete, Create a trip, Add to
    the trip above / below.
  -->
  <Popover class="bc-menu bc-logbook-menu" backdrop={false}>
    <List noChevron mediaList={tabletMenu}>
      <!-- Undo and Redo always come first. -->
      {#if logbook.dives.length && logbook.undoText}
        <MenuItem icon="undo" text={t('logbook.menuUndo')} onclick={() => undoRedo(false)} />
      {/if}
      {#if logbook.dives.length && logbook.redoText}
        <MenuItem icon="redo" text={t('logbook.menuRedo')} onclick={() => undoRedo(true)} />
      {/if}
      {#if tabletMenu && !selecting}
        <!-- Tablet (task 2026-11-22-324, mock-up android-tablette-carnet-menu-paysage): the logbook's name and where it is kept,
             then what can be done with the logbook itself. -->
        <li class="bc-menu-label bc-logbook-menu--label">{emptyBand.split('\n')[0]}</li>
      {/if}
      {#if !desktopApp && !selecting}
        <MenuItem icon="edit" text={t('welcomeSteps.menuRename')} onclick={() => (renaming = true)} />
      {/if}
      {#if tabletMenu && !selecting}
        <li class="bc-menu-divider" role="separator"></li>
        <MenuItem icon="notebook" text={t('welcomeSteps.menuOpenOther')} onclick={() => openFirstLaunch('open')} />
        <MenuItem icon="plus" text={t('welcomeSteps.menuNew')} onclick={() => openFirstLaunch('new')} />
        <li class="bc-menu-divider" role="separator"></li>
        <MenuItem
          icon="upload"
          text={t('welcomeSteps.menuExport')}
          supporting={logbook.dives.length ? t('welcomeSteps.menuExportCount', { n: logbook.dives.length }) : t('welcomeSteps.menuExportNone')}
          disabled={logbook.loading || !!logbook.error || !logbook.dives.length}
          onclick={() => ((exportWhole = true), (exporting = true))}
        />
        {#if logbook.dives.length}<li class="bc-menu-divider" role="separator"></li>{/if}
      {/if}
      {#if logbook.dives.length}
      <MenuItem icon="filter" text={t(filtered ? 'logbook.menuFilterOn' : 'logbook.menuFilter')} link="/filter" />
      {#if selecting && checkedCount >= 2}
        <MenuItem icon="edit" text={t('multiDive.menuEdit')} onclick={editChecked} />
        <MenuItem
          icon="merge"
          text={t('multiDive.menuMerge')}
          disabled={!mergeable}
          supporting={mergeable ? '' : t('multiDive.mergeBlocked')}
          onclick={mergeChecked}
        />
      {/if}
      <!-- Validation by a buddy or an instructor (task 2026-11-19-309): one validation for the checked dives. -->
      {#if selecting && checkedCount >= 1 && benthicPlusSubscriber()}
        <MenuItem icon="edit" text={t('validation.menuMany')} disabled={checkedCount > 20} supporting={checkedCount > 20 ? t('validation.tooMany') : ''} onclick={validateChecked} />
      {/if}
      {#if !selecting}
        <MenuItem icon="renumber" text={t('logbook.menuRenumber')} onclick={() => (renumbering = true)} />
        <MenuItem icon="computer" text={t('settings.logbookComputers.title')} link="/settings/computers/" />
        {#if !tabletMenu}<MenuItem icon="upload" text={t('welcomeSteps.menuExport')} supporting={!logbook.dives.length ? t('welcomeSteps.menuExportNone') : ''} disabled={logbook.loading || !!logbook.error || !logbook.dives.length} onclick={() => ((exportWhole = true), (exporting = true))} />{/if}
      {:else}
        <MenuItem icon="renumber" text={t('logbook.menuRenumberChecked', { n: checkedCount })} onclick={() => (renumbering = true)} />
        {#if checkedCount === 1}
          <MenuItem icon="renumber" text={t('renumberFrom.title')} onclick={() => (renumberFrom = checkedIds[0])} />
        {/if}
      {/if}
      {#if selecting}
        {#if theme.ios}<MenuItem icon="plus" text={t('logbook.menuCreateTrip')} onclick={createTrip} />{/if}
        {#if checkedTrips.length}
          <MenuItem icon="ungroup" text={t('logbook.menuDeleteTrip', { n: checkedTrips.length })} destructive onclick={deleteCheckedTrips} />
        {/if}
        {#if checkedInTrip.some((id) => !checkedTrips.includes(logbook.dives.find((d) => d.id === id)?.trip?.id ?? 0))}
          <MenuItem icon="remove" text={t('logbook.menuRemoveFromTrip', { n: checkedInTrip.length })} onclick={removeFromTrip} />
        {/if}
        {#if neighbourTrips.above}
          {@const id = neighbourTrips.above}
          <MenuItem icon="arrowUp" text={t('logbook.menuAddAbove', { n: checkedCount })} onclick={() => addToTrip(id)} />
        {/if}
        {#if neighbourTrips.below}
          {@const id = neighbourTrips.below}
          <MenuItem icon="arrowDown" text={t('logbook.menuAddBelow', { n: checkedCount })} onclick={() => addToTrip(id)} />
        {/if}
        {#if theme.ios}
          <MenuItem
            icon="download"
            text={t('logbook.menuExport')}
            onclick={() => {
              f7.popover.close('.bc-logbook-menu');
              exporting = true;
            }}
          />
          <li class="bc-menu-divider" role="separator"></li>
          <MenuItem icon="delete" text={t('logbook.menuDelete')} destructive onclick={deleteChecked} />
        {/if}
      {/if}
      {/if}
    </List>
  </Popover>

  {#if exporting}
    <ExportSheet count={exportWhole ? logbook.dives.length : checkedCount} ids={exportWhole ? logbook.dives.map((d) => d.id) : checkedIds} whole={exportWhole} logbookName={logbookName || t('welcomeSteps.defaultName')} onexport={exportFromSheet} onclose={() => ((exporting = false), (exportWhole = false))} />
  {/if}

  {#if !logbook.loading && !logbook.error && rows.length}
    <div class="list media-list {theme.ios && !cards ? 'chevron-center bc-logbook--dividers' : ''} bc-logbook--virtual-list bc-dive-list" class:bc-logbook--cards={cards} bind:this={listEl}>
      <ul>
        {#each visible.items as row (row.key)}
          {#if row.kind === 'year'}
            <li class="bc-logbook--year" data-virtual-list-index={row.index} style:top="{visible.topPosition}px">
              <h2 class="bc-logbook--year-title">{theme.ios ? t('logbook.yearHeader', { year: row.year, n: row.count }) : row.year}</h2>
            </li>
          {:else if row.kind === 'trip'}
            <TripRow
              dives={row.dives}
              location={row.location}
              prefs={logbook.prefs}
              expanded={isOpen(row.id)}
              ontoggle={() => toggleTrip(row.id)}
              index={row.index}
              top={visible.topPosition}
              {selecting}
              checked={checkedTrips.includes(row.id)}
              card={cards}
              cardFirst={row.cardFirst}
              cardLast={row.cardLast}
              gapBefore={row.gapBefore}
            />
          {:else}
            <DiveRow
              dive={row.dive}
              prefs={logbook.prefs}
              inTrip={row.kind === 'inTrip'}
              index={row.index}
              top={visible.topPosition}
              pending={row.dive.number ? (logbook.pendingByDive[row.dive.number] ?? []) : []}
              {selecting}
              checked={!!checked[row.dive.id]}
              appear={row.kind === 'inTrip' && row.dive.trip?.id === appearing}
              tripFirst={row.kind === 'inTrip' && row.tripFirst}
              tripLast={row.kind === 'inTrip' && row.tripLast}
              card={cards}
              cardFirst={row.cardFirst}
              cardLast={row.cardLast}
              gapBefore={row.gapBefore}
            />
          {/if}
        {/each}
      </ul>
    </div>
  {/if}

  {#if renaming}
    <RenameLogbook initialName={logbookName || t('welcomeSteps.defaultName')} onsave={rename} onclose={() => (renaming = false)} />
  {/if}
  {#if validating}
    <ValidationDialog ids={validating} onclose={() => (validating = null)} />
  {/if}

  {#if renumbering}
    <RenumberDialog
      ids={selecting ? checkedIds : undefined}
      oncancel={() => (renumbering = false)}
      ondone={() => {
        renumbering = false;
        endSelection();
      }}
    />
  {/if}
  {#if renumberFrom !== null}
    <RenumberFromDialog id={renumberFrom} oncancel={() => (renumberFrom = null)} ondone={() => { renumberFrom = null; endSelection(); }} />
  {/if}

  <!-- The file picker of "Import a file" (hidden; any file: the core tells what it can read). -->
  <input type="file" multiple class="bc-sr-only" tabindex="-1" aria-hidden="true" bind:this={fileInput} onchange={fileChosen} />
  {#if csv}
    <CsvImportDialog file={csv.file} companion={csv.companion} onclose={() => (csv = null)} onconfirm={csvConfirmed} onfail={csvFailed} />
  {/if}
  {#if importing}<p class="bc-sr-only" role="status">{t('logbook.importing')}</p>{/if}

  {#snippet fixedContent()}
    {#if foldSearch && hasSearch}
      <FoldingSearch bind:value={query} label={t('logbook.search')} hidden={selecting} />
    {/if}
    {#if selecting}
      <!-- Selection mode: the top bar gives way to the number of dives checked. -->
      <div class="bc-logbook--selection-bar" bind:this={selectionBar}>
        <button type="button" class="bc-icon-button" onclick={endSelection}>
          <Icon name="close" /><span class="bc-sr-only">{t('logbook.selectionClose')}</span>
        </button>
        <span class="bc-logbook--selection-count bc-value" role="status">{t('logbook.selected', { n: checkedCount })}</span>
        {#if theme.ios}
          <a href="#" class="link icon-only bc-logbook--popover-open bc-logbook--selection-more" data-popover=".bc-logbook-menu" role="button">
            <Icon name="moreCircle" />
            <span class="bc-sr-only">{t('detail.moreOptions')}</span>
          </a>
        {/if}
      </div>
      <!-- Android: the actions of the selection in a floating toolbar (Material 3 Expressive). -->
      {#if !theme.ios}
        <FloatingToolbar
          label={t('logbook.selectionActions')}
          actions={[
            { key: 'trip', icon: 'plus', label: t('logbook.menuCreateTrip'), text: t('logbook.menuCreateTrip'), onclick: createTrip },
            { key: 'export', icon: 'download', label: t('logbook.toolbarExport'), onclick: () => (exporting = true) },
            { key: 'delete', icon: 'delete', label: t('logbook.menuDelete'), onclick: deleteChecked },
            { key: 'more', icon: 'more', label: t('logbook.selectionMore'), menu: '.bc-logbook-menu' },
          ]}
        />
      {/if}
    {/if}
    {#if !theme.ios && logbook.dives.length && !selecting}
      <!-- Hidden while the download pane shows: it is the task the + opened, and it covered "Retry". -->
      {#if !navigation.downloadPanes}
        <FabMenu choices={addChoices} onchoose={choose} />
      {/if}
    {/if}
  {/snippet}
</Page>

<style>
  /*
   * Android: a shorter large title (less space above "Logbook") and a taller
   * search band, for some air under the search box. Outside the layers:
   * Framework7's own variables are set without one.
   */
  :global(.md .bc-logbook) {
    --f7-navbar-large-title-height: 64px;
    --f7-subnavbar-height: 76px;
  }

  /* The title and the search box at the top of their bands: the room is under the search box. */
  :global(.md .bc-logbook .title-large),
  :global(.md .bc-logbook .subnavbar) {
    align-items: flex-start;
  }

  @layer bc.components {
    .bc-logbook--count {
      margin: 8px 16px 0;
      font-size: 15px;
      line-height: 21px;
      color: var(--bc-text-2);
      & .bc-logbook--separator {
        margin: 0 0.4em;
      }
    }

    /* Selection mode: the number of dives checked, beside the total. */
    .bc-logbook--count-selected {
      color: var(--bc-text);
      font-weight: 500;
    }

    .bc-logbook--failed {
      color: var(--bc-alarm);
    }

    /* The snapshot of the start: a tap is held until the real list is there. */
    .bc-logbook--preview {
      user-select: none;
    }

    /* The menu of the empty logbook: 296 dp, each line on one line (mock-up …-carnet-vide-menu-paysage). */
    :global(.bc-logbook-empty-menu) {
      width: 296px;
    }

    :global(.bc-logbook-empty-menu .item-title),
    :global(.bc-logbook-empty-menu .item-text) {
      white-space: nowrap;
    }

    /* Selection mode: over the top bar, the same height. */
    .bc-logbook--selection-bar {
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

    .bc-logbook--selection-count {
      font-size: 22px;
      line-height: 28px;
      color: var(--bc-text);
    }

    .bc-logbook--selection-more {
      margin-left: auto;
    }

    /* Dragging dives to a trip or out of it: the row lifted under the finger,
       its place faded, the trip it would join tinted. */
    :global(.bc-logbook--drag-chip) {
      position: fixed;
      z-index: 9000;
      max-width: calc(100vw - 16px);
      height: 40px;
      padding: 0 16px 0 12px;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 8px;
      border-radius: 20px;
      background: var(--bc-surface);
      color: var(--bc-text);
      font-size: 14px;
      font-weight: 600;
      white-space: nowrap;
      pointer-events: none;
      box-shadow: 0 4px 8px 3px rgb(0 0 0 / 0.15), 0 1px 3px rgb(0 0 0 / 0.3);

      span {
        overflow: hidden;
        text-overflow: ellipsis;
      }
    }

    /* Over a place where the dives can go: the chip in ink. */
    /* Where the drop would go: a 3 dp bar with a dot at its start. */
    :global(.bc-logbook--drop-line) {
      position: fixed;
      z-index: 9999;
      height: 3px;
      margin-top: -1.5px;
      border-radius: 2px;
      background: var(--bc-text);
      pointer-events: none;
    }

    :global(.bc-logbook--drop-line::before) {
      content: '';
      position: absolute;
      left: -5px;
      top: -3.5px;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--bc-text);
    }

    :global(.bc-logbook--drag-chip.bc-logbook--drag-chip-target) {
      background: var(--bc-text);
      color: var(--bc-surface);
    }

    /* Held by a long press: the row rises a little, ready to be dragged. */
    :global(li.bc-logbook--drag-lift) {
      position: relative;
      z-index: 2;
      background: var(--bc-surface);
      box-shadow: 0 2px 6px 2px rgb(0 0 0 / 0.15), 0 1px 2px rgb(0 0 0 / 0.3);
      transition: box-shadow 150ms;
    }

    :global(.bc-logbook--drag-source) {
      opacity: 0.35;
    }

    :global(li.bc-logbook--drop-target) {
      background: var(--bc-tint);
    }

    /* The dives follow the count and the sync status closely. */
    :global(.list.bc-dive-list) {
      margin-top: 0;
    }

    /* Phone (task 2026-11-18-278): the dives by year in white cards on the screen's background. */
    :global(.list.bc-logbook--cards) {
      margin-bottom: 0;
    }

    /* Android: the last card scrolls clear of the + button. */
    :global(.md .list.bc-logbook--cards) {
      padding-bottom: 72px;
    }

    :global(.list.bc-logbook--cards ul) {
      background: none;
    }

    /* The title of a year: the row is measured by the virtual list, hence padding and no margin. */
    :global(li.bc-logbook--year) {
      list-style: none;
      padding: 16px 20px 8px;
    }

    :global(.bc-logbook--year-title) {
      margin: 0;
      font-size: 14px;
      line-height: 20px;
      font-weight: 600;
      color: var(--bc-text-2);

      /* iPhone (docs/mockups/ios-carnet): « 2026 · 1 plongée » in small capitals. */
      :global(.ios) & {
        font-size: 13px;
        line-height: 18px;
        font-weight: 400;
        text-transform: uppercase;
      }
    }

    :global(.ios li.bc-logbook--year) {
      padding: 10px 32px 6px;
    }

    /* A card row lifted by a long press or a drop target: the card's surface shows it, not the row's padding. */
    :global(li.bc-dive-row--card.bc-logbook--drag-lift),
    :global(li.bc-trip-row--card.bc-logbook--drag-lift) {
      background: none;
      box-shadow: none;
    }

    :global(li.bc-dive-row--card.bc-logbook--drag-lift > a),
    :global(li.bc-trip-row--card.bc-logbook--drag-lift > a) {
      box-shadow: 0 2px 6px 2px rgb(0 0 0 / 0.15), 0 1px 2px rgb(0 0 0 / 0.3);
    }

    :global(li.bc-dive-row--card.bc-logbook--drop-target),
    :global(li.bc-trip-row--card.bc-logbook--drop-target) {
      background: none;
    }

    :global(li.bc-dive-row--card.bc-logbook--drop-target > a),
    :global(li.bc-trip-row--card.bc-logbook--drop-target > a) {
      background: var(--bc-tint);
    }

    /* The filter button says when a filter is applied: a tinted circle. */
    :global(.navbar .bc-logbook--filter-on) {
      background: var(--bc-tint);
      border-radius: 50%;
    }

    /* Empty logbook (task 2026-11-15-204): a column of at most 440 dp, centred. */
    .bc-logbook--empty {
      max-width: 440px;
      margin: 16px auto 0;
      padding: 0 24px 24px;
      box-sizing: border-box;
    }

    .bc-logbook--empty-illustration {
      position: relative;
      height: 104px;
    }

    :global(.bc-logbook--empty-profile) {
      height: 104px;
    }

    /* Three white outlines rising in the water of the descent, the smallest lowest. */
    .bc-logbook--empty-bubble {
      position: absolute;
      box-sizing: border-box;
      border: 1.5px solid var(--bc-bubble);
      border-radius: 50%;
      transform: translate(-50%, -50%);
    }

    .bc-logbook--empty-bubble-1 {
      left: 18.1%;
      top: 67.3%;
      width: 5px;
      height: 5px;
    }

    .bc-logbook--empty-bubble-2 {
      left: 19.9%;
      top: 53.8%;
      width: 7px;
      height: 7px;
    }

    .bc-logbook--empty-bubble-3 {
      left: 18.4%;
      top: 38.5%;
      width: 9px;
      height: 9px;
    }

    .bc-logbook--empty-title {
      margin: 20px 0 0;
      font-size: 24px;
      line-height: 32px;
      font-weight: 500;
    }

    .bc-logbook--empty-text {
      margin: 4px 0 0;
      font-size: 16px;
      line-height: 24px;
      color: var(--bc-text-2);

      :global(.ios) & {
        font-size: 17px;
      }
    }

    .bc-logbook--empty-pair {
      margin-top: 18px;
      min-height: 56px;
      padding: 8px 16px;
      text-align: center;
      border-radius: 28px;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      background: var(--bc-primary-action);
      color: var(--bc-on-primary-action);
      font-size: 16px;
      font-weight: 500;
      text-decoration: none;

      :global(.ios) & {
        min-height: 50px;
        border-radius: 14px;
        font-weight: 600;
      }
    }

    .bc-logbook--empty-options {
      margin: 16px -8px 0;
      border-radius: 24px;
      background: var(--bc-surface);
      overflow: hidden;

      :global(.ios) & {
        border-radius: 12px;
      }
    }

    .bc-logbook--empty-option {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 10px 16px;
      min-height: 60px;
      box-sizing: border-box;
      color: var(--bc-text);
      text-decoration: none;

      & + & {
        border-top: 1px solid var(--bc-separator);
      }
    }

    .bc-logbook--empty-option-icon {
      flex: none;
      width: 44px;
      height: 44px;
      border-radius: 14px;
      background: var(--bc-secondary-container);
      color: var(--bc-secondary);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .bc-logbook--empty-option-texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .bc-logbook--empty-option-title {
      font-size: 16px;
      line-height: 22px;
      font-weight: 500;
    }

    .bc-logbook--empty-option-note {
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    .bc-logbook--empty-option-chevron {
      flex: none;
      display: flex;
      color: var(--bc-text-2);
    }

    .bc-logbook--skeleton-thumbnail {
      width: 56px;
      height: 40px;
      border-radius: 8px;
    }

    /* Depth and duration on the right, as in <DiveRow>. */
    .bc-logbook--skeleton-values {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      flex: 0 0 auto;

      .bc-logbook--value {
        line-height: 22px;
      }

      .bc-logbook--duration {
        line-height: 18px;
      }
    }

    /* A greyed bar one line of text high. */
    .bc-logbook--bar {
      display: inline-block;
      height: 0.8em;
      max-width: 100%;
      border-radius: 4px;
      vertical-align: middle;
    }

  }
</style>
