// @ts-check
// Download from a dive computer: what the download screen and the "Download
// failed" screen share. The last attempt is kept in memory only, so that
// "Réessayer" starts it again; nothing is stored.

/**
 * A dive computer to download from: the model (a libdivecomputer model, as
 * the core names it), the Bluetooth address ("LE:" + MAC for Bluetooth Low
 * Energy, the MAC alone for Classic) and the device's Bluetooth name.
 * `classicAddress`: the same device paired as Bluetooth Classic, tried when BLE fails.
 * @typedef {{ vendor: string, product: string, address: string, name: string, classicAddress?: string }} Computer
 */

import { f7 } from 'framework7-svelte';
import { OpenDivesCore } from 'opendives-core';
import { afterDownload, logbook } from './logbook.svelte.js';
import { offerUndo } from './undo.js';
import { showSnackbar } from './snackbar.js';
import { showSection } from './navigation.svelte.js';
import { showDives } from './filter.svelte.js';
import { t } from './i18n.js';
import { newDivesWithoutSite, quickEntryUrl } from './quick-entry.js';

/**
 * The message at the end of a download that added dives (task 2026-11-14-144). When the core merged
 * some of them into dives already in the logbook (another computer's recording of the same dive), it
 * says so, with « Voir »: that dive, or the Logbook showing only the merged dives. Otherwise
 * « N plongées téléchargées » with « Annuler », as before.
 * @param {{ downloaded?: number, list?: { merged?: number, mergedIds?: number[] } }} result
 */
export function announceDownload(result) {
  const n = result.downloaded ?? 0;
  if (!n) return;
  const ids = result.list?.mergedIds ?? [];
  if (!ids.length) {
    offerUndo(t('download.done', { n }));
    return;
  }
  showSnackbar(`${t('download.done', { n })}. ${t('download.merged', { n: ids.length })}`, {
    action: t('download.see'),
    timeout: 8000,
    onAction: async () => {
      if (ids.length === 1) {
        const { openDiveById } = await import('./open-link.js');
        await openDiveById(ids[0]);
      } else {
        showSection('logbook');
        await showDives(ids, logbook.prefs);
      }
    },
  });
}

/** The ids of the dives in the logbook, taken before a download to tell the new ones. */
export const diveIdsNow = () => new Set(logbook.dives.map((d) => d.id));

/**
 * The quick entry after a download (task 2026-11-14-151, « Compléter la plongée »): when the download
 * added dives that have no site, it opens for the oldest of them, then for the next, and the message of
 * the download (« N plongées téléchargées », « Annuler ») comes when it is closed. Nothing opens when
 * every new dive already has a site.
 * @param {any} router
 * @param {{ downloaded?: number, list?: { merged?: number, mergedIds?: number[] } }} result
 * @param {Set<number>} before the dive ids before the download (diveIdsNow)
 * @returns {boolean} the quick entry was opened (it announces the download itself)
 */
export function startQuickEntry(router, result, before) {
  if (!result.downloaded) return false;
  const wanted = newDivesWithoutSite(logbook.dives, before, result.list?.mergedIds);
  if (!wanted.length) return false;
  pendingAnnounce = result;
  router.navigate(quickEntryUrl(wanted));
  return true;
}

/** @type {Parameters<typeof announceDownload>[0]|null} */
let pendingAnnounce = null;

/**
 * The quick entry is over: the download's message, unless a save already made its own (an Undo must
 * take back the last change, which is then the save).
 * @param {boolean} [announce]
 */
export function endQuickEntry(announce = true) {
  const result = pendingAnnounce;
  pendingAnnounce = null;
  if (result && announce) announceDownload(result);
}

/**
 * Keeps the dives received before a download failed or was cancelled, as a
 * full download: one undoable step, saved and synced, with "N dives
 * downloaded" and Undo.
 * @returns {Promise<boolean>} kept
 */
export async function keepReceived() {
  try {
    const result = await OpenDivesCore.downloadPartial({ action: 'keep' });
    await afterDownload(result);
    announceDownload(result);
    return true;
  } catch (e) {
    console.error('Keeping the dives received', e);
    f7.dialog.create({ title: t('download.title'), text: t('download.cannotAdd'), buttons: [{ text: t('dialog.ok') }] }).open();
    return false;
  }
}

/** @type {{ computer: Computer|null, forceDownload: boolean }} */
export const lastAttempt = { computer: null, forceDownload: false };

/**
 * The address to connect to, as Subsurface's scan writes it: devices seen by
 * the Bluetooth Low Energy scan or paired as LE get "LE:" when the model can
 * use it; otherwise Bluetooth Classic (paired devices only, as on Android).
 * @param {import('opendives-core').BluetoothDevice} device
 * @param {{ ble: boolean, classic: boolean }|null} transports the model's, null when unknown
 */
export function addressFor(device, transports) {
  const ble = !transports || transports.ble;
  if (device.le && ble) return `LE:${device.mac}`;
  if (device.classic && (!transports || transports.classic)) return device.mac;
  return device.le ? `LE:${device.mac}` : device.mac;
}

/**
 * The MAC address of a stored address ("LE:AA:BB…" or "AA:BB…").
 * @param {string} address
 */
export function macOf(address) {
  return address.replace(/^(LE|BT):/i, '').toUpperCase();
}
