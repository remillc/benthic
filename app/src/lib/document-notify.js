// @ts-check
// The notifications before a document expires (task 2026-11-19-309): an insurance, a medical certificate or another document
// with an expiry date notifies the diver's lead time before it (set in each document: 2 weeks, 30 days or 60 days), and
// on the day, at 9:00. « Expiration des documents » in Réglages › Notifications turns them off. Same way as the
// maintenance notifications (lib/maintenance-notify.js): local notifications on a phone and a tablet, the main process
// on the desktop. lib/documents.js plans them; the function here cancels what was scheduled and schedules the plan.
//   « Voir » opens the document; « Ajouter le nouveau » (medical certificate) opens the form for the next one;
//   « Me le rappeler dans 2 semaines » (the other documents) reminds once more, 2 weeks later.
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { diver, loadProfile } from './profile.svelte.js';
import { settings } from './settings.svelte.js';
import { documentNotificationPlan, snoozeDay } from './documents.js';
import { daysBetween, notificationMoment, todayIso } from './maintenance.js';
import { notificationId, ensureNotificationPermission } from './maintenance-notify.js';
import { setDesktopNotifications, desktopBridge } from './desktop-notifications.js';
import { deviceStore } from './device-store.js';
import { formatDate } from './format.js';
import { openOver } from './navigation.svelte.js';
import { showSnackbar } from './snackbar.js';
import { t } from './i18n.js';

const CHANNEL_ID = 'documents';
const SNOOZE_KEY = 'od.documentSnooze';
const TYPE_NEW = 'document-expires-new';
const TYPE_SNOOZE = 'document-expires-snooze';

const native = () => Capacitor.isNativePlatform();

/** @returns {Record<string, string>} the day each snoozed document may remind again */
export function readDocumentSnoozed() {
  try {
    const value = JSON.parse(deviceStore.getItem(SNOOZE_KEY) ?? '{}');
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

/** « Me le rappeler dans 2 semaines ». @param {string} docId @param {string} [today] */
export function snoozeDocument(docId, today = todayIso()) {
  const next = { ...readDocumentSnoozed(), [docId]: snoozeDay(today) };
  for (const [id, day] of Object.entries(next)) if (day <= today) delete next[id];
  deviceStore.setItem(SNOOZE_KEY, JSON.stringify(next));
}

/** The name of a document in a notification: « Certificat médical », « Assurance DAN Canada », its own title. @param {import('./profile.js').Certification} doc */
export const notificationName = (doc) => (doc.kind === 'medical' ? t('docs.medical.title') : doc.kind === 'insurance' ? t('docs.notify.insurance', { insurer: doc.insurer }) : doc.title);

/**
 * The title and the line of a notification.
 * @param {import('./profile.js').Certification} doc
 * @param {'lead'|'day'|'snooze'} kind
 * @param {string} on the day it comes
 */
export function notificationText(doc, kind, on) {
  const name = notificationName(doc);
  const date = formatDate(doc.expiresOn);
  const title = kind === 'day' ? t('docs.notify.titleToday', { name }) : t('docs.notify.title', { name, n: Math.max(1, daysBetween(on, doc.expiresOn)) });
  const body = t(`docs.notify.body.${doc.kind === 'medical' || doc.kind === 'insurance' ? doc.kind : 'other'}`, { date });
  return { title, body };
}

/** Plans from the documents on screen and hands the plan to the system. */
export function scheduleDocumentNotifications() {
  try {
    const today = todayIso();
    const plan = documentNotificationPlan(diver.certs, today, { enabled: settings.documentNotify, snoozed: readDocumentSnoozed() });
    const docs = new Map(diver.certs.map((d) => [d.id, d]));
    const now = Date.now();
    const list = [];
    for (const p of plan) {
      const doc = docs.get(p.docId);
      const at = notificationMoment(p.on);
      if (!doc || at.getTime() <= now) continue;
      list.push({ id: notificationId(`doc:${p.id}`), ...notificationText(doc, p.kind, p.on), at, docId: doc.id, docKind: doc.kind, kind: p.kind });
    }
    deliver(list).catch((e) => console.error('Scheduling the document notifications', e));
  } catch (e) {
    console.error('Planning the document notifications', e);
  }
}

/** @param {{ id: number, title: string, body: string, at: Date, docId: string, docKind: string, kind: string }[]} list */
async function deliver(list) {
  if (desktopBridge()) {
    await setDesktopNotifications('documents', list.map((n) => ({ id: n.id, title: n.title, body: n.body, at: n.at.getTime(), extra: { documents: true, docId: n.docId, docKind: n.docKind } })));
    return;
  }
  if (!native()) return;
  const pending = (await LocalNotifications.getPending()).notifications.filter((n) => n.extra?.documents === true);
  if (pending.length) await LocalNotifications.cancel({ notifications: pending.map((n) => ({ id: n.id })) });
  if (!list.length || (await LocalNotifications.checkPermissions()).display !== 'granted') return;
  if (Capacitor.getPlatform() === 'android') {
    await LocalNotifications.createChannel({ id: CHANNEL_ID, name: t('docs.notify.channel'), description: t('docs.notify.channelText'), importance: 3, visibility: 1 });
  }
  await LocalNotifications.registerActionTypes({
    types: [
      { id: TYPE_NEW, actions: [{ id: 'view', title: t('docs.notify.view') }, { id: 'new', title: t('docs.notify.addNew') }] },
      { id: TYPE_SNOOZE, actions: [{ id: 'view', title: t('docs.notify.view') }, { id: 'snooze', title: t('docs.notify.snooze') }] },
    ],
  });
  await LocalNotifications.schedule({
    notifications: list.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      channelId: CHANNEL_ID,
      actionTypeId: n.docKind === 'medical' ? TYPE_NEW : TYPE_SNOOZE,
      schedule: { at: n.at, allowWhileIdle: false },
      extra: { documents: true, docId: n.docId, docKind: n.docKind },
    })),
  });
}

