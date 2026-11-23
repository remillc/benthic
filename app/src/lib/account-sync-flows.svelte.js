// @ts-check
// The screens of the account data sync, wired (inbox task 2026-11-23-338, docs/account-sync.md, « Screens »): which screen is
// open (`accountFlow`, read by components/AccountSyncHost.svelte) and what each button does with the engine
// (lib/account-sync.svelte.js) and the key functions (lib/account-keys.js, lib/secret-box.js). Benthic+ only.
//
// The pairing files, the recovery key and the account key reach the server as commits on the `benthic` branch
// (`commitAccountKeyFiles`); the keys themselves are held by the box (`adoptAccountKey`), and made the device's own only after the
// local sealed items are sealed again (`persistAccountKey`), so that a crash in between loses nothing.
import { t } from './i18n.js';
import { showSnackbar } from './snackbar.js';
import { deviceStore } from './device-store.js';
import { accountDataDeps, loadProfile } from './profile.svelte.js';
import { createRecoveryKey, recoverAccountKey, startOver } from './account-keys.js';
import { isKeyPath } from './account-sync.js';
import { adoptAndReseal as adopt, approveRequest, cancelRequest, checkAnswer, declineRequest, finishPairing, pendingRequests, requestAccess } from './account-pairing.js';
import { currentDeviceKind, platformOf } from './device-name.js';
import { showTwoDeviceNotice } from './two-device-notice.js';
import { accountLock } from './locked-data.svelte.js';
import {
  accountSync,
  analyseJoin,
  applyJoin,
  commitAccountKeyFiles,
  commitPairingFiles,
  eraseAccountOrphans,
  dismissAccountConflicts,
  forgetLastAccount,
  listAccountPaths,
  fetchAccountKeys,
  readAccountKeys,
  syncAccountNow,
} from './account-sync.svelte.js';

/** @typedef {'unlock'|'requestWait'|'requestEnded'|'approve'|'paired'|'joined'|'offer'|'show'|'enter'|'startOver'|'join'|'different'|'orphans'} AccountScreen */

/** The screen open now ('' when none) and what it shows. */
export const accountFlow = $state({
  /** @type {''|AccountScreen} */
  screen: '',
  /** The 6-digit code of the request in view (the new device's own, or the one the paired device is asked to approve). */
  code: '',
  /** When the new device's request expires, ms since 1970. */
  expiresAt: 0,
  /** The request the paired device is asked about. */
  requestId: '',
  /** The requests of new devices waiting for an answer, as the paired device read them. @type {{ id: string, deviceName: string, code: string, expiresAt: number }[]} */
  requests: [],
  /** Why the new device's request ended: 'declined', 'expired' or 'failed'. */
  endReason: '',
  busy: false,
  /** '' or 'wrong' (the recovery key was refused). */
  error: '',
  /** The recovery key just made, shown once. */
  recoveryKey: '',
  /** The device asking for access (the paired device's question). */
  deviceName: '',
  /** @type {{ recognised: number, added: number, matches: import('./account-sync-screens.js').AmbiguousMatch[] }} */
  join: { recognised: 0, added: 0, matches: [] },
  /** The two lines of the confirmation after the join (« Appareil jumelé »). @type {string[]} */
  joinedLines: [],
});

/** Asked once per run of the app; a later manual sync or a button asks again. */
const asked = { unlock: false, join: false, different: false, orphans: false };
/** The recovery key's « Plus tard »: asked again after a week. */
const RECOVERY_LATER_KEY = 'bc.accountRecoveryLater';
const RECOVERY_PAUSE_MS = 7 * 24 * 60 * 60 * 1000;
/** How often a screen that waits for the other device looks at the server. */
const WATCH_MS = 3000;

/** @type {ReturnType<typeof setInterval>|null} */
let watcher = null;
/** The request this device made and waits on. @type {import('./account-pairing.js').AccessRequest|null} */
let pairing = null;

const stopWatching = () => {
  if (watcher !== null) clearInterval(watcher);
  watcher = null;
};

/** @param {string} key */
const say = (key) => showSnackbar(t(key));

/** @returns {Promise<{ key: string, kid: string }|null>} the account key this device holds, or null */
async function heldAccountKey() {
  const { box } = accountDataDeps();
  const kid = box.getAccountKid();
  const key = await box.accountKeyBase64();
  return kid && key ? { key, kid } : null;
}

