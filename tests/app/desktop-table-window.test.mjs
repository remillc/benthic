// The desktop logbook table draws only the rows in view (performance audit, finding F1).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ROW_HEIGHT, TRIP_HEIGHT, BODY_TOP, OVERSCAN, rowOffsets, rowAt, windowRange, scrollForRow } from '../../app/src/lib/desktop-table.js';

const dives = (n) => Array.from({ length: n }, () => ({ type: 'dive' }));

test('offsets add 50 px per dive row and 46 per trip row', () => {
  const o = rowOffsets([{ type: 'trip' }, { type: 'dive' }, { type: 'dive' }]);
  assert.deepEqual([...o], [0, TRIP_HEIGHT, TRIP_HEIGHT + ROW_HEIGHT, TRIP_HEIGHT + 2 * ROW_HEIGHT]);
});

test('rowAt finds the row under a position', () => {
  const o = rowOffsets(dives(100));
  assert.equal(rowAt(o, 0), 0);
  assert.equal(rowAt(o, 49), 0);
  assert.equal(rowAt(o, 50), 1);
  assert.equal(rowAt(o, 4999), 99);
  assert.equal(rowAt(o, 99999), 100);
  assert.equal(rowAt(rowOffsets([]), 10), 0);
});

test('the window at the top draws the visible rows and the overscan, with a bottom spacer only', () => {
  const o = rowOffsets(dives(3000));
  const w = windowRange(o, 0, 800);
  assert.equal(w.start, 0);
  assert.equal(w.padTop, 0);
  // Rows reach 800 - 40 = 760 px: row 15 is the last one touched.
  assert.equal(w.end, 16 + OVERSCAN);
  assert.equal(w.padBottom, o[3000] - o[w.end] - 2);
  assert.ok(w.end - w.start < 40);
});

test('spacer rows plus drawn rows keep the full height (a spacer replaces k rows by 50k - 2, the table adds 2 around it)', () => {
  const o = rowOffsets(dives(3000));
  const w = windowRange(o, 60000, 800);
  const drawn = (w.end - w.start) * ROW_HEIGHT;
  assert.equal(w.padTop + 2 + drawn + w.padBottom + 2, o[3000]);
  assert.ok(w.start > 0 && w.end < 3000);
});

test('the window at the bottom has no bottom spacer and never passes the last row', () => {
  const o = rowOffsets(dives(3000));
  const w = windowRange(o, BODY_TOP + o[3000] - 800, 800);
  assert.equal(w.end, 3000);
  assert.equal(w.padBottom, 0);
});

test('a short list is drawn whole, an empty one is empty', () => {
  assert.deepEqual(windowRange(rowOffsets(dives(5)), 0, 800), { start: 0, end: 5, padTop: 0, padBottom: 0 });
  assert.deepEqual(windowRange(rowOffsets([]), 0, 800), { start: 0, end: 0, padTop: 0, padBottom: 0 });
});

test('an unmeasured view draws a tall screen of rows', () => {
  const w = windowRange(rowOffsets(dives(3000)), 0, 0);
  assert.ok(w.end >= 18);
});

test('scrollForRow leaves a visible row alone and brings the others in view under the sticky header', () => {
  const o = rowOffsets(dives(3000));
  assert.equal(scrollForRow(o, 3, 0, 800), 0);
  // Row 100 is below the view: its bottom lands on the view's bottom.
  const down = scrollForRow(o, 100, 0, 800);
  assert.equal(down, BODY_TOP + 100 * ROW_HEIGHT + ROW_HEIGHT - 2 - 800);
  // Row 10 above the view: its top lands under the header (38 px).
  const up = scrollForRow(o, 10, 5000, 800);
  assert.equal(up, BODY_TOP + 10 * ROW_HEIGHT - (BODY_TOP - 2));
  assert.equal(scrollForRow(o, -1, 123, 800), 123);
  assert.equal(scrollForRow(o, 3000, 123, 800), 123);
});
