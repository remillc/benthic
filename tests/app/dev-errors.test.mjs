// The dev tools never show a raw code: every code they can receive maps to a sentence, the code stays in the detail.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { devErrorText, devErrorCode, DEV_ERROR_CODES } from '../../app/src/lib/dev-errors.js';
import { SERVER_ERRORS } from '../../app/src/lib/server-api.js';

const CODES = ['NO_SESSION', 'NOT_TEMPORARY', 'NO_ALPHA', 'NOT_DEBUG', 'NOT_DEV', 'UNREACHABLE', 'NETWORK', 'BAD_ADDRESS', 'INSECURE_ADDRESS', 'REFUSED', 'REJECTED', 'TOO_BIG', 'CANCELLED', 'FAILED', ...SERVER_ERRORS];

test('every code the dev tools can receive has a French and an English sentence with no raw code in it', () => {
  for (const code of CODES) {
    assert.ok(DEV_ERROR_CODES.includes(code), code);
    for (const lang of ['fr', 'en']) {
      const { text, detail } = devErrorText(new Error(code), lang);
      assert.ok(text.length > 10, code);
      assert.ok(!/[A-Z]{2,}(_[A-Z]+)+/.test(text), code + ': ' + text);
      assert.ok(!text.includes(code), code);
      assert.equal(detail, code);
    }
  }
});

test('codes come from error.code or from the start of the message; unknown things get a generic sentence', () => {
  assert.equal(devErrorCode({ code: 'REJECTED', message: 'x' }), 'REJECTED');
  assert.equal(devErrorCode(new Error('TOO_BIG: 3 GB')), 'TOO_BIG');
  const odd = devErrorText(new TypeError('x is not a function'), 'en');
  assert.match(odd.text, /failed/);
  assert.equal(devErrorText(undefined, 'fr').text.length > 10, true);
  assert.equal(devErrorText({ code: 'constructor' }, 'en').text.includes('function'), false);
});

test('the menu and the first-launch dev sign-in show the mapped text, never e.message or e.code', () => {
  for (const path of ['components/DevToolsMenu.svelte', 'components/FirstLaunchOdPlus.svelte']) {
    const src = readFileSync(new URL('../../app/src/' + path, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /text.failed +|e.message : String(e)|' + e.code/, path);
  }
  assert.match(readFileSync(new URL('../../app/src/components/DevToolsMenu.svelte', import.meta.url), 'utf8'), /devErrorText/);
});
