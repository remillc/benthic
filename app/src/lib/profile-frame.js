// @ts-check
// « Mon profil de plongeur » on a wide screen (tasks 2026-11-18-275 and 277): the profile, its list and the chosen
// sheet side by side. Phones and tablets in portrait keep one column, as the phone's pages.
import { f7 } from 'framework7-svelte';
import { layout } from './layout.svelte.js';
import { deviceStore } from './device-store.js';
import { accountEmail } from './account-sheet.js';

/** True when the profile shows in panes: a tablet in landscape, the desktop app. */
export const profileWide = () => layout.split && (layout.desktop || !layout.portrait);

/** The sections of the profile pane, with the address that shows each. */
export const PROFILE_SECTIONS = /** @type {const} */ ({
  gear: '/profile/gear/',
  maintenance: '/profile/maintenance/',
  certs: '/profile/certs/',
  info: '/profile/info',
});

/**
 * The diver's line of the profile pane (name, number of dives, first year): the main window writes it, the Mac's separate
 * profile window (it does not load the logbook) reads it.
 * @param {{ email: string, odplus: boolean, dives: { date: string }[] }} book
 * @param {{ signedIn: boolean, email: string }} account
 * @returns {{ name: string, total: number, since: number }}
 */
export function heroOf(book, account) {
  return { name: accountEmail(account, book), total: book.dives.length, since: book.dives.reduce((year, d) => Math.min(year, Number(d.date.slice(0, 4)) || year), 9999) };
}

/** @param {{ name: string, total: number, since: number }} hero */
export function rememberHero(hero) {
  deviceStore.setItem('od.profileHero', JSON.stringify(hero));
}

/** @returns {{ name: string, total: number, since: number }} */
export function readHero() {
  try {
    return { name: '', total: 0, since: 9999, ...JSON.parse(deviceStore.getItem('od.profileHero') ?? '{}') };
  } catch {
    return { name: '', total: 0, since: 9999 };
  }
}

/**
 * Shows another screen of the profile in place of the current one: choosing in the panes does not pile up pages, so
 * leaving the profile takes one Back action.
 * @param {string} path
 */
export function showProfilePath(path) {
  const router = f7.views.current?.router;
  if (!router || router.currentRoute?.url === path) return;
  router.navigate(path, { reloadCurrent: true, animate: false });
}
