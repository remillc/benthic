// The Android safe area handed over by the native side (app/src/lib/safe-area.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseInsets, applyInsets, installSafeArea } from '../../app/src/lib/safe-area.js';

const read = (path) => readFileSync(new URL(`../../app/src/${path}`, import.meta.url), 'utf8');

function fakeRoot() {
  const props = new Map();
  const classes = new Set();
  return {
    props,
    classes,
    style: { setProperty: (k, v) => props.set(k, v) },
    classList: { add: (c) => classes.add(c) },
  };
}

function fakeWindow(bridge) {
  const root = fakeRoot();
  const events = [];
  return {
    root,
    events,
    BenthicInsets: bridge,
    document: { documentElement: root },
    dispatchEvent: (e) => events.push(e),
  };
}

test('parseInsets reads JSON text and objects, in CSS pixels', () => {
  assert.deepEqual(parseInsets('{"top":52,"right":0,"bottom":24,"left":0}'), { top: 52, right: 0, bottom: 24, left: 0 });
  assert.deepEqual(parseInsets({ top: 24.5, bottom: 48 }), { top: 24.5, right: 0, bottom: 48, left: 0 });
});

test('parseInsets falls back: missing, negative or non-numeric sides are 0, junk is null', () => {
  assert.deepEqual(parseInsets({ top: -3, right: 'x', bottom: null }), { top: 0, right: 0, bottom: 0, left: 0 });
  assert.equal(parseInsets('not json'), null);
  assert.equal(parseInsets(null), null);
  assert.equal(parseInsets(undefined), null);
  assert.equal(parseInsets(42), null);
});

test('applyInsets sets the four --bc-safe-* variables', () => {
  const root = fakeRoot();
  const applied = applyInsets({ top: 52, right: 0, bottom: 24, left: 8 }, root);
  assert.deepEqual(applied, { top: 52, right: 0, bottom: 24, left: 8 });
  assert.equal(root.props.get('--bc-safe-top'), '52px');
  assert.equal(root.props.get('--bc-safe-right'), '0px');
  assert.equal(root.props.get('--bc-safe-bottom'), '24px');
  assert.equal(root.props.get('--bc-safe-left'), '8px');
});

test('applyInsets leaves the defaults alone when the value is unusable', () => {
  const root = fakeRoot();
  assert.equal(applyInsets('junk', root), null);
  assert.equal(root.props.size, 0);
});

test('installSafeArea does nothing without the native interface (iOS, desktop, browser)', () => {
  const win = fakeWindow(undefined);
  assert.equal(installSafeArea(win), false);
  assert.equal(win.root.props.size, 0);
  assert.equal(typeof win.__odSetInsets, 'function');
});

test('installSafeArea reads the boot value, then follows the pushes', () => {
  const win = fakeWindow({ get: () => '{"top":52,"right":0,"bottom":24,"left":0}' });
  assert.equal(installSafeArea(win), true);
  assert.equal(win.root.props.get('--bc-safe-bottom'), '24px');
  assert.equal(win.events.length, 1);
  win.__odSetInsets({ top: 24, right: 0, bottom: 48, left: 0 });
  assert.equal(win.root.props.get('--bc-safe-top'), '24px');
  assert.equal(win.root.props.get('--bc-safe-bottom'), '48px');
  assert.equal(win.events.length, 2);
  assert.deepEqual(win.events[1].detail, { top: 24, right: 0, bottom: 48, left: 0 });
});

test('the app reads --bc-safe-*, never env() directly, and Framework7 points at them', () => {
  const files = ['App.svelte', 'components/NavigationBar.svelte', 'components/AccountSheet.svelte', 'components/SiteMap.svelte', 'pages/SiteEdit.svelte'];
  for (const f of files) assert.doesNotMatch(read(f), /env\(safe-area-inset/, f);
  const theme = read('theme.css');
  assert.match(theme, /--bc-safe-bottom: env\(safe-area-inset-bottom, 0px\);/);
  assert.match(theme, /--f7-safe-area-bottom: var\(--bc-safe-bottom\);/);
  assert.match(theme, /--f7-safe-area-top: var\(--bc-safe-top\);/);
  assert.match(theme, /--f7-safe-area-left: var\(--bc-safe-left\);/);
  assert.match(read('main.js'), /installSafeArea\(\);/);
});
