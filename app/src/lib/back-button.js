// @ts-check
// Android Back key (spec, section 3: the system back works everywhere).
// Framework7 does not use the browser history: without this bridge, Back would
// close the application.
import { App as CapacitorApp } from '@capacitor/app';
import { f7 } from 'framework7-svelte';
import { backTarget, readPane } from './pane-history.js';
import { backThroughGuard } from './leave-guard.js';
import { welcomeBack } from './first-launch-back.js';

export function enableBackButton() {
  // The same handler answers the page event « od:back » (tests/e2e/navigation.mjs sends the Android Back key that way).
  window.addEventListener('od:back', () => onBack());
  CapacitorApp.addListener('backButton', () => onBack());
}

function onBack() {
  {
    // 0. The card of a selected pin on the Sites map closes (pages/Sites.svelte), then
    // a map shown full screen (components/SiteMap.svelte) goes back to its place.
    const siteCard = document.querySelector('.od-map-site-card');
    if (siteCard && siteCard.getClientRects().length && !document.querySelector('.modal-in')) {
      siteCard.dispatchEvent(new CustomEvent('od-cancel'));
      return;
    }
    const fullMap = document.querySelector('.od-map-fullscreen');
    if (fullMap) {
      fullMap.dispatchEvent(new CustomEvent('od-cancel'));
      return;
    }
    // 0a. An open Settings row menu (components/RowMenu.svelte) closes first.
    const rowMenu = document.querySelector('.od-row-menu');
    if (rowMenu) {
      rowMenu.dispatchEvent(new CustomEvent('od-cancel'));
      return;
    }
    // 0b. An open dropdown menu (components/SelectField.svelte) closes first.
    const dropdown = document.querySelector('.od-select-field--open');
    if (dropdown) {
      dropdown.dispatchEvent(new CustomEvent('od-cancel'));
      return;
    }
    // 1. The side menu closes.
    if (document.querySelector('.panel.panel-in')) {
      f7.panel.close();
      return;
    }
    // 2. The choices of the "+" button close.
    const fabMenu = document.querySelector('.od-fab-menu--open');
    if (fabMenu) {
      fabMenu.dispatchEvent(new CustomEvent('od-cancel'));
      return;
    }
    if (document.querySelector('.fab-opened')) {
      f7.fab.close();
      return;
    }
    // 3. An open sheet or dialog closes.
    // The topmost one: a dialog or a sheet opened over a popup comes later in the page.
    const modals = document.querySelectorAll('.modal-in');
    const modal = modals.length ? modals[modals.length - 1] : null;
    // First launch waits for a choice: its steps are not router pages but a stack (lib/first-launch.svelte.js), so
    // Back goes to the previous step like « Retour » (lib/first-launch-steps.js, systemBack); from the first step
    // it sends the app to the background.
    if (modal?.classList.contains('od-welcome')) {
      if (!welcomeBack()) CapacitorApp.minimizeApp();
      return;
    }
    // 3b. The Gas page of Edit dive (in the page, or in the tablet's popup) returns to the form.
    const gasPage = document.querySelector('.od-edit-gas--open');
    if (gasPage && (!modal || modal.classList.contains('popup'))) {
      gasPage.dispatchEvent(new CustomEvent('od-cancel'));
      return;
    }
    // 3b'. The account deletion wizard goes back one step (pages/DeleteAccount.svelte).
    const wizardStep = document.querySelector('.page-current .od-delete-wizard--body:not([data-step="1"])');
    if (wizardStep && !modal) {
      wizardStep.dispatchEvent(new CustomEvent('od-cancel'));
      return;
    }
    // 3c. A form with unsaved changes (the full screen, or its popup on a tablet) asks
    // before it is left (lib/leave-guard.js); a sheet or dialog above it closed first.
    if ((!modal || modal.classList.contains('popup')) && backThroughGuard(modal)) return;
    if (modal) {
      // OpenDives' own dialogs (components/Md3Dialog.svelte) cancel themselves.
      if (modal.classList.contains('od-md3-dialog') || modal.classList.contains('od-cylinder-sheet') || modal.classList.contains('od-gauge-sheet')) modal.dispatchEvent(new CustomEvent('od-cancel'));
      else if (modal.classList.contains('actions-modal')) f7.actions.close();
      else if (modal.classList.contains('dialog')) f7.dialog.close();
      else if (modal.classList.contains('sheet-modal')) f7.sheet.close();
      else if (modal.classList.contains('popup')) f7.popup.close();
      else if (modal.classList.contains('popover')) f7.popover.close();
      return;
    }
    // 4. The logbook's selection mode is left.
    const selection = document.querySelector('.od-logbook--selection-bar');
    if (selection) {
      selection.dispatchEvent(new CustomEvent('od-cancel'));
      return;
    }
    // 4b. The Sites search closes (pages/Sites.svelte).
    const sitesSearch = document.querySelector('.od-sites--search.od-sites--open');
    if (sitesSearch) {
      sitesSearch.dispatchEvent(new CustomEvent('od-cancel'));
      return;
    }
    // 5. An active search of the screen shown closes. Only that screen's: the
    // Logbook's search stays active under an opened dive, and Back then
    // returns to the list with its search, like the back arrow.
    const view = f7.views.current;
    const search = view?.el?.querySelector(
      ':scope > .page-current .searchbar-enabled, :scope.view-master-detail > .page-master .searchbar-enabled',
    );
    if (search) {
      f7.searchbar.disable(/** @type {HTMLElement} */ (search));
      return;
    }
    // 6. Back: one screen of the detail pane (tablet), one page of the section,
    // the Logbook, or the background (lib/pane-history.js).
    const target = backTarget({
      ...readPane(view?.el),
      historyLength: view?.router.history.length ?? 1,
      logbook: view?.el?.id === 'view-logbook' || !view,
    });
    if (target === 'pane' || target === 'page') view.router.back();
    else if (target === 'logbook') f7.tab.show('#view-logbook');
    else CapacitorApp.minimizeApp();
  }
}
