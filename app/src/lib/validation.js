// @ts-check
// Dive validation by a buddy or an instructor (inbox task 2026-11-19-309, point 2; Benthic+ only). Pure functions:
// the records, the fingerprint of a dive that detects « modifiée après la validation », the QR text and the clock of a code.
//
// Where it is kept. A validation belongs to the dive, but the Subsurface core has no generic door for a dive's extra data
// (the façade writes only the keys of plans and titles), and the dive's equipment already lives in the Benthic data store
// keyed by the dive's Benthic id (lib/inventory.js, diveKeyOf; the start time until migrated). A validation follows the same rule: one file
// `dive-validations/<id>.json` in the store, so nothing is written into the Subsurface logbook, desktop Subsurface reads
// and writes the log as before, and the signature image (a small PNG) stays next to it. When dives get their own UUID
// (docs/architecture.md, section 11.3) the record's `dives` move to that key.
//
// A record:
//   { format: 1, id, method: 'signature'|'qr', status: 'confirmed'|'pending',
//     signer: { name, role, instructorNumber }, signature: 'data:image/png;base64,...'|'', at: local time of the signing,
//     dives: [{ benthicId, hash }] ({ start: 'YYYY-MM-DDTHH:MM:SS', hash } until migrated), token?, expiresAt? (pending), createdAt, updatedAt }
// A validation of several dives is one record with several `dives`.

import { diveKeyOf, keyField, recordKey } from './inventory.js';

/** The roles of the signer, in the order of the menu. */
export const ROLES = /** @type {const} */ (['buddy', 'instructor', 'diveguide']);
/** @typedef {typeof ROLES[number]} Role */

/** A QR code is valid this long (the server enforces it). */
export const CODE_SECONDS = 600;
/** A confirmation made offline may still arrive this long after the code expired (the server's grace). */
export const GRACE_DAYS = 7;
/** Most dives one validation may hold: what the server accepts in a summary. */
export const MAX_DIVES = 20;

/**
 * A fast text hash (cyrb53, 53 bits, 14 hex digits): enough to see that a dive changed, never used for security.
 * @param {string} text
 */
export function hashText(text) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

/**
 * What the validation vouches for: the dive's own facts, not the screen's settings. Anything the diver edits in those
 * fields changes the hash.
 * @param {Record<string, any>} dive a DiveDetail
 */
export function fingerprint(dive) {
  const list = (/** @type {unknown} */ v) => (Array.isArray(v) ? v.map(String) : []);
  return JSON.stringify([
    String(dive.date ?? '').slice(0, 19),
    dive.site ?? '',
    dive.maxDepthMm ?? 0,
    dive.meanDepthMm ?? 0,
    dive.durationSeconds ?? 0,
    dive.divemode ?? '',
    list(dive.buddies),
    list(dive.guides),
    dive.suit ?? '',
    list(dive.tags),
    dive.notes ?? '',
    dive.rating ?? 0,
    dive.waterTempMk ?? 0,
    (dive.cylinders ?? []).map((/** @type {any} */ c) => [c?.o2Permille ?? 0, c?.hePermille ?? 0, c?.sizeMl ?? 0]),
  ]);
}

/**
 * A moment as the wall-clock text the app shows dates from (`YYYY-MM-DDTHH:MM:SS`, no zone), in the device's own time.
 * @param {Date} d
 */
