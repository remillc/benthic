// @ts-check
// The notification action types of the iPhone (LocalNotifications.registerActionTypes). The system keeps one list per app and
// each registration replaces it: the maintenance reminders, the document reminders and the access request (« Répondre »)
// each registered their own and wiped the others. Every registration now goes through here, and the plugin always gets the union
// of what was registered in this run.
import { LocalNotifications } from '@capacitor/local-notifications';

/** @type {Map<string, any>} */
const registered = new Map();

/**
 * Adds these types to the ones already registered and registers them all.
 * @param {{ types: { id: string, actions: any[] }[] }} options
 */
export async function registerActionTypes({ types }) {
  for (const type of types) registered.set(type.id, type);
  await LocalNotifications.registerActionTypes({ types: [...registered.values()] });
}
