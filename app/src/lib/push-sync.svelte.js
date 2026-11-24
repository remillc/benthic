// @ts-check
// The push channel on screen (to-do #185, docs/architecture.md « The push channel »): ties lib/push-events.js to the app. The
// Benthic server tells the devices when a branch of the logbook has a new head; this opens the stream while a Benthic+
// session exists (and the app runs: foreground or background, nothing is kept alive for it), and an event that brings a head
// this device does not have starts the dives' sync (`main`) or the account data sync (`benthic`), each gated as its
// automatic one is. « Seulement sur Wi-Fi ou câble »: the connection stays open on a metered link, nothing is synced from it
// (the sync that the network coming back triggers catches up). Every other trigger stays as the fallback.
import { BenthicCore } from 'benthic-core';
import { App as CapacitorApp } from '@capacitor/app';
import { isRelease } from './edition.js';
import { benthicPlusAccount } from './benthic-plus-state.svelte.js';
import { divesLocalHead, syncFromPush } from './logbook.svelte.js';
import { accountLocalHead, triggerAccountSyncFromPush } from './account-sync.svelte.js';
import { syncAllowedOnThisNetwork } from './sync-network.svelte.js';
import { sideWindow } from './layout.svelte.js';
import { Capacitor } from '@capacitor/core';
import { createPushEvents } from './push-events.js';
import { createFrontGate } from './push-front.js';
import { setPushLive } from './push-state.js';
import { refreshRequests } from './account-sync-flows.svelte.js';
import { serverUrl } from './server-url.js';

/** @type {ReturnType<typeof createPushEvents>|null} */
let channel = null;
let started = false;

function build() {
  const core = /** @type {any} */ (BenthicCore);
  return createPushEvents({
    open: (options) => core.pushStreamOpen(options),
    close: (id) => core.pushStreamClose({ id }),
    onEvent(listener) {
      /** @type {Promise<{ remove: () => Promise<void> }>} */
      const handle = core.addListener('pushStream', listener);
      return () => void handle.then((h) => h.remove()).catch(() => {});
    },
    async session() {
      const base = serverUrl();
      if (!base) return null;
      const token = (await BenthicCore.serverSessionAccess()).sessionToken;
      return token ? { url: `${base}/v1/events`, token } : null;
    },
    allowed: () => syncAllowedOnThisNetwork(),
    onLive: setPushLive,
    handlers: {
      main: { localHead: divesLocalHead, sync: () => syncFromPush() },
      benthic: {
        localHead: accountLocalHead,
        sync() {
          triggerAccountSyncFromPush();
          // A new device's access request is a file of this branch: look for requests now, the polling rests while live.
          void refreshRequests({ network: true });
        },
      },
    },
  });
}

/** Starts the push channel, once, when the logbook is open (App.svelte); it follows the session after that. */
export function startPushSync() {
  if (started || !isRelease || sideWindow) return;
  started = true;
  channel = build();
  if (typeof window !== 'undefined') window.addEventListener('online', () => channel?.online());
  const gate = createFrontGate({
    start: () => channel?.start(),
    stop: () => channel?.stop(),
    resume: () => channel?.resume(),
    wanted: () => benthicPlusAccount.signedIn,
  });
  CapacitorApp.addListener('resume', () => gate.toFront()).catch((/** @type {unknown} */ e) => console.error('App resume', e));
  // Phone and tablet: no connection while the app is not on screen (lib/push-front.js). The desktop keeps its own while it runs.
  if (Capacitor.isNativePlatform()) {
    CapacitorApp.addListener('pause', () => gate.toBack()).catch((/** @type {unknown} */ e) => console.error('App pause', e));
  }
  // Signed in: the stream is open; signed out: it is closed.
  $effect.root(() => {
    $effect(() => {
      void benthicPlusAccount.signedIn;
      gate.follow();
    });
  });
}
