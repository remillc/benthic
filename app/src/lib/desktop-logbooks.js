// @ts-check
// Several logbooks on the desktop (task 2026-11-15-173): the pure logic behind the start screen,
// the logbook selector and the new-logbook dialog. What the main process keeps (the recent
// logbooks, desktop/logbooks.cjs) arrives here as plain objects; nothing in this file touches
// Electron or the page, so tests/app/desktop-logbooks.test.mjs runs it as it is.

/**
 * A logbook as the main process describes it.
 * @typedef {{ id: string, kind: 'main'|'file'|'cloud'|'git', name: string, location: string, provider?: string, branch?: string, openedAt?: number, open?: boolean }} LogbookEntry
 */

/** The cloud services, in the order the dialog lists them (iCloud Drive and WebDAV have no API path for now). */
export const CLOUD_PROVIDERS = /** @type {const} */ (['googleDrive', 'oneDrive', 'dropbox']);

/**
 * What the main process says about a service: nothing secret, only whether it can be used, whether the diver
 * is signed in, and as whom.
 * @typedef {{ provider: string, available: boolean, connected: boolean, account: string }} CloudStatus
 */

/**
 * What the end of a service's row says: « Pas encore disponible » (no client id in this build, the row is
 * disabled), « Se connecter », « Connexion dans le navigateur… » while the browser is open, or
 * « Connecté · diver@example.org ».
 * @param {CloudStatus|undefined} status
 * @param {boolean} signingIn
 * @param {(key: string, params?: Record<string, any>) => string} t
 * @returns {{ state: 'unavailable'|'signedOut'|'signingIn'|'connected', text: string }}
 */
export function providerRow(status, signingIn, t) {
  if (!status || !status.available) return { state: 'unavailable', text: t('desktopLogbooks.new.notAvailable') };
  if (signingIn) return { state: 'signingIn', text: t('desktopCloud.row.signingIn') };
  if (!status.connected) return { state: 'signedOut', text: t('desktopCloud.row.notConnected') };
  return { state: 'connected', text: status.account ? t('desktopCloud.row.connected', { account: status.account }) : t('desktopCloud.row.connectedNoAccount') };
}

/**
 * The folder a service starts with: Google Drive gets a folder OpenDives creates; the others use the app's
 * own folder, where a subfolder is optional.
 * @param {string} provider
 */
export function defaultCloudFolder(provider) {
  return provider === 'googleDrive' ? 'OpenDives' : '';
}

/**
 * Whether a folder path can be used on the services: segments separated by « / », none empty or « . » or « .. »,
 * no control character or one of < > : " | ? * (the main process checks the same). Empty is fine (the service's root).
 * @param {string} folder
 * @returns {'' | 'folder'}
 */
