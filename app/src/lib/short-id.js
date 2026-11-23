// @ts-check
// The ids of Benthic's own data (pieces, kits, reminders, certifications, what a dive used, validations, devices) and the
// rewriting of the older UUID ids (to-do #149, decided on 23 November 2026).
//
// A new id is 10 characters of lowercase Crockford base32 (`0123456789abcdefghjkmnpqrstvwxyz`: no i, l, o or u), that is 50
// random bits from `crypto.getRandomValues`, with no prefix: `7k2m9q4x1d`.
//
// An id already in circulation is rewritten with `shortFromUuid`: the first 50 bits of SHA-256(`benthic-id-v1|` + uuid), in the
// same alphabet. The mapping has no state and no key, so every device rewrites on its own and gets the same result, an
// offline device with edits on old ids included. `resolveId` accepts an old UUID anywhere an id is read (a route, a
// notification, a link, a remembered choice) and gives the new id. The rewriting of the data itself is
// `short-id-migration.js`; docs/account-sync.md, « Short ids ».
//
// Never touches Subsurface data: dive ids and the logbook's git format are not Benthic ids.

/** Crockford's base32 in lowercase, as the recovery key uses it, without its check symbols. */
export const ID_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

/** Characters of an id: 10 x 5 bits = 50 bits. */
export const ID_LENGTH = 10;

/** The prefix of the text that is hashed: it names the version of the mapping, so that another one can follow. */
export const ID_DERIVATION = 'benthic-id-v1|';

const SHORT_RE = /^[0-9a-hjkmnp-tv-z]{10}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_IN_TEXT = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
/** The device ids of the first sync build: 16 random bytes in base64url. */
const LEGACY_DEVICE_RE = /^[A-Za-z0-9_-]{22}$/;

/** @param {unknown} id */
export const isShortId = (id) => typeof id === 'string' && SHORT_RE.test(id);

/** @param {unknown} id */
export const isUuid = (id) => typeof id === 'string' && UUID_RE.test(id);

/** The id of a device made by the first sync build (22 characters of base64url), which is rewritten too. @param {unknown} id */
export const isLegacyDeviceId = (id) => typeof id === 'string' && LEGACY_DEVICE_RE.test(id) && !isShortId(id);

/**
 * 10 characters from 10 random bytes: 256 is a multiple of 32, so each byte's low 5 bits are uniform, with no bias.
 * @param {{ getRandomValues: (a: Uint8Array) => Uint8Array }} [source] the random source (tests); `crypto` by default
 * @returns {string}
 */
export function newShortId(source = /** @type {any} */ (globalThis).crypto) {
  if (!source?.getRandomValues) throw new Error('NO_RANDOM_SOURCE');
  const bytes = source.getRandomValues(new Uint8Array(ID_LENGTH));
  let out = '';
  for (let i = 0; i < ID_LENGTH; i++) out += ID_ALPHABET[bytes[i] & 31];
  return out;
}

/** The ids are drawn from here: one function for the app, replaceable in the tests. */
export const newId = () => newShortId();

// ---------------------------------------------------------------------------------------------------------------
// SHA-256, synchronous (RFC 6234). WebCrypto's digest is asynchronous, and the mapping must answer in a route guard and in
// a render. Checked against WebCrypto in tests/app/short-id.test.mjs.

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** @param {Uint8Array} data @returns {Uint8Array} 32 bytes */
export function sha256(data) {
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const padded = new Uint8Array(((data.length + 9 + 63) >> 6) << 6);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor((data.length * 8) / 0x100000000));
  view.setUint32(padded.length - 4, (data.length * 8) >>> 0);
  const w = new Uint32Array(64);
  const rotr = (/** @type {number} */ x, /** @type {number} */ n) => (x >>> n) | (x << (32 - n));
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    h[0] += a;
    h[1] += b;
    h[2] += c;
    h[3] += d;
    h[4] += e;
    h[5] += f;
    h[6] += g;
    h[7] += hh;
  }
  const out = new Uint8Array(32);
  const o = new DataView(out.buffer);
  h.forEach((x, i) => o.setUint32(i * 4, x));
  return out;
}

/**
 * The id that stands for `text`: the first 50 bits of SHA-256(`benthic-id-v1|` + text), five bits per character. `attempt` is 0
 * except when two ids would take the same new id (`short-id-migration.js`): the text then carries `|<attempt>`, so the answer
 * is still the same on every device.
 * @param {string} text @param {number} [attempt]
 * @returns {string}
 */
export function deriveId(text, attempt = 0) {
  const digest = sha256(new TextEncoder().encode(`${ID_DERIVATION}${text}${attempt ? `|${attempt}` : ''}`));
  let bits = 0n;
  for (let i = 0; i < 7; i++) bits = (bits << 8n) | BigInt(digest[i]);
  bits >>= 6n; // 56 bits read, the first 50 kept
  let out = '';
  for (let i = ID_LENGTH - 1; i >= 0; i--) out += ID_ALPHABET[Number((bits >> BigInt(i * 5)) & 31n)];
  return out;
}

/** The new id of an old UUID (case does not matter). @param {string} uuid @param {number} [attempt] */
export const shortFromUuid = (uuid, attempt = 0) => deriveId(uuid.toLowerCase(), attempt);

/** The ids that take another id than the first one the mapping gives (a collision, `short-id-migration.js`). @type {Map<string, string>} */
let aliases = new Map();

/** Remembers the collision answers read from `meta/id-map.json`. @param {Record<string, string>|undefined|null} map */
export function setIdAliases(map) {
  aliases = new Map(Object.entries(map ?? {}).filter(([k, v]) => typeof v === 'string' && isShortId(v) && (isUuid(k) || isLegacyDeviceId(k))));
}

/** The new id of an id read from outside the data (a route, a link, a notification, a remembered choice); anything else stays as is. @param {string} id */
export function resolveId(id) {
  if (typeof id !== 'string') return id;
  if (isUuid(id)) return aliases.get(id.toLowerCase()) ?? shortFromUuid(id);
  return id;
}

/** An address with each UUID in it replaced (`/profile/gear/<uuid>/maintenance/note?item=<uuid>`). @param {string} url */
export const resolveUrl = (url) => (typeof url === 'string' ? url.replace(UUID_IN_TEXT, (u) => resolveId(u)) : url);

/** The id a sealed item's authenticated data names: a card whose id was rewritten keeps the id it was sealed under in `sealId`. @param {any} file */
export const sealIdOf = (file) => String(file?.sealId ?? file?.id ?? '');
