// @ts-check
// Encryption of the sensitive items on the device (docs/architecture.md, section 11.5): blood group, emergency
// contact and certifications are sealed with AES-256-GCM (WebCrypto) before they reach the working copy or the
// server. The data key is 32 random bytes made on the device and kept in the platform's secure storage (the
// plugin's `dataKeyRead` / `dataKeyWrite`: Android Keystore, iOS Keychain, Electron safeStorage); it never leaves
// the device in clear. The sealed block is `{ v, alg, kid, nonce, ct }`; the item's id and `format` are the
// authenticated data, so a block cannot be moved to another item. Keyring (docs/account-sync.md): `open` picks the key by
// `block.kid`, `seal` always uses the account key, several keys can be held, and no key is made when the account
// already has one. Pairing and recovery key: account-keys.js.

/** @typedef {{ v: 1, alg: 'A256GCM', kid: string, nonce: string, ct: string }} SealedBlock */

/**
 * Where the device keeps its key: base64 of 32 bytes, '' when it has none.
 * @typedef {Object} KeyKeeper
 * @property {() => Promise<string>} read
 * @property {(key: string) => Promise<void>} write
 * @property {() => Promise<boolean>} [hadKey] true when this device made a key before, or sealed data exists: an empty
 *   `read` then means the key was lost (a restored backup, a wiped keystore), not that it never existed
 * @property {() => Promise<void>} [markKey] called after a key is made, so that `hadKey` answers true from then on
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
export async function keyId(raw) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', /** @type {BufferSource} */ (raw)));
  return [...digest.subarray(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The secret box over a key keeper and a keyring. The device key is made at the first use and read once. When the
 * account has a key (`setAccountKid`, from `keys/account.json`), sealing needs that key and never makes a new one.
 * @param {KeyKeeper} keeper
 */
export function createSecretBox(keeper) {
  /** @type {Map<string, { key: CryptoKey, raw: Uint8Array }>} */
  const ring = new Map();
  /** @type {string|null} the account key's id when the account has one */
  let accountKid = null;
  /** @type {string|null} the id of the adopted account key, when the device key is not the one that seals */
  let sealKid = null;
  /** @type {Promise<{ kid: string }>|null} */
  let loaded = null;

  /** @param {Uint8Array} raw */
  const hold = async (raw) => {
    const kid = await keyId(raw);
    if (!ring.has(kid)) ring.set(kid, { key: await crypto.subtle.importKey('raw', /** @type {BufferSource} */ (raw), 'AES-GCM', false, ['encrypt', 'decrypt']), raw: raw.slice() });
    return kid;
  };

  /** Reads the device key into the ring; makes one only when `create` and the account has none. @param {boolean} create */
  const load = (create) =>
    (loaded ??= (async () => {
      let text = await keeper.read();
      let raw = text ? fromBase64(text) : new Uint8Array(0);
      if (text && raw.length !== 32) throw new Error('INVALID_DATA_KEY');
      if (!text) {
        // An unreadable key is never replaced silently: a new key would make every sealed item unreadable for good.
        if (!create || accountKid || (keeper.hadKey && (await keeper.hadKey()))) throw new Error('MISSING_DATA_KEY');
        raw = crypto.getRandomValues(new Uint8Array(32));
        text = toBase64(raw);
        await keeper.write(text);
        await keeper.markKey?.();
      }
      return { kid: await hold(raw) };
    })().catch((e) => {
      loaded = null;
      throw e;
    }));

  /** Reads the device key when `kid` is not in the ring yet; a missing device key is not an error here. @param {string} kid */
  const ensure = async (kid) => {
    if (ring.has(kid)) return;
    try {
      await load(false);
    } catch (e) {
      if (/** @type {Error} */ (e).message !== 'MISSING_DATA_KEY') throw e;
    }
  };

  /** The key that seals. @returns {Promise<{ key: CryptoKey, kid: string }>} */
  const sealing = async () => {
    const want = sealKid ?? accountKid;
    if (want) {
      await ensure(want);
      const entry = ring.get(want);
      if (!entry) throw new Error('MISSING_DATA_KEY');
      return { key: entry.key, kid: want };
    }
    const { kid } = await load(true);
    return { key: /** @type {any} */ (ring.get(kid)).key, kid };
  };

  /** @param {string} kid */
  const keyFor = async (kid) => {
    await ensure(kid);
    const entry = ring.get(kid);
    if (!entry) throw new Error('MISSING_DATA_KEY');
    return entry.key;
  };

  /** @param {string} id @param {number} format */
  const aad = (id, format) => enc.encode(`${id}|${format}`);

  /** @param {any} block */
  const check = (block) => {
    if (!block || block.v !== 1 || block.alg !== 'A256GCM') throw new Error('UNKNOWN_ENCRYPTION');
  };

  const box = {
    /**
     * @param {unknown} value any JSON value
     * @param {{ id: string, format: number }} item the item the block belongs to
     * @returns {Promise<SealedBlock>}
     */
    async seal(value, { id, format }) {
      const { key, kid } = await sealing();
      const nonce = crypto.getRandomValues(new Uint8Array(12));
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: aad(id, format) }, key, enc.encode(JSON.stringify(value))));
      return { v: 1, alg: 'A256GCM', kid, nonce: toBase64(nonce), ct: toBase64(ct) };
    },

    /**
     * @param {SealedBlock} block
     * @param {{ id: string, format: number }} item
     * @returns {Promise<any>} the value; rejects with MISSING_DATA_KEY when the box holds no key `block.kid`, and when
     *   the item is not the one that sealed it
     */
    async open(block, { id, format }) {
      check(block);
      const key = await keyFor(block.kid);
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(block.nonce), additionalData: aad(id, format) }, key, fromBase64(block.ct));
      return JSON.parse(dec.decode(plain));
    },

    /** Raw bytes sealed (a card photo): the block is `{ ...block, ct }` with the item's authenticated data. @param {Uint8Array} bytes @param {{ id: string, format: number }} item */
    async sealBytes(bytes, { id, format }) {
      const { key, kid } = await sealing();
      const nonce = crypto.getRandomValues(new Uint8Array(12));
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: aad(id, format) }, key, /** @type {BufferSource} */ (bytes)));
      return { v: /** @type {const} */ (1), alg: /** @type {const} */ ('A256GCM'), kid, nonce: toBase64(nonce), ct: toBase64(ct) };
    },

    /** @param {SealedBlock} block @param {{ id: string, format: number }} item @returns {Promise<Uint8Array>} */
    async openBytes(block, { id, format }) {
      check(block);
      const key = await keyFor(block.kid);
      return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(block.nonce), additionalData: aad(id, format) }, key, fromBase64(block.ct)));
    },

    /** Says which key the account uses (`keys/account.json`): from then on no key is made here. @param {string|null} kid */
    setAccountKid(kid) {
      accountKid = kid;
    },

    /** The account key's id, or null. */
    getAccountKid: () => accountKid,

    /**
     * Holds the account key, received by pairing or recovery, and makes it the key that seals. The device's own key stays
     * in the ring (memory) to open the local items until they are re-sealed.
     * @param {string} base64Key 32 bytes in base64
     * @returns {Promise<string>} the key's id
     */
    async adoptAccountKey(base64Key) {
      const raw = fromBase64(base64Key);
      if (raw.length !== 32) throw new Error('INVALID_DATA_KEY');
      const kid = await hold(raw);
      accountKid = kid;
      sealKid = kid;
      return kid;
    },

    /** Holds one more key to open with, never to seal. @param {string} base64Key @returns {Promise<string>} its id */
    async addKey(base64Key) {
      const raw = fromBase64(base64Key);
      if (raw.length !== 32) throw new Error('INVALID_DATA_KEY');
      return hold(raw);
    },

    /** True when the box holds the key `kid` (the device key counts once read). @param {string} kid */
    async hasKey(kid) {
      await ensure(kid);
      return ring.has(kid);
    },

    /** The ids of the keys held now. */
    heldKids: () => [...ring.keys()],

    /** The account key in base64, to wrap it for a pairing or the recovery key; null when not held. */
    async accountKeyBase64() {
      const kid = sealKid ?? accountKid;
      if (!kid) return null;
      await ensure(kid);
      const entry = ring.get(kid);
      return entry ? toBase64(entry.raw) : null;
    },

    /** Makes the account key the device's own key in the secure storage (call after the local items are re-sealed). */
    async persistAccountKey() {
      const text = await box.accountKeyBase64();
      if (!text) throw new Error('MISSING_DATA_KEY');
      await keeper.write(text);
      await keeper.markKey?.();
    },

    /**
     * Opens a block with the key it names and seals it again with the sealing key (the account key).
     * @param {SealedBlock} block @param {{ id: string, format: number }} item @param {boolean} [bytes] a sealed byte string, not JSON
     * @returns {Promise<SealedBlock>} the same block when it is already sealed with the sealing key
     */
    async reseal(block, item, bytes = false) {
      const { kid } = await sealing();
      if (block?.kid === kid) return block;
      return bytes ? box.sealBytes(await box.openBytes(block, item), item) : box.seal(await box.open(block, item), item);
    },
  };
  return box;
}

/** @typedef {ReturnType<typeof createSecretBox>} SecretBox */
