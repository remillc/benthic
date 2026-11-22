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
/**
 * The sign-in buttons in the order of the platform (task 2026-11-19-289): « Continuer avec Apple » comes first on iOS
 * (Apple's guidelines), then Google; the e-mail comes last everywhere. Android and the others: Google, Apple, e-mail.
 * @param {boolean} ios
 * @returns {('apple'|'google'|'email')[]}
 */
export function providerOrder(ios) {
  return ios ? ['apple', 'google', 'email'] : ['google', 'apple', 'email'];
}

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

/**
 * « Tout ce qui est inclus » (task 2026-11-19-295): the rows of each group, with their icon and soft colour. A row whose
 * feature is not built yet carries `built: false` and is not listed (`includedGroups`): the screen never promises
 * what the app cannot do. Turn `built` on when the feature ships.
 * @typedef {{ key: string, icon: string, tone: 'blue'|'green'|'amber'|'violet'|'red', built: boolean }} IncludedRow
 */
export const INCLUDED = /** @type {{ key: string, rows: IncludedRow[] }[]} */ ([
  {
    key: 'carnet',
    rows: [
      { key: 'sync', icon: 'sync', tone: 'blue', built: true },
      { key: 'backup', icon: 'cloudDownload', tone: 'green', built: true },
      { key: 'restore', icon: 'history', tone: 'blue', built: true },
      { key: 'media', icon: 'image', tone: 'violet', built: false },
      { key: 'desktop', icon: 'desktop', tone: 'blue', built: true },
    ],
  },
  {
    key: 'profile',
    rows: [
      { key: 'gear', icon: 'briefcase', tone: 'amber', built: true },
      { key: 'maintenance', icon: 'wrench', tone: 'red', built: true },
      { key: 'certifications', icon: 'idCard', tone: 'violet', built: true },
      { key: 'info', icon: 'account', tone: 'blue', built: true },
      { key: 'gasAnalysis', icon: 'blender', tone: 'green', built: false },
      { key: 'gaugePhoto', icon: 'camera', tone: 'amber', built: true },
    ],
  },
  {
    key: 'maps',
    rows: [
      { key: 'offlineMaps', icon: 'map', tone: 'green', built: true },
      { key: 'divers', icon: 'sites', tone: 'blue', built: false },
    ],
  },
  {
    key: 'friends',
    rows: [
      { key: 'buddies', icon: 'personAdd', tone: 'violet', built: false },
      { key: 'verified', icon: 'checkCircle', tone: 'green', built: false },
      { key: 'publicProfile', icon: 'qr', tone: 'blue', built: false },
    ],
  },
]);

/** The groups of « Tout ce qui est inclus » with only their built rows; a group left empty is dropped. */
export function includedGroups() {
  return INCLUDED.map((g) => ({ key: g.key, rows: g.rows.filter((r) => r.built) })).filter((g) => g.rows.length > 0);
}