export function cloudFolderError(folder) {
  const segments = String(folder ?? '')
    .split(/[\\/]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const bad = (/** @type {string} */ x) => x === '.' || x === '..' || x.length > 100 || [...x].some((c) => c.charCodeAt(0) < 32 || '<>:"|?*'.includes(c));
  return segments.length > 6 || segments.some(bad) ? 'folder' : '';
}

/**
 * The text key of the error of a failed sign-in or a failed cloud creation.
 * @param {{ code?: string, message?: string }} error
 */
export function cloudErrorKey(error) {
  const known = ['SIGN_IN_CANCELLED', 'NOT_SIGNED_IN', 'NOT_AVAILABLE', 'SIGN_IN_DENIED', 'SIGN_IN_TIMEOUT', 'SIGN_IN_EXPIRED', 'STATE_MISMATCH', 'PORT_BUSY', 'CREDENTIALS_NOT_SAVED', 'DENIED', 'NETWORK', 'EXISTS'];
  const code = error?.code && known.includes(error.code) ? error.code : String(error?.message ?? '').split(/[:\s]/)[0];
  return `desktopCloud.errors.${known.includes(code) ? code : 'other'}`;
}

/** « Ouvrir au démarrage »: the logbooks open at the last quit, or the start screen. */
export const STARTUP_MODES = /** @type {const} */ (['last', 'ask']);

/**
 * What the icon of a logbook says: this computer, a file, a personal cloud, a git repository.
 * @param {LogbookEntry} entry
 * @returns {'device'|'file'|'cloud'|'git'}
 */
export function sourceKind(entry) {
  if (entry.kind === 'main') return 'device';
  if (entry.kind === 'git') return 'git';
  return entry.provider ? 'cloud' : 'file';
}

/** @param {string} path */
function folderOf(path) {
  const parts = path.replace(/[\\/]+$/, '').split(/[\\/]/);
  parts.pop();
  return parts.pop() ?? '';
}

/**
 * The second line of a logbook's row, before the time: « Google Drive », « Dépôt git · github.com/club/carnet »,
 * « Documents » (the folder of a file), « Cet ordinateur ».
 * @param {LogbookEntry} entry
 * @param {(key: string) => string} t
 */
export function sourceText(entry, t) {
  if (entry.kind === 'main') return t('desktopLogbooks.source.device');
  if (entry.kind === 'git') return `${t('desktopLogbooks.source.git')} · ${entry.location.replace(/^[a-z]+:\/\//i, '').replace(/\.git$/i, '')}`;
  if (entry.provider) return t(`desktopLogbooks.source.${entry.provider}`);
  return folderOf(entry.location) || t('desktopLogbooks.source.file');
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * When a logbook was last open, in words: « ouvert maintenant », « fermé il y a 2 min », « fermé il y a 3 h »,
 * then « ouvert le 2 nov. » from a day on.
 * @param {LogbookEntry} entry
 * @param {number} now
 * @param {(key: string, params?: Record<string, any>) => string} t
 * @param {(time: number) => string} formatDate a short date, « 2 nov. »
 */
export function whenText(entry, now, t, formatDate) {
  if (entry.open) return t('desktopLogbooks.when.openNow');
  const age = Math.max(0, now - (entry.openedAt ?? 0));
  if (!entry.openedAt) return '';
  if (age < MINUTE) return t('desktopLogbooks.when.closedNow');
  if (age < HOUR) return t('desktopLogbooks.when.closedMinutes', { n: Math.floor(age / MINUTE) });
  if (age < DAY) return t('desktopLogbooks.when.closedHours', { n: Math.floor(age / HOUR) });
  return t('desktopLogbooks.when.openedOn', { date: formatDate(entry.openedAt) });
}

/**
 * The name shown for a logbook: the main one has no name of its own.
 * @param {LogbookEntry} entry
 * @param {(key: string) => string} t
 */
export function displayName(entry, t) {
  return entry.name || t('desktopLogbooks.mainName');
}

/**
 * The selector's pill: « Carnet · plongees.ssrf ».
 * @param {LogbookEntry|null} entry
 * @param {(key: string) => string} t
 */
export function selectorLabel(entry, t) {
  return entry ? { title: t('desktopLogbooks.selector.label'), name: displayName(entry, t) } : { title: t('desktopLogbooks.selector.label'), name: '' };
}

/** @param {string} name */
export function validLogbookName(name) {
  const trimmed = String(name ?? '').trim();
  return trimmed.length > 0 && trimmed.length <= 100;
}

/**
 * The file name a new logbook gets (as desktop/logbooks.cjs does), for the help line of the cloud step.
 * @param {string} name
 */
export function fileNameFor(name) {
  const base = String(name ?? '')
    .trim()
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/, '')
    .slice(0, 120);
  return `${base.replace(/\.ssrf$/i, '') || 'carnet'}.ssrf`;
}

/** @typedef {'computer'|'cloud'|'git'} Where */

/**
 * The step after step 1: « Sur cet ordinateur » goes straight to the system's save dialog (no second step),
 * the two others have one.
 * @param {Where} where
 * @returns {'cloud'|'git'|null}
 */
export function secondStep(where) {
  return where === 'cloud' ? 'cloud' : where === 'git' ? 'git' : null;
}

/**
 * @param {string} url
 * @returns {'' | 'url'} '' when the address can be used; empty is not an error (the button says it)
 */
export function gitUrlError(url) {
  const text = String(url ?? '').trim();
  if (!text) return '';
  return /^https:\/\/[^\s/]+\/\S+/i.test(text) ? '' : 'url';
}

/**
 * The owner in a repository address of the GitHub or GitLab kind (https://host/owner/repo.git), '' when
 * the address has none.
 * @param {string} url
 */
export function gitUserFromUrl(url) {
  const match = /^https:\/\/[^\s/]+\/([^\s/]+)\/[^\s/]+/i.exec(String(url ?? '').trim());
  return match && gitUserError(match[1]) === '' ? match[1] : '';
}

/**
 * @param {string} name the git user name; empty is not an error (the field is optional)
 * @returns {'' | 'username'}
 */
export function gitUserError(name) {
  const text = String(name ?? '').trim();
  if (!text) return '';
  return text.length <= 100 && /^[A-Za-z0-9][A-Za-z0-9._@+-]*$/.test(text) ? '' : 'username';
}

/**
 * @param {{ url: string, branch: string, token: string, username?: string }} form
 */
export function gitFormReady(form) {
  return (
    !!form.url.trim() &&
    gitUrlError(form.url) === '' &&
    gitUserError(form.username ?? '') === '' &&
    !!form.branch.trim() &&
    !/\s/.test(form.branch.trim()) &&
    !!form.token.trim()
  );
}

/**
 * The cloud step is ready when a service is chosen, available and signed in, and its folder is valid.
 * @param {{ provider: string, connected: boolean, folder: string }} state
 */
export function cloudFormReady(state) {
  return /** @type {readonly string[]} */ (CLOUD_PROVIDERS).includes(state.provider) && state.connected && cloudFolderError(state.folder) === '';
}

/**
 * Where the page to create an access token is, for the host of the repository.
 * @param {string} url
 */
export function tokenPageUrl(url) {
  let host = '';
  try {
    host = new URL(String(url).trim()).hostname.toLowerCase();
  } catch {
    // No address typed yet.
  }
  if (host === 'gitlab.com') return 'https://gitlab.com/-/user_settings/personal_access_tokens';
  if (host === 'codeberg.org') return 'https://codeberg.org/user/settings/applications';
  return 'https://github.com/settings/personal-access-tokens/new';
}

/**
 * The text key of the error of a failed creation, for the dialog.
 * @param {{ code?: string, message?: string }} error
 */
export function creationErrorKey(error) {
  const known = ['BAD_ADDRESS', 'BAD_CREDENTIALS', 'DENIED', 'BAD_BRANCH', 'NO_LOG', 'CREATE_FAILED', 'NOT_EMPTY', 'NETWORK', 'EXISTS'];
  const code = error?.code && known.includes(error.code) ? error.code : String(error?.message ?? '').split(':')[0].trim();
  return `desktopLogbooks.new.errors.${known.includes(code) ? code : 'other'}`;
}

/**
 * The keys of the shortcuts the selector shows, by system.
 * @param {boolean} mac
 */
export function selectorShortcuts(mac) {
  return mac
    ? { newLogbook: '⇧⌘N', openLogbook: '⌘O', saveCopy: '⇧⌘S', closeLogbook: '⌘W' }
    : { newLogbook: 'Ctrl+Maj+N', openLogbook: 'Ctrl+O', saveCopy: 'Ctrl+Maj+S', closeLogbook: 'Ctrl+W' };
}

/**
 * The logbook command a key press means in a window, or ''. Windows and Linux only (the Mac's menu bar
 * sends these as menu commands); Ctrl+W on a window without a logbook closes the window, which Electron does itself.
 * @param {{ key: string, ctrlKey: boolean, shiftKey: boolean, altKey: boolean, metaKey: boolean }} e
 * @returns {'newLogbook'|'openLogbook'|'saveCopy'|'closeLogbook'|''}
 */
export function logbookShortcut(e) {
  if (!e.ctrlKey || e.altKey || e.metaKey) return '';
  const key = e.key.toLowerCase();
  if (key === 'n' && e.shiftKey) return 'newLogbook';
  if (key === 's' && e.shiftKey) return 'saveCopy';
  if (key === 'o' && !e.shiftKey) return 'openLogbook';
  if (key === 'w' && !e.shiftKey) return 'closeLogbook';
  return '';
}

/**
 * Whether a dropped file can be opened as a logbook.
 * @param {string} name
 */
export function isLogbookFileName(name) {
  return /\.(ssrf|xml)$/i.test(String(name ?? ''));
}

/**
 * « Where it is kept », for the « Votre carnet est prêt » screen: the service, the folder or the repository.
 * @param {LogbookEntry} entry
 * @param {(key: string) => string} t
 * @returns {{ key: 'whereComputer'|'whereCloud'|'whereGit', where: string }}
 */
export function keptIn(entry, t) {
  if (entry.kind === 'git') return { key: 'whereGit', where: entry.location.replace(/^[a-z]+:\/\//i, '').replace(/\.git$/i, '') };
  const folder = folderOf(entry.location);
  if (entry.provider) return { key: 'whereCloud', where: `${t(`desktopLogbooks.source.${entry.provider}`)}, ${t('desktopLogbooks.new.folderLabel').toLowerCase()} ${folder}` };
  return { key: 'whereComputer', where: folder };
}
