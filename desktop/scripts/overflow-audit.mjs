// SPDX-License-Identifier: GPL-2.0
// Overflow audit (docs/system-design.md, section 7, « Fluid desktop layout »): on the current page of a
// running desktop app, reports what a diver would see go wrong in a small window.
//   - horizontal overflow of the document (a page-level horizontal scrollbar), and of any element:
//     content wider than its scroll container (a scrollbar, or text and controls cut off);
//   - page-level vertical overflow (the document is taller than the window);
//   - scrollbars that are visible (a classic scrollbar takes room), in any pane.
// A vertical scrollbar inside a pane is reported as « pane scroll »: it is allowed only for a list
// by nature (the logbook table, the sites list, statistics lists, the planner's levels, the content of
// a Réglages category). Everything else is a problem.
// It looks at the current page only: open the screen or the dialog to check first. With `--size`, the
// window is emulated at that size for the audit (CDP device metrics), then restored.
//   node desktop/scripts/overflow-audit.mjs <DevTools port> [--size 768x560] [--shot file.png] [--json] [--reload] [--pre <js>] [--root <css selector>] [--allow <css selector>]...
// Exit code 1 when a problem is found. `--allow` names panes whose vertical scroll is accepted (lists);
// the panes marked `data-bc-scroll` in the interface are accepted by default.
import fs from 'node:fs';

const args = process.argv.slice(2);
const port = Number(args[0]);
const opt = (name) => {
  const i = args.indexOf(name);
  return i < 0 ? null : args[i + 1];
};
const size = opt('--size');
const shot = opt('--shot');
const asJson = args.includes('--json');
const rootSel = opt('--root');
const reload = args.includes('--reload');
const pre = opt('--pre');
const allow = args.flatMap((a, i) => (a === '--allow' ? [args[i + 1]] : []));
if (!port) {
  console.error('usage: node overflow-audit.mjs <DevTools port> [--size WxH] [--shot file.png] [--json] [--reload] [--pre <js>] [--root <selector>] [--allow <selector>]');
  process.exit(2);
}
if (port === 9333) {
  console.error("port 9333 is the developer's own window: not audited from here");
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

if (size) {
  const [w, h] = size.split('x').map(Number);
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await wait(2200);
}
// `--reload`: the page is loaded again at that size (a window grown or shrunk across a breakpoint keeps some of
// the layout it had; a diver who opens the app at that size does not). `--pre <js>` then runs in the page
// (a click that opens the screen to check) before the audit.
if (reload) {
  await send('Page.reload');
  await wait(4500);
}
if (pre) {
  await run(`(async () => { ${pre} })()`);
  await wait(1800);
}

/** Runs in the page. */
function inspect(allow, rootSel) {
  const doc = document.documentElement;
  const vw = doc.clientWidth;
  const vh = window.innerHeight;
  const label = (el) => {
    const cls = [...el.classList].slice(0, 3).join('.');
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (cls ? '.' + cls : '');
  };
  const shown = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 || r.height > 0;
  };
  const out = {
    viewport: { width: vw, height: vh },
    document: {
      horizontal: doc.scrollWidth > vw + 1 || document.body.scrollWidth > vw + 1,
      scrollWidth: Math.max(doc.scrollWidth, document.body.scrollWidth),
      vertical: doc.scrollHeight > vh + 1 || document.body.scrollHeight > vh + 1,
      scrollHeight: Math.max(doc.scrollHeight, document.body.scrollHeight),
    },
    horizontal: [],
    clipped: [],
    paneScroll: [],
    scrollbars: [],
    outside: [],
    bottomCut: [],
  };
  // The layer on top: with a popup, a sheet or a dialog open, only that layer is looked at (what lies under
  // it is covered and cannot be seen); `--root` names another one.
  const layers = rootSel ? [...document.querySelectorAll(rootSel)] : [...document.querySelectorAll('.popup.modal-in, .sheet-modal.modal-in, .dialog.modal-in, .popover.modal-in')];
  const root = layers.filter((l) => l.getClientRects().length).pop() || document.body;
  out.root = root === document.body ? 'body' : label(root);
  const isAllowed = (el) => !!el.closest('[data-bc-scroll]') || allow.some((s) => el.matches(s));
  const clipRect = (el) => {
    let left = 0;
    let top = 0;
    let right = window.innerWidth;
    let bottom = vh;
    for (let p = el.parentElement; p && p !== document.body && p !== doc; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
        const pr = p.getBoundingClientRect();
        if (cs.overflowX !== 'visible') {
          left = Math.max(left, pr.left);
          right = Math.min(right, pr.right);
        }
        if (cs.overflowY !== 'visible') {
          top = Math.max(top, pr.top);
          bottom = Math.min(bottom, pr.bottom);
        }
      }
    }
    return { left, top, right, bottom };
  };
  // The window's foot: what is fixed to the window (the rail with the account button, a bar) must lie inside it
  // entirely; a window moved or sized so that its bottom is cut, or a rail taller than the window, shows here.
  // The whole page is looked at, whichever layer is on top, as the rail sits under every layer.
  for (const el of document.querySelectorAll('.bc-nav-rail--rail, .bc-nav-rail--rail *, [class*="bc-"][style*="fixed"]')) {
    if (!shown(el) || el.closest('svg, .bc-sr-only')) continue;
    const r = el.getBoundingClientRect();
    if (r.bottom > vh + 1 && r.top < vh) out.bottomCut.push({ el: label(el), bottom: Math.round(r.bottom), height: vh });
  }
  for (const el of root.querySelectorAll('*')) {
    // Covered pages (the previous page of a stack) and text for screen readers only are not on screen.
    if (!shown(el) || el.closest('svg, .page-previous, .bc-sr-only, .sr-only, .maplibregl-marker, .maplibregl-popup, .maplibregl-ctrl') || ['IMG', 'VIDEO', 'CANVAS'].includes(el.tagName)) continue;
    const cs = getComputedStyle(el);
    const ox = cs.overflowX;
    const oy = cs.overflowY;
    if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1) {
      if (ox === 'auto' || ox === 'scroll') {
        out.horizontal.push({ el: label(el), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth });
      } else if ((ox === 'hidden' || ox === 'clip') && cs.textOverflow !== 'ellipsis' && !el.querySelector(':scope > img, :scope > canvas, :scope > video, :scope > .maplibregl-canvas-container')) {
        out.clipped.push({ el: label(el), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, text: (el.textContent || '').trim().slice(0, 30) });
      }
    }
    if (el.clientHeight > 0 && el.scrollHeight > el.clientHeight + 1 && (oy === 'hidden' || oy === 'clip') && !el.querySelector(':scope > img, :scope > canvas, :scope > video') && !el.closest('.maplibregl-map') && !['IFRAME'].includes(el.tagName) && cs.display !== '-webkit-box') {
      out.clipped.push({ el: label(el), axis: 'y', scrollWidth: el.scrollHeight, clientWidth: el.clientHeight, text: (el.textContent || '').trim().slice(0, 30) });
    }
    if (el.clientHeight > 0 && el.scrollHeight > el.clientHeight + 1 && (oy === 'auto' || oy === 'scroll')) {
      out.paneScroll.push({ el: label(el), scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, allowed: isAllowed(el) });
    }
    const bw = el.offsetWidth - el.clientWidth - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth);
    const bh = el.offsetHeight - el.clientHeight - parseFloat(cs.borderTopWidth) - parseFloat(cs.borderBottomWidth);
    if ((oy === 'auto' || oy === 'scroll') && bw > 1 && cs.scrollbarWidth !== 'none') out.scrollbars.push({ el: label(el), axis: 'y', size: Math.round(bw), thin: cs.scrollbarWidth === 'thin', allowed: isAllowed(el) });
    if ((ox === 'auto' || ox === 'scroll') && bh > 1 && cs.scrollbarWidth !== 'none') out.scrollbars.push({ el: label(el), axis: 'x', size: Math.round(bh), thin: cs.scrollbarWidth === 'thin', allowed: false });
    // An element that sticks out of its clipping box or of the window; its parent's overflow is not repeated.
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || !el.parentElement) continue;
    const c = clipRect(el);
    const pr = el.parentElement.getBoundingClientRect();
    const pc = clipRect(el.parentElement);
    if ((r.right - c.right > 1 && !(pr.right - pc.right > 1)) || (c.left - r.left > 1 && !(pc.left - pr.left > 1))) {
      out.outside.push({ el: label(el), left: Math.round(r.left), right: Math.round(r.right), clip: [Math.round(c.left), Math.round(c.right)], text: (el.textContent || '').trim().slice(0, 30) });
    }
  }
  return out;
}

