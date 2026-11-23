// @ts-check
// « Mon profil de plongeur » on screen (task 2026-11-18-272): the information and the cards read from the
// local store (lib/profile.js over lib/file-store.js, the same IndexedDB as the equipment) into one reactive object
// that the screens share. The data key of the sensitive items is kept by the plugin's secure storage.
import { BenthicCore } from 'benthic-core';
import { createFileStore, indexedDbBackend, memoryBackend } from './file-store.js';
import { createSecretBox } from './secret-box.js';
import { createProfile, emptyInfo } from './profile.js';

/** @typedef {import('./profile.js').DiverInfo} DiverInfo */
/** @typedef {import('./profile.js').Certification} Certification */

/** What the screens read. */
export const diver = $state({
  ready: false,
  legacyBirthDate: false,
  info: emptyInfo(),
  /** @type {Certification[]} */
  certs: [],
});

/** @type {{ store: ReturnType<typeof createFileStore>, profile: ReturnType<typeof createProfile> }|null} */
let opened = null;

/** Written when the device makes its key: after that, an empty key read means a lost key (secret-box.js). */
const KEY_MADE = 'meta/data-key-made.json';

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
        return (await BenthicCore.dataKeyRead()).key;
      } catch (e) {
        if (!missing(e)) throw e;
        return (await store.read('meta/dev-data-key.json'))?.key ?? '';
      }
    },
    async write(key) {
      try {
        await BenthicCore.dataKeyWrite({ key });
      } catch (e) {
        if (!missing(e)) throw e;
        await store.write('meta/dev-data-key.json', { format: 1, key });
      }
    },
    async markKey() {
      await store.write(KEY_MADE, { format: 1 });
    },
    async hadKey() {
      if (await store.read(KEY_MADE)) return true;
      // A device from before the marker: sealed data already on it means a key was made.
      if ((await store.read('profile/diver.json'))?.enc) return true;
      return (await store.list('certifications/')).length > 0;
    },
  };
}

function open() {
  if (!opened) {
    const store = createFileStore(typeof globalThis.indexedDB === 'undefined' ? memoryBackend() : indexedDbBackend());
    const profile = createProfile(store, createSecretBox(keeper(store)));
    opened = { store, profile };
  }
  return opened;
}

/** The profile service, for the screens that write. */
export const services = () => open();

/** Reads everything again from the store. */
export async function loadProfile() {
  const { profile } = open();
  const [info, certs] = await Promise.all([profile.readInfo(), profile.listCertifications()]);
  const legacyBirthDate = await profile.hasClearBirthDate();
  diver.info = info;
  diver.certs = certs;
  diver.legacyBirthDate = legacyBirthDate;
  diver.ready = true;
}

/**
 * A change, then the screens read again.
 * @template T
 * @param {(p: ReturnType<typeof createProfile>) => Promise<T>} work
 * @returns {Promise<T>}
 */
export async function changeProfile(work) {
  const { profile } = open();
  try {
    return await work(profile);
  } finally {
    await loadProfile();
  }
}
