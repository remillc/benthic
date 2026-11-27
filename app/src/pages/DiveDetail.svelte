<script>
  // @ts-check
  // Dive detail screen, after the detail3 mock-ups (spec, section 4, "Full dive
  // detail" and "Conditions"): number and date, site, location, trip and
  // rating; key figures; profile; facts in a three-column grid; a collapsed
  // Conditions block; people and tags; "Gas" (drawn cylinders, gas
  // changes, SAC) and "Equipment" (collapsed: suit, total weight, main computer); photos; notes
  // in full. Edit and an overflow menu in the navbar. A row without a value is
  // never shown.
  import { onMount } from 'svelte';
  import Self from './DiveDetail.svelte';
  import { Page, Navbar, Link, List, Button, Popover, f7, theme } from 'framework7-svelte';
  import { dropPreviousPage, heldBack, heldNavigate, lockRouter } from '../lib/router-guard.js';
  import { trace } from '../lib/nav-trace.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import DiveProfile from '../components/DiveProfile.svelte';
  import DiveFigures from '../components/DiveFigures.svelte';
  import Icon from '../components/Icon.svelte';
  import { isRelease } from '../lib/edition.js';
  import { benthicPlusSubscriber } from '../lib/benthic-plus-state.svelte.js';
  import { loadValidations, refreshPending, validations } from '../lib/validation.svelte.js';
  import { loadInventory, gear } from '../lib/inventory.svelte.js';
  import { diveKeyOf } from '../lib/inventory.js';
  import { coreIdOfParam, diveParamOf, diveUrl } from '../lib/dive-id.js';
  import { isShortId } from '../lib/short-id.js';
  import { cylinderListed, fillLevels, gasChangeLine, gasChanges, unusedShown } from '../lib/gas-summary.js';
  import { reducedMotion } from '../lib/reduced-motion.js';
  import { gasName, typeHelper } from '../lib/cylinder-card.js';
  import { typeLine } from '../lib/gas-group.js';
  import { cylinderTypeLabel } from '../lib/cylinder-types.js';
  import MenuItem from '../components/MenuItem.svelte';
  import RenumberDiveDialog from '../components/RenumberDiveDialog.svelte';
  import RenumberFromDialog from '../components/RenumberFromDialog.svelte';
  import ShareSheet from '../components/ShareSheet.svelte';
  import QrShare from '../components/QrShare.svelte';
  import { qrSummary } from '../lib/qr-send.js';
  import SiteHeaderImage from '../components/SiteHeaderImage.svelte';
  import { sharePdf, shareSummary, shareLink, shareTitle } from '../lib/share.js';
  import { diveIdLink, diveLink } from '../lib/deep-link.js';
  import { filter } from '../lib/filter.svelte.js';
  import { horizontalSwipe, swipeGoesThrough, settle } from '../lib/swipe.js';
  import Stars from '../components/Stars.svelte';
  import { logbook, deleteDive, deleteDives, tripChange } from '../lib/logbook.svelte.js';
  import { openDiveVersions } from '../lib/backup-nav.js';
  import { layout, desktopMac } from '../lib/layout.svelte.js';
  import { shownTrip } from '../lib/trip-shown.js';
  import { settings } from '../lib/settings.svelte.js';
  import DiveMediaSection from '../components/DiveMediaSection.svelte';
  import { diveMediaEnabled } from '../lib/dive-media.svelte.js';
  import { offerUndo } from '../lib/undo.js';
  import { confirmAction } from '../lib/dialogs.js';
  import { readySiteMap } from '../lib/site-image.js';
  import { currentDiveId, onDiveIdsRenumbered } from '../lib/dive-ids.js';
  import { forgetDive, keepDive, loadDive as readDive, preloadDives, readyDive } from '../lib/dive-preload.js';
  import {
    formatCylinderSize,
    formatDepth,
    formatDate,
    formatDiveDay,
    formatNumber,
    formatPressure,
    formatSac,
    formatTemperature,
    formatMinutes,
    formatTimeOfDay,
  } from '../lib/format.js';
  import DesktopDiveFields from '../components/DesktopDiveFields.svelte';
  import ValidationDialog from '../components/ValidationDialog.svelte';
  import DiveDetailSkeleton from '../components/DiveDetailSkeleton.svelte';
  import { deviceStore } from '../lib/device-store.js';
  import { readTab, saveTab, stepTab, DETAIL_TABS } from '../lib/detail-tab.js';
  import { hasRecordedValues } from '../lib/desktop-edit.js';
  import { navigation } from '../lib/navigation.svelte.js';
  import { startup } from '../lib/startup.svelte.js';
  import { t, tIfExists } from '../lib/i18n.js';

  /**
   * `slide`: the dive was reached by a swipe from the next or previous one. `preview`: the detail kept at the last start
   * (lib/detail-snapshot.js), drawn in the pane while the core reads the logbook: nothing here reads or acts on data then.
   * @type {{ f7route: { params: { id: string, trip?: string }, url: string }, f7router: any, slide?: 'next'|'previous', preview?: import('benthic-core').DiveDetail }}
   */
  let { f7route, f7router, slide = undefined, preview = undefined } = $props();

  // --- Swipe left or right: the next (older) or previous (more recent) dive,
  // in the order of the logbook list, its filter applied. Not from the
  // profile, which reads time and depth under the finger.

  /** The dive ids of the list, from the most recent to the oldest. */
  function listOrder() {
    return [...logbook.dives]
      .filter((d) => !filter.ids || filter.ids.has(d.id))
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((d) => d.id);
  }

  /** @param {1|-1} step 1: the next (older) dive; -1: the previous one */
  function goTo(step) {
    const ids = listOrder();
    const at = ids.indexOf(Number(diveId));
    const id = at < 0 ? undefined : ids[at + step];
    if (id === undefined) return;
    // The same kind of route as this one: /dives/<id> (beside the list in the
    // Logbook) or /trips/<trip>/dives/<id>; only the dive changes.
    const base = f7route.url.replace(/[^/?]+(\?.*)?$/, '');
    f7router.navigate(`${base}${diveParamOf(id)}`, { reloadCurrent: true, props: { slide: step > 0 ? 'next' : 'previous' } });
  }

  /** The neighbour dive's id on the side of a swipe of `dx`, or undefined. @param {number} dx */
  function neighbourId(dx) {
    const ids = listOrder();
    const at = ids.indexOf(Number(diveId));
    return at < 0 ? undefined : ids[at + (dx < 0 ? 1 : -1)];
  }

  /**
   * The list under the dive pages is left « stacked » by Framework7 (`display: none` on a phone) while a second page
   * sits over the first dive. When the swipe leaves one dive page over the list, the list is unstacked, as Framework7
   * does when it goes back itself: a Back to a list that stays hidden never ends its transition (the view stayed in
   * « router-transition-backward » with the dive page on screen).
   * @param {HTMLElement} view
   */
  function unstackMaster(view) {
    if (f7router.history.length > 2) return;
    for (const el of view.querySelectorAll(':scope > .page-master-stacked')) {
      el.classList.remove('page-master-stacked');
      f7.$(el).trigger('page:masterunstack');
    }
  }

  /**
   * Phone (Christian's request of 14 November 2026): the two dives side by side. As soon as the
   * finger moves, the neighbour dive's page opens without animation beside this one (its detail is
   * preloaded), and both follow the finger (the --bc-push-dx of theme.css, as Réglages → À propos).
   * Through: this page leaves the history, so that back still goes to the list. Not through: back
   * to this one, without animation. The router is held from the first move to the end (lib/router-guard.js); when the
   * system takes the touch (its own Back gesture from the edge), everything is put back at once (`cancel`), so that
   * the Back that follows finds the view at rest.
   * @param {HTMLElement} pageEl
   */
  function sideBySide(pageEl) {
    /** @type {null|{ view: HTMLElement, dir: -1|1, width: number }} */
    let push = null;
    let busy = false;
    /** Releases the router hold taken when the swipe started. */
    let unlock = () => {};
    const clamp = (/** @type {number} */ dx) => (push ? (push.dir < 0 ? Math.min(dx, 0) : Math.max(dx, 0)) : dx);
    return {
      /** @param {number} dx */
      move(dx) {
        if (busy) return;
        if (!push) {
          const id = neighbourId(dx);
          const view = /** @type {HTMLElement|null} */ (pageEl.parentElement);
          if (id === undefined || !view) return false;
          push = { view, dir: dx < 0 ? -1 : 1, width: view.clientWidth };
          // Until this swipe has settled, a Back or a link waits (or is ignored): the history is rewritten at the end.
          unlock = lockRouter(f7router, 'dive-swipe');
          trace('swipe', 'dive');
          pageEl.classList.add('bc-push-from');
          view.style.setProperty('--bc-push-dx', '0px');
          view.classList.add('bc-pushing');
          if (push.dir > 0) view.classList.add('bc-pushing-back');
          const base = f7route.url.replace(/[^/?]+(\?.*)?$/, '');
          heldNavigate(f7router, `${base}${id}`, { animate: false });
        }
        push.view.style.setProperty('--bc-push-dx', `${clamp(dx)}px`);
        return true;
      },
      /** The system took the touch: back to this dive at once, no animation. */
      cancel() {
        if (!push || busy) return false;
        settled(push.view, false);
        return true;
      },
      /** @param {number} dx @param {number} velocity */
      end(dx, velocity) {
        if (!push) return false;
        const { view, dir, width } = push;
        const x = clamp(dx);
        const through = x !== 0 && swipeGoesThrough(x, velocity, width);
        const target = through ? dir * width : 0;
        const { easing, ms } = settle(x, target, x !== 0 ? velocity : 0);
        busy = true;
        view.style.setProperty('--bc-push-ease', easing);
        view.style.setProperty('--bc-push-ms', `${ms}ms`);
        view.classList.add('bc-push-settle');
        view.style.setProperty('--bc-push-dx', `${target}px`);
        setTimeout(() => settled(view, through), ms);
        return true;
      },
    };

    /**
     * The end of the swipe: the history takes its final shape and the view is given back to the router.
     * @param {HTMLElement} view
     * @param {boolean} through the neighbour dive stays
     */
    function settled(view, through) {
      try {
        // The history is rewritten only when it still is what the swipe made: the neighbour on top, this dive's page
        // just under it, and this page still in the document.
        const intact = pageEl.isConnected && f7router.history.length >= 2;
        // Through: this dive's page leaves the history, the new one takes its place. Else back to this dive.
        if (through && intact) dropPreviousPage(f7router, pageEl);
        else if (!through && intact) heldBack(f7router, { animate: false });
      } finally {
        unstackMaster(view);
        view.classList.remove('bc-pushing', 'bc-pushing-back', 'bc-push-settle');
        for (const p of ['--bc-push-dx', '--bc-push-ease', '--bc-push-ms']) view.style.removeProperty(p);
        pageEl.classList.remove('bc-push-from');
        unlock();
        trace('swipe-end', through ? 'dive through' : 'dive reset');
      }
      push = null;
      busy = false;
    }
  }

  /**
   * Beside the list (tablet, 27 November 2026): the two neighbour dives are drawn ahead, as previews just outside the pane
   * (`ghosts`), once this dive is shown and the device is quiet. A swipe then moves this page and the neighbour's preview,
   * already laid out, with the finger: nothing is built while it moves (building the neighbour's page took about 200 ms on
   * a Galaxy Tab S6 Lite, the delay Christian felt before the page moved). Through, the real page replaces the preview,
   * which already sits where it will be.
   * @type {{ next: import('benthic-core').DiveDetail|null, previous: import('benthic-core').DiveDetail|null }}
   */
  let ghosts = $state({ next: null, previous: null });
  const GHOST_SIDES = /** @type {('next'|'previous')[]} */ (['next', 'previous']);
  /** The neighbour ids the previews are for (`next` is the older dive, reached by a swipe to the left). */
  let ghostIds = { next: /** @type {number|undefined} */ (undefined), previous: /** @type {number|undefined} */ (undefined) };
  let ghostTimer = /** @type {any} */ (0);
  function prepareGhosts() {
    clearTimeout(ghostTimer);
    if (preview || !layout.split || layout.desktop) return;
    ghostTimer = setTimeout(async () => {
      const ids = listOrder();
      const at = ids.indexOf(Number(diveId));
      if (at < 0) return;
      ghostIds = { next: ids[at + 1], previous: ids[at - 1] };
      for (const side of /** @type {const} */ (['next', 'previous'])) {
        const id = ghostIds[side];
        if (id === undefined) {
          ghosts[side] = null;
          continue;
        }
        try {
          ghosts[side] = readyDive(id) ?? (await readDive(id));
        } catch {
          ghosts[side] = null;
        }
      }
    }, 350);
  }
  /** The url of a neighbour's page, the same kind of route as this one. @param {number} id */
  const neighbourUrl = (id) => `${f7route.url.replace(/[^/?]+(\?.*)?$/, '')}${diveParamOf(id)}`;

  /**
   * A preview moves into the view beside this page: the page's place and size, shown one width to the side while swiped.
   * @param {HTMLElement} node @param {'next'|'previous'} side
   */
  function ghostPlace(node, side) {
    const pageEl = /** @type {HTMLElement|null} */ (node.closest('.page'));
    const view = pageEl?.parentElement;
    if (!pageEl || !view) return;
    const fit = () => {
      node.style.left = `${pageEl.offsetLeft}px`;
      node.style.top = `${pageEl.offsetTop}px`;
      node.style.width = `${pageEl.offsetWidth}px`;
      node.style.height = `${pageEl.offsetHeight}px`;
    };
    fit();
    node.dataset.side = side;
    view.appendChild(node);
    /** @type {any} */ (node).bcFit = fit;
    return { destroy: () => node.remove() };
  }

  /**
   * Beside the list: this page and the neighbour's preview follow the finger (`ghosts`). Without a preview on that side
   * (the first or last dive, or not drawn yet), false: the page only gives a little.
   * @param {HTMLElement} pageEl
   */
  function ghostSwipe(pageEl) {
    /** @type {null|{ ghost: HTMLElement, dir: -1|1, width: number, id: number }} */
    let push = null;
    let busy = false;
    let unlock = () => {};
    const place = (/** @type {number} */ x) => {
      if (!push) return;
      pageEl.style.transform = `translate3d(${x}px, 0, 0)`;
      push.ghost.style.transform = `translate3d(${-push.dir * push.width + x}px, 0, 0)`;
    };
    const clear = () => {
      for (const el of [pageEl, push?.ghost]) {
        if (!el) continue;
        el.style.transition = '';
        el.style.transform = '';
        el.style.willChange = '';
      }
    };
    return {
      /** @param {number} dx */
      move(dx) {
        if (busy) return true;
        if (!push) {
          const side = dx < 0 ? 'next' : 'previous';
          const id = ghostIds[side];
          const view = pageEl.parentElement;
          const ghost = /** @type {HTMLElement|null} */ (view?.querySelector(`:scope > .bc-dive-ghost[data-side="${side}"]`) ?? null);
          if (id === undefined || !ghost || !ghosts[side]) return false;
          /** @type {any} */ (ghost).bcFit?.();
          push = { ghost, dir: dx < 0 ? -1 : 1, width: pageEl.offsetWidth, id };
          unlock = lockRouter(f7router, 'dive-swipe');
          trace('swipe', 'dive preview');
          pageEl.style.willChange = 'transform';
          ghost.style.willChange = 'transform';
          ghost.classList.add('bc-dive-ghost--shown');
        }
        place(push.dir < 0 ? Math.min(dx, 0) : Math.max(dx, 0));
        return true;
      },
      cancel() {
        if (!push || busy) return false;
        push.ghost.classList.remove('bc-dive-ghost--shown');
        clear();
        push = null;
        unlock();
        return true;
      },
      /** @param {number} dx @param {number} velocity */
      end(dx, velocity) {
        if (!push) return false;
        const p = push;
        const x = p.dir < 0 ? Math.min(dx, 0) : Math.max(dx, 0);
        const through = x !== 0 && swipeGoesThrough(x, velocity, p.width);
        const target = through ? p.dir * p.width : 0;
        const { easing, ms } = settle(x, target, x !== 0 ? velocity : 0);
        busy = true;
        for (const el of [pageEl, p.ghost]) el.style.transition = `transform ${ms}ms ${easing}`;
        place(target);
        setTimeout(() => {
          trace('swipe-end', through ? 'dive preview through' : 'dive preview reset');
          unlock();
          if (through) {
            // The real page takes the preview's place, without animation: the preview stays on screen until it is there.
            f7router.navigate(neighbourUrl(p.id), { reloadCurrent: true, animate: false });
          } else {
            p.ghost.classList.remove('bc-dive-ghost--shown');
            clear();
          }
          push = null;
          busy = false;
        }, ms);
        return true;
      },
    };
  }

  /**
   * The page follows the finger; lifted past a quarter of the width (or
   * flicked), it goes out on that side and the next dive comes in from the
   * other; otherwise it comes back. At the first or last dive it only gives
   * a little. On a phone the next dive is beside it all the way (sideBySide).
   * @param {any} page Framework7's page
   */
  function watchSwipes(page) {
    const content = /** @type {HTMLElement|null} */ (page.el.querySelector('.page-content'));
    if (!content) return;
    const pair = sideBySide(page.el);
    const beside = ghostSwipe(page.el);
    /** @param {number} dx */
    const hasNeighbour = (dx) => {
      const ids = listOrder();
      const at = ids.indexOf(Number(diveId));
      return at >= 0 && ids[at + (dx < 0 ? 1 : -1)] !== undefined;
    };
    horizontalSwipe(content, {
      accept: (e) => !(/** @type {HTMLElement} */ (e.target).closest('.bc-dive-profile--profile')) && !document.querySelector('.modal-in:not(.toast)'),
      move(dx) {
        if (layout.split ? beside.move(dx) : pair.move(dx)) return;
        const shown = hasNeighbour(dx) ? dx : dx / 3;
        content.style.transition = '';
        content.style.transform = `translateX(${shown}px)`;
        content.style.opacity = String(1 - Math.min(Math.abs(shown) / content.clientWidth, 1) / 2);
      },
      cancel() {
        if (layout.split ? beside.cancel() : pair.cancel()) return;
        content.style.transition = '';
        content.style.transform = '';
        content.style.opacity = '';
      },
      end(dx, velocity) {
        if (layout.split ? beside.end(dx, velocity) : pair.end(dx, velocity)) return;
        const width = content.clientWidth;
        const neighbour = hasNeighbour(dx);
        const through = neighbour && swipeGoesThrough(dx, velocity, width);
        // On from where the finger left it, at its speed (a third of both without a neighbour).
        const shown = neighbour ? dx : dx / 3;
        const { easing, ms } = settle(shown, through ? (dx < 0 ? -width : width) : 0, neighbour ? velocity : velocity / 3);
        content.style.transition = `transform ${ms}ms ${easing}, opacity ${ms}ms ease-out`;
        if (through) {
          content.style.transform = `translateX(${dx < 0 ? -width : width}px)`;
          content.style.opacity = '0';
          setTimeout(() => goTo(dx < 0 ? 1 : -1), ms);
        } else {
          content.style.transform = '';
          content.style.opacity = '';
        }
      },
    });
  }


  const uid = $props.id();
  const menuId = `dive-menu-${uid}`;
  // The address holds the dive's Benthic id (lib/dive-id.js); `diveId` is the core's id of the dive in this session, for the
  // core's calls. Every address built here uses `diveParam`. The core numbers its dives again whenever it reads the log again
  // (a change from another device arrives): a Benthic id in the address still names the dive, so the page only reads it again;
  // an old numeric address (a dive with no id yet, a link in flight) follows the renumbering: `renumbered` holds the new
  // address from that moment, until the route says the same.
  let renumbered = $state(/** @type {string|null} */ (null));
  const diveParam = $derived(renumbered ?? f7route.params.id);
  const diveId = $derived(String(coreIdOfParam(diveParam)));

  /** The dive shown has a new id (the log was read again), or is gone: the route follows in place, with no page change. */
  function followRenumbering() {
    if (preview) return;
    // This page is the one the router shows (another page may lie over it).
    const shown = f7router.currentRoute?.url === f7route.url;
    const base = f7route.url.replace(/[^/?]+(\?.*)?$/, '');
    const gone = () => {
      showSnackbar(t('detail.deletedElsewhere'));
      if (!shown) return;
      if (layout.split) f7router.navigate('/pane/empty', { reloadDetail: true, animate: false });
      else f7router.back();
    };
    if (isShortId(diveParam)) {
      if (!coreIdOfParam(diveParam)) return gone();
      forgetDive(Number(diveId));
      loadDive();
      return;
    }
    const was = Number(diveParam);
    const now = currentDiveId(was);
    if (now === was) return;
    forgetDive(was);
    if (now === null) return gone();
    renumbered = diveParamOf(now);
    if (!shown) {
      loadDive();
      return;
    }
    f7router.navigate(`${base}${renumbered}`, layout.split ? { reloadDetail: true, animate: false } : { reloadCurrent: true, animate: false });
  }

  // "Delete the dive" (⋮ menu, task 2026-11-07-28, to-do #15): the same
  // confirmation as a Logbook selection of one dive, then the core's undoable
  // delete as in Subsurface and back to the logbook with "Annuler" for 10
  // seconds; undone, the dive is back at its place. Beside the list (tablet),
  // the next dive of the list takes its place, or the empty pane when none is
  // left.
  function confirmDelete() {
    confirmAction({
      title: t('logbook.deleteTitle', { n: 1 }),
      text: t(logbook.mode === 'git' ? 'logbook.deleteTextGit' : 'logbook.deleteText', { n: 1 }),
      action: t('logbook.deleteAction'),
      onConfirm: deleteNow,
    });
  }

  async function deleteNow() {
    const id = Number(diveId);
    const order = [...logbook.dives].sort((a, b) => b.date.localeCompare(a.date));
    const at = order.findIndex((d) => d.id === id);
    const next = order[at + 1] ?? order[at - 1];
    try {
      await deleteDive(id);
      forgetDive(id);
      if (layout.split && next) f7router.navigate(diveUrl(next), { reloadDetail: true });
      else f7router.back();
      offerUndo(t('detail.deleted'), undefined, 10000);
    } catch (e) {
      const code = String(/** @type {any} */ (e)?.message ?? '');
      console.error('Delete a dive', code);
      f7.dialog
        .create({
          title: t('detail.deleteTitle'),
          text: code.startsWith('WRITE_LOCKED') ? t('edit.writeLocked') : t('detail.deleteFailed'),
          buttons: [{ text: t('dialog.ok') }],
        })
        .open();
    }
  }

  function confirmDeleteSelected() {
    f7.popover.close(`#${menuId}`);
    const ids = logbook.checkedDiveIds.filter((id) => logbook.dives.some((d) => d.id === id));
    if (!ids.length) return;

    const selected = new Set(ids);
    const currentId = Number(diveId);
    const order = listOrder();
    const at = order.indexOf(currentId);
    const nextId = selected.has(currentId) && at >= 0
      ? order.slice(at + 1).find((id) => !selected.has(id)) ?? order.slice(0, at).reverse().find((id) => !selected.has(id))
      : undefined;

    confirmAction({
      title: t('logbook.deleteTitle', { n: ids.length }),
      text: t(logbook.mode === 'git' ? 'logbook.deleteTextGit' : 'logbook.deleteText', { n: ids.length }),
      action: t('logbook.deleteAction'),
      onConfirm: async () => {
        try {
          await deleteDives(ids);
          for (const id of ids) forgetDive(id);
          logbook.checkedDiveIds = [];
          if (selected.has(currentId)) {
            if (layout.split && nextId !== undefined) {
              const base = f7route.url.replace(/[^/?]+(\?.*)?$/, '');
              f7router.navigate(`${base}${nextId}`, { reloadDetail: true });
            } else {
              f7router.back();
            }
          }
          offerUndo(t('logbook.deleted', { n: ids.length }), undefined, 10000);
        } catch (e) {
          const code = String(/** @type {any} */ (e)?.message ?? '');
          console.error('Delete selected dives', code);
          f7.dialog
            .create({
              title: t('logbook.deleteTitle', { n: ids.length }),
              text: code.startsWith('WRITE_LOCKED') ? t('edit.writeLocked') : t('logbook.selectionFailed'),
              buttons: [{ text: t('dialog.ok') }],
            })
            .open();
        }
      },
    });
  }

  // The list beside it highlights the dive shown, unless it was opened from inside the
  // detail pane (from a trip): the list and its selected row do not change then.
  $effect(() => {
    const id = diveId;
    if (preview || f7route.params.trip) return;
    navigation.dive = id;
    return () => {
      if (navigation.dive === id) navigation.dive = null;
    };
  });

  // Prepared before the swipe that led here (dive-preload.js): shown from the
  // first frame, then read again from the core in case it changed.
  // svelte-ignore state_referenced_locally
  let dive = $state(/** @type {import('benthic-core').DiveDetail|null} */ (preview ?? readyDive(coreIdOfParam(f7route.params.id))));
  let failed = $state(false);
  const prefs = $derived(logbook.prefs);
  const diveNumber = $derived(logbook.dives.find((d) => d.id === dive?.id)?.number ?? dive?.number ?? 0);

  // After an edit or an undo of this dive, show the result at once.
  $effect(() => {
    const edited = logbook.edited;
    if (!preview && edited && dive && edited.id === dive.id) {
      dive = edited.dive;
      keepDive(edited.id, edited.dive);
    }
  });

  async function loadDive() {
    const id = Number(diveId);
    try {
      dive = await readDive(id);
      // The first screen is up: what waited for it starts (lib/startup.svelte.js).
      if (!preview && !f7route.params.trip) startup.detail = true;
    } catch (e) {
      // A dive that is gone (deleted on another device) is handled by `followRenumbering`, not reported.
      if (!/dive not found/i.test(String(/** @type {any} */ (e)?.message ?? e))) console.error('Dive detail', e);
      failed = true;
      return;
    }
    // The dives a swipe can lead to, the next (older) one first. Beside the list (desktop) there is no swipe.
    if (layout.desktop) return;
    const ids = listOrder();
    const at = ids.indexOf(id);
    if (at >= 0) preloadDives([ids[at + 1], ids[at - 1]].filter((n) => n !== undefined));
    prepareGhosts();
  }

  /** « Réessayer » on the error state: reads the dive again. */
  function retry() {
    failed = false;
    loadDive();
  }
  // Validations (task 2026-11-19-309, point 2): Benthic+ only. The pending ones are asked about when the page opens.
  onMount(() => {
    if (preview) return;
    const stopFollowing = onDiveIdsRenumbered(followRenumbering);
    if (benthicPlusSubscriber()) (validations.ready ? Promise.resolve() : loadValidations()).then(refreshPending).catch((e) => console.error('Validations', e));
    if (isRelease) loadInventory();
    loadDive();
    return stopFollowing;
  });

  /**
   * « Faire signer la plongée » (task 2026-11-22-330): a dialog on a tablet and on the desktop, the full screen of the
   * phone elsewhere. The steps are the same (components/ValidationSteps.svelte).
   */
  let validating = $state(false);
  function startValidation() {
    if (layout.split || layout.desktop) validating = true;
    else f7router.navigate(`/validate?ids=${diveId}`);
  }

  /** "Renuméroter la plongée" open. */
  let renumbering = $state(false);
  let renumberingFrom = $state(false);

  /** "Partager" open: the sheet, then the system's share sheet. */
  // The map behind the header: the top bar is see-through over it,
  // and gets its colour back as soon as the text scrolls under it.
  // True from the first frame when the picture was prepared ahead (no flash of the plain header).
  let imageShown = $state(
    (() => {
      const c = dive?.siteCoordinates;
      return !!c && readySiteMap(c.latUdeg, c.lonUdeg) !== null;
    })(),
  );
  let scrolled = $state(false);
  // The site's name moves into the top bar once the page's title has gone under it.
  let titleInBar = $state(false);
  /** @param {HTMLElement} node */
  function watchScroll(node) {
    const scroller = node.closest('.page-content');
    if (!scroller) return;
    const update = () => {
      scrolled = scroller.scrollTop > 12;
      const title = node.querySelector('.bc-dive-detail--site');
      const bar = scroller.closest('.page')?.querySelector('.navbar');
      titleInBar = !!title && !!bar && title.getBoundingClientRect().bottom <= bar.getBoundingClientRect().bottom;
    };
    scroller.addEventListener('scroll', update, { passive: true });
    return { destroy: () => scroller.removeEventListener('scroll', update) };
  }

  let sharing = $state(false);
  let qrSharing = $state(false);
  /** @param {'pdf'|'summary'|'link'} kind */
  async function share(kind) {
    sharing = false;
    if (!dive) return;
    // The profile chart of this page (the current one in its view).
    const svg = /** @type {SVGSVGElement|null} */ (document.querySelector('.page-current .bc-dive-profile--profile .bc-dive-profile--frame svg'));
    try {
      if (kind === 'link') await shareLink(diveIdLink(dive.benthicId) ?? diveLink(dive.date) ?? '', shareTitle(dive));
      else if (kind === 'pdf') await sharePdf(dive, prefs, svg);
      else await shareSummary(dive, prefs, svg);
    } catch (e) {
      // Closing the system's share sheet without choosing is not an error.
      const message = String(/** @type {any} */ (e)?.message ?? '');
      if (/cancel/i.test(message)) return;
      console.error('Share a dive', e);
      showSnackbar(t('share.failed'));
    }
  }

  /** Secondary facts in a three-column grid (detail3 mock-ups); a fact without a value is hidden. */
  const facts = $derived.by(() => {
    if (!dive) return [];
    /** @type {[string, string|null|undefined|false][]} */
    const list = [
      [t('detail.airTemperature'), formatTemperature(dive.airTempMk, prefs)],
      [t('detail.water'), dive.waterType && tIfExists(`detail.waterTypes.${dive.waterType}`)],
      // Always in mbar, as Subsurface shows it.
      [t('detail.surfacePressure'), dive.surfacePressureMbar > 0 && `${formatNumber(dive.surfacePressureMbar, 0)} mbar`],
      [t('detail.mode'), tIfExists(`detail.modes.${dive.divemode}`) ?? dive.divemode],
      [t('detail.cns'), dive.cns > 0 && `${formatNumber(dive.cns, 0)}\u00A0%`],
      [t('detail.otu'), dive.otu > 0 && formatNumber(dive.otu, 0)],
    ];
    return list.filter(([, value]) => value).map(([label, value]) => ({ label, value: String(value) }));
  });

  const rebreather = $derived(dive ? dive.divemode === 'CCR' || dive.divemode === 'PSCR' : false);

  /** The dive can leave its trip only when the logbook shows that trip (lib/trip-shown.js, task 2026-11-12-67). */
  const removableFromTrip = $derived(
    !!shownTrip(dive, logbook.dives),
  );

  // "Retirer du voyage": at once, as Subsurface's "Remove dive(s) from trip".
  // A trip left empty is deleted by the core; "Annuler" brings both back.
  async function removeFromTrip() {
    f7.popover.close(`#${menuId}`);
    const tripId = dive?.trip?.id;
    const last = logbook.dives.filter((d) => d.trip?.id === tripId).length <= 1;
    try {
      await tripChange({ action: 'remove', diveIds: [Number(diveId)] });
      await loadDive();
      offerUndo(t(last ? 'detail.removedFromTripEmpty' : 'detail.removedFromTrip'), loadDive);
    } catch (e) {
      const code = String(/** @type {any} */ (e)?.message ?? '');
      console.error('Remove from trip', code);
      showSnackbar(code.startsWith('WRITE_LOCKED') ? t('edit.writeLocked') : t('detail.removeFromTripFailed'));
    }
  }

  /** The dive's trip as the logbook shows it (lib/trip-shown.js): a trip of one dive is no trip. */
  const trip = $derived(shownTrip(dive, logbook.dives));

  /** Location line under the title, from the site's taxonomy; empty when unknown. */
  const location = $derived(
    dive?.siteLocation
      ? [dive.siteLocation.city, dive.siteLocation.region, dive.siteLocation.country].filter(Boolean).join(', ')
      : '',
  );

  const gasWords = $derived({
    air: t('edit.gasName.air'),
    oxygen: t('edit.gasName.oxygen'),
    nitrox: t('edit.gasName.nitrox'),
    trimix: t('edit.gasName.trimix'),
  });

  /** A pressure without its unit, to sit before the end pressure: "2 683". @param {number} mbar */
  const pressureValue = (mbar) => formatNumber(mbar / (prefs.pressure === 'psi' ? 68.947572932 : 1000), 0);

  /**
   * The cylinders of the "Gas" card, one entry each: the gas in plain words, the
   * use and size ("Dil2, 16 cuft HP"; the use when the cylinder has no type), the
   * pressure from start to end in the diver's unit and the drawn levels.
   */
  const gasCylinders = $derived.by(() => {
    if (!dive) return [];
    return dive.cylinders
      .filter((c) => cylinderListed(c, prefs.includeUnusedTanks !== false))
      .map((c) => {
        const unused = unusedShown(c);
        const levels = unused ? { end: 1, start: null, hatched: !unused.pressureMbar } : fillLevels(c.startMbar, c.endMbar, c.workingPressureMbar);
        const size = typeHelper(formatCylinderSize(c.sizeMl, c.workingPressureMbar, prefs), c.workingPressureMbar);
        const use = c.use === 'diluent' || c.use === 'oxygen' ? t(`detail.cylinderUseNames.${c.use}`) : rebreather ? t('detail.cylinderUseNames.bailout') : '';
        return {
          gas: gasName(c.o2Permille, c.hePermille, gasWords),
          use: c.use,
          line: typeLine(cylinderTypeLabel(c.description), size, use),
          start: c.startMbar > 0 && c.endMbar > 0 ? pressureValue(c.startMbar) : '',
          end: c.endMbar > 0 ? formatPressure(c.endMbar, prefs) : '',
          // An unused cylinder without pressure gets no line (Christian, 13 November 2026).
          range: unused
            ? unused.pressureMbar
              ? formatPressure(unused.pressureMbar, prefs)
              : ''
            : c.startMbar > 0 && c.endMbar > 0
              ? t('detail.pressureRange', { start: pressureValue(c.startMbar), end: formatPressure(c.endMbar, prefs) })
              : c.startMbar > 0
                ? formatPressure(c.startMbar, prefs)
                : '',
          ratio: levels.end,
          startRatio: levels.start,
          // Start and end not both known: the drawing is hatched (13 November 2026).
          hatched: levels.hatched,
          // No pressure at all (task 2026-11-13-84): the accessible name says so.
          noPressure: !(c.startMbar > 0) && !(c.endMbar > 0) && !unused?.pressureMbar,
        };
      });
  });

  /**
   * The gas changes, in one plain line: "Switch to air at 222 ft." (nothing when
   * there is none). None on a rebreather dive (Christian, 13 November 2026).
   */
  const gasChangesLine = $derived(
    dive && dive.divemode !== 'CCR'
      ? gasChangeLine(gasChanges(dive.events ?? [], dive.samples, dive.cylinders), (mm) => formatDepth(mm, prefs), {
          line: t('detail.gasChange.line'),
          item: t('detail.gasChange.item'),
          then: t('detail.gasChange.then'),
          to: {
            air: t('detail.gasChange.to.air'),
            oxygen: t('detail.gasChange.to.oxygen'),
            nitrox: t('detail.gasChange.to.nitrox'),
            trimix: t('detail.gasChange.to.trimix'),
          },
        })
      : '',
  );

  /** SAC: only when the core computes one, never on a rebreather dive. */
  const sac = $derived(dive && !rebreather && dive.sacMlMin > 0 ? formatSac(dive.sacMlMin, prefs) : '');

  // --- Desktop (task 2026-11-15-169, mock-up bureau-carnet-profil-droite): a compact header with
  // the actions, the profile in a white card read by hovering, a row of key figures, then tabs.
  const desk = $derived(layout.desktop);
  const selectionMenuActive = $derived(layout.split && !desk && !f7route.params.trip && logbook.checkedDiveIds.length > 0);
  /** The last tab chosen is kept for the next dive and the next session (task 2026-11-15-191). */
  let tab = $state(readTab(deviceStore));
  const deskTabs = DETAIL_TABS;
  /** iPhone (task 2026-11-24-387): a segmented control « Infos, Équipement, Gaz, Notes, Carte » instead of the Material tabs. */
  const iosPhone = $derived(theme.ios && layout.phone);
  /** @param {import('../lib/detail-tab.js').DetailTab} key */
  function chooseTab(key) {
    tab = key;
    saveTab(deviceStore, key);
  }
  /** The key figures: Prof. max, Durée, Prof. moy., Temp., Gaz, Consommation (those known). */
  const deskFigures = $derived.by(() => {
    if (!dive) return [];
    const first = gasCylinders[0];
    const gas = first ? [first.gas, first.start && first.end ? `${first.start} → ${first.end}` : ''].filter(Boolean).join(' · ') : '';
    return [
      { label: t('desktop.figure.maxDepth'), value: dive.maxDepthMm ? formatDepth(dive.maxDepthMm, prefs) : '' },
      { label: t('desktop.figure.duration'), value: dive.durationSeconds ? formatMinutes(dive.durationSeconds) : '' },
      { label: t('desktop.figure.meanDepth'), value: dive.meanDepthMm ? formatDepth(dive.meanDepthMm, prefs) : '' },
      { label: t('desktop.figure.temperature'), value: dive.waterTempMk ? formatTemperature(dive.waterTempMk, prefs) : '' },
      { label: t('desktop.figure.gas'), value: gas },
      { label: t('desktop.figure.sac'), value: sac },
    ].filter((x) => x.value);
  });
  /** « Agrandir le profil »: the profile fills the pane; Échap returns. */
  let profileBig = $state(false);
  /**
   * The icons right of the title (task 2026-11-15-194). Export, share and delete act through the
   * Carnet's selection, which is this dive: the table handles them (DesktopLogbook.svelte).
   * @param {'export'|'share'|'delete'} command
   */
  function deskCommand(command) {
    window.dispatchEvent(new CustomEvent('bc-desktop-command', { detail: command }));
  }
  $effect(() => {
    if (!desk || preview) return;
    /** @param {KeyboardEvent} e */
    const key = (e) => {
      if (profileBig && e.key === 'Escape') profileBig = false;
      else if ((desktopMac ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === 'p' && navigation.section === 'logbook') {
        e.preventDefault();
        profileBig = !profileBig;
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
  /** ← → between the tabs (WAI-ARIA tabs). @param {KeyboardEvent} e */
  function tabKey(e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next = stepTab(layout.phone ? phoneTab : tab, e.key);
    if (layout.phone) scrollToGroup(next);
    else chooseTab(next);
    /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.currentTarget).querySelector(`[data-tab="${next}"]`))?.focus();
  }


  // --- Tablet and phone (tasks 2026-11-24-382, 386 and 387): the desktop's tabs and cards, edited in place. A tablet shows the
  // tab chosen (kept like the desktop's); a phone is one page of five groups, the tab row sticks under the top bar, a tap on a
  // tab scrolls to its group and the tab of the group in view is the selected one.
  /** The dive's trip, as the Informations tab's Conditions card names it. */
  const tripText = $derived(trip ? trip.location || t('trip.startingOn', { date: formatDate(logbook.dives.filter((d) => d.trip?.id === trip.id).map((d) => d.date).sort()[0]) }) : '');
  /** The phone's selected tab: the group nearest the top of the page. */
  let phoneTab = $state(/** @type {import('../lib/detail-tab.js').DetailTab} */ ('info'));
  /** @param {import('../lib/detail-tab.js').DetailTab} key */
  function scrollToGroup(key) {
    phoneTab = key;
    document.querySelector(`.page-current [data-group="${key}"]`)?.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }
  /**
   * Keeps the selected tab and the tab row's own scroll in step with the groups on a phone.
   * @param {HTMLElement} node the sticky tab row's box
   */
  function watchTabs(node) {
    const scroller = node.closest('.page-content');
    if (!scroller) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      if (!layout.phone) return;
      const line = node.getBoundingClientRect().bottom + 8;
      /** @type {import('../lib/detail-tab.js').DetailTab} */
      let current = 'info';
      for (const group of scroller.querySelectorAll('[data-group]')) if (group.getBoundingClientRect().top <= line) current = /** @type {import('../lib/detail-tab.js').DetailTab} */ (group.getAttribute('data-group'));
      if (current !== phoneTab) {
        phoneTab = current;
        const button = /** @type {HTMLElement|null} */ (node.querySelector(`[data-tab="${current}"]`));
        const row = /** @type {HTMLElement|null} */ (node.firstElementChild);
        if (button && row) row.scrollTo({ left: button.offsetLeft - (row.clientWidth - button.offsetWidth) / 2, behavior: 'smooth' });
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    scroller.addEventListener('scroll', schedule, { passive: true });
    update();
    return { destroy: () => scroller.removeEventListener('scroll', schedule) };
  }

</script>

<!--
  Benthic+ only (tasks 2026-11-23-359 and 370): the thumbnails of the dive's photos and videos, synced. Never in the free
  version, the demo logbook or a preview; the pictures referenced in the logbook stay untouched. Only with the notes
  (task 2026-11-27-413).
-->
{#snippet media()}
  {#if dive && diveMediaEnabled() && !preview}
    <DiveMediaSection diveId={diveKeyOf(dive)} readOnly={gear.readOnly} dive={{ number: diveNumber, site: dive.site, date: dive.date, samples: dive.samples, siteCoordinates: dive.siteCoordinates }} {prefs} />
  {/if}
{/snippet}

<!-- no-swipeback: here a swipe to the right shows the previous dive. -->
<Page data-bc-scroll onPageInit={watchSwipes} class="bc-dive-detail no-swipeback {desk ? 'bc-dive-detail--desk' : ''} {imageShown && !scrolled ? 'bc-dive-detail--on-image' : ''} {slide ? `bc-slide-${slide}` : ''}">
  <Navbar>
    <!-- The site's name, shown once the page's own title has scrolled under the bar. -->
    {#snippet title()}
      {#if dive}
        <span class="bc-dive-detail--bar-title" class:bc-dive-detail--bar-title-shown={titleInBar} aria-hidden={!titleInBar}>{dive.site || t('dive.siteNotSet')}</span>
      {/if}
    {/snippet}
    <!-- Named back link: in MD3, Framework7 hides its text and TalkBack would read "#". -->
    {#snippet left()}
      {#if iosPhone}
        <!-- iPhone: « ‹ Carnet » (the title of the screen it goes back to). -->
        <Link back>
          <i class="icon icon-back"></i>
          <span>{t('tabs.logbook')}</span>
        </Link>
      {:else}
        <Link back iconOnly>
          <i class="icon icon-back"></i>
          <span class="bc-sr-only">{t('detail.back')}</span>
        </Link>
      {/if}
    {/snippet}
    <!-- The actions of a dive are in the ⋮ menu (tasks 2026-11-24-382, 386, 387): no « Modifier » on a phone or a tablet, every field is edited in place. -->
    {#snippet right()}
      {#if !desk}
        <Link iconOnly popoverOpen="#{menuId}">
          <Icon name={theme.ios ? 'moreCircle' : 'more'} /><span class="bc-sr-only">{selectionMenuActive ? t('logbook.selectionActions') : t('detail.moreOptions')}</span>
        </Link>
      {/if}
    {/snippet}
  </Navbar>

  <!-- Overflow menu (detail2 mock-ups): an MD3 menu on Android, icon before the
       label; an iOS pull-down menu, label then icon at the end, no arrow. This page's router, not a link: the menu
       opens at the app's root, where a link would use the Carnet's view even when the dive is shown in another section. -->
  <Popover id={menuId} class="bc-menu" backdrop={false}>
    <List noChevron>
      <MenuItem icon="plan" text={t('detail.plan')} onclick={() => { f7.popover.close(`#${menuId}`); f7router.navigate(`/plan/${diveParam}`); }} />
      <MenuItem icon="share" text={t('share.title')} onclick={() => { f7.popover.close(`#${menuId}`); sharing = true; }} />
      <MenuItem
        icon="renumber"
        text={t('renumberDive.title')}
        onclick={() => {
          f7.popover.close(`#${menuId}`);
          renumbering = true;
        }}
      />
      <MenuItem
        icon="renumber"
        text={t('renumberFrom.title')}
        onclick={() => {
          f7.popover.close(`#${menuId}`);
          renumberingFrom = true;
        }}
      />
      {#if removableFromTrip}
        <MenuItem icon="tripRemove" text={t('detail.removeFromTrip')} onclick={removeFromTrip} />
      {/if}
      <!-- Benthic+ (task 2026-11-19-290): the syncs that touched this dive, to restore one of them. -->
      {#if logbook.benthicPlus && dive}
        <MenuItem
          icon="history"
          text={t('backup.dive.fromMenu')}
          onclick={() => {
            f7.popover.close(`#${menuId}`);
            if (dive) openDiveVersions(dive.date);
          }}
        />
      {/if}
      <li class="bc-menu-divider" role="separator"></li>
      <!-- Alarm colour on Android; iOS keeps ink. -->
      {#if selectionMenuActive}
        <MenuItem icon="delete" text={t('detail.deleteSelected')} destructive={!theme.ios} onclick={confirmDeleteSelected} />
      {:else}
        <MenuItem icon="delete" text={t('detail.delete')} destructive={!theme.ios} onclick={confirmDelete} />
      {/if}
    </List>
  </Popover>

  {#if failed}
    <!-- Error state (docs/system-design.md, section 9): what happened, what did not change, then a way on. -->
    <div class="bc-dive-detail--error" role="alert">
      <h2 class="bc-state-title bc-dive-detail--error-title">{t('detail.errorTitle')}</h2>
      <p class="bc-dive-detail--error-text">{t('detail.errorText')}</p>
      <Button fill class="bc-primary-action bc-dive-detail--error-retry" onClick={retry}>{t('detail.retry')}</Button>
    </div>
  {:else if !dive}
    <DiveDetailSkeleton {desk} />
  {:else}
    {#if desk}
    <!-- The site's map behind the header, 170 dp from the top of the pane (task 2026-11-15-193). -->
    <div class="bc-dive-detail--desk-hero">
      {#if dive.siteCoordinates}
        <SiteHeaderImage desk latUdeg={dive.siteCoordinates.latUdeg} lonUdeg={dive.siteCoordinates.lonUdeg} onshown={() => {}} />
      {/if}
      <header class="bc-dive-detail--desk-head">
        <div class="bc-dive-detail--desk-titles">
          <h1 class="bc-dive-detail--desk-title">{diveNumber ? t('desktop.diveTitle', { number: diveNumber, site: dive.site || t('desktop.noSite') }) : dive.site || t('desktop.noSite')}</h1>
          <p class="bc-dive-detail--desk-sub bc-value">{[formatDate(dive.date) + ', ' + formatTimeOfDay(dive.date), location, dive.computer].filter(Boolean).join(' · ')}</p>
        </div>
        <button type="button" class="bc-dive-detail--desk-action" aria-label={t('desktopDetail.plan')} title={t('desktopDetail.plan')} onclick={() => f7router.navigate(`/plan/${diveParam}`)}><Icon name="plan" size={22} /></button>
        {#if benthicPlusSubscriber()}
          <button type="button" class="bc-dive-detail--desk-action" aria-label={t('validation.menuOne')} title={t('desktopDetail.validate')} onclick={startValidation}><Icon name="seal" size={22} /></button>
        {/if}
        <button type="button" class="bc-dive-detail--desk-action" aria-label={t('desktopDetail.share')} title={t('desktopDetail.share')} onclick={() => deskCommand('share')}><Icon name="share" size={22} /></button>
        <button type="button" class="bc-dive-detail--desk-action" aria-label={t('desktopDetail.export')} title="{t('desktopDetail.export')} ({desktopMac ? '⇧⌘E' : 'Ctrl+Maj+E'})" onclick={() => deskCommand('export')}><Icon name="export" size={22} /></button>
        <button type="button" class="bc-dive-detail--desk-action" aria-label={t('desktopDetail.delete')} title="{t('desktopDetail.delete')} ({desktopMac ? '⌫' : 'Suppr'})" onclick={() => deskCommand('delete')}><Icon name="delete" size={22} /></button>
      </header>
    </div>
    {:else}
    <div class="bc-dive-detail--hero" use:watchScroll>
      {#if dive.siteCoordinates}
        <SiteHeaderImage latUdeg={dive.siteCoordinates.latUdeg} lonUdeg={dive.siteCoordinates.lonUdeg} onshown={(shown) => (imageShown = shown)} />
      {/if}
    <header class="bc-dive-detail--head">
      <p class="bc-dive-detail--day bc-value">
        {#if diveNumber}<strong>{t('detail.number', { number: String(diveNumber) })}</strong>&emsp;{/if}{formatDiveDay(dive.date)}
      </p>
      <h1 class="bc-dive-detail--site" class:bc-dive-detail--not-set={!dive.site}>{dive.site || t('dive.siteNotSet')}</h1>
      {#if location || trip}
        <p class="bc-dive-detail--location">
          {location}{#if location && trip}{' · '}{/if}{#if trip}<a href="/trips/{trip.id}">{t('detail.tripLine', { name: trip.location || t('trip.startingOn', { date: formatDate(logbook.dives.filter((d) => d.trip?.id === trip.id).map((d) => d.date).sort()[0]) }) })}</a>{/if}
        </p>
      {/if}
      {#if dive.rating > 0}
        <p class="bc-dive-detail--rating">
          <Stars value={dive.rating} size={18} label={t('detail.ratingLabel', { n: dive.rating })} />
        </p>
      {/if}
    </header>
    </div>
    {/if}

    {#if !desk}<DiveFigures {dive} {prefs} />{/if}

    <div class:bc-dive-detail--desk-card={desk} class:bc-dive-detail--desk-big={desk && profileBig}>
    <DiveProfile
      hover={desk}
      onenlarge={desk ? () => (profileBig = !profileBig) : undefined}
      samples={dive.samples}
      cylinders={dive.cylinders}
      divemode={dive.divemode}
      maxDepthMm={dive.maxDepthMm}
      durationSeconds={dive.durationSeconds}
      startIso={dive.date}
      meanDepthMm={dive.meanDepthMm}
      {prefs}
    />
    </div>

    {#if desk}
      {#if deskFigures.length}
        <dl class="bc-dive-detail--desk-figures">
          {#each deskFigures as figure (figure.label)}
            <div><dt>{figure.label}</dt><dd class="bc-value">{figure.value}</dd></div>
          {/each}
        </dl>
      {/if}
      {#if hasRecordedValues(dive)}
        <p class="bc-dive-detail--desk-recorded"><Icon name="computer" size={16} />{t('desktopDetail.recorded')}</p>
      {/if}
      <!-- svelte-ignore a11y_interactive_supports_focus -->
      <div class="bc-dive-detail--desk-tabs" role="tablist" tabindex="-1" onkeydown={tabKey}>
        {#each deskTabs as key (key)}
          <button type="button" role="tab" data-tab={key} aria-selected={tab === key} tabindex={tab === key ? 0 : -1} onclick={() => chooseTab(key)}>{t(`desktop.tab.${key}`)}</button>
        {/each}
      </div>
    {/if}

    {#if !desk && facts.length}
      <dl class="bc-dive-detail--facts">
        {#each facts as fact (fact.label)}
          <div class="bc-dive-detail--fact"><dt>{fact.label}</dt><dd class="bc-value">{fact.value}</dd></div>
        {/each}
      </dl>
    {/if}

    <!-- Tablet and phone (tasks 2026-11-24-382, 386 and 387): the tabs of the desktop detail, every field edited in place.
         A tablet shows the chosen tab; a phone is one page with the five groups one after the other, the tab row sticky. -->
    {#if !desk}
      {@const fieldProps = { dive, prefs, preview: !!preview, trip: tripText, sac, gasChanges: gasChangesLine, onsign: startValidation }}
      <div class="bc-dive-detail--tabs-gap"></div>
      <div class="bc-dive-detail--tabs-wrap" use:watchTabs>
        <div class="bc-dive-detail--desk-tabs bc-dive-detail--tabs" class:bc-dive-detail--segmented={iosPhone} role="tablist" aria-label={t('detail.tabs')} tabindex="-1" onkeydown={tabKey}>
          {#each deskTabs as key (key)}
            <button type="button" role="tab" data-tab={key} aria-selected={(layout.phone ? phoneTab : tab) === key} tabindex={(layout.phone ? phoneTab : tab) === key ? 0 : -1} aria-label={iosPhone && key === 'info' ? t('desktop.tab.info') : undefined} onclick={() => (layout.phone ? scrollToGroup(key) : chooseTab(key))}>{iosPhone && key === 'info' ? t('desktop.tab.infoShort') : t(`desktop.tab.${key}`)}</button>
          {/each}
        </div>
      </div>
      {#if layout.phone}
        <p class="bc-dive-detail--fields-hint">{t('desktopDetail.fieldsHint')}</p>
        {#each deskTabs as key (key)}
          <section class="bc-dive-detail--group-tab" data-group={key} aria-labelledby="bc-group-{uid}-{key}">
            <h2 class="bc-dive-detail--group-title" id="bc-group-{uid}-{key}">{t(`desktop.tab.${key}`)}</h2>
            <DesktopDiveFields {...fieldProps} tab={key} hint={false} />
            {#if key === 'notes'}{@render media()}{/if}
          </section>
        {/each}
      {:else}
        <DesktopDiveFields {...fieldProps} {tab} />
      {/if}
    {/if}

    <!-- The Photos et vidéos section is for Benthic+ subscribers (task 2026-11-23-370); the pictures stay in the logbook. -->
    {#if desk}
      <DesktopDiveFields {dive} {prefs} {tab} preview={!!preview} trip={tripText} {sac} gasChanges={gasChangesLine} onsign={startValidation} />
    {/if}

    <!-- Tablet and desktop: under the Notes tab only, after the notes (task 2026-11-27-413); the phone has it in its Notes group. -->
    {#if !layout.phone && tab === 'notes'}{@render media()}{/if}

    <div class="bc-dive-detail--end" aria-hidden="true"></div>
  {/if}

  {#if !preview && layout.split && !layout.desktop}
    {#each GHOST_SIDES as side (side)}
      {@const g = ghosts[side]}
      {#if g}
        <div class="bc-dive-ghost" aria-hidden="true" inert use:ghostPlace={side}>
          <Self f7route={{ params: { id: diveParamOf(g.id) }, url: neighbourUrl(g.id) }} f7router={null} preview={g} />
        </div>
      {/if}
    {/each}
  {/if}
</Page>

{#if sharing}
  <ShareSheet onpdf={() => share('pdf')} onsummary={() => share('summary')} onlink={dive && diveLink(dive.date) ? () => share('link') : undefined} onqr={() => ((sharing = false), (qrSharing = true))} onclose={() => (sharing = false)} />
{/if}

{#if qrSharing && dive}
  <QrShare id={dive.id} kind="d" summary={qrSummary(dive, prefs)} onclose={() => (qrSharing = false)} />
{/if}

{#if validating && dive}
  <ValidationDialog ids={[dive.id]} onclose={() => (validating = false)} />
{/if}

{#if renumbering && dive}
  <RenumberDiveDialog
    id={dive.id}
    number={diveNumber}
    oncancel={() => (renumbering = false)}
    ondone={() => {
      renumbering = false;
      loadDive();
    }}
  />
{/if}
{#if renumberingFrom && dive}
  <RenumberFromDialog id={dive.id} oncancel={() => (renumberingFrom = false)} ondone={() => { renumberingFrom = false; loadDive(); }} />
{/if}

<style>
  @layer bc.components {
    /* Error state: a centred column under the bar, the title in the title font. */
    .bc-dive-detail--error {
      max-width: 440px;
      margin: 32px auto 0;
      padding: 0 24px 24px;
      box-sizing: border-box;
      color: var(--bc-text);
    }

    .bc-dive-detail--error-title {
      color: var(--bc-text);
    }

    .bc-dive-detail--error-text {
      margin: 0 0 24px;
      color: var(--bc-text-2);
      font-size: 16px;
      line-height: 24px;
    }

    /* Desktop detail pane (task 2026-11-15-169). */
    /* No top bar on desktop: the pane's own header carries the actions. */
    :global(.bc-dive-detail--desk.page) {
      --f7-page-bg-color: var(--bc-background);
      background: var(--bc-background);
    }
    /* The master-detail pane paints --bc-surface (App.svelte); the desktop detail keeps the page colour, so the only white
       surface around the profile is its own card (task 2026-11-23-375). */
    :global(.view-master-detail .page-master-detail.bc-dive-detail--desk) {
      background: var(--bc-background);
    }
    :global(.bc-dive-detail--desk > .navbar) {
      display: none;
    }
    :global(.bc-dive-detail--desk > .page-content) {
      padding-top: 0;
    }
    /* 36 dp above the title, room for the site map behind the header (task 2026-11-15-193). */
    .bc-dive-detail--desk-hero {
      position: relative;
    }
    .bc-dive-detail--desk-head {
      position: relative;
      display: flex;
      align-items: flex-start;
      gap: 4px;
      padding: 36px 16px 8px 24px;
    }
    .bc-dive-detail--desk-titles {
      flex: 1;
      min-width: 0;
    }
    .bc-dive-detail--desk-title {
      margin: 0;
      font-family: var(--bc-title-font);
      font-size: 22px;
      font-weight: 500;
      line-height: 28px;
      color: var(--bc-text);
    }
    /* The date line stays on one line, cut with an ellipsis (task 2026-11-15-194). */
    .bc-dive-detail--desk-sub {
      margin: 2px 0 0;
      font-size: 14px;
      color: var(--bc-text-2);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .bc-dive-detail--desk-action {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      border: 0;
      border-radius: 50%;
      background: none;
      color: var(--bc-text);
      cursor: pointer;
      &:hover {
        background: color-mix(in srgb, var(--bc-text) 8%, transparent);
      }
    }
    /* The profile card starts over the faded bottom of the map (task 2026-11-22-331): it is drawn above it. */
    .bc-dive-detail--desk-card {
      position: relative;
      margin: 8px 24px 0;
      padding: 8px 0 12px;
      border-radius: 16px;
      background: var(--bc-surface);
    }
    /* « Agrandir le profil »: the card covers the pane. */
    .bc-dive-detail--desk-big {
      position: fixed;
      inset: 16px 16px 16px calc(var(--f7-page-master-width, 50%) + var(--bc-nav-width) + 16px);
      z-index: 50;
      margin: 0;
      display: flex;
      flex-direction: column;
      justify-content: center;
      box-shadow: 0 2px 12px rgb(0 0 0 / 0.2);
    }
    .bc-dive-detail--desk-figures {
      display: flex;
      flex-wrap: wrap;
      gap: 12px 28px;
      margin: 16px 24px 0;
      & dt {
        font-size: 13px;
        color: var(--bc-text-2);
      }
      & dd {
        margin: 2px 0 0;
        font-size: 18px;
        font-weight: 500;
        color: var(--bc-text);
      }
    }
    .bc-dive-detail--desk-tabs {
      display: flex;
      gap: 4px;
      margin: 20px 24px 8px;
      border-bottom: 1px solid var(--bc-separator);
    }
    /* Under the key figures: the dive computer's values cannot be edited (task 2026-11-15-172). */
    .bc-dive-detail--desk-recorded {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 12px 24px 0;
      font-size: 13px;
      color: var(--bc-text-2);
    }
    .bc-dive-detail--desk-tabs button {
      position: relative;
      height: 48px;
      padding: 0 16px;
      border: 0;
      background: none;
      font: inherit;
      font-size: 14px;
      font-weight: 400;
      color: var(--bc-text-2);
      cursor: pointer;

      &:hover {
        color: var(--bc-text);
        background: color-mix(in srgb, var(--bc-text) 4%, transparent);
      }

      &[aria-selected='true'] {
        font-weight: 600;
        color: var(--bc-on-table-selected);

        &::after {
          content: '';
          position: absolute;
          left: 8px;
          right: 8px;
          bottom: -1px;
          height: 3px;
          border-radius: 3px 3px 0 0;
          background: var(--bc-on-table-selected);
        }
      }
    }
    .bc-dive-detail--hero {
      position: relative;
    }

    /* 16 px under the top bar, as in the detail3 mock-ups. */
    .bc-dive-detail--head {
      position: relative;
      padding: 16px 20px 0;
    }

    .bc-dive-detail--day {
      margin: 0;
      font-size: 15px;
      color: var(--bc-text-2);

      strong {
        font-weight: 800;
        color: var(--bc-text);
      }
    }

    .bc-dive-detail--site {
      margin: 2px 0 0;
      font-size: 34px;
      line-height: 40px;
      font-weight: 800;
      letter-spacing: -0.4px;
      color: var(--bc-text);

      &.bc-dive-detail--not-set {
        color: var(--bc-text-2);
      }
    }

    .bc-dive-detail--facts {
      margin: 8px 20px 0;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      column-gap: 12px;
    }

    .bc-dive-detail--fact {
      padding: 9px 0;
      border-bottom: 1px solid var(--bc-separator);
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;

      dt {
        font-size: 13px;
        color: var(--bc-text-2);
      }

      dd {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: var(--bc-text);
        /* Between words only; a word longer than the column still breaks. */
        overflow-wrap: break-word;
      }
    }

    .bc-dive-detail--location {
      --f7-theme-color: var(--bc-text);
      margin: 2px 0 0;
      font-size: 15px;
      color: var(--bc-text-2);

      a {
        font-weight: 600;
      }
    }

    /* The tab row of the tablet and phone detail (tasks 2026-11-24-382 and 386): it sticks under the top bar. */
    .bc-dive-detail--tabs-gap {
      height: 12px;
    }

    /* Sticky offsets count from the scroll area content edge, which is already under the top bar: `top: 0` is right under it. */
    .bc-dive-detail--tabs-wrap {
      position: sticky;
      top: 0;
      z-index: 5;
      background: var(--bc-background);
      &:has(.bc-dive-detail--segmented) {
        padding: 8px 12px;
        border-bottom: 0.5px solid var(--bc-separator);
      }
    }

    /* iPhone: a segmented control, 28 pt high, 7 pt segments, the selected segment raised (mock-up ios-detail-onglets). */
    .bc-dive-detail--tabs.bc-dive-detail--segmented {
      margin: 0;
      padding: 2px;
      overflow: hidden;
      gap: 0;
      border-bottom: 0;
      border-radius: 9px;
      background: var(--bc-field-rest);
      & button {
        flex: auto;
        height: 28px;
        padding: 0 4px;
        border-radius: 7px;
        font-size: 13px;
        font-weight: 500;
        color: var(--bc-text);
        &:hover {
          background: none;
        }
        &[aria-selected='true'] {
          background: var(--bc-surface);
          color: var(--bc-text);
          font-weight: 600;
          box-shadow: 0 1px 3px rgb(0 0 0 / 0.18);
          &::after {
            display: none;
          }
        }
      }
    }

    /* Scrollable MD3 primary tabs: the row scrolls sideways when the five labels do not fit. */
    .bc-dive-detail--tabs {
      margin: 0;
      padding: 0 4px;
      overflow-x: auto;
      scrollbar-width: none;
      &::-webkit-scrollbar {
        display: none;
      }
      & button {
        flex: none;
        width: auto;
        padding: 0 12px;
        &[aria-selected='true']::after {
          left: 6px;
          right: 6px;
          bottom: 0;
        }
      }
    }

    .bc-dive-detail--fields-hint {
      margin: 12px 16px 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    /* A group of the phone's page: its 14 sp title, then its cards. A tap on a tab scrolls here, under the sticky row. */
    .bc-dive-detail--group-tab {
      scroll-margin-top: calc(var(--f7-navbar-height) + var(--f7-safe-area-top, 0px) + 56px);
    }

    .bc-dive-detail--group-title {
      margin: 20px 16px 8px;
      font-family: var(--bc-title-font);
      font-size: 14px;
      font-weight: 600;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    /* Space after the last block, so that it never touches the bottom bar. */
    .bc-dive-detail--end {
      height: 32px;
    }

  }

  :global(.bc-dive-detail.bc-dive-detail--on-image > .navbar) {
    --f7-navbar-bg-color: transparent;
  }

  @layer bc.components {
    .bc-dive-detail--bar-title {
      display: block;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      opacity: 0;
      transition: opacity 150ms ease-out;

      &.bc-dive-detail--bar-title-shown {
        opacity: 1;
      }

      @media (prefers-reduced-motion: reduce) {
        transition: none;
      }
    }

  }
</style>
