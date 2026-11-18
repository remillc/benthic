// @ts-check
// « Voir le site dans Sites » (desktop detail, tab Informations and Carte; task 2026-11-16-262): the
// dive detail asks the Sites section to open a site's sheet. The Sites page reads `uuid` once its list is
// loaded, selects the site and sets it back to 0.

export const siteFocus = $state({ uuid: 0 });

/** @param {number} uuid */
export function focusSite(uuid) {
  siteFocus.uuid = uuid;
}
