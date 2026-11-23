// @ts-check
// What the screens of the sealed data (« Mon profil de plongeur ») and the account sheet show while an account's data
// key is missing on this device (inbox task 2026-11-23-338, docs/account-sync.md, « Screens »). Nothing sets these
// flags until the sync engine is wired: they stay off, so nothing in the app changes. The wiring step sets `locked`
// from `MISSING_DATA_KEY`; `onpair` (« Demander l’accès », also the account sheet's row « Jumeler cet appareil » while the data is locked) and `onrecoverykey` are the actions of the
// locked card and of that row.

/**
 * @type {{
 *   locked: boolean,
 *   onpair: () => void,
 *   onrecoverykey: () => void,
 * }}
 */
export const accountLock = $state({
  locked: false,
  onpair: () => {},
  onrecoverykey: () => {},
});
