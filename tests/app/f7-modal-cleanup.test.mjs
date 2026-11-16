// Framework7 leaves a swipeable sheet's and popup's app listeners behind: they are released on `<type>Destroy`,
// which a destroyed modal never emits. The app emits it from `modalBeforeDestroy`.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { releaseModalListeners } from '../../app/src/lib/f7-modal-cleanup.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const fake = (type) => {
  const emitted = [];
  return { type, emitted, emit: (...args) => emitted.push(args[0]) };
};

test('a sheet and a popup get their own destroy event, for the instance only', () => {
  for (const type of ['sheet', 'popup']) {
    const modal = fake(type);
    releaseModalListeners(modal);
    assert.deepEqual(modal.emitted, [`local::${type}Destroy`]);
  }
});

test('other modals and missing values are left alone', () => {
  const dialog = fake('dialog');
  releaseModalListeners(dialog);
  assert.deepEqual(dialog.emitted, []);
  assert.doesNotThrow(() => releaseModalListeners(undefined));
});

test('App.svelte hands the handler to Framework7', () => {
  const app = fs.readFileSync(path.join(root, 'app/src/App.svelte'), 'utf8');
  assert.match(app, /on: \{ modalBeforeDestroy: releaseModalListeners \}/);
});
