// Copy and paste of dives in the desktop Carnet (task 178, part 3): the plain-text form, recognising
// a Subsurface <divelog> on the clipboard, and what the clipboard bridge gives back.
import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { selectionText, isDivelog, divesIn, textToBase64, clipboardDives, DIVES_TYPE } from '../../app/src/lib/desktop-clipboard.js';
import { multiEditChanges, multiEditState } from '../../app/src/lib/multi-dive.js';

afterEach(() => {
  delete globalThis.window;
});

test('the copied text: a header line, one dive per line, columns separated by tabs', () => {
  const text = selectionText(
    ['N°', 'Date', 'Site', 'Prof. max.', 'Durée'],
    [
      ['12', '5 nov. 2012 10:15', 'Koror', '28,7 m', '61 min'],
      ['13', '5 nov. 2012 14:05', 'Peleliu', '22 m', '66 min'],
    ],
  );
  const lines = text.split('\n');
  assert.equal(lines.length, 3);
  assert.deepEqual(lines[0].split('\t'), ['N°', 'Date', 'Site', 'Prof. max.', 'Durée']);
  assert.deepEqual(lines[2].split('\t'), ['13', '5 nov. 2012 14:05', 'Peleliu', '22 m', '66 min']);
  assert.ok(!text.endsWith('\n'));
});

test('a tab or a line break inside a cell does not break the columns', () => {
  const text = selectionText(['Site', 'Compagnons'], [['Rock\tIslands', 'Anne,\nMarc'], ['', '']]);
  const rows = text.split('\n').map((l) => l.split('\t'));
  assert.deepEqual(rows, [['Site', 'Compagnons'], ['Rock Islands', 'Anne, Marc'], ['', '']]);
});

test('a Subsurface <divelog> text is recognised, other text is not', () => {
  assert.equal(isDivelog('<divelog program="subsurface" version="3"><dives></dives></divelog>'), true);
  assert.equal(isDivelog('<?xml version="1.0"?>\n<!-- exported -->\n<divelog program=\'subsurface\'>'), true);
  assert.equal(isDivelog('﻿  <divelog>'), true);
  assert.equal(isDivelog('<divelogs>nope</divelogs>'), false);
  assert.equal(isDivelog('N°\tDate\n1\t2012'), false);
  assert.equal(isDivelog('<html><body><divelog></body></html>'), false);
  assert.equal(isDivelog(''), false);
});

test('the dives of a clipboard: the private type first, else a <divelog> text, else none', () => {
  const xml = '<divelog program="subsurface"></divelog>';
  assert.equal(divesIn({ text: 'plain', dives: xml }), xml);
  assert.equal(divesIn({ text: xml, dives: '' }), xml);
  assert.equal(divesIn({ text: 'N°\tDate', dives: '' }), '');
  assert.equal(divesIn({ text: '', dives: 'not xml' }), '');
  assert.equal(divesIn(null), '');
  assert.equal(DIVES_TYPE, 'application/x-opendives-dives');
});

test('the text goes to the core as base64 of its UTF-8 bytes', () => {
  const text = '<divelog><dive>Hälvälä · 28 m</dive></divelog>';
  assert.equal(Buffer.from(textToBase64(text), 'base64').toString('utf8'), text);
});

test('the clipboard of the desktop bridge is read for dives', async () => {
  const xml = '<divelog program="subsurface"></divelog>';
  globalThis.window = { benthicDesktop: { clipboard: { read: async () => ({ text: 'x', dives: xml }) } } };
  assert.equal(await clipboardDives(), xml);
  globalThis.window = { benthicDesktop: { clipboard: { read: async () => ({ text: 'N°\tDate', dives: '' }) } } };
  assert.equal(await clipboardDives(), '');
  globalThis.window = { benthicDesktop: { clipboard: { read: async () => Promise.reject(new Error('gone')) } } };
  assert.equal(await clipboardDives(), '');
});

test('« Modifier ensemble »: the dialog applies only what was edited', () => {
  const detail = (id, over) => ({ id, site: 'Koror', notes: '', suit: '5 mm', userSalinity: 10300, buddies: ['Anne'], guides: [], tags: [], ...over });
  const state = multiEditState([detail(1, {}), detail(2, { site: 'Peleliu', buddies: ['Anne', 'Marc'] }), detail(3, { suit: '' })]);
  assert.equal(state.count, 3);
  assert.equal(state.site.mixed, true);
  assert.equal(state.suit.mixed, true);
  assert.equal(state.notes.mixed, false);
  assert.deepEqual(state.buddies.map((c) => [c.name, c.count, c.common]), [['Anne', 3, true], ['Marc', 1, false]]);
  // The chips shown and left alone, nothing touched: no change at all (the Apply button stays off).
  assert.deepEqual(multiEditChanges(state, { guides: [], buddies: ['Anne', 'Marc'], tags: [] }), {});
  // Removing a chip of only some dives removes it from those; a new chip is added to all.
  assert.deepEqual(multiEditChanges(state, { buddies: ['Anne', 'Julie'] }), { buddiesAdd: ['Julie'], buddiesRemove: ['Marc'] });
  // A mixed field is sent only once touched.
  assert.deepEqual(multiEditChanges(state, { suit: '7 mm' }), { suit: '7 mm' });
});
