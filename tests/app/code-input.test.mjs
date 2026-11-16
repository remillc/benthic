// The confirmation code field's rules (app/src/lib/code-input.js) and the shape
// of CodeField.svelte and of the confirmation screen (task 2026-11-16-232).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { CODE_LENGTH, activeBox, boxDigits, codeComplete, deleteLastDigit, sanitizeCode } from '../../app/src/lib/code-input.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('typing keeps the digits only, six at most', () => {
  assert.equal(CODE_LENGTH, 6);
  assert.equal(sanitizeCode('4a8b2'), '482');
  assert.equal(sanitizeCode('４８'), '', 'full-width digits are not digits here');
  assert.equal(sanitizeCode('1234567'), '123456');
  assert.equal(sanitizeCode(''), '');
  assert.equal(sanitizeCode(undefined), '');
});

test('pasting the whole code fills all six boxes', () => {
  for (const pasted of ['482913', ' 482 913 ', '482-913', '482913\n', 'Code : 482913']) {
    assert.equal(sanitizeCode(pasted), '482913', JSON.stringify(pasted));
  }
  assert.deepEqual(boxDigits('482913'), ['4', '8', '2', '9', '1', '3']);
  assert.equal(codeComplete(sanitizeCode('482 913')), true);
});

test('Backspace removes the last digit and the active box goes back one', () => {
  assert.equal(deleteLastDigit('482913'), '48291');
  assert.equal(deleteLastDigit('4'), '');
  assert.equal(deleteLastDigit(''), '');
  assert.equal(activeBox('482913'), 5, 'complete: the last box');
  assert.equal(activeBox('48291'), 5);
  assert.equal(activeBox('4829'), 4);
  assert.equal(activeBox(deleteLastDigit('4829')), 3);
  assert.equal(activeBox(''), 0);
});

test('boxes: empty ones stay empty; the code is complete only with six digits', () => {
  assert.deepEqual(boxDigits('48'), ['4', '8', '', '', '', '']);
  assert.equal(codeComplete('48291'), false);
  assert.equal(codeComplete('48291a'), false);
  assert.equal(codeComplete('482913'), true);
});

test('CodeField: one numeric one-time-code input of six characters, one accessible name', () => {
  const src = read('app/src/components/CodeField.svelte');
  assert.match(src, /inputmode="numeric"/);
  assert.match(src, /autocomplete="one-time-code"/);
  assert.match(src, /maxlength=\{CODE_LENGTH\}/);
  assert.equal((src.match(/^\s*<input$/gm) ?? []).length, 1, 'a single input');
  assert.match(src, /aria-label=\{accessibleLabel\}/);
  assert.match(src, /aria-hidden="true"/, 'the boxes are only a picture');
  assert.match(src, /class="od-code-field/);
  assert.match(src, /width: 48px|flex: 0 1 48px/);
  assert.match(src, /height: 56px/);
});

test('CodeField: the error turns all six boxes red and shows the message under them', () => {
  const src = read('app/src/components/CodeField.svelte');
  assert.match(src, /class:od-code-field--error=\{!!error\}/);
  assert.match(src, /\.od-code-field--error \.od-code-field--box \{[^}]*border-width: 2px;[^}]*var\(--od-code-error\)/);
  assert.match(src, /aria-invalid=\{!!error\}/);
});

test('the texts and the colours exist, in French and English', () => {
  for (const f of ['fr', 'en']) {
    const j = JSON.parse(read(`app/src/i18n/${f}.json`));
    assert.ok(j.confirmCode.codeLabel && j.confirmCode.wrong && j.confirmCode.code, f);
  }
  const fr = JSON.parse(read('app/src/i18n/fr.json'));
  assert.equal(fr.confirmCode.code, 'Code de confirmation');
  assert.equal(fr.confirmCode.codeLabel, 'Code de confirmation, 6 chiffres');
  assert.equal(fr.confirmCode.wrong, 'Code incorrect. Vérifiez le dernier courriel reçu.');
  const css = read('app/src/theme.css');
  for (const [name, light] of [['--od-code-active', '#1F5C99'], ['--od-code-border', '#75787C'], ['--od-code-error', '#B3261E']]) {
    assert.ok(css.includes(`${name}: ${light};`), name);
    assert.equal((css.match(new RegExp(`${name}:`, 'g')) ?? []).length, 2, `${name}: light and dark`);
  }
});

test('the confirmation screen uses the field and sends only a complete code', () => {
  const src = read('app/src/pages/ConfirmCode.svelte');
  assert.match(src, /<CodeField/);
  assert.match(src, /actionDisabled=\{!codeComplete\(code\)\}/);
  assert.doesNotMatch(src, /AccountField/);
});
