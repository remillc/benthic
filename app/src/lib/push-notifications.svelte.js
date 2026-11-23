// @ts-check
// Push notifications of access requests, wired to the platform (inbox task 2026-11-23-356, parts 3 and 4; logic and its rules:
// lib/push-notifications.js). Phone and tablet only: on the desktop and in a browser nothing here runs. Nothing here may block or
// break the app: every failure is a quiet log line.
import { Capacitor } from '@capacitor/core';
import { BenthicCore } from 'benthic-core';
import { deviceStore } from './device-store.js';
import { createServerApi } from './server-api.js';
import { serverTransport } from './server-transport.js';
import { serverUrl } from './server-url.js';
import { ACCESS_REQUEST_CATEGORY, ACCESS_REQUEST_ANSWER, createPush, parsePush } from './push-notifications.js';
import { registerActionTypes } from './action-types.js';
import { t } from './i18n.js';

const platform = (() => {
  const p = typeof window === 'undefined' ? '' : Capacitor.getPlatform();
  const desktop = typeof window !== 'undefined' && !!(/** @type {any} */ (window).benthicDesktop);
  return !desktop && (p === 'android' || p === 'ios') ? p : '';
})();

/** What the screens read. `view` is `granted`, `refused`, `undecided` or `unsupported` (lib/push-notifications.js). */
export const pushState = $state({
  /** @type {import('./push-notifications.js').PermissionView} */
  view: 'unsupported',
  /** The explanation (dialog on Android, bottom sheet on iPhone) is on screen. */
  asking: false,
});

const serverApi = () => createServerApi({ baseUrl: serverUrl(), transport: serverTransport });

/** @returns {Promise<string>} */
async function sessionToken() {
  try {
    return (await BenthicCore.serverSessionAccess()).sessionToken || '';
  } catch {
    return '';
  }
}

/** The plugins are loaded only on a phone or a tablet. @returns {Promise<{ push: typeof import('@capacitor/push-notifications').PushNotifications, local: typeof import('@capacitor/local-notifications').LocalNotifications }>} */
async function plugins() {
  const [{ PushNotifications }, { LocalNotifications }] = await Promise.all([import('@capacitor/push-notifications'), import('@capacitor/local-notifications')]);
  return { push: PushNotifications, local: LocalNotifications };
}

/** The id of this device's record, given by the account flows (lib/account-sync-flows.svelte.js). @type {() => Promise<string>} */
let deviceIdOf = async () => '';
/** What opening a notification does (the flows open the request). @type {(requestId: string) => void} */
let onOpen = () => {};
/** A push arrived while the app runs (a request may be new). @type {() => void} */
let onArrived = () => {};

/** @param {{ deviceId: () => Promise<string>, open: (requestId: string) => void, arrived: () => void }} wiring */
export function wirePush({ deviceId, open, arrived }) {
  deviceIdOf = deviceId;
  onOpen = open;
  onArrived = arrived;
}

/** @type {'android'|'ios'|''} */
const platformKind = platform;

export const pushClient = createPush({
  platform: platformKind,
  store: deviceStore,
  api: {
    registerPushToken: (session, f) => serverApi().registerPushToken(session, f),
    removePushToken: (session, deviceId) => serverApi().removePushToken(session, deviceId),
    signOut: (session) => serverApi().signOut(session),
  },
  sessionToken,
  permission: async () => (await (await plugins()).local.checkPermissions()).display,
  requestPermission: async () => (await (await plugins()).local.requestPermissions()).display,
  register: async () => (await plugins()).push.register(),
  unregister: async () => (await plugins()).push.unregister(),
});

/** Reads the system's state again (the diver may have changed it in the system settings). */
export async function refreshPushPermission() {
  pushState.view = pushClient.view(await pushClient.permission());
}

let listening = false;

/** The listeners of the token and of the notification that was touched; once per run. */
async function listen() {
  if (listening || !platform) return;
  listening = true;
  try {
    const { push } = await plugins();
    // iPhone: the « Répondre » action of the notification (the system also has it from the app, see AppDelegate.swift).
    if (platform === 'ios') void registerActionTypes({ types: [{ id: ACCESS_REQUEST_CATEGORY, actions: [{ id: ACCESS_REQUEST_ANSWER, title: t('accountSync.push.answer'), foreground: true }] }] }).catch((e) => console.warn('Registering the access request action', e));
    void push.addListener('registration', async (t) => void (await pushClient.onToken(t.value, await deviceIdOf())));
    void push.addListener('registrationError', (e) => console.warn('Push registration', e));
    // iPhone: a notification touched (the « Répondre » action or the notification itself), or one that arrived while the app is open.
    void push.addListener('pushNotificationActionPerformed', (action) => {
      const data = parsePush(action?.notification?.data);
      if (data?.type === 'access-request') onOpen(data.requestId);
    });
    void push.addListener('pushNotificationReceived', (n) => {
      if (parsePush(n?.data)?.type === 'access-request') onArrived();
    });
    // Android: the notification the plugin showed from a data message was touched (BenthicCorePlugin.offerAccessRequest).
    void BenthicCore.addListener('accessRequestOpened', (d) => {
      const id = String(d?.requestId ?? '');
      if (id) onOpen(id);
    });
    // Back from the system settings: the banner and the dialog follow what the diver chose there.
    const { App } = await import('@capacitor/app');
    void App.addListener('appStateChange', (s) => {
      if (s.isActive) void refreshPushPermission();
    });
  } catch (e) {
    listening = false;
    console.warn('Listening for push notifications', e);
  }
}

/** Starts listening and reads the system's state; the screens call it once the account is known. */
export async function startPush() {
  if (!platform) return;
  await listen();
  await refreshPushPermission();
}

/**
 * This device holds the account key: its token goes to the server when the system allows notifications. Never throws.
 */
export async function ensurePushRegistered() {
  if (!platform) return;
  try {
    await listen();
    await pushClient.ensure(await deviceIdOf());
    await refreshPushPermission();
  } catch (e) {
    console.warn('Registering this device for push notifications', e);
  }
}

/** This device was unpaired (it no longer holds the key): its token leaves the server. Never throws. */
export function removePushToken() {
  if (!platform || !pushClient.registered()) return;
  void pushClient.remove();
}

/** Sign-out: the server session and its tokens end. Never throws and never waits long. */
export async function signOutPush() {
  await pushClient.signOut();
}

/** « Ouvrir les réglages d’Android » / « … de l’iPhone »: the system's notification settings for Benthic. */
export async function openNotificationSettings() {
  try {
    await BenthicCore.openNotificationSettings();
  } catch (e) {
    console.warn('Opening the notification settings', e);
  }
}

/** The explanation is on screen (asked once on this device). */
export function showPushExplanation() {
  pushClient.markAsked();
  pushState.asking = true;
}

/** @param {boolean} accept « Continuer » (true) or « Plus tard » (false) */
export async function answerPushExplanation(accept) {
  pushState.asking = false;
  if (!accept) return refreshPushPermission();
  await pushClient.askSystem();
  await ensurePushRegistered();
}

/** Whether the explanation is due now (never answered, the system has not decided). */
export const pushExplanationDue = () => pushClient.explanationDue();
