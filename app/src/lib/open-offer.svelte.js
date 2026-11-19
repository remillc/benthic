// @ts-check
// The free account sheet's two doors into the first launch's OpenDives+ screens (task 2026-11-18-281): « S'abonner »
// opens the offer, « Se connecter » opens « Se connecter ou créer un compte ». The first launch opens over the logbook
// as « Nouveau carnet » does, with a way out that leaves the logbook as it was.
import { enterFromMenu, flow } from './first-launch.svelte.js';
import { logbook } from './logbook.svelte.js';

/**
 * @param {'offer'|'signIn'} screen
 * @param {''|'account'} [returnTo] where leaving the first launch goes back to: `'account'` reopens the account sheet
 */
export function openOdPlus(screen, returnTo = '') {
  enterFromMenu(screen);
  flow.returnTo = returnTo;
  logbook.welcome = true;
}

/**
 * « Envoyer le carnet au serveur »: a subscriber whose logbook is still on the device. The first launch opens at « Aucun
 * carnet sur votre compte », which offers to send the logbook of this device, with a way out that
 * leaves the logbook as it was.
 */
export function openMoveToServer() {
  enterFromMenu('move');
  logbook.welcome = true;
}
