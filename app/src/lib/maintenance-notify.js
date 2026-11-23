// @ts-check
// The maintenance notifications (tasks 2026-11-18-274 and 2026-11-19-308): the lead time before each due date, the day
// itself and, for a late reminder, one a week until the maintenance is recorded, all at 9:00. lib/maintenance.js plans
// them (from Réglages › Notifications); the function installed here cancels what was scheduled and schedules the plan.
//   Phone and tablet: local notifications (@capacitor/local-notifications), with the buttons « Voir » and
//   « Noter l'entretien » (or « Me le rappeler dans 1 semaine » when late).
//   Desktop (Electron): the main process shows them while the app runs (desktop/notifications.cjs, `benthicDesktop.notifications`);
//   a notification cannot be scheduled while the app is closed there.
// The flight reminder is apart (lib/flight-reminder.svelte.js): it comes when the wait ends, not at 9:00.
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { registerActionTypes } from './action-types.js';
import { setNotificationDeliverer, leadDays, notificationMoment } from './maintenance.js';
import { gear, scheduleNotifications, evaluations } from './inventory.svelte.js';
import { settings } from './settings.svelte.js';
import { snoozeOneWeek } from './maintenance-snooze.js';
import { showSnackbar } from './snackbar.js';
import { notificationText } from './maintenance-text.js';
import { formatDate } from './format.js';
import { openOver } from './navigation.svelte.js';
import { setDesktopNotifications, desktopBridge } from './desktop-notifications.js';
import { t } from './i18n.js';

const CHANNEL_ID = 'maintenance';
/** The ids of this feature live in this range, apart from the flight reminder's. */
const ID_BASE = 100000;
const TYPE_DUE = 'maintenance-due';
const TYPE_LATE = 'maintenance-late';

const native = () => Capacitor.isNativePlatform();
/** The desktop bridge's notifications, when the app runs in Electron. */
const desktop = desktopBridge;

/** A stable integer for a notification id like `<uuid>:lead`. @param {string} key */
export function notificationId(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619) >>> 0;
  return ID_BASE + (h % 2000000000);
}

async function granted() {
  try {
    return (await LocalNotifications.checkPermissions()).display === 'granted';
  } catch {
    return false;
  }
}

/**
 * Asks the system for the permission to notify (Android 13 and later: POST_NOTIFICATIONS; iOS: the authorization).
 * Called when the first reminder is saved or the switch is turned on, not at start. Desktop: nothing to ask.
 * @returns {Promise<boolean>}
 */
export async function ensureNotificationPermission() {
  if (desktop()) return true;
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
  if (!native() || !settings.maintenanceNotify) return;
  if (await granted()) return;
  const ok = await ensureNotificationPermission();
  if (ok) scheduleNotifications();
  else showSnackbar(t('maintenance.notify.denied'));
}

/**
 * A choice of Réglages › Notifications changed: when the switch is on the permission is asked, then the plan is made
 * again. @returns {Promise<boolean>} false when the system refused
 */
export async function afterNotifyChange() {
  if (!settings.maintenanceNotify) {
    scheduleNotifications();
    return true;
  }
  const ok = await ensureNotificationPermission();
  if (!ok) showSnackbar(t('maintenance.notify.denied'));
  scheduleNotifications();
  return ok;
}

/** @param {import('./maintenance.js').PlannedNotification[]} plan */
function build(plan) {
  const evals = new Map(evaluations().map((e) => [e.item.id, e]));
  const now = Date.now();
  const out = [];
  for (const p of plan) {
    const e = evals.get(p.itemId);
    const piece = gear.pieces.find((g) => g.id === e?.item.gearId);
    const at = notificationMoment(p.on);
    if (!e || !piece || at.getTime() <= now) continue;
    const { title, body } = notificationText(p.kind, e, { pieceName: piece.name, days: leadDays(e.item, settings.maintenanceLeadDays), formatDate: formatDate });
    out.push({ id: notificationId(p.id), title, body, at, kind: p.kind, itemId: e.item.id, gearId: piece.id });
  }
  return out;
}

/** @type {import('./maintenance.js').NotificationDeliverer} */
async function deliver(plan) {
  const list = build(plan);
  const bridge = desktop();
  if (bridge) {
    try {
      // The bridge keeps one list per window: the documents' part (lib/document-notify.js) is sent with this one.
      await setDesktopNotifications('maintenance', list.map((n) => ({ id: n.id, title: n.title, body: n.body, at: n.at.getTime(), extra: { itemId: n.itemId, gearId: n.gearId, kind: n.kind } })));
    } catch (e) {
      console.error('Maintenance notifications (desktop)', e);
    }
    return;
  }
  if (!native()) return;
  try {
    // What this feature scheduled before goes, then the plan is scheduled again.
    const pending = (await LocalNotifications.getPending()).notifications.filter((n) => n.extra?.maintenance === true);
    if (pending.length) await LocalNotifications.cancel({ notifications: pending.map((n) => ({ id: n.id })) });
    if (!list.length || !(await granted())) return;
    if (Capacitor.getPlatform() === 'android') {
      await LocalNotifications.createChannel({ id: CHANNEL_ID, name: t('maintenance.channel.name'), description: t('maintenance.channel.description'), importance: 3, visibility: 1 });
    }
    await registerActionTypes({
      types: [
        { id: TYPE_DUE, actions: [{ id: 'view', title: t('maintenance.notify.view') }, { id: 'note', title: t('maintenance.notify.note') }] },
        { id: TYPE_LATE, actions: [{ id: 'view', title: t('maintenance.notify.view') }, { id: 'snooze', title: t('maintenance.notify.snooze') }] },
      ],
    });
    await LocalNotifications.schedule({
      notifications: list.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        channelId: CHANNEL_ID,
        actionTypeId: n.kind === 'overdue' ? TYPE_LATE : TYPE_DUE,
        schedule: { at: n.at, allowWhileIdle: false },
        extra: { maintenance: true, gearId: n.gearId, itemId: n.itemId, kind: n.kind },
      })),
    });
  } catch (e) {
    console.error('Maintenance notifications', e);
  }
}

/**
 * What a tap on a notification or on one of its buttons does: « Noter l'entretien » opens the form, « Me le rappeler
 * dans 1 semaine » puts the reminder off, anything else opens the piece's maintenance.
 * @param {string|undefined} actionId @param {{ gearId?: unknown, itemId?: unknown }} extra
 */
export function onNotificationAction(actionId, extra) {
  if (typeof extra?.gearId !== 'string') return;
  const itemId = typeof extra.itemId === 'string' ? extra.itemId : '';
  if (actionId === 'snooze' && itemId) {
    snoozeOneWeek(itemId);
    scheduleNotifications();
  } else if (actionId === 'note' && itemId) openOver(`/profile/gear/${extra.gearId}/maintenance/note?item=${itemId}`);
  else openOver(`/profile/gear/${extra.gearId}/maintenance`);
}

/** Installs the deliverer and the tap on a notification. Called once, at start. */
export function startMaintenanceNotifications() {
  setNotificationDeliverer(deliver);
  const bridge = desktop();
  if (bridge) {
    bridge.onClick?.((/** @type {any} */ extra) => onNotificationAction(undefined, extra));
    return;
  }
  if (!native()) return;
  LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
    const extra = event.notification?.extra;
    if (extra?.maintenance === true) onNotificationAction(event.actionId === 'tap' ? undefined : event.actionId, extra);
  });
}
