// @ts-check
// The desktop bridge's notification list is replaced at each call (desktop/notifications.cjs: one list per window), so
// the features that notify (maintenance, documents) each give their part here and the bridge gets the whole.

/** @typedef {{ id: number, title: string, body: string, at: number, extra: Record<string, unknown> }} DesktopNotification */

/** The bridge, when the app runs in Electron. */
export const desktopBridge = () => /** @type {any} */ (globalThis).odDesktop?.notifications ?? null;

/** @type {Map<string, DesktopNotification[]>} */
const parts = new Map();

/**
 * Sets one feature's part and sends every part.
 * @param {string} name 'maintenance' or 'documents'
 * @param {DesktopNotification[]} list
 */
export async function setDesktopNotifications(name, list) {
  const bridge = desktopBridge();
  if (!bridge) return;
  parts.set(name, list);
  await bridge.schedule({ notifications: [...parts.values()].flat() });
}
