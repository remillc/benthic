// Downloads every image of images-retenues.tsv into the originals folder (outside git).
// Usage: node tools/dc-images/download.mjs
import fs from 'node:fs';
import path from 'node:path';
import { readRows, originalsDir, here } from './common.mjs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lastHit = new Map();
fs.mkdirSync(originalsDir, { recursive: true });

async function once(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'image/*,*/*;q=0.8' }, redirect: 'follow', signal: AbortSignal.timeout(45000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = (res.headers.get('content-type') || '').split(';')[0].trim();
  const buf = Buffer.from(await res.arrayBuffer());
  if (!type.startsWith('image/') && !/\.(jpe?g|png|webp|gif)(\?|$)/i.test(url)) throw new Error(`not an image (${type})`);
  if (buf.length < 500) throw new Error('too small');
  let ext = EXT[type];
  if (!ext) ext = (url.split('?')[0].match(/\.(jpe?g|png|webp|gif)$/i) || [, 'jpg'])[1].toLowerCase().replace('jpeg', 'jpg');
  return { buf, ext };
}

const failures = [];
let ok = 0;
for (const row of readRows()) {
  if (fs.readdirSync(originalsDir).some((f) => f.startsWith(row.slug + '.') && !f.endsWith('.html'))) { ok++; continue; }
  const host = new URL(row.image_url).host;
  let done = false, err;
  for (let attempt = 0; attempt < 2 && !done; attempt++) {
    const wait = (lastHit.get(host) || 0) + 1200 - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      const { buf, ext } = await once(row.image_url);
      fs.writeFileSync(path.join(originalsDir, `${row.slug}.${ext}`), buf);
      done = true; ok++;
    } catch (e) { err = e.cause?.code || e.message; await sleep(2000); }
    lastHit.set(host, Date.now());
  }
  if (!done) { failures.push({ vendor: row.vendor, product: row.product, url: row.image_url, reason: String(err) }); console.log('FAIL', row.slug, err); }
}
fs.writeFileSync(path.join(originalsDir, 'failures.json'), JSON.stringify(failures, null, 2));
console.log(`downloaded ${ok}, failed ${failures.length}`);
