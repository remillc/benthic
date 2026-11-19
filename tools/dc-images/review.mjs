// Writes the local review page (not committed): <originals>/review.html.
// Usage: node tools/dc-images/review.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readRows, findOriginal, originalsDir, outDir, dataDir } from './common.mjs';

const crops = JSON.parse(fs.readFileSync(path.join(dataDir, 'crops.json'), 'utf8'));
const items = readRows().map((r) => {
  const o = findOriginal(r.slug);
  return o ? {
    vendor: r.vendor, product: r.product, slug: r.slug, confidence: r.confidence, note: r.note,
    norm: pathToFileURL(path.join(outDir, '512', r.slug + '.webp')).href, orig: pathToFileURL(o).href,
  } : null;
}).filter(Boolean);

const esc = (s) => JSON.stringify(s).replace(/</g, '\\u003c');
const page = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'review.template.html'), 'utf8');
const html = page.replace('/*ITEMS*/[]', esc(items)).replace('/*CROPS*/{}', esc(crops));
fs.writeFileSync(path.join(originalsDir, 'review.html'), html);
console.log('wrote', path.join(originalsDir, 'review.html'), items.length, 'cards');
