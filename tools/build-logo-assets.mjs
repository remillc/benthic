#!/usr/bin/env node
// Builds the files of the OpenDives logo, « Simple en relief » (task 2026-11-15-209), from one drawing:
// the docs/brand SVGs and PNGs, the web logos, the Android launcher PNGs, the iOS icons and splash images.
// The Android vector drawables (gradients in aapt:attr) are written by hand, not here.
// PNGs are drawn by Microsoft Edge (headless). Usage: node tools/build-logo-assets.mjs [--png-only | --svg-only]
// Environment: EDGE (path of msedge.exe), default "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe".
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateSync, deflateSync } from 'node:zlib';

const root = fileURLToPath(new URL('../', import.meta.url));
const EDGE = process.env.EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const arg = process.argv[2];
const LIGHT_BG = '#F4F4F2';
const DARK_BG = '#121314';

/** The logo on a 24 x 24 grid; `id` makes the gradient ids unique in a page. */
export function logoBody(id = 'od') {
  return (
    `<defs>` +
    `<linearGradient id="${id}-disc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1F5C99"/><stop offset="1" stop-color="#0C3866"/></linearGradient>` +
    `<linearGradient id="${id}-rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.2"/><stop offset="0.45" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient>` +
    `</defs>` +
    `<circle cx="12" cy="12" r="11" fill="url(#${id}-disc)"/>` +
    `<circle cx="12" cy="12" r="10.7" fill="none" stroke="url(#${id}-rim)" stroke-width="0.6"/>` +
    `<path d="M5 14.1q3.5-3 7 0t7 0" fill="none" stroke="#072A4D" stroke-opacity="0.35" stroke-width="2.2" stroke-linecap="round"/>` +
    `<path d="M5 13q3.5-3 7 0t7 0" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round"/>`
  );
}
// The favicon drops the rim and the shadow wave: at 16 px they turn the wave grey. Disc gradient and one white wave stay.
const FAVICON =
  '<!-- The simple logo with relief, simplified for 16 px (docs/brand/opendives-logo.svg without the rim and the shadow wave); the same in light and dark mode. -->' +
  '<defs><linearGradient id="od-disc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1F5C99"/><stop offset="1" stop-color="#0C3866"/></linearGradient></defs>' +
  '<circle cx="12" cy="12" r="11" fill="url(#od-disc)"/>' +
  '<path d="M5 13q3.5-3 7 0t7 0" fill="none" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round"/>';
const svg = (w, h, vb, inner) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${vb}">${inner}</svg>\n`;
const placed = `<g transform="translate(54 54) scale(2.72727) translate(-12 -12)">${logoBody()}</g>`;
const icon = (bg, shape) => {
  const bgRect = `<rect width="108" height="108" fill="${bg}"/>`;
  if (shape === 'fullbleed') return svg(108, 108, '0 0 108 108', bgRect + placed);
  const clip = shape === 'round' ? '<circle cx="54" cy="54" r="54"/>' : '<rect width="108" height="108" rx="26"/>';
  return svg(108, 108, '0 0 108 108', `<clipPath id="m">${clip}</clipPath><g clip-path="url(#m)">${bgRect}${placed}</g>`);
};

/** Files of the repository: [path, content]. */
function svgFiles() {
  const f = [];
  f.push(['docs/brand/opendives-logo.svg', svg(240, 240, '0 0 24 24', logoBody())]);
  for (const mode of ['light', 'dark']) {
    const bg = mode === 'light' ? LIGHT_BG : DARK_BG;
    for (const shape of ['round', 'squircle', 'fullbleed']) f.push([`docs/brand/opendives-icon-${mode}-${shape}.svg`, icon(bg, shape)]);
    f.push([`docs/brand/opendives-logo-${mode}.svg`, svg(264, 264, '21 21 66 66', placed)]);
    f.push([`app/public/logo-${mode}.svg`, svg(264, 264, '21 21 66 66', placed)]);
  }
  f.push(['app/public/logo-menu.svg', svg(44, 44, '0 0 24 24', logoBody())]);
  f.push(['app/public/favicon.svg', svg(96, 96, '0 0 24 24', FAVICON)]);
  return f;
}

