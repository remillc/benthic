// @ts-check
// Main sections and the side menu of the phone layout (spec, section 3).
import { f7 } from 'framework7-svelte';
import { layout, bottomNav, desktopMac } from './layout.svelte.js';
import { horizontalSwipe, swipeGoesThrough, settle } from './swipe.js';
import { isBusy } from './router-guard.js';
import { trace } from './nav-trace.js';

/** @typedef {'logbook'|'sites'|'profile'|'statistics'|'tools'|'account'} Section */

/** The main sections, in the order of the menu, Profil (Benthic+) after Sites (task 2026-11-23-347). */
/** @type {Section[]} */
export const sectionOrder = ['logbook', 'sites', 'profile', 'statistics', 'tools'];

/** Every section shown by the menu: the main ones, then Account after the separator. */
const allSections = [...sectionOrder, 'account'];

export const navigation = $state({
  /** @type {Section} */
  section: 'logbook',
  /** The diver has Benthic+: the Profil section exists (the entry, its view and its pages). Set from App.svelte. */
  profile: false,
  menuOpen: false,
  /** Settings or About when shown over a section, else empty: the row lit in the menu. */
  page: /** @type {''|'settings'|'about'} */ (''),
  /** Identifier of the dive shown beside the list (tablet), or null. */
  dive: /** @type {string|null} */ (null),
  /**
   * At start, the detail pane beside the list waits for its first dive (tablet and desktop): it shows the
   * detail's skeleton (App.svelte) while the core reads the logbook, until a page opens there or the list
   * finds no dive to open (Logbook.svelte).
   */
  paneOpening: true,
  /** Download pages open (Download, Download failed): the Logbook's floating + steps aside while one shows. */
  downloadPanes: 0,
  /**
   * The current section shows its first page (no page pushed over it): where the bottom
   * navigation bar is shown (Android phone, task 2026-11-14-120).
   */
  atRoot: true,
  /** A screen opened over the section (the profile, Réglages, About) shows in the current view: the logbook's + steps aside. */
  over: false,
  /** The account sheet (Android phone): account, sync, Réglages and À propos. */
  accountOpen: false,
  /** « Gérer le compte » as a dialog (tablet and desktop; the phone opens a page): task 2026-11-18-281. */
  manageOpen: false,
  /** « Sauvegarde et restauration » as a dialog (the desktop; the phone and the tablet open a page): task 2026-11-19-290. */
  backupOpen: false,
});

/**
 * The main sections the navigation shows: Profil only for a Benthic+ account. A free account has no Profil entry and
 * its pages cannot be reached.
 * @returns {Section[]}
 */
export const sections = () => sectionOrder.filter((s) => s !== 'profile' || navigation.profile);

/** Whether the current view shows its first page, for the bottom navigation bar. */
function updateAtRoot() {
  const view = f7.views.current;
  const id = view?.el?.id?.replace('view-', '');
  navigation.atRoot = sectionOrder.includes(/** @type {Section} */ (id)) && (view?.router?.history?.length ?? 1) <= 1;
  navigation.over = isOverPath(String(view?.router?.currentRoute?.path ?? ''));
}

/** Element that opened the menu; it gets the focus back on close. */
/** @type {HTMLElement|null} */
let opener = null;

/** @param {Section} section */
export function showSection(section) {
  f7.tab.show(`#view-${section}`);
}

/**
 * Back from a page a swipe opened (Réglages, À propos), without animation, once the router is free: the page may
 * still be loading when the finger is lifted. Only when that page is the one on top.
 * @param {any} router a Framework7 router
 * @param {string} route the page the swipe opened
 */
function backFromPush(router, route) {
  const start = Date.now();
  const attempt = () => {
    if (isBusy(router) && Date.now() - start < 2000) return void setTimeout(attempt, 30);
    if (router.currentRoute?.path === route && router.history.length > 1) router.back({ animate: false });
  };
  attempt();
}

