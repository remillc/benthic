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
import {
  PAIRING_TTL_MS,
  acceptPairing,
  answerPairingRequest,
  createPairing,
  createPairingRequest,
  createRecoveryKey,
  pairingFilePath,
  parsePairingPayload,
  recoverAccountKey,
  startOver,
} from './account-keys.js';
import { isKeyPath } from './account-sync.js';
import { adoptAndReseal as adopt, pairWithCode } from './account-pairing.js';
import { scanPairingCode } from './pair-scan.js';
import { showTwoDeviceNotice } from './two-device-notice.js';
import { accountLock } from './locked-data.svelte.js';
import {
  accountSync,
  analyseJoin,
  applyJoin,
  commitAccountKeyFiles,
  dismissAccountConflicts,
  forgetLastAccount,
  listAccountPaths,
  fetchAccountKeys,
  readAccountKeys,
  syncAccountNow,
} from './account-sync.svelte.js';
import { desktopApp } from './layout.svelte.js';

/** @typedef {'unlock'|'pairOld'|'pairNew'|'confirm'|'paired'|'offer'|'show'|'enter'|'startOver'|'join'|'different'} AccountScreen */

/** The screen open now ('' when none) and what it shows. */
export const accountFlow = $state({
  /** @type {''|AccountScreen} */
  screen: '',
  /** The pairing QR's text. */
  payload: '',
  /** When the pairing code expires, ms since 1970. */
  expiresAt: 0,
  busy: false,
  /** '' or 'wrong' (the recovery key was refused). */
  error: '',
  /** The recovery key just made, shown once. */
  recoveryKey: '',
  /** The device asking to be paired (the paired device's confirmation). */
  deviceName: '',
  /** @type {{ recognised: number, added: number, matches: import('./account-sync-screens.js').AmbiguousMatch[] }} */
  join: { recognised: 0, added: 0, matches: [] },
});

/** Asked once per run of the app; a later manual sync or a button asks again. */
const asked = { unlock: false, join: false, different: false };
/** The recovery key's « Plus tard »: asked again after a week. */
const RECOVERY_LATER_KEY = 'bc.accountRecoveryLater';
const RECOVERY_PAUSE_MS = 7 * 24 * 60 * 60 * 1000;
/** How often a screen that waits for the other device looks at the server. */
const WATCH_MS = 3000;

/** @type {ReturnType<typeof setInterval>|null} */
let watcher = null;
/** The pairing in progress on this device. @type {{ id: string, privateKey?: CryptoKey, payloadText?: string }|null} */
let pairing = null;
/** The code a paired device scanned from a computer. */
let scanned = '';

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
  scanned = '';
  accountFlow.screen = '';
  accountFlow.busy = false;
  accountFlow.error = '';
  accountFlow.recoveryKey = '';
  accountFlow.payload = '';
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

/** After the key arrived: the sealed items are sent sealed with it, and read again. */
async function afterUnlocked() {
  await syncAccountNow();
  await loadProfile();
  open('paired');
}

/** @param {unknown} e */
const codeOf = (e) => String(/** @type {any} */ (e)?.message ?? e);

// ---------------------------------------------------------------------------------------------------------------
// A paired device shows a code (item 7), or reads a computer's (items 7 and 8)

/** « Jumeler un nouvel appareil » (account sheet): the code, valid 10 minutes, and the file it opens. */
export async function showPairOld() {
  const account = await heldAccountKey();
  if (!account) return;
  open('pairOld');
  accountFlow.payload = '';
  accountFlow.busy = true;
  try {
    const made = await createPairing(account);
    const result = await commitAccountKeyFiles({ writes: [made.file], message: 'Benthic: pairing' });
    if (result.status !== 'synced') throw new Error(result.error ?? result.status);
    pairing = { id: made.id };
    accountFlow.payload = made.payload;
    accountFlow.expiresAt = made.expiresAt;
    accountFlow.busy = false;
    // The new device deletes the file once it has the key: its disappearance is the confirmation.
    watcher = setInterval(async () => {
      if (!pairing || accountFlow.screen !== 'pairOld') return stopWatching();
      try {
        await syncAccountNow();
        const keys = await readAccountKeys();
        if (!keys.pairing.some((f) => f.path === pairingFilePath(/** @type {{ id: string }} */ (pairing).id)) && Date.now() < accountFlow.expiresAt) {
          closeScreen();
          say('accountSync.pair.otherPaired');
        }
      } catch (e) {
        console.error('Waiting for the new device', e);
      }
    }, WATCH_MS);
  } catch (e) {
    console.error('Showing the pairing code', e);
    closeScreen();
    say('accountSync.pair.failed');
  }
}

/** Closes the code; the file it opened is deleted at once (best effort: it expires anyway). */
export async function cancelPairOld() {
  const id = pairing?.id;
  closeScreen();
  if (id) commitAccountKeyFiles({ deletes: [pairingFilePath(id)], message: 'Benthic: pairing cancelled' }).catch((e) => console.error('Deleting the pairing file', e));
}