export function closeScreen() {
  stopWatching();
  pairing = null;
  accountFlow.screen = '';
  accountFlow.busy = false;
  accountFlow.error = '';
  accountFlow.recoveryKey = '';
  accountFlow.code = '';
  accountFlow.requestId = '';
  accountFlow.endReason = '';
}

/** @param {AccountScreen} screen */
const open = (screen) => {
  stopWatching();
  accountFlow.busy = false;
  accountFlow.error = '';
  accountFlow.screen = screen;
};

// ---------------------------------------------------------------------------------------------------------------
// The account key arrives on this device (pairing or recovery key)

/**
 * This device now holds the account key: the local sealed files are sealed again with it (they go up at the next run), then it
 * becomes the device's own key.
 * @param {{ key: string, kid: string }} account
 */
async function adoptAndReseal(account) {
  await adopt(account, accountDataDeps());
  accountSync.keyMissing = false;
  accountSync.locked = [];
}

/**
 * After the key arrived: « Appareil jumelé » at once (the key is held, whatever the server does next), then the sealed items
 * are sent sealed with it and read again in the background. When the sync finds data on both sides the join follows once the
 * confirmation is closed (components/AccountSyncHost.svelte).
 */
async function afterUnlocked() {
  open('paired');
  try {
    await syncAccountNow();
    await loadProfile();
  } catch (e) {
    console.error('Syncing after the key arrived', e);
  }
}

/** @param {unknown} e */
const codeOf = (e) => String(/** @type {any} */ (e)?.message ?? e);

// ---------------------------------------------------------------------------------------------------------------
// A paired device approves the requests of new devices (to-do #183)

/** What a pairing step needs of the engine: the server's key files, and a commit of key files only (no data is touched). */
const pairingDeps = () => ({ fetchKeys: fetchAccountKeys, commitKeyFiles: commitPairingFiles });

/** Requests the diver closed with Back or « Plus tard »: not shown again by themselves in this run of the app. @type {Set<string>} */
const dismissed = new Set();

/** How often a paired device looks for requests while the app is open and in front. */
export const REQUEST_POLL_MS = 15000;

/** Keeps the requests the paired device knows of, the count on the account sheet's row, and the flag the sheet reads. */
function setRequests(list) {
  accountFlow.requests = list;
  accountLock.requests = list.length;
}

/**
 * Looks for requests: on the server (`network`) or in the working copy the last run left (no network). Never throws.
 * @param {{ network: boolean }} how
 */
export async function refreshRequests({ network }) {
  try {
    const keys = network ? await fetchAccountKeys() : await readAccountKeys();
    setRequests(await pendingRequests(keys));
  } catch (e) {
    if (codeOf(e) !== 'UNREACHABLE' && codeOf(e) !== 'NO_WORKING_COPY') console.warn('Looking for access requests', e);
  }
}

/**
 * Starts looking: now, every `REQUEST_POLL_MS` while the page is visible, when the app comes back to the front, and after each
 * sync run (`afterRun`, without the network). Returns the function that stops it.
 * @returns {() => void}
 */
export function watchRequests() {
  const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';
  const look = () => {
    if (visible()) void refreshRequests({ network: true });
  };
  look();
  const timer = setInterval(look, REQUEST_POLL_MS);
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', look);
  return () => {
    clearInterval(timer);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', look);
    setRequests([]);
  };
}

/** The request to show now: the newest one the diver has not put aside. */
export const requestDue = () => accountFlow.requests.find((r) => !dismissed.has(r.id)) ?? null;

/** @param {{ id: string, deviceName: string, code: string }} request */
export function askApproval(request) {
  accountFlow.requestId = request.id;
  accountFlow.deviceName = request.deviceName;
  accountFlow.code = request.code;
  open('approve');
}

/** The account sheet's row: the request waiting, or a look at the server and, if there is none, what to do. */
export async function openRequests() {
  dismissed.clear();
  if (!requestDue()) await refreshRequests({ network: true });
  const next = requestDue();
  if (next) askApproval(next);
  else say('accountSync.pair.none');
}

/** « Plus tard » (Back, the scrim): the request stays on the server until it expires; it is not asked again by itself. */
export function putAsideRequest() {
  if (accountFlow.requestId) dismissed.add(accountFlow.requestId);
  closeScreen();
}