// PNG helpers: Edge draws RGBA; the opaque icons are rewritten as RGB (App Store: no alpha channel).
const table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc(buf) { let c = 0xffffffff; for (const b of buf) c = table[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) | 0; }
function toRGB(png) {
  const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
  if (png[24] === 8 && png[25] === 2) return png;
  if (png[25] !== 6 || png[24] !== 8) throw new Error('expected 8-bit RGB or RGBA');
  const idat = [];
  for (let p = 8; p < png.length; ) {
    const len = png.readUInt32BE(p);
    if (png.toString('latin1', p + 4, p + 8) === 'IDAT') idat.push(png.subarray(p + 8, p + 8 + len));
    p += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat)), bpp = 4, stride = w * bpp;
  const px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)], src = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0, b = y ? px[(y - 1) * stride + x] : 0, c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0;
      let v = raw[src + x];
      if (ft === 1) v += a; else if (ft === 2) v += b; else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[y * stride + x] = v & 255;
    }
  }
  const out = Buffer.alloc(h * (w * 3 + 1));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let k = 0; k < 3; k++)
    out[y * (w * 3 + 1) + 1 + x * 3 + k] = px[y * stride + x * 4 + k];
  const chunk = (type, data) => {
    const b = Buffer.alloc(12 + data.length);
    b.writeUInt32BE(data.length, 0); b.write(type, 4, 'latin1'); data.copy(b, 8);
    b.writeInt32BE(crc(b.subarray(4, 8 + data.length)), 8 + data.length);
    return b;
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([png.subarray(0, 8), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(out, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const tmp = mkdtempSync(join(tmpdir(), 'od-logo-'));
/** Draws an SVG string at size x size with Edge, on a transparent background. */
function raster(svgText, size, out, opaque = false) {
  const html = join(tmp, 'p.html'), shot = join(tmp, 'p.png');
  const body = svgText.replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`);
  writeFileSync(html, `<!doctype html><html><body style="margin:0;background:transparent">${body}</body></html>`);
  execFileSync(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000', `--user-data-dir=${join(tmp, 'edge')}`,
    `--window-size=${size},${size}`, `--screenshot=${shot}`, pathToFileURL(html).href], { stdio: 'ignore' });
  let png = readFileSync(shot);
  if (opaque) png = toRGB(png);
  mkdirSync(dirname(join(root, out)), { recursive: true });
  writeFileSync(join(root, out), png);
}

if (arg !== '--png-only') for (const [p, c] of svgFiles()) { mkdirSync(dirname(join(root, p)), { recursive: true }); writeFileSync(join(root, p), c); }
if (arg !== '--svg-only') {
  const res = 'app/android/app/src/main/res';
  raster(icon(LIGHT_BG, 'squircle'), 1024, 'docs/brand/opendives-icon-1024.png');
  raster(svg(264, 264, '21 21 66 66', placed), 1024, 'docs/brand/opendives-logo-1024.png');
  for (const [d, s] of Object.entries({ mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 })) {
    raster(icon(LIGHT_BG, 'squircle'), s, `${res}/mipmap-${d}/ic_launcher.png`);
    raster(icon(LIGHT_BG, 'round'), s, `${res}/mipmap-${d}/ic_launcher_round.png`);
  }
  for (const dir of ['app/ios/App/App/Assets.xcassets/AppIcon.appiconset', 'app/resources/ios/AppIcon.appiconset']) {
    raster(icon(LIGHT_BG, 'fullbleed'), 1024, `${dir}/AppIcon-1024.png`, true);
    raster(icon(DARK_BG, 'fullbleed'), 1024, `${dir}/AppIcon-1024-dark.png`, true);
  }
  for (const [x, s] of [[1, 147], [2, 294], [3, 441]]) for (const mode of ['light', 'dark'])
    raster(svg(24, 24, '0 0 24 24', logoBody()), s, `app/ios/App/App/Assets.xcassets/Splash.imageset/splash-${mode}@${x}x.png`);
  raster(icon(LIGHT_BG, 'fullbleed'), 180, 'app/public/apple-touch-icon.png', true);
}
rmSync(tmp, { recursive: true, force: true });
