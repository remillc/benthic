// The app's style sheets have balanced braces: a missing one breaks the whole Vite build, and node:test does not run Vite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BACKSLASH = String.fromCharCode(92);
const src = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'app', 'src');

/** The first unbalanced brace, as « line N », or '' when balanced. Comments and strings are skipped. @param {string} css */
function unbalanced(css) {
  const open = [];
  let line = 1;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '\n') line++;
    else if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      const skipped = css.slice(i, end < 0 ? css.length : end + 2);
      line += skipped.split('\n').length - 1;
      i += skipped.length - 1;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < css.length && css[j] !== c && css[j] !== '\n') j += css[j] === BACKSLASH ? 2 : 1;
      i = j;
    } else if (c === '{') open.push(line);
    else if (c === '}' && !open.pop()) return `a « } » without « { » at line ${line}`;
  }
  return open.length ? `a « { » never closed, opened at line ${open[open.length - 1]}` : '';
}

/** Style sheets and the <style> blocks of Svelte components. */
function sheets(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return sheets(p);
    if (e.name.endsWith('.css')) return [[p, readFileSync(p, 'utf8')]];
    if (e.name.endsWith('.svelte')) {
      const m = readFileSync(p, 'utf8').match(/<style[^>]*>([\s\S]*?)<\/style>/);
      return m ? [[p, m[1]]] : [];
    }
    return [];
  });
}

test('every style sheet has balanced braces', () => {
  const bad = sheets(src).map(([p, css]) => [path.relative(src, p), unbalanced(css)]).filter(([, e]) => e);
  assert.deepEqual(bad, []);
});

test('the check finds a missing brace', () => {
  assert.match(unbalanced('@layer a {\n  @media x {\n    b { c: d; }\n  }\n\n@layer a {\n  e { f: g; }\n}\n'), /never closed, opened at line 1/);
  assert.equal(unbalanced('a { content: "}"; } /* { */'), '');
});
