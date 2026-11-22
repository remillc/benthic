// @ts-check
// Several logbooks on the desktop (task 2026-11-15-173): the pure logic behind the start screen,
// the logbook selector and the new-logbook dialog. What the main process keeps (the recent
// logbooks, desktop/logbooks.cjs) arrives here as plain objects; nothing in this file touches
// Electron or the page, so tests/app/desktop-logbooks.test.mjs runs it as it is.

/**
 * A logbook as the main process describes it.
 * @typedef {{ id: string, kind: 'main'|'file'|'cloud'|'git', name: string, location: string, provider?: string, branch?: string, openedAt?: number, open?: boolean }} LogbookEntry
 */

/** The cloud services with a row in the dialog, in order (iCloud Drive: macOS only, see cloudRows; WebDAV has no browser sign-in). */
export const CLOUD_PROVIDERS = /** @type {const} */ (['googleDrive', 'oneDrive', 'dropbox', 'webdav']);

/**
 * The service rows of step 2 of the cloud path: Google Drive, OneDrive, Dropbox, then « iCloud Drive » on macOS only
 * (Apple gives other apps no access to it elsewhere; there is no API path for it yet, so its row stays disabled),
 * then « WebDAV ou Nextcloud ».
 * @param {boolean} mac
 * @returns {string[]}
 */
export function cloudRows(mac) {
  return mac ? ['googleDrive', 'oneDrive', 'dropbox', 'iCloudDrive', 'webdav'] : [...CLOUD_PROVIDERS];
}

/**
 * What the main process says about a service: nothing secret, only whether it can be used, whether the diver
 * is signed in, and as whom.
 * @typedef {{ provider: string, available: boolean, connected: boolean, account: string }} CloudStatus
 */

/**
 * Whether a service's row can be chosen: its keys are in this build (no client id: « Pas encore disponible »,
 * the row is disabled), and for iCloud Drive never, for now.
 * @param {CloudStatus|undefined} status
 */
export function providerAvailable(status) {
  return !!status && status.available;
}

/** @typedef {'choice'|'provider'|'connect'|'git'} NewLogbookStep */

/**
 * « Étape 2 sur 3 »: the cloud path has three steps (name and place, service, connection), the others two.
 * @param {NewLogbookStep} step
 * @param {Where} where the choice of step 1
 * @returns {{ n: number, total: number }}
 */
export function stepCount(step, where) {
  const total = where === 'cloud' ? 3 : 2;
  const n = { choice: 1, provider: 2, connect: 3, git: 2 }[step];
  return { n, total };
}

/**
 * The state of step 3 for a service with a browser sign-in: not signed in yet, the browser is open and we wait, or
 * signed in (also when OpenDives already had access to the service). A switch of account waits like a first sign-in.
 * @param {{ connected: boolean, signingIn: boolean }} state
 * @returns {'notConnected'|'waiting'|'connected'}
 */
export function connectionState({ connected, signingIn }) {
  if (signingIn) return 'waiting';
  return connected ? 'connected' : 'notConnected';
}

/**
 * The text key of the error of a failed sign-in or a failed cloud creation. For WebDAV the unreachable server
 * is not « le service ».
 * @param {{ code?: string, message?: string }} error
 * @param {string} [provider]
 */
export function cloudErrorKey(error, provider = '') {
  const known = ['SIGN_IN_CANCELLED', 'NOT_SIGNED_IN', 'NOT_AVAILABLE', 'SIGN_IN_DENIED', 'SIGN_IN_TIMEOUT', 'SIGN_IN_EXPIRED', 'STATE_MISMATCH', 'PORT_BUSY', 'CREDENTIALS_NOT_SAVED', 'DENIED', 'NETWORK', 'EXISTS', 'BAD_ADDRESS', 'INSECURE_ADDRESS', 'BAD_CREDENTIALS', 'SERVER'];
  const code = error?.code && known.includes(error.code) ? error.code : String(error?.message ?? '').split(/[:\s]/)[0];
  if (code === 'NETWORK' && provider === 'webdav') return 'desktopCloud.errors.NETWORK_SERVER';
  return `desktopCloud.errors.${known.includes(code) ? code : 'other'}`;
}

/**
 * The field of the WebDAV step an error belongs to, so that it shows under that field: a bad, insecure or
 * unreachable address under « Adresse du serveur », a refused account under « Mot de passe », the rest at the bottom.
 * @param {{ code?: string, message?: string }} error
 * @returns {'server'|'password'|''}
 */
export function webdavErrorField(error) {
  const code = String(error?.code || String(error?.message ?? '').split(/[:\s]/)[0]);
  if (code === 'BAD_ADDRESS' || code === 'INSECURE_ADDRESS' || code === 'NETWORK') return 'server';
  if (code === 'BAD_CREDENTIALS') return 'password';
  return '';
}

/**
 * The live check of « Adresse du serveur »: https, or http for this computer only. Empty is not an error (the button
 * says it). A bare host (cloud.example.org) is fine: https is assumed, as the main process does.
 * @param {string} server
 * @returns {'' | 'address' | 'insecure'}
 */
export function webdavServerError(server) {
  const text = String(server ?? '').trim();
  if (!text) return '';
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return 'address';
  }
  if (url.username || url.password || !url.hostname || /\s/.test(text)) return 'address';
  if (url.protocol === 'https:') return '';
  return url.protocol === 'http:' ? (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ? '' : 'insecure') : 'address';
}

/**
 * The server, user name and password of the WebDAV step are all filled in (the connection itself is checked on « Créer le carnet »).
 * @param {{ server: string, username: string, password: string }} form
 */
export function webdavFormReady(form) {
  return !!form.server.trim() && webdavServerError(form.server) === '' && !!form.username.trim() && form.password !== '';
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
 * the cloud has the service list, the git repository its form.
 * @param {Where} where
 * @returns {'provider'|'git'|null}
 */
export function secondStep(where) {
  return where === 'cloud' ? 'provider' : where === 'git' ? 'git' : null;
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
 * The last cloud step is ready when a service with a browser sign-in is chosen and signed in, or when the WebDAV
 * server, user name and password are filled in.
 * @param {{ provider: string, connected: boolean, webdav?: { server: string, username: string, password: string } }} state
 */
export function cloudFormReady(state) {
  if (state.provider === 'webdav') return !!state.webdav && webdavFormReady(state.webdav);
  return ['googleDrive', 'oneDrive', 'dropbox'].includes(state.provider) && state.connected;
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
    ? { newLogbook: '⇧⌘N', openLogbook: '⌘O', closeLogbook: '⌘W' }
    : { newLogbook: 'Ctrl+Maj+N', openLogbook: 'Ctrl+O', closeLogbook: 'Ctrl+W' };
}

/**
 * The logbook command a key press means in a window, or ''. Windows and Linux only (the Mac's menu bar
 * sends these as menu commands); Ctrl+W on a window without a logbook closes the window, which Electron does itself.
 * @param {{ key: string, ctrlKey: boolean, shiftKey: boolean, altKey: boolean, metaKey: boolean }} e
 * @returns {'newLogbook'|'openLogbook'|'closeLogbook'|''}
 */
export function logbookShortcut(e) {
  if (!e.ctrlKey || e.altKey || e.metaKey) return '';
  const key = e.key.toLowerCase();
  if (key === 'n' && e.shiftKey) return 'newLogbook';
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
  if (entry.provider) return { key: 'whereCloud', where: `${t(`desktopLogbooks.source.${entry.provider}`)}, ${t('desktopLogbooks.new.folderLabel').toLowerCase()} ${folder || 'OpenDives'}` };
  return { key: 'whereComputer', where: folder };
}
