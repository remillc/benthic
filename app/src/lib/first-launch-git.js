// @ts-check
// The git step of the release edition's first launch has no user name field (task 2026-11-15-218): the token
// goes with a user name taken from the address.

/** Used when the address gives no usable name. */
export const FALLBACK_GIT_USER = 'git';

/**
 * The user name sent with the access token: the first segment of the repository's path
 * (`https://github.com/vous/plongees.git` gives `vous`), else `git`.
 * @param {string} address an https address
 * @param {(name: string) => boolean} valid lib/account-validation.js validGitUsername
 * @returns {string}
 */
export function gitUserName(address, valid) {
  try {
    const first = new URL(address.trim()).pathname.split('/').filter(Boolean)[0] ?? '';
    return valid(first) ? first : FALLBACK_GIT_USER;
  } catch {
    return FALLBACK_GIT_USER;
  }
}
