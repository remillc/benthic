// @ts-check
// The free account sheet's two doors into the first launch's OpenDives+ screens (task 2026-11-18-281): « S'abonner »
// opens the offer, « Se connecter » opens « Se connecter ou créer un compte ». The first launch opens over the logbook
// as « Nouveau carnet » does, with a way out that leaves the logbook as it was.
import { enterFromMenu } from './first-launch.svelte.js';
import { logbook } from './logbook.svelte.js';

/** @param {'offer'|'signIn'} screen */
export function openOdPlus(screen) {
  enterFromMenu(screen);
  logbook.welcome = true;
}
