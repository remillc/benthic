// A lazy route resolves only once the style sheets apply; inline SVGs sized by CSS carry a fallback size.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { lazyRoute, stylesheetsReady } from '../../app/src/lib/lazy-route.js';

/** A document with one style sheet link that loads when `finish` is called. */
function fakeDoc() {
  /** @type {Record<string, Function>} */
  const handlers = {};
  const link = { sheet: null, addEventListener: (/** @type {string} */ type, /** @type {Function} */ fn) => { handlers[type] = fn; } };
  return { doc: { querySelectorAll: () => [link] }, finish: () => handlers.load() };
}

test('stylesheetsReady waits for a link that has not loaded', async () => {
  const { doc, finish } = fakeDoc();
  let done = false;
  const p = stylesheetsReady(/** @type {any} */ (doc), 1000).then(() => { done = true; });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(done, false);
  finish();
  await p;
  assert.equal(done, true);
});

test('stylesheetsReady gives up after the timeout', async () => {
  const { doc } = fakeDoc();
  await stylesheetsReady(/** @type {any} */ (doc), 30);
});

test('lazyRoute resolves the page after the style sheets are ready, with its props', async () => {
  const order = [];
  let release;
  const gate = new Promise((r) => { release = r; });
  const route = lazyRoute(async () => { order.push('load'); return { default: 'Page' }; }, { welcome: true }, () => { order.push('ready'); return gate; });
  let resolved;
  const p = route.async({ resolve: (c, o) => { order.push('resolve'); resolved = [c, o]; } });
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(order, ['load', 'ready']);
  release();
  await p;
  assert.deepEqual(order, ['load', 'ready', 'resolve']);
  assert.deepEqual(resolved, [{ component: 'Page' }, { props: { welcome: true } }]);
});

test('every lazy page in App.svelte goes through lazyRoute', () => {
  const app = readFileSync(new URL('../../app/src/App.svelte', import.meta.url), 'utf8');
  assert.match(app, /const lazy = lazyRoute;/);
});

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
}

test('the band and wave drawings carry width and height attributes', () => {
  const root = new URL('../../app/src/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  const bad = [];
  for (const file of walk(root).filter((f) => f.endsWith('.svelte'))) {
    for (const m of readFileSync(file, 'utf8').matchAll(/<svg\b[^>]*viewBox="0 0 300 (?:140|18)"[^>]*>/g)) {
      if (!/\swidth="\d+"/.test(m[0]) || !/\sheight="\d+"/.test(m[0])) bad.push(`${file}: ${m[0].slice(0, 80)}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('the inline brand logos have an explicit size', () => {
  const dir = new URL('../../app/src/assets/brands/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.svg'))) {
    const tag = readFileSync(join(dir, file), 'utf8').match(/<svg\b[^>]*>/)[0];
    assert.match(tag, /\swidth="[\d.]+"/, file);
    assert.match(tag, /\sheight="[\d.]+"/, file);
  }
});
