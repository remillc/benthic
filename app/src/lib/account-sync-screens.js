// @ts-check
// The pure rules behind the account sync screens (inbox task 2026-11-23-338, docs/account-sync.md, « Screens »):
// the recovery key as the diver reads and types it, the time left on a pairing code, and the answers of the
// join summary. No engine, no key module: the components get these values as props.

const NBSP = ' ';

/** The base32 alphabet of the recovery key (RFC 4648: A to Z, 2 to 7). */
export const RECOVERY_KEY_ALPHABET = /^[A-Z2-7]+$/;
/** 128 random bits as base32: 26 characters (the last one holds 3 bits). */
export const RECOVERY_KEY_LENGTH = 26;
/** A pairing code lives 10 minutes. */
export const PAIRING_LIFETIME_MS = 10 * 60 * 1000;

/**
 * What the diver typed or pasted, as the 26 characters the key module reads: spaces, dashes and other separators
 * removed, upper case. The letters I, L, O, U and the digits 0, 1, 8, 9 are not base32 and are kept as typed, so
 * `recoveryKeyProblem` can refuse them.
 * @param {string} text
 */
export function normalizeRecoveryKey(text) {
  return String(text).replace(/[\s\-_. ‐-―]/g, '').toUpperCase();
}

/**
 * The key in groups of four, separated by a space: `ABCD EFGH IJKL MNOP QRST UV`. A group is never split by a line break
 * (the groups are drawn as separate words by the screen).
 * @param {string} text
 * @returns {string[]} the groups
 */
export function recoveryKeyGroups(text) {
  const key = normalizeRecoveryKey(text);
  /** @type {string[]} */
  const groups = [];
  for (let i = 0; i < key.length; i += 4) groups.push(key.slice(i, i + 4));
  return groups;
}

/** @param {string} text the key as one text, for the clipboard: groups of four separated by spaces */
export const recoveryKeyText = (text) => recoveryKeyGroups(text).join(' ');

/**
 * Why the key cannot be tried yet, or '' when it can.
 * @param {string} text
 * @returns {''|'empty'|'length'|'characters'}
 */
export function recoveryKeyProblem(text) {
  const key = normalizeRecoveryKey(text);
  if (!key) return 'empty';
  if (!RECOVERY_KEY_ALPHABET.test(key)) return 'characters';
  if (key.length !== RECOVERY_KEY_LENGTH) return 'length';
  return '';
}

/**
 * The time left on a pairing code, « 9 min 42 s » (« 42 s » under a minute), with non-breaking spaces. Rounded up to
 * the second, so the code never shows « 0 s » while it still works.
 * @param {number} remainingMs
 */
export function remainingText(remainingMs) {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const min = Math.floor(seconds / 60);
  const s = seconds % 60;
  return min > 0 ? `${min}${NBSP}min${NBSP}${s}${NBSP}s` : `${s}${NBSP}s`;
}

/**
 * @param {number} expiresAt ms since 1970
 * @param {number} now ms since 1970
 */
export const remainingMs = (expiresAt, now) => Math.max(0, expiresAt - now);

/**
 * @typedef {object} AmbiguousMatch
 * @property {string} id the matcher's id of the pair (stable, used in the answer)
 * @property {string} thisDevice what this device has (« Détendeur Apeks MTX-R »)
 * @property {string} account what the account has
 */

/** @typedef {'same'|'two'} MatchChoice */

/**
 * The answers sent to `account-join.js`: one entry per ambiguous match, `same` true to merge the two pieces.
 * A match with no answer yet takes `fallback`.
 * @param {AmbiguousMatch[]} matches
 * @param {Record<string, MatchChoice|undefined>} choices
 * @param {MatchChoice} [fallback]
 * @returns {{ id: string, same: boolean }[]}
 */
export function joinResolutions(matches, choices, fallback = 'same') {
  return matches.map((m) => ({ id: m.id, same: (choices[m.id] ?? fallback) === 'same' }));
}

/**
 * The three counters of the join summary.
 * @param {{ recognised: number, added: number, matches: AmbiguousMatch[] }} summary
 * @returns {{ id: 'recognised'|'added'|'toConfirm', value: number }[]}
 */
export function joinCounters({ recognised, added, matches }) {
  return [
    { id: 'recognised', value: recognised },
    { id: 'added', value: added },
    { id: 'toConfirm', value: matches.length },
  ];
}

/**
 * Which screen of the account sync is due now, one at a time and in this order: another account, the missing key (the
 * pairing), the join, the recovery key. While the account key is missing the join is never offered: it comes after the key is
 * held (the join seals and merges with it). `due` says which questions were not asked yet in this run.
 * `orphaned` (items sealed under a key nobody holds any more) comes before the recovery key offer.
 * @param {{ status: string, differentAccount: boolean, keyMissing: boolean, joinNeeded: boolean, pullOnly: boolean, orphaned?: string[] }} state
 * @param {{ different: boolean, unlock: boolean, join: boolean, recovery: boolean, orphans?: boolean }} due
 * @returns {'different'|'unlock'|'join'|'orphans'|'recovery'|''}
 */
export function dueScreen(state, due) {
  if (state.differentAccount) return due.different ? 'different' : '';
  if (state.keyMissing) return due.unlock && state.status !== 'error' ? 'unlock' : '';
  if (state.joinNeeded) return due.join ? 'join' : '';
  if (state.status === 'synced' && !state.pullOnly && state.orphaned?.length && due.orphans) return 'orphans';
  if (state.status === 'synced' && !state.pullOnly && due.recovery) return 'recovery';
  return '';
}

/** The 6-digit verification code as the diver compares it: `042 913` (a non-breaking space in the middle). @param {string} code */
export const groupedCode = (code) => (code.length === 6 ? `${code.slice(0, 3)}${NBSP}${code.slice(3)}` : code);
