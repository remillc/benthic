// @ts-check
// The steps of pairing by approval, without Svelte and without the app's singletons (the screens are in
// lib/account-sync-flows.svelte.js; node:test drives these with the real engine over git). The new device may have no working
// copy of the account yet (its first sync stopped at the join or at the missing key): the keys are fetched first
// (`fetchKeys` clones when needed) and nothing but key files is committed (`commitKeyFiles` with `keysOnly`), so no sync, hence
// no join of data, runs before the key is held. No camera call anywhere.
import { DEVICES_DIR, PAIRING_TTL_MS, accessRequestPath, acceptApproval, approveAccessRequest, createAccessRequest, declineAccessRequest, deviceRecordFile, parseDevices, readAccessRequest, readDeclined, resealFiles } from './account-keys.js';

/**
 * @typedef {Object} PairingDeps
 * @property {() => Promise<{ pairing: { path: string, json: any }[], requests: { path: string, json: any }[], devices?: { path: string, json: any }[] }>} fetchKeys the server's key files (clones or pulls; no data)
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
 * @property {{ id: string, name: string, lastSeenAt: number }[]} [devices] the paired devices that can approve, as the server listed them
 */

/**
 * New device, step 1: the working copy is fetched (cloned when there is none), the request is committed and pushed. The code
 * can be shown as soon as this returns (or earlier: `request.code` is known before the commit).
 * @param {{ deviceName: string, platform?: string }} device @param {PairingDeps} deps
 * @returns {Promise<AccessRequest>}
 */
export async function requestAccess(device, deps) {
  const made = await createAccessRequest(device, { now: deps.now });
  const keys = await deps.fetchKeys();
  mustBeSent(await deps.commitKeyFiles({ writes: [made.file], message: 'Benthic: access request' }));
  return { id: made.id, code: made.code, expiresAt: made.expiresAt, privateKey: made.privateKey, answerPath: made.answerPath, path: made.file.path, seen: true, devices: pairedDevices(keys, { now: deps.now }) };
}

/**
 * New device, while it waits: one look at the server.
 * @param {AccessRequest} request @param {PairingDeps} deps
 * @returns {Promise<{ state: 'waiting' } | { state: 'declined', by: string } | { state: 'expired' } | { state: 'answer', json: any }>} `by`: the name of the device that refused (empty when the request just vanished)
 */
