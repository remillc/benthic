// « Autre équipement » of a dive belongs to OpenDives+: without an account it shows, with the chip, and cannot change.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isSubscriber, logbook } from '../../app/src/lib/logbook.svelte.js';
import { setOdplusAccount } from '../../app/src/lib/benthic-plus-state.svelte.js';

const root = new URL('../../app/src/', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8').split('\r\n').join('\n');

test('only a subscribed OpenDives+ account is a subscriber, wherever the logbook lives', () => {
  const saved = { odplus: logbook.odplus, email: logbook.email };
  try {
    setOdplusAccount({ signedIn: false });
    Object.assign(logbook, { odplus: false, email: '' });
    assert.equal(isSubscriber(), false);
    Object.assign(logbook, { odplus: false, email: 'a@example.org' });
    assert.equal(isSubscriber(), false, 'a Subsurface cloud account is not a subscription');
    Object.assign(logbook, { odplus: true, email: 'a@example.org' });
    assert.equal(isSubscriber(), false, 'rule changed: the server logbook alone no longer makes a subscriber');
    setOdplusAccount({ signedIn: true, email: 'a@example.org', subscribed: false });
    assert.equal(isSubscriber(), false, 'signed in, not subscribed');
    setOdplusAccount({ subscribed: true });
    assert.equal(isSubscriber(), true, 'subscribed, logbook on the server');
    Object.assign(logbook, { odplus: false, email: '' });
    assert.equal(isSubscriber(), true, 'subscribed, logbook still on the device');
  } finally {
    setOdplusAccount({ signedIn: false });
    Object.assign(logbook, saved);
  }
});

test('the desktop and the phone editor gate adding and removing on the subscription', () => {
  const desktop = read('components/DesktopDiveFields.svelte');
  assert.match(desktop, /equipment && plus\}\n\s+<DesktopOtherGear items=\{otherItems\} onadd=/);
  assert.match(desktop, /<DesktopOtherGear items=\{otherItems\} locked \/>/);
  assert.match(desktop, /equipment && !plus\}<BenthicPlusChip/);
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
