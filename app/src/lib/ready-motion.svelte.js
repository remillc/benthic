// @ts-check
// What « Votre carnet est prêt » plays (task 2026-11-18-270), shared by the screen's own header (a phone) and the blue
// panel (a tablet, the desktop: task 2026-11-18-275): decided once when the step appears, kept while it shows.
import { claimReadyMotion } from './ready-animation.js';

export const readyMotion = $state({ play: false, bubbles: false, still: false });

/** Called when the step appears: the first time it plays, then it shows its end. */
export function claimReady() {
  Object.assign(readyMotion, claimReadyMotion());
}