const report = await run(`(${inspect.toString()})(${JSON.stringify(allow)}, ${JSON.stringify(rootSel)})`);

if (shot) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(shot, Buffer.from(r.data, 'base64'));
}
if (size) await send('Emulation.clearDeviceMetricsOverride');
ws.close();

const problems = [];
if (report.document.horizontal) problems.push(`document: horizontal overflow (${report.document.scrollWidth} > ${report.viewport.width})`);
if (report.document.vertical) problems.push(`document: page-level vertical overflow (${report.document.scrollHeight} > ${report.viewport.height})`);
for (const h of report.horizontal) problems.push(`${h.el}: horizontal scroll (${h.scrollWidth} > ${h.clientWidth})`);
for (const c of report.clipped) problems.push(`${c.el}: content cut off${c.axis === 'y' ? ' at the bottom' : ''} (${c.scrollWidth} > ${c.clientWidth}) "${c.text}"`);
for (const b of report.bottomCut) problems.push(`${b.el}: cut off at the bottom of the window (bottom ${b.bottom}, window ${b.height})`);
for (const o of report.outside) problems.push(`${o.el}: sticks out of its box or the window (${o.left}..${o.right}, box ${o.clip[0]}..${o.clip[1]}) "${o.text}"`);
for (const p of report.paneScroll) if (!p.allowed) problems.push(`${p.el}: pane scrolls vertically and is not a list (${p.scrollHeight} > ${p.clientHeight})`);
for (const s of report.scrollbars) {
  if (!s.allowed) problems.push(`${s.el}: visible ${s.axis} scrollbar (${s.size}px${s.thin ? ', thin' : ''})`);
  else if (s.size > 11) problems.push(`${s.el}: pane scrollbar is not thin (${s.size}px)`);
}

const unique = [...new Set(problems)];
problems.length = 0;
problems.push(...unique);

if (asJson) {
  console.log(JSON.stringify({ ...report, problems }, null, 2));
} else {
  console.log(`${page.url} [${report.root}] at ${report.viewport.width}x${report.viewport.height}`);
  for (const p of report.paneScroll.filter((x) => x.allowed)) console.log(`  pane scroll (allowed): ${p.el} ${p.scrollHeight} > ${p.clientHeight}`);
  for (const p of problems) console.log(`  PROBLEM ${p}`);
  console.log(problems.length ? `${problems.length} problem(s)` : 'no overflow problem');
}
process.exit(problems.length ? 1 : 0);
