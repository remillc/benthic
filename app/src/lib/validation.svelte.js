// @ts-check
// Dive validations on screen (inbox task 2026-11-19-309, point 2): the records read from the Benthic data store
// (lib/validation.js, `dive-validations/`), the validation by signature, the QR code made by the server, the signer's side
// of a scan (confirm now, or queue the confirmation until the phone is online) and the refresh of the pending ones.
import { BenthicCore } from 'benthic-core';
import { inventoryApi } from './inventory.svelte.js';
import { diveKeyOf, newId } from './inventory.js';
import { deviceStore } from './device-store.js';
import { diver, loadProfile, changeProfile } from './profile.svelte.js';
import { instructorNumber, cleanFullName } from './profile.js';
import { createServerApi, ServerError } from './server-api.js';
import { serverTransport } from './server-transport.js';
import { serverUrl } from './server-url.js';
import { connection } from './online.svelte.js';
import { encodeTransfer } from './qr-transfer.js';
import { loadDive } from './dive-preload.js';
import {
  applyResult, cleanSigner, dequeue, enqueue, itemsFor, parseQrText, pastGrace, pendingRecord, qrText, readQueue, signatureRecord, summaryOf, validatedKeys,
} from './validation.js';

/** @typedef {import('./validation.js').ValidationRecord} ValidationRecord */

/** What the screens read. */
export const validations = $state({ ready: false, /** @type {ValidationRecord[]} */ records: [] });

/** Keys of the dives that carry a confirmed validation (the logbook list's mark). */
export const markedKeys = () => validatedKeys(validations.records);

/** @type {{ records: ValidationRecord[]|null, keys: Set<string> }} */
const memo = { records: null, keys: new Set() };

/** Whether a dive of the list carries a confirmed validation; the set is rebuilt only when the records change. @param {{ date: string }} dive */
export function isValidated(dive) {
  const records = validations.records;
  if (memo.records !== records) {
    memo.records = records;
    memo.keys = validatedKeys(records);
  }
  return memo.keys.has(diveKeyOf(dive));
}

/** The validations of a dive (reads the reactive state). @param {Record<string, any>} dive */
export const validationsOf = (dive) => itemsFor(validations.records, dive);

const api = () => createServerApi({ baseUrl: serverUrl(), transport: serverTransport });
const sessionToken = async () => (await BenthicCore.serverSessionAccess()).sessionToken;

/** Reads the records again. */
export async function loadValidations() {
  validations.records = await inventoryApi().store.readAll('dive-validations/');
  validations.ready = true;
}

/** @param {ValidationRecord} record */
async function save(record) {
  await inventoryApi().commitFiles([[`dive-validations/${record.id}.json`, record]]);
  await loadValidations();
}

/** @param {string} id */
export async function removeValidation(id) {
  await inventoryApi().commitFiles([], [`dive-validations/${id}.json`]);
  await loadValidations();
}

/**
 * The dives of the ids, read from the core.
 * @param {number[]} ids
 */
export async function divesOf(ids) {
  return Promise.all(ids.map((id) => loadDive(id)));
}

/**
 * « Valider »: the signature on this screen.
 * @param {{ dives: Record<string, any>[], signer: { name: string, role: string, instructorNumber?: string }, signature: string }} f
 */
export async function addSignature({ dives, signer, signature }) {
  await save(signatureRecord({ id: newId(), signer, signature, dives, now: new Date() }));
}

/**
 * The diver's side of a QR code: asks the server for a code, keeps a pending validation, and returns what the screen draws.
 * Throws a ServerError (UNREACHABLE offline, SUBSCRIPTION_REQUIRED, TOO_MANY_REQUESTS).
 * @param {Record<string, any>[]} dives
 * @returns {Promise<{ id: string, token: string, expiresAt: string, chunks: string[] }>}
 */
export async function beginQr(dives) {
  const summary = summaryOf(dives);
  const { token, expiresAt } = await api().createValidationCode(await sessionToken(), summary);
  const record = pendingRecord({ id: newId(), token, expiresAt, dives, now: new Date() });
  await save(record);
  const { chunks } = await encodeTransfer({ kind: 'd', label: summary.dives[0]?.site || ' ', xml: qrText(token, summary) });
  return { id: record.id, token, expiresAt, chunks };
}

/**
 * Asks the server about one pending validation and keeps the answer.
 * @param {string} id
 * @returns {Promise<ValidationRecord|null>} the record after the answer; null when it is gone
 */
export async function refreshOne(id) {
  const record = validations.records.find((r) => r.id === id);
  if (!record || record.status !== 'pending' || !record.token) return record ?? null;
  let next;
  try {
    next = applyResult(record, await api().validationResult(await sessionToken(), record.token), new Date());
  } catch (e) {
    // The code is unknown to the server (purged): nothing will arrive. Anything else: try again later.
    if (e instanceof ServerError && e.code === 'TOKEN_UNKNOWN') next = null;
    else return record;
  }
  if (next === null) await removeValidation(id);
  else if (next !== record) await save(next);
  return next;
}

/** Refreshes every pending validation (when online) and drops the ones past the server's grace. */
export async function refreshPending() {
  if (!validations.ready) await loadValidations();
  const now = new Date();
  for (const r of validations.records.filter((x) => x.status === 'pending')) {
    if (r.expiresAt && pastGrace(r.expiresAt, now)) await removeValidation(r.id);
    else if (connection.online) await refreshOne(r.id);
  }
}

// --- The signer's side -----------------------------------------------------------------------------------------------

const QUEUE_KEY = 'bc.validationQueue';