export async function checkAnswer(request, deps) {
  const keys = await deps.fetchKeys();
  const answer = keys.pairing.find((f) => f.path === request.answerPath);
  if (answer) {
    const declined = readDeclined(answer.json);
    return declined ? { state: 'declined', by: declined.by } : { state: 'answer', json: answer.json };
  }
  if (request.seen && !keys.requests.some((f) => f.path === request.path)) return { state: 'declined', by: '' };
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

/**
 * Paired device, « Refuser » or « Les codes sont différents »: the request is deleted and a marker with this device's name takes the
 * answer's place (no secret), so that the new device says who refused.
 * @param {string} id @param {string} by this device's name @param {PairingDeps} deps
 */
export async function declineRequest(id, by, deps) {
  const found = (await deps.fetchKeys()).requests.find((f) => f.path === accessRequestPath(id));
  // A request that is already gone (answered elsewhere, expired): nothing to refuse.
  if (!found) return;
  const decline = await declineAccessRequest(found.json, by, { now: deps.now });
  mustBeSent(await deps.commitKeyFiles({ writes: [decline.file], deletes: decline.deletes, message: 'Benthic: access declined' }));
}

/** New device: deletes the refusal marker it has read (best effort; it expires anyway). @param {AccessRequest} request @param {PairingDeps} deps */
export async function clearAnswer(request, deps) {
  try {
    await deps.commitKeyFiles({ deletes: [request.answerPath], message: 'Benthic: answer read' });
  } catch (e) {
    console.warn('Deleting the pairing answer', e);
  }
}

/**
 * The paired devices of the account as a new device lists them, without `exceptId` (this device), seen in the last `maxAgeMs`.
 * One line per name: the same device written twice (an old race) or two devices with one name show once, the latest seen.
 * @param {{ devices?: { path: string, json: any }[] }} keys @param {{ exceptId?: string, now?: () => number, maxAgeMs?: number }} [o]
 */
export function pairedDevices(keys, { exceptId = '', now = Date.now, maxAgeMs = 180 * 24 * 3600 * 1000 } = {}) {
  const seen = new Set();
  return parseDevices(keys.devices ?? [])
    .filter((d) => d.id !== exceptId && now() - d.lastSeenAt < maxAgeMs)
    .filter((d) => (seen.has(d.name) ? false : (seen.add(d.name), true)));
}

/** How long a device record is trusted before it is written again (and so how fresh « vu » is). */
export const DEVICE_TOUCH_MS = 6 * 60 * 60 * 1000;
/** A record not refreshed for this long is deleted by any paired device. */
export const DEVICE_PRUNE_MS = 60 * 24 * 3600 * 1000;
/** Another record with this device's name and platform, not refreshed for this long, is a leftover of this device (a race of the first run) and is deleted. */
export const DEVICE_TWIN_MS = 2 * DEVICE_TOUCH_MS;

/** One id per store, made once: concurrent callers share the promise. @type {WeakMap<object, Promise<string>>} */
const ids = new WeakMap();
/** One touch at a time per store. @type {WeakMap<object, Promise<unknown>>} */
const touching = new WeakMap();

const ID_RE = /^[A-Za-z0-9_-]{22}$/;

/**
 * This device's record id: read from `meta/device.json` (never synced), or made and written there at once, and kept. Concurrent
 * first callers get the same id.
 * @param {{ store: any, name?: string }} deps @returns {Promise<string>}
 */
export function deviceId({ store, name = '' }) {
  let p = ids.get(store);
  if (!p) {
    p = (async () => {
      const current = (await store.read('meta/device.json')) ?? {};
      if (typeof current.id === 'string' && ID_RE.test(current.id)) return current.id;
      const id = toId();
      await store.write('meta/device.json', { format: 1, id, name, touchedAt: 0 });
      return id;
    })();
    ids.set(store, p);
    p.catch(() => ids.delete(store));
  }
  return p;
}

/**
 * A paired device (one that holds the account key: `box.hasKey(box.getAccountKid())`) writes its record (name, last seen) at most
 * every `DEVICE_TOUCH_MS`; an unpaired device writes nothing. In the same commit it deletes the records not refreshed for
 * `DEVICE_PRUNE_MS` and its own leftovers (same name and platform, another id, not refreshed for `DEVICE_TWIN_MS`). Key files only.
 * @param {{ store: any, box?: any, name: string, platform?: string, now?: () => number, commitKeyFiles: PairingDeps['commitKeyFiles'], fetchKeys?: PairingDeps['fetchKeys'] }} deps
 * @returns {Promise<boolean>} true when a record was written
 */
export function touchDeviceRecord(deps) {
  const run = (touching.get(deps.store) ?? Promise.resolve()).catch(() => {}).then(() => touchOnce(deps));
  touching.set(deps.store, run);
  return run;
}

/** @param {Parameters<typeof touchDeviceRecord>[0]} deps */
async function touchOnce({ store, box, name, platform = '', now = Date.now, commitKeyFiles, fetchKeys }) {
  if (box) {
    const kid = box.getAccountKid();
    if (!kid || !(await box.hasKey(kid))) return false;
  }
  const id = await deviceId({ store, name });
  const current = (await store.read('meta/device.json')) ?? {};
  if (current.name === name && now() - (current.touchedAt ?? 0) < DEVICE_TOUCH_MS) return false;
  const file = deviceRecordFile({ id, name, platform }, { now });
  /** @type {string[]} */
  const deletes = [];
  if (fetchKeys) {
    try {
      for (const f of (await fetchKeys()).devices ?? []) {
        const j = f.json;
        const stale = !j || !Number.isFinite(j.lastSeenAt) || now() - j.lastSeenAt > DEVICE_PRUNE_MS;
        const twin = j && j.id !== id && j.name === name && (j.platform ?? '') === platform && now() - j.lastSeenAt > DEVICE_TWIN_MS;
        if (f.path !== file.path && (stale || twin)) deletes.push(f.path);
      }
    } catch (e) {
      console.warn('Reading the device records', e);
    }
  }
  const result = await commitKeyFiles({ writes: [file], deletes, message: 'Benthic: device seen' });
  if (result.status !== 'synced') return false;
  await store.write('meta/device.json', { format: 1, id, name, touchedAt: now() });
  return true;
}

/**
 * A device that does not hold the account key removes its own record when an earlier run wrote one. Nothing else is touched.
 * @param {{ store: any, commitKeyFiles: PairingDeps['commitKeyFiles'], fetchKeys: PairingDeps['fetchKeys'] }} deps
 * @returns {Promise<boolean>} true when a record was deleted
 */
export async function dropOwnDeviceRecord({ store, commitKeyFiles, fetchKeys }) {
  const current = await store.read('meta/device.json');
  if (!current || typeof current.id !== 'string' || !ID_RE.test(current.id)) return false;
  const path = `${DEVICES_DIR}${current.id}.json`;
  if (!((await fetchKeys()).devices ?? []).some((f) => f.path === path)) return false;
  const result = await commitKeyFiles({ deletes: [path], message: 'Benthic: device record removed' });
  if (result.status !== 'synced') return false;
  await store.write('meta/device.json', { ...current, touchedAt: 0 });
  return true;
}

/** @returns {string} 16 random bytes, base64url */
function toId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** This device's record id, for `pairedDevices` ('' when none was made yet). @param {{ store: any }} deps @returns {Promise<string>} */
export async function ownDeviceId({ store }) {
  return (await store.read('meta/device.json'))?.id ?? '';
}

/** New device, « Annuler »: its request is deleted (best effort). @param {AccessRequest} request @param {PairingDeps} deps */
export async function cancelRequest(request, deps) {
  mustBeSent(await deps.commitKeyFiles({ deletes: [request.path], message: 'Benthic: access request cancelled' }));
}

export { PAIRING_TTL_MS };
