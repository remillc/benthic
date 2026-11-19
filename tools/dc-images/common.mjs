// Shared helpers for the dive computer image tools.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const here = path.dirname(fileURLToPath(import.meta.url));
export const repo = path.resolve(here, '..', '..');
export const dataDir = path.join(repo, 'data', 'dive-computer-images');
export const originalsDir = process.env.DC_ORIGINALS || 'F:/projets/dc-images-originals';

export function slugify(s) {
  return s.replace(/\+/g, ' plus ').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function readRows() {
  const text = fs.readFileSync(path.join(here, 'images-retenues.tsv'), 'utf8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const head = lines.shift().split('\t');
  const seen = new Set();
  return lines.map((l) => {
    const c = l.split('\t');
    const o = Object.fromEntries(head.map((h, i) => [h.trim(), (c[i] || '').trim()]));
    o.slug = slugify(`${o.vendor}-${o.product}`);
    return o;
  }).filter((o) => { // the selection repeats a few models: keep the first row
    const k = `${o.vendor}|${o.product}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// The normalized webp files are not in git: they are written here and published on the server.
export const outDir = process.env.DC_OUT || path.join(originalsDir, 'out');

export function findOriginal(slug) {
  if (!fs.existsSync(originalsDir)) return null;
  const f = fs.readdirSync(originalsDir).find((n) => n.startsWith(slug + '.') && /\.(jpg|png|webp|gif|avif)$/.test(n));
  return f ? path.join(originalsDir, f) : null;
}