export function localStamp(d) {
  const p = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** @param {Record<string, any>} dive */
export const diveHash = (dive) => hashText(fingerprint(dive));

/**
 * What is wrong with the signer's fields, for live validation.
 * @param {{ name: string, role: string }} f
 * @returns {{ name?: 'empty', role?: 'empty' }}
 */
export function signerProblems(f) {
  /** @type {{ name?: 'empty', role?: 'empty' }} */
  const out = {};
  if (!f.name.trim()) out.name = 'empty';
  if (!ROLES.includes(/** @type {Role} */ (f.role))) out.role = 'empty';
  return out;
}

/** @param {{ name: string, role: string, instructorNumber?: string }} f */
export const cleanSigner = (f) => ({ name: f.name.trim().replace(/\s+/g, ' ').slice(0, 80), role: f.role, instructorNumber: (f.instructorNumber ?? '').trim().slice(0, 40) });

/**
 * @typedef {Object} ValidationRecord
 * @property {number} format
 * @property {string} id
 * @property {'signature'|'qr'} method
 * @property {'confirmed'|'pending'} status
 * @property {{ name: string, role: string, instructorNumber: string }} signer name '' while pending
 * @property {string} signature a PNG data URL; '' for a QR validation
 * @property {string} at the signing, as local wall-clock text `YYYY-MM-DDTHH:MM:SS` (what the date formats of the app take); '' while pending
 * @property {{ benthicId?: string, start?: string, hash: string }[]} dives
 * @property {string} [token] the server's code, while pending
 * @property {string} [expiresAt] ISO time the code expires, while pending
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * A validation by signature on the signer's screen.
 * @param {{ id: string, signer: { name: string, role: string, instructorNumber?: string }, signature: string, dives: Record<string, any>[], now: Date }} f
 * @returns {ValidationRecord}
 */
export function signatureRecord({ id, signer, signature, dives, now }) {
  const stamp = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
  return { format: 1, id, method: 'signature', status: 'confirmed', signer: cleanSigner(signer), signature, at: localStamp(now), dives: dives.map(entryOf), createdAt: stamp, updatedAt: stamp };
}

/**
 * A validation by QR code, waiting for the signer's confirmation.
 * @param {{ id: string, token: string, expiresAt: string, dives: Record<string, any>[], now: Date }} f
 * @returns {ValidationRecord}
 */
export function pendingRecord({ id, token, expiresAt, dives, now }) {
  const stamp = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
  return { format: 1, id, method: 'qr', status: 'pending', signer: { name: '', role: '', instructorNumber: '' }, signature: '', at: '', dives: dives.map(entryOf), token, expiresAt, createdAt: stamp, updatedAt: stamp };
}

/** @param {Record<string, any>} dive */
const entryOf = (dive) => ({ ...keyField(diveKeyOf(dive)), hash: diveHash(dive) });

/**
 * The server's answer for a pending record, applied: confirmed with the signer's data, dropped when the server says the
 * code is gone, unchanged while it waits.
 * @param {ValidationRecord} record
 * @param {{ status: 'waiting'|'confirmed'|'expired', signer?: { name: string, role: string, instructorNumber?: string }, confirmedAt?: string }} result
 * @param {Date} now
 * @returns {ValidationRecord|null} null: remove the record
 */
export function applyResult(record, result, now) {
  if (result.status === 'expired') return null;
  if (result.status !== 'confirmed' || !result.signer) return record;
  const { token: _token, expiresAt: _expiresAt, ...rest } = record;
  return { ...rest, status: 'confirmed', signer: cleanSigner(result.signer), at: localStamp(result.confirmedAt ? new Date(result.confirmedAt) : now), updatedAt: now.toISOString().replace(/\.\d{3}Z$/, 'Z') };
}

/**
 * What a dive shows in « Validations ».
 * @typedef {Object} ValidationItem
 * @property {string} id
 * @property {'signature'|'qr'} method
 * @property {boolean} pending
 * @property {string} name
 * @property {string} role
 * @property {string} instructorNumber
 * @property {string} at the signing as local wall-clock text, as the app's dates; '' while pending
 * @property {string} signature
 * @property {boolean} modified the dive changed since the validation
 */

/**
 * The validations of one dive, the oldest first; `modified` compares the fingerprint kept at the signing with the dive now.
 * @param {ValidationRecord[]} records
 * @param {Record<string, any>} dive a DiveDetail
 * @returns {ValidationItem[]}
 */
export function itemsFor(records, dive) {
  const key = diveKeyOf(dive);
  const hash = diveHash(dive);
  return records
    .map((r) => ({ r, entry: r.dives.find((d) => recordKey(d) === key) }))
    .filter((x) => x.entry)
    .sort((a, b) => (a.r.createdAt < b.r.createdAt ? -1 : a.r.createdAt > b.r.createdAt ? 1 : 0))
    .map(({ r, entry }) => ({
      id: r.id,
      method: r.method,
      pending: r.status === 'pending',
      name: r.signer.name,
      role: r.signer.role,
      instructorNumber: r.signer.instructorNumber ?? '',
      at: r.at,
      signature: r.signature,
      modified: r.status === 'confirmed' && entry?.hash !== hash,
    }));
}

/**
 * The start keys of the dives that carry a confirmed validation: the mark of the logbook list.
 * @param {ValidationRecord[]} records
 * @returns {Set<string>}
 */
export function validatedKeys(records) {
  const out = new Set();
  for (const r of records) if (r.status === 'confirmed') for (const d of r.dives) out.add(recordKey(d));
  return out;
}

/**
 * A dive's start was edited: the records follow it.
 * @param {ValidationRecord[]} records @param {string} from @param {string} to
 * @returns {ValidationRecord[]} the records that changed
 */
export function rekey(records, from, to) {
  if (from === to) return [];
  return records.filter((r) => r.dives.some((d) => recordKey(d) === from)).map((r) => ({ ...r, dives: r.dives.map((d) => (recordKey(d) === from ? { hash: d.hash, ...keyField(to) } : d)) }));
}

/**
 * The summary the server hands to the signer (and the QR code carries): at most MAX_DIVES dives.
 * @param {Record<string, any>[]} dives @param {string} [diverName]
 */
export function summaryOf(dives, diverName = '') {
  return {
    diverName: diverName.trim().slice(0, 80),
    dives: dives.slice(0, MAX_DIVES).map((d) => ({ date: String(d.date).slice(0, 19), site: String(d.site ?? ''), maxDepthMm: Number(d.maxDepthMm) || 0, durationSeconds: Number(d.durationSeconds) || 0 })),
  };
}

/** @typedef {ReturnType<typeof summaryOf>} Summary */

/**
 * What the QR code carries: the server's code and the summary, so that a signer who is offline can read it. Carried as a
 * transfer of the app's own QR format (lib/qr-transfer.js), kind « d »: the native scanner accepts that kind only.
 * @param {string} token @param {Summary} summary
 */
export const qrText = (token, summary) => JSON.stringify({ bcValidation: 1, token, summary });

/**
 * Reads what a scan decoded; null when it is not a validation code.
 * @param {string} text
 * @returns {{ token: string, summary: Summary }|null}
 */
export function parseQrText(text) {
  if (!text.startsWith('{"bcValidation":1')) return null;
  try {
    const v = JSON.parse(text);
    if (typeof v.token !== 'string' || !/^[0-9a-f]{32}$/.test(v.token) || !Array.isArray(v.summary?.dives) || !v.summary.dives.length) return null;
    return { token: v.token, summary: { diverName: String(v.summary.diverName ?? ''), dives: v.summary.dives.slice(0, MAX_DIVES).map((/** @type {any} */ d) => ({ date: String(d.date), site: String(d.site ?? ''), maxDepthMm: Number(d.maxDepthMm) || 0, durationSeconds: Number(d.durationSeconds) || 0 })) } };
  } catch {
    return null;
  }
}

/**
 * Whole seconds left before a code expires (0 when it has).
 * @param {string} expiresAt ISO time @param {Date} now
 */
export function secondsLeft(expiresAt, now) {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / 1000));
}

