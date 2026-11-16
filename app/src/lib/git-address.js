// @ts-check
// Small pure helpers of the git form (lib/git-form.svelte.js): how a repository address is shown.

/**
 * "host/owner/name" of an address, as shown on the download screen.
 * @param {string} address
 */
export function repositoryLabel(address) {
  try {
    const u = new URL(address.trim());
    return `${u.host}${u.pathname.replace(/\.git$|\/$/g, '')}`;
  } catch {
    return address.trim();
  }
}

/**
 * "owner/name" of an address, as in the snackbar.
 * @param {string} address
 */
export function repositoryName(address) {
  try {
    return new URL(address.trim()).pathname.replace(/^\/|\.git$|\/$/g, '');
  } catch {
    return address.trim();
  }
}

/**
 * The key of the line that says what the branch list waits for: the repository is not found yet, or it is
 * found and the access is still to be checked (a private repository, a token not typed or refused).
 * @param {string} addressState
 */
export function branchWaitingKey(addressState) {
  return addressState === 'public' || addressState === 'publicEmpty' || addressState === 'private' ? 'gitRepo.branchWaitingAccess' : 'gitRepo.branchWaiting';
}
