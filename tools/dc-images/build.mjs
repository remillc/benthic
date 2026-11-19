// Normalizes the downloaded originals and writes the catalog.
// Usage: node tools/dc-images/build.mjs
// Reads originals from DC_ORIGINALS (default F:/projets/dc-images-originals), crops from data/dive-computer-images/crops.json,
// writes 512/ and 128/ webp into DC_OUT (default <originals>/out; not in git) and data/dive-computer-images/catalog.json.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { readRows, findOriginal, outDir, dataDir } from './common.mjs';

const MARGIN = 0.06;
const SIZES = [512, 128];
const crops = JSON.parse(fs.readFileSync(path.join(dataDir, 'crops.json'), 'utf8'));
for (const s of SIZES) fs.mkdirSync(path.join(outDir, String(s)), { recursive: true });

async function normalize(file, crop) {
  const meta = await sharp(file).metadata();
  // Flatten transparency on white, then crop or trim the uniform background.
  let img = sharp(file).rotate().flatten({ background: '#ffffff' });
  const flat = await img.png().toBuffer();
  let work = sharp(flat);
  let width = meta.width, height = meta.height;
  if (crop) {
    const left = Math.max(0, Math.round(crop.x)), top = Math.max(0, Math.round(crop.y));
    const w = Math.min(width - left, Math.round(crop.w)), h = Math.min(height - top, Math.round(crop.h));
    work = work.extract({ left, top, width: w, height: h });
  } else {
    work = work.trim({ threshold: 14 });
  }
  const trimmed = await work.png().toBuffer();
  return { trimmed, width, height };
}

const catalog = [];
const missing = [];
for (const row of readRows()) {
  const file = findOriginal(row.slug);
  if (!file) { missing.push(`${row.vendor} ${row.product}`); continue; }
  const crop = crops[`${row.vendor}|${row.product}`];
  try {
    const { trimmed, width, height } = await normalize(file, crop);
    for (const size of SIZES) {
      const inner = Math.round(size * (1 - 2 * MARGIN));
      const fitted = await sharp(trimmed).resize(inner, inner, { fit: 'inside', withoutEnlargement: false }).png().toBuffer();
      await sharp(fitted)
        .extend({ top: 0, left: 0, bottom: 0, right: 0, background: '#ffffff' })
        .resize({ width: size, height: size, fit: 'contain', background: '#ffffff', position: 'centre' })
        .webp({ quality: 82 })
        .toFile(path.join(outDir, String(size), `${row.slug}.webp`));
    }
    catalog.push({
      vendor: row.vendor, product: row.product, slug: row.slug,
      hasImage: true,
      image512: `/v1/dc-images/512/${row.slug}.webp`, image128: `/v1/dc-images/128/${row.slug}.webp`,
      source_page_url: row.source_page_url, original_url: row.image_url,
      confidence: row.confidence, approx: row.confidence === 'low',
      fetched_at: fs.statSync(file).mtime.toISOString(),
      width, height, cropped: crop ? 'manual' : 'auto',
    });
  } catch (e) { missing.push(`${row.vendor} ${row.product} (${e.message})`); }
}
catalog.sort((a, b) => a.vendor.localeCompare(b.vendor) || a.product.localeCompare(b.product));
fs.writeFileSync(path.join(dataDir, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
console.log(`built ${catalog.length}; skipped ${missing.length}`);
for (const m of missing) console.log('  skipped:', m);
