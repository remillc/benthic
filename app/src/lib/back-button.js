// @ts-check
// The one Back dispatcher (spec, section 3: the system back works everywhere; docs/architecture.md, section 13).
// The Android Back key and gesture (Capacitor's `backButton`), the keyboard's Escape and the tests' « od:back » all
// come here. Framework7 does not use the browser history and neither does the app: without this bridge, Back would
// close the application.
//
// Back closes the topmost thing that can close, one per press, in this order: a map's card or full screen, a row
// menu, a dropdown, a suggestion list, the side menu, the « + » choices, the topmost dialog, sheet, popup or popover
// (a form with unsaved changes asks first), the logbook's selection, a search; then it goes back one page (through
// the router guard, lib/router-guard.js), then to the Logbook, then it sends the app to the background.
// Escape stops before the pages: it only closes what is open over them, and only when nothing else answered the key.
// Each press is written to the navigation trace with what answered it (lib/nav-trace.js).
import { App as CapacitorApp } from '@capacitor/app';
import { f7 } from 'framework7-svelte';
import { backTarget, readPane } from './pane-history.js';
import { backThroughGuard } from './leave-guard.js';
import { welcomeBack } from './first-launch-back.js';
import { trace } from './nav-trace.js';

/** @typedef {'system'|'escape'|'test'} BackSource */

export function enableBackButton() {
  // The same handler answers the page event « od:back » (tests/e2e/navigation.mjs sends the Android Back key that way).
  window.addEventListener('od:back', () => goBack('test'));
  CapacitorApp.addListener('backButton', () => goBack('system'));
  enableEscape();
}

/**
 * Back, from wherever it comes.
 * @param {BackSource} [source]
 * @returns {string} what answered it (for the trace and the tests)
 */
export function goBack(source = 'system') {
  let answered = 'error';
  try {
    answered = dispatch(source === 'escape');
  } finally {
    trace('sys-back', `${source} > ${answered}`);
  }
  return answered;
}

/** The app goes to the background (Android); elsewhere there is nothing to do. */
function minimize() {
  try {
    Promise.resolve(CapacitorApp.minimizeApp()).catch(() => {});
  } catch {
    // Not implemented outside Android.
  }
  return 'exit';
}

/** Sends « od-cancel » to an element that closes itself. @param {Element} el @param {string} name */
function cancel(el, name) {
  el.dispatchEvent(new CustomEvent('od-cancel'));
  return name;
}

/** The topmost open dialog, sheet, popup or popover (a snackbar is no modal: Back right after a save must go back). */
function topModal() {
  const modals = document.querySelectorAll('.modal-in:not(.toast)');
  return modals.length ? modals[modals.length - 1] : null;
}

/**
 * @param {boolean} layersOnly Escape: only what is open over the pages
 * @returns {string} what answered
 */
