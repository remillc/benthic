// @ts-check
// The smart photo of a certification card (task 2026-11-18-272), in plain JavaScript on RGBA pixels, without a library
// and without sending the photo anywhere:
//  - `detectCard`: finds the card's four corners in a photo (the card against its background);
//  - `warpPerspective`: crops and straightens the card from four corners (a perspective transform);
//  - `removeGlare`: fills the clipped, shiny spots with the colours around them.
// Every function takes and returns `Pixels`, an ImageData-like object, so that node:test can run them on a synthetic
// image. NOT done here: the live camera that frames the card and takes the photo by itself, and reading the agency, the
// level and the number from the photo (OCR); both need a native part, see lib/card-camera.js.

/** @typedef {{ width: number, height: number, data: Uint8ClampedArray }} Pixels */
/** @typedef {{ x: number, y: number }} Point */
/** Corners in the order top left, top right, bottom right, bottom left. @typedef {[Point, Point, Point, Point]} Quad */

/** The size of a bank-card format card (ID-1, 85.6 × 54 mm). */
export const CARD_RATIO = 85.6 / 54;

/** A new empty image. @param {number} width @param {number} height @returns {Pixels} */
export const blank = (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) });

/**
 * Puts four points in the order top left, top right, bottom right, bottom left, whatever order they come in.
 * @param {Point[]} points
 * @returns {Quad}
 */
export function orderCorners(points) {
  const by = (/** @type {(p: Point) => number} */ f, /** @type {1|-1} */ sign) => points.reduce((a, b) => (sign * f(b) < sign * f(a) ? b : a));
  return [by((p) => p.x + p.y, 1), by((p) => p.x - p.y, -1), by((p) => p.x + p.y, -1), by((p) => p.x - p.y, 1)];
}

/**
 * The 3 × 3 matrix (row-major, h33 = 1) that maps four points to four others.
 * @param {Quad} from @param {Quad} to
 * @returns {number[]|null} null when the points are degenerate (three on a line)
 */
export function homography(from, to) {
  // Eight equations, eight unknowns, Gauss-Jordan with partial pivoting.
  const m = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i];
    const { x: u, y: v } = to[i];
    m.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    m.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    if (Math.abs(m[p][c]) < 1e-9) return null;
    [m[c], m[p]] = [m[p], m[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = m[r][c] / m[c][c];
      for (let k = c; k < 9; k++) m[r][k] -= f * m[c][k];
    }
  }
  return [...m.map((row, i) => row[8] / row[i]), 1];
}

/**
 * The card straightened: the quadrilateral of the source becomes an upright rectangle (bilinear sampling).
 * @param {Pixels} src @param {Quad} corners @param {number} outWidth @param {number} outHeight
 * @returns {Pixels}
 */
