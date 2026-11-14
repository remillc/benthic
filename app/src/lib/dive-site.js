// @ts-check
// Giving a site to a dive that has none: the list of dives without a site and
// the profile of one of them do the same thing. The site is chosen on « Choisir un
// site » (lib/site-choice.js).
import { showSnackbar } from './snackbar.js';
import { logbook, saveDiveChanges } from './logbook.svelte.js';
import { t } from './i18n.js';

/**
 * @param {number} diveId
 * @param {number} uuid
 * @returns {Promise<boolean>} whether the dive now has this site
 */
export async function setDiveSite(diveId, uuid) {
  try {
    await saveDiveChanges(diveId, { site: uuid });
    logbook.sitesVersion++;
    return true;
  } catch (e) {
    console.error('Set site', e);
    showSnackbar(t('edit.failed'));
    return false;
  }
}
