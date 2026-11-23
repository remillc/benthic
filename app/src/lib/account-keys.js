// @ts-check
// The account's data key on a second device (docs/account-sync.md, "The data key on a second device"): pairing with a
// camera (a one-time key K in a QR), pairing without a camera (ECDH P-256), the recovery key, the re-sealing of the
// local sealed files when a device joins, and the destructive start-over. Pure functions: WebCrypto, the clock and
// the reading and writing of the `benthic` branch are parameters; nothing here touches the store or the network.
// The file formats are in docs/account-sync.md ("QR payloads and key files").
//
// Errors are `Error` objects whose message is a code: PAIRING_PAYLOAD_INVALID, PAIRING_FILE_INVALID,
// PAIRING_ID_MISMATCH, PAIRING_EXPIRED, PAIRING_WRONG_KEY, RECOVERY_KEY_INVALID, RECOVERY_KEY_WRONG,
// RECOVERY_FILE_INVALID, ACCOUNT_KEY_FILE_INVALID, INVALID_DATA_KEY.

import { fromBase64, keyId, toBase64 } from './secret-box.js';

/** @typedef {{ crypto?: Crypto, now?: () => number }} Deps  `now` returns milliseconds since the epoch */
/** @typedef {{ key: string, kid: string }} AccountKey  `key`: 32 bytes in base64; `kid`: the key's id (secret-box.js) */
/** @typedef {{ path: string, json: any }} JsonFile */

export const ACCOUNT_KEY_PATH = 'keys/account.json';
export const RECOVERY_PATH = 'keys/recovery.json';
export const PAIRING_DIR = 'keys/pairing/';
/** How long a pairing file is valid. */
export const PAIRING_TTL_MS = 10 * 60 * 1000;

const PAYLOAD_PREFIX = 'benthic-pair:1:';
const enc = new TextEncoder();

/** @param {Deps} d */
const lib = (d) => d.crypto ?? globalThis.crypto;
/** @param {Deps} d */
const clock = (d) => (d.now ?? Date.now)();

/** @param {Uint8Array} bytes */
export const toBase64Url = (bytes) => toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
/** @param {string} text */
export const fromBase64Url = (text) => {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new Error('PAIRING_PAYLOAD_INVALID');
  const b = text.replace(/-/g, '+').replace(/_/g, '/');
  return fromBase64(b + '='.repeat((4 - (b.length % 4)) % 4));
};

/** @param {string} key base64 @returns {Uint8Array} */
function rawKey(key) {
  let raw;
  try {
    raw = fromBase64(key);
  } catch {
    throw new Error('INVALID_DATA_KEY');
  }
  if (raw.length !== 32) throw new Error('INVALID_DATA_KEY');
  return raw;
}

/** @param {Deps} d @param {Uint8Array} raw @param {KeyUsage[]} usages */
const aesKey = (d, raw, usages) => lib(d).subtle.importKey('raw', /** @type {BufferSource} */ (raw), 'AES-GCM', false, usages);

/**
 * AES-GCM seal of the account key under a wrapping key.
 * @param {Deps} d @param {CryptoKey} wrapKey @param {string} accountKey base64 @param {string} aad
 */
async function wrap(d, wrapKey, accountKey, aad) {
  const nonce = lib(d).getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await lib(d).subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: enc.encode(aad) }, wrapKey, /** @type {BufferSource} */ (rawKey(accountKey))));
  return { nonce: toBase64(nonce), ct: toBase64(ct) };
}

/**
 * @param {Deps} d @param {CryptoKey} wrapKey @param {{ nonce: string, ct: string }} f @param {string} aad
 * @returns {Promise<Uint8Array|null>} the 32 bytes, or null when the key is not the one that wrapped
 */
async function unwrap(d, wrapKey, f, aad) {
  try {
    const plain = new Uint8Array(await lib(d).subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(f.nonce), additionalData: enc.encode(aad) }, wrapKey, fromBase64(f.ct)));
    return plain.length === 32 ? plain : null;
  } catch {
    return null;
  }
}

/** @param {Uint8Array} raw @returns {Promise<AccountKey>} */
async function describe(raw) {
  return { key: toBase64(raw), kid: await keyId(raw) };
}

// ---------------------------------------------------------------------------------------------------------------
// The account key

/** Makes a new account key (the first device of an account, or after the start-over). @param {Deps} [d] @returns {Promise<AccountKey>} */
export async function newAccountKey(d = {}) {
  return describe(lib(d).getRandomValues(new Uint8Array(32)));
}

