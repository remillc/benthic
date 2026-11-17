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
 * The counts of the summary card of « Votre carnet est prêt ».
 * @param {{ dives: number, sites: number, gear: number, certifications: number }} c
 * @returns {{ key: 'dives'|'sites'|'gear'|'certifications', n: number }[]}
 */
export function summaryRows(c) {
  return [
    { key: 'dives', n: c.dives },
    { key: 'sites', n: c.sites },
    { key: 'gear', n: c.gear },
    { key: 'certifications', n: c.certifications },
  ];
}
