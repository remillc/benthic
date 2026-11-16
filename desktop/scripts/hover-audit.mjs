// SPDX-License-Identifier: GPL-2.0
// Hover audit (docs/system-design.md, section 8, « Pointer »): every element that shows the hand
// pointer must also have a visible hover state. Connects to a running desktop app through its
// DevTools port, lists the visible elements whose computed cursor is `pointer`, forces `:hover`
// on each (CDP CSS.forcePseudoState) and compares the computed styles of the element, its
// descendants and their ::before / ::after before and after. Prints the elements with no change.
// It looks at the current page only: open the screen or the state to check first.
//   node desktop/scripts/hover-audit.mjs <DevTools port> [--verbose]
// Exit code 1 when an element has no hover state.
const port = Number(process.argv[2]);
const verbose = process.argv.includes('--verbose');
if (!port) {
  console.error('usage: node hover-audit.mjs <DevTools port> [--verbose]');
  process.exit(2);
}
if (port === 9333) {
  console.error('port 9333 is the developer\'s own window: not audited from here');
  process.exit(2);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = list.find((t) => t.type === 'page');
if (!page) throw new Error('no page on that port');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)));
let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  pending.get(d.id)?.(d);
};
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, (d) => (pending.delete(n), d.error ? reject(new Error(`${method}: ${d.error.message}`)) : resolve(d.result)));
    ws.send(JSON.stringify({ id: n, method, params }));
  });
const run = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'evaluation failed');
  return r.result.value;
};

// In the page: marks the candidates and gives the snapshot function.
await run(`(() => {
  window.__odHover = {
    props: ['backgroundColor', 'backgroundImage', 'color', 'boxShadow', 'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'borderRightColor', 'opacity', 'textDecorationLine', 'outlineStyle', 'outlineColor', 'filter', 'transform', 'fill', 'stroke'],
    snapshot(el) {
      const out = [];
      if (!el) return out;
      const nodes = [el, ...[...el.querySelectorAll('*')].slice(0, 80)];
      for (const n of nodes) {
        for (const pseudo of [null, '::before', '::after']) {
          const cs = getComputedStyle(n, pseudo);
          out.push(this.props.map((p) => cs[p]).join('|'));
        }
      }
      return out;
    },
    path(el) {
      const parts = [];
      for (let n = el; n && n.nodeType === 1 && parts.length < 4; n = n.parentElement) {
        const cls = [...n.classList].filter((c) => c.startsWith('od-')).slice(0, 2).join('.');
        parts.unshift(n.tagName.toLowerCase() + (cls ? '.' + cls : n.getAttribute('role') ? '[role=' + n.getAttribute('role') + ']' : ''));
      }
      return parts.join(' > ');
    },
  };
  let n = 0;
  document.querySelectorAll('[data-od-audit]').forEach((e) => e.removeAttribute('data-od-audit'));
  const found = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!el.getClientRects().length) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility !== 'visible' || cs.pointerEvents === 'none' || cs.cursor !== 'pointer') continue;
    // Children inherit the hand: only the outermost element of a clickable area is audited.
    if (el.parentElement && getComputedStyle(el.parentElement).cursor === 'pointer') continue;
    el.setAttribute('data-od-audit', String(n));
    found.push({ n: n++, path: window.__odHover.path(el), text: (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || '').trim().replace(/\\s+/g, ' ').slice(0, 40) });
  }
  window.__odFound = found;
  return found.length;
})()`);
const found = await run('window.__odFound');

// A window that is hidden or in the background does not advance transitions: the computed values
// would stay at their start. Transitions are turned off for the audit; only the end state counts.
await run(`(() => { const s = document.createElement('style'); s.id = '__odHoverAuditStyle'; s.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }'; document.head.append(s); })()`);
// The real pointer must not rest on an element: it would hover before the check. Park it in the corner.
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: (await run('innerWidth')) - 1, y: (await run('innerHeight')) - 1 });
await send('DOM.enable');
await send('CSS.enable');
const missing = [];
for (const item of found) {
  // The page may re-render while it is checked: a node that is gone is skipped.
  let nodeId = 0;
  try {
    const doc = (await send('DOM.getDocument', { depth: 0 })).root.nodeId;
    nodeId = (await send('DOM.querySelector', { nodeId: doc, selector: `[data-od-audit="${item.n}"]` })).nodeId;
  } catch {
    continue;
  }
  if (!nodeId) continue;
  const before = await run(`window.__odHover.snapshot(document.querySelector('[data-od-audit="${item.n}"]'))`);
  await send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['hover'] });
  await wait(60);
  const after = await run(`window.__odHover.snapshot(document.querySelector('[data-od-audit="${item.n}"]'))`);
  await send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
  const changed = before.length !== after.length || before.some((v, i) => v !== after[i]);
  if (changed) {
    if (verbose) console.log(`ok    ${item.path}  "${item.text}"`);
  } else {
    missing.push(item);
  }
}
await run(`document.querySelectorAll('[data-od-audit]').forEach((e) => e.removeAttribute('data-od-audit')); document.getElementById('__odHoverAuditStyle')?.remove()`);
ws.close();

// The same path many times (table rows, list rows) is one line with a count.
const groups = new Map();
for (const m of missing) {
  const g = groups.get(m.path) ?? { count: 0, texts: [] };
  g.count++;
  if (g.texts.length < 3) g.texts.push(m.text);
  groups.set(m.path, g);
}
console.log(`${found.length} elements with the hand, ${missing.length} without a hover state`);
for (const [p, g] of groups) console.log(`  NO HOVER x${g.count}  ${p}  ${g.texts.map((t) => `"${t}"`).join(', ')}`);
process.exit(missing.length ? 1 : 0);