/**
 * Who confirms: the diver's full name from his profile (task 2026-11-19-312; empty until he fills it in), the role and the
 * instructor number. The number comes from the card marked « Brevet de moniteur » in « Brevets et documents » (task
 * 2026-11-19-309, point 3): a diver who has one confirms as an instructor with that number, else as a buddy without one.
 * The confirmation screen lets the name be corrected for that confirmation only.
 * @returns {{ name: string, role: string, instructorNumber: string }}
 */
export function signerIdentity() {
  const own = instructorNumber(diver.certs)?.number ?? '';
  return { name: diver.info.fullName ?? '', role: own ? 'instructor' : 'buddy', instructorNumber: own };
}

/** What the scan decoded, when it is a validation code. @param {string} text */
export const readValidationCode = (text) => parseQrText(text);

/**
 * Confirms a scanned code. Online it goes through the server at once; offline (or when the server cannot be reached) the
 * confirmation is queued with the time of the scan and sent when the phone is online again.
 * @param {{ token: string }} code
 * @param {{ name: string, role: string, instructorNumber?: string }} signerFields
 * @returns {Promise<'sent'|'queued'>}
 */
export async function confirmCode(code, signerFields) {
  const signer = cleanSigner(signerFields);
  const item = { token: code.token, signer, scannedAt: new Date().toISOString() };
  if (connection.online) {
    try {
      await api().confirmValidation(await sessionToken(), item);
      return 'sent';
    } catch (e) {
      if (!(e instanceof ServerError) || e.code !== 'UNREACHABLE') throw e;
    }
  }
  deviceStore.setItem(QUEUE_KEY, JSON.stringify(enqueue(readQueue(deviceStore.getItem(QUEUE_KEY)), item)));
  return 'queued';
}

/** How many confirmations wait for a network on this phone. */
export const queuedCount = () => readQueue(deviceStore.getItem(QUEUE_KEY)).length;

/** Sends the queued confirmations. A refusal other than a lost network drops the item (the code is gone). */
export async function flushQueue() {
  if (!connection.online) return;
  for (const item of readQueue(deviceStore.getItem(QUEUE_KEY))) {
    try {
      await api().confirmValidation(await sessionToken(), item);
    } catch (e) {
      if (e instanceof ServerError && e.code === 'UNREACHABLE') return;
    }
    deviceStore.setItem(QUEUE_KEY, JSON.stringify(dequeue(readQueue(deviceStore.getItem(QUEUE_KEY)), item.token)));
  }
}

// --- The confirmation screen (after a scan) --------------------------------------------------------------------------

/** What the confirmation sheet shows; `open` is false when it is closed. */
export const confirmation = $state({
  open: false,
  token: '',
  /** @type {import('./validation.js').Summary} */
  summary: { diverName: '', dives: [] },
  name: '',
  role: 'buddy',
  instructorNumber: '',
  /** The agency and number of the instructor card, for the sentence under the name; '' when there is none. */
  instructorLine: '',
  /** Set once the name typed here was saved to an empty profile (the message « Enregistré dans votre profil »). */
  savedToProfile: false,
  working: false,
  /** '' or a key of validation.confirmError.* */
  error: '',
});

/** Opens the sheet for a scanned code, with the identity this diver confirmed last. @param {{ token: string, summary: import('./validation.js').Summary }} code */
export async function openConfirmation(code) {
  if (!diver.ready) await loadProfile().catch((e) => console.error('Reading the profile', e));
  const card = instructorNumber(diver.certs);
  Object.assign(confirmation, {
    open: true,
    token: code.token,
    summary: code.summary,
    ...signerIdentity(),
    instructorLine: card ? [card.agency, card.number].filter(Boolean).join(' ') : '',
    savedToProfile: false,
    working: false,
    error: '',
  });
}

export function closeConfirmation() {
  confirmation.open = false;
}

/**
 * « Je confirme ».
 * @returns {Promise<'sent'|'queued'|null>} null when the server refused (the reason is in `confirmation.error`)
 */
export async function submitConfirmation() {
  if (confirmation.working) return null;
  confirmation.working = true;
  confirmation.error = '';
  try {
    const how = await confirmCode({ token: confirmation.token }, { name: confirmation.name, role: confirmation.role, instructorNumber: confirmation.instructorNumber });
    confirmation.open = false;
    await keepNameInProfile(confirmation.name);
    return how;
  } catch (e) {
    const code = e instanceof ServerError ? e.code : 'UNREACHABLE';
    confirmation.error = { TOKEN_EXPIRED: 'expired', TOKEN_USED: 'used', OWN_CODE: 'own', SUBSCRIPTION_REQUIRED: 'plus', TOKEN_UNKNOWN: 'unknown', TOO_MANY_REQUESTS: 'tooMany' }[/** @type {string} */ (code)] ?? 'failed';
    return null;
  } finally {
    confirmation.working = false;
  }
}

/**
 * The name typed in the confirmation goes to the profile when the profile has none (task 2026-11-19-312, point 2): the
 * next confirmation starts from it. A profile that has a name is never changed from here.
 * @param {string} typed
 * @returns {Promise<boolean>} true when the profile was filled
 */
export async function keepNameInProfile(typed) {
  const name = cleanFullName(typed);
  if (!name || diver.info.fullName) return false;
  try {
    await changeProfile((p) => p.saveInfo({ ...diver.info, fullName: name }));
    confirmation.savedToProfile = true;
    return true;
  } catch (e) {
    console.error('Save the name to the profile', e);
    return false;
  }
}
