// @ts-check
// OpenDives+ in the release edition (task 2026-11-17-265): where an account goes after the code, the benefits the
// offer lists and the texts' keys. Pure, so that node:test can check the order. There is no free account: an account
// exists only for a diver who subscribed; « Continuer sans compte » and « Continuer sans abonnement » create nothing.

/**
 * Where a signed-in account goes: a subscribed one to its logbook, any other one to the offer. A session is kept on
 * the device only for the first.
 * @param {{ subscribed?: boolean }|undefined} user the `user` of the server's sign-in answer
 * @returns {'download'|'offer'}
 */
export function afterSignIn(user) {
  return user?.subscribed === true ? 'download' : 'offer';
}

/** The four cards of the offer, each with its soft colour (docs/mockups-release/android-odplus-offre.dc.html). */
export const BENEFITS = /** @type {const} */ ([
  { key: 'sync', icon: 'sync', tone: 'blue' },
  { key: 'backup', icon: 'cloudDownload', tone: 'green' },
  { key: 'gear', icon: 'briefcase', tone: 'amber' },
  { key: 'certifications', icon: 'idCard', tone: 'violet' },
]);

/** The three rows of « Ce qui est activé ». */
export const ACTIVATED = /** @type {const} */ (['sync', 'backup', 'gearCertifications']);

/**
 * The counts of the summary card of « Votre carnet est prêt ». The dives and the sites are always there; gear and
 * certifications are OpenDives-only data (the `opendives` branch, docs/architecture.md, section 11.3): their rows show
 * once something is stored. `known: false` (the desktop window downloads when it opens the logbook): no card.
 * @param {{ dives: number, sites: number, gear: number, certifications: number, known?: boolean }} c
 * @returns {{ key: 'dives'|'sites'|'gear'|'certifications', n: number }[]}
 */
export function summaryRows(c) {
  if (c.known === false) return [];
  return [
    { key: /** @type {const} */ ('dives'), n: c.dives },
    { key: /** @type {const} */ ('sites'), n: c.sites },
    { key: /** @type {const} */ ('gear'), n: c.gear },
    { key: /** @type {const} */ ('certifications'), n: c.certifications },
  ].filter((row) => row.n > 0 || row.key === 'dives' || row.key === 'sites');
}
