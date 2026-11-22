// @ts-check
// The git step of the release edition's first launch has no user name field (task 2026-11-15-218): the token
// goes with a user name taken from the address.

/** Used when the address gives no usable name. */
export const FALLBACK_GIT_USER = 'git';

/**
 * The problem a repository checked by `gitCheck` has for this path: a new logbook needs an empty repository
 * (« Ce dépôt contient déjà un carnet. »), an opened one needs a logbook (« Ce dépôt ne contient pas de carnet
 * Benthic. »). Both are told under the address, with a link to the other path.
 * @param {boolean} create
 * @param {{ empty?: boolean }} found
 * @returns {''|'notEmpty'|'noLogbook'}
 */
export function gitProblem(create, found) {
  if (create && !found.empty) return 'notEmpty';
  if (!create && found.empty) return 'noLogbook';
  return '';
}

/**
 * The same problem, from the error code of `gitConnect` (the repository changed between the check and the
 * connection): NOT_EMPTY, LOG_EXISTS and NO_LOG are told like the check's.
 * @param {boolean} create
 * @param {string} code
 * @returns {''|'notEmpty'|'noLogbook'}
 */
export function gitProblemFromCode(create, code) {
  if (code === 'NO_LOG' || code === 'LOG_EXISTS' || code === 'NOT_EMPTY') return create ? 'notEmpty' : 'noLogbook';
  return '';
}

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
