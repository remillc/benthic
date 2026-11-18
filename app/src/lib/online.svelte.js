// @ts-check
// Whether the device thinks it has a network (the browser's own flag, which
// Android's WebView keeps up to date, and the Network plugin, which also
// reports the change when the app was started offline). Reactive.
import { Network } from '@capacitor/network';

export const connection = $state({ online: typeof navigator === 'undefined' ? true : navigator.onLine });

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => (connection.online = true));
  window.addEventListener('offline', () => (connection.online = false));
  Network.addListener('networkStatusChange', (/** @type {{ connected: boolean }} */ s) => (connection.online = s.connected)).catch(() => {});
  Network.getStatus().then((s) => (connection.online = s.connected), () => {});
}
