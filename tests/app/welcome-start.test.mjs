// iOS first launch (tasks 2026-11-15-205 and -206): the short texts of Android, nothing obsolete left.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const i18nDir = new URL('../../app/src/i18n/', import.meta.url);
const source = readFileSync(new URL('../../app/src/pages/WelcomeStart.svelte', import.meta.url), 'utf8');
const ios = source.slice(source.lastIndexOf('{:else}', source.indexOf('</Page>')), source.indexOf('</Page>'));
const OBSOLETE = ['intro', 'existing', 'existingText', 'create', 'createText', 'noAccountText'];

test('iOS first launch uses the short keys and the tablet note on iPad', () => {
  for (const key of ['headline', 'existingShort', 'existingNote', 'createShort', 'createNote', 'noAccount', 'ownGit'])
    assert.ok(ios.includes(`'welcome.${key}'`), `iOS branch uses welcome.${key}`);
  assert.ok(ios.includes('welcome.noAccountNote${deviceSuffix(deviceKind())}'));
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

// Tasks 210 and 211 (the larger brand row and the profile off the screen edges) and the tablet half of tasks
// 225 and 229 (the pill badge after the name) described the old tablet head. Task 237 replaces that head with the
// blue panel (components/FirstLaunchPanel.svelte): the logo is 96 dp and « OpenDives » 48 sp as in task 210, the
// badge is the panel's own (12 sp, task 237); the profile is the animated one. The assertions moved to
// tests/app/tablet-first-launch.test.mjs; what stays here is the phone and iOS side.
test('the tablet head of tasks 210 and 211 is gone, the phone and iOS keep what they had', () => {
  assert.doesNotMatch(source, /od-welcome-start--head["\s]|od-welcome-start--wide-profile|od-welcome-start--brand/);
  assert.doesNotMatch(source, /DecorativeProfile/);
  // The phone's low-window rule keeps its tighter gap.
  assert.match(source, /@media \(max-width: 767\.98px\) and \(max-height: 820px\) \{\s*\.od-welcome-start--buttons \{\s*gap: 8px;/);
});

test('tasks 225 and 229: iOS keeps the pill badge after the name, read once as « OpenDives, alpha »', () => {
  const fr = JSON.parse(readFileSync(new URL('../../app/src/i18n/fr.json', import.meta.url), 'utf8'));
  const en = JSON.parse(readFileSync(new URL('../../app/src/i18n/en.json', import.meta.url), 'utf8'));
  assert.equal(fr.welcome.alpha, 'Alpha');
  assert.equal(en.welcome.alpha, 'Alpha');
  assert.equal(fr.welcome.brandAlpha, 'OpenDives, alpha');
  assert.match(ios, /<h1 aria-label=\{t\('welcome\.brandAlpha'\)\}>[\s\S]*od-welcome-start--alpha/);
  assert.match(source, /\.od-welcome-start--alpha \{[^}]*margin-left: 8px;[^}]*padding: 3px 10px;[^}]*font-size: 14px;[^}]*font-weight: 700;[^}]*letter-spacing: 0\.8px;[^}]*text-transform: uppercase;/);
  const theme = readFileSync(new URL('../../app/src/theme.css', import.meta.url), 'utf8');
  assert.match(theme, /--od-alpha-badge: #DCE7F3;\s*--od-on-alpha-badge: #114477;/);
});