/** @param {string} id */
const forget = (id) => setRequests(accountFlow.requests.filter((r) => r.id !== id));

/** « Autoriser »: only now is the key wrapped and anything committed. */
export async function approveNow() {
  const account = await heldAccountKey();
  const id = accountFlow.requestId;
  if (!account || !id) return closeScreen();
  accountFlow.busy = true;
  try {
    await approveRequest(id, account, pairingDeps());
    forget(id);
    closeScreen();
    say('accountSync.pair.approved');
  } catch (e) {
    console.error('Approving the access request', e);
    forget(id);
    closeScreen();
    say(codeOf(e) === 'PAIRING_EXPIRED' ? 'accountSync.pair.requestGone' : 'accountSync.pair.failed');
  }
}

/** « Refuser »: the request is deleted and nothing else is written. */
export async function declineNow() {
  const id = accountFlow.requestId;
  if (!id) return closeScreen();
  accountFlow.busy = true;
  try {
    await declineRequest(id, pairingDeps());
  } catch (e) {
    console.error('Declining the access request', e);
    say('accountSync.pair.failed');
  }
  forget(id);
  closeScreen();
}

// ---------------------------------------------------------------------------------------------------------------
// This device has no key (items 1 to 4)

/**
 * « Demander l’accès »: the request is sent (no camera, the same on a phone, a tablet and a computer), the 6 digits are shown, and
 * the answer is awaited. Nothing but key files is committed; the diver's data is not touched before the key is held.
 */
export async function askForAccess() {
  open('requestWait');
  accountFlow.busy = true;
  accountFlow.code = '';
  try {
    const kind = currentDeviceKind();
    const request = await requestAccess({ deviceName: t(`accountSync.device.${kind}`), platform: platformOf(kind) }, pairingDeps());
    pairing = request;
    accountFlow.code = request.code;
    accountFlow.expiresAt = request.expiresAt;
    accountFlow.busy = false;
    watcher = setInterval(() => void lookForAnswer(), WATCH_MS);
  } catch (e) {
    console.error('Asking for access', e);
    closeScreen();
    say(codeOf(e) === 'UNREACHABLE' ? 'accountSync.pair.offline' : 'accountSync.pair.failed');
  }
}

/** @type {boolean} */
let looking = false;

/** One look at the server while the request waits. */
async function lookForAnswer() {
  const mine = pairing;
  if (!mine || accountFlow.screen !== 'requestWait' || looking) return;
  looking = true;
  try {
    const answer = await checkAnswer(mine, pairingDeps());
    if (pairing !== mine || accountFlow.screen !== 'requestWait') return;
    if (answer.state === 'waiting') return;
    stopWatching();
    if (answer.state === 'answer') {
      accountFlow.busy = true;
      const { store, box } = accountDataDeps();
      await finishPairing(mine, answer.json, { store, box, ...pairingDeps() });
      accountSync.keyMissing = false;
      accountSync.locked = [];
      await afterUnlocked();
    } else {
      pairing = null;
      accountFlow.endReason = answer.state;
      open('requestEnded');
    }
  } catch (e) {
    // A server that does not answer for a moment is not the end of the request: it is looked at again, until it expires.
    if (codeOf(e) === 'UNREACHABLE') return;
    console.error('Waiting for the approval', e);
    stopWatching();
    pairing = null;
    accountFlow.busy = false;
    accountFlow.endReason = 'failed';
    open('requestEnded');
  } finally {
    looking = false;
  }
}

/** « Annuler » while waiting: the request is deleted (best effort: it expires anyway). */
export function cancelAccessRequest() {
  const mine = pairing;
  closeScreen();
  if (mine) cancelRequest(mine, pairingDeps()).catch((e) => console.warn('Deleting the access request', e));
}

/** « Saisir la clé de secours ». */
export function openRecoveryKeyEntry() {
  open('enter');
}

/** @param {string} input the 26 characters */
export async function enterRecoveryKey(input) {
  accountFlow.busy = true;
  accountFlow.error = '';
  try {
    const file = (await fetchAccountKeys()).recovery;
    if (!file) throw new Error('RECOVERY_KEY_WRONG');
    const account = await recoverAccountKey(input, file);
    await adoptAndReseal(account);
    await afterUnlocked();
  } catch (e) {
    const code = codeOf(e);
    accountFlow.busy = false;
    if (code === 'RECOVERY_KEY_WRONG' || code === 'RECOVERY_KEY_INVALID' || code === 'RECOVERY_FILE_INVALID') accountFlow.error = 'wrong';
    else {
      console.error('Using the recovery key', e);
      say('accountSync.key.failed');
    }
  }
}