/** Whether a pending record is past the server's grace: nothing can arrive any more. @param {string} expiresAt @param {Date} now */
export const pastGrace = (expiresAt, now) => now.getTime() > new Date(expiresAt).getTime() + GRACE_DAYS * 86400000;

/**
 * A confirmation made offline waits on the signer's phone until it can be sent.
 * @typedef {Object} QueuedConfirmation
 * @property {string} token
 * @property {{ name: string, role: string, instructorNumber: string }} signer
 * @property {string} scannedAt ISO time of the scan on this phone
 */

/**
 * The queue after one more confirmation (one per code).
 * @param {QueuedConfirmation[]} queue @param {QueuedConfirmation} item
 */
export const enqueue = (queue, item) => [...queue.filter((q) => q.token !== item.token), item];

/** The queue without the confirmation of a code. @param {QueuedConfirmation[]} queue @param {string} token */
export const dequeue = (queue, token) => queue.filter((q) => q.token !== token);

/** @param {unknown} value @returns {QueuedConfirmation[]} */
export function readQueue(value) {
  try {
    const list = typeof value === 'string' ? JSON.parse(value) : [];
    return Array.isArray(list) ? list.filter((q) => q && typeof q.token === 'string' && q.signer && typeof q.scannedAt === 'string') : [];
  } catch {
    return [];
  }
}
