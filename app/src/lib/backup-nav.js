// @ts-check
// Where the backup and restore screens open from the rest of the app (task 2026-11-19-290): the dive's menu,
// « Versions de cette plongée ». Kept apart from lib/navigation.svelte.js, which the logbook state already imports.
import { backup } from './backup.svelte.js';
import { keyOfDate } from './backup-history.js';
import { layout } from './layout.svelte.js';
import { navigation, openOver } from './navigation.svelte.js';

/**
 * Opens the versions of one dive. The desktop shows them in the dialog's detail pane, a tablet in the page's, the phone in
 * a page of its own.
 * @param {string} date the dive's local start time as the core gives it, `2026-12-01T10:00:00`
 */
export function openDiveVersions(date) {
  const key = keyOfDate(date);
  if (!key) return;
  if (layout.desktop) {
    backup.choice = { kind: 'dive', key };
    navigation.backupOpen = true;
  } else if (layout.split) {
    backup.choice = { kind: 'dive', key };
    openOver('/account/backup');
  } else {
    openOver(`/account/backup/dive/${key.replace(' ', 'T')}`);
  }
}