/** The content of `keys/account.json`. @param {string} kid @returns {JsonFile} */
export function accountKeyFile(kid) {
  return { path: ACCOUNT_KEY_PATH, json: { format: 1, kid } };
}

/** Reads `keys/account.json`. @param {any} json @returns {string} the account key's id */
export function parseAccountKeyFile(json) {
  if (!json || typeof json.kid !== 'string' || !/^[0-9a-f]{16}$/.test(json.kid)) throw new Error('ACCOUNT_KEY_FILE_INVALID');
  return json.kid;
}

// ---------------------------------------------------------------------------------------------------------------
// Pairing: the QR payload and the files

/** @typedef {{ mode: 'k', id: string, k: Uint8Array } | { mode: 'e', id: string, pub: Uint8Array }} PairingPayload */

/** @param {string} id */
const pairingPath = (id) => `${PAIRING_DIR}${id}.json`;

/** Parses the text of a scanned QR. @param {string} text @returns {PairingPayload} */
export function parsePairingPayload(text) {
  if (typeof text !== 'string' || !text.startsWith(PAYLOAD_PREFIX)) throw new Error('PAIRING_PAYLOAD_INVALID');
  const [mode, id, data, ...extra] = text.slice(PAYLOAD_PREFIX.length).split(':');
  if (extra.length || !data || !/^[A-Za-z0-9_-]{22}$/.test(id ?? '')) throw new Error('PAIRING_PAYLOAD_INVALID');
  const bytes = fromBase64Url(data);
  if (mode === 'k' && bytes.length === 32) return { mode: 'k', id, k: bytes };
  if (mode === 'e' && bytes.length === 65 && bytes[0] === 4) return { mode: 'e', id, pub: bytes };
  throw new Error('PAIRING_PAYLOAD_INVALID');
}

/** @param {any} f @param {string} id @param {'k'|'e'} mode */
function checkPairingFile(f, id, mode) {
  const ok = f && f.format === 1 && f.mode === mode && typeof f.kid === 'string' && Number.isFinite(f.expiresAt) && typeof f.nonce === 'string' && typeof f.ct === 'string' && (mode === 'k' || typeof f.epk === 'string');
  if (!ok) throw new Error('PAIRING_FILE_INVALID');
  if (f.id !== id) throw new Error('PAIRING_ID_MISMATCH');
}

/** @param {string} id @param {string} kid @param {number} expiresAt @param {string} mode */
const pairingAad = (id, kid, expiresAt, mode) => `pair|${mode}|${id}|${kid}|${expiresAt}`;

/**
 * Pairing with a camera, step 1, on the device that holds the account key: makes the one-time key K and the file.
 * The old device shows `payload` as a QR, commits `file`, and the new device reads both.
 * @param {AccountKey} account @param {Deps} [d]
 * @returns {Promise<{ id: string, payload: string, file: JsonFile, expiresAt: number }>}
 */
export async function createPairing(account, d = {}) {
  const id = toBase64Url(lib(d).getRandomValues(new Uint8Array(16)));
  const k = lib(d).getRandomValues(new Uint8Array(32));
  const expiresAt = clock(d) + PAIRING_TTL_MS;
  const w = await wrap(d, await aesKey(d, k, ['encrypt']), account.key, pairingAad(id, account.kid, expiresAt, 'k'));
  return {
    id,
    expiresAt,
    payload: `${PAYLOAD_PREFIX}k:${id}:${toBase64Url(k)}`,
    file: { path: pairingPath(id), json: { format: 1, mode: 'k', id, kid: account.kid, expiresAt, ...w } },
  };
}

/**
 * Pairing without a camera, step 1, on the new device (desktop): an ephemeral ECDH P-256 key pair. It shows `payload`
 * as a QR for the paired device to scan, keeps `privateKey` in memory, and later calls `acceptPairing` with it.
 * @param {Deps} [d]
 * @returns {Promise<{ id: string, payload: string, privateKey: CryptoKey, path: string }>} `path`: the file to wait for
 */
export async function createPairingRequest(d = {}) {
  const pair = /** @type {CryptoKeyPair} */ (await lib(d).subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']));
  const pub = new Uint8Array(await lib(d).subtle.exportKey('raw', pair.publicKey));
  const id = toBase64Url(lib(d).getRandomValues(new Uint8Array(16)));
  return { id, payload: `${PAYLOAD_PREFIX}e:${id}:${toBase64Url(pub)}`, privateKey: pair.privateKey, path: pairingPath(id) };
}

/** @param {Deps} d @param {CryptoKey} privateKey @param {CryptoKey} publicKey @param {string} id */
async function ecdhWrapKey(d, privateKey, publicKey, id) {
  const bits = await lib(d).subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256);
  const base = await lib(d).subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  return lib(d).subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode(id), info: enc.encode('benthic-pair-ecdh-v1') }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/**
 * Pairing without a camera, step 2, on the paired device that scanned the new device's QR: wraps the account key to
 * the new device's public key. Commit `file`.
 * @param {string} payloadText the scanned text @param {AccountKey} account @param {Deps} [d]
 * @returns {Promise<{ id: string, file: JsonFile, expiresAt: number }>}
 */
