// @ts-check
// What the screens of the sealed data (« Mon profil de plongeur ») and the account sheet show while an account's data
// key is missing on this device (inbox task 2026-11-23-338, docs/account-sync.md, « Screens »). Nothing sets these
// flags until the sync engine is wired: they stay off, so nothing in the app changes. The wiring step sets `locked`
// from `MISSING_DATA_KEY`; `canPair` for a Benthic+ account whose device holds the key (it shows the account sheet's « Jumeler un
// nouvel appareil » row, which calls `onpairnew`: show the code); `onpair` and `onrecoverykey` are the locked card's two buttons.

/**
 * @type {{
 *   locked: boolean,
 *   canPair: boolean,
 *   onpair: () => void,
 *   onpairnew: () => void,
 *   onrecoverykey: () => void,
 * }}
 */
export const accountLock = $state({
  locked: false,
  canPair: false,
  onpair: () => {},
  onpairnew: () => {},
  onrecoverykey: () => {},
});
