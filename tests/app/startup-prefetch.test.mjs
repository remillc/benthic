// Start-up (27 November 2026): Android reads the logbook as soon as the app starts, with the settings of the last start;
// its read is used only when the web layer gives the core exactly the same settings and account.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const plugin = read('plugins/benthic-core/android/src/main/java/app/benthicdivelog/core/BenthicCorePlugin.kt');

test('the web layer keeps, at each start, the settings it gives the core, in order', () => {
  const settings = read('app/src/lib/settings.svelte.js');
  assert.match(settings, /const START_PREFS_KEY = 'bc\.startCorePrefs';/);
  assert.match(settings, /const startChanges = \[\{ \.\.\.storedCore, displayDefaultTankInfos: false \}\];\s*send\('Restoring the settings of this device', \(\) => BenthicCore\.setPrefs\(\{ changes: startChanges\[0\] \}\)\);/);
  assert.match(settings, /startChanges\.push\(\{ diveComputerList: computers \}\);/);
  assert.match(settings, /deviceStore\.setItem\(START_PREFS_KEY, JSON\.stringify\(startChanges\)\);/);
});

test('Android reads ahead right after the core starts, only with a remembered account and kept settings', () => {
  assert.match(plugin, /NativeCore\.setSyncListener \{[^}]*\}\s*prefetchLogbook\(\)/);
  assert.match(plugin, /store\.getString\("bc\.repositoryAccount", null\) == null && store\.getString\("bc\.cloudAccount", null\) == null\) return@execute/);
  assert.match(plugin, /for \(changes in prefs\) NativeCore\.setPrefs\(changes\)\s*val account = configureAccount\(\)/);
});

test('the read ahead is used only with the same settings and account, else the logbook is read as before', () => {
  assert.match(plugin, /val same = early\.prefs == prefsSinceStart && early\.account == configureAccount\(\)\.toString\(\)/);
  assert.match(plugin, /return if \(same\) early\.json else null/);
  assert.match(plugin, /val early = if \(cached\) takePrefetch\(\) else null\s*val json = if \(early != null\) \{\s*early\s*\} else if \(cached\) \{\s*NativeCore\.cloudListCachedDives\(\)/);
  assert.match(plugin, /if \(startRead && prefsSinceStart\.size < 50\) prefsSinceStart \+= JSObject\(changes\.toString\(\)\)\.toString\(\)/);
});
