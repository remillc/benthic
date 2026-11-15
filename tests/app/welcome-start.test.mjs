// iOS first launch (tasks 2026-11-15-205 and -206): the short texts of Android, nothing obsolete left.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const i18nDir = new URL('../../app/src/i18n/', import.meta.url);
const source = readFileSync(new URL('../../app/src/pages/WelcomeStart.svelte', import.meta.url), 'utf8');
const ios = source.slice(source.indexOf('{:else}'), source.indexOf('</Page>'));
const OBSOLETE = ['intro', 'existing', 'existingText', 'create', 'createText', 'noAccountText'];

test('iOS first launch uses the short keys and the tablet note on iPad', () => {
  for (const key of ['headline', 'existingShort', 'existingNote', 'createShort', 'createNote', 'noAccount', 'ownGit'])
    assert.ok(ios.includes(`'welcome.${key}'`), `iOS branch uses welcome.${key}`);
  assert.ok(ios.includes("layout.phone ? 'welcome.noAccountNotePhone' : 'welcome.noAccountNoteTablet'"));
  for (const key of OBSOLETE) assert.ok(!source.includes(`'welcome.${key}'`), `welcome.${key} is not used`);
});

test('removed welcome keys are gone from every language file', () => {
  for (const f of readdirSync(i18nDir).filter((n) => n.endsWith('.json'))) {
    const welcome = JSON.parse(readFileSync(new URL(f, i18nDir), 'utf8')).welcome ?? {};
    for (const key of OBSOLETE) assert.ok(!(key in welcome), `${f} still has welcome.${key}`);
  }
});

test('the water gradient ends in --od-water-bottom and the line is --od-trace', () => {
  assert.match(source, /\.od-welcome-start--water-bottom \{\s*stop-color: var\(--od-water-bottom\);/);
  assert.match(source, /\.od-welcome-start--water-top \{\s*stop-color: var\(--od-water-top\);/);
  assert.match(source, /\.od-welcome-start--trace \{[^}]*stroke: var\(--od-trace\);/);
  assert.doesNotMatch(source, /--od-water-bottom:|#1F2124/i);
});

test('tablet first launch: a larger brand row (logo 96 dp, « OpenDives » 48 sp), the phone unchanged', () => {
  const tablet = source.slice(source.indexOf('@media (min-width: 768px)'));
  assert.match(tablet, /\.od-welcome-start--brand \{\s*gap: 20px;\s*font-size: 48px;\s*line-height: 56px;\s*letter-spacing: -0\.5px;/);
  assert.match(tablet, /\.od-welcome-start--logo \{\s*width: 96px;\s*height: 96px;/);
  const phone = source.slice(0, source.indexOf('@media (min-width: 768px)'));
  assert.match(phone, /\.od-welcome-start--brand \{[^}]*gap: 10px;[^}]*font-size: 20px;/);
  assert.match(source, /src="logo-light\.svg" alt="" width="40" height="40"/);
});

test('tablet first launch: the profile stays off the screen edges in both orientations (task 211)', () => {
  const tablet = source.slice(source.indexOf('@media (min-width: 768px)'));
  const landscape = tablet.slice(tablet.indexOf('@media (orientation: landscape)'), tablet.indexOf('@media (orientation: portrait)'));
  const portrait = tablet.slice(tablet.indexOf('@media (orientation: portrait)'));
  assert.match(landscape, /wide-profile\) \{[^}]*width: calc\(100% - 56px\);[^}]*margin: 0 0 56px 56px;/);
  assert.match(landscape, /\.od-welcome-start--head \{[^}]*margin: 34px 0 0 56px;/);
  assert.match(portrait, /wide-profile\) \{[^}]*max-width: 520px;[^}]*margin: 32px auto 0;/);
  assert.match(portrait, /\.od-welcome-start--head \{[^}]*max-width: 520px;/);
});
