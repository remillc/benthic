// @ts-check
// « Choisir un site » (task 2026-11-14-151): one screen for every place that needs a
// site — « Plongées sans site », a dive without a site, the Site field of « Modifier
// la plongée », and later the quick entry. The screen that asks says what to do with
// the site, then opens /sites/choose; the site chosen there, or the one created with
// « Créer un site à ma position actuelle » (« Nouveau site » opened from it), is given
// back to it.

/** @typedef {{ uuid: number, name: string }} ChosenSite */

/** @type {((site: ChosenSite) => void)|null} */
let pending = null;

/**
 * Opens « Choisir un site ».
 * @param {any} router the router of the screen that asks
 * @param {(site: ChosenSite) => void} apply what to do with the site
 */
export function chooseSite(router, apply) {
  pending = apply;
  router.navigate('/sites/choose');
}

/**
 * « Créer un site à ma position actuelle »: « Nouveau site » opens at the phone's position (when known) and
 * the site it saves, or the one nearby it uses, is given to `apply`.
 * @param {any} router
 * @param {(site: ChosenSite) => void} apply
 * @param {{ latUdeg: number, lonUdeg: number }|null} position
 */
export function createSiteHere(router, apply, position) {
  pending = apply;
  const at = position ? `&lat=${position.latUdeg}&lon=${position.lonUdeg}` : '';
  router.navigate(`/sites/new?choose=1${at}`);
}

/** Whether a screen is waiting for a site (« Nouveau site » then gives it back). */
export const waitingForSite = () => pending !== null;

/** Gives the site to the screen that asked, once. @param {ChosenSite} site */
export function deliverSite(site) {
  const apply = pending;
  pending = null;
  apply?.(site);
}

/** The screen that asked was left without a site. */
export function forgetSiteChoice() {
  pending = null;
}

/**
 * The phone's position, or null (no permission, no fix within 10 s).
 * @returns {Promise<{ latUdeg: number, lonUdeg: number }|null>}
 */
export function currentPosition() {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latUdeg: Math.round(pos.coords.latitude * 1e6), lonUdeg: Math.round(pos.coords.longitude * 1e6) }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  });
}