/** « Lire le code d’un ordinateur »: the scanner, then the confirmation. */
export async function scanComputerCode() {
  await cancelPairOld();
  let text;
  try {
    text = await scanPairingCode('computer');
  } catch (e) {
    console.error('Scanning a computer’s code', e);
    say('accountSync.pair.failed');
    return;
  }
  if (text == null) return;
  try {
    if (parsePairingPayload(text).mode !== 'e') throw new Error('PAIRING_PAYLOAD_INVALID');
  } catch {
    say('accountSync.pair.failedRead');
    return;
  }
  scanned = text;
  accountFlow.deviceName = t('accountSync.pair.computerName');
  open('confirm');
}

/** « Jumeler »: only now is anything committed. */
export async function confirmPair() {
  const account = await heldAccountKey();
  if (!account || !scanned) return closeScreen();
  accountFlow.busy = true;
  try {
    const answer = await answerPairingRequest(scanned, account);
    const result = await commitAccountKeyFiles({ writes: [answer.file], message: 'Benthic: pairing' });
    if (result.status !== 'synced') throw new Error(result.error ?? result.status);
    closeScreen();
    say('accountSync.pair.keySent');
  } catch (e) {
    console.error('Answering the pairing request', e);
    closeScreen();
    say('accountSync.pair.failed');
  }
}

// ---------------------------------------------------------------------------------------------------------------
// This device has no key (items 1 to 4)

/** @param {unknown} e */
function pairingFailure(e) {
  const code = codeOf(e);
  say(code === 'PAIRING_EXPIRED' ? 'accountSync.pair.failedExpired' : code === 'PAIRING_WRONG_KEY' || code.startsWith('PAIRING_') ? 'accountSync.pair.failedRead' : 'accountSync.pair.failed');
}

/** « Jumeler avec un autre appareil »: the camera on a phone or tablet, the computer's own code on a desktop. */
export async function pairThisDevice() {
  if (desktopApp) return showPairNew();
  closeScreen();
  let text;
  try {
    text = await scanPairingCode('new-device');
  } catch (e) {
    console.error('Scanning the pairing code', e);
    say('accountSync.pair.failed');
    return;
  }
  // The scanner closed without a code (the diver left, or the app was restarted under it): nothing to say.
  if (text == null) return;
  try {
    accountFlow.busy = true;
    const { store, box } = accountDataDeps();
    await pairWithCode(text, { store, box, fetchKeys: fetchAccountKeys, commitKeyFiles: commitAccountKeyFiles });
    accountSync.keyMissing = false;
    accountSync.locked = [];
    await afterUnlocked();
  } catch (e) {
    console.error('Pairing this device', e);
    accountFlow.busy = false;
    pairingFailure(e);
  }
}

/** A computer: its own code for the phone to read, then the wait for the phone's answer. */
export async function showPairNew() {
  open('pairNew');
  try {
    const request = await createPairingRequest();
    pairing = { id: request.id, privateKey: request.privateKey };
    accountFlow.payload = request.payload;
    accountFlow.expiresAt = Date.now() + PAIRING_TTL_MS;
    watcher = setInterval(async () => {
      if (!pairing?.privateKey || accountFlow.screen !== 'pairNew') return stopWatching();
      const mine = pairing;
      try {
        const found = (await fetchAccountKeys()).pairing.find((f) => f.path === pairingFilePath(mine.id));
        if (!found) return;
        stopWatching();
        const account = await acceptPairing({ id: mine.id, privateKey: mine.privateKey }, found.json);
        await adoptAndReseal(account);
        await commitAccountKeyFiles({ deletes: [pairingFilePath(mine.id)], message: 'Benthic: paired' });
        await afterUnlocked();
      } catch (e) {
        console.error('Waiting for the phone', e);
        stopWatching();
        closeScreen();
        pairingFailure(e);
      }
    }, WATCH_MS);
  } catch (e) {
    console.error('Making the pairing request', e);
    closeScreen();
    say('accountSync.pair.failed');
  }
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
    closeScreen();
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
  accountLock.onpair = () => void pairThisDevice();
  accountLock.onpairnew = () => void showPairOld();
  accountLock.onrecoverykey = () => openRecoveryKeyEntry();
}

/** The unlock dialog is asked once per run; the locked card and the account sheet open the actions directly. */
export function unlockDue() {
  return !asked.unlock;
}

/** A new sync run began: the questions the diver closed (the join, another account) may be asked again by its result. */
export function resetQuestions() {
  asked.join = false;
  asked.different = false;
}

export const joinDue = () => !asked.join;
export const differentDue = () => !asked.different;

export function askUnlock() {
  asked.unlock = true;
  open('unlock');
}