/**
 * Waits until a router is free again (a page change ended), at most two seconds.
 * @param {any} router a Framework7 router
 * @returns {Promise<void>}
 */
async function untilFree(router) {
  const start = Date.now();
  do await new Promise((resolve) => setTimeout(resolve, 30));
  while (isBusy(router) && Date.now() - start < 2000);
}

/**
 * Settings or About opened over a section (openOver): back to the section's
 * own first screen. Resolves once the page change is over: the caller must not hide the view before (a view that is
 * hidden in the middle of a page change is left with no current page, report 33 of 24 November 2026).
 * @param {any} view a Framework7 view
 * @returns {Promise<void>}
 */
async function closeOverPages(view) {
  const router = view?.router;
  if (!router || router.history.length < 2) return;
  if (!isOverPath(router.currentRoute?.path ?? '')) return;
  // A tablet's Account view (list beside detail): Framework7's Back from the pane, once Settings has replaced its detail
  // page, can leave the Settings list in place of the Account page and the view with no current page (report 33). The
  // first screen is loaded again instead, through the guard.
  if (view.el?.classList.contains('view-master-detail')) {
    router.navigate(router.history[0], { reloadAll: true, animate: false });
    await untilFree(router);
    return;
  }
  // One step back when Settings or About sit right on the first screen;
  // deeper (a page of Settings), straight back to the first screen. Without
  // animation Framework7 left the first screen shifted as a previous page.
  if (router.history.length === 2) {
    router.back();
    await untilFree(router);
  } else await backToFirstScreen(router);
}

/**
 * Back to a view's first screen, one page at a time and without animation. Not
 * `router.back(first, { force: true })`: in a view with a list-detail pair (the Logbook,
 * whose list is a master page, even on a phone), Framework7 then leaves the first screen
 * marked as a previous page, shifted to the left, and a page opened next can be dropped
 * while its route stays in the history (bug of 13 November 2026: the Logbook shifted, with
 * a white band on the right, after leaving a Réglages subpage from the side menu).
 * @param {any} router a Framework7 router
 * @returns {Promise<void>} settled when the first screen is shown
 */
