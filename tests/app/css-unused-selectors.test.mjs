// Svelte silently drops a scoped CSS rule whose selector matches nothing in the component's own markup
// (warning css_unused_selector): the rule stays in the source, so tests that read the source pass, but it is
// absent from the build. This compiles every .svelte file of the app and fails on any such warning.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, '../../app');
const { compile } = createRequire(path.join(appDir, 'package.json'))('svelte/compiler');

/**
 * Selectors that are allowed to stay unused, as `<file relative to app/src>|<selector>`, each with its reason.
 * @type {Record<string, string>}
 */
const ALLOWED = {};

/** @param {string} dir @returns {string[]} */
function svelteFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return svelteFiles(full);
    return name.endsWith('.svelte') ? [full] : [];
  });
}

/** Compiles one component and returns its css_unused_selector warnings. @param {string} file */
export function unusedSelectors(file) {
  const { warnings } = compile(readFileSync(file, 'utf8'), { filename: file, generate: 'client', css: 'injected' });
  return warnings
    .filter((w) => w.code === 'css_unused_selector')
    .map((w) => ({ line: w.start?.line ?? 0, selector: String(w.message).replace(/^Unused CSS selector "(.*?)"[sS]*$/, '$1') }));
}

test('no component has a scoped CSS rule that Svelte drops as unused', () => {
  const problems = [];
  for (const file of svelteFiles(path.join(appDir, 'src'))) {
    const rel = path.relative(path.join(appDir, 'src'), file).split(path.sep).join('/');
    for (const w of unusedSelectors(file)) {
      if (!ALLOWED[`${rel}|${w.selector}`]) problems.push(`${rel}:${w.line} ${w.selector}`);
    }
  }
  assert.deepEqual(problems, [], `unused CSS selectors (dropped from the build):\n${problems.join('\n')}`);
});

test('app styles, markup and e2e selectors use the bc prefix', () => {
  const problems = [];
  function check(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) check(file);
      else if (/\.(svelte|css|js|mjs|html)$/.test(entry.name)) {
        const text = readFileSync(file, 'utf8');
        if (/--od-|\.od-[\w-]+|\bclass:od-|\bclass=(["'])[^"']*\bod-|\[class[^\]]*["']od-/.test(text)) problems.push(path.relative(appDir, file));
      }
    }
  }
  check(path.join(appDir, 'src'));
  check(path.join(appDir, 'public'));
  check(path.resolve(here, '..', 'e2e'));
  assert.deepEqual(problems, []);
});

/** The CSS Svelte generates for one component. @param {string} rel path under app/src */
function builtCss(rel) {
  const file = path.join(appDir, 'src', rel);
  const { css } = compile(readFileSync(file, 'utf8'), { filename: file, generate: 'client', css: 'external' });
  return css?.code ?? '';
}
test('the first launch step transitions are in the built CSS, with keyframes the custom property can name', () => {
  const css = builtCss('components/FirstLaunchSteps.svelte');
  for (const kind of ['in-forward', 'in-back', 'out-forward', 'out-back']) {
    assert.ok(css.includes(`.bc-first-launch--${kind}`), `rule for ${kind}`);
    // The slide name sits in a custom property (--bc-first-launch-slide): Svelte does not rename it, so the keyframes must be global.
    assert.ok(css.includes(`@keyframes bc-first-launch-${kind} {`), `unscoped keyframes ${kind}`);
    assert.ok(css.includes(`--bc-first-launch-slide: bc-first-launch-${kind}`), `slide variable for ${kind}`);
  }
  assert.ok(css.includes('@keyframes bc-first-launch-fade-in {'));
  assert.ok(css.includes('@keyframes bc-first-launch-fade-out {'));
});

test('the bold of the sign-out box and the iPhone error field reach the built CSS', () => {
  // The nested rule is emitted as is: the pending box is global, so is the strong inside it.
  const account = builtCss('pages/Account.svelte');
  const at = account.indexOf('.bc-sign-out-dialog .bc-sign-out-dialog--pending {');
  assert.ok(at >= 0 && account.slice(at, account.indexOf('\n    }', at)).includes('strong {'), 'strong inside the pending box');
  assert.ok(builtCss('components/ReleaseField.svelte').includes('&.bc-release-field--error .bc-release-field--input:where('));
});
