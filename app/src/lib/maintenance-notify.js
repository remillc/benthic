// @ts-check
// The maintenance notifications (task 2026-11-18-274): the lead time before each due date and the day itself, as
// local notifications (@capacitor/local-notifications). lib/maintenance.js plans them; the function installed here is
// the one that cancels what was scheduled and schedules the plan. Native app only: on the desktop (Electron) a
// notification cannot be scheduled while the app is closed, so nothing is delivered there.
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { setNotificationDeliverer } from './maintenance.js';
import { gear, scheduleNotifications } from './inventory.svelte.js';
import { showSnackbar } from './snackbar.js';
import { taskInline } from './maintenance-text.js';
import { openOver } from './navigation.svelte.js';
import { t } from './i18n.js';

const CHANNEL_ID = 'maintenance';
/** Hour of the day the notifications come, local time. */
const HOUR = 9;
/** The ids of this feature live in this range, apart from the flight reminder's. */
const ID_BASE = 100000;

const native = () => Capacitor.isNativePlatform();

/** A stable integer for a notification id like `<uuid>:lead`. @param {string} key */
export function notificationId(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619) >>> 0;
  return ID_BASE + (h % 2000000000);
}

/** The moment a planned day's notification comes. @param {string} day YYYY-MM-DD */
export const notificationMoment = (day) => new Date(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10), HOUR, 0, 0);

async function granted() {
  try {
    return (await LocalNotifications.checkPermissions()).display === 'granted';
  } catch {
    return false;
  }
}

/**
 * Asks the system for the permission to notify (Android 13 and later: POST_NOTIFICATIONS; iOS: the authorization).
 * Called when the first reminder is saved, not at start.
 * @returns {Promise<boolean>}
 */
export async function ensureNotificationPermission() {
  if (!native()) return false;
  if (await granted()) return true;
  try {
    return (await LocalNotifications.requestPermissions()).display === 'granted';
  } catch (e) {
    console.error('Notification permission', e);
    return false;
  }
}

/**
 * Called when a reminder is saved: the first time, the system asks for the permission to notify (not at start); once
 * it is given the notifications are scheduled. A refusal is told, and the reminder stays in the app.
 */
export async function afterReminderSaved() {
  if (!native()) return;
  if (await granted()) return;
  const ok = await ensureNotificationPermission();
  if (ok) scheduleNotifications();
  else showSnackbar(t('maintenance.notify.denied'));
}

/** @type {import('./maintenance.js').NotificationDeliverer} */
async function deliver(plan) {
  if (!native()) return;
  try {
    // What this feature scheduled before goes, then the plan is scheduled again.
    const pending = (await LocalNotifications.getPending()).notifications.filter((n) => n.extra?.maintenance === true);
    if (pending.length) await LocalNotifications.cancel({ notifications: pending.map((n) => ({ id: n.id })) });
    if (!plan.length || !(await granted())) return;
    if (Capacitor.getPlatform() === 'android') {
      await LocalNotifications.createChannel({ id: CHANNEL_ID, name: t('maintenance.channel.name'), description: t('maintenance.channel.description'), importance: 3, visibility: 1 });
    }
    const now = Date.now();
    const notifications = [];
    for (const p of plan) {
      const item = gear.maintenance.find((m) => m.id === p.itemId);
      const piece = gear.pieces.find((g) => g.id === item?.gearId);
      const at = notificationMoment(p.on);
      if (!item || !piece || at.getTime() <= now) continue;
      const what = `${piece.name} · ${taskInline(item)}`;
      notifications.push({
        id: notificationId(p.id),
        title: t(p.kind === 'lead' ? 'maintenance.notify.leadTitle' : 'maintenance.notify.dueTitle'),
        body: t(p.kind === 'lead' ? 'maintenance.notify.leadBody' : 'maintenance.notify.dueBody', { what, n: item.notifyDays }),
        channelId: CHANNEL_ID,
        schedule: { at, allowWhileIdle: false },
        extra: { maintenance: true, gearId: piece.id },
      });
    }
    if (notifications.length) await LocalNotifications.schedule({ notifications });
  } catch (e) {
    console.error('Maintenance notifications', e);
  }
}

/** Installs the deliverer and the tap on a notification (opens the piece's maintenance). Called once, at start. */
export function startMaintenanceNotifications() {
  setNotificationDeliverer(deliver);
  if (!native()) return;
  LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
    const extra = event.notification?.extra;
    if (extra?.maintenance === true && typeof extra.gearId === 'string') openOver(`/profile/gear/${extra.gearId}/maintenance`);
  });
}