export function warpPerspective(src, corners, outWidth, outHeight) {
  const rect = /** @type {Quad} */ ([
    { x: 0, y: 0 },
    { x: outWidth - 1, y: 0 },
    { x: outWidth - 1, y: outHeight - 1 },
    { x: 0, y: outHeight - 1 },
  ]);
  // From the output back to the source.
  const h = homography(rect, corners);
  const out = blank(outWidth, outHeight);
  if (!h) return out;
  const { width: sw, height: sh, data: s } = src;
  const d = out.data;
  for (let y = 0; y < outHeight; y++) {
    for (let x = 0; x < outWidth; x++) {
      const w = h[6] * x + h[7] * y + 1;
      const sx = (h[0] * x + h[1] * y + h[2]) / w;
      const sy = (h[3] * x + h[4] * y + h[5]) / w;
      const o = (y * outWidth + x) * 4;
      if (!(sx >= -0.5 && sy >= -0.5 && sx <= sw - 0.5 && sy <= sh - 0.5)) {
        d[o + 3] = 255; // outside the photo: black
        continue;
      }
      const x0 = Math.max(0, Math.min(sw - 2, Math.floor(sx)));
      const y0 = Math.max(0, Math.min(sh - 2, Math.floor(sy)));
      const fx = Math.min(1, Math.max(0, sx - x0));
      const fy = Math.min(1, Math.max(0, sy - y0));
      const i00 = (y0 * sw + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + sw * 4;
      const i11 = i01 + 4;
      for (let c = 0; c < 3; c++) {
        d[o + c] = (s[i00 + c] * (1 - fx) + s[i10 + c] * fx) * (1 - fy) + (s[i01 + c] * (1 - fx) + s[i11 + c] * fx) * fy;
      }
      d[o + 3] = 255;
    }
  }
  return out;
}

/**
 * The size of the straightened card: ID-1 landscape (or portrait if the card was photographed standing up), the long
 * side `longSide` pixels.
 * @param {Quad} corners @param {number} [longSide]
 * @returns {{ width: number, height: number }}
 */
export function cardSize(corners, longSide = 1024) {
  const dist = (/** @type {Point} */ a, /** @type {Point} */ b) => Math.hypot(a.x - b.x, a.y - b.y);
  const w = (dist(corners[0], corners[1]) + dist(corners[3], corners[2])) / 2;
  const h = (dist(corners[0], corners[3]) + dist(corners[1], corners[2])) / 2;
  const short = Math.round(longSide / CARD_RATIO);
  return w >= h ? { width: longSide, height: short } : { width: short, height: longSide };
}

/** The corners the screen starts from when no card is found: the photo, inset a little. @param {number} width @param {number} height @returns {Quad} */
export function insetCorners(width, height) {
  const mx = width * 0.08;
  const my = height * 0.08;
  return [
    { x: mx, y: my },
    { x: width - 1 - mx, y: my },
    { x: width - 1 - mx, y: height - 1 - my },
    { x: mx, y: height - 1 - my },
  ];
}

/**
 * The same photo, smaller, by averaging blocks of pixels.
 * @param {Pixels} src @param {number} maxSide
 * @returns {{ image: Pixels, scale: number }} `scale`: source pixels per pixel of the result
 */
export function shrink(src, maxSide) {
  const scale = Math.max(1, Math.max(src.width, src.height) / maxSide);
  if (scale === 1) return { image: src, scale: 1 };
  const w = Math.max(1, Math.round(src.width / scale));
  const h = Math.max(1, Math.round(src.height / scale));
  const out = blank(w, h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor((y * src.height) / h);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * src.height) / h));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor((x * src.width) / w);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * src.width) / w));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * src.width + xx) * 4;
          r += src.data[i];
          g += src.data[i + 1];
          b += src.data[i + 2];
          n++;
        }
      }
      const o = (y * w + x) * 4;
      out.data[o] = r / n;
      out.data[o + 1] = g / n;
      out.data[o + 2] = b / n;
      out.data[o + 3] = 255;
    }
  }
  return { image: out, scale: src.width / w };
}

