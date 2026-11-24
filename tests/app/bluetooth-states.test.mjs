// Tasks 2026-11-23-351, 352 and 353: the Bluetooth states' icon, the blue button, the key icon.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../../app/src/${f}`, import.meta.url), 'utf8');

test('the Bluetooth states follow the download flow: a 96 px blue disc with a white icon, a centred title and text, the buttons in the bar', () => {
  const page = read('pages/Download.svelte');
  assert.match(page, /bc-download--disc bc-download--disc-bluetooth/);
  assert.match(page, /<Icon name=\{phase === 'none' \? 'bluetoothOff' : 'bluetooth'\} size=\{44\} weight=\{2\} \/>/);
  assert.match(page, /\.bc-download--disc \{[^}]*width: 96px;[^}]*height: 96px;/);
  assert.match(page, /\.bc-download--disc-bluetooth \{[^}]*var\(--bc-bluetooth-disc\)/);
  assert.match(read('theme.css'), /--bc-bluetooth-disc: #1F5C99;/);
  assert.match(page, /\['downloading', 'finished', 'nothing', 'lost', 'permission', 'denied', 'off'\]\.includes\(phase\)/);
  assert.match(page, /onclick=\{\(\) => BenthicCore\.openAppSettings\(\)\}/);
});

test('the failed download has the same layout: a 96 px pale red disc, Réessayer with its icon above the text button', () => {
  const page = read('pages/DownloadFailed.svelte');
  assert.match(page, /\.bc-download-failed--disc \{[^}]*width: 96px;[^}]*height: 96px;[^}]*var\(--bc-download-failed-disc\)/);
  assert.match(read('theme.css'), /--bc-download-failed-disc: #F9DEDC;[\s\S]*--bc-on-download-failed-disc: #B3261E;/);
  assert.match(page, /<Icon name="refresh" size=\{20\} \/>/);
  assert.match(page, /flex-direction: row-reverse/);
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
