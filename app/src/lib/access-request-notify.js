// @ts-check
// The system notification of an access request (to-do #183, task 2026-11-23-349 item 6): « Donner accès à « <name> » ? » and
// « Code de vérification 482 913. Touchez pour répondre. », shown when a paired device finds a request while the app is not in
// front (the web layer still runs: in the background on a phone or a tablet, a minimised window on a computer). It never asks
// for the notification permission by itself: without it nothing is shown and the request waits in the dialog.
//
// A closed app cannot be woken by this module: that needs a push through the server (not built). A request found at the next
// start of the app, or by the next sync, opens its dialog as usual.
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { t } from './i18n.js';
import { groupedCode } from './account-sync-screens.js';

/** A stable small number for a request id, so that the same request never notifies twice. @param {string} id */
function notificationId(id) {
  let h = 7;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
  return 1_500_000 + (Math.abs(h) % 400_000);
}

/** @type {Set<string>} */
const notified = new Set();

/**
 * @param {{ id: string, deviceName: string, code: string }} request
 * @returns {Promise<boolean>} true when a notification was shown
 */
export async function notifyAccessRequest(request) {
  if (notified.has(request.id)) return false;
  const title = t('accountSync.notify.title', { name: request.deviceName });
  const body = t('accountSync.notify.body', { code: groupedCode(request.code) });
  try {
    if (Capacitor.isNativePlatform()) {
      if ((await LocalNotifications.checkPermissions()).display !== 'granted') return false;
      await LocalNotifications.schedule({ notifications: [{ id: notificationId(request.id), title, body, extra: { kind: 'access-request', id: request.id } }] });
    } else if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(title, { body, tag: request.id });
    } else return false;
    notified.add(request.id);
    return true;
  } catch (e) {
    console.warn('Notifying an access request', e);
    return false;
  }
}