/** The threshold that best splits a histogram in two (Otsu). @param {Float64Array|number[]} hist @returns {{ threshold: number, separation: number }} */
function otsu(hist) {
  let total = 0;
  let sum = 0;
  hist.forEach((n, i) => {
    total += n;
    sum += i * n;
  });
  let wB = 0;
  let sumB = 0;
  let best = 0;
  let threshold = 0;
  for (let t = 0; t < hist.length; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return { threshold, separation: total ? Math.sqrt(best) / total : 0 };
}

/**
 * Finds the card in a photo: the colour of the background is the median of the photo's border; what differs from it
 * (Otsu threshold on the colour distance) and forms the largest blob is the card; its four extreme points along the
 * diagonals are its corners. Works for a card on a plain surface; otherwise `found` is false and the corners are the
 * photo, inset, for the diver to drag.
 * @param {Pixels} photo
 * @returns {{ found: boolean, corners: Quad }}
 */
export function detectCard(photo) {
  const fallback = { found: false, corners: insetCorners(photo.width, photo.height) };
  const { image: small, scale } = shrink(photo, 200);
  const { width: w, height: h, data } = small;
  if (w < 8 || h < 8) return fallback;

  // The background: the median colour of the outer ring.
  const ring = Math.max(2, Math.round(Math.min(w, h) * 0.05));
  /** @type {number[][]} */
  const samples = [[], [], []];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x >= ring && x < w - ring && y >= ring && y < h - ring) continue;
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) samples[c].push(data[i + c]);
    }
  }
  const bg = samples.map((s) => s.sort((a, b) => a - b)[s.length >> 1]);

  // The distance of each pixel to the background, as a histogram of 0..255.
  const dist = new Uint8Array(w * h);
  const hist = new Float64Array(256);
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    const d = Math.min(255, Math.hypot(data[i] - bg[0], data[i + 1] - bg[1], data[i + 2] - bg[2]) * (255 / 441.7) * 2);
    dist[p] = d;
    hist[Math.round(d)]++;
  }
  const { threshold, separation } = otsu(hist);
  if (separation < 0.12 || threshold < 8) return fallback;

  const mask = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) mask[p] = dist[p] > threshold ? 1 : 0;

  // The largest blob (4-connected).
  const label = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  let bestLabel = 0;
  let bestSize = 0;
  let next = 0;
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || label[start]) continue;
    next++;
    let top = 0;
    let size = 0;
    stack[top++] = start;
    label[start] = next;
    while (top) {
      const p = stack[--top];
      size++;
      const x = p % w;
      const y = (p - x) / w;
      if (x > 0 && mask[p - 1] && !label[p - 1]) (label[p - 1] = next), (stack[top++] = p - 1);
      if (x < w - 1 && mask[p + 1] && !label[p + 1]) (label[p + 1] = next), (stack[top++] = p + 1);
      if (y > 0 && mask[p - w] && !label[p - w]) (label[p - w] = next), (stack[top++] = p - w);
      if (y < h - 1 && mask[p + w] && !label[p + w]) (label[p + w] = next), (stack[top++] = p + w);
    }
    if (size > bestSize) {
      bestSize = size;
      bestLabel = next;
    }
  }
  const share = bestSize / (w * h);
  if (share < 0.08 || share > 0.97) return fallback;

  // The four extreme points of the blob along the diagonals.
  /** @type {(Point|null)[]} */
  const ex = [null, null, null, null];
  const key = [Infinity, -Infinity, -Infinity, Infinity]; // x+y min, x-y max, x+y max, x-y min
  for (let p = 0; p < w * h; p++) {
    if (label[p] !== bestLabel) continue;
    const x = p % w;
    const y = (p - x) / w;
    if (x + y < key[0]) (key[0] = x + y), (ex[0] = { x, y });
    if (x - y > key[1]) (key[1] = x - y), (ex[1] = { x, y });
    if (x + y > key[2]) (key[2] = x + y), (ex[2] = { x, y });
    if (x - y < key[3]) (key[3] = x - y), (ex[3] = { x, y });
  }
  if (ex.some((e) => !e)) return fallback;
  // Pixel centres, back to the photo's coordinates (a pixel covers `scale` source pixels).
  const corners = /** @type {Quad} */ (
    /** @type {Point[]} */ (ex).map((e, i) => ({
      x: Math.min(photo.width - 1, Math.max(0, (e.x + (i === 1 || i === 2 ? 1 : 0)) * scale)),
      y: Math.min(photo.height - 1, Math.max(0, (e.y + (i === 2 || i === 3 ? 1 : 0)) * scale)),
    }))
  );
  // A quadrilateral that is not a quadrilateral (a thin sliver) is not a card.
  const area = Math.abs(corners.reduce((s, p, i) => s + (p.x * corners[(i + 1) % 4].y - corners[(i + 1) % 4].x * p.y), 0)) / 2;
  if (area < photo.width * photo.height * 0.06) return fallback;
  return { found: true, corners };
}

/**
 * Fills the glare: the pixels burnt out to white (all three channels near the top) and a thin halo around them take
 * the colours of the surroundings. A card that is white as a whole (more than 40 % burnt out) is left alone.
 * @param {Pixels} src
 * @returns {{ image: Pixels, fraction: number, changed: boolean }} `fraction`: share of the photo that was glare
 */
