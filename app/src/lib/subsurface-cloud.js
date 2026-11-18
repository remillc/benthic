// @ts-check
// The release edition (the beta) never opens a logbook on the Subsurface cloud: only a logbook on this
// device, in a git repository of the diver's own, or on the OpenDives server. A Subsurface-cloud
// account left on the device by the alpha is ignored (its files stay where they are, untouched, and the
// alpha reads them again if it is installed back).

/**
 * Whether an account answered by `configureCloud` is a Subsurface-cloud account the given edition must
 * not open.
 * @param {{ available?: boolean, mode?: string }|null|undefined} account
 * @param {boolean} release true in the release edition
 */
export function isIgnoredCloudAccount(account, release) {
  return release && !!account?.available && account.mode !== 'git';
}
