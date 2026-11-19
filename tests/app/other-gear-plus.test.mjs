// « Autre équipement » of a dive belongs to OpenDives+: without an account it shows, with the chip, and cannot change.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isSubscriber, logbook } from '../../app/src/lib/logbook.svelte.js';

const root = new URL('../../app/src/', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8').split('\r\n').join('\n');

test('only an OpenDives+ account is a subscriber', () => {
  const saved = { odplus: logbook.odplus, email: logbook.email };
  try {
    Object.assign(logbook, { odplus: false, email: '' });
    assert.equal(isSubscriber(), false);
    Object.assign(logbook, { odplus: false, email: 'a@example.org' });
    assert.equal(isSubscriber(), false, 'a Subsurface cloud account is not a subscription');
    Object.assign(logbook, { odplus: true, email: 'a@example.org' });
    assert.equal(isSubscriber(), true);
  } finally {
    Object.assign(logbook, saved);
  }
});

test('the desktop and the phone editor gate adding and removing on the subscription', () => {
  const desktop = read('components/DesktopDiveFields.svelte');
  assert.match(desktop, /equipment && plus\}\n\s+<DesktopOtherGear items=\{otherItems\} onadd=/);
  assert.match(desktop, /<DesktopOtherGear items=\{otherItems\} locked \/>/);
  assert.match(desktop, /equipment && !plus\}<OdPlusChip/);
  const phone = read('components/DiveGearOther.svelte');
  assert.match(phone, /disabled=\{!plus\} onclick=\{openAdd\}/);
  assert.match(phone, /disabled=\{locked\}/);
  assert.match(phone, /gear\.diveGear\.plusOnly/);
});

test('the new texts exist in both languages', () => {
  for (const l of ['fr', 'en']) {
    const json = JSON.parse(read(`i18n/${l}.json`));
    assert.ok(json.desktopDetail.otherGearPlusOnly, l);
    assert.ok(json.gear.diveGear.plusOnly, l);
  }
});
