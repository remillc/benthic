// @ts-check
// The steps of pairing by approval, without Svelte and without the app's singletons (the screens are in
// lib/account-sync-flows.svelte.js; node:test drives these with the real engine over git). The new device may have no working
// copy of the account yet (its first sync stopped at the join or at the missing key): the keys are fetched first
// (`fetchKeys` clones when needed) and nothing but key files is committed (`commitKeyFiles` with `keysOnly`), so no sync, hence
// no join of data, runs before the key is held. No camera call anywhere.
import { PAIRING_TTL_MS, accessRequestPath, acceptApproval, approveAccessRequest, createAccessRequest, readAccessRequest, resealFiles } from './account-keys.js';

/**
 * @typedef {Object} PairingDeps
 * @property {() => Promise<{ pairing: { path: string, json: any }[], requests: { path: string, json: any }[] }>} fetchKeys the server's key files (clones or pulls; no data)
 * @property {(c: { writes?: { path: string, json: any }[], deletes?: string[], message: string }) => Promise<{ status: string, error?: string }>} commitKeyFiles commits and pushes key files only
 * @property {() => number} [now]
 */

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

/** @param {{ status: string, error?: string }} result */
function mustBeSent(result) {
  if (result.status !== 'synced') throw new Error(result.error ?? result.status);
}

/**
 * @typedef {Object} AccessRequest what the new device keeps while it waits
 * @property {string} id
 * @property {string} code the 6 digits to compare
 * @property {number} expiresAt
 * @property {CryptoKey} privateKey
 * @property {string} answerPath
 * @property {string} path
 * @property {boolean} seen the request reached the server (its later absence means it was declined or deleted)
 */

/**
 * New device, step 1: the working copy is fetched (cloned when there is none), the request is committed and pushed. The code
 * can be shown as soon as this returns (or earlier: `request.code` is known before the commit).
 * @param {{ deviceName: string, platform?: string }} device @param {PairingDeps} deps
 * @returns {Promise<AccessRequest>}
 */
export async function requestAccess(device, deps) {
  const made = await createAccessRequest(device, { now: deps.now });
  await deps.fetchKeys();
  mustBeSent(await deps.commitKeyFiles({ writes: [made.file], message: 'Benthic: access request' }));
  return { id: made.id, code: made.code, expiresAt: made.expiresAt, privateKey: made.privateKey, answerPath: made.answerPath, path: made.file.path, seen: true };
}

/**
 * New device, while it waits: one look at the server.
 * @param {AccessRequest} request @param {PairingDeps} deps
 * @returns {Promise<{ state: 'waiting' } | { state: 'declined' } | { state: 'expired' } | { state: 'answer', json: any }>}
 */
export async function checkAnswer(request, deps) {
  const keys = await deps.fetchKeys();
  const answer = keys.pairing.find((f) => f.path === request.answerPath);
  if (answer) return { state: 'answer', json: answer.json };
  if (request.seen && !keys.requests.some((f) => f.path === request.path)) return { state: 'declined' };
  if ((deps.now ?? Date.now)() > request.expiresAt) return { state: 'expired' };
  return { state: 'waiting' };
}

/**
 * New device, last step: the account key unwrapped, adopted, the local items sealed again, the answer deleted (best effort: it
 * expires by itself and the next run deletes it). The join is not applied: it is offered afterwards.
 * @param {AccessRequest} request @param {any} answerJson @param {PairingDeps & { store: any, box: import('./secret-box.js').SecretBox }} deps
 * @returns {Promise<{ key: string, kid: string }>}
 */
export async function finishPairing(request, answerJson, deps) {
  const account = await acceptApproval({ id: request.id, privateKey: request.privateKey }, answerJson, { now: deps.now });
  await adoptAndReseal(account, deps);
  try {
    await deps.commitKeyFiles({ deletes: [request.answerPath], message: 'Benthic: paired' });
  } catch (e) {
    console.warn('Deleting the pairing answer', e);
  }
  return account;
}

/**
 * Paired device: the requests waiting for an answer, newest first, with their codes; expired and unreadable ones are left out.
 * @param {{ requests: { path: string, json: any }[] }} keys @param {{ now?: () => number }} [d]
 */
export async function pendingRequests(keys, d = {}) {
  const out = [];
  for (const f of keys.requests) {
    try {
      const r = await readAccessRequest(f.json, d);
      if (!r.expired) out.push(r);
    } catch {
      // Not a request: the clean-up pass deletes it when it is past its time.
    }
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Paired device, « Autoriser »: the request is read again from the server (it may have gone), the account key is wrapped to
 * its key, the answer committed and the request deleted in one commit.
 * @param {string} id @param {{ key: string, kid: string }} account @param {PairingDeps} deps
 */
export async function approveRequest(id, account, deps) {
  const found = (await deps.fetchKeys()).requests.find((f) => f.path === accessRequestPath(id));
  if (!found) throw new Error('PAIRING_EXPIRED');
  const answer = await approveAccessRequest(found.json, account, { now: deps.now });
  mustBeSent(await deps.commitKeyFiles({ writes: [answer.file], deletes: answer.deletes, message: 'Benthic: access approved' }));
}

/** Paired device, « Refuser »: the request is deleted, nothing else is written. @param {string} id @param {PairingDeps} deps */
export async function declineRequest(id, deps) {
  mustBeSent(await deps.commitKeyFiles({ deletes: [accessRequestPath(id)], message: 'Benthic: access declined' }));
}

/** New device, « Annuler »: its request is deleted (best effort). @param {AccessRequest} request @param {PairingDeps} deps */
export async function cancelRequest(request, deps) {
  mustBeSent(await deps.commitKeyFiles({ deletes: [request.path], message: 'Benthic: access request cancelled' }));
}

export { PAIRING_TTL_MS };