export async function backToFirstScreen(router) {
  const start = Date.now();
  while (router && router.history.length > 1 && Date.now() - start < 2000) {
    // A back asked during a page change is dropped: it waits for the router to be free.
    if (!isBusy(router)) router.back({ animate: false });
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
}

/**
 * Whether a route is one of the screens opened over a section.
 * @param {string} path
 */
export const isOverPath = (path) => path.startsWith('/settings/') || path === '/about';

/**
 * A section chosen in the side menu or the navigation rail: Settings or About
 * opened over the current section close first, and the section chosen shows
 * its own screen even when it is the one under Settings (bug of 12 November
 * 2026: Carnet chosen from Settings opened over the Carnet did nothing).
 * @param {Section} section
 * @returns {Promise<void>} settled once the section is shown
 */
export async function goToSection(section) {
  // The screen opened over the current section closes first and the switch waits for it: hiding the view in the middle
  // of its page change left it with no current page (report 33).
  await closeOverPages(f7.views.current);
  showSection(section);
  await closeOverPages(f7.views.get(`#view-${section}`));
}

/**
 * A page opened over a section from another section's view (a tablet: « Versions de cette plongée » from a dive beside
 * the list opens Sauvegarde et restauration in the Account view): its url and the section it came from. Back from that
 * page shows that section again (Christian's report of 27 November 2026: the arrow led to the Account page).
 * @type {{ url: string, section: Section }|null}
 */
let over = null;

/**
 * Opens Settings or About over the current section. On a tablet, a section
 * with a list and a detail (Logbook, Statistics, Tools) would show it beside
 * its list: it opens full width in the Account section instead.
 * @param {string} path
 * @param {{ animate?: boolean }} [options] passed to the router
 */
export function openOver(path, options) {
  // The diver profile is a section of its own (Profil, Benthic+), not a screen over the current one.
  if (path === '/profile' || path.startsWith('/profile/')) {
    void openProfilePath(path, options);
    return;
  }
  let view = f7.views.current;
  // Réglages on a tablet: always in the Account view, where its overview and a subpage sit
  // side by side (task 2026-11-13-111).
  if (view?.el?.classList.contains('view-master-detail') || (layout.split && path === '/settings/' && view?.el?.id !== 'view-account')) {
    const from = navigation.section;
    over = path !== '/settings/' && from !== 'account' ? { url: path, section: from } : null;
    showSection('account');
    view = f7.views.get('#view-account');
  }
  const router = view?.router;
  // The desktop layout shows Réglages' list with its detail pane emptied: that is Réglages already open.
  const open = router?.currentRoute?.path;
  if (router && open !== path && !(path === '/settings/' && open === '/pane/empty')) router.navigate(path, options);
}

/**
 * A page of the diver profile (task 2026-11-23-347): the Profil section shows, then the page opens in its view. Pages
 * opened by a notification, the dive's equipment menu or the emergency shortcut come through here. A free account has
 * no Profil section: nothing opens. The section's view may still be starting (a notification at launch): it is awaited.
 * @param {string} [path] a route under /profile (the section's home by default)
 * @param {{ animate?: boolean }} [options] passed to the router
 * @returns {Promise<void>}
 */
export async function openProfilePath(path = '/profile', options) {
  if (!navigation.profile) return;
  const start = Date.now();
  while (!f7.views.get('#view-profile')?.router && Date.now() - start < 2000) await new Promise((resolve) => setTimeout(resolve, 30));
  const view = f7.views.get('#view-profile');
  const router = view?.router;
  if (!router || !navigation.profile) return;
  await closeOverPages(f7.views.current);
  showSection('profile');
  if (path === '/profile') {
    if (router.history.length > 1) await backToFirstScreen(router);
    return;
  }
  if (router.currentRoute?.path !== path) router.navigate(path, options);
}

/** The Profil section's first screen. */
export function openProfile() {
  void openProfilePath('/profile');
}

/** « Gérer le compte » (a Benthic+ account): a page on the phone, a two-column dialog on a tablet and on the desktop. */
export function openManageAccount() {
  if (layout.phone) openOver('/account/manage');
  else navigation.manageOpen = true;
}

/** « Sauvegarde et restauration » of a Benthic+ account: a dialog on the desktop, a page over the current section elsewhere. */
export function openBackup() {
  if (layout.desktop) navigation.backupOpen = true;
  else openOver('/account/backup');
}

/** Settings open over the current section, from the side menu or the tablet navigation. */
export function openSettings() {
  // The Mac: a separate window (task 2026-11-15-202, desktop/main.cjs).
  const desk = /** @type {any} */ (typeof window === 'undefined' ? null : window).benthicDesktop;
  if (desktopMac && desk?.openSettingsWindow) {
    desk.openSettingsWindow().catch((/** @type {unknown} */ e) => console.error('Settings window', e));
    return;
  }
  openOver('/settings/');
}

/** About opens over the current section, from the side menu or the tablet navigation. */
export function openAbout() {
  // Desktop app: a dialog over the section (task 2026-11-15-202), whatever the view.
  if (layout.desktop) f7.views.current?.router.navigate('/about');
  else openOver('/about');
}

/** Follows the visible tab, whatever showed it (menu, Back key, tablet bar). */
export function trackSection() {
  f7.on('tabShow', (/** @type {HTMLElement} */ el) => {
    const section = /** @type {Section} */ (el.id?.replace('view-', ''));
    if (allSections.includes(section)) navigation.section = section;
    // Another section chosen by hand: Back from the page opened over no longer leads back there.
    if (over && section !== 'account') over = null;
    updateAtRoot();
  });
  // Back from a page opened over another section (`over`): that section shows again as the page leaves.
  f7.on('pageBeforeOut', (/** @type {any} */ page) => {
    if (!over || page?.direction !== 'backward' || page?.view?.el?.id !== 'view-account' || page?.route?.url !== over.url) return;
    const section = over.section;
    over = null;
    trace('over-return', section);
    showSection(section);
  });
  // A page pushed or left in any view: whether the bottom bar shows.
  f7.on('routeChanged', updateAtRoot);
  f7.on('pageAfterIn', updateAtRoot);
  f7.on('pageAfterOut', updateAtRoot);
  updateAtRoot();
}

/** @param {HTMLElement|null} from */
export function openMenu(from) {
  opener = from;
  f7.panel.open('#bc-menu');
}

export function closeMenu() {
  f7.panel.close('#bc-menu');
}

/** Focus back on the ☰ button, or the one of the screen now shown. */
export function restoreFocus() {
  const target =
    opener?.isConnected && opener.offsetParent
      ? opener
      : /** @type {HTMLElement|null} */ (document.querySelector('.view.tab-active .page-current .bc-menu-button'));
  target?.focus();
  opener = null;
}

/**
 * Phone: a swipe left or right goes to the next or previous entry of the
 * menu, in its order: the four sections, Account, then Settings and About.
 * The screen always moves the same way: the current one slides out under the
 * finger and the next one comes in beside it; lifted past a fifth of the width
 * (or flicked), the next one takes the screen, otherwise both go back. From
 * Account a swipe left opens Settings, and from Settings it opens About, as
 * pages over the section; a swipe right on them is the back gesture, which
 * moves the pages the same way (lib/swipe-back.js). Not on what has its own
 * gestures (map, profile, fields, anything that scrolls sideways), nor while a
 * menu, a dialog, a search or the logbook's selection is open.
 */
export function enableSectionSwipes() {
  /** The menu entries a swipe goes through, in order: the sections are tabs. */
  /** On Android phones Account is not a section: it opens from the account sheet. */
  const swipeOrder = () => (bottomNav() ? [...sections()] : [...sections(), 'account']);

  /** Where the swipe started: a section's first screen, or the Settings page. */
  /** @type {null|{ kind: 'tab', section: string }|{ kind: 'settings' }} */
  let start = null;
  /** Between sections: the section leaving, the one coming, their container. */
  /** @type {HTMLElement|null} */
  let from = null;
  /** @type {HTMLElement|null} */
  let neighbour = null;
  /** @type {HTMLElement|null} */
  let views = null;
  /** Towards a page: the page is opened at once and placed beside the screen. */
  /** @type {null|{ router: any, view: HTMLElement, page: HTMLElement, route: string }} */
  let push = null;
  let width = 0;
  let settling = false;

  /** @param {HTMLElement} el */
  function hasOwnGesture(el) {
    if (el.closest('.maplibregl-map, .bc-dive-profile--profile, .bc-planner--profile, canvas, input, textarea, select, .panel, .modal-in, .fab, .bc-logbook--selection-bar')) return true;
    for (let n = /** @type {HTMLElement|null} */ (el); n && n !== document.body; n = n.parentElement) {
      const overflow = getComputedStyle(n).overflowX;
      if ((overflow === 'auto' || overflow === 'scroll') && n.scrollWidth > n.clientWidth) return true;
    }
    return false;
  }

  /** @returns {typeof start} */
  function startingPoint() {
    if (!layout.phone || document.querySelector('.panel-in, .modal-in:not(.toast), .searchbar-enabled, .bc-sites--search.bc-sites--open, .bc-logbook--selection-bar')) return null;
    const view = f7.views.current;
    const section = view?.el?.id?.replace('view-', '');
    if (!swipeOrder().includes(section)) return null;
    if (view.router.history.length === 1) return { kind: 'tab', section };
    if (view.router.currentRoute?.path === '/settings/') return { kind: 'settings' };
    return null;
  }

  /**
   * What a swipe of `dx` leads to: a section (tab), a page to open (route),
   * or nothing; a swipe right on Settings is left to the back gesture.
   * @param {number} dx
   * @returns {null|{ tab: Section }|{ route: string }}
   */
  function toward(dx) {
    if (!start) return null;
    if (start.kind === 'settings') return dx < 0 ? { route: '/about' } : null;
    if (dx < 0 && start.section === 'account') return { route: '/settings/' };
    const order = swipeOrder();
    const next = order[order.indexOf(start.section) + (dx < 0 ? 1 : -1)];
    return next ? { tab: /** @type {Section} */ (next) } : null;
  }

  /** @param {HTMLElement|null} el */
  function release(el) {
    if (!el) return;
    el.classList.remove('bc-tab-peek');
    el.style.transform = '';
    el.style.transition = '';
  }

  /** Puts the sections back where they were, without animation. */
  function dropSections() {
    if (from) from.style.transform = '';
    release(neighbour);
    views?.classList.remove('bc-tab-sliding');
    from = neighbour = views = null;
  }

  /**
   * Opens the page without animation, both pages then placed by the
   * --bc-push-dx offset of the view (theme.css, bc-pushing): the new page is
   * already beside the screen when it appears.
   * @param {string} route
   */
  function startPush(route) {
    const router = f7.views.current?.router;
    const view = /** @type {HTMLElement|undefined} */ (router?.el);
    const page = /** @type {HTMLElement|null|undefined} */ (view?.querySelector(':scope > .page-current'));
    if (!router || !view || !page) return null;
    width = view.clientWidth;
    page.classList.add('bc-push-from');
    view.style.setProperty('--bc-push-dx', '0px');
    view.classList.add('bc-pushing');
    router.navigate(route, { animate: false });
    return { router, view, page, route };
  }

  /** Gives the view of a push back to the router. @param {NonNullable<typeof push>} p */
  function clearPush({ view, page }) {
    view.classList.remove('bc-pushing', 'bc-push-settle');
    view.style.removeProperty('--bc-push-dx');
    view.style.removeProperty('--bc-push-ease');
    view.style.removeProperty('--bc-push-ms');
    page.classList.remove('bc-push-from');
  }

  /** The system took the touch (its own gesture from the edge): everything back in place at once. */
  function cancelSwipe() {
    start = null;
    if (push) {
      const p = push;
      push = null;
      backFromPush(p.router, p.route);
      clearPush(p);
    }
    dropSections();
    trace('swipe-end', 'section cancelled');
  }

  /** @param {number} dx */
  function placePush(dx) {
    push?.view.style.setProperty('--bc-push-dx', `${Math.min(dx, 0)}px`);
  }

  /**
   * @param {number} dx
   * @param {number} velocity
   */
  function endPush(dx, velocity) {
    if (!push) return;
    const pushed = push;
    const { router, view } = pushed;
    push = null;
    const through = dx < 0 && swipeGoesThrough(dx, velocity, width);
    const from = Math.min(dx, 0);
    const { easing, ms } = settle(from, through ? -width : 0, from < 0 ? velocity : 0);
    settling = true;
    view.style.setProperty('--bc-push-ease', easing);
    view.style.setProperty('--bc-push-ms', `${ms}ms`);
    view.classList.add('bc-push-settle');
    view.style.setProperty('--bc-push-dx', through ? `${-width}px` : '0px');
    setTimeout(() => {
      if (!through) backFromPush(router, pushed.route);
      clearPush(pushed);
      settling = false;
    }, ms);
  }

  /**
   * The hidden sections keep their layout (theme.css), but one never drawn yet
   * costs a long frame the first time a swipe shows it (Sites and its map:
   * about 400 ms on the emulator). Once the app is idle, each one is drawn
   * once beside the screen, out of sight; content-visibility then keeps that
   * rendering for the swipe.
   */
  function warmSections() {
    if (!layout.phone) return;
    const ids = swipeOrder().map((s) => `view-${s}`);
    // Safari has no requestIdleCallback.
    /** @param {() => void} f @param {{ timeout: number }} o */
    const idle = (f, o) => (window.requestIdleCallback ? window.requestIdleCallback(f, o) : setTimeout(f, 300));
    const next = () => {
      const views = document.querySelector('.views');
      const el = ids.map((id) => document.getElementById(id)).find((v) => v && !v.classList.contains('tab-active'));
      if (!views || !el) return;
      ids.splice(ids.indexOf(el.id), 1);
      // Not under a finger or a settling swipe: try again at the next idle moment.
      if (start || settling || views.classList.contains('bc-tab-sliding')) {
        ids.push(el.id);
        idle(next, { timeout: 2000 });
        return;
      }
      views.classList.add('bc-tab-sliding');
      el.classList.add('bc-tab-peek');
      el.style.transform = `translateX(${views.clientWidth}px)`;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          // A swipe may have taken this section meanwhile: it is then its own.
          if (neighbour !== el) release(el);
          if (!from) views.classList.remove('bc-tab-sliding');
          idle(next, { timeout: 2000 });
        }),
      );
    };
    setTimeout(() => idle(next, { timeout: 4000 }), 1500);
  }
  warmSections();

  horizontalSwipe(document, {
    accept(e) {
      if (settling || hasOwnGesture(/** @type {HTMLElement} */ (e.target))) return false;
      start = startingPoint();
      return !!start;
    },
    move(dx) {
      if (!start) return;
      if (push) {
        placePush(dx);
        return;
      }
      const next = toward(dx);
      if (next && 'route' in next) {
        dropSections();
        push = startPush(next.route);
        placePush(dx);
        return;
      }
      // A swipe right on Settings belongs to the back gesture.
      if (start.kind === 'settings') return;
      if (!from) {
        from = /** @type {HTMLElement|null} */ (document.querySelector('.views > .view.tab-active'));
        views = from?.parentElement ?? null;
        if (!from || !views) return;
        width = views.clientWidth;
        views.classList.add('bc-tab-sliding');
      }
      const el = next && 'tab' in next ? document.getElementById(`view-${next.tab}`) : null;
      if (neighbour !== el) {
        release(neighbour);
        neighbour = el;
      }
      // At the end of the menu, the section only gives a little.
      const shown = el ? dx : dx / 3;
      from.style.transform = `translateX(${shown}px)`;
      if (el) {
        el.classList.add('bc-tab-peek');
        el.style.transform = `translateX(${shown + (dx < 0 ? width : -width)}px)`;
      }
    },
    cancel: cancelSwipe,
    end(dx, velocity) {
      // Where the swipe leads, read before its starting point is forgotten.
      const next = toward(dx);
      start = null;
      if (push) {
        endPush(dx, velocity);
        return;
      }
      if (!from || !views) return;
      const through = !!next && 'tab' in next && !!neighbour && swipeGoesThrough(dx, velocity, width);
      const left = from;
      const coming = neighbour;
      const container = views;
      from = neighbour = views = null;
      // From where the finger left the screen, at its speed (a third of both at the end of the menu).
      const shown = coming ? dx : dx / 3;
      const { easing, ms } = settle(shown, through ? (dx < 0 ? -width : width) : 0, coming ? velocity : velocity / 3);
      settling = true;
      const transition = `transform ${ms}ms ${easing}`;
      left.style.transition = transition;
      if (coming) coming.style.transition = transition;
      left.style.transform = through ? `translateX(${dx < 0 ? -width : width}px)` : '';
      if (coming) coming.style.transform = through ? 'translateX(0)' : `translateX(${dx < 0 ? width : -width}px)`;
      setTimeout(() => {
        if (through && next && 'tab' in next) showSection(next.tab);
        left.style.transform = '';
        left.style.transition = '';
        release(coming);
        container.classList.remove('bc-tab-sliding');
        settling = false;
      }, ms);
    },
  });
}