export async function answerPairingRequest(payloadText, account, d = {}) {
  const p = parsePairingPayload(payloadText);
  if (p.mode !== 'e') throw new Error('PAIRING_PAYLOAD_INVALID');
  let peer;
  try {
    peer = await lib(d).subtle.importKey('raw', /** @type {BufferSource} */ (p.pub), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  } catch {
    throw new Error('PAIRING_PAYLOAD_INVALID');
  }
  const eph = /** @type {CryptoKeyPair} */ (await lib(d).subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']));
  const epk = new Uint8Array(await lib(d).subtle.exportKey('raw', eph.publicKey));
  const expiresAt = clock(d) + PAIRING_TTL_MS;
  const w = await wrap(d, await ecdhWrapKey(d, eph.privateKey, peer, p.id), account.key, pairingAad(p.id, account.kid, expiresAt, 'e'));
  return { id: p.id, expiresAt, file: { path: pairingPath(p.id), json: { format: 1, mode: 'e', id: p.id, kid: account.kid, expiresAt, epk: toBase64Url(epk), ...w } } };
}

/**
 * Pairing, last step, on the new device: unwraps the account key from the scanned (or, without a camera, shown)
 * payload and the pairing file read from the branch. Afterwards: `box.adoptAccountKey(result.key)`, re-seal, delete the
 * pairing file (`pairingPath`), and tell the old device (it confirms by deleting the file too).
 * @param {{ payload?: string, id?: string, privateKey?: CryptoKey }} how with a camera: `payload` (the scanned text).
 *   Without: `id` and `privateKey` from `createPairingRequest`.
 * @param {any} fileJson the content of `keys/pairing/<id>.json`
 * @param {Deps} [d]
 * @returns {Promise<AccountKey>}
 */
export async function acceptPairing(how, fileJson, d = {}) {
  if (how.privateKey) {
    if (!how.id) throw new Error('PAIRING_PAYLOAD_INVALID');
    checkPairingFile(fileJson, how.id, 'e');
    if (clock(d) > fileJson.expiresAt) throw new Error('PAIRING_EXPIRED');
    let epk;
    try {
      epk = await lib(d).subtle.importKey('raw', /** @type {BufferSource} */ (fromBase64Url(fileJson.epk)), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    } catch {
      throw new Error('PAIRING_FILE_INVALID');
    }
    const raw = await unwrap(d, await ecdhWrapKey(d, how.privateKey, epk, how.id), fileJson, pairingAad(how.id, fileJson.kid, fileJson.expiresAt, 'e'));
    if (!raw) throw new Error('PAIRING_WRONG_KEY');
    return finish(raw, fileJson.kid);
  }
  const p = parsePairingPayload(how.payload ?? '');
  if (p.mode !== 'k') throw new Error('PAIRING_PAYLOAD_INVALID');
  checkPairingFile(fileJson, p.id, 'k');
  if (clock(d) > fileJson.expiresAt) throw new Error('PAIRING_EXPIRED');
  const raw = await unwrap(d, await aesKey(d, p.k, ['decrypt']), fileJson, pairingAad(p.id, fileJson.kid, fileJson.expiresAt, 'k'));
  if (!raw) throw new Error('PAIRING_WRONG_KEY');
  return finish(raw, fileJson.kid);
}

/** @param {Uint8Array} raw @param {string} kid */
async function finish(raw, kid) {
  const a = await describe(raw);
  if (a.kid !== kid) throw new Error('PAIRING_WRONG_KEY');
  return a;
}

/** The path of a pairing file, to wait for it or to delete it. @param {string} id */
export const pairingFilePath = pairingPath;

/** True when a pairing file is past its time (a clean-up pass deletes such files). @param {any} json @param {Deps} [d] */
export const isPairingExpired = (json, d = {}) => !json || !Number.isFinite(json.expiresAt) || clock(d) > json.expiresAt;

// ---------------------------------------------------------------------------------------------------------------
// Recovery key

/** Crockford's base32 alphabet: no I, L, O, U. */
export const RECOVERY_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const RECOVERY_CHARS = 26;

/** @param {Uint8Array} bytes 16 bytes @returns {string} 26 characters */
function base32(bytes) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += RECOVERY_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  if (bits > 0) out += RECOVERY_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/**
 * Turns what the diver typed into the 16 bytes: spaces, dashes and case ignored; O reads as 0, I and L as 1.
 * @param {string} input @returns {Uint8Array} @throws RECOVERY_KEY_INVALID
 */
export function parseRecoveryKey(input) {
  const s = String(input ?? '')
    .toUpperCase()
    .replace(/[\s-]+/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (s.length !== RECOVERY_CHARS) throw new Error('RECOVERY_KEY_INVALID');
  let value = 0;
  let bits = 0;
  const out = new Uint8Array(16);
  let n = 0;
  for (const ch of s) {
    const v = RECOVERY_ALPHABET.indexOf(ch);
    if (v < 0) throw new Error('RECOVERY_KEY_INVALID');
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8 && n < 16) {
      out[n++] = (value >>> (bits - 8)) & 255;
      bits -= 8;
    }
    value &= (1 << bits) - 1;
  }
  return out;
}

/** @param {string} chars 26 characters @returns {string} groups of four joined by dashes */
const groups = (chars) => /** @type {string[]} */ (chars.match(/.{1,4}/g)).join('-');

/** @param {Deps} d @param {Uint8Array} secret */
async function recoveryWrapKey(d, secret) {
  const base = await lib(d).subtle.importKey('raw', /** @type {BufferSource} */ (secret), 'HKDF', false, ['deriveKey']);
  return lib(d).subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('benthic-recovery-v1'), info: enc.encode('account key wrap') }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/**
 * Makes a recovery key for the account. Show `recoveryKey` once and commit `file` (`keys/recovery.json`). Making a new
 * one replaces the file, so the old recovery key stops working.
 * @param {AccountKey} account @param {Deps} [d]
 * @returns {Promise<{ recoveryKey: string, file: JsonFile }>} `recoveryKey`: 26 characters in groups of four, e.g. `ABCD-EFGH-JKMN-PQRS-TVWX-YZ01-23`
 */
export async function createRecoveryKey(account, d = {}) {
  const secret = lib(d).getRandomValues(new Uint8Array(16));
  const w = await wrap(d, await recoveryWrapKey(d, secret), account.key, `recovery|${account.kid}`);
  return { recoveryKey: groups(base32(secret)), file: { path: RECOVERY_PATH, json: { format: 1, kid: account.kid, ...w } } };
}

/**
 * Recovers the account key from the recovery key the diver typed and `keys/recovery.json`.
 * @param {string} input @param {any} fileJson @param {Deps} [d] @returns {Promise<AccountKey>}
 * @throws RECOVERY_KEY_INVALID (not a recovery key), RECOVERY_KEY_WRONG (well formed, but not this account's), RECOVERY_FILE_INVALID
 */
export async function recoverAccountKey(input, fileJson, d = {}) {
  const secret = parseRecoveryKey(input);
  if (!fileJson || fileJson.format !== 1 || typeof fileJson.kid !== 'string' || typeof fileJson.nonce !== 'string' || typeof fileJson.ct !== 'string') throw new Error('RECOVERY_FILE_INVALID');
  const raw = await unwrap(d, await recoveryWrapKey(d, secret), fileJson, `recovery|${fileJson.kid}`);
  if (!raw) throw new Error('RECOVERY_KEY_WRONG');
  const a = await describe(raw);
  if (a.kid !== fileJson.kid) throw new Error('RECOVERY_KEY_WRONG');
  return a;
}

// ---------------------------------------------------------------------------------------------------------------
// Re-sealing and start-over

/** @param {Uint8Array} bytes */
async function sha256Hex(bytes, d = {}) {
  return [...new Uint8Array(await lib(d).subtle.digest('SHA-256', /** @type {BufferSource} */ (bytes)))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Re-seals the local sealed files with the account key. The box must hold the old key (the device's own, read from the
 * keeper) and the account key (`box.adoptAccountKey`). Files: `profile/diver.json` (its `enc`), `certifications/*.json`
 * and `documents/*.json`. A document file is named by the hash of its ciphertext, so a re-sealed document gets a new
 * name and the card's `documents[].hash` follows; the old name is in `deletes`. A file the box cannot open is left
 * alone and listed in `locked` (nothing is lost; it shows as locked).
 * @param {JsonFile[]} files the files of the working copy, `json` as read
 * @param {import('./secret-box.js').SecretBox} box
 * @param {Deps} [d]
 * @returns {Promise<{ writes: JsonFile[], deletes: string[], locked: string[] }>} what to write and delete; nothing for a file already sealed with the account key
 */
export async function resealFiles(files, box, d = {}) {
  /** @type {JsonFile[]} */
  const writes = [];
  /** @type {string[]} */
  const deletes = [];
  /** @type {string[]} */
  const locked = [];
  /** @type {Map<string, string>} old document hash -> owner card id */
  const owners = new Map();
  /** @type {Map<string, string>} old document hash -> new document hash */
  const renamed = new Map();
  /** @type {Map<string, any>} card path -> opened payload */
  const payloads = new Map();
  const certs = files.filter((f) => /^certifications\/[^/]+\.json$/.test(f.path) && f.json?.enc);
  for (const f of certs) {
    try {
      const item = { id: f.json.id, format: f.json.format ?? 1 };
      const payload = await box.open(f.json.enc, item);
      payloads.set(f.path, payload);
      for (const doc of payload?.documents ?? []) if (typeof doc?.hash === 'string') owners.set(doc.hash, f.json.id);
    } catch (e) {
      if (!isKeyProblem(e)) throw e;
      locked.push(f.path);
    }
  }
  for (const f of files) {
    const m = /^documents\/([0-9a-f]+)\.json$/.exec(f.path);
    if (!m || !f.json?.enc) continue;
    const owner = owners.get(m[1]);
    if (!owner) continue;
    try {
      const enc2 = await box.reseal(f.json.enc, { id: owner, format: 1 }, true);
      if (enc2 === f.json.enc) continue;
      const hash = await sha256Hex(fromBase64(enc2.ct), d);
      renamed.set(m[1], hash);
      writes.push({ path: `documents/${hash}.json`, json: { ...f.json, enc: enc2 } });
      deletes.push(f.path);
    } catch (e) {
      if (!isKeyProblem(e)) throw e;
      locked.push(f.path);
    }
  }
  for (const f of certs) {
    const payload = payloads.get(f.path);
    if (!payload) continue;
    const item = { id: f.json.id, format: f.json.format ?? 1 };
    const kidNow = f.json.enc.kid;
    const resealed = await box.reseal(f.json.enc, item);
    const changedDocs = (payload.documents ?? []).some((/** @type {any} */ x) => renamed.has(x?.hash));
    if (resealed === f.json.enc && !changedDocs) continue;
    const next = changedDocs ? { ...payload, documents: payload.documents.map((/** @type {any} */ x) => (renamed.has(x?.hash) ? { ...x, hash: renamed.get(x.hash) } : x)) } : payload;
    // A changed payload is sealed again even when the card was already under the account key.
    const enc2 = changedDocs || kidNow !== resealed.kid ? await box.seal(next, item) : resealed;
    writes.push({ path: f.path, json: { ...f.json, enc: enc2 } });
  }
  const diver = files.find((f) => f.path === 'profile/diver.json');
  if (diver?.json?.enc) {
    try {
      const enc2 = await box.reseal(diver.json.enc, { id: 'profile', format: 1 });
      if (enc2 !== diver.json.enc) writes.push({ path: diver.path, json: { ...diver.json, enc: enc2 } });
    } catch (e) {
      if (!isKeyProblem(e)) throw e;
      locked.push(diver.path);
    }
  }
  return { writes, deletes, locked };
}

/** A key we do not hold, or a block our key does not open. @param {any} e */
const isKeyProblem = (e) => e?.message === 'MISSING_DATA_KEY' || e?.name === 'OperationError';

/**
 * « Repartir sans les données chiffrées »: every device and the recovery key are lost. Makes a new account key and
 * lists what to drop: the sealed files, which nobody can read any more, and the key files that wrap the old key. The
 * caller commits `account` (`keys/account.json`), deletes `deletes`, removes `enc` from each of `stripEnc`, then
 * `box.adoptAccountKey(key.key)` and `persistAccountKey()`. The recovery key, if wanted, is made again afterwards.
 * @param {string[]} paths every path of the working copy @param {Deps} [d]
 * @returns {Promise<{ key: AccountKey, account: JsonFile, deletes: string[], stripEnc: string[] }>}
 */
export async function startOver(paths, d = {}) {
  const key = await newAccountKey(d);
  const deletes = paths.filter((p) => /^(certifications|documents)\/[^/]+\.json$/.test(p) || p === RECOVERY_PATH || p.startsWith(PAIRING_DIR));
  return { key, account: accountKeyFile(key.kid), deletes, stripEnc: paths.includes('profile/diver.json') ? ['profile/diver.json'] : [] };
}
