// The time left of long downloads, imports and uploads (task 2026-11-18-269): the estimator, its rounding, the texts
// and the screens that show it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTimeLeft, roundTimeLeft, timeLeftText } from '../../app/src/lib/time-left.js';

const read = (p) => readFileSync(new URL(`../../app/src/${p}`, import.meta.url), 'utf8');
const langs = { fr: JSON.parse(read('i18n/fr.json')), en: JSON.parse(read('i18n/en.json')) };

/** Runs a steady operation of `total` items at `perSecond`, reporting every `stepMs`; returns what is shown each time. */
function run({ total, perSecond, stepMs = 500, from = 0 }) {
  const est = createTimeLeft();
  const out = [];
  let now = 1_000_000;
  est.update(from, total, now);
  for (let ms = stepMs; ; ms += stepMs) {
    const done = Math.min(total, from + Math.floor((ms / 1000) * perSecond));
    now = 1_000_000 + ms;
    out.push({ ms, done, left: est.update(done, total, now) });
    if (done >= total) break;
  }
  return out;
}

test('nothing is shown before a few items or a few seconds are measured', () => {
  const est = createTimeLeft();
  assert.equal(est.update(0, 312, 0), null);
  assert.equal(est.update(1, 312, 500), null);
  assert.equal(est.update(2, 312, 1000), null);
  // three items measured
  assert.notEqual(est.update(3, 312, 1500), null);
  // a few seconds with a single item
  const slow = createTimeLeft();
  slow.update(0, 100, 0);
  assert.equal(slow.update(1, 100, 2000), null);
  assert.notEqual(slow.update(1, 100, 3500), null);
});

test('an operation expected to finish within 5 seconds never shows a time left', () => {
  const shown = run({ total: 40, perSecond: 10 }).filter((r) => r.left);
  assert.equal(shown.length, 0);
  assert.equal(run({ total: 30, perSecond: 10, stepMs: 250 }).filter((r) => r.left).length, 0);
});

test('a long operation shows a time left that decreases smoothly to the end', () => {
  const rows = run({ total: 312, perSecond: 8 }); // about 39 s
  const shown = rows.filter((r) => r.left);
  assert.ok(shown.length > 20, 'shown most of the time');
  assert.equal(rows.at(-1).left, null, 'nothing once done');
  const seconds = shown.map((r) => (r.left.unit === 'seconds' ? r.left.n : r.left.n * 60));
  for (let i = 1; i < seconds.length; i += 1) {
    assert.ok(seconds[i] <= seconds[i - 1] + 5, `no jump back: ${seconds[i - 1]} then ${seconds[i]}`);
  }
  const first = seconds[0];
  assert.ok(first > 25 && first < 50, `about 39 s at the start, got ${first}`);
});

test('a speed that changes does not make the value jump', () => {
  const est = createTimeLeft();
  let now = 0;
  let done = 0;
  est.update(0, 600, 0);
  const shown = [];
  for (let i = 1; i <= 40; i += 1) {
    now += 1000;
    done += i % 2 ? 4 : 12; // bursts
    const l = est.update(done, 600, now);
    if (l) shown.push(l.unit === 'seconds' ? l.n : l.n * 60);
  }
  for (let i = 1; i < shown.length; i += 1) assert.ok(Math.abs(shown[i] - shown[i - 1]) <= 65, `${shown[i - 1]} then ${shown[i]}`);
});

test('seconds under a minute, whole minutes after', () => {
  assert.deepEqual(roundTimeLeft(3), { unit: 'seconds', n: 3 });
  assert.deepEqual(roundTimeLeft(19), { unit: 'seconds', n: 20 });
  assert.deepEqual(roundTimeLeft(58), { unit: 'minutes', n: 1 });
  assert.deepEqual(roundTimeLeft(59.6), { unit: 'minutes', n: 1 });
  assert.deepEqual(roundTimeLeft(100), { unit: 'minutes', n: 2 });
  assert.deepEqual(roundTimeLeft(3600), { unit: 'minutes', n: 60 });
  const rows = run({ total: 2000, perSecond: 10 }).filter((r) => r.left);
  assert.equal(rows[0].left.unit, 'minutes');
  assert.equal(rows.at(-1).left.unit, 'seconds');
  const firstSeconds = rows.findIndex((r) => r.left.unit === 'seconds');
  assert.ok(rows.slice(firstSeconds).every((r) => r.left.unit === 'seconds'), 'switches once, from minutes to seconds');
});

test('counts that arrive almost together do not make a huge speed', () => {
  const est = createTimeLeft();
  est.update(0, 312, 1000);
  est.update(0, 312, 1001);
  est.update(8, 312, 1001);
  est.update(8, 312, 2005);
  const left = est.update(16, 312, 2005);
  assert.equal(left?.unit, 'seconds');
  assert.ok(left.n >= 30 && left.n <= 45, `about 37 s, got ${left.n}`);
});

test('a restarted count starts the estimate again', () => {
  const est = createTimeLeft();
  est.update(0, 100, 0);
  est.update(10, 100, 1000);
  assert.equal(est.update(0, 100, 2000), null);
});

test('the texts, short and spoken, in French and English', () => {
  const t = (lang) => (key, p = {}) => {
    let v = key.split('.').reduce((o, k) => o[k], langs[lang]);
    if (typeof v === 'object') v = p.n === 1 ? v.one : v.other;
    return v.replace(/\{(\w+)\}/g, (_, k) => p[k]);
  };
  const s20 = { unit: 'seconds', n: 20 };
  const m2 = { unit: 'minutes', n: 2 };
  assert.equal(timeLeftText(t('fr'), s20), '20 s restantes');
  assert.equal(timeLeftText(t('fr'), m2), '2 min restantes');
  assert.equal(timeLeftText(t('en'), s20), '20 s left');
  assert.equal(timeLeftText(t('en'), m2), '2 min left');
  assert.equal(timeLeftText(t('fr'), s20, true), '20 secondes restantes');
  assert.equal(timeLeftText(t('fr'), { unit: 'minutes', n: 1 }, true), '1 minute restante');
  assert.equal(timeLeftText(t('en'), s20, true), '20 seconds left');
  assert.equal(timeLeftText(t('fr'), null), '');
  for (const lang of ['fr', 'en']) for (const l of Object.values(langs[lang].timeLeft).flatMap((v) => (typeof v === 'string' ? [v] : Object.values(v)))) assert.ok(!/environ|about/i.test(l));
});

test('the three progress screens use the one line, with the count on the left', () => {
  const line = read('components/ProgressLine.svelte');
  assert.match(line, /bc-progress-line--count/);
  assert.match(line, /bc-progress-line--left/);
  assert.match(line, /bc-sr-only/);
  for (const f of ['FirstLaunchServer', 'FirstLaunchDivelogs', 'FirstLaunchServerCreate']) assert.match(read(`components/${f}.svelte`), /<ProgressLine /, f);
});
