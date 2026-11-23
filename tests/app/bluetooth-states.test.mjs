// Tasks 2026-11-23-351, 352 and 353: the Bluetooth states' icon, the blue button, the key icon.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../../app/src/${f}`, import.meta.url), 'utf8');

test('the Bluetooth states show a white 36 dp icon centred in a 72 dp blue disc', () => {
  const page = read('pages/Download.svelte');
  assert.match(page, /<Icon name="bluetooth" size=\{36\} weight=\{2\} \/>/);
  assert.match(page, /\.bc-download--state-icon \{[^}]*width: 72px;[^}]*height: 72px;[^}]*margin: 0 auto;[^}]*border-radius: 50%;[^}]*var\(--bc-bluetooth-disc\)/);
  assert.match(read('theme.css'), /--bc-bluetooth-disc: #1F5C99;/);
});

test('« Activer le Bluetooth » is the blue filled button', () => {
  const page = read('pages/Download.svelte');
  assert.match(page, /bc-download--filled bc-download--filled-blue" onclick=\{turnOn\}/);
  assert.match(read('theme.css'), /--bc-bluetooth-action: #114477;/);
});

test('the key icon is the Material Symbols glyph and marks the recovery-key screens', () => {
  assert.match(read('components/Icon.svelte'), /viewBox="0 -960 960 960" fill="currentColor"/);
  for (const f of ['RecoveryKeyOffer', 'RecoveryKeyShow', 'RecoveryKeyEnter', 'AccountUnlockDialog']) {
    assert.match(read(`components/${f}.svelte`), /<Icon name="key"/, f);
  }
});
