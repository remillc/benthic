// @ts-check
// « Mon profil de plongeur » on screen (task 2026-11-18-272): the information, the consent and the cards read from the
// local store (lib/profile.js over lib/file-store.js, the same IndexedDB as the equipment) into one reactive object
// that the screens share. The data key of the sensitive items is kept by the plugin's secure storage.
import { OpenDivesCore } from 'opendives-core';
import { createFileStore, indexedDbBackend, memoryBackend } from './file-store.js';
import { createSecretBox } from './secret-box.js';
import { createProfile, emptyInfo } from './profile.js';
import { createHealthConsent } from './health-consent.js';
import { createServerApi } from './server-api.js';
import { serverTransport } from './server-transport.js';
import { serverUrl } from './server-url.js';

/** @typedef {import('./profile.js').DiverInfo} DiverInfo */
/** @typedef {import('./profile.js').Certification} Certification */

/** What the screens read. */
export const diver = $state({
  ready: false,
  info: emptyInfo(),
  consent: { consent: false, at: '', synced: true },
  /** @type {Certification[]} */
  certs: [],
});

/** @type {{ store: ReturnType<typeof createFileStore>, profile: ReturnType<typeof createProfile>, consent: ReturnType<typeof createHealthConsent> }|null} */
let opened = null;

/**
 * The key of the device: the plugin's secure storage. A plain browser (development only) has none: the key is then
 * kept beside the data, which protects nothing there.
 * @param {ReturnType<typeof createFileStore>} store
 * @returns {import('./secret-box.js').KeyKeeper}
 */
function keeper(store) {
  /** @param {any} e */
  const missing = (e) => e?.code === 'UNIMPLEMENTED' || e?.code === 'UNAVAILABLE' || /not implemented|unimplemented|not available/i.test(String(e?.message ?? ''));
  return {
    async read() {
      try {
        return (await OpenDivesCore.dataKeyRead()).key;
      } catch (e) {
        if (!missing(e)) throw e;
        return (await store.read('meta/dev-data-key.json'))?.key ?? '';
      }
    },
    async write(key) {
      try {
        await OpenDivesCore.dataKeyWrite({ key });
      } catch (e) {
        if (!missing(e)) throw e;
        await store.write('meta/dev-data-key.json', { format: 1, key });
      }
    },
  };
}

function open() {
  if (!opened) {
    const store = createFileStore(typeof globalThis.indexedDB === 'undefined' ? memoryBackend() : indexedDbBackend());
    const profile = createProfile(store, createSecretBox(keeper(store)));
    const api = createServerApi({ baseUrl: serverUrl(), transport: serverTransport });
    const consent = createHealthConsent(profile, {
      sessionToken: async () => {
        try {
          return (await OpenDivesCore.serverSessionAccess()).sessionToken || '';
        } catch {
          return '';
        }
      },
      get: (token) => api.healthConsent(token),
      set: (token, on) => api.setHealthConsent(token, on),
    });
    opened = { store, profile, consent };
  }
  return opened;
}

/** The profile and the consent service, for the screens that write. */
export const services = () => open();

/** Reads everything again from the store. */
export async function loadProfile() {
  const { profile } = open();
  const [info, consent, certs] = await Promise.all([profile.readInfo(), profile.readConsent(), profile.listCertifications()]);
  diver.info = info;
  diver.consent = consent;
  diver.certs = certs;
  diver.ready = true;
}

/** The account's answer about the consent, when reachable, then a new read. */
export async function refreshConsent() {
  await open().consent.refresh();
  await loadProfile();
}

/**
 * A change, then the screens read again.
 * @template T
 * @param {(p: ReturnType<typeof createProfile>, c: ReturnType<typeof createHealthConsent>) => Promise<T>} work
 * @returns {Promise<T>}
 */
export async function changeProfile(work) {
  const { profile, consent } = open();
  try {
    return await work(profile, consent);
  } finally {
    await loadProfile();
  }
}
