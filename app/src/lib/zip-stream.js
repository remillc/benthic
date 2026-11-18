// @ts-check
// A ZIP writer that streams: each entry is read in chunks and written at once, so an archive of any size is
// built with a few megabytes of memory (task 2026-11-18-57, the full export). Entries are stored or deflated
// (CompressionStream, when the platform has it), use a data descriptor (the sizes are known after the data), and
// switch to ZIP64 for an entry of 4 GiB or more, an offset past 4 GiB or 65,535 entries. The CRC-32 and the
// SHA-256 of each entry's bytes are worked out while they pass. No dependency.

/** @typedef {Uint8Array|AsyncIterable<Uint8Array>|Iterable<Uint8Array>} ByteSource */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** The running CRC-32 (start at 0). @param {number} crc @param {Uint8Array} bytes */
export function crc32Update(crc, bytes) {
  let c = ~crc >>> 0;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** An incremental SHA-256 (WebCrypto only hashes whole buffers). */
export function createSha256() {
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const block = new Uint8Array(64);
  let filled = 0;
  let total = 0;

  /** @param {Uint8Array} b @param {number} o */
  function compress(b, o) {
    for (let i = 0; i < 16; i++) w[i] = ((b[o + 4 * i] << 24) | (b[o + 4 * i + 1] << 16) | (b[o + 4 * i + 2] << 8) | b[o + 4 * i + 3]) >>> 0;
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15];
      const c = w[i - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((c >>> 17) | (c << 15)) ^ ((c >>> 19) | (c << 13)) ^ (c >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b1, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b1) ^ (a & c) ^ (b1 & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b1;
      b1 = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] += a;
    h[1] += b1;
    h[2] += c;
    h[3] += d;
    h[4] += e;
    h[5] += f;
    h[6] += g;
    h[7] += hh;
  }

  return {
    /** @param {Uint8Array} bytes */
    update(bytes) {
      total += bytes.length;
      let i = 0;
      if (filled) {
        const take = Math.min(64 - filled, bytes.length);
        block.set(bytes.subarray(0, take), filled);
        filled += take;
        i = take;
        if (filled < 64) return;
        compress(block, 0);
        filled = 0;
      }
      for (; i + 64 <= bytes.length; i += 64) compress(bytes, i);
      if (i < bytes.length) {
        block.set(bytes.subarray(i), 0);
        filled = bytes.length - i;
      }
    },
    /** @returns {string} hex */
    digest() {
      const bits = total * 8;
      const pad = new Uint8Array((filled < 56 ? 64 : 128) - filled);
      pad[0] = 0x80;
      const view = new DataView(pad.buffer);
      view.setUint32(pad.length - 8, Math.floor(bits / 0x100000000));
      view.setUint32(pad.length - 4, bits >>> 0);
      const keep = total;
      this.update(pad);
      total = keep;
      return [...h].map((x) => x.toString(16).padStart(8, '0')).join('');
    },
  };
}

/** @param {ByteSource} source @returns {AsyncGenerator<Uint8Array>} */
async function* chunks(source) {
  if (source instanceof Uint8Array) {
    yield source;
    return;
  }
  yield* /** @type {AsyncIterable<Uint8Array>} */ (source);
}

/**
 * Deflates a source (raw deflate, as ZIP wants), chunk by chunk. `tap` sees every uncompressed chunk.
 * @param {AsyncIterable<Uint8Array>} source
 */
async function* deflateRaw(source) {
  const stream = new CompressionStream('deflate-raw');
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();
  const feed = (async () => {
    try {
      for await (const chunk of source) await writer.write(/** @type {BufferSource} */ (chunk));
      await writer.close();
    } catch (e) {
      await writer.abort(e).catch(() => {});
      throw e;
    }
  })();
  feed.catch(() => {});
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      yield value;
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  await feed;
}

const enc = new TextEncoder();
const MAX32 = 0xffffffff;

/** @param {Date} d @returns {{ time: number, date: number }} MS-DOS time and date */
function dosStamp(d) {
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/**
 * @typedef {Object} EntryResult
 * @property {string} name
 * @property {number} size uncompressed bytes
 * @property {number} compressedSize
 * @property {number} crc32
 * @property {string} sha256 hex, of the uncompressed bytes
 */

/**
 * @param {(chunk: Uint8Array) => Promise<void>} write receives the archive, in order
 * @param {{ zip64At?: number, now?: Date }} [options] `zip64At`: the size or offset from which ZIP64 is used (4 GiB - 1; lowered by the tests)
 */
export function createZipWriter(write, { zip64At = MAX32, now = new Date() } = {}) {
  const stamp = dosStamp(now);
  /** @type {{ name: Uint8Array, flags: number, method: number, crc: number, size: number, csize: number, offset: number, zip64Local: boolean }[]} */
  const central = [];
  let offset = 0;
  let finished = false;

  /** @param {Uint8Array} bytes */
  async function out(bytes) {
    await write(bytes);
    offset += bytes.length;
  }

  return {
    /**
     * Adds a file. `size` (the bytes the source will give) is needed for a source of 4 GiB or more, so that the
     * header can announce ZIP64; it is checked at the end.
     * @param {string} name path inside the archive, with `/`
     * @param {ByteSource} source
     * @param {{ size?: number, deflate?: boolean, signal?: AbortSignal }} [options]
     * @returns {Promise<EntryResult>}
     */
    async add(name, source, { size, deflate = false, signal } = {}) {
      if (finished) throw new Error('ZIP_FINISHED');
      const method = deflate && typeof CompressionStream !== 'undefined' ? 8 : 0;
      const nameBytes = enc.encode(name);
      const zip64Local = size !== undefined && size >= zip64At;
      const entryOffset = offset;
      const local = new Uint8Array(30 + nameBytes.length + (zip64Local ? 20 : 0));
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, zip64Local ? 45 : 20, true);
      lv.setUint16(6, 0x0808, true); // data descriptor, UTF-8 names
      lv.setUint16(8, method, true);
      lv.setUint16(10, stamp.time, true);
      lv.setUint16(12, stamp.date, true);
      lv.setUint32(14, 0, true);
      lv.setUint32(18, zip64Local ? MAX32 : 0, true);
      lv.setUint32(22, zip64Local ? MAX32 : 0, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, zip64Local ? 20 : 0, true);
      local.set(nameBytes, 30);
      if (zip64Local) {
        lv.setUint16(30 + nameBytes.length, 1, true);
        lv.setUint16(32 + nameBytes.length, 16, true);
      }
      await out(local);

      let crc = 0;
      let total = 0;
      const sha = createSha256();
      /** @type {AsyncGenerator<Uint8Array>} */
      const tapped = (async function* () {
        for await (const chunk of chunks(source)) {
          if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
          crc = crc32Update(crc, chunk);
          sha.update(chunk);
          total += chunk.length;
          yield chunk;
        }
      })();
      let csize = 0;
      for await (const chunk of method === 8 ? deflateRaw(tapped) : tapped) {
        csize += chunk.length;
        await out(chunk);
      }
      if (size !== undefined && size !== total) throw new Error(`ZIP_SIZE_MISMATCH:${name}`);
      const big = total >= zip64At || csize >= zip64At;
      if (big && !zip64Local) throw new Error(`ZIP_NEEDS_SIZE:${name}`);
      const desc = new Uint8Array(zip64Local ? 24 : 16);
      const dv = new DataView(desc.buffer);
      dv.setUint32(0, 0x08074b50, true);
      dv.setUint32(4, crc, true);
      if (zip64Local) {
        dv.setBigUint64(8, BigInt(csize), true);
        dv.setBigUint64(16, BigInt(total), true);
      } else {
        dv.setUint32(8, csize, true);
        dv.setUint32(12, total, true);
      }
      await out(desc);
      central.push({ name: nameBytes, flags: 0x0808, method, crc, size: total, csize, offset: entryOffset, zip64Local });
      return { name, size: total, compressedSize: csize, crc32: crc, sha256: sha.digest() };
    },

    /** Writes the central directory; the archive is complete. @returns {Promise<number>} the archive's size */
    async finish() {
      if (finished) throw new Error('ZIP_FINISHED');
      finished = true;
      const cdStart = offset;
      for (const e of central) {
        const needSize = e.zip64Local || e.size >= zip64At || e.csize >= zip64At;
        const needOffset = e.offset >= zip64At;
        const extra = [];
        if (needSize) extra.push(e.size, e.csize);
        if (needOffset) extra.push(e.offset);
        const extraLen = extra.length ? 4 + extra.length * 8 : 0;
        const rec = new Uint8Array(46 + e.name.length + extraLen);
        const v = new DataView(rec.buffer);
        v.setUint32(0, 0x02014b50, true);
        v.setUint16(4, needSize || needOffset ? 45 : 20, true);
        v.setUint16(6, needSize || needOffset ? 45 : 20, true);
        v.setUint16(8, e.flags, true);
        v.setUint16(10, e.method, true);
        v.setUint16(12, stamp.time, true);
        v.setUint16(14, stamp.date, true);
        v.setUint32(16, e.crc, true);
        v.setUint32(20, needSize ? MAX32 : e.csize, true);
        v.setUint32(24, needSize ? MAX32 : e.size, true);
        v.setUint16(28, e.name.length, true);
        v.setUint16(30, extraLen, true);
        v.setUint32(42, needOffset ? MAX32 : e.offset, true);
        rec.set(e.name, 46);
        if (extraLen) {
          let p = 46 + e.name.length;
          v.setUint16(p, 1, true);
          v.setUint16(p + 2, extra.length * 8, true);
          p += 4;
          for (const x of extra) {
            v.setBigUint64(p, BigInt(x), true);
            p += 8;
          }
        }
        await out(rec);
      }
      const cdSize = offset - cdStart;
      const zip64End = central.length >= 0xffff || cdStart >= zip64At || cdSize >= zip64At;
      if (zip64End) {
        const rec = new Uint8Array(56 + 20);
        const v = new DataView(rec.buffer);
        v.setUint32(0, 0x06064b50, true);
        v.setBigUint64(4, 44n, true);
        v.setUint16(12, 45, true);
        v.setUint16(14, 45, true);
        v.setBigUint64(24, BigInt(central.length), true);
        v.setBigUint64(32, BigInt(central.length), true);
        v.setBigUint64(40, BigInt(cdSize), true);
        v.setBigUint64(48, BigInt(cdStart), true);
        v.setUint32(56, 0x07064b50, true);
        v.setBigUint64(64, BigInt(offset), true);
        v.setUint32(72, 1, true);
        await out(rec);
      }
      const end = new Uint8Array(22);
      const ev = new DataView(end.buffer);
      ev.setUint32(0, 0x06054b50, true);
      ev.setUint16(8, zip64End ? 0xffff : central.length, true);
      ev.setUint16(10, zip64End ? 0xffff : central.length, true);
      ev.setUint32(12, zip64End ? MAX32 : cdSize, true);
      ev.setUint32(16, zip64End ? MAX32 : cdStart, true);
      await out(end);
      return offset;
    },

    /** Bytes written so far. */
    get written() {
      return offset;
    },
  };
}