function dispatch(layersOnly) {
  // 0. The card of a selected pin on the Sites map closes (pages/Sites.svelte), then
  // a map shown full screen (components/SiteMap.svelte) goes back to its place.
  const siteCard = document.querySelector('.bc-map-site-card');
  if (siteCard && siteCard.getClientRects().length && !document.querySelector('.modal-in:not(.toast)')) return cancel(siteCard, 'map-card');
  const fullMap = document.querySelector('.bc-map-fullscreen');
  if (fullMap) return cancel(fullMap, 'map-fullscreen');
  // 0a. An open Settings row menu (components/RowMenu.svelte) closes first.
  const rowMenu = document.querySelector('.bc-row-menu');
  if (rowMenu) return cancel(rowMenu, 'row-menu');
  // 0b. An open dropdown menu (components/SelectField.svelte) closes first.
  const dropdown = document.querySelector('.bc-select-field--open');
  if (dropdown) return cancel(dropdown, 'dropdown');
  // 0c. An open suggestion list (lib/float-menu.js, in the browser's top layer) closes: its field loses the focus.
  const suggestions = document.querySelector('[data-od-float-menu]');
  if (suggestions) {
    const field = suggestions.parentElement;
    const active = /** @type {HTMLElement|null} */ (document.activeElement);
    if (active && field?.contains(active)) active.blur();
    suggestions.dispatchEvent(new CustomEvent('od-cancel'));
    return 'suggestions';
  }
  // 1. The side menu closes.
  if (document.querySelector('.panel.panel-in')) {
    f7.panel.close();
    return 'panel';
  }
  // 2. The choices of the "+" button close.
  const fabMenu = document.querySelector('.bc-fab-menu--open');
  if (fabMenu) return cancel(fabMenu, 'fab-menu');
  if (document.querySelector('.fab-opened')) {
    f7.fab.close();
    return 'fab';
  }
  // 3. An open sheet or dialog closes: the topmost one (a dialog or a sheet opened over a popup comes later in the page).
  const modal = topModal();
  // First launch waits for a choice: its steps are not router pages but a stack (lib/first-launch.svelte.js), so
  // Back goes to the previous step like « Retour » (lib/first-launch-steps.js, systemBack); from the first step
  // it sends the app to the background. Escape leaves it alone.
  if (modal?.classList.contains('bc-welcome')) {
    if (layersOnly) return 'nothing';
    return welcomeBack() ? 'welcome-step' : minimize();
  }
  // 3b. The Gas page of Edit dive (in the page, or in the tablet's popup) returns to the form.
  const gasPage = document.querySelector('.bc-edit-gas--open');
  if (gasPage && (!modal || modal.classList.contains('popup'))) return cancel(gasPage, 'gas-page');
  // 3b'. The account deletion wizard goes back one step (pages/DeleteAccount.svelte).
  const wizardStep = document.querySelector('.page-current .bc-delete-wizard--body:not([data-step="1"])');
  if (wizardStep && !modal && !layersOnly) return cancel(wizardStep, 'wizard-step');
  const gearStep = document.querySelector('.page-current .bc-piece-edit--stage[data-step="form"]');
  if (gearStep && !modal && !layersOnly) return cancel(gearStep, 'gear-type-step');
  // 3b''. The profile information edited in place stops editing, without saving (pages/ProfileInfo.svelte).
  const infoEditing = document.querySelector('.page-current .bc-profile-info--editing');
  if (infoEditing && !modal && !layersOnly) return cancel(infoEditing, 'profile-info-edit');
  // 3c. A form with unsaved changes (the full screen, or its popup on a tablet) asks
  // before it is left (lib/leave-guard.js); a sheet or dialog above it closed first.
  if ((modal ? modal.classList.contains('popup') : !layersOnly) && backThroughGuard(modal)) return 'leave-guard';
  if (modal) {
    const el = /** @type {HTMLElement} */ (modal);
    // OpenDives' own dialogs (components/Md3Dialog.svelte) cancel themselves.
    if (modal.classList.contains('bc-md3-dialog') || modal.classList.contains('bc-cylinder-sheet') || modal.classList.contains('bc-gauge-sheet')) return cancel(modal, 'od-dialog');
    if (modal.classList.contains('actions-modal')) f7.actions.close(el);
    else if (modal.classList.contains('dialog')) f7.dialog.close(el);
    else if (modal.classList.contains('sheet-modal')) f7.sheet.close(el);
    else if (modal.classList.contains('popup')) f7.popup.close(el);
    else if (modal.classList.contains('popover')) f7.popover.close(el);
    else return 'nothing';
    return ['actions-modal', 'dialog', 'sheet-modal', 'popup', 'popover'].find((c) => modal.classList.contains(c)) ?? 'modal';
  }
  if (layersOnly) return 'nothing';
  // 4. The logbook's selection mode is left.
  const selection = document.querySelector('.bc-logbook--selection-bar');
  if (selection) return cancel(selection, 'selection');
  // 4b. The Sites search closes (pages/Sites.svelte).
  const sitesSearch = document.querySelector('.bc-sites--search.bc-sites--open');
  if (sitesSearch) return cancel(sitesSearch, 'sites-search');
  // 5. An active search of the screen shown closes. Only that screen's: the
  // Logbook's search stays active under an opened dive, and Back then
  // returns to the list with its search, like the back arrow.
  const view = f7.views.current;
  const search = view?.el?.querySelector(
    ':scope > .page-current .searchbar-enabled, :scope.view-master-detail > .page-master .searchbar-enabled',
  );
  if (search) {
    f7.searchbar.disable(/** @type {HTMLElement} */ (search));
    return 'search';
  }
  // 6. Back: one screen of the detail pane (tablet), one page of the section,
  // the Logbook, or the background (lib/pane-history.js).
  const target = backTarget({
    ...readPane(view?.el),
    historyLength: view?.router.history.length ?? 1,
    logbook: view?.el?.id === 'view-logbook' || !view,
  });
  if (target === 'pane' || target === 'page') {
    view.router.back();
    return target;
  }
  if (target === 'logbook') {
    f7.tab.show('#view-logbook');
    return 'logbook';
  }
  return minimize();
}

/**
 * Escape (a keyboard on the desktop or on a tablet) closes what is open over the pages, through the same dispatcher.
 * A component that answers the key itself comes first: the dispatcher only acts when, once the key has been handled
 * by everyone else, the same thing is still open on top.
 */
function enableEscape() {
  /** What is on top when the key goes down, before anyone answers it. */
  const top = () => document.querySelector('.bc-row-menu, .bc-select-field--open, [data-od-float-menu], .panel.panel-in, .bc-fab-menu--open, .fab-opened') ?? topModal();
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape' || e.isComposing) return;
      const before = top();
      if (!before) return;
      setTimeout(() => {
        if (e.defaultPrevented || !before.isConnected || top() !== before) return;
        goBack('escape');
      }, 0);
    },
    true,
  );
}