/** « Repartir sans les données chiffrées »: a new account key; the sealed files go from the account and from this device. */
export async function startOverNow() {
  accountFlow.busy = true;
  try {
    const { store } = accountDataDeps();
    const plan = await startOver(await listAccountPaths());
    const { box } = accountDataDeps();
    await box.adoptAccountKey(plan.key.key);
    await box.persistAccountKey();
    /** @type {[string, unknown][]} */
    const writes = [];
    for (const path of plan.stripEnc) {
      const json = await store.read(path);
      if (json) {
        const { enc, ...rest } = json;
        writes.push([path, rest]);
      }
    }
    const removes = plan.deletes.filter((p) => !isKeyPath(p));
    if (writes.length || removes.length) await store.trackedBatch({ writes, removes });
    const result = await commitAccountKeyFiles({ writes: [plan.account], deletes: plan.deletes.filter(isKeyPath), message: 'Benthic: start over' });
    if (result.status !== 'synced') throw new Error(result.error ?? result.status);
    await loadProfile();
    accountSync.keyMissing = false;
    closeScreen();
  } catch (e) {
    console.error('Starting over', e);
    accountFlow.busy = false;
    say('accountSync.startOver.failed');
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The recovery key (items 9 and 10)

/** Whether the offer is due: never made, and not postponed within the last week. */
export function recoveryOfferDue() {
  if (accountSync.hasRecovery) return false;
  const later = Number(deviceStore.getItem(RECOVERY_LATER_KEY) ?? 0);
  return !(later && Date.now() - later < RECOVERY_PAUSE_MS);
}

export function offerRecoveryKey() {
  open('offer');
}

export function postponeRecoveryKey() {
  deviceStore.setItem(RECOVERY_LATER_KEY, String(Date.now()));
  closeScreen();
}

export async function makeRecoveryKey() {
  const account = await heldAccountKey();
  if (!account) return closeScreen();
  accountFlow.busy = true;
  try {
    const made = await createRecoveryKey(account);
    const result = await commitAccountKeyFiles({ writes: [made.file], message: 'Benthic: recovery key' });
    if (result.status !== 'synced') throw new Error(result.error ?? result.status);
    accountFlow.recoveryKey = made.recoveryKey;
    open('show');
  } catch (e) {
    console.error('Making the recovery key', e);
    accountFlow.busy = false;
    say('accountSync.key.failed');
  }
}

/** « Copier »: the key in groups of four. @param {string} text */
export async function copyRecoveryKey(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    console.error('Copying the recovery key', e);
  }
}

/** « Je l’ai notée »: the key is not kept anywhere on this device. */
export function doneWithRecoveryKey() {
  closeScreen();
}

// ---------------------------------------------------------------------------------------------------------------
// Joining (item 11), another account, the two-device notice (item 12)

/** @param {string} kind @param {Record<string, any>} item */
function itemLabel(kind, item) {
  const parts = {
    gear: [item.name || [item.brand, item.model].filter(Boolean).join(' ')],
    kit: [item.name],
    maintenance: [item.task],
    certification: [item.title || [item.agency, item.level].filter(Boolean).join(' ')],
  };
  return (/** @type {Record<string, string[]>} */ (parts)[kind] ?? [item.name]).filter(Boolean).join(' ') || t('accountSync.item');
}

/** What joining would do, then the summary. */
export async function openJoin() {
  asked.join = true;
  // The pairing comes first: the join seals and merges with the account key.
  if (accountSync.keyMissing) return;
  accountFlow.busy = true;
  const analysis = await analyseJoin();
  accountFlow.busy = false;
  // Another screen opened meanwhile (a button of the diver): the question is asked again after it.
  if (accountFlow.screen) {
    asked.join = false;
    return;
  }
  if (analysis.state === 'ready') {
    accountFlow.join = {
      recognised: analysis.recognised ?? 0,
      added: analysis.added ?? 0,
      matches: (analysis.ambiguous ?? []).map((m) => ({ id: m.key, thisDevice: itemLabel(m.kind, m.local), account: itemLabel(m.kind, m.remote) })),
    };
    open('join');
  } else if (analysis.state === 'nothing') {
    await forgetLastAccount();
  } else if (analysis.state !== 'DIFFERENT_ACCOUNT') {
    say('accountSync.join.failed');
  }
}

/** @param {{ id: string, same: boolean }[]} answers */
export async function confirmJoin(answers) {
  accountFlow.busy = true;
  const result = await applyJoin(answers.map((a) => ({ key: a.id, choice: a.same ? 'same' : 'two' })));
  if (result.state === 'joined') {
    await loadProfile();
    const confirmed = accountFlow.join.matches.length;
    const parts = [
      result.recognised ? t('accountSync.join.doneRecognised', { n: result.recognised }) : '',
      result.added ? t('accountSync.join.doneAdded', { n: result.added }) : '',
      confirmed ? t('accountSync.join.doneConfirmed', { n: confirmed }) : '',
    ].filter(Boolean);
    const lines = [parts.length ? t('accountSync.join.doneText', { parts: parts.join(', ') }) : t('accountSync.join.doneTextNone'), t('accountSync.join.doneSync')];
    // The confirmation replaces the summary; the recovery key offer, when due, follows it (the host asks again once it is closed).
    open('joined');
    accountFlow.joinedLines = lines;
  } else {
    accountFlow.busy = false;
    say('accountSync.join.failed');
  }
}

/** « Utiliser ce compte »: this device's last sync is forgotten, the join step decides what goes where. */
export async function useThisAccount() {
  closeScreen();
  await forgetLastAccount();
}

export function askDifferentAccount() {
  asked.different = true;
  open('different');
}

/** The name the notice shows for the file two devices changed. @param {string} path */
async function conflictName(path) {
  const { store } = accountDataDeps();
  if (path.startsWith('profile/')) return t('accountSync.itemProfile');
  const json = await store.read(path).catch(() => null);
  return String(json?.name ?? json?.task ?? json?.title ?? '') || t('accountSync.item');
}

/** The notice « modifié sur deux appareils » for the first of the files two devices changed, then the list is cleared. */
export async function announceConflicts() {
  const first = accountSync.conflicts[0];
  if (!first) return;
  const name = await conflictName(first.path);
  dismissAccountConflicts();
  showTwoDeviceNotice(name);
}

// ---------------------------------------------------------------------------------------------------------------
// The flags the profile screens and the account sheet read (lib/locked-data.svelte.js)

/** @param {{ canPair: boolean, locked: boolean }} flags */
export function setLockFlags({ canPair, locked }) {
  accountLock.canPair = canPair;
  accountLock.locked = locked;
}

export function wireLockActions() {
  accountLock.onpair = () => void askForAccess();
  accountLock.onpairnew = () => void openRequests();
  accountLock.onrecoverykey = () => openRecoveryKeyEntry();
}

/** The unlock dialog is asked once per run; the locked card and the account sheet open the actions directly. */
export function unlockDue() {
  return !asked.unlock;
}

/** A new sync run began: the questions the diver closed (the join, another account) may be asked again by its result. */
/** Items sealed under a key nobody holds any more (docs/account-sync.md, « Orphaned items »): asked once per run of the app. */
export const orphansDue = () => !asked.orphans;

export function askOrphans() {
  asked.orphans = true;
  open('orphans');
}

/** « Effacer »: the unreadable items go from this device and from the account; the clear fields of the profile stay. */
export async function eraseOrphansNow() {
  accountFlow.busy = true;
  try {
    await eraseAccountOrphans();
    await loadProfile();
    closeScreen();
  } catch (e) {
    console.error('Erasing the items nobody can open', e);
    accountFlow.busy = false;
    say('accountSync.orphans.failed');
  }
}

export function resetQuestions() {
  asked.join = false;
  asked.different = false;
}

/**
 * Whether a modal that is not the account's own is open (the sync failure sheet, any dialog): a question the sync asks by itself
 * waits for it (components/AccountSyncHost.svelte looks again every second) instead of stacking over it or being lost.
 */
export function modalInTheWay() {
  if (typeof document === 'undefined') return false;
  return !!document.querySelector('.sheet-modal.modal-in, .popup.modal-in, .actions-modal.modal-in, .dialog.modal-in, .bc-md3-dialog');
}

export const joinDue = () => !asked.join;
export const differentDue = () => !asked.different;

export function askUnlock() {
  asked.unlock = true;
  open('unlock');
}