/** The page of a document: a card has its own sheet. @param {string} docKind @param {string} docId */
export const documentPath = (docKind, docId) => (docKind === 'certification' ? `/profile/certs/${docId}` : `/profile/documents/${docId}`);

/**
 * What a tap on a notification or one of its buttons does.
 * @param {string|undefined} actionId @param {{ docId?: unknown, docKind?: unknown }} extra
 */
export function onDocumentAction(actionId, extra) {
  if (typeof extra?.docId !== 'string') return;
  const kind = typeof extra.docKind === 'string' ? extra.docKind : 'other';
  if (actionId === 'snooze') {
    snoozeDocument(extra.docId);
    scheduleDocumentNotifications();
  } else if (actionId === 'new' && kind === 'medical') openOver('/profile/documents/new/medical');
  else openOver(documentPath(kind, extra.docId));
}

/**
 * The switch of Réglages › Notifications changed: the permission is asked when it is on, then the plan is made again.
 * @returns {Promise<boolean>} false when the system refused
 */
export async function afterDocumentNotifyChange() {
  if (!settings.documentNotify) {
    scheduleDocumentNotifications();
    return true;
  }
  const ok = await ensureNotificationPermission();
  if (!ok) showSnackbar(t('maintenance.notify.denied'));
  scheduleDocumentNotifications();
  return ok;
}

/** A document was saved or deleted: the plan is made again, and the first expiry date asks for the permission to notify. */
export async function afterDocumentsChanged() {
  if (native() && settings.documentNotify && diver.certs.some((d) => d.kind !== 'certification' && d.expiresOn)) await ensureNotificationPermission();
  scheduleDocumentNotifications();
}

/** Installs the tap on a notification, reads the documents once and plans. Called once, at start. */
export async function startDocumentNotifications() {
  const bridge = desktopBridge();
  if (bridge) bridge.onClick?.((/** @type {any} */ extra) => extra?.documents === true && onDocumentAction(undefined, extra));
  else if (native()) {
    LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
      const extra = event.notification?.extra;
      if (extra?.documents === true) onDocumentAction(event.actionId === 'tap' ? undefined : event.actionId, extra);
    });
  }
  await loadProfile();
  scheduleDocumentNotifications();
}