export function removeGlare(src) {
  const { width, height, data } = src;
  const n = width * height;
  // Work at a quarter of the size: a mask where a block holds burnt pixels, grown by one block.
  const bw = Math.max(1, Math.ceil(width / 4));
  const bh = Math.max(1, Math.ceil(height / 4));
  const burnt = new Uint8Array(bw * bh);
  let clipped = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (Math.min(data[i], data[i + 1], data[i + 2]) >= 244) {
        clipped++;
        burnt[(y >> 2) * bw + (x >> 2)] = 1;
      }
    }
  }
  const fraction = clipped / n;
  if (fraction < 0.0005 || fraction > 0.4) return { image: src, fraction, changed: false };

  // Grow by one block.
  const mask = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      if (!burnt[y * bw + x]) continue;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < bw && yy < bh) mask[yy * bw + xx] = 1;
        }
      }
    }
  }

  // The colour of each block (average of its pixels), the masked blocks filled from the border inwards.
  const sums = new Float64Array(bw * bh * 3);
  const counts = new Float64Array(bw * bh);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const b = (y >> 2) * bw + (x >> 2);
      const i = (y * width + x) * 4;
      sums[b * 3] += data[i];
      sums[b * 3 + 1] += data[i + 1];
      sums[b * 3 + 2] += data[i + 2];
      counts[b]++;
    }
  }
  const colour = new Float64Array(bw * bh * 3);
  const known = new Uint8Array(bw * bh);
  for (let b = 0; b < bw * bh; b++) {
    if (mask[b] || !counts[b]) continue;
    known[b] = 1;
    for (let c = 0; c < 3; c++) colour[b * 3 + c] = sums[b * 3 + c] / counts[b];
  }
  if (!known.some((k) => k)) return { image: src, fraction, changed: false };
  for (let round = 0; round < bw + bh; round++) {
    /** @type {number[]} */
    const fill = [];
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        const b = y * bw + x;
        if (known[b]) continue;
        let r = 0;
        let g = 0;
        let bl = 0;
        let k = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= bw || yy >= bh) continue;
            const nb = yy * bw + xx;
            if (!known[nb]) continue;
            r += colour[nb * 3];
            g += colour[nb * 3 + 1];
            bl += colour[nb * 3 + 2];
            k++;
          }
        }
        if (k) {
          colour[b * 3] = r / k;
          colour[b * 3 + 1] = g / k;
          colour[b * 3 + 2] = bl / k;
          fill.push(b);
        }
      }
    }
    if (!fill.length) break;
    for (const b of fill) known[b] = 1;
  }

  // Back to full size: the filled colour (bilinear between block centres) where the mask is, feathered at its edge.
  const alpha = new Float32Array(bw * bh);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) alpha[y * bw + x] = mask[y * bw + x];
  const sample = (/** @type {ArrayLike<number>} */ arr, /** @type {number} */ per, /** @type {number} */ px, /** @type {number} */ py, /** @type {number} */ c) => {
    const fx = Math.min(bw - 1, Math.max(0, px / 4 - 0.5));
    const fy = Math.min(bh - 1, Math.max(0, py / 4 - 0.5));
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(bw - 1, x0 + 1);
    const y1 = Math.min(bh - 1, y0 + 1);
    const tx = fx - x0;
    const ty = fy - y0;
    const at = (/** @type {number} */ xx, /** @type {number} */ yy) => arr[(yy * bw + xx) * per + c];
    return (at(x0, y0) * (1 - tx) + at(x1, y0) * tx) * (1 - ty) + (at(x0, y1) * (1 - tx) + at(x1, y1) * tx) * ty;
  };
  const out = { width, height, data: new Uint8ClampedArray(data) };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = sample(alpha, 1, x, y, 0);
      if (a <= 0.02) continue;
      const i = (y * width + x) * 4;
      // Only the burnt pixels and their near neighbours change; the text printed in the glare's halo stays.
      const bright = Math.min(data[i], data[i + 1], data[i + 2]) >= 200;
      if (!bright) continue;
      for (let c = 0; c < 3; c++) out.data[i + c] = data[i + c] * (1 - a) + sample(colour, 3, x, y, c) * a;
    }
  }
  return { image: out, fraction, changed: true };
}
