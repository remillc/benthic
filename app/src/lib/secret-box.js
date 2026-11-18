// @ts-check
// Encryption of the sensitive items on the device (docs/architecture.md, section 11.5): blood group, emergency
// contact and certifications are sealed with AES-256-GCM (WebCrypto) before they reach the working copy or the
// server. The data key is 32 random bytes made on the device and kept in the platform's secure storage (the
// plugin's `dataKeyRead` / `dataKeyWrite`: Android Keystore, iOS Keychain, Electron safeStorage); it never leaves
// the device in clear. The sealed block is `{ v, alg, kid, nonce, ct }`; the item's id and `format` are the
// authenticated data, so a block cannot be moved to another item. NOT built yet: recovery of the key on a new
// device (platform keychain sync, QR transfer, recovery phrase), see section 11.5.

/** @typedef {{ v: 1, alg: 'A256GCM', kid: string, nonce: string, ct: string }} SealedBlock */

/**
 * Where the device keeps its key: base64 of 32 bytes, '' when it has none.
 * @typedef {Object} KeyKeeper
 * @property {() => Promise<string>} read
 * @property {(key: string) => Promise<void>} write
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

/** @param {Uint8Array} bytes @returns {string} */
export function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** @param {string} text @returns {Uint8Array} */
export function fromBase64(text) {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** The key's short name, to tell keys apart when one is rotated: the first 8 bytes of its SHA-256, in hex. @param {Uint8Array} raw */
async function keyId(raw) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', /** @type {BufferSource} */ (raw)));
  return [...digest.subarray(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The secret box over a key keeper. The key is made at the first use and read once.
 * @param {KeyKeeper} keeper
 */
export function createSecretBox(keeper) {
  /** @type {Promise<{ key: CryptoKey, kid: string }>|null} */
  let loaded = null;

  const load = () =>
    (loaded ??= (async () => {
      let text = await keeper.read();
      let raw = text ? fromBase64(text) : new Uint8Array(0);
      if (raw.length !== 32) {
        raw = crypto.getRandomValues(new Uint8Array(32));
        text = toBase64(raw);
        await keeper.write(text);
      }
      const key = await crypto.subtle.importKey('raw', /** @type {BufferSource} */ (raw), 'AES-GCM', false, ['encrypt', 'decrypt']);
      return { key, kid: await keyId(raw) };
    })().catch((e) => {
      loaded = null;
      throw e;
    }));

  /** @param {string} id @param {number} format */
  const aad = (id, format) => enc.encode(`${id}|${format}`);

  return {
    /**
     * @param {unknown} value any JSON value
     * @param {{ id: string, format: number }} item the item the block belongs to
     * @returns {Promise<SealedBlock>}
     */
    async seal(value, { id, format }) {
      const { key, kid } = await load();
      const nonce = crypto.getRandomValues(new Uint8Array(12));
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: aad(id, format) }, key, enc.encode(JSON.stringify(value))));
      return { v: 1, alg: 'A256GCM', kid, nonce: toBase64(nonce), ct: toBase64(ct) };
    },

    /**
     * @param {SealedBlock} block
     * @param {{ id: string, format: number }} item
     * @returns {Promise<any>} the value; rejects when the key or the item is not the one that sealed it
     */
    async open(block, { id, format }) {
      if (!block || block.v !== 1 || block.alg !== 'A256GCM') throw new Error('UNKNOWN_ENCRYPTION');
      const { key } = await load();
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(block.nonce), additionalData: aad(id, format) }, key, fromBase64(block.ct));
      return JSON.parse(dec.decode(plain));
    },

    /** Raw bytes sealed (a card photo): the block is `{ ...block, ct }` with the item's authenticated data. @param {Uint8Array} bytes @param {{ id: string, format: number }} item */
    async sealBytes(bytes, { id, format }) {
      const { key, kid } = await load();
      const nonce = crypto.getRandomValues(new Uint8Array(12));
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: aad(id, format) }, key, /** @type {BufferSource} */ (bytes)));
      return { v: /** @type {const} */ (1), alg: /** @type {const} */ ('A256GCM'), kid, nonce: toBase64(nonce), ct: toBase64(ct) };
    },

    /** @param {SealedBlock} block @param {{ id: string, format: number }} item @returns {Promise<Uint8Array>} */
    async openBytes(block, { id, format }) {
      if (!block || block.v !== 1 || block.alg !== 'A256GCM') throw new Error('UNKNOWN_ENCRYPTION');
      const { key } = await load();
      return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(block.nonce), additionalData: aad(id, format) }, key, fromBase64(block.ct)));
    },
  };
}

/** @typedef {ReturnType<typeof createSecretBox>} SecretBox */
