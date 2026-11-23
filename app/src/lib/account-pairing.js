// @ts-check
// The steps of pairing on the device that receives the account key, without Svelte and without the app's singletons (the
// screens are in lib/account-sync-flows.svelte.js; node:test drives these with the real engine over git). The device may
// have no working copy of the account yet (its first sync stopped at the join or at the missing key): the keys are fetched
// first (`fetchKeys` clones when needed) and no sync, hence no join, runs before the key is held.
import { acceptPairing, pairingFilePath, parsePairingPayload, resealFiles } from './account-keys.js';

/**
 * The server's pairing file `id`, after a few reads of the account's keys.
 * @param {string} id
 * @param {{ fetchKeys: () => Promise<{ pairing: { path: string, json: any }[] }>, attempts?: number, waitMs?: number, sleep?: (ms: number) => Promise<void> }} deps
 * @returns {Promise<any|null>}
 */
export async function waitPairingFile(id, { fetchKeys, attempts = 4, waitMs = 1500, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const found = (await fetchKeys()).pairing.find((f) => f.path === pairingFilePath(id));
    if (found) return found.json;
    if (attempt < attempts - 1) await sleep(waitMs);
  }
  return null;
}

/**
 * This device now holds the account key: the local sealed files are sealed again with it (they go up at the next run), then it
 * becomes the device's own key.
 * @param {{ key: string, kid: string }} account
 * @param {{ store: any, box: import('./secret-box.js').SecretBox }} deps
 */
export async function adoptAndReseal(account, { store, box }) {
  await box.adoptAccountKey(account.key);
  const paths = ['profile/diver.json', ...(await store.list('certifications/')), ...(await store.list('documents/'))];
  /** @type {{ path: string, json: any }[]} */
  const files = [];
  for (const path of paths) {
    const json = await store.read(path);
    if (json) files.push({ path, json });
  }
  const { writes, deletes } = await resealFiles(files, box);
  if (writes.length || deletes.length) await store.trackedBatch({ writes: writes.map((w) => [w.path, w.json]), removes: deletes });
  await box.persistAccountKey();
}

/**
 * Pairing with the camera on the new device: the scanned text, the pairing file read from the server (the working copy is
 * cloned when there is none), the account key unwrapped, adopted, the local items sealed again, the pairing file deleted.
 * The join is not applied: it is offered afterwards.
 * @param {string} text the scanned code
 * @param {{ store: any, box: import('./secret-box.js').SecretBox, fetchKeys: () => Promise<{ pairing: { path: string, json: any }[] }>, commitKeyFiles: (c: { deletes: string[], message: string }) => Promise<unknown>, attempts?: number, waitMs?: number, sleep?: (ms: number) => Promise<void> }} deps
 * @returns {Promise<{ key: string, kid: string }>}
 */
export async function pairWithCode(text, deps) {
  const payload = parsePairingPayload(text);
  if (payload.mode !== 'k') throw new Error('PAIRING_PAYLOAD_INVALID');
  const file = await waitPairingFile(payload.id, deps);
  if (!file) throw new Error('PAIRING_EXPIRED');
  const account = await acceptPairing({ payload: text }, file);
  await adoptAndReseal(account, deps);
  await deps.commitKeyFiles({ deletes: [pairingFilePath(payload.id)], message: 'Benthic: paired' });
  return account;
}
